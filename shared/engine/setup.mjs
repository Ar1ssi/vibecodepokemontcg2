/**
 * @file Deterministic game setup, mulligan evaluation, and turn order resolution.
 * Pure and DOM-free (Invariants 6 & 8).
 * All randomness is drawn strictly from the injected PRNG.
 */

import { isBasicPokemon } from './cards.mjs';
import { createRng } from './rng.mjs';
import {
  OPENING_HAND_SIZE,
  decksMismatchFormat,
  normalizeDeckFormat,
  prizeCountForFormat,
} from './formats.mjs';

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
 * Design 051 / I202: the decks about to be dealt when their formats differ, else null.
 * Only players with a loaded deck count, so a seat still choosing a deck never blocks.
 * Design 053: with a room format both players agreed on, every deck must be that format.
 * @param {object} state
 * @param {string|null} [roomFormat]
 * @returns {{ playerId: string, username: string, format: string }[] | null}
 */
export function deckFormatMismatch(state, roomFormat = null) {
  const decks = Object.values(state?.players || {})
    .filter((player) => player?.zones?.deck?.length > 0)
    .map((player) => ({
      playerId: player.playerId,
      username: player.username || player.playerId,
      format: normalizeDeckFormat(player.deckFormat),
    }));
  return decksMismatchFormat(decks, roomFormat);
}

/**
 * Executes deterministic setup sequence for GameState:
 * 1. Shuffles each player's deck using rng.shuffle().
 * 2. Deals the opening hand and the format's Prize cards (Standard 6, Build & Battle 4).
 * 3. Evaluates mulligans, redrawing hands without Basic Pokémon and awarding opponent bonus draws.
 * 4. Resolves turn order via rng (or options.firstPlayerId).
 * 5. Sets turn to { player: starter, number: 1, phase: 'main' } and initializes player flags.
 * 6. Draws the starter's turn-1 card — or, with deferStarterDraw, leaves it to
 *    `settleOpeningDraw` once both Active Spots are filled (rules 1.3: players place
 *    their Basics before the first turn's draw).
 *
 * @param {object} state GameState (or cloned draft)
 * @param {object} [options]
 * @param {string} [options.firstPlayerId]
 * @param {object} [options.rng] Seeded PRNG instance
 * @param {number} [options.maxMulligans=10] Guard against infinite loops on decks with no basics
 * @param {boolean} [options.firstPrizeWins=false] Sudden-death tiebreaker: the first
 *   player to take a Prize card wins (sets `state.firstPrizeWins`)
 * @param {boolean} [options.deferStarterDraw=false] Hold the starter's turn-1 draw
 *   until both players have an Active Pokémon (sets `state.openingDrawPending`)
 * @returns {{
 *   state: object,
 *   events: object[],
 *   mulligans: Record<string, number>
 * }}
 */
export function setupGame(
  state,
  { firstPlayerId = null, rng = null, maxMulligans = 10, firstPrizeWins = false, deferStarterDraw = false } = {}
) {
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

  // Step 1 & 2: Shuffle deck, deal the opening hand and each player's format's Prize cards
  for (const pid of playerIds) {
    const player = state.players[pid];
    if (!player.zones) continue;

    // Shuffle deck
    player.zones.deck = activeRng.shuffle([...player.zones.deck]);
    events.push({ type: 'deckShuffled', playerId: pid });

    const handCount = Math.min(OPENING_HAND_SIZE, player.zones.deck.length);
    const handCards = player.zones.deck.splice(0, handCount);
    player.zones.hand.push(...handCards);
    // Design 044: the ids let the client fly each card in (instance ids are
    // public; the opponent's hand is redacted to them).
    events.push({
      type: 'openingHandDealt',
      playerId: pid,
      count: handCount,
      cards: handCards.map((card) => ({ instanceId: card.instanceId })),
    });

    const prizeCount = Math.min(prizeCountForFormat(player.deckFormat), player.zones.deck.length);
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

      const count = Math.min(OPENING_HAND_SIZE, player.zones.deck.length);
      const drawn = player.zones.deck.splice(0, count);
      player.zones.hand.push(...drawn);

      events.push({
        type: 'mulliganTaken',
        playerId: pid,
        mulliganCount: mulligans[pid],
        cards: drawn.map((card) => ({ instanceId: card.instanceId })),
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
        cards: [{ instanceId: bonusCard.instanceId }],
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
      attacksThisTurn: 0,
      retreatedThisTurn: false,
      supporterPlayed: false,
      stadiumPlayedThisTurn: false,
      stadiumUsedThisTurn: false,
      abilitiesUsed: {},
      evolved: {},
    };
    // Once-per-game limits (App. 9/19) are game-scoped and reset only here.
    state.players[pid].oncePerGame = {
      vstarUsed: false,
      gxUsed: false,
    };
  }

  delete state.openingDrawPending;
  if (starter && deferStarterDraw) {
    state.openingDrawPending = starter;
  } else if (starter) {
    drawOpeningTurnCard(state, starter, events);
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

function drawOpeningTurnCard(state, playerId, events) {
  const player = state.players[playerId];
  if (!player?.zones?.deck?.length) return;
  const [card] = player.zones.deck.splice(0, 1);
  player.zones.hand.push(card);
  events.push({
    type: 'cardsDrawn',
    playerId,
    count: 1,
    cards: [{ instanceId: card.instanceId }],
  });
}

/**
 * Draws the starter's deferred turn-1 card (setupGame `deferStarterDraw`) as soon
 * as every player has an Active Pokémon. Run after each command; a no-op otherwise.
 * If turn 1 ends first (a flow that skipped the opening placement), the card is
 * still drawn then, so the starter is never a card short.
 *
 * @param {object} state GameState draft
 * @param {object[]} events Event list the draw is appended to
 * @returns {boolean} true when the draw was settled this call
 */
export function settleOpeningDraw(state, events) {
  const starter = state?.openingDrawPending;
  if (!starter) return false;
  const players = Object.values(state.players || {});
  const activesPlaced = players.every((player) => (player?.zones?.active?.length || 0) > 0);
  const turnOneOver = state.turn?.player !== starter || (state.turn?.number || 1) > 1;
  if (!activesPlaced && !turnOneOver) return false;
  delete state.openingDrawPending;
  drawOpeningTurnCard(state, starter, events);
  return true;
}
