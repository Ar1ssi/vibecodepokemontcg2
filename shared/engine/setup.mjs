/**
 * @file Deterministic game setup, mulligan evaluation, and turn order resolution.
 * Pure and DOM-free (Invariants 6 & 8).
 * All randomness is drawn strictly from the injected PRNG.
 */

import { isBasicPokemon } from './cards.mjs';
import { createRng } from './rng.mjs';

/**
 * Checks if an array of cards contains at least one Basic Pokémon.
 *
 * @param {object[]} hand
 * @returns {boolean}
 */
export function hasBasicPokemon(hand = []) {
  if (!Array.isArray(hand)) return false;
  return hand.some((card) => isBasicPokemon(card));
}

/**
 * Executes deterministic setup sequence for GameState:
 * 1. Shuffles each player's deck using rng.shuffle().
 * 2. Deals 7 cards to hand and 6 cards to prizes.
 * 3. Evaluates mulligans, redrawing hands without Basic Pokémon and awarding opponent bonus draws.
 * 4. Resolves turn order via rng (or options.firstPlayerId).
 * 5. Sets turn to { player: starter, number: 1, phase: 'main' } and initializes player flags.
 *
 * @param {object} state GameState (or cloned draft)
 * @param {object} [options]
 * @param {string} [options.firstPlayerId]
 * @param {object} [options.rng] Seeded PRNG instance
 * @param {number} [options.maxMulligans=10] Guard against infinite loops on decks with no basics
 * @returns {{
 *   state: object,
 *   events: object[],
 *   mulligans: Record<string, number>
 * }}
 */
export function setupGame(state, { firstPlayerId = null, rng = null, maxMulligans = 10 } = {}) {
  if (!state || typeof state !== 'object') {
    throw new Error('setupGame requires a valid GameState');
  }

  const activeRng = rng || createRng(state.seed || 0);
  const events = [];
  const mulligans = {};
  const playerIds = Object.keys(state.players || {});

  for (const pid of playerIds) {
    mulligans[pid] = 0;
  }

  // Step 1 & 2: Shuffle deck, deal 7 hand cards and 6 prize cards
  for (const pid of playerIds) {
    const player = state.players[pid];
    if (!player.zones) continue;

    // Shuffle deck
    player.zones.deck = activeRng.shuffle([...player.zones.deck]);
    events.push({ type: 'deckShuffled', playerId: pid });

    // Deal opening hand (up to 7 cards)
    const handCount = Math.min(7, player.zones.deck.length);
    const handCards = player.zones.deck.splice(0, handCount);
    player.zones.hand.push(...handCards);
    events.push({
      type: 'openingHandDealt',
      playerId: pid,
      count: handCount,
    });

    // Deal prizes (up to 6 cards)
    const prizeCount = Math.min(6, player.zones.deck.length);
    const prizeCards = player.zones.deck.splice(0, prizeCount);
    player.zones.prizes.push(...prizeCards);
    events.push({
      type: 'prizesSet',
      playerId: pid,
      count: prizeCount,
    });
  }

  // Step 3: Mulligan evaluation
  let iteration = 0;
  while (iteration < maxMulligans) {
    iteration++;
    const needingMulligan = playerIds.filter(
      (pid) => !hasBasicPokemon(state.players[pid].zones?.hand)
    );

    if (needingMulligan.length === 0) {
      break;
    }

    for (const pid of needingMulligan) {
      const player = state.players[pid];
      mulligans[pid] = (mulligans[pid] || 0) + 1;

      // Return hand to deck
      player.zones.deck.push(...player.zones.hand);
      player.zones.hand = [];

      // Reshuffle deck
      player.zones.deck = activeRng.shuffle([...player.zones.deck]);

      // Redraw 7 cards
      const count = Math.min(7, player.zones.deck.length);
      const drawn = player.zones.deck.splice(0, count);
      player.zones.hand.push(...drawn);

      events.push({
        type: 'mulliganTaken',
        playerId: pid,
        mulliganCount: mulligans[pid],
      });

      // Award bonus draw to opponents
      for (const otherPid of playerIds) {
        if (otherPid === pid) continue;
        const opponent = state.players[otherPid];
        if (opponent.zones?.deck?.length > 0) {
          const [bonusCard] = opponent.zones.deck.splice(0, 1);
          opponent.zones.hand.push(bonusCard);
          events.push({
            type: 'bonusDrawAwarded',
            playerId: otherPid,
            sourcePlayerId: pid,
          });
        }
      }
    }
  }

  // Step 4: Turn order determination
  let starter = null;
  if (firstPlayerId && playerIds.includes(firstPlayerId)) {
    starter = firstPlayerId;
  } else if (playerIds.length >= 2) {
    starter = activeRng.next() < 0.5 ? playerIds[0] : playerIds[1];
  } else if (playerIds.length === 1) {
    starter = playerIds[0];
  }

  // Step 5: Initialize turn & player flags
  state.turn = {
    player: starter,
    number: 1,
    phase: 'main',
  };

  for (const pid of playerIds) {
    state.players[pid].flags = {
      energyAttached: false,
      attackerAttacked: false,
      retreatedThisTurn: false,
      supporterPlayed: false,
      abilitiesUsed: {},
    };
  }

  events.push({
    type: 'gameSetupCompleted',
    starter,
    mulligans,
  });

  if (typeof activeRng.cursor === 'number') {
    state.rngCursor = activeRng.cursor;
  }

  return {
    state,
    events,
    mulligans,
  };
}
