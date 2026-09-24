/**
 * @file Authoritative view generation and redaction.
 * Produces redacted per-player (and spectator) views with absolute IDs mapped to { you, them }.
 * Never leaks hidden information (deck contents, opponent hand cards, unrevealed prizes).
 */

import { cloneCard } from './cards.mjs';

/**
 * Strips all hidden card information, returning only identity.
 *
 * @param {object} card
 * @returns {{ instanceId: number }}
 */
function redactCard(card) {
  return { instanceId: card.instanceId };
}

/**
 * Clones and sanitizes a card for public or owner view.
 *
 * @param {object} card
 * @returns {object}
 */
function sanitizeCard(card) {
  if (!card) return null;
  return cloneCard(card);
}

/**
 * A board card played face down (design 012) stays hidden from everyone, its owner
 * included, until it is revealed — the same rule the legacy table applied.
 *
 * @param {object} card
 * @returns {object}
 */
function boardCard(card) {
  return card?.faceDown && !card.revealed ? redactCard(card) : sanitizeCard(card);
}

/**
 * The client-visible per-player flags. `oncePerGame` (App. 9/19 GX/VSTAR limits) is
 * game-scoped server state; it is projected here so the existing client buttons, which
 * read `flags.vstarUsed`/`flags.gxUsed`, keep their wire shape.
 *
 * @param {object} player
 * @returns {object}
 */
function playerFlags(player) {
  return { ...(player?.flags || {}), ...(player?.oncePerGame || {}) };
}

/**
 * A player's Prize cards as seen by any viewer: face down (identity only) until a
 * card was individually revealed or the player turned them all face up (Town Map /
 * Here Comes Team Rocket!, design 035 slice 7).
 *
 * @param {object} player
 * @returns {object[]}
 */
function prizeCards(player) {
  const prizes = player?.zones?.prizes || [];
  const faceUp = Boolean(player?.flags?.prizesFaceUp);
  return prizes.map((c) => (faceUp || c.revealed ? sanitizeCard(c) : redactCard(c)));
}

/**
 * Redacts a player's zones for the owner ('you').
 *
 * @param {object} player
 * @returns {object} Redacted zones
 */
function redactOwnerZones(player) {
  const zones = player.zones || {};
  return {
    deck: { count: (zones.deck || []).length },
    hand: (zones.hand || []).map(sanitizeCard),
    prizes: prizeCards(player),
    active: (zones.active || []).map(sanitizeCard),
    bench: (zones.bench || []).map(sanitizeCard),
    discard: (zones.discard || []).map(sanitizeCard),
    lostZone: (zones.lostZone || []).map(sanitizeCard),
    board: (zones.board || []).map(boardCard),
  };
}

/**
 * Redacts a player's zones for the opponent ('them').
 *
 * @param {object} player
 * @returns {object} Redacted zones
 */
function redactOpponentZones(player) {
  const zones = player.zones || {};
  return {
    deck: { count: (zones.deck || []).length },
    hand: (zones.hand || []).map((c) => (c.revealed ? sanitizeCard(c) : redactCard(c))),
    prizes: prizeCards(player),
    active: (zones.active || []).map(sanitizeCard),
    bench: (zones.bench || []).map(sanitizeCard),
    discard: (zones.discard || []).map(sanitizeCard),
    lostZone: (zones.lostZone || []).map(sanitizeCard),
    board: (zones.board || []).map(boardCard),
  };
}

/**
 * Redacts a player's zones for a spectator.
 *
 * @param {object} player
 * @returns {object} Redacted zones
 */
function redactSpectatorZones(player) {
  const zones = player.zones || {};
  return {
    deck: { count: (zones.deck || []).length },
    hand: { count: (zones.hand || []).length },
    prizes: prizeCards(player),
    active: (zones.active || []).map(sanitizeCard),
    bench: (zones.bench || []).map(sanitizeCard),
    discard: (zones.discard || []).map(sanitizeCard),
    lostZone: (zones.lostZone || []).map(sanitizeCard),
    board: (zones.board || []).map(boardCard),
  };
}

/**
 * Redacts pending choice for a player who is not the choice's recipient.
 *
 * @param {object} choice
 * @returns {object}
 */
function redactPendingChoiceForOpponent(choice) {
  if (!choice) return null;
  return {
    choiceId: choice.choiceId,
    player: choice.player,
    prompt: choice.prompt,
    cancellable: false,
    optionsCount: Array.isArray(choice.options) ? choice.options.length : 0,
  };
}

/**
 * Generates an authoritative, redacted view of GameState for a specific player or spectator.
 * Maps absolute player IDs to { you, them } (Hazard H1).
 *
 * @param {object} state GameState
 * @param {string|null} playerId Absolute player ID (or null for spectator)
 * @returns {object} Redacted view
 */
export function viewFor(state, playerId) {
  if (!state) return null;

  const playerIds = Object.keys(state.players || {});
  const isSpectator = !playerId || !state.players?.[playerId];

  let pendingChoice = null;
  if (state.pendingChoice) {
    if (!isSpectator && state.pendingChoice.player === playerId) {
      pendingChoice = JSON.parse(JSON.stringify(state.pendingChoice));
    } else {
      pendingChoice = redactPendingChoiceForOpponent(state.pendingChoice);
    }
  }

  const baseView = {
    gameId: state.gameId,
    stateVersion: state.stateVersion,
    rulesEnabled: state.rulesEnabled,
    turn: {
      player: state.turn.player,
      isYourTurn: !isSpectator && state.turn.player === playerId,
      number: state.turn.number,
      phase: state.turn.phase,
    },
    winner: state.winner || null,
    winReason: state.winReason || null,
    stadium: sanitizeCard(state.stadium),
    pendingChoice,
  };

  if (isSpectator) {
    const spectatorPlayers = {};
    for (const [id, player] of Object.entries(state.players || {})) {
      spectatorPlayers[id] = {
        playerId: id,
        username: player.username,
        flags: playerFlags(player),
        zones: redactSpectatorZones(player),
      };
    }
    return {
      ...baseView,
      isSpectator: true,
      you: null,
      them: null,
      players: spectatorPlayers,
    };
  }

  const owner = state.players[playerId];
  const oppId = playerIds.find((id) => id !== playerId);
  const opponent = oppId ? state.players[oppId] : null;

  return {
    ...baseView,
    isSpectator: false,
    you: {
      playerId,
      username: owner.username,
      flags: playerFlags(owner),
      zones: redactOwnerZones(owner),
    },
    them: opponent
      ? {
          playerId: opponent.playerId,
          username: opponent.username,
          flags: playerFlags(opponent),
          zones: redactOpponentZones(opponent),
        }
      : null,
  };
}

/**
 * Design 012: the top or bottom `count` cards of a deck, shown only to the player who asked
 * ("look at the top N cards"). Nothing in state changes, so it is answered outside the
 * command log. With rules on, a player may look only at their own deck — card effects that
 * reveal the opponent's deck go through the server's own choices.
 *
 * @param {object} state GameState
 * @param {string} playerId the asking player
 * @param {{ side?: 'you'|'them', count?: number, fromTop?: boolean }} request
 * @returns {{ ok: true, cards: object[], deckCount: number } | { ok: false, reason: string }}
 */
export function deckPeekFor(state, playerId, request = {}) {
  const player = state?.players?.[playerId];
  if (!player) return { ok: false, reason: 'Only a seated player can look at a deck.' };

  const side = request.side ?? 'you';
  if (side !== 'you' && side !== 'them') return { ok: false, reason: 'Unknown deck.' };
  if (side === 'them' && state.rulesEnabled) {
    return { ok: false, reason: "You can't look at your opponent's deck with rules on." };
  }
  const deckOwner =
    side === 'you'
      ? player
      : Object.values(state.players).find((p) => p !== player) || null;
  if (!deckOwner) return { ok: false, reason: 'There is no opponent deck to look at.' };

  const count = request.count;
  if (!Number.isInteger(count) || count < 1) {
    return { ok: false, reason: 'Look at 1 or more cards.' };
  }
  const deck = deckOwner.zones?.deck || [];
  if (deck.length === 0) return { ok: false, reason: 'That deck is empty.' };

  const shown = Math.min(count, deck.length);
  const slice = request.fromTop === false ? deck.slice(deck.length - shown) : deck.slice(0, shown);
  return { ok: true, cards: slice.map(sanitizeCard), deckCount: deck.length };
}
