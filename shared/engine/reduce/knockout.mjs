/**
 * @file Knockouts and Prizes: handleKnockout, Tool on-KO effects, KO win settles, promotions, KO
 * Energy moves, damage-counter KOs, Prize entitlement and Prize choices, and the
 * takePrizes/takePrizesByIndex/promote commands. Split out of reduce.mjs (design 073 B, I250);
 * reduce.mjs stays the public entry.
 */

import { findCard, discardCardToPlayerZone } from '../state.mjs';
import { isEnergy, isPokemon } from '../cards.mjs';
import { shuffleInPlace, flipCoin } from '../rng.mjs';
import { prizeFilterMatches, prizeRuleBoxes } from '../rules/damage-parser.mjs';
import { prizesForKO } from '../rules/ko-flow.mjs';
import {
  toolPrizeCountAdjust, attachedToolOnKoEffects, attachedTools, isExCard, isTeraCard,
} from '../rules/tool-combat.mjs';
import { parsePrizeModify } from '../rules/ability-executors.mjs';
import { parseToolCondition, toolConditionMet } from '../rules/tool-conditions.mjs';
import { classifyEnergyEffect } from '../rules/energy-effects.mjs';
import { abilityPrizeModify, abilityPrizeToBench } from '../rules/ability-combat.mjs';
import { inPlayEntries, parseOnKoAbilities, parseOnKoAbilityEffect } from '../rules/ability-triggers.mjs';
import { createPendingChoice, attachToRoot } from '../effects/executor.mjs';
import { clearAttackMarkers } from '../rules/attack-markers.mjs';
import {
  isSpecialEnergyCard, hasOncePerGameSpecialEnergyEffect, parseSpecialEnergyEffects,
} from '../rules/special-energy-parse.mjs';
import {
  resolveSpecialEnergyDiscard, resolveSpecialEnergyKnockout,
} from '../effects/special-energy.mjs';
import { isStadiumLostCity } from '../rules/stadium-effects.mjs';
import { isBasicEnergy } from '../rules/card-classify.mjs';
import { topPokemonCard } from '../rules/evolved-pokemon.mjs';
import { addCondition, clearConditions } from '../rules/special-conditions.mjs';
import {
  activeAttackMarkers, inPlayView, cardEffectiveHp, setGameEnded, isGameConcluded,
  abilitySideContext, tiebreakActive, rootsIn,
} from './shared.mjs';
import { trainerEffectText } from './trainer.mjs';

// Ability On-Knock-Out effects of the victim (Weezing Aftermath, Jellicent Spiteful Spirit, Manaphy
// Final Wish), in the Tool effect shape applyToolOnKoEffects reads. Only damage from an opponent's
// attack counts ("Knocked Out by damage"), not damage counters an attack places.
function abilityOnKoEffects(draft, { victimPlayerId, victim, wasActive, byAttack, byDamage }) {
  if (!byAttack || !byDamage || draft.turn?.player === victimPlayerId) return [];
  const effect = parseOnKoAbilityEffect(inPlayView(draft, victim), abilitySideContext(draft, victimPlayerId));
  if (!effect || (effect.requiresActive && !wasActive)) return [];
  return [{ holder: victim, isVictim: true, ...effect }];
}

// On-Knock-Out Tool effects (design 035 slice 9): return-to-hand, Prize denial,
// Energy moves, opponent mill, KO search and draw-to-N. Runs before the victim's
// discard sweep so Energy still attached can be moved.
function applyToolOnKoEffects(
  draft,
  { victimPlayerId, attackerPlayerId, victim, effects, activeRng, events }
) {
  const victimPlayer = draft.players[victimPlayerId];
  const attacker = draft.players[attackerPlayerId];
  const outcome = { returnToHand: false, discardPrizes: false };
  if (!victimPlayer || !Array.isArray(effects) || effects.length === 0) return outcome;

  const firstBench = (player) =>
    (player?.zones?.bench || []).find((c) => !c.attachedTo) || null;
  const moveCard = (owner, card, fromZone, toZone, toLabel, newHostId = null) => {
    const idx = fromZone.indexOf(card);
    if (idx < 0) return;
    fromZone.splice(idx, 1);
    card.attachedTo = newHostId;
    toZone.push(card);
    events.push({
      type: 'cardMoved',
      instanceId: card.instanceId,
      from: 'inPlay',
      to: toLabel,
      playerId: owner.playerId,
    });
  };

  for (const eff of effects) {
    if (eff.returnSelfToHand) outcome.returnToHand = true;
    if (eff.discardPrizes) outcome.discardPrizes = true;

    const attackerActive = attacker?.zones?.active?.find((c) => !c.attachedTo);
    for (const condition of eff.attackerConditions || []) {
      if (!attackerActive) break;
      addCondition(attackerActive, condition);
      events.push({
        type: 'statusApplied',
        playerId: attackerPlayerId,
        instanceId: attackerActive.instanceId,
        condition,
      });
    }
    if (eff.searchChoice) {
      draft.__koSearches = [...(draft.__koSearches || []), { playerId: victimPlayerId, source: eff.source }];
    }

    if (eff.moveEnergyOnKo) {
      const spec = eff.moveEnergyOnKo;
      const sourceRoot =
        spec.from === 'attacker'
          ? attacker?.zones?.active?.find((c) => !c.attachedTo)
          : victim;
      const srcRef = sourceRoot ? findCard(draft, sourceRoot.instanceId) : null;
      const sourceZone = srcRef?.player?.zones?.[srcRef.zoneId] || [];
      const pool = sourceZone.filter(
        (c) =>
          c.attachedTo === sourceRoot?.instanceId &&
          isEnergy(c) &&
          (!spec.basicOnly || classifyEnergyEffect(c) === 'basic')
      );
      const count = spec.count === 'all' ? pool.length : Math.min(spec.count, pool.length);
      for (const energy of pool.slice(0, count)) {
        if (spec.to === 'hand') {
          moveCard(victimPlayer, energy, sourceZone, victimPlayer.zones.hand, 'hand');
        } else if (spec.to === 'holder') {
          // Exp. Share: the Tool's own Pokémon receives the Energy. A holder that is
          // the victim itself has nothing to move to.
          if (!eff.holder || eff.holder.instanceId === victim.instanceId) continue;
          const holderRef = findCard(draft, eff.holder.instanceId);
          const holderZone = holderRef?.player?.zones?.[holderRef.zoneId];
          if (!Array.isArray(holderZone)) continue;
          moveCard(victimPlayer, energy, sourceZone, holderZone, holderRef.zoneId, eff.holder.instanceId);
        } else if (spec.to === 'bench') {
          const bench = firstBench(victimPlayer);
          if (!bench || bench.instanceId === victim.instanceId) continue;
          const benchRef = findCard(draft, bench.instanceId);
          moveCard(victimPlayer, energy, sourceZone, benchRef.player.zones.bench, 'bench', bench.instanceId);
        } else if (spec.to === 'opponentHand') {
          if (!attacker) continue;
          moveCard(attacker, energy, sourceZone, attacker.zones.hand, 'hand');
        } else if (spec.to === 'opponentBench') {
          const bench = firstBench(attacker);
          if (!bench) continue;
          const benchRef = findCard(draft, bench.instanceId);
          moveCard(attacker, energy, sourceZone, benchRef.player.zones.bench, 'bench', bench.instanceId);
        }
      }
    }

    if (eff.millOpponent && attacker) {
      if (eff.millOpponent.deck > 0) {
        const milled = attacker.zones.deck.splice(
          0,
          Math.min(eff.millOpponent.deck, attacker.zones.deck.length)
        );
        for (const card of milled) discardCardToPlayerZone(attacker, card);
        if (milled.length) {
          events.push({
            type: 'cardsDiscarded',
            playerId: attacker.playerId,
            cards: milled.map((c) => ({ instanceId: c.instanceId, name: c.name })),
          });
        }
      }
      if (eff.millOpponent.handRandom > 0 && activeRng && attacker.zones.hand.length > 0) {
        const idx = Math.floor(activeRng.next() * attacker.zones.hand.length);
        const [card] = attacker.zones.hand.splice(idx, 1);
        discardCardToPlayerZone(attacker, card);
        events.push({
          type: 'cardsDiscarded',
          playerId: attacker.playerId,
          cards: [{ instanceId: card.instanceId, name: card.name }],
        });
      }
    }

    if (eff.searchDeckOnKo > 0) {
      const deck = victimPlayer.zones.deck || [];
      const taken = deck.splice(0, Math.min(eff.searchDeckOnKo, deck.length));
      victimPlayer.zones.hand.push(...taken);
      if (activeRng) shuffleInPlace(activeRng, deck);
      if (taken.length) {
        // A private search: the public event carries the count only (I141).
        events.push({ type: 'cardsLookedAt', playerId: victimPlayerId, count: taken.length, zone: 'deck' });
      }
    }

    if (eff.drawUntil > 0) {
      const hand = victimPlayer.zones.hand;
      const need = Math.max(0, eff.drawUntil - hand.length);
      const drawn = victimPlayer.zones.deck.splice(
        0,
        Math.min(need, victimPlayer.zones.deck.length)
      );
      hand.push(...drawn);
      if (drawn.length) {
        events.push({
          type: 'cardsDrawn',
          count: drawn.length,
          playerId: victimPlayerId,
          cards: drawn.map((c) => ({ instanceId: c.instanceId })),
        });
      }
    }
  }

  return outcome;
}

/**
 * Win condition checks (rulebook 30c 1.3a / p.21 "both players win at the same time").
 * Counts how many ways each player currently wins, then compares: the side with more ways
 * wins outright, and only an equal non-zero count is a genuine tie. A player's ways are
 * taking every remaining Prize and the opponent having no Pokémon in play. Called once per
 * Knock Out, or once per batch when several were marked together (`deferWin`).
 */
export function settleKnockOutWins(draft, { events }) {
  const playerIds = Object.keys(draft.players || {});
  if (playerIds.length !== 2) return;
  const [a, b] = playerIds;
  const stateOf = (pid) => {
    const player = draft.players[pid];
    const prizes = player?.zones?.prizes || [];
    const owed = player?.flags?.prizesOwed || 0;
    const inPlay = [...(player?.zones?.active || []), ...(player?.zones?.bench || [])].filter(
      (c) => !c.attachedTo
    );
    return {
      // An entitlement must exist: a zero-prize board with nothing owed is not a win.
      byPrizes: owed > 0 && prizes.length <= owed,
      wiped: inPlay.length === 0,
    };
  };
  const stateA = stateOf(a);
  const stateB = stateOf(b);
  const ways = {
    [a]: [
      ...(stateA.byPrizes ? ['all prize cards taken'] : []),
      ...(stateB.wiped ? ['no Pokémon in play'] : []),
    ],
    [b]: [
      ...(stateB.byPrizes ? ['all prize cards taken'] : []),
      ...(stateA.wiped ? ['no Pokémon in play'] : []),
    ],
  };
  // Re-settling a game a direct Knock Out already ended this command (I165): keep an unchanged
  // result, but a later KO in the same command can turn a lone win into a tiebreak.
  if (isGameConcluded(draft)) {
    const winner = ways[a].length > ways[b].length ? a : ways[b].length > ways[a].length ? b : null;
    if (winner && draft.winner === winner) return;
    if (!winner && (ways[a].length === 0 || draft.tiebreak)) return;
  }
  if (ways[a].length > ways[b].length) {
    setGameEnded(draft, {
      winner: a,
      reason: stateA.byPrizes ? 'all prize cards taken' : 'no Pokémon in play',
      events,
    });
  } else if (ways[b].length > ways[a].length) {
    setGameEnded(draft, {
      winner: b,
      reason: stateB.byPrizes ? 'all prize cards taken' : 'no Pokémon in play',
      events,
    });
  } else if (ways[a].length > 0) {
    setGameEnded(draft, { simultaneous: [a, b], ways, events });
  }
}

/**
 * Handles Knockout resolution for a Pokemon:
 * - Grants the attacker a prize entitlement, settled by collectPrizeEntitlement
 *   when the command finishes (audit finding B-1: the grant, not a client-supplied
 *   count, is what authorises a prize card changing hands)
 * - Discards victim and its attached cards
 * - Auto-promotes first benched Pokemon to active (if any)
 * - Checks win conditions (deferred to the batch when `deferWin`)
 */
export function handleKnockout(
  draft,
  { victimPlayerId, attackerPlayerId, victim, events, byAttack = false, byDamage = true, activeRng = null, deferWin = false }
) {
  // Discard victim and attached cards from its zone (active or bench)
  const victimActive = draft.players[victimPlayerId]?.zones?.active || [];
  const victimBench = draft.players[victimPlayerId]?.zones?.bench || [];
  const victimPlayer = draft.players[victimPlayerId];
  const wasActive = victimActive.some(
    (c) => c.instanceId === victim.instanceId
  );
  const wasBench = victimBench.some((c) => c.instanceId === victim.instanceId);

  const victimZoneCards = wasActive
    ? victimActive
    : wasBench
      ? victimBench
      : [victim];

  if (victimPlayer && draft.turn?.player !== victimPlayerId) {
    // Typed "only if 1 of your {P} Pokémon was Knocked Out during your opponent's last
    // turn" Trainers (Morty, Diantha, Team Rocket's Archer) need who was Knocked Out.
    const top = topPokemonCard(victimZoneCards, victim) || victim;
    const koVictim = {
      name: top.name || '',
      types: [...(top.types || [])],
      // "Knocked Out by damage from an attack" (Revenge, Orichalcum Fang) excludes Poison/ability KOs.
      byAttackDamage: Boolean(byAttack && byDamage),
    };
    victimPlayer.flags = {
      ...victimPlayer.flags,
      koedOnOppTurn: true,
      koedOnOppTurnVictims: [...(victimPlayer.flags?.koedOnOppTurnVictims || []), koVictim],
    };
  }

  const attacker = draft.players[attackerPlayerId];
  const attackerActive = attacker?.zones?.active?.find((c) => !c.attachedTo);
  // On-KO Tool effects run before the discard sweep so Energy still attached to the
  // victim can be moved (Exp. Share, Energy Pouch, Rescue Scarf's return to hand).
  const koToolEffects = [
    ...(byAttack
      ? attachedToolOnKoEffects(victimPlayer, victim, {
          stadium: draft.stadium,
          isActive: wasActive,
          attacker: attackerActive ? inPlayView(draft, attackerActive) : null,
        })
      : []),
    ...abilityOnKoEffects(draft, { victimPlayerId, victim, wasActive, byAttack, byDamage }),
  ];
  const koToolOutcome = applyToolOnKoEffects(draft, {
    victimPlayerId,
    attackerPlayerId,
    victim,
    effects: koToolEffects,
    activeRng,
    events,
  });

  const victimView = inPlayView(draft, victim);
  const basePrizeCount = prizesForKO(victimView);
  // Legacy Energy: the once-per-game reduction may already be spent.
  const legacyEnergyAttached = victimZoneCards.some(
    (c) =>
      c.attachedTo === victim.instanceId &&
      isSpecialEnergyCard(c) &&
      hasOncePerGameSpecialEnergyEffect(c)
  );
  const legacyUsed = !!victimPlayer?.flags?.legacyPrizeReductionUsed;
  // Gift / Legacy / Splash read "Knocked Out by damage from an attack from your opponent's
  // Pokémon"; Rescue reads "by damage from an attack" (own recoil counts). Poison, Burn,
  // Ability counters and counters an attack places are not attack damage (audit SE12).
  const koByAttackDamage = byAttack && byDamage;
  const koByOpponentAttack = koByAttackDamage && draft.turn?.player !== victimPlayerId;
  let prizeCount = toolPrizeCountAdjust(
    victim,
    victimZoneCards,
    basePrizeCount,
    {
      stadium: draft.stadium,
      skipSpecialEnergy: legacyUsed || !koByOpponentAttack,
      holder: inPlayView(draft, victim),
      flags: {
        prizesRemaining: (victimPlayer?.zones?.prizes || []).length,
        trailingPrizes:
          (victimPlayer?.zones?.prizes || []).length >
          (draft.players[attackerPlayerId]?.zones?.prizes || []).length,
      },
    }
  );
  // Ability prize modifiers on the victim's side (Mega Gengar ex "that player
  // takes 1 fewer Prize card"), read from the whole side so a Benched holder
  // covers an Active victim.
  const attackerCard = (draft.players[attackerPlayerId]?.zones?.active || []).find(
    (c) => !c.attachedTo
  );
  prizeCount = Math.max(
    0,
    prizeCount +
      abilityPrizeModify(inPlayView(draft, victim), {
        sideCards: [...victimActive, ...victimBench],
        attackerIsEx: isExCard(attackerCard),
      })
  );
  if (legacyEnergyAttached && !legacyUsed && koByOpponentAttack) {
    if (!victimPlayer.flags) victimPlayer.flags = {};
    victimPlayer.flags.legacyPrizeReductionUsed = true;
  }

  // Billowing Smoke: the attacker discards the Prizes instead of taking them.
  if (koToolOutcome.discardPrizes) prizeCount = 0;

  // Attacker-side on-KO Prize clause (Beast Bringer): the Tool sits on the attacker,
  // so the victim-side scan above never sees it. The printed clause needs the
  // opponent's Active to be Knocked Out by the holder's own attack (I138).
  const koByHolderAttack =
    byAttack && wasActive && draft.turn?.player === attackerPlayerId;
  if (attackerActive && koByHolderAttack) {
    const attackerZone = attacker.zones.active || [];
    const attackerCtx = {
      holder: inPlayView(draft, attackerActive),
      defender: inPlayView(draft, victim),
      zoneCards: attackerZone,
      flags: { prizesRemaining: (attacker.zones.prizes || []).length },
    };
    for (const tool of attachedTools(attackerActive, attackerZone)) {
      const { delta, side } = parsePrizeModify(tool);
      if (side !== 'attacker') continue;
      // Sky Seal Stone's clause belongs to its Star Order VSTAR Power (I137).
      if (/vstar power/i.test(trainerEffectText(tool))) continue;
      if (!toolConditionMet(parseToolCondition(tool), attackerCtx)) continue;
      prizeCount = Math.max(0, prizeCount + delta);
    }
  }

  if (attacker?.flags?.briarActive) {
    const victimIsEx = isExCard(victim);
    if (victimIsEx && attackerActive && isTeraCard(attackerActive)) {
      prizeCount += 1;
    }
  }

  // Ribombee Plentiful Pollen: a `prizeBonus` marker on the victim pays its printed count
  // when the Knock Out happens inside the marker's next-turn window (design 036 A3). Like
  // every other marker read, only while the victim is still in its owner's Active Spot.
  const markerBonus = activeAttackMarkers(draft, victimPlayerId, victim)
    .filter((marker) => marker.kind === 'prizeBonus')
    .filter((marker) => prizeFilterMatches(marker.filter, prizeRuleBoxes(victimView)))
    .reduce((sum, marker) => sum + (marker.count || 0), 0);
  prizeCount += markerBonus;

  if (attacker) {
    if (!attacker.flags) attacker.flags = {};
    attacker.flags.prizesOwed = (attacker.flags.prizesOwed || 0) + prizeCount;
  }

  let targetZone = null;
  if (wasActive) {
    targetZone = victimActive;
  } else if (wasBench) {
    targetZone = victimBench;
  } else {
    const ref = findCard(draft, victim.instanceId);
    if (
      ref?.playerId === victimPlayerId &&
      draft.players[victimPlayerId]?.zones?.[ref.zoneId]
    ) {
      targetZone = draft.players[victimPlayerId].zones[ref.zoneId];
    }
  }

  // Lost City: the Knocked Out Pokémon itself is put in the Lost Zone instead
  // of the discard pile — attached cards are still discarded (card text).
  const lostCity = isStadiumLostCity(draft.stadium?.card || draft.stadium);
  const attackLostZone = draft.__attackLostZoneKnockouts === victimPlayerId;

  // Ability energy-move-on-KO: record the victim's Energy an Ability may move
  // before the stack below is discarded (target chosen/executed at the tail).
  captureOnKoEnergyMoves(draft, { victimPlayerId, victim, events });

  // Special-energy on-knockout triggers (Splash/Rescue return the Pokémon to
  // hand; Gift draws until 7). Attached cards still go to the discard pile.
  const koZoneRef = findCard(draft, victim.instanceId);
  const koSpecial = resolveSpecialEnergyKnockout(draft, {
    byAttackDamage: koByAttackDamage,
    byOpponentAttack: koByOpponentAttack,
    host: victim,
    hostTop: inPlayView(draft, victim),
    hostPlayerId: victimPlayerId,
    hostZoneId: koZoneRef?.zoneId || (wasActive ? 'active' : 'bench'),
  });

  if (targetZone) {
    for (let i = targetZone.length - 1; i >= 0; i--) {
      const c = targetZone[i];
      if (
        c.instanceId === victim.instanceId ||
        c.attachedTo === victim.instanceId
      ) {
        targetZone.splice(i, 1);
        c.damage = 0;
        clearConditions(c);
        clearAttackMarkers(c);
        c.attachedTo = null;
        if (attackLostZone) {
          if (!Array.isArray(victimPlayer.zones.lostZone)) victimPlayer.zones.lostZone = [];
          victimPlayer.zones.lostZone.push(c);
        } else if (lostCity && c.instanceId === victim.instanceId) {
          if (!Array.isArray(victimPlayer.zones.lostZone)) {
            victimPlayer.zones.lostZone = [];
          }
          victimPlayer.zones.lostZone.push(c);
        } else if (
          (koSpecial.returnToHand || koToolOutcome.returnToHand) &&
          c.instanceId === victim.instanceId
        ) {
          victimPlayer.zones.hand.push(c);
          events.push({
            type: 'cardMoved',
            instanceId: c.instanceId,
            from: koZoneRef?.zoneId || 'active',
            to: 'hand',
            playerId: victimPlayerId,
          });
        } else if (
          c.instanceId !== victim.instanceId &&
          isSpecialEnergyCard(c) &&
          resolveSpecialEnergyDiscard(draft, {
            energy: c,
            host: victim,
            hostTop: inPlayView(draft, victim),
            hostPlayerId: victimPlayerId,
            hostZoneId: koZoneRef?.zoneId || 'active',
            events,
          }) === 'hand'
        ) {
          // Recycle Energy attached to a KO'd Pokémon still returns to hand.
          victimPlayer.zones.hand.push(c);
          events.push({
            type: 'cardMoved',
            instanceId: c.instanceId,
            from: koZoneRef?.zoneId || 'active',
            to: 'hand',
            playerId: victimPlayerId,
          });
        } else {
          // Prism Star cards go to the Lost Zone instead of discard (App. 17).
          discardCardToPlayerZone(victimPlayer, c);
        }
      }
    }
  }

  if (koSpecial.drawUntil > 0) {
    const hand = victimPlayer.zones.hand;
    const need = Math.max(0, koSpecial.drawUntil - hand.length);
    if (need > 0) {
      const drawn = victimPlayer.zones.deck.splice(0, Math.min(need, victimPlayer.zones.deck.length));
      hand.push(...drawn);
      if (drawn.length) {
        events.push({
          type: 'cardsDrawn',
          count: drawn.length,
          playerId: victimPlayerId,
          cards: drawn.map((c) => c.instanceId),
        });
      }
    }
  }

  events.push({
    type: 'pokemonKnockedOut',
    instanceId: victim.instanceId,
    playerId: victimPlayerId,
    attackerPlayerId,
    prizeCount,
    ruleBoxes: prizeRuleBoxes(victimView),
  });

  // Promotion of a new Active is NOT done here. `settlePromotionChoices` runs at the
  // end of every command: a single Benched Pokémon is promoted automatically, while 2+
  // raise a `PendingChoice` so the KO'd player clicks which one promotes (server
  // authority parity with the legacy mat picker, design 017 / PR #178). Deferring it to
  // the command tail keeps the promotion from being overwritten by the attack's own
  // search/snipe choice, which also uses `state.pendingChoice`.

  // A batch of Knock Outs (the sweep below) defers the win check so one evaluation
  // sees every KO of the batch; a lone Knock Out settles here.
  if (!deferWin) settleKnockOutWins(draft, { events });

  // A Knockout of the Active leaves the Active Spot empty; `settlePromotionChoices`
  // promotes at the command tail (auto for one Benched Pokémon, mat-pick choice for 2+).
  // Marked here rather than inferred from an empty Active later, so unrelated commands
  // that merely see an empty Active never trigger a promotion.
  if (wasActive && !isGameConcluded(draft) && victimPlayer) {
    const benchRoots = victimBench.filter(
      (c) => !c.attachedTo && isPokemon(c)
    );
    if (benchRoots.length > 0) victimPlayer.promotionPending = true;
  }
}

/**
 * Moves one Benched Pokémon (and every card attached to it) into the empty Active Spot
 * and emits `pokemonPromoted`. Shared by the direct `promote` command, the promotion
 * PendingChoice resume, and the automatic single-bench promotion below. Returns false
 * (emitting nothing) when the id is not a face-up Benched Pokémon root.
 */
export function promoteBenchToActive(draft, { playerId, instanceId, events }) {
  const player = draft.players?.[playerId];
  const bench = player?.zones?.bench;
  const active = player?.zones?.active;
  if (!Array.isArray(bench) || !Array.isArray(active)) return false;
  const isRoot = bench.some(
    (c) => c.instanceId === instanceId && !c.attachedTo
  );
  if (!isRoot) return false;

  for (let i = bench.length - 1; i >= 0; i--) {
    const c = bench[i];
    if (c.instanceId === instanceId || c.attachedTo === instanceId) {
      bench.splice(i, 1);
      active.push(c);
    }
  }
  const promoted = active.find((c) => c.instanceId === instanceId);
  if (promoted) promoted.movedToActiveTurn = Math.max(1, Number(draft.turn?.number) || 1);
  events.push({ type: 'pokemonPromoted', instanceId, playerId });
  return true;
}

/**
 * Fills an Active Spot left empty by a Knockout at the end of a command. A single
 * Benched Pokémon promotes automatically; 2+ raise a PendingChoice so the KO'd player
 * chooses (the mat picker renders it, design 017 / D19). `handleKnockout` marks the
 * KO'd player with `promotionPending`, so this never fires for the many test/edge states
 * that merely have an empty Active with a populated Bench. Deferred to the command tail
 * so it never fights an attack's search/snipe choice for `state.pendingChoice`, and so
 * the turn has already advanced before the choice blocks all further commands.
 */
export function settlePromotionChoices(draft, { events }) {
  if (isGameConcluded(draft)) return;
  if (draft.pendingChoice) return;

  for (const playerId of Object.keys(draft.players || {})) {
    const player = draft.players[playerId];
    if (!player?.promotionPending) continue;

    const active = (player.zones?.active || []).filter((c) => !c.attachedTo);
    const bench = (player.zones?.bench || []).filter(
      (c) => !c.attachedTo && isPokemon(c)
    );
    delete player.promotionPending;

    // A promotion is only ever expected with an empty Active and a legal candidate;
    // if either no longer holds (the game moved the card itself), drop the marker.
    if (active.length > 0 || bench.length === 0) continue;

    if (bench.length === 1) {
      promoteBenchToActive(draft, {
        playerId,
        instanceId: bench[0].instanceId,
        events,
      });
      continue;
    }

    draft.pendingChoice = createPendingChoice({
      player: playerId,
      source: 'promote',
      prompt:
        'Your Active Pokémon was Knocked Out — choose a Benched Pokémon to promote',
      options: bench,
      min: 1,
      max: 1,
      cancellable: false,
      resumeToken: { effectType: 'promote', initiatorPlayerId: playerId },
    });
    events.push({ type: 'promotionChoiceRequested', playerId });
    return;
  }
}

/**
 * Stamps `healedTurn` on every in-play Pokémon whose damage went down during this command, for
 * "If this Pokémon was healed during this turn" (Altaria-EX Powerful Gain). Diffing the damage
 * covers every heal source (Potion, abilities, attacks, Stadiums) without hooking each one.
 */
export function stampHealedPokemon(prev, next) {
  const turnNumber = prev.turn?.number;
  if (turnNumber == null) return;
  for (const playerId of Object.keys(next.players || {})) {
    const zones = next.players[playerId]?.zones || {};
    for (const card of [...(zones.active || []), ...(zones.bench || [])]) {
      if (card.attachedTo || !isPokemon(card)) continue;
      // Attack effects that move damage counters off a Pokémon (Reaper Pulse, Fury Strikes swap,
      // "move all damage counters …") flag themselves so the drop is never read as a heal.
      const counterMoveOnly = card.__counterMoveOnly;
      delete card.__counterMoveOnly;
      if (counterMoveOnly) continue;
      const before = findCard(prev, card.instanceId)?.card;
      if (before && (card.damage || 0) < (before.damage || 0)) card.healedTurn = turnNumber;
    }
  }
}

/**
 * Stamps `movedToActiveTurn` on every card that entered a player's Active Spot
 * during this command, and clears it from every card that left (design 034
 * slice 4b on-promotion window). Diffing the pre/post Active zones here covers
 * every bench→active site — manual move, KO promotion, Switch/Boss's Orders
 * attack and trainer steps — without threading a stamp through each effect
 * module. The whole stack (root plus attached Evolutions/Tools) is stamped so
 * the activation gate reads the stamp off whichever card the client addresses.
 */
export function stampActivePromotions(prev, next) {
  const turnNumber = next.turn?.number;
  if (turnNumber == null) return;
  for (const playerId of Object.keys(next.players || {})) {
    const prevActive = prev.players?.[playerId]?.zones?.active || [];
    const nextActive = next.players?.[playerId]?.zones?.active || [];
    const prevIds = new Set(prevActive.map((c) => c.instanceId));
    const nextIds = new Set(nextActive.map((c) => c.instanceId));
    for (const card of nextActive) {
      if (!prevIds.has(card.instanceId)) card.movedToActiveTurn = turnNumber;
    }
    for (const card of prevActive) {
      if (nextIds.has(card.instanceId)) continue;
      const moved = findCard(next, card.instanceId)?.card;
      if (moved) delete moved.movedToActiveTurn;
    }
  }
}

/**
 * Energy-move-on-KO abilities (Miraidon Photon Cord, Raichu Electrical Grounding,
 * Veluza Fillet Memento; design 034 slice 4b). The victim's Energy is discarded
 * with the rest of its stack, so this records which cards an Ability may pull
 * back out of the discard once a target is known; `settleKoEnergyMoves` runs at
 * the command tail. Obligations live on the draft (not player flags) so
 * `advanceTurn`'s wholesale flag rebuild cannot drop them, and they ride the
 * `pendingChoice` resume token when a target must be chosen.
 */
function captureOnKoEnergyMoves(draft, { victimPlayerId, victim, events }) {
  const player = draft.players?.[victimPlayerId];
  if (!player) return;
  const entries = inPlayEntries(draft).filter(
    (e) => e.playerId === victimPlayerId
  );
  const abilities = parseOnKoAbilities(
    entries,
    abilitySideContext(draft, victimPlayerId)
  );
  const zoneCards = [
    ...(player.zones?.active || []),
    ...(player.zones?.bench || []),
  ];
  const obligations = [];
  for (const ab of abilities) {
    // "If this Pokémon … is Knocked Out" only fires for the victim itself;
    // "move … to this Pokémon" can't target a holder that just left play.
    if (ab.selfSource) {
      if (ab.holder !== victim) continue;
    } else if (ab.holder === victim) {
      continue;
    }
    let energy = zoneCards.filter(
      (c) => c.attachedTo === victim.instanceId && isEnergy(c)
    );
    if (ab.basic) energy = energy.filter((c) => isBasicEnergy(c));
    if (ab.energyType) {
      energy = energy.filter((c) => energyMatchesType(c, ab.energyType));
    }
    if (energy.length === 0) continue;
    obligations.push({
      playerId: victimPlayerId,
      holderInstanceId: ab.holder.instanceId,
      targetKind: ab.targetKind,
      energyIds: energy.map((c) => c.instanceId),
      upTo: ab.upTo || 1,
      source: ab.source,
    });
    events.push({
      type: 'koEnergyMoveRequested',
      playerId: victimPlayerId,
      source: ab.source,
      holderInstanceId: ab.holder.instanceId,
    });
  }
  if (obligations.length > 0) {
    draft.__koEnergyMoves = [...(draft.__koEnergyMoves || []), ...obligations];
  }
}

function energyMatchesType(card, typeName) {
  const want = String(typeName || '').toLowerCase();
  const types = [card.energyType, ...(Array.isArray(card.types) ? card.types : [])]
    .filter(Boolean)
    .map((t) => String(t).toLowerCase());
  if (types.some((t) => t === want || (want === 'darkness' && t === 'dark'))) {
    return true;
  }
  // Basic Energy rows sometimes carry no `types`; the printed name is then the
  // only signal ("Water Energy").
  return (
    typeof card.name === 'string' &&
    new RegExp(`\\b${want}\\b`, 'i').test(card.name)
  );
}

export function koEnergyTargets(player, obligation) {
  const bench = (player.zones?.bench || []).filter(
    (c) => !c.attachedTo && isPokemon(c)
  );
  if (obligation.targetKind === 'holder') {
    const holder = [
      ...(player.zones?.active || []),
      ...bench,
    ].find(
      (c) => !c.attachedTo && c.instanceId === obligation.holderInstanceId
    );
    return holder ? [holder] : [];
  }
  return bench.filter((c) => c.instanceId !== obligation.holderInstanceId);
}

export function moveKoEnergy(player, target, obligation, events) {
  const discard = player.zones?.discard || [];
  let moved = 0;
  for (const id of obligation.energyIds) {
    if (moved >= obligation.upTo) break;
    const card = discard.find((c) => c.instanceId === id);
    if (!card) continue;
    attachToRoot(player, card, target, events);
    moved += 1;
  }
  return moved;
}

export function settleKoEnergyMoves(draft, { events }) {
  if (draft.pendingChoice) return;
  const pending = draft.__koEnergyMoves;
  if (!Array.isArray(pending) || pending.length === 0) {
    delete draft.__koEnergyMoves;
    return;
  }
  const remaining = [...pending];
  while (remaining.length > 0) {
    const obligation = remaining[0];
    const player = draft.players?.[obligation.playerId];
    const energyLeft = (player?.zones?.discard || []).some((c) =>
      obligation.energyIds.includes(c.instanceId)
    );
    if (!player || !energyLeft) {
      remaining.shift();
      continue;
    }
    const targets = koEnergyTargets(player, obligation);
    if (targets.length === 0) {
      remaining.shift();
      continue;
    }
    if (targets.length > 1) {
      delete draft.__koEnergyMoves;
      draft.pendingChoice = createPendingChoice({
        player: obligation.playerId,
        source: obligation.source,
        prompt: `${obligation.source}: choose a Benched Pokémon to move the Energy to`,
        options: targets,
        min: 1,
        max: 1,
        cancellable: false,
        stateVersion: draft.stateVersion,
        resumeToken: {
          effectType: 'koEnergy',
          initiatorPlayerId: obligation.playerId,
          obligations: remaining,
        },
      });
      return;
    }
    moveKoEnergy(player, targets[0], obligation, events);
    remaining.shift();
  }
  delete draft.__koEnergyMoves;
}

export const KO_SEARCH_EFFECT = 'koSearch';

/**
 * Manaphy Final Wish (Plasma Storm 34): "search your deck for a card and put it into your hand.
 * Shuffle your deck afterward." The owner picks the card (a pendingChoice, as Call Energy does).
 * Obligations queue on the draft and settle at the command tail, like the Energy moves above. A
 * Knock Out by an attack settles them before the turn ends (`endTurn`: the attacker whose turn the
 * choice holds open; resolveChoiceCommand ends that turn once the last search is made).
 */
export function settleKoSearches(draft, { events, endTurn = null }) {
  if (draft.pendingChoice) return;
  const pending = draft.__koSearches;
  delete draft.__koSearches;
  if (!Array.isArray(pending)) return;
  // An obligation whose owner has no deck left has nothing to search and is dropped.
  const readyAt = pending.findIndex((o) => (draft.players?.[o.playerId]?.zones?.deck || []).length > 0);
  if (readyAt < 0) return;
  const next = pending[readyAt];
  const rest = pending.slice(readyAt + 1);
  const deck = draft.players[next.playerId].zones.deck;
  draft.pendingChoice = createPendingChoice({
    player: next.playerId,
    source: next.source,
    prompt: `${next.source}: choose a card from your deck to put into your hand`,
    options: [...deck],
    min: 1,
    max: 1,
    cancellable: false,
    stateVersion: draft.stateVersion,
    resumeToken: { effectType: KO_SEARCH_EFFECT, initiatorPlayerId: next.playerId, obligations: rest, endTurn },
  });
}

export function resumeKoSearch(draft, { token, selection, activeRng, events }) {
  draft.pendingChoice = null;
  const player = draft.players?.[token.initiatorPlayerId];
  const deck = player?.zones?.deck || [];
  const pickedId = Number((selection || [])[0]);
  const card = deck.find((c) => c.instanceId === pickedId);
  if (card) {
    deck.splice(deck.indexOf(card), 1);
    player.zones.hand.push(card);
    events.push({ type: 'cardMoved', instanceId: card.instanceId, from: 'deck', to: 'hand', playerId: token.initiatorPlayerId });
  }
  if (activeRng) shuffleInPlace(activeRng, deck);
  events.push({ type: 'deckShuffled', playerId: token.initiatorPlayerId });
  draft.__koSearches = token.obligations || [];
  settleKoSearches(draft, { events, endTurn: token.endTurn || null });
}

/**
 * Collects a player's outstanding prize entitlement (flags.prizesOwed, granted by
 * handleKnockout) into their hand, so a Knockout can never leave prizes stranded.
 * takePrizes is the only other consumer of the entitlement, and it can only redeem
 * what handleKnockout granted — never prizes the game did not award. Win conditions
 * are not evaluated here; handleKnockout owns that check.
 */
function collectPrizeEntitlement(draft, { playerId, events }) {
  const player = draft.players?.[playerId];
  const owed = player?.flags?.prizesOwed || 0;
  if (owed <= 0) return;

  const prizes = player.zones.prizes;
  const actualCount = Math.min(owed, prizes.length);
  const taken = prizes.splice(0, actualCount);
  // A face-up Prize (Blaster-GX) stops being face up once it leaves the Prize zone.
  for (const card of taken) delete card.revealed;
  player.zones.hand.push(...taken);
  // Drop the key rather than leaving a zeroed one behind, so a fully settled state
  // is byte-identical to one that never saw a Knockout (views and the state hash
  // both carry player.flags verbatim).
  if (owed - actualCount > 0) {
    player.flags.prizesOwed = owed - actualCount;
  } else {
    delete player.flags.prizesOwed;
  }

  events.push({
    type: 'prizesTaken',
    playerId,
    count: actualCount,
    cards: taken.map((c) => ({ instanceId: c.instanceId })),
  });
  if (prizes.length > 0) {
    offerPrizeToBench(draft, { playerId, taken });
    offerPrizeAttach(draft, { playerId, taken });
  }
}

function consumePrizeEntitlement(player, count) {
  if (!player.flags?.prizesOwed) return;
  const remainingOwed = Math.max(0, player.flags.prizesOwed - count);
  if (remainingOwed > 0) player.flags.prizesOwed = remainingOwed;
  else delete player.flags.prizesOwed;
}

export const PRIZE_CHOICE_EFFECT = 'prizes';

/**
 * Settles prize entitlements once a command has finished. While the game is still
 * running, the first player owed prizes gets a pendingChoice over their face-down prize
 * cards (the whole game waits on it, like TCG Live); a second owed player gets theirs
 * after the first resolves. Once the game has ended nobody is left to wait for, so
 * everything owed is collected directly.
 */
export function settlePrizeEntitlements(draft, { events }) {
  const owedPlayerIds = Object.keys(draft.players || {}).filter(
    (pid) => (draft.players[pid].flags?.prizesOwed || 0) > 0
  );
  if (owedPlayerIds.length === 0) return;

  // The tiebreaker is a fresh race; the original match's entitlements are void.
  if (draft.turn?.phase === 'tiebreak') return;

  if (draft.turn?.phase === 'ended') {
    for (const pid of owedPlayerIds)
      collectPrizeEntitlement(draft, { playerId: pid, events });
    return;
  }
  if (draft.pendingChoice) return;

  const playerId = owedPlayerIds[0];
  const player = draft.players[playerId];
  const prizes = player.zones.prizes || [];
  const count = Math.min(player.flags.prizesOwed, prizes.length);
  if (count === prizes.length) {
    // Every remaining prize is owed: there is nothing to choose between.
    collectPrizeEntitlement(draft, { playerId, events });
    // A grant can exceed the Prize cards left (extra-Prize clauses, "take N Prize cards");
    // the surplus has nothing left to redeem, and keeping it would spin the recursion on an
    // emptied zone. Collecting every remaining prize also ends the game, like the picker.
    if (player.flags?.prizesOwed) delete player.flags.prizesOwed;
    if (player.zones.prizes.length === 0) {
      setGameEnded(draft, {
        winner: playerId,
        reason: 'all prize cards taken',
        events,
      });
    }
    settlePrizeEntitlements(draft, { events });
    return;
  }

  draft.pendingChoice = createPendingChoice({
    choiceId: `choice_${playerId}_prizes_${(draft.stateVersion || 0) + 1}`,
    player: playerId,
    prompt: count === 1 ? 'Choose a Prize card' : `Choose ${count} Prize cards`,
    source: 'Prize cards',
    // Identity only: prizes are face down, so the chooser never sees names or art.
    options: prizes.map((card) => ({ instanceId: card.instanceId })),
    min: count,
    max: count,
    stateVersion: draft.stateVersion || 0,
    resumeToken: {
      effectType: PRIZE_CHOICE_EFFECT,
      initiatorPlayerId: playerId,
    },
  });
  events.push({ type: 'prizeChoiceRequested', playerId, count });
}

/**
 * Resolves lethal damage placed by `damageCounters` (trainer steps and abilities
 * such as Mega Greninja ex's Mortal Shuriken). The counter handler in
 * effects/trainer-steps.mjs can't call handleKnockout (reduce.mjs imports it —
 * importing back would be circular), so it emits `damageCountersPlaced` and the
 * reducer sweeps them here. Mirrors the counter KO check in
 * applyFlatDamageToTarget, and runs after the whole effect so multi-step
 * placement has settled.
 */
export function resolveDamageCounterKnockouts(draft, { events }) {
  const placed = events.filter(
    (e) => e.type === 'damageCountersPlaced' || e.type === 'knockOutMarked'
  );
  if (placed.length === 0) return;

  const koed = new Set();
  let knockedOut = false;
  for (const e of placed) {
    if (koed.has(e.instanceId)) continue;
    const ref = findCard(draft, e.instanceId);
    if (!ref || (ref.zoneId !== 'active' && ref.zoneId !== 'bench')) continue;
    const victim = ref.card;
    const koHp = cardEffectiveHp(draft, victim, ref.playerId);
    // "… is Knocked Out." (attack-steps atkKnockOut) knocks out regardless of HP.
    if (e.type === 'knockOutMarked' || (koHp > 0 && (victim.damage || 0) >= koHp)) {
      koed.add(e.instanceId);
      knockedOut = true;
      handleKnockout(draft, {
        victimPlayerId: ref.playerId,
        // A marker without an explicit beneficiary (self-inflicted damage)
        // awards the KO to the victim's opponent, so prizes are never skipped.
        attackerPlayerId:
          e.attackerPlayerId ||
          Object.keys(draft.players || {}).find((id) => id !== ref.playerId),
        victim,
        events,
        // Both Active Pokémon can be Knocked Out at once (Destined Fight): the win check
        // runs once for the whole batch so a two-KO tiebreak is not overwritten by the
        // second KO's lone comparison.
        deferWin: true,
      });
    }
  }
  if (knockedOut) settleKnockOutWins(draft, { events });

  // Internal marker events are not part of the client-facing stream.
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === 'damageCountersPlaced' || events[i].type === 'knockOutMarked') {
      events.splice(i, 1);
    }
  }
}

export function resolvePrizeChoice(draft, { playerId, selection, events }) {
  const player = draft.players[playerId];
  const prizes = player.zones.prizes;
  const chosenIds = new Set(selection);
  const taken = prizes.filter((card) => chosenIds.has(card.instanceId));
  player.zones.prizes = prizes.filter(
    (card) => !chosenIds.has(card.instanceId)
  );
  for (const card of taken) delete card.revealed;
  player.zones.hand.push(...taken);
  consumePrizeEntitlement(player, taken.length);
  draft.pendingChoice = null;

  events.push({
    type: 'prizesTaken',
    playerId,
    count: taken.length,
    cards: taken.map((c) => ({ instanceId: c.instanceId })),
  });

  if (player.zones.prizes.length === 0) {
    setGameEnded(draft, {
      winner: playerId,
      reason: 'all prize cards taken',
      events,
    });
    return;
  }
  offerPrizeToBench(draft, { playerId, taken });
  offerPrizeAttach(draft, { playerId, taken });
}

export const PRIZE_BENCH_EFFECT = 'prizeBench';

/**
 * Jirachi Prism Star / Chansey Lucky Bonus (design 034 slice 6): a Prize just taken during
 * its owner's turn may go onto the Bench instead of the hand. Raises a yes/no choice for the
 * first such card; `resumePrizeToBench` applies it.
 */
function offerPrizeToBench(draft, { playerId, taken }) {
  if (draft.pendingChoice || draft.turn?.player !== playerId || isGameConcluded(draft)) return;
  const player = draft.players[playerId];
  if (rootsIn(player.zones.bench).length >= 5) return;
  const card = taken.find(
    (c) => player.zones.hand.includes(c) && isPokemon(c) && abilityPrizeToBench(c)
  );
  if (!card) return;
  draft.pendingChoice = createPendingChoice({
    player: playerId,
    source: card.name || 'Ability',
    prompt: `${card.name}: put it onto your Bench instead of into your hand?`,
    options: [
      { instanceId: 1, name: 'Put it onto your Bench', type: 'option' },
      { instanceId: 2, name: 'Keep it in your hand', type: 'option' },
    ],
    min: 1,
    max: 1,
    resumeToken: { effectType: PRIZE_BENCH_EFFECT, initiatorPlayerId: playerId, cardId: card.instanceId },
  });
}

export const PRIZE_ATTACH_EFFECT = 'prizeAttach';

// Treasure Energy (I172): "If you took this card as a face-down Prize card during your turn,
// before you put it into your hand, you may attach this card to 1 of your Pokémon."
function offerPrizeAttach(draft, { playerId, taken }) {
  if (draft.pendingChoice || draft.turn?.player !== playerId || isGameConcluded(draft)) return;
  const player = draft.players[playerId];
  const card = taken.find(
    (c) =>
      player.zones.hand.includes(c) &&
      parseSpecialEnergyEffects(c)?.steps.some((step) => step.type === 'attachFromPrize')
  );
  const hosts = [...rootsIn(player.zones.active), ...rootsIn(player.zones.bench)];
  if (!card || hosts.length === 0) return;
  draft.pendingChoice = createPendingChoice({
    player: playerId,
    source: card.name || 'Energy',
    prompt: `${card.name}: attach it to 1 of your Pokémon? (choose none to keep it in your hand)`,
    options: hosts,
    min: 0,
    max: 1,
    resumeToken: { effectType: PRIZE_ATTACH_EFFECT, initiatorPlayerId: playerId, cardId: card.instanceId },
  });
}

export function resumePrizeAttach(draft, { token, selection, events }) {
  draft.pendingChoice = null;
  const player = draft.players[token.initiatorPlayerId];
  const card = player?.zones?.hand?.find((c) => c.instanceId === token.cardId);
  const target = findCard(draft, Number((selection || [])[0]));
  if (!card || !target || target.playerId !== token.initiatorPlayerId) return;
  if (!['active', 'bench'].includes(target.zoneId) || target.card.attachedTo) return;
  player.zones.hand.splice(player.zones.hand.indexOf(card), 1);
  card.attachedTo = target.card.instanceId;
  player.zones[target.zoneId].push(card);
  events.push({
    type: 'cardAttached',
    instanceId: card.instanceId,
    targetInstanceId: target.card.instanceId,
    playerId: token.initiatorPlayerId,
  });
}

export function resumePrizeToBench(draft, { token, selection, activeRng, events }) {
  draft.pendingChoice = null;
  if (Number((selection || [])[0]) !== 1) return;
  const player = draft.players[token.initiatorPlayerId];
  const card = player?.zones?.hand?.find((c) => c.instanceId === token.cardId);
  if (!card || rootsIn(player.zones.bench).length >= 5) return;
  player.zones.hand.splice(player.zones.hand.indexOf(card), 1);
  card.enteredPlayTurn = draft.turn?.number ?? null;
  player.zones.bench.push(card);
  events.push({ type: 'cardMoved', instanceId: card.instanceId, from: 'hand', to: 'bench', playerId: player.playerId });
  const { extraPrize } = abilityPrizeToBench(card) || {};
  let extra = extraPrize === 'always';
  if (extraPrize === 'coin') {
    const coin = flipCoin(activeRng);
    events.push({ type: 'coinFlipped', playerId: player.playerId, face: coin });
    extra = coin === 'heads';
  }
  if (extra && player.zones.prizes.length > 0) {
    if (!player.flags) player.flags = {};
    player.flags.prizesOwed = (player.flags.prizesOwed || 0) + 1;
  }
}

export function takePrizesCommand({ payload, draft, playerId, events }) {
  const count = payload?.count ?? 1;
  const player = draft.players[playerId];
  const prizes = player.zones.prizes;
  const hand = player.zones.hand;
  const actualCount = Math.min(count, prizes.length);
  const drawnPrizes = prizes.splice(0, actualCount);
  hand.push(...drawnPrizes);
  consumePrizeEntitlement(player, actualCount);

  events.push({
    type: 'prizesTaken',
    playerId,
    count: actualCount,
    cards: drawnPrizes.map((c) => ({ instanceId: c.instanceId })),
  });

  if (tiebreakActive(draft) && actualCount > 0) {
    setGameEnded(draft, {
      winner: playerId,
      reason: 'tiebreak: first Prize card taken',
      events,
    });
  } else if (prizes.length === 0) {
    setGameEnded(draft, {
      winner: playerId,
      reason: 'all prize cards taken',
      events,
    });
  }
}

export function takePrizesByIndexCommand({ payload, draft, playerId, events }) {
  const indices = [...payload.indices].sort((a, b) => b - a);
  const prizes = draft.players[playerId].zones.prizes;
  const hand = draft.players[playerId].zones.hand;
  const taken = [];

  for (const idx of indices) {
    if (idx < prizes.length) {
      const [card] = prizes.splice(idx, 1);
      taken.push(card);
      hand.push(card);
    }
  }
  consumePrizeEntitlement(draft.players[playerId], taken.length);

  events.push({
    type: 'prizesTaken',
    playerId,
    count: taken.length,
    cards: taken.map((c) => ({ instanceId: c.instanceId })),
  });

  if (tiebreakActive(draft) && taken.length > 0) {
    setGameEnded(draft, {
      winner: playerId,
      reason: 'tiebreak: first Prize card taken',
      events,
    });
  } else if (prizes.length === 0) {
    setGameEnded(draft, {
      winner: playerId,
      reason: 'all prize cards taken',
      events,
    });
  }
}

export function promoteCommand({ draft, playerId, payload, events }) {
  promoteBenchToActive(draft, {
    playerId,
    instanceId: payload.instanceId,
    events,
  });
}
