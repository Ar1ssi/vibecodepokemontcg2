/**
 * @file Authoritative state reducer for server-authoritative netcode.
 * Implements pure and total applyCommand(state, command, rng) -> { state, events, pendingChoice, error? }.
 * Enforces Invariants 2, 3, 6, 7, 8.
 */

import {
  cloneGameState,
  findCard,
  createGameState,
  attachmentHostId,
  discardCardToPlayerZone,
} from './state.mjs';
import {
  isEnergy,
  isPokemon,
  isTrainer,
  isBasicPokemon,
  getRetreatCostCount,
  createCard,
  mintInstanceId,
} from './cards.mjs';
import { validateCommandShape } from './commands.mjs';
import { setupGame } from './setup.mjs';
import { createRng } from './rng.mjs';
import {
  computeAttackDamage,
  expandEnergyEntries,
  canPayAttackCost,
} from './rules/attack-engine.mjs';
import {
  drawCount,
  parseAttackDamage,
  allBenchDamage,
  ownBenchDamage,
  attackTargetClause,
  opponentCounterClause,
  parseAttackSearchClause,
  isGxAttack,
  discardEnergyScaling,
  deckMillScaling,
  attachDiscardToBenchSpread,
  returnEnergyBonusClause,
} from './rules/damage-parser.mjs';
import { buildServerAttackContext } from './rules/attack-damage-context.mjs';
import { prizesForKO } from './rules/ko-flow.mjs';
import {
  evaluateToolKoPrevention,
  toolPrizeCountAdjust,
  attachedToolOnDamageEffects,
  combinedToolRetreatCost,
  isPokemonToolCard,
  attachedTools,
  isExCard,
  isTeraCard,
} from './rules/tool-combat.mjs';
import {
  parseThorns,
  parseToolCap,
  parseUnlimitedHandEnergyAcceleration,
  requiresActiveSpot,
  requiresKoOnOpponentTurn,
  isEvolvePlayedTrigger,
  isBenchPlayedTrigger,
  isActivatedAbility,
  passiveCostDiscount,
  applyCostDiscount,
} from './rules/ability-executors.mjs';
import { executeTrainer, discardCurrentStadium } from './effects/trainer.mjs';
import { executeAbility } from './effects/ability.mjs';
import { createPendingChoice, attachToRoot, executeSteps } from './effects/executor.mjs';
import { parseAttackSteps, resolveCoinGates } from './rules/attack-steps.mjs';
import { isSpecialEnergyCard, hasOncePerGameSpecialEnergyEffect } from './rules/special-energy-parse.mjs';
import {
  runSpecialEnergyTriggers,
  runEndOfTurnSpecialEnergies,
  resolveSpecialEnergyDiscard,
  resolveSpecialEnergyKnockout,
  resumeSpecialEnergyTrigger,
  SPECIAL_ENERGY_EFFECT,
} from './effects/special-energy.mjs';
import { executeStadium } from './effects/stadium.mjs';
import {
  parseStadiumOncePerTurn,
  isStadiumCard,
  effectiveHp,
  getStadiumRetreatCost,
  isStadiumRetreatPrevention,
  isStadiumToolNegation,
  isStadiumEnergyAttachHeal,
  isStadiumGlimwoodReFlip,
  stadiumBetweenTurnsDamageFor,
  isStadiumLostCity,
  stadiumBlocksHealing,
  isStadiumStatusPersistsOnEvolve,
  stadiumExtraAttacks,
  mergeAttacks,
  isRepeatableStadiumAction,
  parseStadiumCostModifier,
  getStadiumAttackCostIncreaseFor,
  stadiumAbilityBlockedFor,
} from './rules/stadium-effects.mjs';
import {
  isRuleBoxPokemon,
  isGxCard,
  isVstarCard,
  isTeamFlareHyperGearCard,
  isBasicEnergy,
} from './rules/card-classify.mjs';
import { trainerPlayBlockReason } from './rules/trainer-play-conditions.mjs';
import { serverEnergyDescriptor } from './rules/server-energy.mjs';
import {
  evolvedView,
  trainerTargetCounts,
  ownedCards,
  topPokemonCard,
} from './rules/evolved-pokemon.mjs';
import {
  normalizeStage,
  pokemonNamesMatch,
  requiresTurnEndOnEvolve,
} from './rules/evolution.mjs';
import {
  addCondition,
  removeCondition,
  clearConditions,
  hasCondition,
  hasAnyCondition,
  listConditions,
} from './rules/special-conditions.mjs';
import {
  classifyAttackEffect,
  dualStatus,
  selfStatus,
  parseNextTurnLock,
  parseAttackEnergyDiscard,
} from './rules/attack-effects.mjs';
import { matchesSearch } from './rules/search-match.mjs';

/**
 * Coin flips an attack's own printed text calls for, rolled from the command's RNG so a
 * replay reproduces them (design 002 catch-up). "Flip a coin" is one flip; "Flip N coins"
 * plus a "for each heads" clause is N flips whose heads are counted for damage scaling.
 *
 * @returns {{ coin: 'heads'|'tails'|null, headsCount: number|undefined, flips: string[] }}
 */
function flipAttackCoins(attack, rng) {
  const text = String(attack?.text || '').toLowerCase();
  const flip = () => ((rng ? rng.next() : 0.5) < 0.5 ? 'heads' : 'tails');

  const multi = text.match(/flip (\d+) coins?/);
  if (multi) {
    const requested = Number.parseInt(multi[1], 10);
    // A printed count is always small; cap it so a malformed text cannot spin the RNG.
    const count = Number.isFinite(requested)
      ? Math.min(Math.max(requested, 0), 20)
      : 0;
    const flips = Array.from({ length: count }, flip);
    const headsCount = flips.filter((f) => f === 'heads').length;
    return {
      coin:
        count === 1
          ? flips[0]
          : headsCount === count
            ? 'heads'
            : headsCount === 0
              ? 'tails'
              : null,
      headsCount,
      flips,
    };
  }
  if (/flip a coin/.test(text)) {
    const coin = flip();
    return { coin, headsCount: coin === 'heads' ? 1 : 0, flips: [coin] };
  }
  return { coin: null, headsCount: undefined, flips: [] };
}

function resolveAttackStatusConditions(
  attack,
  { coin, headsCount = 0, flips = [] } = {}
) {
  const text = String(attack?.text || '').toLowerCase();
  if (!text) return { defenderConditions: [], attackerConditions: [] };

  const family = classifyAttackEffect(attack);
  const toProperCase = (str) =>
    str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

  // Coin check gating status application:
  // e.g. "Flip a coin. If heads, your opponent's Active Pokémon is now Paralyzed."
  const hasHeadsReq =
    /if heads[,.\s].*(asleep|paralyzed|poisoned|burned|confused)/.test(text);
  const hasTailsReq =
    /if tails[,.\s].*(asleep|paralyzed|poisoned|burned|confused)/.test(text);
  if (hasHeadsReq && coin !== 'heads' && headsCount < 1) {
    return { defenderConditions: [], attackerConditions: [] };
  }
  if (
    hasTailsReq &&
    coin !== 'tails' &&
    flips.length > 0 &&
    flips.every((f) => f === 'heads')
  ) {
    return { defenderConditions: [], attackerConditions: [] };
  }

  const self = selfStatus(text);
  if (self) {
    return { defenderConditions: [], attackerConditions: [toProperCase(self)] };
  }

  const dual = dualStatus(text);
  if (dual) {
    return {
      defenderConditions: dual.map(toProperCase),
      attackerConditions: [],
    };
  }

  switch (family) {
    case 'status-asleep':
      return { defenderConditions: ['Asleep'], attackerConditions: [] };
    case 'status-paralyzed':
      return { defenderConditions: ['Paralyzed'], attackerConditions: [] };
    case 'status-poisoned':
      return { defenderConditions: ['Poisoned'], attackerConditions: [] };
    case 'status-burned':
      return { defenderConditions: ['Burned'], attackerConditions: [] };
    case 'status-confused':
      return { defenderConditions: ['Confused'], attackerConditions: [] };
    default:
      return { defenderConditions: [], attackerConditions: [] };
  }
}

/** Benched Pokémon of a player, roots only (attached cards are not targets). */
function benchTargets(player) {
  return (player?.zones?.bench || []).filter(
    (c) => !c.attachedTo && isPokemon(c)
  );
}

function discardCardFromPlayerZone(draft, instanceId, playerId) {
  const player = draft.players[playerId];
  if (!player?.zones) return null;
  for (const zoneKey of ['active', 'bench']) {
    const zone = player.zones[zoneKey];
    if (!Array.isArray(zone)) continue;
    const idx = zone.findIndex((c) => c.instanceId === instanceId);
    if (idx !== -1) {
      const [removed] = zone.splice(idx, 1);
      removed.attachedTo = null;
      discardCardToPlayerZone(player, removed);
      return removed;
    }
  }
  return null;
}

/**
 * Applies damage to one benched Pokémon: counters, event, and KO through handleKnockout
 * (so the prize entitlement stays server-granted, D43).
 */
function damageBenchedPokemon(
  draft,
  { victim, victimPlayerId, attackerPlayerId, attackName, dealt, auto, ownAttack = false, events }
) {
  if (dealt <= 0) return;

  // Check Tera bench damage immunity ("Tera: As long as this Pokémon is on your Bench, prevent all damage done to this Pokémon by attacks")
  if (isTeraCard(victim)) {
    events.push({
      type: 'damagePrevented',
      instanceId: victim.instanceId,
      attackName,
      reason: 'tera-bench',
    });
    return;
  }

  // Check team bench protection abilities (e.g. Manaphy Wave Veil)
  const victimBench = draft.players[victimPlayerId]?.zones?.bench || [];
  const victimActive = draft.players[victimPlayerId]?.zones?.active || [];
  const allVictimCards = [...victimActive, ...victimBench];
  // Bench shields stop the opponent's attacks, not the attacker's own recoil.
  const benchProtected = !ownAttack && allVictimCards.some((c) => {
    if (c.attachedTo) return false;
    const t = String(
      c?.ability?.text ?? c?.abilityText ?? c?.text ?? c?.effect ?? ''
    ).toLowerCase();
    return (
      t.includes('prevent all damage done to your benched pokémon') ||
      t.includes('prevent all damage done to your benched pokemon')
    );
  });
  if (benchProtected) {
    events.push({
      type: 'damagePrevented',
      instanceId: victim.instanceId,
      attackName,
      reason: 'bench-shield',
    });
    return;
  }

  const prevDamage = victim.damage || 0;
  const koHp = cardEffectiveHp(draft, victim, victimPlayerId);
  const wouldKo = koHp > 0 && prevDamage + dealt >= koHp;

  if (wouldKo) {
    const koEval = evaluateToolKoPrevention(victim, victimBench, {
      currentDamage: prevDamage,
      incomingDamage: dealt,
      baseHp: koHp,
      stadium: draft.stadium,
      inHp: true,
    });
    if (koEval.prevented) {
      victim.damage = koEval.totalDamage;
      events.push({
        type: 'damageUpdated',
        instanceId: victim.instanceId,
        damage: victim.damage,
        dealt,
      });
      events.push({
        type: 'koPrevented',
        instanceId: victim.instanceId,
        tool: koEval.tool,
        surviveHp: koEval.surviveHp,
      });
      if (koEval.discardOnUse && koEval.toolCard) {
        discardCardFromPlayerZone(
          draft,
          koEval.toolCard.instanceId,
          victimPlayerId
        );
      }
      return;
    }
  }

  victim.damage = prevDamage + dealt;
  events.push({
    type: 'damageUpdated',
    instanceId: victim.instanceId,
    damage: victim.damage,
    dealt,
  });
  events.push({
    type: 'benchDamaged',
    instanceId: victim.instanceId,
    playerId: victimPlayerId,
    attackerPlayerId,
    attackName,
    dealt,
    auto: Boolean(auto),
  });

  if (koHp > 0 && victim.damage >= koHp) {
    handleKnockout(draft, {
      victimPlayerId,
      attackerPlayerId,
      victim,
      events,
    });
  }
}

// Chosen-target damage/counters for attacks that let the player pick one or more
// of the opponent's Pokémon (design 017 / D19). Returns a clause, or null.
//   { kind: 'damage'|'counters', amount, count, scope: 'bench'|'any'|'active' }
// 'active' scope is a fixed Active target and is applied without a choice.
function resolveAttackTargetClause(text, parsed, spread) {
  if (spread > 0) return null;
  const t = String(text || '');
  const counters = opponentCounterClause(t);
  if (counters) {
    if (counters.mode === 'active') {
      return { kind: 'counters', amount: counters.count * 10, count: 1, scope: 'active' };
    }
    // "put N damage counters on your opponent's Pokémon in any way you like":
    // place them one click at a time, each counter 10 damage, all N must land.
    if (/in any way/i.test(t)) {
      return {
        kind: 'counters',
        amount: 10,
        count: 1,
        scope: 'any',
        distributable: true,
        remaining: counters.count,
      };
    }
    return {
      kind: 'counters',
      amount: counters.count * 10,
      count: counters.mode === 'multi' ? counters.targets : 1,
      scope: 'any',
    };
  }
  const damage = attackTargetClause(t);
  if (damage) {
    return {
      kind: 'damage',
      amount: damage.amount,
      count: damage.count,
      scope: damage.scope,
      // Attack damage to the Active applies Weakness/Resistance unless the text
      // waives it for every target ("... for Benched Pokémon" waives only those).
      activeWR: !/don't apply weakness and resistance(?! for benched)/i.test(t),
    };
  }
  if (parsed?.bench > 0) {
    return { kind: 'damage', amount: parsed.bench, count: 1, scope: 'bench' };
  }
  return null;
}

function attackTargetOptions(draft, defenderPlayerId, scope) {
  const player = draft.players[defenderPlayerId];
  const active = (player?.zones?.active || []).filter((c) => !c.attachedTo);
  const bench = (player?.zones?.bench || []).filter((c) => !c.attachedTo);
  if (scope === 'bench') return bench;
  if (scope === 'active') return active;
  return [...active, ...bench];
}

// Flat damage to an Active target: no W/R for counter placement, and the printed
// snipe clause is treated as unmodified. Bench targets go through
// damageBenchedPokemon (Tera/bench-shield guards + KO).
function applyFlatDamageToTarget(draft, { ref, amount, attackerPlayerId, events }) {
  const victim = ref.card;
  if (!victim || amount <= 0) return 0;
  victim.damage = (victim.damage || 0) + amount;
  events.push({
    type: 'damageUpdated',
    instanceId: victim.instanceId,
    damage: victim.damage,
    dealt: amount,
  });
  const koHp = cardEffectiveHp(draft, victim, ref.playerId);
  if (koHp > 0 && victim.damage >= koHp) {
    handleKnockout(draft, {
      victimPlayerId: ref.playerId,
      attackerPlayerId,
      victim,
      events,
    });
  }
  return amount;
}

// A chosen-target clause's damage to the opponent's Active after Weakness,
// Resistance and the other attack modifiers computeAttackDamage applies.
function activeTargetDamage(draft, { ref, clause, attackerPlayerId, attackName }) {
  const attacker = (draft.players[attackerPlayerId]?.zones?.active || []).find(
    (c) => !c.attachedTo
  );
  if (!attacker) return clause.amount;
  const defenderPlayer = draft.players[ref.playerId];
  const result = computeAttackDamage(
    inPlayView(draft, attacker),
    inPlayView(draft, ref.card),
    { name: attackName, damage: clause.amount },
    {
      attackerZoneCards: draft.players[attackerPlayerId]?.zones?.active || [],
      defenderZoneCards: defenderPlayer?.zones?.active || [],
      defenderInPlayCards: [
        ...(defenderPlayer?.zones?.active || []),
        ...(defenderPlayer?.zones?.bench || []),
      ],
      stadium: draft.stadium,
      defenderIsActive: true,
      baseDamage: clause.amount,
      turnDamageBonuses: draft.players[attackerPlayerId]?.flags?.turnDamageBonuses || [],
    }
  );
  return result.total;
}

// Applies a chosen-target clause to the selected instanceIds. Returns damage dealt.
function applyAttackTargets(
  draft,
  { selection, clause, defenderPlayerId, attackerPlayerId, attackName, events }
) {
  let dealt = 0;
  for (const id of selection || []) {
    const ref = findCard(draft, id);
    if (!ref || ref.playerId !== defenderPlayerId) continue;
    if (ref.zoneId === 'bench') {
      dealt += clause.amount;
      damageBenchedPokemon(draft, {
        victim: ref.card,
        victimPlayerId: defenderPlayerId,
        attackerPlayerId,
        attackName,
        dealt: clause.amount,
        auto: false,
        events,
      });
    } else if (ref.zoneId === 'active') {
      dealt += applyFlatDamageToTarget(draft, {
        ref,
        amount: clause.activeWR
          ? activeTargetDamage(draft, { ref, clause, attackerPlayerId, attackName })
          : clause.amount,
        attackerPlayerId,
        events,
      });
    }
  }
  return dealt;
}

// An in-play Pokémon as its top evolution card (see evolved-pokemon.mjs). Read-only.
function inPlayView(state, card) {
  if (!card) return card;
  const ref = findCard(state, card.instanceId);
  const zone = ref?.player?.zones?.[ref.zoneId];
  return Array.isArray(zone) ? evolvedView(zone, card) : card;
}

// Extra attacks a Stadium makes usable by this Pokémon (Shrine of Memories /
// Meteor Falls inheritance, Holon Lake / Rocket's Tricky Gym grants). Order is
// shared with the client's list builders, so an attackIndex resolves alike.
function stadiumExtraAttacksFor(state, card, { isActive = true } = {}) {
  const stadiumCard = state.stadium?.card || state.stadium;
  if (!stadiumCard || !card) return [];
  const ref = findCard(state, card.instanceId);
  const zone = ref?.player?.zones?.[ref.zoneId];
  if (!Array.isArray(zone)) return [];
  return stadiumExtraAttacks(stadiumCard, {
    zoneCards: zone,
    root: card,
    isActive,
  });
}

// `inPlayView` with Stadium extras merged into its attacks list.
function attackViewFor(state, card, { isActive = true } = {}) {
  const view = inPlayView(state, card);
  const extras = stadiumExtraAttacksFor(state, card, { isActive });
  if (extras.length === 0) return view;
  return { ...view, attacks: mergeAttacks(view?.attacks || [], extras) };
}

// Effective HP including printed base stats, top evolution, attached Tools, and Stadium modifiers.
function cardEffectiveHp(state, card, playerId) {
  if (!card) return 0;
  const view = inPlayView(state, card);
  const baseHp = view?.hp || 0;
  if (!baseHp) return 0;
  const ref = findCard(state, card.instanceId);
  const zoneCards = ref?.player?.zones?.[ref.zoneId] || [];
  return effectiveHp(baseHp, playerId, card, zoneCards, state.stadium);
}

// Effective retreat cost including printed base stats, top evolution, attached Tools, Bench abilities, and Stadium modifiers.
function computeEffectiveRetreatCost(state, card, playerId) {
  if (!card) return 0;
  const player = state.players?.[playerId];
  const activeZone = player?.zones?.active || [];
  const stadium = state.stadium;
  const baseRetreat = getRetreatCostCount(inPlayView(state, card));

  // 1. Tool retreat cost modifier + self ability modifier
  const blockTools = isStadiumToolNegation(stadium?.card || stadium);
  let cost = combinedToolRetreatCost(baseRetreat, card, activeZone, {
    blockTools,
    stadium,
  });

  // 2. Team bench abilities (e.g. "your Active Pokémon's Retreat Cost is 1 less")
  for (const b of player?.zones?.bench || []) {
    if (b.attachedTo) continue;
    const t = String(
      b.ability?.text ?? b.abilityText ?? b.text ?? b.effect ?? ''
    ).toLowerCase();
    if (
      /active pok[ée]mon's retreat cost is (\d+) less|active pokemon's retreat cost is (\d+) less/i.test(
        t
      )
    ) {
      const m = t.match(/retreat cost is (\d+) less/i);
      const n = m ? parseInt(m[1], 10) : 1;
      cost = Math.max(0, cost - n);
    }
  }

  // 3. Stadium retreat modifier (e.g. Beach Court)
  cost = getStadiumRetreatCost(cost, card, playerId, stadium);

  return Math.max(0, cost);
}

/**
 * Handles Knockout resolution for a Pokemon:
 * - Grants the attacker a prize entitlement, settled by collectPrizeEntitlement
 *   when the command finishes (audit finding B-1: the grant, not a client-supplied
 *   count, is what authorises a prize card changing hands)
 * - Discards victim and its attached cards
 * - Auto-promotes first benched Pokemon to active (if any)
 * - Checks win conditions
 */
function handleKnockout(
  draft,
  { victimPlayerId, attackerPlayerId, victim, events }
) {
  // Discard victim and attached cards from its zone (active or bench)
  const victimActive = draft.players[victimPlayerId]?.zones?.active || [];
  const victimBench = draft.players[victimPlayerId]?.zones?.bench || [];
  const victimPlayer = draft.players[victimPlayerId];
  if (victimPlayer && draft.turn?.player !== victimPlayerId) {
    victimPlayer.flags = { ...victimPlayer.flags, koedOnOppTurn: true };
  }

  const wasActive = victimActive.some(
    (c) => c.instanceId === victim.instanceId
  );
  const wasBench = victimBench.some((c) => c.instanceId === victim.instanceId);

  const victimZoneCards = wasActive
    ? victimActive
    : wasBench
      ? victimBench
      : [victim];

  const basePrizeCount = prizesForKO(inPlayView(draft, victim));
  // Legacy Energy: the once-per-game reduction may already be spent.
  const legacyEnergyAttached = victimZoneCards.some(
    (c) =>
      c.attachedTo === victim.instanceId &&
      isSpecialEnergyCard(c) &&
      hasOncePerGameSpecialEnergyEffect(c)
  );
  const legacyUsed = !!victimPlayer?.flags?.legacyPrizeReductionUsed;
  let prizeCount = toolPrizeCountAdjust(
    victim,
    victimZoneCards,
    basePrizeCount,
    {
      stadium: draft.stadium,
      skipSpecialEnergy: legacyUsed,
    }
  );
  if (legacyEnergyAttached && !legacyUsed) {
    if (!victimPlayer.flags) victimPlayer.flags = {};
    victimPlayer.flags.legacyPrizeReductionUsed = true;
  }

  const attacker = draft.players[attackerPlayerId];
  if (attacker?.flags?.briarActive) {
    const victimIsEx = isExCard(victim);
    const attackerActive = attacker?.zones?.active?.find((c) => !c.attachedTo);
    if (victimIsEx && attackerActive && isTeraCard(attackerActive)) {
      prizeCount += 1;
    }
  }

  const attackerPrizes = attacker?.zones?.prizes || [];
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

  // Special-energy on-knockout triggers (Splash/Rescue return the Pokémon to
  // hand; Gift draws until 7). Attached cards still go to the discard pile.
  const koZoneRef = findCard(draft, victim.instanceId);
  const koSpecial = resolveSpecialEnergyKnockout(draft, {
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
        c.attachedTo = null;
        if (lostCity && c.instanceId === victim.instanceId) {
          if (!Array.isArray(victimPlayer.zones.lostZone)) {
            victimPlayer.zones.lostZone = [];
          }
          victimPlayer.zones.lostZone.push(c);
        } else if (koSpecial.returnToHand && c.instanceId === victim.instanceId) {
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
  });

  // Promotion of a new Active is NOT done here. `settlePromotionChoices` runs at the
  // end of every command: a single Benched Pokémon is promoted automatically, while 2+
  // raise a `PendingChoice` so the KO'd player clicks which one promotes (server
  // authority parity with the legacy mat picker, design 017 / PR #178). Deferring it to
  // the command tail keeps the promotion from being overwritten by the attack's own
  // search/snipe choice, which also uses `state.pendingChoice`.

  // Win condition checks (rulebook 30c 1.3a / p.21 "both players win at the same
  // time"). Count how many ways each player wins on this Knockout, then compare:
  // the side with more ways wins outright, and only an equal non-zero count is a
  // genuine tie. Taking the last prize *and* emptying the victim's board is two
  // ways for the attacker, not a draw; and a self-KO that empties the attacker's
  // own board is a way for the victim.
  const attackerWinsByPrizes =
    attackerPrizes.length <= (attacker?.flags?.prizesOwed || 0);
  const remainingActive = victimActive.filter((c) => !c.attachedTo);
  const remainingBench = victimBench.filter((c) => !c.attachedTo);
  const victimWiped =
    remainingActive.length === 0 && remainingBench.length === 0;

  const attackerOwnActive = attacker?.zones?.active || [];
  const attackerOwnBench = attacker?.zones?.bench || [];
  const attackerWiped =
    attackerOwnActive.filter((c) => !c.attachedTo).length === 0 &&
    attackerOwnBench.filter((c) => !c.attachedTo).length === 0;

  const attackerWays = (attackerWinsByPrizes ? 1 : 0) + (victimWiped ? 1 : 0);
  const victimWays = attackerWiped ? 1 : 0;

  if (attackerWays > victimWays) {
    setGameEnded(draft, {
      winner: attackerPlayerId,
      reason: attackerWinsByPrizes
        ? 'all prize cards taken'
        : 'no Pokémon in play',
      events,
    });
  } else if (victimWays > attackerWays) {
    setGameEnded(draft, {
      winner: victimPlayerId,
      reason: 'no Pokémon in play',
      events,
    });
  } else if (attackerWays > 0) {
    setGameEnded(draft, {
      simultaneous: [attackerPlayerId, victimPlayerId],
      ways: {
        [attackerPlayerId]: [
          ...(attackerWinsByPrizes ? ['all prize cards taken'] : []),
          ...(victimWiped ? ['no Pokémon in play'] : []),
        ],
        [victimPlayerId]: attackerWiped ? ['no Pokémon in play'] : [],
      },
      events,
    });
  }

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
function promoteBenchToActive(draft, { playerId, instanceId, events }) {
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
function settlePromotionChoices(draft, { events }) {
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
 * Resolves Pokémon Checkup between turns, applying every condition the Active holds
 * in this order, then checking for a Knockout once:
 * - Poison: 10 damage
 * - Burn: 20 damage + 50% cure flip
 * - Asleep: 50% cure flip
 * - Paralyzed: cured at the end of the paralyzed player's turn
 */
/**
 * "Between turns" Stadium damage (Shrine of Punishment, Cursed Stone, Desert
 * Ruins). Applies to every in-play Pokémon that matches the card's filter,
 * on both sides, then resolves any Knockouts (prizes go to the non-victim).
 */
function applyBetweenTurnsStadiumDamage(draft, { events }) {
  const card = draft.stadium?.card || draft.stadium;
  if (!card || isGameConcluded(draft)) return;
  const playerIds = Object.keys(draft.players || {});
  for (const pid of playerIds) {
    const player = draft.players[pid];
    for (const zone of [player.zones?.active, player.zones?.bench]) {
      if (!Array.isArray(zone)) continue;
      for (const mon of [...zone]) {
        if (mon.attachedTo) continue;
        const dmg = stadiumBetweenTurnsDamageFor(mon, card);
        if (dmg <= 0) continue;
        mon.damage = (mon.damage || 0) + dmg;
        events.push({
          type: 'stadiumBetweenTurnsDamage',
          instanceId: mon.instanceId,
          playerId: pid,
          damage: dmg,
        });
      }
    }
  }
  for (const pid of playerIds) {
    if (isGameConcluded(draft)) break;
    const player = draft.players[pid];
    const oppId = playerIds.find((id) => id !== pid);
    for (const zone of [player.zones?.active, player.zones?.bench]) {
      if (isGameConcluded(draft)) break;
      if (!Array.isArray(zone)) continue;
      for (const mon of [...zone]) {
        if (mon.attachedTo) continue;
        const hp = cardEffectiveHp(draft, mon, pid);
        if (hp && (mon.damage || 0) >= hp) {
          handleKnockout(draft, {
            victimPlayerId: pid,
            attackerPlayerId: oppId,
            victim: mon,
            events,
          });
        }
      }
    }
  }
}

function resolveCheckup(
  draft,
  { rng, events, endingPlayerId = draft.turn?.player }
) {
  for (const pid of Object.keys(draft.players || {})) {
    const player = draft.players[pid];
    const active = player.zones?.active?.find((c) => !c.attachedTo);
    if (!active || !hasAnyCondition(active)) continue;

    // Every condition resolves, in rules order, and the Knockout check runs once after
    // all Checkup damage (audit A-1: this used to be an else-if chain over one string).
    const flip = () => ((rng ? rng.next() : 0.5) < 0.5 ? 'heads' : 'tails');
    const cleared = (condition) => {
      removeCondition(active, condition);
      events.push({
        type: 'statusCleared',
        condition,
        instanceId: active.instanceId,
        playerId: pid,
      });
    };
    const checkupDamage = (condition, damage) => {
      active.damage = (active.damage || 0) + damage;
      events.push({
        type: 'checkupDamage',
        instanceId: active.instanceId,
        condition,
        damage,
        playerId: pid,
      });
    };

    if (hasCondition(active, 'Poisoned')) {
      checkupDamage('Poisoned', 10);
    }
    if (hasCondition(active, 'Burned')) {
      checkupDamage('Burned', 20);
      if (flip() === 'heads') cleared('Burned');
    }
    if (hasCondition(active, 'Asleep')) {
      if (flip() === 'heads') cleared('Asleep');
    }
    // Under official Pokémon TCG rules, Paralysis is only cured at the end of that player's turn.
    if (
      hasCondition(active, 'Paralyzed') &&
      (!endingPlayerId || pid === endingPlayerId)
    ) {
      cleared('Paralyzed');
    }

    const activeHp = cardEffectiveHp(draft, active, pid);
    if (activeHp && active.damage >= activeHp) {
      const oppId = Object.keys(draft.players).find((id) => id !== pid);
      handleKnockout(draft, {
        victimPlayerId: pid,
        attackerPlayerId: oppId,
        victim: active,
        events,
      });
    }
  }

  // Between-turns Stadium damage resolves after Pokémon Checkup.
  applyBetweenTurnsStadiumDamage(draft, { events });

  // End-of-turn special-energy effects (legacy Darkness Energy): "at the end of
  // every turn" applies to both players' in-play Pokémon.
  runEndOfTurnSpecialEnergies(draft, { events });
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
}

function conditionsUpdatedEvent(card, condition) {
  return {
    type: 'specialConditionUpdated',
    instanceId: card.instanceId,
    condition,
    conditions: listConditions(card),
  };
}

function consumePrizeEntitlement(player, count) {
  if (!player.flags?.prizesOwed) return;
  const remainingOwed = Math.max(0, player.flags.prizesOwed - count);
  if (remainingOwed > 0) player.flags.prizesOwed = remainingOwed;
  else delete player.flags.prizesOwed;
}

/**
 * Design 012: `faceDown` only means something on the board. Every path that takes a card off
 * the board (moves, mass discards, shuffles, undo replay) would otherwise have to clear it, and
 * a missed one would hide the card again the next time it lands on the board — so the flag is
 * swept once, after every command.
 */
function clearFaceDownOffBoard(draft) {
  if (draft.stadium?.faceDown) delete draft.stadium.faceDown;
  for (const player of Object.values(draft.players || {})) {
    for (const [zoneId, zone] of Object.entries(player.zones || {})) {
      if (zoneId === 'board' || !Array.isArray(zone)) continue;
      for (const card of zone) {
        if (card?.faceDown) delete card.faceDown;
      }
    }
  }
}

function isZoneIndex(index, zone) {
  return Number.isInteger(index) && index >= 0 && index < zone.length;
}

const PRIZE_CHOICE_EFFECT = 'prizes';

/**
 * Settles prize entitlements once a command has finished. While the game is still
 * running, the first player owed prizes gets a pendingChoice over their face-down prize
 * cards (the whole game waits on it, like TCG Live); a second owed player gets theirs
 * after the first resolves. Once the game has ended nobody is left to wait for, so
 * everything owed is collected directly.
 */
function settlePrizeEntitlements(draft, { events }) {
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
function resolveDamageCounterKnockouts(draft, { events }) {
  const placed = events.filter(
    (e) => e.type === 'damageCountersPlaced' || e.type === 'knockOutMarked'
  );
  if (placed.length === 0) return;

  const koed = new Set();
  for (const e of placed) {
    if (koed.has(e.instanceId)) continue;
    const ref = findCard(draft, e.instanceId);
    if (!ref || (ref.zoneId !== 'active' && ref.zoneId !== 'bench')) continue;
    const victim = ref.card;
    const koHp = cardEffectiveHp(draft, victim, ref.playerId);
    // "… is Knocked Out." (attack-steps atkKnockOut) knocks out regardless of HP.
    if (e.type === 'knockOutMarked' || (koHp > 0 && (victim.damage || 0) >= koHp)) {
      koed.add(e.instanceId);
      handleKnockout(draft, {
        victimPlayerId: ref.playerId,
        // A marker without an explicit beneficiary (self-inflicted damage)
        // awards the KO to the victim's opponent, so prizes are never skipped.
        attackerPlayerId:
          e.attackerPlayerId ||
          Object.keys(draft.players || {}).find((id) => id !== ref.playerId),
        victim,
        events,
      });
    }
  }

  // Internal marker events are not part of the client-facing stream.
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === 'damageCountersPlaced' || events[i].type === 'knockOutMarked') {
      events.splice(i, 1);
    }
  }
}

function resolvePrizeChoice(draft, { playerId, selection, events }) {
  const player = draft.players[playerId];
  const prizes = player.zones.prizes;
  const chosenIds = new Set(selection);
  const taken = prizes.filter((card) => chosenIds.has(card.instanceId));
  player.zones.prizes = prizes.filter(
    (card) => !chosenIds.has(card.instanceId)
  );
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
  }
}

/**
 * Applies an already-legal retreat: pays the Energy cost and swaps the Active with the
 * chosen Benched Pokémon. Pure; legality (turn, conditions, cost, bench non-empty) is
 * validated by the command gate before this runs. Shared by the direct `retreat` command
 * and the `retreat` PendingChoice resume path, so a player with 2+ Benched Pokémon can
 * click the one to switch in (design 017 / D19).
 */
function applyRetreatSwap(
  draft,
  { playerId, benchInstanceId = null, discardEnergyIds = [], events }
) {
  const player = draft.players[playerId];
  const active = player?.zones?.active?.find((c) => !c.attachedTo);
  if (!player || !active) return;
  const costN = computeEffectiveRetreatCost(draft, active, playerId);

  // Discard energy cost
  if (Array.isArray(discardEnergyIds) && discardEnergyIds.length > 0) {
    for (const id of discardEnergyIds) {
      const idx = player.zones.active.findIndex((c) => c.instanceId === id);
      if (idx >= 0) {
        const [discarded] = player.zones.active.splice(idx, 1);
        discarded.attachedTo = null;
        const to = discardCardToPlayerZone(player, discarded);
        events.push({
          type: 'cardMoved',
          instanceId: id,
          from: 'active',
          to,
          playerId,
        });
      }
    }
  } else if (costN > 0) {
    let discardedCount = 0;
    for (
      let i = player.zones.active.length - 1;
      i >= 0 && discardedCount < costN;
      i--
    ) {
      const card = player.zones.active[i];
      if (card.attachedTo === active.instanceId && isEnergy(card)) {
        player.zones.active.splice(i, 1);
        card.attachedTo = null;
        const to = discardCardToPlayerZone(player, card);
        discardedCount++;
        events.push({
          type: 'cardMoved',
          instanceId: card.instanceId,
          from: 'active',
          to,
          playerId,
        });
      }
    }
  }

  // Bench swap
  let benchPokemon = null;
  if (benchInstanceId != null) {
    benchPokemon = player.zones.bench.find(
      (c) => c.instanceId === benchInstanceId
    );
  } else {
    benchPokemon = player.zones.bench.find((c) => !c.attachedTo);
  }

  if (active && benchPokemon) {
    // Move active + attachments to bench
    for (let i = player.zones.active.length - 1; i >= 0; i--) {
      const c = player.zones.active[i];
      if (
        c.instanceId === active.instanceId ||
        c.attachedTo === active.instanceId
      ) {
        player.zones.active.splice(i, 1);
        player.zones.bench.push(c);
      }
    }
    // Move benchPokemon + attachments to active
    for (let i = player.zones.bench.length - 1; i >= 0; i--) {
      const c = player.zones.bench[i];
      if (
        c.instanceId === benchPokemon.instanceId ||
        c.attachedTo === benchPokemon.instanceId
      ) {
        player.zones.bench.splice(i, 1);
        player.zones.active.push(c);
      }
    }

    clearConditions(active);
    delete active.cannotAttackUntilTurn;
    delete active.cannotAttackAttackName;
    delete active.cannotRetreatUntilTurn;

    if (!player.flags) player.flags = {};
    player.flags.retreatedThisTurn = true;

    events.push({
      type: 'cardRetreated',
      activeId: active.instanceId,
      promotedId: benchPokemon.instanceId,
      playerId,
    });
  }
}

/**
 * Advances the turn to the next player, reset flags, and performs start-of-turn draw.
 */
function advanceTurn(draft, { nextPlayerId, events }) {
  // The flags object is replaced wholesale below; a Checkup Knockout may have just
  // entitled the incoming player, and that entitlement must survive the reset so the
  // prize choice raised at the end of the command can be settled.
  const prizesOwed = draft.players[nextPlayerId].flags?.prizesOwed;
  const koedLastOppTurn = !!draft.players[nextPlayerId].flags?.koedOnOppTurn;
  // Game-scoped once-per-game markers live in `flags` too, so the wholesale
  // rebuild below must carry them across or they are silently forgotten — the
  // Legacy Energy prize reduction was spent again on a later KO.
  const legacyPrizeReductionUsed = !!draft.players[nextPlayerId].flags?.legacyPrizeReductionUsed;

  draft.turn.player = nextPlayerId;
  draft.turn.number = (draft.turn.number || 1) + 1;
  draft.turn.phase = 'main';

  if (!draft.players[nextPlayerId].flags) {
    draft.players[nextPlayerId].flags = {};
  }
  draft.players[nextPlayerId].flags = {
    energyAttached: false,
    attackerAttacked: false,
    retreatedThisTurn: false,
    supporterPlayed: false,
    stadiumPlayedThisTurn: false,
    stadiumUsedThisTurn: false,
    abilitiesUsed: {},
    evolved: {},
    briarActive: false,
    koedLastOppTurn,
    ...(prizesOwed ? { prizesOwed } : {}),
    ...(legacyPrizeReductionUsed ? { legacyPrizeReductionUsed } : {}),
  };
  for (const p of Object.values(draft.players || {})) {
    if (p.playerId !== nextPlayerId && p.flags) {
      p.flags.briarActive = false;
      delete p.flags.turnDamageBonuses;
    }
  }

  // Reset once-per-turn ability markers on in-play Pokemon
  const inPlay = [
    ...(draft.players[nextPlayerId].zones?.active || []),
    ...(draft.players[nextPlayerId].zones?.bench || []),
  ];
  for (const card of inPlay) {
    card.abilityUsed = false;
  }

  const deck = draft.players[nextPlayerId].zones.deck;
  const hand = draft.players[nextPlayerId].zones.hand;
  if (deck.length === 0) {
    const oppId = Object.keys(draft.players).find((id) => id !== nextPlayerId);
    setGameEnded(draft, { winner: oppId, reason: 'deck-out', events });
  } else {
    const [card] = deck.splice(0, 1);
    hand.push(card);
    events.push({
      type: 'cardsDrawn',
      playerId: nextPlayerId,
      count: 1,
      cards: [{ instanceId: card.instanceId }],
    });
  }

  events.push({
    type: 'turnStarted',
    player: nextPlayerId,
    number: draft.turn.number,
  });
}

/**
 * Ends the acting player's turn from inside a card effect (Lumiose City: "If a
 * player searches their deck in this way, their turn ends."). Mirrors the `pass`
 * path — Checkup first, then advance only while the game is still live.
 */
function endTurnFromEffect(draft, { playerId, activeRng, events }) {
  if (isGameConcluded(draft)) return;
  const oppId = Object.keys(draft.players || {}).find((id) => id !== playerId);
  if (!oppId) return;
  resolveCheckup(draft, { rng: activeRng, events, endingPlayerId: playerId });
  if (!isGameConcluded(draft)) {
    advanceTurn(draft, { nextPlayerId: oppId, events });
  }
}

/**
 * Marks game as ended with winner and reason, or — when both players satisfy a
 * win condition on the same Knockout — enters the sudden-death `tiebreak`
 * phase with no winner (rulebook 30c 1.3a).
 */
function setGameEnded(draft, { winner, reason, simultaneous, ways, events }) {
  if (Array.isArray(simultaneous) && simultaneous.length === 2) {
    const [a, b] = simultaneous;
    draft.turn.phase = 'tiebreak';
    draft.winner = null;
    draft.winReason = 'simultaneous';
    // Sudden death: the first Prize taken from here wins, including after the
    // interim `pass` hand-over that flips the turn back to `main` (1.2). The
    // fresh six-prize mat is a tracked follow-up; this flag is the interim
    // "first Prize wins" rule, the same one `setupGame({ firstPrizeWins })` sets.
    draft.firstPrizeWins = true;
    draft.tiebreak = {
      players: [a, b],
      ways: {
        [a]: [...(ways?.[a] || [])],
        [b]: [...(ways?.[b] || [])],
      },
    };
    events.push({ type: 'tiebreakStarted', players: [a, b] });
    return;
  }
  draft.turn.phase = 'ended';
  draft.winner = winner;
  draft.winReason = reason;
  events.push({ type: 'gameEnded', winner, reason });
}

/**
 * Per-player, per-game markers (App. 9/19). Unlike `player.flags`, advanceTurn never
 * rebuilds this object, so the GX-attack and VSTAR Power limits survive the turn.
 * Lazily initialised so states that predate the field (old snapshots, tests) still work.
 */
function ensureOncePerGame(draft, playerId) {
  const player = draft?.players?.[playerId];
  if (!player) return null;
  if (!player.oncePerGame) {
    player.oncePerGame = { vstarUsed: false, gxUsed: false };
  }
  return player.oncePerGame;
}

/**
 * Whether the game has stopped resolving normal play — either finished or
 * awaiting its sudden-death tiebreaker. Start/end-of-turn hooks must not fire
 * once this is true.
 */
function isGameConcluded(draft) {
  const phase = draft?.turn?.phase;
  return phase === 'ended' || phase === 'tiebreak';
}

/**
 * Whether the game has no legal play left at all. Unlike `isGameConcluded`,
 * this excludes `tiebreak`: during a sudden-death tiebreak a `pass` may still
 * hand the turn over (1.2), so only a decided-but-unresolved `ended` state
 * freezes the game.
 */
function isGameFrozen(draft) {
  return draft?.turn?.phase === 'ended';
}

/**
 * Validates reference integrity of instanceIds in command payload (Step 3).
 *
 * @param {object} state
 * @param {object} command
 * @returns {{ valid: boolean, error?: string }}
 */
function validateReferences(state, command) {
  const { type, payload, playerId } = command;

  switch (type) {
    case 'moveCard': {
      const cardRef = findCard(state, payload.instanceId);
      if (!cardRef) {
        return { valid: false, error: 'stale_view' };
      }
      if (cardRef.zoneId !== payload.from) {
        return { valid: false, error: 'stale_view' };
      }
      // If moving from a player zone, it must belong to the acting player
      if (payload.from !== 'stadium' && cardRef.playerId !== playerId) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    case 'attachCard': {
      const cardRef = findCard(state, payload.instanceId);
      const targetRef = findCard(state, payload.targetInstanceId);

      if (!cardRef || !targetRef) {
        return { valid: false, error: 'stale_view' };
      }
      // Attached card and target card must belong to acting player, except a
      // Team Flare Hyper Gear, which attaches to the OPPONENT's Pokémon-EX
      // (App. 24).
      const teamFlareToOpponent =
        cardRef.playerId === playerId &&
        targetRef.playerId !== playerId &&
        isTeamFlareHyperGearCard(cardRef.card) &&
        isExCard(targetRef.card);
      if (
        cardRef.playerId !== playerId ||
        (targetRef.playerId !== playerId && !teamFlareToOpponent)
      ) {
        return { valid: false, error: 'stale_view' };
      }
      // Target must be in play (active or bench)
      if (!['active', 'bench'].includes(targetRef.zoneId)) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    case 'addDamageCounter':
    case 'updateDamageCounter':
    case 'removeDamageCounter':
    case 'addSpecialCondition':
    case 'updateSpecialCondition':
    case 'removeSpecialCondition':
    case 'removeAbilityCounter':
    case 'changeType':
    case 'rotateCard': {
      const cardRef = findCard(state, payload.instanceId);
      if (!cardRef) {
        return { valid: false, error: 'stale_view' };
      }
      // Special Conditions can only be placed on the Active Pokémon (p.15);
      // parsed card effects already target the Active, so this closes the
      // manual-tool hole.
      if (type === 'addSpecialCondition' && cardRef.zoneId !== 'active') {
        return { valid: false, error: 'special_condition_not_active' };
      }
      // In sandbox / manual mode, counter updates on opponent's cards are only allowed on public in-play zones
      if (
        cardRef.playerId !== playerId &&
        ![
          'active',
          'bench',
          'board',
          'stadium',
          'discard',
          'lostZone',
        ].includes(cardRef.zoneId)
      ) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    case 'draw': {
      if (!state.players?.[playerId]) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    case 'attack': {
      const active = state.players?.[playerId]?.zones?.active?.find(
        (c) => !c.attachedTo
      );
      if (!active) {
        return { valid: false, error: 'stale_view' };
      }
      if (payload?.targetInstanceId != null) {
        const targetRef = findCard(state, payload.targetInstanceId);
        if (!targetRef) {
          return { valid: false, error: 'stale_view' };
        }
      }
      return { valid: true };
    }

    case 'retreat': {
      const active = state.players?.[playerId]?.zones?.active?.find(
        (c) => !c.attachedTo
      );
      if (!active) {
        return { valid: false, error: 'stale_view' };
      }
      if (payload?.benchInstanceId != null) {
        const benchCard = state.players?.[playerId]?.zones?.bench?.find(
          (c) => c.instanceId === payload.benchInstanceId && !c.attachedTo
        );
        if (!benchCard) {
          return { valid: false, error: 'stale_view' };
        }
      }
      if (Array.isArray(payload?.discardEnergyIds)) {
        const activeZone = state.players?.[playerId]?.zones?.active || [];
        for (const id of payload.discardEnergyIds) {
          const card = activeZone.find(
            (c) => c.instanceId === id && c.attachedTo === active.instanceId
          );
          if (!card) {
            return { valid: false, error: 'stale_view' };
          }
        }
      }
      return { valid: true };
    }

    case 'promote': {
      const benchCard = state.players?.[playerId]?.zones?.bench?.find(
        (c) => c.instanceId === payload?.instanceId && !c.attachedTo
      );
      if (!benchCard) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    case 'takePrizes': {
      if (!state.players?.[playerId]) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    case 'takePrizesByIndex': {
      const prizes = state.players?.[playerId]?.zones?.prizes || [];
      if (
        !Array.isArray(payload?.indices) ||
        payload.indices.some(
          (idx) => !Number.isInteger(idx) || idx < 0 || idx >= prizes.length
        ) ||
        new Set(payload.indices).size !== payload.indices.length
      ) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    case 'playTrainer': {
      const cardRef = findCard(state, payload?.instanceId);
      if (
        !cardRef ||
        cardRef.zoneId !== 'hand' ||
        cardRef.playerId !== playerId
      ) {
        return { valid: false, error: 'stale_view' };
      }
      if (payload.targetInstanceId != null) {
        const targetRef = findCard(state, payload.targetInstanceId);
        if (
          !targetRef ||
          !['active', 'bench'].includes(targetRef.zoneId) ||
          targetRef.playerId !== playerId
        ) {
          return { valid: false, error: 'stale_view' };
        }
      }
      return { valid: true };
    }

    case 'useAbility': {
      const cardRef = findCard(state, payload?.instanceId);
      if (
        !cardRef ||
        !['active', 'bench'].includes(cardRef.zoneId) ||
        cardRef.playerId !== playerId
      ) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    // The VSTAR/GX marker is a per-player, per-game flag (App. 9/19), not a card action,
    // so it needs no card identity. When a caller does name a card, still verify it is
    // the player's and in play (legacy UI passes the active; the flag path may pass none).
    case 'useVStarGX': {
      if (payload?.instanceId == null) return { valid: true };
      const cardRef = findCard(state, payload.instanceId);
      if (
        !cardRef ||
        !['active', 'bench'].includes(cardRef.zoneId) ||
        cardRef.playerId !== playerId
      ) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    case 'stadium-effect': {
      if (!state.stadium) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    case 'resolveChoice': {
      if (!state.pendingChoice) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    // Zone ops (design 002 slice 3.4a): none of these carry a card instanceId (the legacy
    // actions never attached a cardHint), so position-addressed ops are bounds-checked
    // against the server's own zone array, the same pattern takePrizesByIndex already uses.
    case 'shuffleIntoDeck':
    case 'moveToDeckTop':
    case 'switchWithDeckTop': {
      const zone = state.players?.[playerId]?.zones?.[payload.from];
      if (!Array.isArray(zone) || !isZoneIndex(payload.index, zone)) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    // I19: reveal/hide only ever touches the sender's own zone (draft.players[playerId]).
    case 'revealShortcut':
    case 'hideShortcut': {
      const zone = state.players?.[playerId]?.zones?.[payload?.zoneId];
      if (!Array.isArray(zone) || !isZoneIndex(payload.index, zone)) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    case 'revealCards':
    case 'hideCards': {
      const zone = state.players?.[playerId]?.zones?.[payload?.zoneId];
      if (!Array.isArray(zone)) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    case 'playRandomCardFaceDown': {
      const hand = state.players?.[playerId]?.zones?.hand;
      if (!Array.isArray(hand) || hand.length === 0) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    default:
      return { valid: true };
  }
}

/**
 * Validates gameplay legality when rulesEnabled is true (Step 4).
 * Skipped completely when rulesEnabled === false (Hazard H6).
 *
 * @param {object} state
 * @param {object} command
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function validateLegality(state, command) {
  if (!state.rulesEnabled) {
    return { allowed: true };
  }

  const { type, payload, playerId } = command;
  const player = state.players?.[playerId];
  if (!player) {
    return { allowed: false, reason: 'Player not found in game' };
  }

  // Turn phase validation
  if (isGameFrozen(state)) {
    return { allowed: false, reason: 'Game is over.' };
  }
  if (type === 'setup') {
    if (state.turn?.phase !== 'setup') {
      return { allowed: false, reason: 'Game is already set up.' };
    }
    return { allowed: true };
  }
  if (type === 'loadDeck') {
    if (state.turn?.phase !== 'setup') {
      return {
        allowed: false,
        reason: 'Cannot load a deck after the game has started.',
      };
    }
    return { allowed: true };
  }
  // I26: card stats are reference data about the player's own cards, not a game action —
  // legal in any phase and on either player's turn, since TCGdex enrichment resolves
  // asynchronously and may land well after the game has started.
  if (type === 'cardStats') {
    return { allowed: true };
  }
  const isStartingActiveMove =
    type === 'moveCard' &&
    payload?.from === 'hand' &&
    payload?.to === 'active' &&
    (!state.players?.[playerId]?.zones?.active?.length || state.players?.[playerId]?.zones?.active?.length === 0);

  if (state.turn?.phase === 'setup' || state.turn?.number === 0) {
    if (isStartingActiveMove) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Set up the game first (Set Up button).' };
  }

  // Turn player validation
  if (
    [
      'attack',
      'retreat',
      'pass',
      'takeTurn',
      'moveCard',
      'attachCard',
      'draw',
      'playTrainer',
      'useAbility',
      'takePrizes',
      'takePrizesByIndex',
      'stadium-effect',
      'useVStarGX',
      // Audit B-2/B-2c: manual counters and conditions are the turn player's tools;
      // off-turn they let the opponent damage, heal or Paralyze at will.
      'addDamageCounter',
      'updateDamageCounter',
      'removeDamageCounter',
      'addSpecialCondition',
      'updateSpecialCondition',
      'removeSpecialCondition',
      // Audit A-7: deck-order mutations.
      'shuffleIntoDeck',
      'moveToDeckTop',
      'switchWithDeckTop',
      // Design 012: plays a card to the board like any other hand play.
      'playRandomCardFaceDown',
    ].includes(type)
  ) {
    if (state.turn?.player && state.turn.player !== playerId && !isStartingActiveMove) {
      return { allowed: false, reason: "It's not your turn." };
    }
  }

  if (state.turn?.phase === 'attack') {
    if (
      [
        'moveCard',
        'attachCard',
        'draw',
        'retreat',
        'attack',
        'playTrainer',
        'useAbility',
        'stadium-effect',
        'useVStarGX',
        'playRandomCardFaceDown',
      ].includes(type)
    ) {
      return {
        allowed: false,
        reason: 'You already attacked — end your turn.',
      };
    }
  }

  // A genuine tie (both boards empty) enters the `tiebreak` phase to resolve the
  // winner on the next Prize taken; it is a resolution prompt, not normal play,
  // so board actions are rejected until `takePrizes` or `pass` resolves it (1.2).
  // `pass`, `takeTurn` and `takePrizes` stay legal.
  if (
    state.turn?.phase === 'tiebreak' &&
    [
      'attack',
      'moveCard',
      'attachCard',
      'playTrainer',
      'useAbility',
    ].includes(type)
  ) {
    return { allowed: false, reason: 'tiebreak_pending' };
  }

  switch (type) {
    case 'draw': {
      const deck = player.zones?.deck || [];
      if (deck.length === 0) {
        // Edge Case 1: Empty deck draw rejected deck_empty
        return { allowed: false, reason: 'deck_empty' };
      }
      return { allowed: true };
    }

    case 'moveCard': {
      // Stadium zone validation
      if (payload.to === 'stadium') {
        const cardRef = findCard(state, payload.instanceId);
        if (cardRef && !isStadiumCard(cardRef.card)) {
          return { allowed: false, reason: 'invalid_stadium_target' };
        }
      }

      // Bench limit validation (Edge Case 9: bench full)
      if (payload.to === 'bench' && payload.from !== 'bench') {
        const bench = player.zones?.bench || [];
        const benchPokemonCount = bench.filter((c) => !c.attachedTo).length;
        if (benchPokemonCount >= 5) {
          return { allowed: false, reason: 'bench_full' };
        }
      }

      // Active zone validation
      if (payload.to === 'active' && payload.from !== 'active') {
        const active = player.zones?.active || [];
        const activePokemonCount = active.filter((c) => !c.attachedTo).length;
        if (activePokemonCount >= 1) {
          return { allowed: false, reason: 'active_occupied' };
        }
      }

      // Playing a Pokémon from hand is Basic-only. isBasicPokemon now rejects
      // V-UNION / Restored / BREAK (rulebook 30c 2.2/2.5); unknown-stage cards
      // still default to Basic so async-unenriched cards stay playable.
      if (
        payload.from === 'hand' &&
        (payload.to === 'bench' || payload.to === 'active')
      ) {
        const cardRef = findCard(state, payload.instanceId);
        if (cardRef && !isPokemon(cardRef.card)) {
          return {
            allowed: false,
            reason:
              'Only Pokémon can be played to the Bench or Active Spot. Items, Supporters, and Tools are played elsewhere.',
          };
        }
        if (cardRef && isPokemon(cardRef.card) && !isBasicPokemon(cardRef.card)) {
          return {
            allowed: false,
            reason: 'Only Basic Pokémon can be played from your hand.',
          };
        }
      }

      return { allowed: true };
    }

    case 'attachCard': {
      const cardRef = findCard(state, payload.instanceId);
      if (cardRef && isEnergy(cardRef.card)) {
        if (player.flags?.energyAttached) {
          // Check for unlimited energy acceleration abilities (Phase 4)
          const inPlayPokemon = [
            ...(player.zones?.active || []),
            ...(player.zones?.bench || []),
          ].filter((c) => !c.attachedTo && isPokemon(c));

          let acceleratorAllowed = false;
          const targetRef = findCard(state, payload.targetInstanceId);
          const targetPokemon = targetRef?.card;

          for (const p of inPlayPokemon) {
            const accel = parseUnlimitedHandEnergyAcceleration(p);
            if (!accel) continue;

            if (accel.energyType) {
              const cardEnergyType =
                cardRef.card.energyType ||
                cardRef.card.name?.replace(/\s*Energy.*/i, '');
              if (
                !cardEnergyType ||
                !cardEnergyType
                  .toLowerCase()
                  .includes(accel.energyType.toLowerCase())
              ) {
                continue;
              }
            }

            if (targetRef && targetPokemon) {
              if (accel.benchedOnly && targetRef.zoneId !== 'bench') {
                continue;
              }
              if (accel.noRuleBox && isRuleBoxPokemon(targetPokemon)) {
                continue;
              }
              if (accel.targetType) {
                const targetTypes = (targetPokemon.types || []).map((ty) =>
                  ty.toLowerCase()
                );
                if (!targetTypes.includes(accel.targetType.toLowerCase())) {
                  continue;
                }
              }
            }

            acceleratorAllowed = true;
            break;
          }

          if (!acceleratorAllowed) {
            return {
              allowed: false,
              reason: 'Energy already attached this turn.',
            };
          }
        }
      }
      if (cardRef && isPokemonToolCard(cardRef.card)) {
        const targetRef = findCard(state, payload.targetInstanceId);
        if (!targetRef || !isPokemon(targetRef.card)) {
          return {
            allowed: false,
            reason: 'Can only attach a Pokémon Tool to a Pokémon in play.',
          };
        }
        // Team Flare Hyper Gear is the exception that attaches to the
        // opponent's Pokémon-EX (App. 24) — enforce both halves here.
        if (isTeamFlareHyperGearCard(cardRef.card)) {
          if (targetRef.playerId === playerId || !isExCard(targetRef.card)) {
            return {
              allowed: false,
              reason:
                "Team Flare Hyper Gear must be attached to your opponent's Pokémon-EX.",
            };
          }
        }
        const targetZoneCards =
          targetRef.player?.zones?.[targetRef.zoneId] || [];
        const currentTools = attachedTools(targetRef.card, targetZoneCards);
        const maxTools = 1 + (parseToolCap(targetRef.card)?.extra || 0);
        if (currentTools.length >= maxTools) {
          return {
            allowed: false,
            reason: 'That Pokémon already has a Pokémon Tool attached.',
          };
        }
      }
      if (cardRef && isPokemon(cardRef.card)) {
        const targetRef = findCard(state, payload.targetInstanceId);
        if (!targetRef || !isPokemon(targetRef.card)) {
          return {
            allowed: false,
            reason: 'Can only evolve a Pokémon in play.',
          };
        }
        if ((state.turn?.number || 1) <= 2) {
          return { allowed: false, reason: "Can't evolve on the first turn." };
        }
        if (targetRef.card.enteredPlayTurn === state.turn?.number) {
          return {
            allowed: false,
            reason:
              "That Pokémon was just played this turn — it can't evolve yet.",
          };
        }
        if (player.flags?.evolved?.[payload.targetInstanceId]) {
          return {
            allowed: false,
            reason: 'Already evolved that Pokémon this turn.',
          };
        }
        const targetZoneCards =
          targetRef.player?.zones?.[targetRef.zoneId] || [];
        const topTarget = topPokemonCard(targetZoneCards, targetRef.card);
        const baseStage = normalizeStage(topTarget?.stage) || 'Basic';
        const evoStage = normalizeStage(cardRef.card.stage);
        if (!evoStage || evoStage === 'Basic') {
          return {
            allowed: false,
            reason: `${cardRef.card.name} is not an Evolution Pokémon.`,
          };
        }
        const order = ['Basic', 'Stage 1', 'Stage 2'];
        const baseIdx = order.indexOf(baseStage);
        const evoIdx = order.indexOf(evoStage);
        if (evoIdx !== baseIdx + 1) {
          return {
            allowed: false,
            reason: `${evoStage} can't evolve from ${baseStage} directly.`,
          };
        }
        if (
          cardRef.card.evolvesFrom &&
          !pokemonNamesMatch(cardRef.card.evolvesFrom, topTarget.name)
        ) {
          return {
            allowed: false,
            reason: `${cardRef.card.name} evolves from ${cardRef.card.evolvesFrom}, not ${topTarget.name}.`,
          };
        }
      }
      // Anything that is not Energy, a Pokémon Tool, or a Pokémon (evolution)
      // has no business attached to a Pokémon. Without this fallback an Item or
      // Supporter passed straight through to applyCommand and rode along as if
      // it were a Tool.
      if (
        cardRef &&
        !isEnergy(cardRef.card) &&
        !isPokemonToolCard(cardRef.card) &&
        !isPokemon(cardRef.card)
      ) {
        return {
          allowed: false,
          reason: 'Only Pokémon Tools and Energy can be attached to a Pokémon.',
        };
      }
      return { allowed: true };
    }

    case 'attack': {
      if (state.turn?.number === 1) {
        return {
          allowed: false,
          reason: "The player going first can't attack on turn 1.",
        };
      }
      if (player.flags?.attackerAttacked) {
        return { allowed: false, reason: 'Already attacked this turn.' };
      }
      const active = player.zones?.active?.find((c) => !c.attachedTo);
      if (!active) {
        return { allowed: false, reason: 'No active Pokémon to attack with.' };
      }
      if (active.specialCondition === 'Paralyzed') {
        return {
          allowed: false,
          reason: "Paralyzed — this Pokémon can't attack or retreat.",
        };
      }
      if (active.specialCondition === 'Asleep') {
        return {
          allowed: false,
          reason: "Asleep — this Pokémon can't attack or retreat.",
        };
      }
      const atkIdx = payload?.attackIndex ?? 0;
      const attacks = attackViewFor(state, active).attacks || [];
      const attack = attacks[atkIdx];
      // A stale or out-of-range index on a card the server knows attacks for
      // must not fall through every cost gate into a fabricated free attack.
      // An empty attack list is different: card stats have not synced yet, and
      // the apply case's flat fallback is the documented behavior there.
      if (attacks.length > 0 && !attack) {
        return { allowed: false, reason: 'Unknown attack.' };
      }
      // App. 19: one GX attack per player per game. The flag is game-scoped, so this is
      // the cross-turn gate that `attackerAttacked` (per-turn) cannot provide. Share the
      // `useVStarGX` guard so a legacy state whose marker lives on `flags` also blocks it.
      if (isGxAttack(attack) && oncePerGameUsed(player, 'gx')) {
        return {
          allowed: false,
          reason: 'Only one GX attack can be used per game.',
        };
      }
      if (
        active.cannotAttackUntilTurn &&
        active.cannotAttackUntilTurn >= (state.turn?.number || 1)
      ) {
        const attackName = String(
          payload.attackName || attack?.name || ''
        ).trim();
        const lockedName = String(active.cannotAttackAttackName || '').trim();
        if (
          !lockedName ||
          attackName.toLowerCase() === lockedName.toLowerCase()
        ) {
          return {
            allowed: false,
            reason: lockedName
              ? `This Pokémon can't use ${active.cannotAttackAttackName} during this turn.`
              : "This Pokémon can't attack during this turn.",
          };
        }
      }
      if (attack?.cost?.length > 0) {
        const activeZoneCards = player.zones?.active || [];
        const attached = activeZoneCards.filter(
          (c) => c.attachedTo === active.instanceId && isEnergy(c)
        );
        const stadiumCard = state.stadium?.card || state.stadium || null;
        const stadiumUser =
          state.stadium?.user ??
          state.stadium?.playedBy ??
          stadiumCard?.ownerId ??
          null;
        const energyContext = {
          stadiumCard,
          hostPokemon: inPlayView(state, active),
        };
        const energyEntries = expandEnergyEntries(
          attached.map((c) => serverEnergyDescriptor(c, energyContext))
        );
        // Cost modifiers must be priced exactly as the client and the attack
        // preview price them: passive ability/Tool discounts plus a Stadium
        // cost modifier, then Nighttime Mine-style increases. Checking the raw
        // printed cost rejected legally payable attacks.
        const activeView = inPlayView(state, active);
        const blockTools = isStadiumToolNegation(stadiumCard);
        let discount = passiveCostDiscount(activeView);
        if (!blockTools) {
          discount += attachedTools(active, activeZoneCards).reduce(
            (sum, tool) => sum + passiveCostDiscount(tool),
            0
          );
        }
        if (stadiumCard) discount += parseStadiumCostModifier(stadiumCard);
        let effectiveCost = attack.cost;
        if (discount > 0 && effectiveCost.length > 0) {
          effectiveCost = applyCostDiscount(effectiveCost, discount);
        }
        const increase = getStadiumAttackCostIncreaseFor(
          activeView,
          playerId,
          stadiumCard,
          stadiumUser
        );
        if (increase > 0) {
          effectiveCost = [
            ...effectiveCost,
            ...Array(increase).fill('Colorless'),
          ];
        }
        if (!canPayAttackCost(energyEntries, effectiveCost)) {
          return { allowed: false, reason: 'Not enough energy attached.' };
        }
      }
      return { allowed: true };
    }

    case 'retreat': {
      if (player.flags?.attackerAttacked) {
        return { allowed: false, reason: "Can't retreat after attacking." };
      }
      if (player.flags?.retreatedThisTurn) {
        return { allowed: false, reason: 'Already retreated this turn.' };
      }
      const active = player.zones?.active?.find((c) => !c.attachedTo);
      if (!active) {
        return { allowed: false, reason: 'No active Pokémon to retreat.' };
      }
      if (active.specialCondition === 'Paralyzed') {
        return {
          allowed: false,
          reason: "Paralyzed — this Pokémon can't retreat.",
        };
      }
      if (active.specialCondition === 'Asleep') {
        return {
          allowed: false,
          reason: "Asleep — this Pokémon can't retreat.",
        };
      }
      if (
        active.cannotRetreatUntilTurn &&
        active.cannotRetreatUntilTurn >= (state.turn?.number || 1)
      ) {
        return {
          allowed: false,
          reason: "The Defending Pokémon can't retreat.",
        };
      }
      if (isStadiumRetreatPrevention(state.stadium?.card || state.stadium)) {
        const stadiumUser = state.stadium?.user ?? state.stadium?.playedBy;
        if (playerId !== stadiumUser) {
          return { allowed: false, reason: 'Stadium prevents retreating.' };
        }
      }
      const benchPokemon = (player.zones?.bench || []).filter(
        (c) => !c.attachedTo
      );
      if (benchPokemon.length === 0) {
        return { allowed: false, reason: 'No bench Pokémon to retreat to.' };
      }
      const retreatCostN = computeEffectiveRetreatCost(state, active, playerId);
      const chosenIds = Array.isArray(payload?.discardEnergyIds)
        ? payload.discardEnergyIds
        : [];
      if (new Set(chosenIds).size !== chosenIds.length) {
        return {
          allowed: false,
          reason: 'Duplicate Energy chosen to discard.',
        };
      }
      if (retreatCostN > 0) {
        // Audit B-4: an explicit discard list is what gets paid, so it — not every
        // attached Energy — is what must cover the cost.
        const attached = (player.zones?.active || []).filter(
          (c) =>
            c.attachedTo === active.instanceId &&
            isEnergy(c) &&
            (chosenIds.length === 0 || chosenIds.includes(c.instanceId))
        );
        if (attached.length !== chosenIds.length && chosenIds.length > 0) {
          return {
            allowed: false,
            reason: 'Only attached Energy can be discarded to retreat.',
          };
        }
        const costSymbols = new Array(retreatCostN).fill('Colorless');
        const energyContext = {
          stadiumCard: state.stadium?.card || state.stadium || null,
          hostPokemon: inPlayView(state, active),
        };
        if (
          !canPayAttackCost(
            expandEnergyEntries(
              attached.map((c) => serverEnergyDescriptor(c, energyContext))
            ),
            costSymbols
          )
        ) {
          return {
            allowed: false,
            reason: `Not enough energy to retreat (costs ${retreatCostN}).`,
          };
        }
      }
      return { allowed: true };
    }

    case 'promote': {
      const activePokemon = (player.zones?.active || []).filter(
        (c) => !c.attachedTo
      );
      if (activePokemon.length > 0) {
        return {
          allowed: false,
          reason: 'Active position is already occupied.',
        };
      }
      return { allowed: true };
    }

    case 'takePrizes': {
      const count = payload?.count ?? 1;
      const owed = player.flags?.prizesOwed || 0;
      if (!Number.isInteger(count) || count < 1) {
        return { allowed: false, reason: 'Invalid prize count.' };
      }
      if (count > owed && !tiebreakActive(state)) {
        return {
          allowed: false,
          reason: 'No Knockout has awarded you that many prize cards.',
        };
      }
      if ((player.zones?.prizes?.length || 0) < count) {
        return { allowed: false, reason: 'Not enough prize cards left.' };
      }
      return { allowed: true };
    }

    case 'takePrizesByIndex': {
      const count = payload?.indices?.length || 0;
      if (count > (player.flags?.prizesOwed || 0) && !tiebreakActive(state)) {
        return {
          allowed: false,
          reason: 'No Knockout has awarded you that many prize cards.',
        };
      }
      if ((player.zones?.prizes?.length || 0) < count) {
        return { allowed: false, reason: 'Not enough prize cards left.' };
      }
      return { allowed: true };
    }

    case 'playTrainer': {
      const cardRef = findCard(state, payload.instanceId);
      if (cardRef) {
        const typeStr = String(cardRef.card.type || '').toLowerCase();
        const subStr =
          `${cardRef.card.subtypes || ''} ${cardRef.card.trainerType || ''}`.toLowerCase();
        const isSupporter =
          typeStr.includes('supporter') || subStr.includes('supporter');
        if (isSupporter && player.flags?.supporterPlayed) {
          return {
            allowed: false,
            reason: 'Supporter already played this turn.',
          };
        }

        const opponent = Object.values(state.players || {}).find(
          (p) => p.playerId !== playerId
        );
        const blockReason = trainerPlayBlockReason({
          card: cardRef.card,
          turnNumber: state.turn?.number ?? 0,
          myPrizes: (player.zones?.prizes || []).length,
          opponentPrizes: (opponent?.zones?.prizes || []).length,
          stadiumName: state.stadium?.name || null,
          stadiumPlayedThisTurn: Boolean(player.flags?.stadiumPlayedThisTurn),
          handCount: (player.zones?.hand || []).length,
          benchCount: (player.zones?.bench || []).filter((c) => !c.attachedTo)
            .length,
          opponentBenchCount: (opponent?.zones?.bench || []).filter(
            (c) => !c.attachedTo
          ).length,
          ...trainerTargetCounts(
            player,
            ownedCards(player),
            state.turn?.number
          ),
        });
        if (blockReason) return { allowed: false, reason: blockReason };
      }
      return { allowed: true };
    }

    case 'useAbility': {
      const cardRef = findCard(state, payload.instanceId);
      if (cardRef) {
        if (
          cardRef.card.abilityUsed ||
          player.flags?.abilitiesUsed?.[cardRef.card.name] ||
          player.flags?.abilitiesUsed?.[cardRef.card.instanceId]
        ) {
          return { allowed: false, reason: 'Ability already used this turn.' };
        }
        // Passives and automatic triggers resolve through their own hooks; running them from
        // the ability button placed thorns counters or searched KO-trigger decks at will (I94).
        if (!isActivatedAbility(cardRef.card, payload?.abilityIndex ?? 0)) {
          return { allowed: false, reason: "This Ability can't be activated; it works on its own." };
        }
        // "Have no Abilities" Stadiums (Team Rocket's Watchtower, Space Center,
        // Battle Frontier) suppress abilities server-side too; previously the
        // block existed only in the legacy client executors.
        if (
          stadiumAbilityBlockedFor(
            inPlayView(state, cardRef.card),
            state.stadium?.card || state.stadium || null
          )
        ) {
          return {
            allowed: false,
            reason: "This Pokémon's Ability is blocked by the Stadium in play.",
          };
        }
        // An ability printed as a conditional on this Pokémon's position cannot be activated from
        // the Bench. The inspector already greys the panel, so this catches a stale or crafted
        // click that never went through it.
        if (requiresKoOnOpponentTurn(cardRef.card) && !player.flags?.koedLastOppTurn) {
          return {
            allowed: false,
            reason:
              "None of your Pokémon were Knocked Out during your opponent's last turn.",
          };
        }
        if (cardRef.zoneId !== 'active' && requiresActiveSpot(cardRef.card)) {
          return {
            allowed: false,
            reason: 'This ability can only be used from the Active Spot.',
          };
        }
        // "When you play this Pokémon from your hand to evolve" (Primarina
        // Enriching Melody) is a one-shot trigger, legal only on the turn that
        // Pokémon evolved. enteredPlayTurn is stamped on evolve.
        if (
          isEvolvePlayedTrigger(cardRef.card) &&
          cardRef.card.enteredPlayTurn !== state.turn?.number
        ) {
          return {
            allowed: false,
            reason: 'This ability can only be used the turn it evolved.',
          };
        }
        if (
          isBenchPlayedTrigger(cardRef.card) &&
          (cardRef.zoneId !== 'bench' ||
            cardRef.card.playedToBenchTurn !== state.turn?.number)
        ) {
          return {
            allowed: false,
            reason:
              "This ability only works the turn it's played from hand to the Bench.",
          };
        }
      }
      return { allowed: true };
    }

    case 'stadium-effect': {
      // Ultimate Zone / Saffron City Gym / Celadon City Gym are "as often as …
      // likes" actions, so a prior activation must not block a repeat.
      if (
        player.flags?.stadiumUsedThisTurn &&
        !isRepeatableStadiumAction(state.stadium?.card || state.stadium)
      ) {
        return {
          allowed: false,
          reason: 'Stadium effect already used this turn.',
        };
      }
      if (state.stadium) {
        const opt = parseStadiumOncePerTurn(state.stadium);
        if (opt?.kind === 'search-bench') {
          const bench = player.zones?.bench || [];
          const benchPokemonCount = bench.filter((c) => !c.attachedTo).length;
          if (benchPokemonCount >= 5) {
            return { allowed: false, reason: 'bench_full' };
          }
        }
      }
      return { allowed: true };
    }

    case 'useVStarGX': {
      // Independent once-per-game limits (App. 9/19): the VSTAR Power and the GX
      // attack do not consume each other's allowance. `kind` is inferred from the
      // source card when the sender omits it; a null kind is the legacy fallback
      // (no discriminator and no classifiable card), which checks both allowances.
      const kind = effectiveOncePerGameKind(state, command);
      if (oncePerGameUsed(player, kind)) {
        return {
          allowed: false,
          reason:
            kind === 'gx'
              ? 'Only one GX attack can be used per game.'
              : kind === 'vstar'
                ? 'VSTAR Power already used this game.'
                : 'VSTAR / GX attack or ability already used this game.',
        };
      }
      return { allowed: true };
    }

    default:
      return { allowed: true };
  }
}

/**
 * Which once-per-game allowance a `useVStarGX` command spends: the explicit
 * `payload.kind` when the sender provides it, otherwise the source card's
 * subtype (a VSTAR Power vs a GX attack). Returns null when neither is
 * establishable, in which case the legacy both-flags behaviour applies.
 */
function effectiveOncePerGameKind(state, command) {
  const kind = command?.payload?.kind;
  if (kind === 'vstar' || kind === 'gx') return kind;
  const card = findCard(state, command?.payload?.instanceId)?.card;
  if (isVstarCard(card)) return 'vstar';
  if (isGxCard(card)) return 'gx';
  return null;
}

function oncePerGameUsed(player, kind) {
  const used = player?.oncePerGame || player?.flags || {};
  if (kind === 'vstar') return Boolean(used.vstarUsed);
  if (kind === 'gx') return Boolean(used.gxUsed);
  return Boolean(used.vstarUsed || used.gxUsed);
}

/**
 * Whether the game is in a sudden-death tiebreaker where the first Prize card
 * taken wins: either the detected draw's `tiebreak` phase or a fresh tiebreak
 * game flagged by `setupGame({ firstPrizeWins: true })`.
 */
function tiebreakActive(state) {
  return state?.turn?.phase === 'tiebreak' || state?.firstPrizeWins === true;
}

/**
 * The client plays an Item or Supporter by dropping it hand -> 'board', which it sends as a
 * plain moveCard (it has no reliable card type at the drop site). Rewriting that move to
 * playTrainer here, from the server's own card data, is what makes the effect run; deciding
 * it server-side also means a client cannot place a Trainer while skipping its effect.
 * A Tool dropped on the board asks which Pokémon to attach to; a Stadium goes to the Stadium zone.
 *
 * @param {object} state GameState
 * @param {object} command Shape-valid command envelope
 * @returns {object} The playTrainer command, or the original command unchanged
 */
function trainerEffectText(card) {
  return String(card.text || card.effect || card.cardText || '').trim();
}

function promoteTrainerPlay(state, command) {
  if (!state.rulesEnabled) return command;
  const { type, payload, playerId } = command;
  if (
    type !== 'moveCard' ||
    payload.from !== 'hand' ||
    payload.to !== 'board'
  ) {
    return command;
  }
  const cardRef = findCard(state, payload.instanceId);
  if (!cardRef || cardRef.zoneId !== 'hand' || cardRef.playerId !== playerId) {
    return command;
  }
  const card = cardRef.card;
  const kind =
    `${card.type || ''} ${card.trainerType || ''} ${card.subtypes || ''}`.toLowerCase();
  if (!isTrainer(card) && !/item|supporter/.test(kind)) return command;
  // Effect text arrives later via cardStats. Until it does, playTrainer would find no steps
  // and discard the card, so reject the drop until cardStats arrives. A Tool or Stadium
  // needs no text: playTrainer attaches the Tool or places the Stadium.
  if (!/tool|stadium/.test(kind) && !trainerEffectText(card)) {
    return { ...command, pendingDataReason: 'card_data_pending' };
  }
  return {
    ...command,
    type: 'playTrainer',
    payload: { instanceId: payload.instanceId },
  };
}

/**
 * Builds the attack deck-search PendingChoice for the first stage (at or after
 * `fromIndex`) that has at least one legal card in the deck. A staged
 * `searchDeckSequence` is walked one stage per choice so each stage keeps its
 * own filter; collapsing the stages into one list previously left `what`
 * undefined and offered the entire deck. Returns null when no stage matches.
 *
 * @param {object} draft
 * @param {{ playerId: string, oppId: string, attackerId?: number, stages: object[], fromIndex?: number }} params
 * @returns {object|null}
 */
function buildAttackSearchChoice(
  draft,
  { playerId, oppId, attackerId, stages, fromIndex = 0 }
) {
  const player = draft.players[playerId];
  const deck = player?.zones?.deck || [];
  for (let i = fromIndex; i < stages.length; i++) {
    const stage = stages[i] || {};
    const what = stage.what || 'card';
    const dest = stage.destination || 'hand';
    const matches = deck.filter((c) => matchesSearch(c, what));
    if (matches.length === 0) continue;

    let maxCount = stage.count || 1;
    if (dest === 'bench') {
      const benchCount = (player.zones.bench || []).filter(
        (c) => !c.attachedTo
      ).length;
      maxCount = Math.min(maxCount, Math.max(0, 5 - benchCount));
    }
    if (maxCount <= 0) continue;

    return createPendingChoice({
      player: playerId,
      source: 'attack',
      prompt: `Search your deck for up to ${Math.min(maxCount, matches.length)} ${what}.`,
      // src is required for the client's card picker: apply-view's
      // openChoiceInCardPicker only uses the carousel when every option carries
      // art, otherwise it falls back to the face-down grid modal.
      options: matches.map((c) => ({
        instanceId: c.instanceId,
        name: c.name,
        src: c.src || '',
        type: c.type || '',
      })),
      min: 0,
      max: Math.min(maxCount, matches.length),
      resumeToken: {
        effectType: 'attack',
        initiatorPlayerId: playerId,
        oppId,
        attackerId,
        searchStages: stages,
        searchStageIndex: i,
      },
    });
  }
  return null;
}

/**
 * Pure and total command reducer.
 *
 * @param {object} state GameState
 * @param {object} command Command envelope { type, payload, playerId, clientSeq }
 * @param {object} [rng] Optional seeded PRNG
 * @returns {{
 *   state: object,
 *   events: object[],
 *   pendingChoice: object|null,
 *   error?: string|null,
 *   reason?: string
 * }}
 */
/**
 * Energy a discard-to-scale attack may discard (Inferno X, Garland Ray,
 * Gholdengo ex): the attached Energy on the Pokémon the printed text names, or
 * the Energy cards in hand, filtered by printed type ({R}) and "basic".
 *
 * @param {object} draft
 * @param {{ playerId: string, attacker: object|null, scaling: object }} params
 * @returns {object[]} Attached Energy cards, in board order
 */
function discardScalingCandidates(draft, { playerId, attacker, scaling }) {
  const player = draft.players[playerId];
  if (!player || !attacker) return [];
  const stadiumCard = draft.stadium?.card || draft.stadium || null;
  const matchesFilter = (card, hostPokemon) => {
    if (!isEnergy(card)) return false;
    if (
      scaling.name &&
      !String(card.name || '').toLowerCase().includes(scaling.name.toLowerCase())
    ) {
      return false;
    }
    if (scaling.basicOnly && !isBasicEnergy(card)) return false;
    if (!scaling.energyType) return true;
    const provided = serverEnergyDescriptor(card, { stadiumCard, hostPokemon });
    return (
      provided.type === scaling.energyType ||
      provided.dualType === scaling.energyType
    );
  };
  if (scaling.source === 'hand') {
    return (player.zones?.hand || []).filter((c) => matchesFilter(c, null));
  }
  const zoneIds =
    scaling.source === 'self'
      ? ['active']
      : scaling.source === 'bench'
        ? ['bench']
        : ['active', 'bench'];
  const candidates = [];
  for (const zoneId of zoneIds) {
    const zone = player.zones?.[zoneId] || [];
    for (const host of zone.filter((c) => !c.attachedTo && isPokemon(c))) {
      if (scaling.source === 'self' && host.instanceId !== attacker.instanceId) {
        continue;
      }
      const hostView = inPlayView(draft, host);
      for (const card of zone) {
        if (card.attachedTo !== host.instanceId) continue;
        if (matchesFilter(card, hostView)) candidates.push(card);
      }
    }
  }
  return candidates;
}

/**
 * Discards the chosen attached Energy for a discard-to-scale attack and returns
 * how many were actually discarded (ids outside `allowedIds` are ignored).
 */
function discardScalingEnergy(draft, { playerId, selection, allowedIds, events }) {
  const player = draft.players[playerId];
  let discarded = 0;
  for (const id of new Set(selection || [])) {
    if (!allowedIds.includes(id)) continue;
    const ref = findCard(draft, id);
    if (!ref || ref.playerId !== playerId) continue;
    const zone = player.zones[ref.zoneId];
    const idx = zone.findIndex((c) => c.instanceId === id);
    if (idx < 0) continue;
    const [card] = zone.splice(idx, 1);
    card.attachedTo = null;
    const to = discardCardToPlayerZone(player, card);
    events.push({
      type: 'cardMoved',
      instanceId: id,
      from: ref.zoneId,
      to,
      playerId,
      reason: 'attack-energy-discard',
    });
    discarded++;
  }
  return discarded;
}

/** True when a discarded deck card is the kind a deck-mill attack counts. */
function millFilterMatches(card, filter) {
  if (!card) return false;
  switch (filter.kind) {
    case 'any':
      return true;
    case 'energy': {
      if (!isEnergy(card)) return false;
      if (filter.basicOnly && !isBasicEnergy(card)) return false;
      if (!filter.energyType) return true;
      const provided = serverEnergyDescriptor(card);
      return (
        provided.type === filter.energyType ||
        provided.dualType === filter.energyType
      );
    }
    case 'pokemon':
      return isPokemon(card);
    case 'supporter':
      return /supporter/i.test(
        `${card.trainerType || ''} ${[].concat(card.subtypes || []).join(' ')}`
      );
    default:
      return String(card.name || '')
        .toLowerCase()
        .includes(String(filter.name || '').toLowerCase());
  }
}

/**
 * Discards from the top of the deck(s) a deck-mill attack names and returns
 * the instanceIds of the discarded cards that match its counted kind.
 */
function millDecksForAttack(draft, { playerId, oppId, mill, count, events }) {
  const playerIds = mill.players === 'each' ? [playerId, oppId] : [playerId];
  const matchedIds = [];
  for (const id of playerIds) {
    const player = draft.players[id];
    const deck = player?.zones?.deck;
    if (!Array.isArray(deck)) continue;
    const toMill =
      mill.keep !== null
        ? Math.max(0, deck.length - mill.keep)
        : Math.min(Math.max(0, count), deck.length);
    for (const card of deck.splice(0, toMill)) {
      if (millFilterMatches(card, mill.filter)) matchedIds.push(card.instanceId);
      const to = discardCardToPlayerZone(player, card);
      events.push({
        type: 'cardMoved',
        instanceId: card.instanceId,
        from: 'deck',
        to,
        playerId: id,
        reason: 'attack-mill',
      });
    }
  }
  return matchedIds;
}

/** Moves milled cards still in the discard pile onto `root` (Raikou). */
/**
 * Raises the next "which Benched Pokémon gets an Energy" pick for a spread attach
 * (Aura Jab). Returns false — no choice raised — when nothing is left to attach or
 * no Benched Pokémon exists.
 */
function raiseSpreadAttachChoice(draft, { playerId, attackName, spread, remaining, token }) {
  const player = draft.players[playerId];
  const hasEnergy = (player?.zones?.discard || []).some((c) => matchesSearch(c, spread.search));
  const benched = (player?.zones?.bench || []).filter((c) => !c.attachedTo && isPokemon(c));
  if (remaining <= 0 || !hasEnergy || benched.length === 0) return false;
  draft.pendingChoice = createPendingChoice({
    player: playerId,
    source: 'attack',
    prompt: `${attackName}: choose a Benched Pokémon for a ${spread.search} card (${remaining} left, none to stop)`,
    options: benched,
    min: 0,
    max: 1,
    resumeToken: { ...token, remaining, spread },
  });
  return true;
}

function attachMilledCards(player, cardIds, root, events) {
  for (const id of cardIds) {
    const card = (player.zones.discard || []).find((c) => c.instanceId === id);
    if (card) attachToRoot(player, card, root, events);
  }
}

/**
 * Energy cards attached to `attacker` that satisfy the printed return-energy
 * type (Mega Greninja ex — Ninja Spinner). A null type matches any Energy.
 */
function attachedEnergyCardsFor(draft, playerId, attacker, energyType) {
  if (!attacker) return [];
  const player = draft.players[playerId];
  const attached = [
    ...(player?.zones?.active || []),
    ...(player?.zones?.bench || []),
  ].filter((c) => c.attachedTo === attacker.instanceId && isEnergy(c));
  if (!energyType) return attached;
  return attached.filter((c) => matchesSearch(c, `${energyType} Energy`));
}

/**
 * Moves one attached Energy card (of `energyType`, or any when null) from the
 * attacker to its owner's hand. Returns true when a card moved. Used by the
 * optional return-energy-for-damage attack (Mega Greninja ex — Ninja Spinner).
 */
function moveAttachedEnergyToHand(draft, { playerId, attacker, energyType, events }) {
  const player = draft.players[playerId];
  if (!player?.zones || !attacker) return false;
  for (const zoneKey of ['active', 'bench']) {
    const zone = player.zones[zoneKey];
    if (!Array.isArray(zone)) continue;
    const idx = zone.findIndex(
      (c) =>
        c.attachedTo === attacker.instanceId &&
        isEnergy(c) &&
        (!energyType || matchesSearch(c, `${energyType} Energy`))
    );
    if (idx === -1) continue;
    const [card] = zone.splice(idx, 1);
    card.attachedTo = null;
    player.zones.hand.push(card);
    events.push({
      type: 'cardMoved',
      instanceId: card.instanceId,
      from: zoneKey,
      to: 'hand',
      playerId,
      reason: 'attack-return-energy',
    });
    return true;
  }
  return false;
}

/** Shuffles a player's deck with the command RNG (no-op without one). */
function shuffleDeckWithRng(player, rng) {
  if (player?.zones?.deck && rng) player.zones.deck = rng.shuffle(player.zones.deck);
}

/**
 * Rebuilds the attack context an attack-phase PendingChoice suspended, from its
 * resumeToken. Returns null when the attacker or attack is no longer in play.
 */
function attackResumeContext(draft, token, { activeRng, events }) {
  const playerId = token.initiatorPlayerId;
  const attackerPlayer = draft.players[playerId];
  const attacker = attackerPlayer?.zones?.active?.find(
    (c) => !c.attachedTo && c.instanceId === token.attackerId
  );
  if (!attacker) return null;
  const attackerView = attackViewFor(draft, attacker);
  const attack = attackerView?.attacks?.find((a) => a?.name === token.attackName);
  if (!attack) return null;
  const oppId = Object.keys(draft.players || {}).find((id) => id !== playerId);
  let defender = null;
  let defenderPlayerId = oppId;
  if (token.targetInstanceId != null) {
    const targetRef = findCard(draft, token.targetInstanceId);
    defender = targetRef?.card || null;
    if (targetRef?.playerId) defenderPlayerId = targetRef.playerId;
  }
  const { coin = null, headsCount, flips = [] } = token.coinResult || {};
  return {
    playerId,
    activeRng,
    events,
    attacker,
    defender,
    defenderPlayerId,
    oppId,
    attack,
    attackerPlayer,
    attackerView,
    coin,
    headsCount,
    flips,
    milledMatches: token.milledMatches,
  };
}

/**
 * "Put this Pokémon and all attached cards into your hand." (Meowth ex / Tuck
 * Tail). Runs after damage; the emptied Active is refilled by the command-tail
 * promotion, and a player left with no Pokémon in play loses.
 */
function returnAttackerToHand(draft, { playerId, attacker, oppId, events }) {
  const player = draft.players[playerId];
  const active = player?.zones?.active || [];
  if (!attacker || !active.some((c) => c.instanceId === attacker.instanceId)) {
    return;
  }
  for (let i = active.length - 1; i >= 0; i--) {
    const card = active[i];
    if (card.instanceId !== attacker.instanceId && card.attachedTo !== attacker.instanceId) {
      continue;
    }
    active.splice(i, 1);
    card.attachedTo = null;
    card.damage = 0;
    clearConditions(card);
    player.zones.hand.push(card);
  }
  events.push({
    type: 'cardMoved',
    instanceId: attacker.instanceId,
    from: 'active',
    to: 'hand',
    playerId,
    reason: 'attack-return-self',
  });
  const benchRoots = (player.zones.bench || []).filter(
    (c) => !c.attachedTo && isPokemon(c)
  );
  if (benchRoots.length > 0) {
    player.promotionPending = true;
  } else {
    setGameEnded(draft, { winner: oppId, reason: 'no Pokémon in play', events });
  }
}

/**
 * The attack's printed clauses that run as executor steps (design 030), with the attack's
 * own coin result applied: "If heads/tails" steps are dropped on the other face and
 * "For each heads" steps scale their count by the heads flipped.
 */
function planAttackSteps(attack, attacker, { coin, headsCount }) {
  const parsed = parseAttackSteps(attack?.text, { selfName: attacker?.name });
  const resolve = (steps) =>
    resolveCoinGates(steps, { coin, headsCount }).map((step) => ({
      ...step,
      attackName: attack?.name || 'Attack',
    }));
  return {
    before: resolve(parsed.before),
    after: resolve(parsed.after),
    handlesSearch: parsed.handlesSearch,
    // Printed step kinds before the coin gates, so a helper can stand down for a clause
    // the steps own even when the coin dropped it.
    printed: new Set([...parsed.before, ...parsed.after].map((step) => step.type)),
  };
}

/**
 * A step that took the attacker out of play (shuffle into the deck) leaves its Active Spot
 * empty: promote from the Bench, or lose with no Pokémon left in play.
 */
function settleVacatedActive(draft, { playerId, oppId, events }) {
  const player = draft.players[playerId];
  if (!player || (player.zones.active || []).some((c) => !c.attachedTo && isPokemon(c))) return;
  const benchRoots = (player.zones.bench || []).filter((c) => !c.attachedTo && isPokemon(c));
  if (benchRoots.length > 0) {
    player.promotionPending = true;
  } else if (!isGameConcluded(draft)) {
    setGameEnded(draft, { winner: oppId, reason: 'no Pokémon in play', events });
  }
}

/**
 * Runs (or resumes) attack steps through the shared executor. Knock Outs the steps caused
 * are resolved immediately so they count before the turn ends. Returns false while a
 * choice is pending — the `attackSteps` resume continues from the token.
 */
function runAttackSteps(
  draft,
  { steps, fromStepIndex = 0, attackerId, playerId, oppId, activeRng, events, selection = null, context, budget }
) {
  const attacker = attackerId != null ? findCard(draft, attackerId)?.card : null;
  const result = executeSteps(draft, {
    steps,
    fromStepIndex,
    effectType: 'attackSteps',
    sourceCard: attacker || (attackerId != null ? { instanceId: attackerId } : null),
    playerId,
    activeRng,
    events,
    selection,
    context,
    budget,
  });
  resolveDamageCounterKnockouts(draft, { events });
  settleVacatedActive(draft, { playerId, oppId, events });
  if (result.pendingChoice && !isGameConcluded(draft)) {
    draft.pendingChoice = result.pendingChoice;
    return false;
  }
  return true;
}

/**
 * Resolves the part of an attack that runs after its coins are flipped:
 * printed-text damage, recoil, status, bench/spread damage, searches, and the
 * terminal checkup/turn hand-off. Extracted so Glimwood Tangle can re-enter it
 * with a fresh (or kept) coin result without re-running the confusion check.
 *
 * @param {object} draft Cloned GameState
 * @param {object} ctx Derived attack context (see the call site)
 */
function resolveAttackEffectPhase(draft, ctx) {
  const {
    playerId,
    activeRng,
    events,
    attacker,
    defenderPlayerId,
    oppId,
    attack,
    attackerPlayer,
    attackerView,
    coin,
    headsCount,
    flips,
  } = ctx;

  let { defender } = ctx;

  // Marks that an attack's effect phase is resolving so on-discard reattach
  // triggers (Boomerang/Burning) fire only for attack-driven discards. Cleared
  // in the applyCommand tail.
  draft.__attackEffectPhase = true;

  const resumeBase = {
    initiatorPlayerId: playerId,
    attackName: attack.name,
    attackerId: attacker?.instanceId ?? null,
    targetInstanceId: defender?.instanceId ?? null,
    coinResult: { coin, headsCount, flips },
  };

  // Deck mill: discard from the top of the deck(s) before damage, counting the
  // printed kind. "Up to N" / "you may" first ask how many (option id = count + 1).
  let milledMatches = ctx.milledMatches;
  let milledIds = [];
  const mill = deckMillScaling(attack?.text);
  if (mill?.lookAndChoose && milledMatches === undefined) {
    // Palossand-GX: pick the counted kind from the top N of the opponent's deck.
    const oppPlayer = draft.players[oppId];
    const looked = (oppPlayer?.zones?.deck || []).slice(0, mill.count);
    const options = looked.filter((c) => millFilterMatches(c, mill.filter));
    if (options.length > 0) {
      draft.pendingChoice = createPendingChoice({
        player: playerId,
        source: 'attack',
        prompt: `${attack.name}: discard any number of these cards from your opponent's deck (${mill.perUnit} damage each).`,
        options: options.map((c) => ({
          instanceId: c.instanceId,
          name: c.name,
          src: c.src || '',
          type: c.type || '',
        })),
        min: 0,
        max: options.length,
        resumeToken: {
          ...resumeBase,
          effectType: 'attackMillPick',
          allowedIds: options.map((c) => c.instanceId),
        },
      });
      return;
    }
    shuffleDeckWithRng(oppPlayer, activeRng);
    milledMatches = 0;
  } else if (mill && milledMatches === undefined) {
    const deckSize = draft.players[playerId]?.zones?.deck?.length || 0;
    let millCount = ctx.millCount ?? mill.count;
    if (ctx.millCount === undefined && (mill.upTo || mill.optional) && deckSize > 0) {
      const counts = mill.upTo
        ? Array.from({ length: Math.min(mill.count, deckSize) + 1 }, (_, k) => k)
        : [0, mill.count];
      draft.pendingChoice = createPendingChoice({
        player: playerId,
        source: 'attack',
        prompt: `${attack.name}: how many cards to discard from the top of the deck?`,
        options: counts.map((k) => ({
          instanceId: k + 1,
          name: k === 0 ? "Don't discard" : `Discard ${k}`,
          type: 'option',
        })),
        min: 1,
        max: 1,
        resumeToken: { ...resumeBase, effectType: 'attackMillCount' },
      });
      return;
    }
    milledIds = millDecksForAttack(draft, {
      playerId,
      oppId,
      mill,
      count: millCount,
      events,
    });
    milledMatches = milledIds.length;
  }

  // Discard-to-scale: the player picks which Energy to discard before damage.
  let energyDiscarded = ctx.energyDiscarded;
  const discardScaling = discardEnergyScaling(attack?.text);
  if (discardScaling && energyDiscarded === undefined) {
    const candidates = discardScalingCandidates(draft, {
      playerId,
      attacker,
      scaling: discardScaling,
    });
    const max = Math.min(discardScaling.max, candidates.length);
    if (max > 0) {
      draft.pendingChoice = createPendingChoice({
        player: playerId,
        source: 'attack',
        prompt: `${attack.name}: choose Energy to discard (${attack.damage || 0} damage each).`,
        options: candidates.map((c) => ({
          instanceId: c.instanceId,
          name: c.name,
          src: c.src || '',
          type: c.type || 'Energy',
        })),
        min: 0,
        max,
        resumeToken: {
          ...resumeBase,
          effectType: 'attackDiscardScale',
          allowedIds: candidates.map((c) => c.instanceId),
          milledMatches,
        },
      });
      return;
    }
    energyDiscarded = 0;
  }

  // Optional return-energy-for-damage (Mega Greninja ex — Ninja Spinner): ask
  // before damage so declining still deals the printed base. The Energy moves
  // to hand only when accepted; the +N bonus is resolved by parseAttackDamage
  // from ctx.energyReturned.
  let energyReturned = ctx.energyReturned;
  const returnBonus = returnEnergyBonusClause(attack?.text);
  if (returnBonus && energyReturned === undefined) {
    const candidates = attachedEnergyCardsFor(
      draft,
      playerId,
      attacker,
      returnBonus.energyType
    );
    if (candidates.length > 0) {
      const typeLabel = returnBonus.energyType
        ? `${returnBonus.energyType} Energy`
        : 'Energy';
      draft.pendingChoice = createPendingChoice({
        player: playerId,
        source: 'attack',
        prompt: `${attack.name}: return a ${typeLabel} to your hand for ${returnBonus.bonus} more damage?`,
        // Numeric sentinels: the choice validator only accepts integer instanceIds.
        options: [
          {
            instanceId: 1,
            name: `Yes — +${returnBonus.bonus} damage`,
            type: 'option',
          },
          { instanceId: 2, name: 'No', type: 'option' },
        ],
        min: 1,
        max: 1,
        resumeToken: {
          ...resumeBase,
          effectType: 'attackReturnEnergyBonus',
          energyType: returnBonus.energyType,
        },
      });
      return;
    }
    energyReturned = false;
  }

  // "Before doing damage, …" clauses (design 030). A gust there moves the damage to the
  // opponent's new Active Pokémon.
  const attackSteps = planAttackSteps(attack, attacker, { coin, headsCount });
  if (attackSteps.before.length > 0) {
    if (!ctx.preStepsDone) {
      const done = runAttackSteps(draft, {
        steps: attackSteps.before,
        attackerId: attacker?.instanceId,
        playerId,
        oppId,
        activeRng,
        events,
        context: {
          attack: {
            phase: 'before',
            resume: resumeBase,
            values: { energyDiscarded, milledMatches, energyReturned },
          },
        },
      });
      if (!done || isGameConcluded(draft)) return;
    }
    if (attackSteps.before.some((step) => step.type === 'atkGust')) {
      defender =
        draft.players[defenderPlayerId]?.zones?.active?.find((c) => !c.attachedTo) || null;
    }
  }
  // Cards a before-damage Lost Zone cost moved (Rotom V Scrap Short). The cost is those
  // attacks' only before-damage step, so it moves in the command that reaches damage.
  const lostZoned = attackSteps.before.some((step) => step.countsForDamage)
    ? events
        .filter((e) => e.type === 'cardsLostZoned' && e.forDamage)
        .reduce((total, e) => total + e.count, 0)
    : undefined;

      const parsed = parseAttackDamage(
        attack,
        attackerView,
        defender ? inPlayView(draft, defender) : {},
        buildServerAttackContext(draft, {
          attackerPlayerId: playerId,
          defenderPlayerId,
          attacker,
          defender,
          attackerView,
          defenderView: defender ? inPlayView(draft, defender) : null,
          coin,
          headsCount,
          energyDiscarded,
          milledMatches,
          energyReturned,
          lostZoned,
        })
      );
      const effectiveAttack =
        parsed.total !== parsed.base
          ? { ...attack, damage: parsed.total }
          : attack;
      if (parsed.notes.length > 0) {
        events.push({
          type: 'attackDamageScaled',
          playerId,
          attackName: attack.name,
          base: parsed.base,
          total: parsed.total,
          notes: [...parsed.notes],
          resolved: parsed.resolved,
        });
      }

      let dmgDealt = 0;
      let weaknessApplied = false;
      if (attacker && defender) {
        const defenderView = inPlayView(draft, defender);
        const attackerView = inPlayView(draft, attacker);
        const attackerZoneCards = draft.players[playerId]?.zones?.active || [];
        const defenderZoneCards =
          draft.players[defenderPlayerId]?.zones?.active || [];
        const defenderInPlayCards = [
          ...(draft.players[defenderPlayerId]?.zones?.active || []),
          ...(draft.players[defenderPlayerId]?.zones?.bench || []),
        ];
        const myPrizes = (draft.players[playerId]?.zones?.prizes || []).length;
        const oppPrizes = (draft.players[defenderPlayerId]?.zones?.prizes || [])
          .length;
        const attackerTrailingPrizes = myPrizes > oppPrizes;
        const defenderPoisoned = hasCondition(defender, 'Poisoned');

        const dmgResult = computeAttackDamage(
          attackerView,
          defenderView,
          effectiveAttack,
          {
            attackerZoneCards,
            defenderZoneCards,
            defenderInPlayCards,
            stadium: draft.stadium,
            defenderIsActive: true,
            attackerTrailingPrizes,
            defenderPoisoned,
            baseDamage: parseInt(effectiveAttack?.damage, 10) || 0,
            turnDamageBonuses: draft.players[playerId]?.flags?.turnDamageBonuses || [],
          }
        );
        dmgDealt = dmgResult.total;
        weaknessApplied = dmgResult.multiplier > 1 || dmgResult.flat > 0;

        if (dmgResult.prevented) {
          events.push({
            type: 'damagePrevented',
            instanceId: defender.instanceId,
            attackerInstanceId: attacker.instanceId,
            attackName: effectiveAttack?.name,
          });
        }

        if (dmgDealt > 0) {
          // Special-energy reactions to being damaged (Spiky/Horror/Dangerous
          // Energy, Lucky Energy). Resolved before the KO sweep so an energy on
          // a Pokémon that is Knocked Out still fires ("even if Knocked Out").
          const defenderZoneRef = findCard(draft, defender.instanceId);
          runSpecialEnergyTriggers(draft, {
            trigger: 'damaged',
            host: defender,
            hostTop: inPlayView(draft, defender),
            hostPlayerId: defenderPlayerId,
            hostZoneId: defenderZoneRef?.zoneId || 'active',
            attacker,
            attackerPlayerId: playerId,
            events,
          });

          const koHp = cardEffectiveHp(draft, defender, defenderPlayerId);
          const wouldKo = koHp > 0 && (defender.damage || 0) + dmgDealt >= koHp;

          if (wouldKo) {
            const koEval = evaluateToolKoPrevention(
              defender,
              defenderZoneCards,
              {
                currentDamage: defender.damage || 0,
                incomingDamage: dmgDealt,
                baseHp: koHp,
                stadium: draft.stadium,
                inHp: true,
              }
            );

            if (koEval.prevented) {
              defender.damage = koEval.totalDamage;
              events.push({
                type: 'damageUpdated',
                instanceId: defender.instanceId,
                damage: defender.damage,
                dealt: dmgDealt,
                ...(weaknessApplied && { weakness: true }),
              });
              events.push({
                type: 'koPrevented',
                instanceId: defender.instanceId,
                tool: koEval.tool,
                surviveHp: koEval.surviveHp,
              });
              if (koEval.discardOnUse && koEval.toolCard) {
                discardCardFromPlayerZone(
                  draft,
                  koEval.toolCard.instanceId,
                  defenderPlayerId
                );
              }
            } else {
              defender.damage = (defender.damage || 0) + dmgDealt;
              events.push({
                type: 'damageUpdated',
                instanceId: defender.instanceId,
                damage: defender.damage,
                dealt: dmgDealt,
                ...(weaknessApplied && { weakness: true }),
              });
              handleKnockout(draft, {
                victimPlayerId: defenderPlayerId,
                attackerPlayerId: playerId,
                victim: defender,
                events,
              });
            }
          } else {
            defender.damage = (defender.damage || 0) + dmgDealt;
            events.push({
              type: 'damageUpdated',
              instanceId: defender.instanceId,
              damage: defender.damage,
              dealt: dmgDealt,
              ...(weaknessApplied && { weakness: true }),
            });
          }
        }

        // Reactive tool effects & Thorns on damage (if damage > 0 and not prevented)
        if (dmgDealt > 0 && !dmgResult.prevented && attacker) {
          let thornsDamage = 0;
          const toolEffects = attachedToolOnDamageEffects(
            defender,
            defenderZoneCards,
            {
              stadium: draft.stadium,
              isActive: true,
            }
          );
          for (const eff of toolEffects) {
            if (eff.damageAttacker > 0) {
              thornsDamage += eff.damageAttacker * 10;
            }
            if (eff.draw > 0) {
              const defPlayer = draft.players[defenderPlayerId];
              if (defPlayer?.zones?.deck && defPlayer?.zones?.hand) {
                for (
                  let d = 0;
                  d < eff.draw && defPlayer.zones.deck.length > 0;
                  d++
                ) {
                  defPlayer.zones.hand.push(defPlayer.zones.deck.pop());
                }
                events.push({
                  type: 'cardsDrawn',
                  playerId: defenderPlayerId,
                  count: eff.draw,
                  source: eff.tool?.name || 'Tool',
                });
              }
            }
            if (eff.discardTool && eff.tool) {
              discardCardFromPlayerZone(
                draft,
                eff.tool.instanceId,
                defenderPlayerId
              );
            }
          }

          const thorns = parseThorns(defender);
          if (thorns?.count > 0) {
            thornsDamage += thorns.count * 10;
          }

          if (thornsDamage > 0) {
            attacker.damage = (attacker.damage || 0) + thornsDamage;
            events.push({
              type: 'damageUpdated',
              instanceId: attacker.instanceId,
              damage: attacker.damage,
              dealt: thornsDamage,
              reason: 'thorns',
            });
            const atkKoHp = cardEffectiveHp(draft, attacker, playerId);
            if (atkKoHp > 0 && attacker.damage >= atkKoHp) {
              handleKnockout(draft, {
                victimPlayerId: playerId,
                attackerPlayerId: defenderPlayerId,
                victim: attacker,
                events,
              });
            }
          }
        }
      }

      // Recoil: printed damage the attack deals to its own Pokémon. A recoil KO hands the
      // prize entitlement to the DEFENDING player.
      if (parsed.selfDamage > 0 && attacker) {
        attacker.damage = (attacker.damage || 0) + parsed.selfDamage;
        events.push({
          type: 'damageUpdated',
          instanceId: attacker.instanceId,
          damage: attacker.damage,
          dealt: parsed.selfDamage,
        });
        const selfKoHp = cardEffectiveHp(draft, attacker, playerId);
        if (selfKoHp > 0 && attacker.damage >= selfKoHp) {
          handleKnockout(draft, {
            victimPlayerId: playerId,
            attackerPlayerId: oppId,
            victim: attacker,
            events,
          });
        }
      }

      // Healing from attack effect (e.g. "Heal 30 damage from this Pokémon").
      // Dyna Tree Hill suppresses all healing while it is in play.
      // "Heal N damage from each of your (Benched) Pokémon" is the atkHealEach step's.
      if (
        parsed.heal > 0 &&
        attacker &&
        !attackSteps.printed.has('atkHealEach') &&
        !stadiumBlocksHealing(draft.stadium)
      ) {
        const atkRef = findCard(draft, attacker.instanceId);
        if (
          atkRef &&
          atkRef.zoneId === 'active' &&
          (attacker.damage || 0) > 0
        ) {
          const healAmount = Math.min(attacker.damage, parsed.heal);
          attacker.damage -= healAmount;
          events.push({
            type: 'damageUpdated',
            instanceId: attacker.instanceId,
            damage: attacker.damage,
            healed: healAmount,
          });
        }
      }

      // Attack Special Conditions (design 014): apply status conditions inflicted by this attack
      const { defenderConditions, attackerConditions } =
        resolveAttackStatusConditions(attack, {
          coin,
          headsCount,
          flips,
        });

      if (defenderConditions.length > 0 && defender) {
        // Only apply condition if defender survived the attack (not KO'd)
        const defRef = findCard(draft, defender.instanceId);
        if (defRef && defRef.zoneId === 'active') {
          for (const cond of defenderConditions) {
            addCondition(defRef.card, cond);
            events.push(conditionsUpdatedEvent(defRef.card, cond));
          }
        }
      }

      if (attackerConditions.length > 0 && attacker) {
        const atkRef = findCard(draft, attacker.instanceId);
        if (atkRef && atkRef.zoneId === 'active') {
          for (const cond of attackerConditions) {
            addCondition(atkRef.card, cond);
            events.push(conditionsUpdatedEvent(atkRef.card, cond));
          }
        }
      }

      // Spread damage ("… to EACH of your opponent's Benched Pokémon") and single-target bench
      // damage ("… to 1 of your opponent's Benched Pokémon") are the same printed sentence to
      // `parsed.bench`'s looser regex, so a spread attack matches both. Spread wins: applying
      // both would double every benched Pokémon's damage.
      const spread = allBenchDamage(attack.text);

      // A printed clause that lets the player choose which opponent Pokémon take
      // damage / counters. Resolved after the attack's other effects below so a
      // suspension never drops them (design 017 / D19).
      let attackTarget = resolveAttackTargetClause(attack.text, parsed, spread);
      // Wugtrio ex / Tricolor Pump: the snipe does its printed amount once per
      // Energy discarded, and nothing when none were.
      if (
        attackTarget?.kind === 'damage' &&
        discardScaling &&
        /damage to \d+ of your opponent's .*for each (?:energy )?card you discard/i.test(
          attack.text || ''
        )
      ) {
        const scaledAmount = attackTarget.amount * (energyDiscarded || 0);
        attackTarget = scaledAmount > 0 ? { ...attackTarget, amount: scaledAmount } : null;
      }
      let benchDealt = 0;

      // Spread damage: the same amount to EVERY benched Pokémon the defender has. The target
      // list is snapshotted first, because a KO inside the loop mutates the bench array.
      if (spread > 0) {
        const targets = benchTargets(draft.players[defenderPlayerId]);
        if (targets.length === 0) {
          events.push({
            type: 'attackBenchFizzled',
            playerId,
            attackName: attack.name,
            reason: 'no-benched-pokemon',
          });
        } else {
          for (const victim of targets) {
            // A previous KO in this same loop (or the active KO above) may already have
            // moved this card to the discard — never damage a card that has left the bench.
            const ref = findCard(draft, victim.instanceId);
            if (ref?.zoneId !== 'bench') continue;
            benchDealt += spread;
            damageBenchedPokemon(draft, {
              victim,
              victimPlayerId: defenderPlayerId,
              attackerPlayerId: playerId,
              attackName: attack.name,
              dealt: spread,
              auto: false,
              events,
            });
          }
        }
      }

      // Self-recoil spread ("This attack also does 30 damage to each of your Benched
      // Pokémon"): the attacker's own Bench, and a KO there gives the opponent Prizes.
      const ownSpread = ownBenchDamage(attack.text);
      if (ownSpread > 0) {
        for (const victim of benchTargets(draft.players[playerId])) {
          if (findCard(draft, victim.instanceId)?.zoneId !== 'bench') continue;
          damageBenchedPokemon(draft, {
            victim,
            victimPlayerId: playerId,
            attackerPlayerId: defenderPlayerId,
            attackName: attack.name,
            dealt: ownSpread,
            auto: false,
            ownAttack: true,
            events,
          });
        }
      }

      // Attack effects: draw cards (e.g. Collect). "Discard your hand and draw N" is the
      // discardHandThenDraw step's (Raging Bolt ex Burst Roar).
      const drawN = attackSteps.printed.has('discardHandThenDraw') ? 0 : drawCount(attack);
      if (drawN > 0) {
        const deck = attackerPlayer?.zones?.deck || [];
        const hand = attackerPlayer?.zones?.hand || [];
        const actual = Math.min(drawN, deck.length);
        if (actual > 0) {
          const drawn = deck.splice(0, actual);
          hand.push(...drawn);
          events.push({
            type: 'cardsDrawn',
            playerId,
            count: actual,
            cards: drawn.map((c) => ({ instanceId: c.instanceId })),
          });
        }
      }

      // Attack effects: discard energy from attacker (Phase 3)
      // A discard-to-scale attack already discarded the player's picks before damage.
      const energyDiscardSpec = discardScaling ? null : parseAttackEnergyDiscard(effectiveAttack);
      if (energyDiscardSpec && attacker) {
        const attackerZone = draft.players[playerId]?.zones?.active || [];
        const attachedEnergies = attackerZone.filter(
          (c) => c.attachedTo === attacker.instanceId && isEnergy(c)
        );

        const ofType = (energyType) => (c) => {
          if (!energyType) return true;
          const ty = c.energyType || c.name?.replace(/\s*Energy.*/i, '');
          return ty && ty.toLowerCase().includes(energyType.toLowerCase());
        };
        let toDiscard = [];
        if (energyDiscardSpec.all) {
          toDiscard = attachedEnergies;
        } else {
          for (const part of energyDiscardSpec.parts || [energyDiscardSpec]) {
            const picked = attachedEnergies
              .filter((c) => !toDiscard.includes(c))
              .filter(ofType(part.energyType))
              .slice(0, part.count);
            toDiscard.push(...picked);
          }
        }

        for (const card of toDiscard) {
          const idx = draft.players[playerId].zones.active.findIndex(
            (c) => c.instanceId === card.instanceId
          );
          if (idx >= 0) {
            const [discarded] = draft.players[playerId].zones.active.splice(
              idx,
              1
            );
            discarded.attachedTo = null;
            const to = discardCardToPlayerZone(
              draft.players[playerId],
              discarded
            );
            events.push({
              type: 'cardMoved',
              instanceId: card.instanceId,
              from: 'active',
              to,
              playerId,
              reason: 'attack-energy-discard',
            });
          }
        }
      }

      // Attack effects: next-turn locks (Phase 3)
      const locks = parseNextTurnLock(effectiveAttack);
      if (locks) {
        if (locks.selfCannotAttack && attacker) {
          attacker.cannotAttackUntilTurn = (draft.turn.number || 1) + 2;
        } else if (locks.selfCannotUseAttack && attacker) {
          attacker.cannotAttackUntilTurn = (draft.turn.number || 1) + 2;
          attacker.cannotAttackAttackName = locks.selfCannotUseAttack;
        }
        if (locks.oppCannotRetreat && defender) {
          const defRef = findCard(draft, defender.instanceId);
          if (defRef && defRef.zoneId === 'active') {
            defender.cannotRetreatUntilTurn = (draft.turn.number || 1) + 1;
          }
        }
        if (locks.oppCannotAttack && defender) {
          const defRef = findCard(draft, defender.instanceId);
          if (defRef && defRef.zoneId === 'active') {
            // The defender's next turn is the immediate next turn number; the
            // legality gate blocks while `cannotAttackUntilTurn >= turn.number`.
            defender.cannotAttackUntilTurn = (draft.turn.number || 1) + 1;
          }
        }
      }

      // Printed clauses beyond the helpers above (design 030): switch, move Energy, discard
      // from the opponent, attach, mill, Bench placement, … They run before the deck search
      // so a suspension resumes into finishAttackTail.
      const tail = {
        playerId,
        oppId,
        defenderPlayerId,
        defenderId: defender?.instanceId ?? null,
        attackerId: attacker?.instanceId ?? null,
        attack,
        effectiveAttack,
        dmgDealt,
        benchDealt,
        attackTarget,
        milledIds,
        skipSearch: attackSteps.handlesSearch,
        resumeBase,
      };
      if (attackSteps.after.length > 0) {
        const done = runAttackSteps(draft, {
          // Snorlax V Swallow heals the damage this attack just did.
          steps: attackSteps.after.map((step) =>
            step.type === 'atkMirrorHeal' ? { ...step, amount: dmgDealt } : step
          ),
          attackerId: attacker?.instanceId,
          playerId,
          oppId,
          activeRng,
          events,
          context: { attack: { phase: 'after', tail } },
        });
        if (!done) return;
      }
      finishAttackTail(draft, { tail, activeRng, events });
}

/**
 * The end of an attack: deck search, chosen-target damage, the attackExecuted event, the
 * GX flag, attach-afterwards effects, and the checkup / turn hand-off. Split out so an
 * `attackSteps` suspension can resume into it (design 030). `tail` is plain JSON.
 */
function finishAttackTail(draft, { tail, activeRng, events }) {
      const {
        playerId,
        oppId,
        defenderPlayerId,
        attack,
        effectiveAttack,
        dmgDealt,
        attackTarget,
        milledIds,
        resumeBase,
      } = tail;
      let { benchDealt } = tail;
      const attackerPlayer = draft.players[playerId];
      const attackerRef = tail.attackerId != null ? findCard(draft, tail.attackerId) : null;
      const attacker = attackerRef?.card || null;
      const defender = tail.defenderId != null ? { instanceId: tail.defenderId } : null;
      const mill = deckMillScaling(attack?.text);
      if (isGameConcluded(draft)) return;

      // Attack effects: deck search (Phase 3, e.g. Call for Family)
      const searchClause = tail.skipSearch ? null : parseAttackSearchClause(effectiveAttack);
      let searchTriggered = false;
      if (searchClause && attackerPlayer?.zones?.deck?.length > 0) {
        // A staged clause (searchDeckSequence) is walked one stage per choice so
        // each stage keeps its own filter; treating it as a single clause left
        // `what` undefined and offered the entire deck.
        const stages =
          searchClause.type === 'searchDeckSequence' &&
          Array.isArray(searchClause.stages)
            ? searchClause.stages
            : [searchClause];
        const choice = buildAttackSearchChoice(draft, {
          playerId,
          oppId,
          attackerId: attacker?.instanceId,
          stages,
        });
        if (choice) {
          draft.pendingChoice = choice;
          searchTriggered = true;
        }
      }

      // Chosen-target damage/counters, resolved now (after every other attack
      // effect) so a click-to-select suspension never drops them. The player
      // clicks the target(s) on the mat (design 017 / D19).
      if (attackTarget) {
        const candidates = attackTargetOptions(
          draft,
          defenderPlayerId,
          attackTarget.scope
        );
        if (candidates.length === 0) {
          events.push({
            type: 'attackBenchFizzled',
            playerId,
            attackName: attack.name,
            reason: 'no-target',
          });
        } else {
          const distributable = Boolean(attackTarget.distributable);
          const required = distributable
            ? attackTarget.remaining || 0
            : attackTarget.count;
          const picksFor = (cards) =>
            distributable
              ? new Array(required).fill(cards[0].instanceId)
              : cards.slice(0, attackTarget.count).map((c) => c.instanceId);
          if (
            attackTarget.scope === 'active' ||
            candidates.length <= (distributable ? 1 : attackTarget.count)
          ) {
            benchDealt += applyAttackTargets(draft, {
              selection: picksFor(candidates),
              clause: attackTarget,
              defenderPlayerId,
              attackerPlayerId: playerId,
              attackName: attack.name,
              events,
            });
          } else if (!searchTriggered) {
            draft.pendingChoice = createPendingChoice({
              player: playerId,
              source: 'attack',
              prompt: distributable
                ? `${attack.name}: Place a damage counter (${required} left)`
                : `${attack.name}: Choose ${attackTarget.count > 1 ? `${attackTarget.count} ` : ''}of your opponent's Pokémon to take damage`,
              options: candidates,
              min: distributable ? 1 : attackTarget.count,
              max: distributable ? 1 : attackTarget.count,
              resumeToken: {
                effectType: 'attack',
                initiatorPlayerId: playerId,
                oppId,
                attackTarget,
                effectiveAttack,
                damage: dmgDealt,
              },
            });
            return;
          } else {
            // A deck-search clause already suspended this attack; apply the target
            // to the first eligible Pokémon rather than overwriting its choice.
            benchDealt += applyAttackTargets(draft, {
              selection: picksFor(candidates),
              clause: attackTarget,
              defenderPlayerId,
              attackerPlayerId: playerId,
              attackName: attack.name,
              events,
            });
          }
        }
      }

      events.push({
        type: 'attackExecuted',
        attackerId: attacker?.instanceId,
        defenderId: defender?.instanceId,
        attackName: attack.name,
        damage: dmgDealt,
        benchDealt,
        playerId,
      });

      // App. 19: using a GX attack spends the player's single GX attack for the game.
      // Set here, on the resolving path only — a Confused fizzle above never reaches it.
      if (isGxAttack(attack)) {
        const oncePerGame = ensureOncePerGame(draft, playerId);
        if (oncePerGame && !oncePerGame.gxUsed) {
          oncePerGame.gxUsed = true;
          events.push({
            type: 'gxAttackUsed',
            playerId,
            instanceId: attacker?.instanceId,
            attackName: attack.name,
          });
        }
      }

      // Raikou: "Then, attach those {L} Energy cards to 1 of your Pokémon."
      if (mill?.attachMatched && milledIds.length > 0 && !draft.pendingChoice) {
        const ownRoots = [
          ...(attackerPlayer.zones.active || []),
          ...(attackerPlayer.zones.bench || []),
        ].filter((c) => !c.attachedTo && isPokemon(c));
        if (ownRoots.length === 1) {
          attachMilledCards(attackerPlayer, milledIds, ownRoots[0], events);
        } else if (ownRoots.length > 1) {
          draft.pendingChoice = createPendingChoice({
            player: playerId,
            source: 'attack',
            prompt: `${attack.name}: choose 1 of your Pokémon to attach the discarded Energy to`,
            options: ownRoots,
            min: 1,
            max: 1,
            resumeToken: {
              ...resumeBase,
              effectType: 'attackAttachMilled',
              oppId,
              cardIds: milledIds,
            },
          });
          searchTriggered = true;
        }
      }

      // Aura Jab: "Attach up to 3 Basic {F} Energy cards from your discard pile to your
      // Benched Pokémon in any way you like." One Energy per pick so the split is free.
      const benchSpread = attachDiscardToBenchSpread(attack?.text);
      if (benchSpread && !draft.pendingChoice) {
        const resumed = raiseSpreadAttachChoice(draft, {
          playerId,
          attackName: attack.name,
          spread: benchSpread,
          remaining: benchSpread.count,
          token: { ...resumeBase, effectType: 'attackAttachSpread', oppId },
        });
        if (resumed) searchTriggered = true;
      }

      if (/put this pok[ée]mon and all attached cards into your hand/i.test(attack?.text || '')) {
        returnAttackerToHand(draft, { playerId, attacker, oppId, events });
      }

      if (!attackerPlayer.flags) attackerPlayer.flags = {};
      attackerPlayer.flags.attackerAttacked = true;

      // Auto-end turn after attacking (unless paused by pendingChoice)
      if (!searchTriggered && !isGameConcluded(draft)) {
        resolveCheckup(draft, {
          rng: activeRng,
          events,
          endingPlayerId: playerId,
        });
        if (!isGameConcluded(draft)) {
          advanceTurn(draft, { nextPlayerId: oppId, events });
        }
      }
}

export function applyCommand(state, command, rng = null) {
  if (!state || typeof state !== 'object') {
    return {
      state: null,
      events: [],
      pendingChoice: null,
      error: 'bad_command',
      reason: 'Invalid state',
    };
  }

  // Step 1: Shape check
  const shapeResult = validateCommandShape(command);
  if (!shapeResult.valid) {
    return {
      state,
      events: [],
      pendingChoice: state.pendingChoice,
      error: 'bad_command',
      reason: shapeResult.reason,
    };
  }

  command = promoteTrainerPlay(state, command);
  if (command.pendingDataReason) {
    return {
      state,
      events: [],
      pendingChoice: state.pendingChoice,
      error: 'card_data_pending',
      reason: command.pendingDataReason,
    };
  }
  const { type, payload, playerId } = command;
  if (!playerId || typeof playerId !== 'string') {
    return {
      state,
      events: [],
      pendingChoice: state.pendingChoice,
      error: 'bad_command',
      reason: 'Missing playerId',
    };
  }

  // Step 2: Turn gate / PendingChoice gate
  if (state.pendingChoice) {
    if (type !== 'resolveChoice') {
      return {
        state,
        events: [],
        pendingChoice: state.pendingChoice,
        error: 'waiting_for_choice',
        reason: `Waiting for choice from player ${state.pendingChoice.player}`,
      };
    }
    // Edge Case 11: Choice resolved by wrong player -> rejected not_your_choice
    if (state.pendingChoice.player !== playerId) {
      return {
        state,
        events: [],
        pendingChoice: state.pendingChoice,
        error: 'not_your_choice',
        reason: `Choice must be resolved by player ${state.pendingChoice.player}`,
      };
    }
    if (payload.choiceId && state.pendingChoice.choiceId !== payload.choiceId) {
      return {
        state,
        events: [],
        pendingChoice: state.pendingChoice,
        error: 'stale_choice',
        reason: 'Choice ID does not match current pending choice',
      };
    }
  } else if (type === 'resolveChoice') {
    return {
      state,
      events: [],
      pendingChoice: null,
      error: 'no_pending_choice',
      reason: 'There is no pending choice to resolve',
    };
  }

  // Edge Case 12: Selection validation for resolveChoice
  if (type === 'resolveChoice') {
    const selection = payload.selection || [];
    const min = state.pendingChoice.min ?? 0;
    const max = state.pendingChoice.max ?? Infinity;
    if (selection.length < min || selection.length > max) {
      return {
        state,
        events: [],
        pendingChoice: state.pendingChoice,
        error: 'invalid_selection',
        reason: `Selection count (${selection.length}) must be between ${min} and ${max}`,
      };
    }
    const optionIds = new Set(
      (state.pendingChoice.options || []).map((o) => o.instanceId)
    );
    for (const sId of selection) {
      if (!optionIds.has(sId)) {
        return {
          state,
          events: [],
          pendingChoice: state.pendingChoice,
          error: 'invalid_selection',
          reason: `Selected card ${sId} is not in choice options`,
        };
      }
    }
  }

  // Step 3: Reference check (stale client view detection)
  const refResult = validateReferences(state, command);
  if (!refResult.valid) {
    return {
      state,
      events: [],
      pendingChoice: state.pendingChoice,
      error: refResult.error || 'stale_view',
    };
  }

  // Step 4: Legality check (skipped when rulesEnabled === false)
  const legalityResult = validateLegality(state, command);
  if (!legalityResult.allowed) {
    return {
      state,
      events: [],
      pendingChoice: state.pendingChoice,
      error: legalityResult.reason,
    };
  }

  // Step 5: Apply to cloned draft
  const draft = cloneGameState(state);
  const activeRng = rng || createRng(state.seed || 0);
  if (state.rngCursor && !rng) {
    while (activeRng.cursor < state.rngCursor) {
      activeRng.next();
    }
  }
  const events = [];

  switch (type) {
    case 'moveCard': {
      let card = null;
      if (payload.from === 'stadium') {
        card = draft.stadium;
        draft.stadium = null;
      } else {
        const srcZone = draft.players[playerId].zones[payload.from];
        const idx = srcZone.findIndex(
          (c) => c.instanceId === payload.instanceId
        );
        if (idx >= 0) {
          [card] = srcZone.splice(idx, 1);
        }
      }

      if (card) {
        // Special-energy on-discard: Recycle Energy returns to hand instead of
        // the discard pile. (Reattach is attack-only and handled by the effect
        // executor, not this client-driven move.)
        let discardRedirect = null;
        if (
          payload.to === 'discard' &&
          ['active', 'bench'].includes(payload.from) &&
          isEnergy(card) &&
          isSpecialEnergyCard(card) &&
          card.attachedTo != null
        ) {
          const host = findCard(draft, card.attachedTo)?.card;
          const hostRef = host ? findCard(draft, host.instanceId) : null;
          const resolution = resolveSpecialEnergyDiscard(draft, {
            energy: card,
            host,
            hostTop: host ? inPlayView(draft, host) : null,
            hostPlayerId: hostRef?.playerId,
            hostZoneId: hostRef?.zoneId,
            events,
          });
          if (resolution === 'hand') discardRedirect = 'hand';
        }

        if (payload.to === 'stadium') {
          if (draft.stadium && draft.stadium.instanceId !== card.instanceId) {
            discardCurrentStadium(draft, events, playerId);
          }
          card.ownerId = card.ownerId || playerId;
          draft.stadium = card;
          card.attachedTo = null;
          for (const p of Object.values(draft.players || {})) {
            if (p.flags) p.flags.stadiumUsedThisTurn = false;
          }
          // Dropping the Stadium onto the Stadium slot is still "playing a
          // Stadium": without this flag a second Stadium could be played in the
          // same turn, which only the drag path allowed.
          const placing = draft.players[playerId];
          if (placing) {
            if (!placing.flags) placing.flags = {};
            placing.flags.stadiumPlayedThisTurn = true;
          }
        } else if (discardRedirect === 'hand') {
          card.attachedTo = null;
          draft.players[playerId].zones.hand.push(card);
          events.push({
            type: 'cardMoved',
            instanceId: card.instanceId,
            from: payload.from,
            to: 'hand',
            playerId,
          });
        } else {
          const destZone = draft.players[playerId].zones[payload.to];
          if (
            payload.targetIndex != null &&
            payload.targetIndex >= 0 &&
            payload.targetIndex <= destZone.length
          ) {
            destZone.splice(payload.targetIndex, 0, card);
          } else {
            destZone.push(card);
          }

          if (
            ['active', 'bench'].includes(payload.to) &&
            ['hand', 'deck', 'discard'].includes(payload.from)
          ) {
            card.enteredPlayTurn = draft.turn.number;
          }
          // Only a hand→Bench play opens a "when you play onto your Bench" trigger.
          if (payload.from === 'hand' && payload.to === 'bench') {
            card.playedToBenchTurn = draft.turn.number;
          } else {
            delete card.playedToBenchTurn;
          }

          // If moving between active and bench, bring along all attached cards
          if (
            ['active', 'bench'].includes(payload.from) &&
            ['active', 'bench'].includes(payload.to)
          ) {
            clearConditions(card);
            delete card.cannotAttackUntilTurn;
            delete card.cannotAttackAttackName;
            delete card.cannotRetreatUntilTurn;
            const srcZone = draft.players[playerId].zones[payload.from];
            for (let i = srcZone.length - 1; i >= 0; i--) {
              if (srcZone[i].attachedTo === card.instanceId) {
                const [attachedChild] = srcZone.splice(i, 1);
                destZone.push(attachedChild);
              }
            }
          }
        }

        events.push({
          type: 'cardMoved',
          instanceId: card.instanceId,
          from: payload.from,
          to: payload.to,
          targetIndex: payload.targetIndex,
          playerId,
        });
      }
      break;
    }

    case 'draw': {
      const count = payload?.count ?? 1;
      const deck = draft.players[playerId].zones.deck;
      const hand = draft.players[playerId].zones.hand;
      const actualCount = Math.min(count, deck.length);
      const drawnCards = deck.splice(0, actualCount);
      hand.push(...drawnCards);

      events.push({
        type: 'cardsDrawn',
        count: actualCount,
        playerId,
        cards: drawnCards.map((c) => ({ instanceId: c.instanceId })),
      });
      break;
    }

    case 'attachCard': {
      const cardRef = findCard(draft, payload.instanceId);
      const targetRef = findCard(draft, payload.targetInstanceId);
      // Attachment and evolve both land on the stack ROOT (D40): the client addresses the
      // card the player sees, which for a stacked Pokémon is the top Evolution, while every
      // `attachedTo === <root>` lookup and `topPokemonCard` read the Basic. Evolution
      // turn metadata and Special Conditions are per-Pokémon, and conditions live on the
      // root, so they follow the host too. Events keep the payload id the client sent.
      const hostRef =
        findCard(draft, attachmentHostId(draft, payload.targetInstanceId)) ||
        targetRef;

      if (cardRef && targetRef) {
        // Splice card out of its origin zone
        const srcZone = draft.players[playerId].zones[cardRef.zoneId];
        const idx = srcZone.findIndex(
          (c) => c.instanceId === payload.instanceId
        );
        if (idx >= 0) {
          srcZone.splice(idx, 1);
        }

        // Set attachment pointer
        cardRef.card.attachedTo = hostRef.card.instanceId;

        // Add to the HOST's zone, not the actor's: a Team Flare Hyper Gear is
        // played by you but attaches to the opponent's Pokémon-EX (App. 24).
        const destZone = draft.players[hostRef.playerId].zones[hostRef.zoneId];
        destZone.push(cardRef.card);

        // Update turn energy attachment flag if energy
        if (isEnergy(cardRef.card)) {
          if (!draft.players[playerId].flags) {
            draft.players[playerId].flags = {};
          }
          draft.players[playerId].flags.energyAttached = true;

          // Pokémon Park: attaching an Energy from hand to a Benched Pokémon
          // removes 1 damage counter (once per player per turn).
          const parkStadium = draft.stadium?.card || draft.stadium;
          const attachedToBench =
            hostRef.zoneId === 'bench' ||
            (draft.players[hostRef.playerId]?.zones?.bench || []).includes(
              hostRef.card
            );
          if (
            cardRef.zoneId === 'hand' &&
            attachedToBench &&
            isStadiumEnergyAttachHeal(parkStadium) &&
            !draft.players[playerId].flags.pokemonParkHealedThisTurn
          ) {
            draft.players[playerId].flags.pokemonParkHealedThisTurn = true;
            const before = hostRef.card.damage || 0;
            if (before > 0) {
              hostRef.card.damage = Math.max(0, before - 10);
              events.push({
                type: 'damageUpdated',
                instanceId: hostRef.card.instanceId,
                damage: hostRef.card.damage,
                healed: before - hostRef.card.damage,
              });
            }
            events.push({
              type: 'stadiumTriggered',
              name: 'Pokémon Park',
              instanceId: parkStadium?.instanceId,
              playerId,
            });
          }
        } else if (isPokemon(cardRef.card)) {
          if (!draft.players[playerId].flags) {
            draft.players[playerId].flags = {};
          }
          if (!draft.players[playerId].flags.evolved) {
            draft.players[playerId].flags.evolved = {};
          }
          draft.players[playerId].flags.evolved[payload.targetInstanceId] =
            true;
          cardRef.card.enteredPlayTurn = draft.turn.number;
          hostRef.card.lastEvolvedTurn = draft.turn.number;
          // Sea of Nothingness: Special Conditions survive evolving.
          if (
            !isStadiumStatusPersistsOnEvolve(
              draft.stadium?.card || draft.stadium
            )
          ) {
            clearConditions(hostRef.card);
          }
          events.push({
            type: 'pokemonEvolved',
            playerId,
            instanceId: payload.instanceId,
            targetInstanceId: payload.targetInstanceId,
          });

          // Special-energy on-evolve triggers (e.g. Regenerative Energy heal).
          runSpecialEnergyTriggers(draft, {
            trigger: 'evolve',
            host: hostRef.card,
            hostPlayerId: hostRef.playerId,
            hostZoneId: hostRef.zoneId,
            events,
          });

          // Gen 6 Mega Evolution / Primal Reversion: the evolve ends the turn
          // immediately unless the matching Spirit Link is already attached
          // (rulebook 30c 1.4). The reducer is the authority; the client only
          // mirrored this before.
          const attachedCards = destZone.filter(
            (c) => c.attachedTo === hostRef.card.instanceId
          );
          if (
            requiresTurnEndOnEvolve(cardRef.card, {
              ...hostRef.card,
              attachedCards,
            })
          ) {
            const megaOppId = Object.keys(draft.players || {}).find(
              (id) => id !== playerId
            );
            events.push({
              type: 'turnEndedByMegaEvolve',
              playerId,
              instanceId: payload.instanceId,
            });
            // Ending the turn runs the full between-turns sequence, as every
            // other turn-ending path does. Skipping Pokémon Checkup left Poison/
            // Burn damage, status recovery and end-of-turn effects unapplied.
            if (!isGameConcluded(draft)) {
              resolveCheckup(draft, {
                rng: activeRng,
                events,
                endingPlayerId: playerId,
              });
              if (!isGameConcluded(draft)) {
                advanceTurn(draft, { nextPlayerId: megaOppId, events });
              }
            }
          }
        }

        // A Pokémon attach is an evolution and is announced by `pokemonEvolved`;
        // emitting `cardAttached` too would double-narrate it (design 021).
        if (!isPokemon(cardRef.card)) {
          events.push({
            type: 'cardAttached',
            instanceId: payload.instanceId,
            targetInstanceId: payload.targetInstanceId,
            playerId,
          });
        }

        // Special-energy on-attach triggers (draw/search/heal/damage/switch/
        // devolve/return-basic-energy). A search or switch may suspend the
        // command on a PendingChoice, resumed via resolveChoice.
        if (isEnergy(cardRef.card) && isSpecialEnergyCard(cardRef.card)) {
          runSpecialEnergyTriggers(draft, {
            trigger: 'attach',
            host: hostRef.card,
            hostTop: inPlayView(draft, hostRef.card),
            hostPlayerId: hostRef.playerId,
            hostZoneId: hostRef.zoneId,
            energy: cardRef.card,
            fromZone: cardRef.zoneId,
            events,
          });
        }
      }
      break;
    }

    case 'addDamageCounter': {
      const cardRef = findCard(draft, payload.instanceId);
      if (cardRef) {
        const amount = payload.amount ?? 10;
        cardRef.card.damage = (cardRef.card.damage || 0) + amount;
        events.push({
          type: 'damageUpdated',
          instanceId: payload.instanceId,
          damage: cardRef.card.damage,
        });
      }
      break;
    }

    case 'updateDamageCounter': {
      const cardRef = findCard(draft, payload.instanceId);
      if (cardRef) {
        cardRef.card.damage = Math.max(0, payload.amount);
        events.push({
          type: 'damageUpdated',
          instanceId: payload.instanceId,
          damage: cardRef.card.damage,
        });
      }
      break;
    }

    case 'removeDamageCounter': {
      const cardRef = findCard(draft, payload.instanceId);
      if (cardRef) {
        const amount = payload.amount ?? 10;
        cardRef.card.damage = Math.max(0, (cardRef.card.damage || 0) - amount);
        events.push({
          type: 'damageUpdated',
          instanceId: payload.instanceId,
          damage: cardRef.card.damage,
        });
      }
      break;
    }

    case 'addSpecialCondition': {
      const cardRef = findCard(draft, payload.instanceId);
      if (cardRef) {
        addCondition(cardRef.card, payload.condition);
        events.push(conditionsUpdatedEvent(cardRef.card, payload.condition));
      }
      break;
    }

    case 'updateSpecialCondition': {
      const cardRef = findCard(draft, payload.instanceId);
      if (cardRef) {
        if (payload.condition == null) clearConditions(cardRef.card);
        else addCondition(cardRef.card, payload.condition);
        events.push(
          conditionsUpdatedEvent(cardRef.card, payload.condition ?? null)
        );
      }
      break;
    }

    case 'removeSpecialCondition': {
      const cardRef = findCard(draft, payload.instanceId);
      if (cardRef) {
        // A named condition removes only that one; no name clears them all.
        if (payload.condition) removeCondition(cardRef.card, payload.condition);
        else clearConditions(cardRef.card);
        events.push(conditionsUpdatedEvent(cardRef.card, null));
      }
      break;
    }

    case 'removeAbilityCounter': {
      const cardRef = findCard(draft, payload.instanceId);
      if (cardRef) {
        cardRef.card.abilityUsed = false;
        // The turn flag is the other half of the used-check; clearing only the
        // card stamp left the ability refused ("Ability already used this turn")
        // while the counter visibly disappeared from the board.
        const usedFlags = draft.players?.[cardRef.playerId]?.flags?.abilitiesUsed;
        if (usedFlags) {
          if (cardRef.card.instanceId != null) delete usedFlags[cardRef.card.instanceId];
          if (cardRef.card.name != null) delete usedFlags[cardRef.card.name];
        }
        events.push({
          type: 'abilityCounterUpdated',
          instanceId: payload.instanceId,
          abilityUsed: false,
        });
      }
      break;
    }

    case 'changeType': {
      const cardRef = findCard(draft, payload.instanceId);
      if (cardRef) {
        cardRef.card.type = payload.type;
        events.push({
          type: 'typeChanged',
          instanceId: payload.instanceId,
          cardType: payload.type,
        });
      }
      break;
    }

    case 'rotateCard': {
      const cardRef = findCard(draft, payload.instanceId);
      if (cardRef) {
        cardRef.card.rotation = payload.rotation;
        events.push({
          type: 'cardRotated',
          instanceId: payload.instanceId,
          rotation: payload.rotation,
        });
      }
      break;
    }

    case 'playRandomCardFaceDown': {
      const hand = draft.players[playerId].zones.hand;
      const [card] = hand.splice(activeRng.int(hand.length), 1);
      card.faceDown = true;
      card.revealed = false;
      draft.players[playerId].zones.board.push(card);
      events.push({
        type: 'cardPlayedFaceDown',
        instanceId: card.instanceId,
        playerId,
      });
      break;
    }

    case 'setup': {
      const setupResult = setupGame(draft, {
        firstPlayerId: payload?.firstPlayerId,
        rng: activeRng,
      });
      events.push(...setupResult.events);
      break;
    }

    case 'attack': {
      const attackerPlayer = draft.players[playerId];
      const attacker = attackerPlayer?.zones?.active?.find(
        (c) => !c.attachedTo
      );
      const atkIdx = payload?.attackIndex ?? 0;
      const attackerView = attackViewFor(draft, attacker);
      const attack = attackerView?.attacks?.[atkIdx] || {
        name: 'Attack',
        damage: 10,
      };

      const oppId = Object.keys(draft.players || {}).find(
        (id) => id !== playerId
      );
      const defenderPlayer = draft.players[oppId];
      let defender = null;
      let defenderPlayerId = oppId;
      if (payload?.targetInstanceId != null) {
        const targetRef = findCard(draft, payload.targetInstanceId);
        defender = targetRef?.card;
        if (targetRef?.playerId) {
          defenderPlayerId = targetRef.playerId;
        }
      } else {
        defender = defenderPlayer?.zones?.active?.find((c) => !c.attachedTo);
      }

      // Check confused condition
      if (attacker && attacker.specialCondition === 'Confused') {
        const coin = activeRng.next() < 0.5 ? 'heads' : 'tails';
        if (coin === 'tails') {
          attacker.damage = (attacker.damage || 0) + 30;
          events.push({
            type: 'damageUpdated',
            instanceId: attacker.instanceId,
            damage: attacker.damage,
            dealt: 30,
          });
          events.push({
            type: 'attackConfusedFizzle',
            attackerId: attacker.instanceId,
            damage: 30,
            playerId,
          });

          // Check if confused self-damage KO'd attacker
          if (attackerView.hp && attacker.damage >= attackerView.hp) {
            handleKnockout(draft, {
              victimPlayerId: playerId,
              attackerPlayerId: oppId,
              victim: attacker,
              events,
            });
          }

          if (!attackerPlayer.flags) attackerPlayer.flags = {};
          attackerPlayer.flags.attackerAttacked = true;

          if (!isGameConcluded(draft)) {
            resolveCheckup(draft, {
              rng: activeRng,
              events,
              endingPlayerId: playerId,
            });
            if (!isGameConcluded(draft)) {
              advanceTurn(draft, { nextPlayerId: oppId, events });
            }
          }
          break;
        }
      }

      // Printed-text damage (design 013): coin flips first, then the "for each …" scaling
      // the parser resolves from live board counts, then bench/spread damage. Without this
      // every attack dealt its flat printed number regardless of the board (I26 follow-up).
      const coinResult = flipAttackCoins(attack, activeRng);
      const { coin, headsCount, flips } = coinResult;
      if (flips.length > 0) {
        events.push({
          type: 'attackCoinFlipped',
          playerId,
          attackName: attack.name,
          coin,
          headsCount,
          flips,
        });
      }

      // Glimwood Tangle: after any coins are flipped for an attack, the player
      // may ignore the results and re-flip. The choice is offered before any
      // effect resolves, so a re-flip never has to undo damage or a KO.
      if (
        flips.length > 0 &&
        isStadiumGlimwoodReFlip(draft.stadium?.card || draft.stadium) &&
        !attackerPlayer?.flags?.glimwoodUsedThisTurn
      ) {
        draft.pendingChoice = createPendingChoice({
          player: playerId,
          source: 'stadium',
          prompt: `${attack.name}: keep the coin results or re-flip them (Glimwood Tangle)?`,
          // Numeric sentinels: the choice validator only accepts integer
          // instanceIds. 1 = keep, 2 = re-flip.
          options: [
            { instanceId: 1, name: 'Keep results', type: 'option' },
            { instanceId: 2, name: 'Re-flip coins', type: 'option' },
          ],
          min: 1,
          max: 1,
          resumeToken: {
            effectType: 'glimwood',
            initiatorPlayerId: playerId,
            attackIndex: atkIdx,
            targetInstanceId: payload?.targetInstanceId ?? null,
            coinResult,
          },
        });
        break;
      }

      resolveAttackEffectPhase(draft, {
        playerId,
        activeRng,
        events,
        attacker,
        defender,
        defenderPlayerId,
        oppId,
        attack,
        attackerPlayer,
        attackerView,
        coin,
        headsCount,
        flips,
      });
      break;
    }

    case 'retreat': {
      const player = draft.players[playerId];
      const benchRoots = (player?.zones?.bench || []).filter(
        (c) => !c.attachedTo
      );

      // 2+ Benched Pokémon and no explicit target: suspend and let the player
      // click the one to switch in (server mat picker, D19). Legality has
      // already guaranteed at least one valid bench target.
      if (payload?.benchInstanceId == null && benchRoots.length > 1) {
        draft.pendingChoice = createPendingChoice({
          player: playerId,
          prompt: 'Retreat: Choose a Benched Pokémon to switch in',
          source: 'retreat',
          options: benchRoots,
          min: 1,
          max: 1,
          stateVersion: draft.stateVersion,
          resumeToken: {
            effectType: 'retreat',
            initiatorPlayerId: playerId,
            discardEnergyIds: Array.isArray(payload?.discardEnergyIds)
              ? payload.discardEnergyIds
              : [],
          },
        });
        break;
      }

      applyRetreatSwap(draft, {
        playerId,
        benchInstanceId: payload?.benchInstanceId ?? null,
        discardEnergyIds: Array.isArray(payload?.discardEnergyIds)
          ? payload.discardEnergyIds
          : [],
        events,
      });
      break;
    }

    case 'pass':
    case 'takeTurn': {
      const oppId = Object.keys(draft.players || {}).find(
        (id) => id !== playerId
      );
      // A pass issued during the sudden-death tiebreak hands the turn over so
      // the opponent can contest the first Prize (1.2). A Checkup that *creates*
      // a tie in this same command must not advance, or the tie would never be
      // resolvable — hence the entry-phase snapshot.
      const wasTiebreak = draft.turn?.phase === 'tiebreak';
      resolveCheckup(draft, {
        rng: activeRng,
        events,
        endingPlayerId: playerId,
      });
      if (wasTiebreak || !isGameConcluded(draft)) {
        advanceTurn(draft, { nextPlayerId: oppId, events });
      }
      break;
    }

    case 'takePrizes': {
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
      break;
    }

    case 'takePrizesByIndex': {
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
      break;
    }

    case 'promote': {
      promoteBenchToActive(draft, {
        playerId,
        instanceId: payload.instanceId,
        events,
      });
      break;
    }

    case 'playTrainer': {
      const cardRef = findCard(draft, payload.instanceId);
      if (cardRef) {
        executeTrainer(draft, {
          card: cardRef.card,
          playerId,
          activeRng,
          events,
          targetInstanceId: payload.targetInstanceId,
        });
      }
      break;
    }

    case 'useAbility': {
      const cardRef = findCard(draft, payload.instanceId);
      if (cardRef) {
        executeAbility(draft, {
          card: cardRef.card,
          abilityIndex: payload.abilityIndex ?? 0,
          playerId,
          activeRng,
          events,
        });
      }
      break;
    }

    case 'stadium-effect': {
      const result = executeStadium(draft, {
        playerId,
        activeRng,
        events,
      });
      // Lost World: the activation can win the game outright.
      if (result?.gameWinner && !result.pendingChoice) {
        setGameEnded(draft, {
          winner: result.gameWinner,
          reason: result.gameReason || 'stadium effect',
          events,
        });
      } else if (result?.turnEnds && !result.pendingChoice) {
        // Lumiose City: the activation ends the turn once it resolves.
        endTurnFromEffect(draft, { playerId, activeRng, events });
      }
      break;
    }

    case 'useVStarGX': {
      const kind = effectiveOncePerGameKind(draft, command);
      // `player.oncePerGame` is the single source of truth (App. 9/19); `view.mjs`
      // projects it into the exposed `flags` for the client, so nothing is mirrored here.
      // `kind === null` is the legacy fallback: no discriminator and no classifiable
      // source card, so spend both allowances as before.
      const oncePerGame = ensureOncePerGame(draft, playerId);
      if (kind !== 'gx') {
        if (oncePerGame) oncePerGame.vstarUsed = true;
      }
      if (kind !== 'vstar') {
        if (oncePerGame) oncePerGame.gxUsed = true;
      }
      events.push({
        type: 'vstarUsed',
        playerId,
        instanceId: payload.instanceId,
        kind,
      });
      break;
    }

    case 'resolveChoice': {
      const choice = draft.pendingChoice;
      const token = choice?.resumeToken || {};
      let resumeCard = null;
      let resumeCardOwnerId = null;
      if (token.sourceInstanceId != null) {
        const cardRef = findCard(draft, token.sourceInstanceId);
        resumeCard = cardRef?.card || null;
        resumeCardOwnerId = cardRef?.playerId || null;
      }
      const initiatorPlayerId =
        token.initiatorPlayerId || resumeCardOwnerId || playerId;

      if (token.effectType === 'trainer') {
        executeTrainer(draft, {
          card: resumeCard,
          playerId: initiatorPlayerId,
          activeRng,
          events,
          selection: payload.selection,
          resumeToken: token,
        });
      } else if (token.effectType === 'ability') {
        executeAbility(draft, {
          card: resumeCard,
          playerId: initiatorPlayerId,
          activeRng,
          events,
          selection: payload.selection,
          resumeToken: token,
        });
      } else if (token.effectType === PRIZE_CHOICE_EFFECT) {
        resolvePrizeChoice(draft, {
          playerId: initiatorPlayerId,
          selection: payload.selection || [],
          events,
        });
      } else if (token.effectType === SPECIAL_ENERGY_EFFECT) {
        resumeSpecialEnergyTrigger(draft, {
          selection: payload.selection || [],
          events,
          resumeToken: token,
        });
      } else if (token.effectType === 'glimwood') {
        // Glimwood Tangle: resume the attack with the kept coin result or a fresh
        // re-flip, then run the remaining effect phase. The confusion check is
        // deliberately skipped — it already resolved before the coins.
        const resumer = draft.players[initiatorPlayerId];
        if (!resumer.flags) resumer.flags = {};
        resumer.flags.glimwoodUsedThisTurn = true;
        const pick = (payload.selection || [])[0];
        const wantsReflip = Number(pick) === 2;
        const attackIdx = token.attackIndex ?? 0;
        const attacker = resumer?.zones?.active?.find((c) => !c.attachedTo);
        const attackerView = attackViewFor(draft, attacker);
        const attack = attackerView?.attacks?.[attackIdx] || {
          name: 'Attack',
          damage: 10,
        };
        const gOppId = Object.keys(draft.players || {}).find(
          (id) => id !== initiatorPlayerId
        );
        const defenderPlayer = draft.players[gOppId];
        let defender = null;
        let defenderPlayerId = gOppId;
        if (token.targetInstanceId != null) {
          const targetRef = findCard(draft, token.targetInstanceId);
          defender = targetRef?.card;
          if (targetRef?.playerId) defenderPlayerId = targetRef.playerId;
        } else {
          defender = defenderPlayer?.zones?.active?.find((c) => !c.attachedTo);
        }
        const coinResult = wantsReflip
          ? flipAttackCoins(attack, activeRng)
          : token.coinResult;
        const { coin, headsCount, flips } = coinResult;
        if (flips.length > 0) {
          events.push({
            type: 'attackCoinFlipped',
            playerId: initiatorPlayerId,
            attackName: attack.name,
            coin,
            headsCount,
            flips,
            reflip: wantsReflip,
          });
        }
        draft.pendingChoice = null;
        resolveAttackEffectPhase(draft, {
          playerId: initiatorPlayerId,
          activeRng,
          events,
          attacker,
          defender,
          defenderPlayerId,
          oppId: gOppId,
          attack,
          attackerPlayer: resumer,
          attackerView,
          coin,
          headsCount,
          flips,
        });
      } else if (token.effectType === 'attackSteps') {
        // Design 030: finish the attack's steps, then pick the attack up where it paused —
        // before damage (re-enter the effect phase) or after it (the attack tail).
        draft.pendingChoice = null;
        const cont = token.context?.attack || {};
        const oppOfInitiator = Object.keys(draft.players || {}).find(
          (id) => id !== initiatorPlayerId
        );
        const done = runAttackSteps(draft, {
          steps: token.steps || [],
          fromStepIndex: token.stepIndex || 0,
          attackerId: token.sourceInstanceId,
          playerId: initiatorPlayerId,
          oppId: oppOfInitiator,
          activeRng,
          events,
          selection: payload.selection,
          context: token.context || {},
          budget: { count: token.budgetCount || 0 },
        });
        if (done && !isGameConcluded(draft)) {
          if (cont.phase === 'before') {
            const resumeCtx = attackResumeContext(draft, cont.resume || {}, { activeRng, events });
            if (resumeCtx) {
              resolveAttackEffectPhase(draft, {
                ...resumeCtx,
                ...(cont.values || {}),
                preStepsDone: true,
              });
            } else {
              // The attacker left the Active Spot before damage: the attack ends here.
              const resumer = draft.players[initiatorPlayerId];
              if (!resumer.flags) resumer.flags = {};
              resumer.flags.attackerAttacked = true;
              resolveCheckup(draft, { rng: activeRng, events, endingPlayerId: initiatorPlayerId });
              if (!isGameConcluded(draft)) {
                advanceTurn(draft, { nextPlayerId: oppOfInitiator, events });
              }
            }
          } else if (cont.tail) {
            finishAttackTail(draft, { tail: cont.tail, activeRng, events });
          }
        }
      } else if (token.effectType === 'attackDiscardScale') {
        // Discard-to-scale: discard the chosen Energy, then resume the attack's
        // effect phase with the discarded count driving the damage.
        draft.pendingChoice = null;
        const resumeCtx = attackResumeContext(draft, token, { activeRng, events });
        if (resumeCtx) {
          const energyDiscarded = discardScalingEnergy(draft, {
            playerId: initiatorPlayerId,
            selection: payload.selection,
            allowedIds: token.allowedIds || [],
            events,
          });
          resolveAttackEffectPhase(draft, { ...resumeCtx, energyDiscarded });
        }
      } else if (token.effectType === 'attackReturnEnergyBonus') {
        // Ninja Spinner: move the chosen Energy to hand (yes) or keep it (no),
        // then resume the attack with the bonus decision settled.
        draft.pendingChoice = null;
        const resumeCtx = attackResumeContext(draft, token, { activeRng, events });
        if (resumeCtx) {
          const accepted = Number((payload.selection || [])[0]) === 1;
          const moved =
            accepted &&
            moveAttachedEnergyToHand(draft, {
              playerId: initiatorPlayerId,
              attacker: resumeCtx.attacker,
              energyType: token.energyType,
              events,
            });
          resolveAttackEffectPhase(draft, {
            ...resumeCtx,
            energyReturned: Boolean(moved),
          });
        }
      } else if (token.effectType === 'attackMillPick') {
        // Palossand-GX: discard the chosen cards from the opponent's deck, then
        // the opponent shuffles the rest back.
        draft.pendingChoice = null;
        const resumeCtx = attackResumeContext(draft, token, { activeRng, events });
        if (resumeCtx) {
          const oppPlayer = draft.players[resumeCtx.oppId];
          const deck = oppPlayer?.zones?.deck || [];
          let picked = 0;
          for (const id of new Set(payload.selection || [])) {
            if (!(token.allowedIds || []).includes(id)) continue;
            const idx = deck.findIndex((c) => c.instanceId === id);
            if (idx < 0) continue;
            const [card] = deck.splice(idx, 1);
            const to = discardCardToPlayerZone(oppPlayer, card);
            events.push({
              type: 'cardMoved',
              instanceId: id,
              from: 'deck',
              to,
              playerId: resumeCtx.oppId,
              reason: 'attack-mill',
            });
            picked++;
          }
          shuffleDeckWithRng(oppPlayer, activeRng);
          resolveAttackEffectPhase(draft, { ...resumeCtx, milledMatches: picked });
        }
      } else if (token.effectType === 'attackAttachSpread') {
        // Aura Jab: attach one Energy to the picked Benched Pokémon, then ask again
        // until the count is spent or the player stops; then end the turn.
        draft.pendingChoice = null;
        const player = draft.players[initiatorPlayerId];
        const pick = (payload.selection || [])[0];
        const root = (player?.zones?.bench || []).find(
          (c) => !c.attachedTo && c.instanceId === pick
        );
        let remaining = token.remaining;
        if (player && root) {
          const energy = (player.zones.discard || []).find((c) =>
            matchesSearch(c, token.spread.search)
          );
          if (energy) {
            attachToRoot(player, energy, root, events);
            remaining -= 1;
          }
        } else {
          remaining = 0;
        }
        const asked =
          !isGameConcluded(draft) &&
          raiseSpreadAttachChoice(draft, {
            playerId: initiatorPlayerId,
            attackName: token.attackName,
            spread: token.spread,
            remaining,
            token: {
              initiatorPlayerId: token.initiatorPlayerId,
              attackName: token.attackName,
              attackerId: token.attackerId,
              targetInstanceId: token.targetInstanceId,
              coinResult: token.coinResult,
              effectType: 'attackAttachSpread',
              oppId: token.oppId,
            },
          });
        if (!asked && !isGameConcluded(draft)) {
          resolveCheckup(draft, {
            rng: activeRng,
            events,
            endingPlayerId: initiatorPlayerId,
          });
          if (!isGameConcluded(draft)) {
            advanceTurn(draft, { nextPlayerId: token.oppId, events });
          }
        }
      } else if (token.effectType === 'attackAttachMilled') {
        // Raikou: attach the milled Energy to the chosen Pokémon, then end the turn
        // the attack's suspension held open.
        draft.pendingChoice = null;
        const player = draft.players[initiatorPlayerId];
        const root = [
          ...(player?.zones?.active || []),
          ...(player?.zones?.bench || []),
        ].find(
          (c) => !c.attachedTo && c.instanceId === (payload.selection || [])[0]
        );
        if (player && root) {
          attachMilledCards(player, token.cardIds || [], root, events);
        }
        if (!isGameConcluded(draft)) {
          resolveCheckup(draft, {
            rng: activeRng,
            events,
            endingPlayerId: initiatorPlayerId,
          });
          if (!isGameConcluded(draft)) {
            advanceTurn(draft, { nextPlayerId: token.oppId, events });
          }
        }
      } else if (token.effectType === 'attackMillCount') {
        // Deck mill "up to N" / "you may": option id = count + 1.
        draft.pendingChoice = null;
        const resumeCtx = attackResumeContext(draft, token, { activeRng, events });
        if (resumeCtx) {
          const pick = Number((payload.selection || [])[0]);
          const millCount = Number.isInteger(pick) && pick > 0 ? pick - 1 : 0;
          resolveAttackEffectPhase(draft, { ...resumeCtx, millCount });
        }
      } else if (token.effectType === 'retreat') {
        // The player clicked the Benched Pokémon to switch in; pay the retreat
        // cost and perform the swap (retreat does not end the turn).
        applyRetreatSwap(draft, {
          playerId: initiatorPlayerId,
          benchInstanceId: (payload.selection || [])[0] ?? null,
          discardEnergyIds: token.discardEnergyIds || [],
          events,
        });
        draft.pendingChoice = null;
      } else if (token.effectType === 'promote') {
        // Active-KO promotion: the player clicked the Benched Pokémon to promote.
        // `settlePromotionChoices` in the command tail continues any prize settlement.
        promoteBenchToActive(draft, {
          playerId: initiatorPlayerId,
          instanceId: (payload.selection || [])[0],
          events,
        });
        draft.pendingChoice = null;
      } else if (token.effectType === 'stadium') {
        const result = executeStadium(draft, {
          playerId: initiatorPlayerId,
          activeRng,
          events,
          selection: payload.selection,
          resumeToken: token,
        });
        if (result?.gameWinner && !result.pendingChoice) {
          setGameEnded(draft, {
            winner: result.gameWinner,
            reason: result.gameReason || 'stadium effect',
            events,
          });
        } else if (result?.turnEnds && !result.pendingChoice) {
          endTurnFromEffect(draft, {
            playerId: initiatorPlayerId,
            activeRng,
            events,
          });
        }
      } else if (token.effectType === 'attack') {
        // Chosen-target attack: the player clicked the opponent Pokémon to damage.
        // The rest of the attack's effects already ran before the suspension.
        if (token.attackTarget) {
          const targetPlayer = draft.players[initiatorPlayerId];
          const selection = Array.isArray(payload.selection)
            ? payload.selection
            : [];
          const dealt = applyAttackTargets(draft, {
            selection,
            clause: token.attackTarget,
            defenderPlayerId: token.oppId,
            attackerPlayerId: initiatorPlayerId,
            attackName: token.effectiveAttack?.name || '',
            events,
          });
          // "in any way you like": one counter per click until all are placed.
          const remaining = token.attackTarget.distributable
            ? (token.attackTarget.remaining || 1) - 1
            : 0;
          if (remaining > 0) {
            const options = attackTargetOptions(draft, token.oppId, 'any');
            if (options.length > 0) {
              draft.pendingChoice = createPendingChoice({
                player: initiatorPlayerId,
                source: 'attack',
                prompt: `${token.effectiveAttack?.name || 'Attack'}: Place a damage counter (${remaining} left)`,
                options,
                min: 1,
                max: 1,
                resumeToken: {
                  ...token,
                  attackTarget: { ...token.attackTarget, remaining },
                },
              });
              break;
            }
          }
          draft.pendingChoice = null;
          events.push({
            type: 'attackExecuted',
            attackerId: targetPlayer?.zones?.active?.find((c) => !c.attachedTo)
              ?.instanceId,
            attackName: token.effectiveAttack?.name,
            damage: token.damage || 0,
            benchDealt: dealt,
            playerId: initiatorPlayerId,
          });
          // The suspended attack was a GX attack; spend the limit on resolution too.
          if (isGxAttack(token.effectiveAttack)) {
            const oncePerGame = ensureOncePerGame(draft, initiatorPlayerId);
            if (oncePerGame && !oncePerGame.gxUsed) {
              oncePerGame.gxUsed = true;
              events.push({
                type: 'gxAttackUsed',
                playerId: initiatorPlayerId,
                attackName: token.effectiveAttack?.name,
              });
            }
          }
          if (targetPlayer) {
            if (!targetPlayer.flags) targetPlayer.flags = {};
            targetPlayer.flags.attackerAttacked = true;
          }
          if (!isGameConcluded(draft)) {
            resolveCheckup(draft, {
              rng: activeRng,
              events,
              endingPlayerId: initiatorPlayerId,
            });
            if (!isGameConcluded(draft)) {
              advanceTurn(draft, { nextPlayerId: token.oppId, events });
            }
          }
          break;
        }
        const player = draft.players[initiatorPlayerId];
        const selection = Array.isArray(payload.selection)
          ? payload.selection
          : [];
        const stages = Array.isArray(token.searchStages)
          ? token.searchStages
          : token.searchParams
            ? [token.searchParams]
            : [];
        const currentIndex = token.searchStageIndex ?? 0;
        const stage = stages[currentIndex] || stages[0] || {};
        const dest = stage.destination || 'hand';
        // "attach it to this Pokémon" (Charge): the searched Energy goes onto the
        // attacker, not into hand. Falls back to the active Pokémon when the
        // attacker id is missing.
        const attachTarget =
          dest === 'attach'
            ? token.attackerId != null
              ? findCard(draft, token.attackerId)?.card ||
                player.zones.active?.find((c) => !c.attachedTo)
              : player.zones.active?.find((c) => !c.attachedTo)
            : null;

        for (const sel of selection) {
          const instId = typeof sel === 'object' ? sel.instanceId : sel;
          const idx = player.zones.deck.findIndex(
            (c) => c.instanceId === instId
          );
          if (idx >= 0) {
            const [card] = player.zones.deck.splice(idx, 1);
            if (dest === 'attach' && attachTarget) {
              card.enteredPlayTurn = draft.turn.number;
              attachToRoot(player, card, attachTarget, events);
            } else if (dest === 'bench') {
              card.enteredPlayTurn = draft.turn.number;
              player.zones.bench.push(card);
              events.push({
                type: 'cardMoved',
                instanceId: card.instanceId,
                from: 'deck',
                to: 'bench',
                playerId: initiatorPlayerId,
              });
            } else {
              player.zones.hand.push(card);
              events.push({
                type: 'cardMoved',
                instanceId: card.instanceId,
                from: 'deck',
                to: 'hand',
                playerId: initiatorPlayerId,
              });
            }
          }
        }

        // A staged search resumes with the next stage that still has a match;
        // only after the final stage does the deck shuffle and the turn end.
        const nextChoice = buildAttackSearchChoice(draft, {
          playerId: initiatorPlayerId,
          oppId: token.oppId,
          attackerId: token.attackerId,
          stages,
          fromIndex: currentIndex + 1,
        });
        if (nextChoice) {
          draft.pendingChoice = nextChoice;
          break;
        }

        player.zones.deck = activeRng.shuffle(player.zones.deck);
        events.push({
          type: 'zoneShuffled',
          zoneId: 'deck',
          playerId: initiatorPlayerId,
        });

        draft.pendingChoice = null;

        if (!isGameConcluded(draft)) {
          resolveCheckup(draft, {
            rng: activeRng,
            events,
            endingPlayerId: initiatorPlayerId,
          });
          if (!isGameConcluded(draft)) {
            advanceTurn(draft, { nextPlayerId: token.oppId, events });
          }
        }
      } else {
        draft.pendingChoice = null;
      }
      break;
    }

    // --- Zone ops (design 002 slice 3.4a). Shuffles always use the server's own
    // activeRng (Fisher-Yates), never a client-supplied order — a client picking its own
    // shuffle would be able to stack its own deck. ---

    case 'shuffleIntoDeck': {
      const player = draft.players[playerId];
      const srcZone = player.zones[payload.from];
      if (payload.index >= 0 && payload.index < srcZone.length) {
        const [card] = srcZone.splice(payload.index, 1);
        player.zones.deck.push(card);
        player.zones.deck = activeRng.shuffle(player.zones.deck);
        events.push({
          type: 'cardMoved',
          instanceId: card.instanceId,
          from: payload.from,
          to: 'deck',
          playerId,
        });
        events.push({ type: 'zoneShuffled', zoneId: 'deck', playerId });
      }
      break;
    }

    case 'moveToDeckTop': {
      const player = draft.players[playerId];
      const srcZone = player.zones[payload.from];
      if (payload.index >= 0 && payload.index < srcZone.length) {
        const [card] = srcZone.splice(payload.index, 1);
        player.zones.deck.unshift(card);
        events.push({
          type: 'cardMoved',
          instanceId: card.instanceId,
          from: payload.from,
          to: 'deck',
          targetIndex: 0,
          playerId,
        });
      }
      break;
    }

    case 'switchWithDeckTop': {
      const player = draft.players[playerId];
      const srcZone = player.zones[payload.from];
      const deck = player.zones.deck;
      if (
        payload.index >= 0 &&
        payload.index < srcZone.length &&
        deck.length > 0
      ) {
        const [card] = srcZone.splice(payload.index, 1);
        const [topCard] = deck.splice(0, 1);
        deck.unshift(card);
        srcZone.splice(payload.index, 0, topCard);
        events.push({
          type: 'cardsSwapped',
          deckInstanceId: card.instanceId,
          zoneInstanceId: topCard.instanceId,
          zoneId: payload.from,
          playerId,
        });
      }
      break;
    }

    case 'shuffleZone': {
      const player = draft.players[playerId];
      player.zones[payload.zoneId] = activeRng.shuffle(
        player.zones[payload.zoneId]
      );
      events.push({ type: 'zoneShuffled', zoneId: payload.zoneId, playerId });
      break;
    }

    case 'shuffleBottom': {
      const player = draft.players[playerId];
      const moved = activeRng.shuffle(player.zones[payload.zoneId].splice(0));
      player.zones.deck.push(...moved);
      events.push({
        type: 'zoneMovedToDeckBottom',
        zoneId: payload.zoneId,
        count: moved.length,
        playerId,
      });
      break;
    }

    case 'shuffleAll': {
      const player = draft.players[playerId];
      const moved = player.zones[payload.zoneId].splice(0);
      player.zones.deck.push(...moved);
      player.zones.deck = activeRng.shuffle(player.zones.deck);
      events.push({
        type: 'zoneShuffledIntoDeck',
        zoneId: payload.zoneId,
        count: moved.length,
        playerId,
      });
      break;
    }

    case 'discardAll': {
      const player = draft.players[playerId];
      const moved = player.zones[payload.zoneId].splice(0);
      // Prism Star cards route to the Lost Zone (App. 17); the rest to discard.
      const routed = { discard: 0, lostZone: 0 };
      for (const card of moved) routed[discardCardToPlayerZone(player, card)]++;
      if (routed.discard > 0) {
        events.push({
          type: 'zoneMoved',
          from: payload.zoneId,
          to: 'discard',
          count: routed.discard,
          playerId,
        });
      }
      if (routed.lostZone > 0) {
        events.push({
          type: 'zoneMoved',
          from: payload.zoneId,
          to: 'lostZone',
          count: routed.lostZone,
          playerId,
        });
      }
      break;
    }

    case 'lostZoneAll': {
      const player = draft.players[playerId];
      const moved = player.zones[payload.zoneId].splice(0);
      player.zones.lostZone.push(...moved);
      events.push({
        type: 'zoneMoved',
        from: payload.zoneId,
        to: 'lostZone',
        count: moved.length,
        playerId,
      });
      break;
    }

    case 'handAll': {
      const player = draft.players[playerId];
      const moved = player.zones[payload.zoneId].splice(0);
      player.zones.hand.push(...moved);
      events.push({
        type: 'zoneMoved',
        from: payload.zoneId,
        to: 'hand',
        count: moved.length,
        playerId,
      });
      break;
    }

    case 'leaveAll': {
      const player = draft.players[playerId];
      const srcZone = player.zones[payload.from];
      const destZone = player.zones[payload.to];
      const moved = [];
      for (let i = srcZone.length - 1; i >= 0; i--) {
        if (isPokemon(srcZone[i])) {
          const [card] = srcZone.splice(i, 1);
          moved.unshift(card);
        }
      }
      destZone.push(...moved);
      events.push({
        type: 'zoneMoved',
        from: payload.from,
        to: payload.to,
        count: moved.length,
        playerId,
      });
      break;
    }

    case 'discardAndDraw': {
      const player = draft.players[playerId];
      const hand = player.zones.hand;
      const discarded = hand.splice(0);
      for (const card of discarded) discardCardToPlayerZone(player, card);
      const count = Math.min(payload.count ?? 0, player.zones.deck.length);
      const drawn = player.zones.deck.splice(0, count);
      hand.push(...drawn);
      events.push({
        type: 'handDiscardedAndDrawn',
        discarded: discarded.length,
        drawn: drawn.map((c) => ({ instanceId: c.instanceId })),
        playerId,
      });
      break;
    }

    case 'shuffleAndDraw': {
      const player = draft.players[playerId];
      const hand = player.zones.hand;
      const returned = hand.splice(0);
      player.zones.deck.push(...returned);
      player.zones.deck = activeRng.shuffle(player.zones.deck);
      const count = Math.min(payload.count ?? 0, player.zones.deck.length);
      const drawn = player.zones.deck.splice(0, count);
      hand.push(...drawn);
      events.push({
        type: 'handShuffledIntoDeckAndDrawn',
        returned: returned.length,
        drawn: drawn.map((c) => ({ instanceId: c.instanceId })),
        playerId,
      });
      break;
    }

    case 'shuffleBottomAndDraw': {
      const player = draft.players[playerId];
      const hand = player.zones.hand;
      const returned = activeRng.shuffle(hand.splice(0));
      player.zones.deck.push(...returned);
      const count = Math.min(payload.count ?? 0, player.zones.deck.length);
      const drawn = player.zones.deck.splice(0, count);
      hand.push(...drawn);
      events.push({
        type: 'handShuffledToDeckBottomAndDrawn',
        returned: returned.length,
        drawn: drawn.map((c) => ({ instanceId: c.instanceId })),
        playerId,
      });
      break;
    }

    case 'shufflePrizesToDeckBottom': {
      const player = draft.players[playerId];
      const prizes = player.zones.prizes;
      const shuffled = activeRng.shuffle(prizes.splice(0));
      player.zones.deck.push(...shuffled);
      events.push({
        type: 'prizesShuffledToDeckBottom',
        count: shuffled.length,
        playerId,
      });
      break;
    }

    // --- Reveal/hide (I19). A player may only flip `card.revealed` on their own
    // zone (draft.players[playerId] is always the sender's own state, never the
    // opponent's) — the flag is symmetric in view.mjs's redaction, so setting it
    // here is enough to unhide the card in both players' views. ---

    case 'revealShortcut': {
      const player = draft.players[playerId];
      const zone = player.zones[payload.zoneId];
      const card = zone?.[payload.index];
      if (card) {
        card.revealed = true;
        events.push({
          type: 'cardRevealed',
          instanceId: card.instanceId,
          zoneId: payload.zoneId,
          playerId,
        });
      }
      break;
    }

    case 'hideShortcut': {
      const player = draft.players[playerId];
      const zone = player.zones[payload.zoneId];
      const card = zone?.[payload.index];
      if (card) {
        card.revealed = false;
        events.push({
          type: 'cardHidden',
          instanceId: card.instanceId,
          zoneId: payload.zoneId,
          playerId,
        });
      }
      break;
    }

    case 'revealCards': {
      const player = draft.players[playerId];
      const zone = player.zones[payload.zoneId] || [];
      for (const card of zone) card.revealed = true;
      events.push({
        type: 'zoneRevealed',
        zoneId: payload.zoneId,
        count: zone.length,
        playerId,
      });
      break;
    }

    case 'hideCards': {
      const player = draft.players[playerId];
      const zone = player.zones[payload.zoneId] || [];
      for (const card of zone) card.revealed = false;
      events.push({
        type: 'zoneHidden',
        zoneId: payload.zoneId,
        count: zone.length,
        playerId,
      });
      break;
    }

    // --- Board ops (design 002 slice 3.4b). Legacy targets the literal 'board' zone. ---

    case 'discardBoard': {
      const player = draft.players[playerId];
      const moved = player.zones.board.splice(0);
      const routed = { discard: 0, lostZone: 0 };
      for (const card of moved) routed[discardCardToPlayerZone(player, card)]++;
      if (routed.discard > 0) {
        events.push({
          type: 'zoneMoved',
          from: 'board',
          to: 'discard',
          count: routed.discard,
          playerId,
        });
      }
      if (routed.lostZone > 0) {
        events.push({
          type: 'zoneMoved',
          from: 'board',
          to: 'lostZone',
          count: routed.lostZone,
          playerId,
        });
      }
      break;
    }

    case 'handBoard': {
      const player = draft.players[playerId];
      const moved = player.zones.board.splice(0);
      player.zones.hand.push(...moved);
      events.push({
        type: 'zoneMoved',
        from: 'board',
        to: 'hand',
        count: moved.length,
        playerId,
      });
      break;
    }

    case 'shuffleBoard': {
      const player = draft.players[playerId];
      const moved = player.zones.board.splice(0);
      player.zones.deck.push(...moved);
      player.zones.deck = activeRng.shuffle(player.zones.deck);
      events.push({
        type: 'zoneShuffledIntoDeck',
        zoneId: 'board',
        count: moved.length,
        playerId,
      });
      break;
    }

    case 'lostZoneBoard': {
      const player = draft.players[playerId];
      const moved = player.zones.board.splice(0);
      player.zones.lostZone.push(...moved);
      events.push({
        type: 'zoneMoved',
        from: 'board',
        to: 'lostZone',
        count: moved.length,
        playerId,
      });
      break;
    }

    // Deck bootstrap (design 002 slice 3.4e / I16). Mints instanceId through the same
    // draft.nextInstanceId counter every other card-creating command uses, and — critically —
    // runs through applyCommand so it lands in commandLog. Undo's replay depends on this: before
    // this command existed, deck loading was a direct mutation on gameRoom.state outside the
    // log, so replaying commandLog from a fresh seeded state reconstructed empty decks.
    case 'loadDeck': {
      const player = draft.players[playerId];
      const deckData = Array.isArray(payload.deckData) ? payload.deckData : [];
      player.zones.deck = [];
      let syncInstance = 0;
      for (const item of deckData) {
        const [quantity, cardName, cardType, imageURL, number, set, tcgId] =
          Array.isArray(item)
            ? item
            : [
                item.quantity,
                item.name,
                item.type,
                item.imageURL,
                item.number,
                item.set,
                item.tcgId,
              ];
        // Real decklists send quantity as a string ("4"); build-deck.js's loop
        // coerces it, so the server must count the same cards the client does.
        const parsedQuantity = Number(quantity);
        const cardCount =
          Number.isInteger(parsedQuantity) && parsedQuantity > 0
            ? parsedQuantity
            : 1;
        for (let i = 0; i < cardCount; i++) {
          const card = createCard({
            instanceId: mintInstanceId(draft),
            syncInstance,
            ownerId: playerId,
            name: cardName || '',
            type: cardType || '',
            src: imageURL || '',
            number: number != null ? String(number) : '',
            set: set || '',
            id: tcgId || '',
          });
          syncInstance++;
          player.zones.deck.push(card);
        }
      }
      if (deckData.length > 0) {
        player.deckList = [...deckData];
      }
      events.push({
        type: 'deckLoaded',
        playerId,
        count: player.zones.deck.length,
      });
      break;
    }

    // Design 002 I26: applies printed card data the deck rows never carried. Addresses by
    // syncInstance across every zone (cards have usually been dealt into hand/prizes by the
    // time TCGdex enrichment resolves) and updates in place — it must never rebuild a zone,
    // since it can legally arrive mid-game.
    case 'cardStats': {
      const player = draft.players[playerId];
      const stats = Array.isArray(payload?.stats) ? payload.stats : [];
      const bySyncInstance = new Map();
      for (const zone of Object.values(player?.zones || {})) {
        if (!Array.isArray(zone)) continue;
        for (const card of zone) {
          if (card?.syncInstance != null)
            bySyncInstance.set(card.syncInstance, card);
        }
      }

      let updated = 0;
      for (const entry of stats) {
        const card = bySyncInstance.get(entry.syncInstance);
        if (!card) continue;
        if (entry.hp != null) card.hp = Number(entry.hp);
        if (Array.isArray(entry.attacks))
          card.attacks = entry.attacks.map((a) => ({ ...a }));
        if (Array.isArray(entry.types)) card.types = [...entry.types];
        if (entry.weakness !== undefined) card.weakness = entry.weakness;
        if (entry.resistance !== undefined) card.resistance = entry.resistance;
        if (Array.isArray(entry.retreatCost))
          card.retreatCost = [...entry.retreatCost];
        if (entry.stage != null) card.stage = entry.stage;
        if (typeof entry.evolvesFrom === 'string')
          card.evolvesFrom = entry.evolvesFrom;
        if (Array.isArray(entry.abilities)) {
          card.abilities = entry.abilities
            .filter((a) => a && typeof a.text === 'string')
            .map((a) => ({ name: String(a.name || ''), text: a.text }));
        }
        if (typeof entry.text === 'string') card.text = entry.text;
        if (typeof entry.trainerType === 'string')
          card.trainerType = entry.trainerType;
        if (Array.isArray(entry.subtypes))
          card.subtypes = entry.subtypes.map(String);
        updated += 1;
      }

      events.push({ type: 'cardStatsApplied', playerId, count: updated });
      break;
    }

    // undo (design 002 slice 3.4e / D6, I16): deterministic commandLog replay minus tail,
    // rebuilt from a fresh seeded state. Returns directly — the replayed state already carries
    // its own correct commandLog/stateVersion/rngCursor, so the common tail below (which would
    // append this 'undo' command itself) must not run. Undo commands are therefore never
    // themselves present in commandLog — only real game actions are, which is what keeps replay
    // well-defined (no undo-of-undo bookkeeping to unwind).
    case 'undo': {
      const removeCount =
        Number.isInteger(payload?.count) && payload.count > 0
          ? payload.count
          : 1;
      const log = state.commandLog;
      // Edge Case 18: never rewind past the start of this game's log.
      if (log.length < removeCount) {
        return {
          state,
          events: [],
          pendingChoice: state.pendingChoice,
          error: 'nothing_to_undo',
          reason: `Cannot undo ${removeCount} action(s); command log only has ${log.length}`,
        };
      }

      const keptLog = log.slice(0, log.length - removeCount);

      let replayState = createGameState({
        gameId: state.gameId,
        seed: state.seed,
        rulesEnabled: state.rulesEnabled,
        players: Object.fromEntries(
          Object.entries(state.players).map(([pid, p]) => [
            pid,
            { playerId: pid, username: p.username },
          ])
        ),
      });

      const replayRng = createRng(state.seed);
      for (const loggedCommand of keptLog) {
        const result = applyCommand(replayState, loggedCommand, replayRng);
        if (result.error) {
          return {
            state,
            events: [],
            pendingChoice: state.pendingChoice,
            error: 'undo_replay_failed',
            reason: `Replay diverged at logged command "${loggedCommand.type}": ${result.reason || result.error}`,
          };
        }
        replayState = result.state;
      }

      return {
        state: replayState,
        events: [
          { type: 'undo', count: removeCount, remaining: keptLog.length },
        ],
        pendingChoice: replayState.pendingChoice,
        error: null,
      };
    }

    default:
      break;
  }

  resolveDamageCounterKnockouts(draft, { events });
  settlePromotionChoices(draft, { events });
  settlePrizeEntitlements(draft, { events });
  clearFaceDownOffBoard(draft);
  delete draft.__attackEffectPhase;

  // Advance state version and append to commandLog
  draft.stateVersion = (state.stateVersion || 0) + 1;
  draft.commandLog.push({
    ...command,
    stateVersion: draft.stateVersion,
  });

  if (activeRng && typeof activeRng.cursor === 'number') {
    draft.rngCursor = activeRng.cursor;
  }

  return {
    state: draft,
    events,
    pendingChoice: draft.pendingChoice,
    error: null,
  };
}
