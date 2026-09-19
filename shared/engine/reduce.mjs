/**
 * @file Authoritative state reducer for server-authoritative netcode.
 * Implements pure and total applyCommand(state, command, rng) -> { state, events, pendingChoice, error? }.
 * Enforces Invariants 2, 3, 6, 7, 8.
 */

import { cloneGameState, findCard, createGameState } from './state.mjs';
import {
  isEnergy,
  isPokemon,
  isTrainer,
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
  planBenchTarget,
  allBenchDamage,
  parseAttackSearchClause,
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
} from './rules/ability-executors.mjs';
import { executeTrainer, discardCurrentStadium } from './effects/trainer.mjs';
import { executeAbility } from './effects/ability.mjs';
import { createPendingChoice } from './effects/executor.mjs';
import { executeStadium } from './effects/stadium.mjs';
import {
  parseStadiumOncePerTurn,
  isStadiumCard,
  effectiveHp,
  getStadiumRetreatCost,
  isStadiumRetreatPrevention,
  isStadiumToolNegation,
  pokemonHasRuleBox,
} from './rules/stadium-effects.mjs';
import { trainerPlayBlockReason } from './rules/trainer-play-conditions.mjs';
import { serverEnergyDescriptor } from './rules/server-energy.mjs';
import {
  evolvedView,
  trainerTargetCounts,
  ownedCards,
  topPokemonCard,
} from './rules/evolved-pokemon.mjs';
import { normalizeStage, pokemonNamesMatch } from './rules/evolution.mjs';
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
      if (!player.zones.discard) player.zones.discard = [];
      player.zones.discard.push(removed);
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
  { victim, victimPlayerId, attackerPlayerId, attackName, dealt, auto, events }
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
  const benchProtected = allVictimCards.some((c) => {
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

// An in-play Pokémon as its top evolution card (see evolved-pokemon.mjs). Read-only.
function inPlayView(state, card) {
  if (!card) return card;
  const ref = findCard(state, card.instanceId);
  const zone = ref?.player?.zones?.[ref.zoneId];
  return Array.isArray(zone) ? evolvedView(zone, card) : card;
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
  const victimDiscard = draft.players[victimPlayerId]?.zones?.discard || [];

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
  let prizeCount = toolPrizeCountAdjust(
    victim,
    victimZoneCards,
    basePrizeCount,
    {
      stadium: draft.stadium,
    }
  );

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
        victimDiscard.push(c);
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

  // Auto-promote first bench Pokemon ONLY if active Pokemon was knocked out
  if (wasActive) {
    const benchPokemon = victimBench.find((c) => !c.attachedTo);
    if (benchPokemon) {
      for (let i = victimBench.length - 1; i >= 0; i--) {
        const c = victimBench[i];
        if (
          c.instanceId === benchPokemon.instanceId ||
          c.attachedTo === benchPokemon.instanceId
        ) {
          victimBench.splice(i, 1);
          victimActive.push(c);
        }
      }
      events.push({
        type: 'pokemonPromoted',
        instanceId: benchPokemon.instanceId,
        playerId: victimPlayerId,
      });
    }
  }

  // Win condition checks. An entitlement covering every remaining prize is the win
  // condition even though the cards only reach hand when the command settles, and it
  // must be reported ahead of the victim's no-Pokémon loss.
  if (attackerPrizes.length <= (attacker?.flags?.prizesOwed || 0)) {
    setGameEnded(draft, {
      winner: attackerPlayerId,
      reason: 'all prize cards taken',
      events,
    });
  } else {
    const remainingActive = victimActive.filter((c) => !c.attachedTo);
    const remainingBench = victimBench.filter((c) => !c.attachedTo);
    if (remainingActive.length === 0 && remainingBench.length === 0) {
      setGameEnded(draft, {
        winner: attackerPlayerId,
        reason: 'no Pokémon in play',
        events,
      });
    }
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
 * Advances the turn to the next player, reset flags, and performs start-of-turn draw.
 */
function advanceTurn(draft, { nextPlayerId, events }) {
  // The flags object is replaced wholesale below; a Checkup Knockout may have just
  // entitled the incoming player, and that entitlement must survive the reset so the
  // prize choice raised at the end of the command can be settled.
  const prizesOwed = draft.players[nextPlayerId].flags?.prizesOwed;

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
    ...(prizesOwed ? { prizesOwed } : {}),
  };
  for (const p of Object.values(draft.players || {})) {
    if (p.playerId !== nextPlayerId && p.flags) {
      p.flags.briarActive = false;
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
 * Marks game as ended with winner and reason.
 */
function setGameEnded(draft, { winner, reason, events }) {
  draft.turn.phase = 'ended';
  draft.winner = winner;
  draft.winReason = reason;
  events.push({ type: 'gameEnded', winner, reason });
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
      // Attached card and target card must belong to acting player
      if (cardRef.playerId !== playerId || targetRef.playerId !== playerId) {
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

    case 'useAbility':
    case 'useVStarGX': {
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
  if (state.turn?.phase === 'ended') {
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
              if (accel.noRuleBox && pokemonHasRuleBox(targetPokemon)) {
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
      const attack = inPlayView(state, active).attacks?.[atkIdx];
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
      if (attack && attack.cost?.length > 0) {
        const attached = (player.zones?.active || []).filter(
          (c) => c.attachedTo === active.instanceId && isEnergy(c)
        );
        if (
          !canPayAttackCost(
            expandEnergyEntries(attached.map(serverEnergyDescriptor)),
            attack.cost
          )
        ) {
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
        if (
          !canPayAttackCost(
            expandEnergyEntries(attached.map(serverEnergyDescriptor)),
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
      if (count > owed) {
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
      if (count > (player.flags?.prizesOwed || 0)) {
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
      }
      return { allowed: true };
    }

    case 'stadium-effect': {
      if (player.flags?.stadiumUsedThisTurn) {
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
      if (player.flags?.vstarUsed || player.flags?.gxUsed) {
        return {
          allowed: false,
          reason: 'VSTAR / GX attack or ability already used this game.',
        };
      }
      return { allowed: true };
    }

    default:
      return { allowed: true };
  }
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
        cardRef.card.attachedTo = payload.targetInstanceId;

        // Add to target's zone
        const destZone = draft.players[playerId].zones[targetRef.zoneId];
        destZone.push(cardRef.card);

        // Update turn energy attachment flag if energy
        if (isEnergy(cardRef.card)) {
          if (!draft.players[playerId].flags) {
            draft.players[playerId].flags = {};
          }
          draft.players[playerId].flags.energyAttached = true;
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
          targetRef.card.lastEvolvedTurn = draft.turn.number;
          clearConditions(targetRef.card);
          events.push({
            type: 'pokemonEvolved',
            playerId,
            instanceId: payload.instanceId,
            targetInstanceId: payload.targetInstanceId,
          });
        }

        events.push({
          type: 'cardAttached',
          instanceId: payload.instanceId,
          targetInstanceId: payload.targetInstanceId,
          playerId,
        });
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
      const attackerView = inPlayView(draft, attacker);
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

          if (draft.turn.phase !== 'ended') {
            resolveCheckup(draft, {
              rng: activeRng,
              events,
              endingPlayerId: playerId,
            });
            if (draft.turn.phase !== 'ended') {
              advanceTurn(draft, { nextPlayerId: oppId, events });
            }
          }
          break;
        }
      }

      // Printed-text damage (design 013): coin flips first, then the "for each …" scaling
      // the parser resolves from live board counts, then bench/spread damage. Without this
      // every attack dealt its flat printed number regardless of the board (I26 follow-up).
      const { coin, headsCount, flips } = flipAttackCoins(attack, activeRng);
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
          }
        );
        dmgDealt = dmgResult.total;

        if (dmgResult.prevented) {
          events.push({
            type: 'damagePrevented',
            instanceId: defender.instanceId,
            attackerInstanceId: attacker.instanceId,
            attackName: effectiveAttack?.name,
          });
        }

        if (dmgDealt > 0) {
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

      // Healing from attack effect (e.g. "Heal 30 damage from this Pokémon")
      if (parsed.heal > 0 && attacker) {
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

      // Single-target bench damage. The server picks the first benched Pokémon rather than
      // prompting (design 013 option 2A); `auto` tells the clients it was a heuristic pick.
      let benchDealt = 0;
      if (parsed.bench > 0 && spread === 0) {
        const targets = benchTargets(draft.players[defenderPlayerId]);
        const plan = planBenchTarget(targets.length);
        if (plan === null) {
          events.push({
            type: 'attackBenchFizzled',
            playerId,
            attackName: attack.name,
            reason: 'no-benched-pokemon',
          });
        } else {
          benchDealt += parsed.bench;
          damageBenchedPokemon(draft, {
            victim: targets[0],
            victimPlayerId: defenderPlayerId,
            attackerPlayerId: playerId,
            attackName: attack.name,
            dealt: parsed.bench,
            auto: plan === -1,
            events,
          });
        }
      }

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

      // Attack effects: draw cards (e.g. Collect)
      const drawN = drawCount(attack);
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
      const energyDiscardSpec = parseAttackEnergyDiscard(effectiveAttack);
      if (energyDiscardSpec && attacker) {
        const attackerZone = draft.players[playerId]?.zones?.active || [];
        const attachedEnergies = attackerZone.filter(
          (c) => c.attachedTo === attacker.instanceId && isEnergy(c)
        );

        let toDiscard = [];
        if (energyDiscardSpec.all) {
          toDiscard = attachedEnergies;
        } else {
          let candidates = attachedEnergies;
          if (energyDiscardSpec.energyType) {
            candidates = attachedEnergies.filter((c) => {
              const ty = c.energyType || c.name?.replace(/\s*Energy.*/i, '');
              return (
                ty &&
                ty
                  .toLowerCase()
                  .includes(energyDiscardSpec.energyType.toLowerCase())
              );
            });
          }
          toDiscard = candidates.slice(0, energyDiscardSpec.count);
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
            draft.players[playerId].zones.discard.push(discarded);
            events.push({
              type: 'cardMoved',
              instanceId: card.instanceId,
              from: 'active',
              to: 'discard',
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
      }

      // Attack effects: deck search (Phase 3, e.g. Call for Family)
      const searchClause = parseAttackSearchClause(effectiveAttack);
      let searchTriggered = false;
      if (searchClause && attackerPlayer?.zones?.deck?.length > 0) {
        const benchCount = (attackerPlayer.zones.bench || []).filter(
          (c) => !c.attachedTo
        ).length;
        const maxAllowed =
          searchClause.destination === 'bench'
            ? Math.max(0, 5 - benchCount)
            : searchClause.count || 1;
        if (maxAllowed > 0) {
          draft.pendingChoice = createPendingChoice({
            player: playerId,
            source: 'attack',
            prompt: `Search your deck for up to ${Math.min(searchClause.count || 1, maxAllowed)} ${searchClause.what || 'cards'}.`,
            options: attackerPlayer.zones.deck.map((c) => ({
              instanceId: c.instanceId,
              name: c.name,
              supertype: c.supertype,
              subtypes: c.subtypes,
              stage: c.stage,
            })),
            min: 0,
            max: Math.min(searchClause.count || 1, maxAllowed),
            resumeToken: {
              effectType: 'attack',
              initiatorPlayerId: playerId,
              oppId,
              searchParams: searchClause,
            },
          });
          searchTriggered = true;
        }
      }

      events.push({
        type: 'attackExecuted',
        attackerId: attacker?.instanceId,
        attackName: attack.name,
        damage: dmgDealt,
        benchDealt,
        playerId,
      });

      if (!attackerPlayer.flags) attackerPlayer.flags = {};
      attackerPlayer.flags.attackerAttacked = true;

      // Auto-end turn after attacking (unless paused by pendingChoice)
      if (!searchTriggered && draft.turn.phase !== 'ended') {
        resolveCheckup(draft, {
          rng: activeRng,
          events,
          endingPlayerId: playerId,
        });
        if (draft.turn.phase !== 'ended') {
          advanceTurn(draft, { nextPlayerId: oppId, events });
        }
      }
      break;
    }

    case 'retreat': {
      const player = draft.players[playerId];
      const active = player?.zones?.active?.find((c) => !c.attachedTo);
      const costN = computeEffectiveRetreatCost(draft, active, playerId);

      // Discard energy cost
      if (
        Array.isArray(payload?.discardEnergyIds) &&
        payload.discardEnergyIds.length > 0
      ) {
        for (const id of payload.discardEnergyIds) {
          const idx = player.zones.active.findIndex((c) => c.instanceId === id);
          if (idx >= 0) {
            const [discarded] = player.zones.active.splice(idx, 1);
            discarded.attachedTo = null;
            player.zones.discard.push(discarded);
            events.push({
              type: 'cardMoved',
              instanceId: id,
              from: 'active',
              to: 'discard',
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
            player.zones.discard.push(card);
            discardedCount++;
            events.push({
              type: 'cardMoved',
              instanceId: card.instanceId,
              from: 'active',
              to: 'discard',
              playerId,
            });
          }
        }
      }

      // Bench swap
      let benchPokemon = null;
      if (payload?.benchInstanceId != null) {
        benchPokemon = player.zones.bench.find(
          (c) => c.instanceId === payload.benchInstanceId
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
      break;
    }

    case 'pass':
    case 'takeTurn': {
      const oppId = Object.keys(draft.players || {}).find(
        (id) => id !== playerId
      );
      resolveCheckup(draft, {
        rng: activeRng,
        events,
        endingPlayerId: playerId,
      });
      if (draft.turn.phase !== 'ended') {
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

      if (prizes.length === 0) {
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

      if (prizes.length === 0) {
        setGameEnded(draft, {
          winner: playerId,
          reason: 'all prize cards taken',
          events,
        });
      }
      break;
    }

    case 'promote': {
      const player = draft.players[playerId];
      const benchIdx = player.zones.bench.findIndex(
        (c) => c.instanceId === payload.instanceId
      );
      if (benchIdx >= 0) {
        for (let i = player.zones.bench.length - 1; i >= 0; i--) {
          const c = player.zones.bench[i];
          if (
            c.instanceId === payload.instanceId ||
            c.attachedTo === payload.instanceId
          ) {
            player.zones.bench.splice(i, 1);
            player.zones.active.push(c);
          }
        }
        events.push({
          type: 'pokemonPromoted',
          instanceId: payload.instanceId,
          playerId,
        });
      }
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
      executeStadium(draft, {
        playerId,
        activeRng,
        events,
      });
      break;
    }

    case 'useVStarGX': {
      if (!draft.players[playerId].flags) draft.players[playerId].flags = {};
      draft.players[playerId].flags.vstarUsed = true;
      draft.players[playerId].flags.gxUsed = true;
      events.push({
        type: 'vstarUsed',
        playerId,
        instanceId: payload.instanceId,
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
      } else if (token.effectType === 'stadium') {
        executeStadium(draft, {
          playerId: initiatorPlayerId,
          activeRng,
          events,
          selection: payload.selection,
          resumeToken: token,
        });
      } else if (token.effectType === 'attack') {
        const player = draft.players[initiatorPlayerId];
        const selection = Array.isArray(payload.selection)
          ? payload.selection
          : [];
        const dest = token.searchParams?.destination || 'hand';

        for (const sel of selection) {
          const instId = typeof sel === 'object' ? sel.instanceId : sel;
          const idx = player.zones.deck.findIndex(
            (c) => c.instanceId === instId
          );
          if (idx >= 0) {
            const [card] = player.zones.deck.splice(idx, 1);
            if (dest === 'bench') {
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

        player.zones.deck = activeRng.shuffle(player.zones.deck);
        events.push({
          type: 'zoneShuffled',
          zoneId: 'deck',
          playerId: initiatorPlayerId,
        });

        draft.pendingChoice = null;

        if (draft.turn.phase !== 'ended') {
          resolveCheckup(draft, {
            rng: activeRng,
            events,
            endingPlayerId: initiatorPlayerId,
          });
          if (draft.turn.phase !== 'ended') {
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
      player.zones.discard.push(...moved);
      events.push({
        type: 'zoneMoved',
        from: payload.zoneId,
        to: 'discard',
        count: moved.length,
        playerId,
      });
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
      player.zones.discard.push(...discarded);
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
      player.zones.discard.push(...moved);
      events.push({
        type: 'zoneMoved',
        from: 'board',
        to: 'discard',
        count: moved.length,
        playerId,
      });
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

  settlePrizeEntitlements(draft, { events });
  clearFaceDownOffBoard(draft);

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
