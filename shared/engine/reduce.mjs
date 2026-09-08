/**
 * @file Authoritative state reducer for server-authoritative netcode.
 * Implements pure and total applyCommand(state, command, rng) -> { state, events, pendingChoice, error? }.
 * Enforces Invariants 2, 3, 6, 7, 8.
 */

import { cloneGameState, findCard } from './state.mjs';
import { isEnergy, getRetreatCostCount } from './cards.mjs';
import { validateCommandShape } from './commands.mjs';
import { setupGame } from './setup.mjs';
import { createRng } from './rng.mjs';
import { computeAttackDamage, expandEnergyEntries, canPayAttackCost } from './rules/attack-engine.mjs';
import { drawCount } from './rules/damage-parser.mjs';
import { prizesForKO } from './rules/ko-flow.mjs';
import { executeTrainer, discardCurrentStadium } from './effects/trainer.mjs';
import { executeAbility } from './effects/ability.mjs';
import { executeStadium } from './effects/stadium.mjs';
import { parseTrainerEffect } from './rules/trainer-effects.mjs';
import { parseStadiumOncePerTurn } from './rules/stadium-effects.mjs';

/**
 * Handles Knockout resolution for a Pokemon:
 * - Awards prize cards to attacker
 * - Discards victim and its attached cards
 * - Auto-promotes first benched Pokemon to active (if any)
 * - Checks win conditions
 */
function handleKnockout(draft, { victimPlayerId, attackerPlayerId, victim, events }) {
  const prizeCount = prizesForKO(victim);
  const attackerPrizes = draft.players[attackerPlayerId]?.zones?.prizes || [];
  const attackerHand = draft.players[attackerPlayerId]?.zones?.hand || [];
  const actualPrizes = Math.min(prizeCount, attackerPrizes.length);
  const taken = attackerPrizes.splice(0, actualPrizes);
  attackerHand.push(...taken);

  events.push({
    type: 'prizesTaken',
    playerId: attackerPlayerId,
    count: actualPrizes,
    cards: taken.map((c) => ({ instanceId: c.instanceId })),
  });

  // Discard victim and attached cards from its zone (active or bench)
  const victimActive = draft.players[victimPlayerId]?.zones?.active || [];
  const victimBench = draft.players[victimPlayerId]?.zones?.bench || [];
  const victimDiscard = draft.players[victimPlayerId]?.zones?.discard || [];

  const wasActive = victimActive.some((c) => c.instanceId === victim.instanceId);
  const wasBench = victimBench.some((c) => c.instanceId === victim.instanceId);

  let targetZone = null;
  if (wasActive) {
    targetZone = victimActive;
  } else if (wasBench) {
    targetZone = victimBench;
  } else {
    const ref = findCard(draft, victim.instanceId);
    if (ref?.playerId === victimPlayerId && draft.players[victimPlayerId]?.zones?.[ref.zoneId]) {
      targetZone = draft.players[victimPlayerId].zones[ref.zoneId];
    }
  }

  if (targetZone) {
    for (let i = targetZone.length - 1; i >= 0; i--) {
      const c = targetZone[i];
      if (c.instanceId === victim.instanceId || c.attachedTo === victim.instanceId) {
        targetZone.splice(i, 1);
        c.damage = 0;
        c.specialCondition = null;
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
        if (c.instanceId === benchPokemon.instanceId || c.attachedTo === benchPokemon.instanceId) {
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

  // Win condition checks
  if (attackerPrizes.length === 0) {
    setGameEnded(draft, { winner: attackerPlayerId, reason: 'all prize cards taken', events });
  } else {
    const remainingActive = victimActive.filter((c) => !c.attachedTo);
    const remainingBench = victimBench.filter((c) => !c.attachedTo);
    if (remainingActive.length === 0 && remainingBench.length === 0) {
      setGameEnded(draft, { winner: attackerPlayerId, reason: 'no Pokémon in play', events });
    }
  }
}

/**
 * Resolves Pokémon Checkup between turns:
 * - Poison: 10 damage
 * - Burn: 20 damage + 50% cure flip
 * - Asleep: 50% cure flip
 * - Paralyzed: cured at the end of the paralyzed player's turn
 */
function resolveCheckup(draft, { rng, events, endingPlayerId = draft.turn?.player }) {
  for (const pid of Object.keys(draft.players || {})) {
    const player = draft.players[pid];
    const active = player.zones?.active?.find((c) => !c.attachedTo);
    if (!active || !active.specialCondition) continue;

    if (active.specialCondition === 'Poisoned') {
      active.damage = (active.damage || 0) + 10;
      events.push({ type: 'checkupDamage', instanceId: active.instanceId, condition: 'Poisoned', damage: 10, playerId: pid });
      if (active.hp && active.damage >= active.hp) {
        const oppId = Object.keys(draft.players).find((id) => id !== pid);
        handleKnockout(draft, { victimPlayerId: pid, attackerPlayerId: oppId, victim: active, events });
      }
    } else if (active.specialCondition === 'Burned') {
      active.damage = (active.damage || 0) + 20;
      events.push({ type: 'checkupDamage', instanceId: active.instanceId, condition: 'Burned', damage: 20, playerId: pid });
      const coin = (rng ? rng.next() : 0.5) < 0.5 ? 'heads' : 'tails';
      if (coin === 'heads') {
        active.specialCondition = null;
        events.push({ type: 'statusCleared', condition: 'Burned', instanceId: active.instanceId, playerId: pid });
      }
      if (active.hp && active.damage >= active.hp) {
        const oppId = Object.keys(draft.players).find((id) => id !== pid);
        handleKnockout(draft, { victimPlayerId: pid, attackerPlayerId: oppId, victim: active, events });
      }
    } else if (active.specialCondition === 'Asleep') {
      const coin = (rng ? rng.next() : 0.5) < 0.5 ? 'heads' : 'tails';
      if (coin === 'heads') {
        active.specialCondition = null;
        events.push({ type: 'statusCleared', condition: 'Asleep', instanceId: active.instanceId, playerId: pid });
      }
    } else if (active.specialCondition === 'Paralyzed') {
      // Under official Pokémon TCG rules, Paralysis is only cured at the end of that player's turn.
      if (!endingPlayerId || pid === endingPlayerId) {
        active.specialCondition = null;
        events.push({ type: 'statusCleared', condition: 'Paralyzed', instanceId: active.instanceId, playerId: pid });
      }
    }
  }
}

/**
 * Advances the turn to the next player, reset flags, and performs start-of-turn draw.
 */
function advanceTurn(draft, { nextPlayerId, events }) {
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
    stadiumUsedThisTurn: false,
    abilitiesUsed: {},
  };

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
 * Normalizes an Energy Card object to a { type, family } descriptor for canPayAttackCost.
 */
function getEnergyDescriptor(card) {
  if (!card) return { type: 'Colorless', family: 'basic' };
  if (typeof card === 'string') return { type: card, family: 'basic' };

  const name = String(card.name || '').toLowerCase();
  const type = card.types?.[0] ||
    (/fire/.test(name) ? 'Fire'
    : /water/.test(name) ? 'Water'
    : /grass/.test(name) ? 'Grass'
    : /lightning/.test(name) ? 'Lightning'
    : /psychic/.test(name) ? 'Psychic'
    : /fighting/.test(name) ? 'Fighting'
    : /metal/.test(name) ? 'Metal'
    : /dark/.test(name) ? 'Dark'
    : /dragon/.test(name) ? 'Dragon'
    : 'Colorless');

  let family = 'basic';
  if (/double colorless/.test(name)) {
    family = 'double-colorless';
  } else if (/double/.test(name)) {
    family = 'double';
  }

  return { type, family };
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
      if (cardRef.playerId !== playerId && !['active', 'bench', 'board', 'stadium', 'discard', 'lostZone'].includes(cardRef.zoneId)) {
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
      const active = state.players?.[playerId]?.zones?.active?.find((c) => !c.attachedTo);
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
      const active = state.players?.[playerId]?.zones?.active?.find((c) => !c.attachedTo);
      if (!active) {
        return { valid: false, error: 'stale_view' };
      }
      if (payload?.benchInstanceId != null) {
        const benchCard = state.players?.[playerId]?.zones?.bench?.find((c) => c.instanceId === payload.benchInstanceId);
        if (!benchCard) {
          return { valid: false, error: 'stale_view' };
        }
      }
      if (Array.isArray(payload?.discardEnergyIds)) {
        const activeZone = state.players?.[playerId]?.zones?.active || [];
        for (const id of payload.discardEnergyIds) {
          const card = activeZone.find((c) => c.instanceId === id && c.attachedTo === active.instanceId);
          if (!card) {
            return { valid: false, error: 'stale_view' };
          }
        }
      }
      return { valid: true };
    }

    case 'promote': {
      const benchCard = state.players?.[playerId]?.zones?.bench?.find((c) => c.instanceId === payload?.instanceId);
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
      if (!Array.isArray(payload?.indices) || payload.indices.some((idx) => idx >= prizes.length)) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    case 'playTrainer': {
      const cardRef = findCard(state, payload?.instanceId);
      if (!cardRef || cardRef.zoneId !== 'hand' || cardRef.playerId !== playerId) {
        return { valid: false, error: 'stale_view' };
      }
      if (payload.targetInstanceId != null) {
        const targetRef = findCard(state, payload.targetInstanceId);
        if (!targetRef || !['active', 'bench'].includes(targetRef.zoneId) || targetRef.playerId !== playerId) {
          return { valid: false, error: 'stale_view' };
        }
      }
      return { valid: true };
    }

    case 'useAbility':
    case 'useVStarGX': {
      const cardRef = findCard(state, payload?.instanceId);
      if (!cardRef || !['active', 'bench'].includes(cardRef.zoneId) || cardRef.playerId !== playerId) {
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
  if (state.turn?.phase === 'setup') {
    return { allowed: false, reason: 'Set up the game first (Set Up button).' };
  }

  // Turn player validation
  if (['attack', 'retreat', 'pass', 'takeTurn', 'moveCard', 'attachCard', 'draw', 'playTrainer', 'useAbility', 'stadium-effect', 'useVStarGX'].includes(type)) {
    if (state.turn?.player && state.turn.player !== playerId) {
      return { allowed: false, reason: "It's not your turn." };
    }
  }

  if (state.turn?.phase === 'attack') {
    if (['moveCard', 'attachCard', 'draw', 'retreat', 'attack', 'playTrainer', 'useAbility', 'stadium-effect', 'useVStarGX'].includes(type)) {
      return { allowed: false, reason: 'You already attacked — end your turn.' };
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
          return { allowed: false, reason: 'Energy already attached this turn.' };
        }
      }
      return { allowed: true };
    }

    case 'attack': {
      if (state.turn?.number === 1) {
        return { allowed: false, reason: "The player going first can't attack on turn 1." };
      }
      if (player.flags?.attackerAttacked) {
        return { allowed: false, reason: 'Already attacked this turn.' };
      }
      const active = player.zones?.active?.find((c) => !c.attachedTo);
      if (!active) {
        return { allowed: false, reason: 'No active Pokémon to attack with.' };
      }
      if (active.specialCondition === 'Paralyzed') {
        return { allowed: false, reason: "Paralyzed — this Pokémon can't attack or retreat." };
      }
      if (active.specialCondition === 'Asleep') {
        return { allowed: false, reason: "Asleep — this Pokémon can't attack or retreat." };
      }
      const atkIdx = payload?.attackIndex ?? 0;
      const attack = active.attacks?.[atkIdx];
      if (attack && attack.cost?.length > 0) {
        const attached = (player.zones?.active || []).filter((c) => c.attachedTo === active.instanceId && isEnergy(c));
        if (!canPayAttackCost(expandEnergyEntries(attached.map(getEnergyDescriptor)), attack.cost)) {
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
        return { allowed: false, reason: "Paralyzed — this Pokémon can't retreat." };
      }
      if (active.specialCondition === 'Asleep') {
        return { allowed: false, reason: "Asleep — this Pokémon can't retreat." };
      }
      const benchPokemon = (player.zones?.bench || []).filter((c) => !c.attachedTo);
      if (benchPokemon.length === 0) {
        return { allowed: false, reason: 'No bench Pokémon to retreat to.' };
      }
      const retreatCostN = getRetreatCostCount(active);
      if (retreatCostN > 0) {
        const attached = (player.zones?.active || []).filter((c) => c.attachedTo === active.instanceId && isEnergy(c));
        const costSymbols = new Array(retreatCostN).fill('Colorless');
        if (!canPayAttackCost(expandEnergyEntries(attached.map(getEnergyDescriptor)), costSymbols)) {
          return { allowed: false, reason: `Not enough energy to retreat (costs ${retreatCostN}).` };
        }
      }
      return { allowed: true };
    }


    case 'promote': {
      const activePokemon = (player.zones?.active || []).filter((c) => !c.attachedTo);
      if (activePokemon.length > 0) {
        return { allowed: false, reason: 'Active position is already occupied.' };
      }
      return { allowed: true };
    }

    case 'takePrizes': {
      const count = payload?.count ?? 1;
      if ((player.zones?.prizes?.length || 0) < count) {
        return { allowed: false, reason: 'Not enough prize cards left.' };
      }
      return { allowed: true };
    }

    case 'takePrizesByIndex': {
      if ((player.zones?.prizes?.length || 0) < (payload?.indices?.length || 0)) {
        return { allowed: false, reason: 'Not enough prize cards left.' };
      }
      return { allowed: true };
    }

    case 'playTrainer': {
      const cardRef = findCard(state, payload.instanceId);
      if (cardRef) {
        const typeStr = String(cardRef.card.type || '').toLowerCase();
        const subStr = String(cardRef.card.subtypes || '').toLowerCase();
        const isSupporter = typeStr.includes('supporter') || subStr.includes('supporter');
        if (isSupporter && player.flags?.supporterPlayed) {
          return { allowed: false, reason: 'Supporter already played this turn.' };
        }

        const isStadiumCard = subStr.includes('stadium') || typeStr.includes('stadium');
        if (isStadiumCard && state.stadium) {
          const currentStadiumName = String(state.stadium.name || '').trim().toLowerCase();
          const newStadiumName = String(cardRef.card.name || '').trim().toLowerCase();
          if (currentStadiumName && newStadiumName && currentStadiumName === newStadiumName) {
            return { allowed: false, reason: 'A Stadium card with the same name is already in play.' };
          }
        }

        const text = cardRef.card.text || cardRef.card.effect || cardRef.card.cardText || '';
        const parsed = parseTrainerEffect(text);
        if (parsed?.steps?.[0]?.type === 'discardCost') {
          const cost = parsed.steps[0].count || 1;
          const otherHandCards = (player.zones?.hand || []).filter((c) => c.instanceId !== payload.instanceId);
          if (otherHandCards.length < cost) {
            return { allowed: false, reason: 'Not enough cards in hand to pay discard cost.' };
          }
        }

        // Edge Case 9: Cannot play search-to-bench trainers when bench is full
        if (parsed?.steps && parsed.steps.length > 0) {
          const nonCostSteps = parsed.steps.filter((s) => s.type !== 'discardCost');
          if (
            nonCostSteps.length > 0 &&
            nonCostSteps.every((s) => s.destination === 'bench')
          ) {
            const bench = player.zones?.bench || [];
            const benchPokemonCount = bench.filter((c) => !c.attachedTo).length;
            if (benchPokemonCount >= 5) {
              return { allowed: false, reason: 'bench_full' };
            }
          }
        }
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
        return { allowed: false, reason: 'Stadium effect already used this turn.' };
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
        return { allowed: false, reason: 'VSTAR / GX attack or ability already used this game.' };
      }
      return { allowed: true };
    }

    default:
      return { allowed: true };
  }
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
    return { state: null, events: [], pendingChoice: null, error: 'bad_command', reason: 'Invalid state' };
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
    const optionIds = new Set((state.pendingChoice.options || []).map((o) => o.instanceId));
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
        const idx = srcZone.findIndex((c) => c.instanceId === payload.instanceId);
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
          if (payload.targetIndex != null && payload.targetIndex >= 0 && payload.targetIndex <= destZone.length) {
            destZone.splice(payload.targetIndex, 0, card);
          } else {
            destZone.push(card);
          }

          // If moving between active and bench, bring along all attached cards
          if (['active', 'bench'].includes(payload.from) && ['active', 'bench'].includes(payload.to)) {
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
        const idx = srcZone.findIndex((c) => c.instanceId === payload.instanceId);
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
        cardRef.card.specialCondition = payload.condition;
        events.push({
          type: 'specialConditionUpdated',
          instanceId: payload.instanceId,
          condition: cardRef.card.specialCondition,
        });
      }
      break;
    }

    case 'updateSpecialCondition': {
      const cardRef = findCard(draft, payload.instanceId);
      if (cardRef) {
        cardRef.card.specialCondition = payload.condition;
        events.push({
          type: 'specialConditionUpdated',
          instanceId: payload.instanceId,
          condition: cardRef.card.specialCondition,
        });
      }
      break;
    }

    case 'removeSpecialCondition': {
      const cardRef = findCard(draft, payload.instanceId);
      if (cardRef) {
        cardRef.card.specialCondition = null;
        events.push({
          type: 'specialConditionUpdated',
          instanceId: payload.instanceId,
          condition: null,
        });
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

    case 'setup': {
      const setupResult = setupGame(draft, { firstPlayerId: payload?.firstPlayerId, rng: activeRng });
      events.push(...setupResult.events);
      break;
    }

    case 'attack': {
      const attackerPlayer = draft.players[playerId];
      const attacker = attackerPlayer?.zones?.active?.find((c) => !c.attachedTo);
      const atkIdx = payload?.attackIndex ?? 0;
      const attack = attacker?.attacks?.[atkIdx] || { name: 'Attack', damage: 10 };

      const oppId = Object.keys(draft.players || {}).find((id) => id !== playerId);
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
          if (attacker.hp && attacker.damage >= attacker.hp) {
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
            resolveCheckup(draft, { rng: activeRng, events, endingPlayerId: playerId });
            if (draft.turn.phase !== 'ended') {
              advanceTurn(draft, { nextPlayerId: oppId, events });
            }
          }
          break;
        }
      }


      let dmgDealt = 0;
      if (attacker && defender) {
        const dmgResult = computeAttackDamage(attacker, defender, attack);
        dmgDealt = dmgResult.total;
        defender.damage = (defender.damage || 0) + dmgDealt;
        events.push({
          type: 'damageUpdated',
          instanceId: defender.instanceId,
          damage: defender.damage,
          dealt: dmgDealt,
        });

        // KO check
        const koHp = defender.hp || 0;
        if (koHp > 0 && defender.damage >= koHp) {
          handleKnockout(draft, {
            victimPlayerId: defenderPlayerId,
            attackerPlayerId: playerId,
            victim: defender,
            events,
          });
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

      events.push({
        type: 'attackExecuted',
        attackerId: attacker?.instanceId,
        attackName: attack.name,
        damage: dmgDealt,
        playerId,
      });

      if (!attackerPlayer.flags) attackerPlayer.flags = {};
      attackerPlayer.flags.attackerAttacked = true;

      // Auto-end turn after attacking
      if (draft.turn.phase !== 'ended') {
        resolveCheckup(draft, { rng: activeRng, events, endingPlayerId: playerId });
        if (draft.turn.phase !== 'ended') {
          advanceTurn(draft, { nextPlayerId: oppId, events });
        }
      }
      break;
    }

    case 'retreat': {
      const player = draft.players[playerId];
      const active = player?.zones?.active?.find((c) => !c.attachedTo);
      const costN = getRetreatCostCount(active);

      // Discard energy cost
      if (Array.isArray(payload?.discardEnergyIds) && payload.discardEnergyIds.length > 0) {
        for (const id of payload.discardEnergyIds) {
          const idx = player.zones.active.findIndex((c) => c.instanceId === id);
          if (idx >= 0) {
            const [discarded] = player.zones.active.splice(idx, 1);
            discarded.attachedTo = null;
            player.zones.discard.push(discarded);
            events.push({ type: 'cardMoved', instanceId: id, from: 'active', to: 'discard', playerId });
          }
        }
      } else if (costN > 0) {
        let discardedCount = 0;
        for (let i = player.zones.active.length - 1; i >= 0 && discardedCount < costN; i--) {
          const card = player.zones.active[i];
          if (card.attachedTo === active.instanceId && isEnergy(card)) {
            player.zones.active.splice(i, 1);
            card.attachedTo = null;
            player.zones.discard.push(card);
            discardedCount++;
            events.push({ type: 'cardMoved', instanceId: card.instanceId, from: 'active', to: 'discard', playerId });
          }
        }
      }

      // Bench swap
      let benchPokemon = null;
      if (payload?.benchInstanceId != null) {
        benchPokemon = player.zones.bench.find((c) => c.instanceId === payload.benchInstanceId);
      } else {
        benchPokemon = player.zones.bench.find((c) => !c.attachedTo);
      }

      if (active && benchPokemon) {
        // Move active + attachments to bench
        for (let i = player.zones.active.length - 1; i >= 0; i--) {
          const c = player.zones.active[i];
          if (c.instanceId === active.instanceId || c.attachedTo === active.instanceId) {
            player.zones.active.splice(i, 1);
            player.zones.bench.push(c);
          }
        }
        // Move benchPokemon + attachments to active
        for (let i = player.zones.bench.length - 1; i >= 0; i--) {
          const c = player.zones.bench[i];
          if (c.instanceId === benchPokemon.instanceId || c.attachedTo === benchPokemon.instanceId) {
            player.zones.bench.splice(i, 1);
            player.zones.active.push(c);
          }
        }

        active.specialCondition = null;
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
      const oppId = Object.keys(draft.players || {}).find((id) => id !== playerId);
      resolveCheckup(draft, { rng: activeRng, events, endingPlayerId: playerId });
      if (draft.turn.phase !== 'ended') {
        advanceTurn(draft, { nextPlayerId: oppId, events });
      }
      break;
    }

    case 'takePrizes': {
      const count = payload?.count ?? 1;
      const prizes = draft.players[playerId].zones.prizes;
      const hand = draft.players[playerId].zones.hand;
      const actualCount = Math.min(count, prizes.length);
      const drawnPrizes = prizes.splice(0, actualCount);
      hand.push(...drawnPrizes);

      events.push({
        type: 'prizesTaken',
        playerId,
        count: actualCount,
        cards: drawnPrizes.map((c) => ({ instanceId: c.instanceId })),
      });

      if (prizes.length === 0) {
        setGameEnded(draft, { winner: playerId, reason: 'all prize cards taken', events });
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

      events.push({
        type: 'prizesTaken',
        playerId,
        count: taken.length,
        cards: taken.map((c) => ({ instanceId: c.instanceId })),
      });

      if (prizes.length === 0) {
        setGameEnded(draft, { winner: playerId, reason: 'all prize cards taken', events });
      }
      break;
    }

    case 'promote': {
      const player = draft.players[playerId];
      const benchIdx = player.zones.bench.findIndex((c) => c.instanceId === payload.instanceId);
      if (benchIdx >= 0) {
        for (let i = player.zones.bench.length - 1; i >= 0; i--) {
          const c = player.zones.bench[i];
          if (c.instanceId === payload.instanceId || c.attachedTo === payload.instanceId) {
            player.zones.bench.splice(i, 1);
            player.zones.active.push(c);
          }
        }
        events.push({ type: 'pokemonPromoted', instanceId: payload.instanceId, playerId });
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
      events.push({ type: 'vstarUsed', playerId, instanceId: payload.instanceId });
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
      const initiatorPlayerId = token.initiatorPlayerId || resumeCardOwnerId || playerId;

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
      } else if (token.effectType === 'stadium') {
        executeStadium(draft, {
          playerId: initiatorPlayerId,
          activeRng,
          events,
          selection: payload.selection,
          resumeToken: token,
        });
      } else {
        draft.pendingChoice = null;
      }
      break;
    }

    default:
      break;
  }

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

