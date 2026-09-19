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
 * Net mulligan bonus draws owed to each player. Officially every opponent
 * draws one card per mulligan a player takes, so for each ordered pair only
 * the difference in mulligan counts is owed; lockstep mulligans cancel out.
 *
 * @param {Record<string, number>} mulligans Mulligans taken per player
 * @param {string[]} [playerIds] Defaults to the mulligan map's keys
 * @returns {Record<string, number>} Cards owed to each player
 */
export function mulliganBonusDraws(
  mulligans = {},
  playerIds = Object.keys(mulligans)
) {
  const owed = {};
  for (const pid of playerIds) owed[pid] = 0;
  for (const pid of playerIds) {
    for (const otherPid of playerIds) {
      if (otherPid === pid) continue;
      const diff = (mulligans[pid] || 0) - (mulligans[otherPid] || 0);
      if (diff > 0) owed[otherPid] += diff;
    }
  }
  return owed;
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
 * @param {boolean} [options.firstPrizeWins=false] Sudden-death tiebreaker: the first
 *   player to take a Prize card wins (sets `state.firstPrizeWins`)
 * @returns {{
 *   state: object,
 *   events: object[],
 *   mulligans: Record<string, number>
 * }}
 */
export function setupGame(state, { firstPlayerId = null, rng = null, maxMulligans = 10, firstPrizeWins = false } = {}) {
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
    }
  }

  // Step 3b: net mulligan bonus draws. Each opponent draws one card per
  // mulligan, but two players who mulligan the same number of times cancel
  // out; only the net difference between each pair is actually owed. Awarding
  // inside the loop (pre-30c) over-awarded both players on lockstep mulligans.
  const bonuses = mulliganBonusDraws(mulligans, playerIds);
  for (const pid of playerIds) {
    const opponent = state.players[pid];
    const source = playerIds.find(
      (other) => other !== pid && (mulligans[other] || 0) > (mulligans[pid] || 0)
    );
    for (let i = 0; i < bonuses[pid]; i++) {
      if (!(opponent.zones?.deck?.length > 0)) break;
      const [bonusCard] = opponent.zones.deck.splice(0, 1);
      opponent.zones.hand.push(bonusCard);
      events.push({
        type: 'bonusDrawAwarded',
        playerId: pid,
        sourcePlayerId: source,
      });
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
      stadiumPlayedThisTurn: false,
      stadiumUsedThisTurn: false,
      abilitiesUsed: {},
      evolved: {},
    };
  }

  if (starter) {
    const starterDeck = state.players[starter].zones.deck;
    const starterHand = state.players[starter].zones.hand;
    if (starterDeck.length > 0) {
      const [card] = starterDeck.splice(0, 1);
      starterHand.push(card);
      events.push({
        type: 'cardsDrawn',
        playerId: starter,
        count: 1,
        cards: [{ instanceId: card.instanceId }],
      });
    }
  }

  events.push({
    type: 'gameSetupCompleted',
    starter,
    mulligans,
    firstPrizeWins: Boolean(firstPrizeWins),
  });

  // Sudden-death tiebreaker: whoever takes the first Prize card wins. The
  // reducer reads this to end the game on the first `takePrizes`.
  if (firstPrizeWins) {
    state.firstPrizeWins = true;
  } else if ('firstPrizeWins' in state) {
    delete state.firstPrizeWins;
  }

  if (typeof activeRng.cursor === 'number') {
    state.rngCursor = activeRng.cursor;
  }

  return {
    state,
    events,
    mulligans,
  };
}
