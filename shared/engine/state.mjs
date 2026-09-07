/**
 * @file Pure GameState data model, zone accessors, and state hashing.
 * Absolutely no DOM dependencies. Absolute player IDs only (never 'self'/'opp' - H1).
 */

import { hashBoardSnapshot } from './zones/zone-hash.mjs';
import { cloneCard, createCard } from './cards.mjs';

export const PLAYER_ZONES = [
  'deck',
  'hand',
  'prizes',
  'active',
  'bench',
  'discard',
  'lostZone',
  'board',
];

/**
 * Creates initial 8 pure zones for a player.
 *
 * @returns {Record<string, object[]>}
 */
export function createPlayerZones() {
  const zones = {};
  for (const zone of PLAYER_ZONES) {
    zones[zone] = [];
  }
  return zones;
}

/**
 * Creates a fresh authoritative GameState.
 *
 * @param {object} options
 * @param {string} [options.gameId]
 * @param {string|number} [options.seed]
 * @param {Record<string, object>|Array<{ playerId: string, username?: string, deckList?: object[] }>} [options.players]
 * @param {boolean} [options.rulesEnabled=true]
 * @returns {object} GameState
 */
export function createGameState({
  gameId = 'game-' + Date.now(),
  seed = 0,
  players = {},
  rulesEnabled = true,
} = {}) {
  const state = {
    gameId,
    stateVersion: 0,
    seed,
    rngCursor: 0,
    rulesEnabled: Boolean(rulesEnabled),
    nextInstanceId: 0,
    players: {},
    stadium: null,
    turn: {
      player: null,
      number: 1,
      phase: 'setup', // 'setup' | 'main' | 'attack' | 'ended'
    },
    pendingChoice: null,
    commandLog: [],
  };

  const playerEntries = Array.isArray(players)
    ? players.map((p) => [p.playerId, p])
    : Object.entries(players);

  for (const [playerId, pData] of playerEntries) {
    if (!playerId) continue;
    state.players[playerId] = {
      playerId,
      username: pData.username || playerId,
      deckList: Array.isArray(pData.deckList) ? [...pData.deckList] : [],
      zones: createPlayerZones(),
      flags: { ...(pData.flags || {}) },
    };

    // If initial cards were provided for any zone
    if (pData.zones) {
      for (const zone of PLAYER_ZONES) {
        if (Array.isArray(pData.zones[zone])) {
          state.players[playerId].zones[zone] = pData.zones[zone].map((c) =>
            createCard(c)
          );
        }
      }
    }
  }

  const playerIds = Object.keys(state.players);
  if (playerIds.length > 0) {
    state.turn.player = playerIds[0];
  }

  return state;
}

/**
 * Accessor for any zone in GameState.
 *
 * @param {object} state
 * @param {string} playerId
 * @param {string} zoneId
 * @returns {object[]} Array of cards
 */
export function getZone(state, playerId, zoneId) {
  if (!state) return [];
  if (zoneId === 'stadium') {
    return state.stadium ? [state.stadium] : [];
  }
  return state.players?.[playerId]?.zones?.[zoneId] ?? [];
}

/**
 * Finds a card anywhere in GameState by its instanceId.
 * Disambiguates cards with identical names (Edge Case 20).
 *
 * @param {object} state
 * @param {number} instanceId
 * @returns {{
 *   player: object|null,
 *   playerId: string|null,
 *   zoneId: string,
 *   index: number,
 *   card: object
 * }|null}
 */
export function findCard(state, instanceId) {
  if (!state || instanceId == null) return null;

  if (state.stadium && state.stadium.instanceId === instanceId) {
    return {
      player: null,
      playerId: null,
      zoneId: 'stadium',
      index: 0,
      card: state.stadium,
    };
  }

  for (const [playerId, player] of Object.entries(state.players || {})) {
    for (const zoneId of PLAYER_ZONES) {
      const zone = player.zones?.[zoneId];
      if (!Array.isArray(zone)) continue;
      for (let i = 0; i < zone.length; i++) {
        if (zone[i]?.instanceId === instanceId) {
          return {
            player,
            playerId,
            zoneId,
            index: i,
            card: zone[i],
          };
        }
      }
    }
  }

  return null;
}

/**
 * Locates all cards attached to a given card instance.
 *
 * @param {object} state
 * @param {number} targetInstanceId
 * @returns {object[]}
 */
export function getAttachedCards(state, targetInstanceId) {
  if (!state || targetInstanceId == null) return [];
  const attached = [];

  for (const player of Object.values(state.players || {})) {
    for (const zoneId of PLAYER_ZONES) {
      const zone = player.zones?.[zoneId];
      if (!Array.isArray(zone)) continue;
      for (const card of zone) {
        if (card?.attachedTo === targetInstanceId) {
          attached.push(card);
        }
      }
    }
  }

  return attached;
}

/**
 * Deterministic fingerprint of GameState.
 * When playerId is provided, returns the hash matching the client's boardHash (hashBoardSnapshot).
 * When omitted, produces a combined deterministic hash of the entire game.
 *
 * @param {object} state
 * @param {string} [playerId]
 * @returns {string}
 */
export function hashState(state, playerId) {
  if (!state) return '';

  if (playerId) {
    const player = state.players?.[playerId];
    if (!player) return '';
    const zones = {
      ...player.zones,
      stadium: state.stadium ? [state.stadium] : [],
    };
    return hashBoardSnapshot(zones);
  }

  // Entire game state deterministic hash
  const playerIds = Object.keys(state.players || {}).sort();
  const playerHashes = playerIds.map((id) => `${id}:${hashState(state, id)}`).join(';');
  const stadiumHash = state.stadium
    ? hashBoardSnapshot({ stadium: [state.stadium] })
    : 'stadium:none';

  return `v:${state.stateVersion}|turn:${state.turn?.player},${state.turn?.number},${state.turn?.phase}|stadium:${stadiumHash}|players:${playerHashes}`;
}

/**
 * Deep clones a GameState object.
 *
 * @param {object} state
 * @returns {object}
 */
export function cloneGameState(state) {
  if (!state) return null;
  const cloned = {
    ...state,
    turn: { ...state.turn },
    pendingChoice: state.pendingChoice ? JSON.parse(JSON.stringify(state.pendingChoice)) : null,
    commandLog: state.commandLog.map((cmd) => ({ ...cmd, payload: { ...cmd.payload } })),
    stadium: state.stadium ? cloneCard(state.stadium) : null,
    players: {},
  };

  for (const [id, player] of Object.entries(state.players || {})) {
    cloned.players[id] = {
      ...player,
      flags: { ...player.flags },
      deckList: Array.isArray(player.deckList) ? [...player.deckList] : [],
      zones: {},
    };
    for (const zoneId of PLAYER_ZONES) {
      cloned.players[id].zones[zoneId] = (player.zones?.[zoneId] || []).map(cloneCard);
    }
  }

  return cloned;
}
