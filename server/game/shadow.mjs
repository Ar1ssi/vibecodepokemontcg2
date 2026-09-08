/**
 * @file Shadow mode runner and legacy action translator for server-authoritative netcode (Slice 4).
 * Passively observes pushAction and syncCheck relay traffic, translates legacy positional parameters
 * into GameRoom commands and state operations, consumes relayed randomness, compares client boardHash
 * against server hashState(), and logs mismatches for telemetry and validation.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hashState, PLAYER_ZONES } from '../../shared/engine/state.mjs';
import { createCard, isEnergy, mintInstanceId } from '../../shared/engine/cards.mjs';
import { createRelayedRng } from '../../shared/engine/rng.mjs';
import { GameRoom } from './room.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Initializes a player's deck zone from serialized deckData tuples.
 * Follows client buildDeck sequencing so that syncInstance numbers 0..N-1
 * match client card identities bit-for-bit, while minting globally unique
 * instanceId values across all players in GameState.
 *
 * @param {object} state GameState
 * @param {string} playerId
 * @param {Array<Array|object>} deckData
 */
export function initializePlayerDeck(state, playerId, deckData = []) {
  if (!state?.players?.[playerId]) return;

  const player = state.players[playerId];
  player.zones.deck = [];
  let syncInstance = 0;

  for (const item of deckData || []) {
    const [quantity, name, type, imageURL, number, set, tcgId] = Array.isArray(
      item
    )
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

    const cardCount =
      typeof quantity === 'number' && quantity > 0 ? quantity : 1;
    for (let i = 0; i < cardCount; i++) {
      const card = createCard({
        instanceId: mintInstanceId(state),
        syncInstance,
        ownerId: playerId,
        name: name || '',
        type: type || '',
        src: imageURL || '',
        number: number != null ? String(number) : '',
        set: set || '',
        id: tcgId || '',
      });
      syncInstance++;
      player.zones.deck.push(card);
    }
  }

  player.deckList = Array.isArray(deckData) ? [...deckData] : [];
}

/**
 * Extracts deckData array from legacy action parameters.
 * - exchangeData: parameters are [username, deckData, cardBack, coachingMode, callback, matId]
 * - loadDeckData: parameters are [deckData] (or legacy [user, deckData])
 * @param {string} action
 * @param {any[]} parameters
 * @returns {any[] | null}
 */
export function extractDeckData(action, parameters) {
  if (!Array.isArray(parameters)) return null;
  if (action === 'exchangeData') {
    return Array.isArray(parameters[1]) ? parameters[1] : null;
  }
  if (action === 'loadDeckData') {
    if (Array.isArray(parameters[0])) return parameters[0];
    if (Array.isArray(parameters[1])) return parameters[1];
    return null;
  }
  return null;
}

/**
 * Translates a legacy action + positional parameters into either:
 * - Direct state adjustments (deck initialization, setup deals, shuffles)
 * - A pure command object: `{ command: { type, payload, playerId } }`
 *
 * @param {string} action
 * @param {any[]} parameters
 * @param {string} playerId
 * @param {object} state GameState
 * @param {object} [rng] Relayed RNG instance
 * @returns {{ handled?: boolean, command?: object, error?: string }}
 */
export function translateLegacyAction(
  action,
  parameters = [],
  playerId,
  state,
  rng = null
) {
  if (!state || !playerId) {
    return { error: 'invalid_context' };
  }

  const player = state.players?.[playerId];
  if (!player) {
    return { error: 'player_not_found' };
  }

  switch (action) {
    case 'exchangeData':
    case 'loadDeckData': {
      const deckData = extractDeckData(action, parameters);
      if (deckData) {
        initializePlayerDeck(state, playerId, deckData);
      }
      return { handled: true };
    }

    case 'reset': {
      // parameters: [clean, build, invalidMessage]
      const [, build = true] = parameters;
      for (const zone of PLAYER_ZONES) {
        player.zones[zone] = [];
      }
      if (build && player.deckList?.length > 0) {
        initializePlayerDeck(state, playerId, player.deckList);
      }
      return { handled: true };
    }

    case 'setup': {
      // parameters: [indices]
      const [indices] = parameters;
      if (Array.isArray(indices) && indices.length > 0) {
        rng?.queueShuffle?.(indices);
        player.zones.deck = (
          rng?.shuffle || ((arr) => indices.map((i) => arr[i]).filter(Boolean))
        )(player.zones.deck);
      }
      // Draw starting hand: 7 cards to hand
      const handCount = Math.min(7, player.zones.deck.length);
      const handCards = player.zones.deck.splice(0, handCount);
      player.zones.hand.push(...handCards);

      // Deal opening prizes: 6 cards to prizes
      const prizeCount = Math.min(6, player.zones.deck.length);
      const prizeCards = player.zones.deck.splice(0, prizeCount);
      player.zones.prizes.push(...prizeCards);

      return { handled: true };
    }

    case 'setupPrizes': {
      // parameters: [indices]
      const [indices] = parameters;
      if (Array.isArray(indices) && indices.length > 0) {
        rng?.queueShuffle?.(indices);
        player.zones.deck = (
          rng?.shuffle || ((arr) => indices.map((i) => arr[i]).filter(Boolean))
        )(player.zones.deck);
      }
      const prizeCount = Math.min(6, player.zones.deck.length);
      const prizeCards = player.zones.deck.splice(0, prizeCount);
      player.zones.prizes.push(...prizeCards);
      return { handled: true };
    }

    case 'drawOpeningHand': {
      const handCount = Math.min(7, player.zones.deck.length);
      const handCards = player.zones.deck.splice(0, handCount);
      player.zones.hand.push(...handCards);
      return { handled: true };
    }

    case 'draw': {
      // parameters: [initiator, drawAmount]
      const [, drawAmount] = parameters;
      const count = Number(drawAmount) > 0 ? Number(drawAmount) : 1;
      return {
        command: {
          type: 'draw',
          payload: { count },
          playerId,
        },
      };
    }

    case 'shuffleZone': {
      // parameters: [initiator, zoneId, indices, message]
      const [, zoneId, indices] = parameters;
      if (zoneId && player.zones?.[zoneId] && Array.isArray(indices)) {
        rng?.queueShuffle?.(indices);
        player.zones[zoneId] = (
          rng?.shuffle || ((arr) => indices.map((i) => arr[i]).filter(Boolean))
        )(player.zones[zoneId]);
      }
      return { handled: true };
    }

    case 'moveCardBundle': {
      // parameters: [initiator, oZoneId, dZoneId, index, targetIndex, action, cardHints]
      const [, oZoneId, dZoneId, index, targetIndex, actionType, cardHints] =
        parameters;
      const srcZone = player.zones?.[oZoneId] || [];

      // Find source card: prefer cardHints identity if available, fallback to index
      let card = null;
      if (cardHints?.moving) {
        const hint = cardHints.moving;
        card =
          srcZone.find(
            (c) =>
              hint.syncInstance != null && c.syncInstance === hint.syncInstance
          ) ||
          srcZone.find((c) => hint.cardId != null && c.id === hint.cardId) ||
          srcZone.find((c) => c.name === hint.name) ||
          srcZone[index];
      } else {
        card = srcZone[index];
      }

      if (!card) {
        return { error: 'card_not_found' };
      }

      // Check if this move is an attachment to an existing Pokemon
      const isTargetInPlay = ['active', 'bench'].includes(dZoneId);
      const destZone = player.zones?.[dZoneId] || [];
      const hasTargetIndex = targetIndex != null && targetIndex !== false;
      const targetCard = hasTargetIndex ? destZone[targetIndex] : null;

      if (
        isTargetInPlay &&
        targetCard &&
        (isEnergy(card) || actionType === 'attach')
      ) {
        return {
          command: {
            type: 'attachCard',
            payload: {
              instanceId: card.instanceId,
              targetInstanceId: targetCard.instanceId,
            },
            playerId,
          },
        };
      }

      // General moveCard
      const parsedTargetIndex =
        hasTargetIndex && Number.isInteger(Number(targetIndex))
          ? Number(targetIndex)
          : undefined;

      return {
        command: {
          type: 'moveCard',
          payload: {
            instanceId: card.instanceId,
            from: oZoneId,
            to: dZoneId,
            ...(parsedTargetIndex != null
              ? { targetIndex: parsedTargetIndex }
              : {}),
          },
          playerId,
        },
      };
    }

    case 'addDamageCounter':
    case 'updateDamageCounter':
    case 'removeDamageCounter': {
      // parameters: [user, zoneId, index, damage]
      const [, zoneId, index, damage] = parameters;
      const zone = player.zones?.[zoneId] || [];
      const card = zone[index];
      if (!card) return { error: 'card_not_found' };

      return {
        command: {
          type: action,
          payload: {
            instanceId: card.instanceId,
            amount: typeof damage === 'number' ? damage : 10,
          },
          playerId,
        },
      };
    }

    case 'addSpecialCondition':
    case 'updateSpecialCondition': {
      // parameters: [user, zoneId, index, condition]
      const [, zoneId, index, condition] = parameters;
      const zone = player.zones?.[zoneId] || [];
      const card = zone[index];
      if (!card) return { error: 'card_not_found' };

      return {
        command: {
          type: action,
          payload: {
            instanceId: card.instanceId,
            condition: condition || 'Poisoned',
          },
          playerId,
        },
      };
    }

    case 'removeSpecialCondition': {
      // parameters: [user, zoneId, index]
      const [, zoneId, index] = parameters;
      const zone = player.zones?.[zoneId] || [];
      const card = zone[index];
      if (!card) return { error: 'card_not_found' };

      return {
        command: {
          type: 'removeSpecialCondition',
          payload: { instanceId: card.instanceId },
          playerId,
        },
      };
    }

    case 'removeAbilityCounter': {
      // parameters: [user, zoneId, index]
      const [, zoneId, index] = parameters;
      const zone = player.zones?.[zoneId] || [];
      const card = zone[index];
      if (!card) return { error: 'card_not_found' };

      return {
        command: {
          type: 'removeAbilityCounter',
          payload: { instanceId: card.instanceId },
          playerId,
        },
      };
    }

    case 'changeType': {
      // parameters: [user, zoneId, index, type]
      const [, zoneId, index, type] = parameters;
      const zone = player.zones?.[zoneId] || [];
      const card = zone[index];
      if (!card) return { error: 'card_not_found' };

      return {
        command: {
          type: 'changeType',
          payload: { instanceId: card.instanceId, type: type || 'Colorless' },
          playerId,
        },
      };
    }

    case 'rotateCard': {
      // parameters: [user, zoneId, index, rotation]
      const [, zoneId, index, rotation] = parameters;
      const zone = player.zones?.[zoneId] || [];
      const card = zone[index];
      if (!card) return { error: 'card_not_found' };

      return {
        command: {
          type: 'rotateCard',
          payload: { instanceId: card.instanceId, rotation: rotation ?? 90 },
          playerId,
        },
      };
    }

    default:
      // Other legacy actions (e.g. chat announcements, visual shortcuts) carry no state change
      return { handled: true, skipped: true };
  }
}

/**
 * Manages shadow mode authority for one room.
 */
export class ShadowSession {
  /**
   * @param {object} options
   * @param {string} options.roomId
   * @param {string|number} [options.seed=0]
   * @param {string} [options.logFilePath]
   */
  constructor({ roomId, seed = 0, logFilePath = null }) {
    this.roomId = roomId;
    this.seed = seed;
    this.rng = createRelayedRng(this.seed);

    // Shadow simulation runs with rulesEnabled: false so that free moves in legacy simulation
    // are not blocked by turn phase or legality restrictions, while preserving full reference validation.
    this.gameRoom = new GameRoom({
      roomId,
      rulesEnabled: false,
      seed: this.seed,
      rng: this.rng,
    });

    this.lastActionByPlayer = new Map(); // playerId -> { action, parameters, counter, timestamp }
    this.stats = {
      totalChecks: 0,
      matches: 0,
      mismatches: 0,
      mismatchesByAction: new Map(),
      mismatchesLog: [],
    };

    this.logFilePath =
      logFilePath || path.join(__dirname, '../shadow-mismatches.log');
  }

  /**
   * Registers a player socket with playerId.
   *
   * @param {string} socketId
   * @param {string} playerId
   * @param {string} [username]
   * @param {object[]} [deckList]
   */
  addPlayer(socketId, playerId, username, deckList) {
    return this.gameRoom.addPlayer(socketId, playerId, username, deckList);
  }

  /**
   * Returns playerId matching username from internal GameRoom.
   *
   * @param {string} username
   * @returns {string|null}
   */
  getPlayerIdByUsername(username) {
    return this.gameRoom.getPlayerIdByUsername(username);
  }

  /**
   * Returns next available playerId from internal GameRoom, or null if full.
   *
   * @returns {'p1'|'p2'|null}
   */
  getNextAvailablePlayerId() {
    return this.gameRoom.getNextAvailablePlayerId();
  }

  /**
   * Cleans up socket mappings on disconnect.
   *
   * @param {string} socketId
   */
  removeSocket(socketId) {
    this.gameRoom.removeSocket(socketId);
  }

  /**
   * Ingests a legacy pushAction relay message.
   *
   * @param {string} socketId
   * @param {object} data { action, parameters, counter, roomId }
   * @returns {{ success: boolean, action: string, error?: string }}
   */
  ingestAction(socketId, data = {}) {
    const playerId = this.gameRoom.socketToPlayer.get(socketId);
    if (!playerId) {
      return { success: false, action: data.action, error: 'unknown_socket' };
    }

    this.lastActionByPlayer.set(playerId, {
      action: data.action,
      parameters: data.parameters,
      counter: data.counter,
      timestamp: Date.now(),
    });

    const translation = translateLegacyAction(
      data.action,
      data.parameters,
      playerId,
      this.gameRoom.state,
      this.rng
    );

    if (translation.error) {
      return { success: false, action: data.action, error: translation.error };
    }

    if (translation.command) {
      const result = this.gameRoom.handleCommand(socketId, translation.command);
      return {
        success: result.success,
        action: data.action,
        error: result.error,
        details: result.reason,
      };
    }

    return { success: true, action: data.action };
  }

  /**
   * Compares the client's boardHash from syncCheck against the shadow server state.
   *
   * @param {string} socketId
   * @param {object} syncData { roomId, counter, boardHash }
   * @returns {{
   *   match: boolean,
   *   clientHash: string,
   *   serverHash: string,
   *   precedingAction?: string,
   *   error?: string
   * }}
   */
  checkSync(socketId, syncData = {}) {
    const playerId = this.gameRoom.socketToPlayer.get(socketId);
    if (!playerId) {
      return {
        match: false,
        clientHash: syncData.boardHash,
        serverHash: '',
        error: 'unknown_socket',
      };
    }

    const serverHash = hashState(this.gameRoom.state, playerId);
    const isMatch = Boolean(
      syncData.boardHash && syncData.boardHash === serverHash
    );

    this.stats.totalChecks++;
    if (isMatch) {
      this.stats.matches++;
      return { match: true, clientHash: syncData.boardHash, serverHash };
    }

    // Mismatch detected
    this.stats.mismatches++;
    const lastActionRecord = this.lastActionByPlayer.get(playerId);
    const precedingAction = lastActionRecord?.action || 'unknown';

    const currentCount =
      this.stats.mismatchesByAction.get(precedingAction) || 0;
    this.stats.mismatchesByAction.set(precedingAction, currentCount + 1);

    const logEntry = {
      timestamp: new Date().toISOString(),
      roomId: this.roomId,
      playerId,
      counter: syncData.counter,
      precedingAction,
      clientHash: syncData.boardHash,
      serverHash,
    };

    this.stats.mismatchesLog.push(logEntry);

    // Append to mismatch log file under server/
    try {
      const logLine =
        `[${logEntry.timestamp}] MISMATCH room=${this.roomId} player=${playerId} counter=${syncData.counter} action=${precedingAction}\n` +
        `  clientHash: ${syncData.boardHash}\n` +
        `  serverHash: ${serverHash}\n`;
      fs.appendFileSync(this.logFilePath, logLine, 'utf8');
    } catch {
      // Non-fatal if filesystem logging is restricted
    }

    return {
      match: false,
      clientHash: syncData.boardHash,
      serverHash,
      precedingAction,
    };
  }

  /**
   * Produces a structured telemetry report of shadow mode validation.
   *
   * @returns {object}
   */
  getReport() {
    return {
      roomId: this.roomId,
      totalChecks: this.stats.totalChecks,
      matches: this.stats.matches,
      mismatches: this.stats.mismatches,
      mismatchRate:
        this.stats.totalChecks > 0
          ? this.stats.mismatches / this.stats.totalChecks
          : 0,
      mismatchesByAction: Object.fromEntries(this.stats.mismatchesByAction),
      recentMismatches: this.stats.mismatchesLog.slice(-10),
    };
  }
}
