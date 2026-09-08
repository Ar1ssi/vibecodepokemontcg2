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
    prizes: (zones.prizes || []).map((c) => (c.revealed ? sanitizeCard(c) : redactCard(c))),
    active: (zones.active || []).map(sanitizeCard),
    bench: (zones.bench || []).map(sanitizeCard),
    discard: (zones.discard || []).map(sanitizeCard),
    lostZone: (zones.lostZone || []).map(sanitizeCard),
    board: (zones.board || []).map(sanitizeCard),
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
    prizes: (zones.prizes || []).map((c) => (c.revealed ? sanitizeCard(c) : redactCard(c))),
    active: (zones.active || []).map(sanitizeCard),
    bench: (zones.bench || []).map(sanitizeCard),
    discard: (zones.discard || []).map(sanitizeCard),
    lostZone: (zones.lostZone || []).map(sanitizeCard),
    board: (zones.board || []).map(sanitizeCard),
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
    prizes: (zones.prizes || []).map((c) => (c.revealed ? sanitizeCard(c) : redactCard(c))),
    active: (zones.active || []).map(sanitizeCard),
    bench: (zones.bench || []).map(sanitizeCard),
    discard: (zones.discard || []).map(sanitizeCard),
    lostZone: (zones.lostZone || []).map(sanitizeCard),
    board: (zones.board || []).map(sanitizeCard),
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
        flags: { ...player.flags },
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
      flags: { ...owner.flags },
      zones: redactOwnerZones(owner),
    },
    them: opponent
      ? {
          playerId: opponent.playerId,
          username: opponent.username,
          flags: { ...opponent.flags },
          zones: redactOpponentZones(opponent),
        }
      : null,
  };
}
