/**
 * @file Turn flow: between-turns Stadium damage, deferred KOs, end-of-turn Tools and attached
 * Trainers, Checkup and end-of-turn Abilities, resolveCheckup, advanceTurn, and the
 * setup/pass/takeTurn/loadDeck/cardStats commands. Split out of reduce.mjs (design 073 B, I250);
 * reduce.mjs stays the public entry.
 */

import { discardCardToPlayerZone } from '../state.mjs';
import { createCard, mintInstanceId } from '../cards.mjs';
import { DECK_FORMAT_TCG, isDeckFormat } from '../formats.mjs';
import { deckFormatMismatch, setupGame } from '../setup.mjs';
import { legacyTrainerType } from '../rules/legacy-trainer-type.mjs';
import {
  legacyAttachedTrainer, attachedTrainerTurnEnd,
} from '../rules/legacy-attached-trainer.mjs';
import { toolDiscardsAtEndOfTurn } from '../rules/tool-attacks.mjs';
import { stadiumCheckupCoinModifiers } from '../rules/stadium-triggers.mjs';
import {
  inPlayEntries, parseCheckupAbilities, parseBetweenTurnsAbilities, resolveBetweenTurnsTargets,
  parseEndOfTurnAbilities,
} from '../rules/ability-triggers.mjs';
import { cardEffectShielded } from '../effects/trainer-steps.mjs';
import {
  runEndOfTurnSpecialEnergies, applySpecialEnergyStatusImmunity, discardEndOfTurnSpecialEnergies,
} from '../effects/special-energy.mjs';
import { stadiumBetweenTurnsDamageFor, stadiumBlocksHealing } from '../rules/stadium-effects.mjs';
import { removeCondition, hasCondition, hasAnyCondition } from '../rules/special-conditions.mjs';
import {
  activeAttackMarkers, cardEffectiveHp, setGameEnded, isGameConcluded, abilitySideContext,
} from './shared.mjs';
import { settleKnockOutWins, handleKnockout } from './knockout.mjs';

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
        // Lunatone New Moon (I219): "prevent all effects of any Stadium done to your Pokémon in play".
        if (cardEffectShielded(draft, { owner: player, root: mon, source: 'Stadium' })) continue;
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
  // Every lethal Pokémon is Knocked Out first and the win is judged once (I78): a double KO
  // is a tiebreak, not a win for whichever side the loop reached first.
  let knockedOut = false;
  for (const pid of playerIds) {
    const player = draft.players[pid];
    const oppId = playerIds.find((id) => id !== pid);
    for (const zone of [player.zones?.active, player.zones?.bench]) {
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
            deferWin: true,
          });
          knockedOut = true;
        }
      }
    }
  }
  if (knockedOut) settleKnockOutWins(draft, { events });
}

// "At the end of your opponent's next turn, the Defending Pokémon will be Knocked Out."
// The marker is live only on that turn, and only while the Pokémon is still Active and
// unevolved, so a switched-out or evolved target is spared.
function resolveDeferredKnockouts(draft, { events }) {
  // Unown I Hidden Power: "Put that card face up at the end of your opponent's next turn."
  for (const pid of Object.keys(draft.players || {})) {
    for (const zoneId of Object.keys(draft.players[pid].zones || {})) {
      for (const card of draft.players[pid].zones?.[zoneId] || []) {
        if (card.faceDownUntilTurn == null || card.faceDownUntilTurn > (draft.turn?.number || 0)) continue;
        delete card.asEnergy;
        delete card.faceDownUntilTurn;
        delete card.faceDownHostId;
        events.push({ type: 'energyFaceUp', instanceId: card.instanceId, playerId: pid });
      }
    }
  }
  for (const pid of Object.keys(draft.players || {})) {
    const active = draft.players[pid].zones?.active?.find((c) => !c.attachedTo);
    // Wobbuffet Shadow Tag: "Put 7 damage counters on the Defending Pokémon at the end of your
    // opponent's next turn."
    const counters = activeAttackMarkers(draft, pid, active).find(
      (m) => m.kind === 'deferredCounters' && m.untilTurn === draft.turn?.number
    );
    if (counters) {
      active.damage = (active.damage || 0) + counters.count * 10;
      events.push({ type: 'damageUpdated', instanceId: active.instanceId, damage: active.damage });
      const hp = cardEffectiveHp(draft, active, pid);
      if (hp > 0 && active.damage >= hp) {
        handleKnockout(draft, {
          victimPlayerId: pid,
          attackerPlayerId: Object.keys(draft.players).find((id) => id !== pid),
          victim: active,
          events,
        });
        continue;
      }
    }
    const marker = activeAttackMarkers(draft, pid, active).find((m) => m.kind === 'deferredKnockOut');
    if (!marker || marker.untilTurn !== draft.turn?.number) continue;
    events.push({ type: 'deferredKnockOut', instanceId: active.instanceId, playerId: pid, sourceAttack: marker.sourceAttack });
    handleKnockout(draft, {
      victimPlayerId: pid,
      attackerPlayerId: Object.keys(draft.players).find((id) => id !== pid),
      victim: active,
      events,
    });
  }
}

// TM/Cube Items (design 035 slice 7): "At the end of your turn, discard <tool>." SV TMs
// attach as ordinary Tools, so the printed clause is read here, not only the attach-time flag.
// The sweep runs for the player whose turn is ending, after Pokémon Checkup.
function discardEndOfTurnTools(draft, { endingPlayerId, events }) {
  const player = draft.players?.[endingPlayerId];
  if (!player) return;
  for (const zoneId of ['active', 'bench']) {
    const zone = player.zones?.[zoneId] || [];
    for (const card of [...zone]) {
      if (!card.attachedTo) continue;
      if (!card.discardAtEndOfTurn && !toolDiscardsAtEndOfTurn(card)) continue;
      zone.splice(zone.indexOf(card), 1);
      card.attachedTo = null;
      delete card.discardAtEndOfTurn;
      const to = discardCardToPlayerZone(player, card);
      events.push({
        type: 'cardMoved',
        instanceId: card.instanceId,
        from: zoneId,
        to,
        playerId: player.playerId,
      });
    }
  }
}

/** Takes an attached attach-Trainer off its Pokémon to its owner's discard pile or hand. */
function detachLegacyTrainer(player, zoneId, card, outcome, events) {
  const zone = player.zones[zoneId];
  zone.splice(zone.indexOf(card), 1);
  card.attachedTo = null;
  delete card.attachedTurn;
  delete card.reflipUsed;
  let to = 'hand';
  if (outcome === 'return') player.zones.hand.push(card);
  else to = discardCardToPlayerZone(player, card);
  events.push({ type: 'cardMoved', instanceId: card.instanceId, from: zoneId, to, playerId: player.playerId });
}

/**
 * I224: the printed timers of WotC attach-Trainers at the end of a turn — PlusPower, Magnifier
 * and Sabrina's ESP at the end of their owner's turn, Defender at the end of the opponent's next
 * turn, Charity back to the hand (a Knock Out has already discarded it with its Pokémon).
 */
function settleAttachedTrainersAtTurnEnd(draft, { events }) {
  const turnNumber = draft.turn?.number || 1;
  for (const player of Object.values(draft.players || {})) {
    for (const zoneId of ['active', 'bench']) {
      for (const card of [...(player.zones?.[zoneId] || [])]) {
        if (card.attachedTo == null) continue;
        const outcome = attachedTrainerTurnEnd(card, turnNumber);
        if (outcome) detachLegacyTrainer(player, zoneId, card, outcome, events);
      }
    }
  }
}

/**
 * Klefki Wonder Lock (STS 80): "If this card is attached to a Pokémon, discard this card at the
 * end of your opponent's turn." The attach stamps the turn it lasts until (asTool.discardAtEndOfTurn).
 */
function discardExpiredSelfTools(draft, { events }) {
  const turnNumber = draft.turn?.number || 1;
  for (const player of Object.values(draft.players || {})) {
    for (const zoneId of ['active', 'bench']) {
      const zone = player.zones?.[zoneId] || [];
      for (const card of [...zone]) {
        const until = card.attachedTo != null ? card.asTool?.discardAtEndOfTurn : null;
        if (until == null || until > turnNumber) continue;
        zone.splice(zone.indexOf(card), 1);
        card.attachedTo = null;
        delete card.asTool;
        const to = discardCardToPlayerZone(player, card);
        events.push({ type: 'cardMoved', instanceId: card.instanceId, from: zoneId, to, playerId: player.playerId });
      }
    }
  }
}

/** Koga's Ninja Trick (gym2-115): "If this Pokémon goes to your Bench, discard this card." */
export function discardBenchedAttachedTrainers(draft, { events }) {
  for (const player of Object.values(draft.players || {})) {
    for (const card of [...(player.zones?.bench || [])]) {
      if (card.attachedTo == null || legacyAttachedTrainer(card)?.discard !== 'whenBenched') continue;
      detachLegacyTrainer(player, 'bench', card, 'discard', events);
    }
  }
}

/**
 * Pokémon Checkup damage from abilities (design 034 slice 4): Froslass, Magmortar,
 * Pecharunt, Team Rocket's Tyranitar, Trevenant. Applied after the per-condition
 * Checkup damage and before between-turns Stadium damage, with a Knockout sweep.
 */
function applyCheckupAbilities(draft, { events, ctx, betweenEffects = [] }) {
  const entries = inPlayEntries(draft);
  const effects = parseCheckupAbilities(entries, ctx).map((effect) => ({ ...effect, fromAbility: true }));
  for (const effect of betweenEffects) {
    if (effect.kind !== 'damage') continue;
    const targets = resolveBetweenTurnsTargets(effect, entries, effect.playerId);
    if (targets.length > 0) effects.push({ ...effect, targets });
  }
  const affected = [];
  for (const effect of effects) {
    for (const target of effect.targets) {
      // I219: "Prevent all effects of your opponent's Pokémon's Abilities done to this Pokémon."
      if (
        effect.fromAbility &&
        target.playerId !== effect.playerId &&
        cardEffectShielded(draft, { owner: draft.players[target.playerId], root: target.card, source: 'Ability' })
      ) {
        continue;
      }
      const damage = effect.count * 10;
      target.card.damage = (target.card.damage || 0) + damage;
      events.push({
        type: 'checkupAbilityDamage',
        source: effect.source,
        instanceId: target.card.instanceId,
        playerId: target.playerId,
        damage,
      });
      affected.push(target);
    }
  }
  // Between-turns heals resolve before the Knock Out sweep, so a heal and the
  // damage it offsets in the same phase cancel instead of Knocking Out (I163).
  for (const effect of betweenEffects) {
    if (effect.kind !== 'heal') continue;
    if (stadiumBlocksHealing(draft.stadium)) continue;
    const targets = resolveBetweenTurnsTargets(effect, entries, effect.playerId);
    for (const { card } of targets) {
      const before = card.damage || 0;
      if (before <= 0) continue;
      card.damage = Math.max(0, before - effect.amount);
      events.push({
        type: 'damageUpdated',
        instanceId: card.instanceId,
        damage: card.damage,
        healed: before - card.damage,
        source: effect.source,
      });
    }
  }
  for (const { card, playerId } of affected) {
    if (isGameConcluded(draft)) break;
    const hp = cardEffectiveHp(draft, card, playerId);
    if (hp > 0 && (card.damage || 0) >= hp) {
      handleKnockout(draft, {
        victimPlayerId: playerId,
        attackerPlayerId: Object.keys(draft.players || {}).find(
          (id) => id !== playerId
        ),
        victim: card,
        events,
      });
    }
  }
}

/**
 * Mandatory end-of-turn ability effects (Great Tusk ex Quaking Demolition:
 * discard the top 5 cards of your deck while it is in the Active Spot). Optional
 * end-of-turn abilities are activated through useAbility instead.
 */
function applyEndOfTurnAbilities(draft, { events, ctx, endingPlayerId }) {
  if (!endingPlayerId) return;
  const entries = inPlayEntries(draft).filter(
    (entry) => entry.playerId === endingPlayerId
  );
  const effects = parseEndOfTurnAbilities(entries, ctx);
  for (const effect of effects) {
    if (effect.kind !== 'discardTop' || !(effect.n > 0)) continue;
    const player = draft.players[effect.playerId];
    const deck = player?.zones?.deck || [];
    const count = Math.min(effect.n, deck.length);
    const discarded = deck.splice(0, count);
    for (const card of discarded) discardCardToPlayerZone(player, card);
    events.push({
      type: 'cardsDiscarded',
      playerId: effect.playerId,
      count,
      source: effect.source,
      cards: discarded.map((c) => c.instanceId),
    });
  }
}

export function resolveCheckup(
  draft,
  { rng, events, endingPlayerId = draft.turn?.player }
) {
  resolveDeferredKnockouts(draft, { events });
  // A condition landed this command (the attack that ended the turn) on a Pokémon whose
  // special Energy makes it immune never reaches Checkup.
  applySpecialEnergyStatusImmunity(draft, { events });
  const triggerCtx = abilitySideContext(draft, endingPlayerId);
  // "Between turns" abilities (I163): the pre-Checkup wording family.
  const betweenEffects = parseBetweenTurnsAbilities(inPlayEntries(draft), triggerCtx);
  const abilityAsleepFlips = (card) => {
    let flips = 0;
    for (const effect of betweenEffects) {
      if (effect.kind === 'sleepFlips' && effect.holder === card) {
        flips = Math.max(flips, effect.flips);
      }
    }
    return flips;
  };

  for (const pid of Object.keys(draft.players || {})) {
    const player = draft.players[pid];
    const active = player.zones?.active?.find((c) => !c.attachedTo);
    if (!active || !hasAnyCondition(active)) continue;

    // Every condition resolves, in rules order, and the Knockout check runs once after
    // all Checkup damage (audit A-1: this used to be an else-if chain over one string).
    // Checkup flips are reported like any other, so the client's coin ceremony shows them.
    const flip = (condition) => {
      const face = (rng ? rng.next() : 0.5) < 0.5 ? 'heads' : 'tails';
      events.push({ type: 'coinFlipped', playerId: pid, face, source: condition, instanceId: active.instanceId });
      return face;
    };
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

    const checkupStadium = draft.stadium?.card || draft.stadium;
    if (hasCondition(active, 'Poisoned')) {
      checkupDamage('Poisoned', 10);
    }
    if (hasCondition(active, 'Burned')) {
      checkupDamage('Burned', 20);
      // Wela Volcano Park: the Burned flip happens but can't remove the condition.
      const burnedMods = stadiumCheckupCoinModifiers(checkupStadium, { condition: 'Burned' });
      if (flip('Burned') === 'heads' && !burnedMods?.burnedPersists) cleared('Burned');
    }
    if (hasCondition(active, 'Asleep')) {
      // Slumbering Forest: 2 coins instead of 1; either tails keeps it Asleep.
      // Stir and Snooze (Snorlax / Slaking) grants the same from the holder (I163).
      const asleepMods = stadiumCheckupCoinModifiers(checkupStadium, { condition: 'Asleep' });
      const asleepFlips = asleepMods?.asleepFlips ?? (abilityAsleepFlips(active) || 1);
      let asleepHeads = 0;
      for (let i = 0; i < asleepFlips; i++) {
        if (flip('Asleep') === 'heads') asleepHeads++;
      }
      if (asleepHeads === asleepFlips) cleared('Asleep');
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

  // Pokémon Checkup abilities resolve after the conditions and before the
  // between-turns Stadium damage (design 034 slice 4).
  applyCheckupAbilities(draft, { events, ctx: triggerCtx, betweenEffects });

  // Between-turns Stadium damage resolves after Pokémon Checkup.
  applyBetweenTurnsStadiumDamage(draft, { events });

  // End-of-turn special-energy effects (legacy Darkness Energy): "at the end of
  // every turn" applies to both players' in-play Pokémon.
  runEndOfTurnSpecialEnergies(draft, { events });
  discardEndOfTurnSpecialEnergies(draft, { endingPlayerId, events });

  // "At the end of your turn, discard …" Tools (TM/Cube Items).
  discardEndOfTurnTools(draft, { endingPlayerId, events });
  discardExpiredSelfTools(draft, { events });
  settleAttachedTrainersAtTurnEnd(draft, { events });

  // Mandatory end-of-turn ability effects (Great Tusk ex Quaking Demolition).
  applyEndOfTurnAbilities(draft, { events, ctx: triggerCtx, endingPlayerId });
}

/**
 * Tickling Machine gym1-119: "At the end of your opponent's next turn, your opponent puts those
 * cards back into his or her hand." The set-aside hand lives off the zones (trainer-steps
 * opponentHandSetAside) and comes back when the turn it names ends.
 */
function returnSetAsideHands(draft, { endingTurn, events }) {
  for (const player of Object.values(draft.players || {})) {
    const setAside = player?.setAsideHand;
    if (!setAside || (setAside.returnTurn || 0) > endingTurn) continue;
    player.zones.hand.push(...(setAside.cards || []));
    delete player.setAsideHand;
    events.push({ type: 'setAsideHandReturned', playerId: player.playerId, count: (setAside.cards || []).length });
  }
}

/**
 * Advances the turn to the next player, reset flags, and performs start-of-turn draw.
 */
export function advanceTurn(draft, { nextPlayerId, events }) {
  delete draft.attackDiscardedForDamage;
  delete draft.attackAttachedForDamage;
  returnSetAsideHands(draft, { endingTurn: draft.turn.number || 1, events });
  // The flags object is replaced wholesale below; a Checkup Knockout may have just
  // entitled the incoming player, and that entitlement must survive the reset so the
  // prize choice raised at the end of the command can be settled.
  const prizesOwed = draft.players[nextPlayerId].flags?.prizesOwed;
  const koedLastOppTurn = !!draft.players[nextPlayerId].flags?.koedOnOppTurn;
  const koedLastOppTurnVictims = draft.players[nextPlayerId].flags?.koedOnOppTurnVictims || [];
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
    attacksThisTurn: 0,
    retreatedThisTurn: false,
    supporterPlayed: false,
    stadiumPlayedThisTurn: false,
    stadiumUsedThisTurn: false,
    abilitiesUsed: {},
    evolved: {},
    briarActive: false,
    koedLastOppTurn,
    koedLastOppTurnVictims,
    ...(prizesOwed ? { prizesOwed } : {}),
    ...(legacyPrizeReductionUsed ? { legacyPrizeReductionUsed } : {}),
  };
  for (const p of Object.values(draft.players || {})) {
    if (p.playerId !== nextPlayerId && p.flags) {
      p.flags.briarActive = false;
      delete p.flags.turnDamageBonuses;
      delete p.flags.gxReuseTypes;
      delete p.flags.ignoreDefenderEffectsTurn;
      delete p.flags.evolutionAttacksTurn;
      delete p.flags.willFirstCoin;
      delete p.flags.turnAttackRiders;
      delete p.flags.freeEvolveRoots;
      delete p.flags.energyAttachPlan;
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

  // Design 044: the turn starts, then its player draws (the rulebook's order),
  // so the client shows the turn banner before the drawn card.
  events.push({
    type: 'turnStarted',
    player: nextPlayerId,
    number: draft.turn.number,
  });

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
}

/**
 * Ends the acting player's turn from inside a card effect (Lumiose City: "If a
 * player searches their deck in this way, their turn ends."). Mirrors the `pass`
 * path — Checkup first, then advance only while the game is still live.
 */
export function endTurnFromEffect(draft, { playerId, activeRng, events }) {
  if (isGameConcluded(draft)) return;
  const oppId = Object.keys(draft.players || {}).find((id) => id !== playerId);
  if (!oppId) return;
  resolveCheckup(draft, { rng: activeRng, events, endingPlayerId: playerId });
  if (!isGameConcluded(draft)) {
    advanceTurn(draft, { nextPlayerId: oppId, events });
  }
}

export function setupCommand({ state, draft, payload, activeRng, events }) {
  // Design 051 / I202: both decks are dealt under one format's Prize count.
  const mismatch = deckFormatMismatch(state);
  if (mismatch) {
    return {
      state,
      events: [],
      pendingChoice: state.pendingChoice,
      error: 'format_mismatch',
      reason: `Deck formats differ: ${mismatch.map((p) => `${p.playerId} ${p.format}`).join(', ')}`,
    };
  }
  const setupResult = setupGame(draft, {
    firstPlayerId: payload?.firstPlayerId,
    rng: activeRng,
  });
  events.push(...setupResult.events);
}

export function takeTurnCommand({ draft, activeRng, events, playerId }) {
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
}

// Deck bootstrap (design 002 slice 3.4e / I16). Mints instanceId through the same
// draft.nextInstanceId counter every other card-creating command uses, and — critically —
// runs through applyCommand so it lands in commandLog. Undo's replay depends on this: before
// this command existed, deck loading was a direct mutation on gameRoom.state outside the
// log, so replaying commandLog from a fresh seeded state reconstructed empty decks.
export function loadDeckCommand({ draft, playerId, payload, events }) {
  const player = draft.players[playerId];
  const deckData = Array.isArray(payload.deckData) ? payload.deckData : [];
  // Any format loads: the one-format rule is checked when the cards are dealt ('setup'),
  // so a deck restored on room join can still be replaced by a matching one (I202).
  player.deckFormat = isDeckFormat(payload.format) ? payload.format : DECK_FORMAT_TCG;
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
    format: player.deckFormat,
  });
}

// Design 002 I26: applies printed card data the deck rows never carried. Addresses by
// syncInstance across every zone (cards have usually been dealt into hand/prizes by the
// time TCGdex enrichment resolves) and updates in place — it must never rebuild a zone,
// since it can legally arrive mid-game.
export function cardStatsCommand({ draft, playerId, payload, events }) {
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
      // The printed kind tells a Pokémon Power from a Poké-Body (Toxic Gas, Goop Gas).
      const printedKind = (t) =>
        typeof t === 'string' && t.trim() && t.length <= 32 ? { type: t.trim() } : {};
      card.abilities = entry.abilities
        .filter((a) => a && typeof a.text === 'string')
        .map((a) => ({ name: String(a.name || ''), text: a.text, ...printedKind(a.type) }));
    }
    if (typeof entry.text === 'string') card.text = entry.text;
    if (typeof entry.trainerType === 'string')
      card.trainerType = entry.trainerType;
    if (Array.isArray(entry.subtypes))
      card.subtypes = entry.subtypes.map(String);
    if (!card.trainerType) {
      const derived = legacyTrainerType(card);
      if (derived) card.trainerType = derived;
    }
    updated += 1;
  }

  events.push({ type: 'cardStatsApplied', playerId, count: updated });
}
