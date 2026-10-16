/**
 * @file The legacy `pushAction` packets the server interprets per seat — deck loads
 * (`exchangeData` / `loadDeckData`), Set Up (`readyUp`) and the Reset request — plus the
 * per-seat payloads (`instanceMap`, `dealOrder`) sent back. Design 074 D7: a solo room's one
 * socket names the seat it acts for in `data.seat`; a normal room uses the socket's own seat.
 */

import { extractDeckData, extractDeckFormat } from './deck-packet.mjs';

const DECK_LOAD_ACTIONS = new Set(['exchangeData', 'loadDeckData']);

/** @param {object} data a pushAction packet */
export function isDeckLoadAction(data) {
  return DECK_LOAD_ACTIONS.has(data?.action);
}

/**
 * A player's Reset button (legacy 'reset' pushAction with clean === false) ends the game
 * for both seats. Deck-load resets send clean === true and are not this.
 *
 * @param {object} data a pushAction packet
 */
export function isPlayerRequestedReset(data) {
  return (
    data?.action === 'reset' &&
    Array.isArray(data.parameters) &&
    data.parameters[0] === false
  );
}

/** True for the packets whose effect belongs to one seat. */
export function isSeatSetupAction(data) {
  return isDeckLoadAction(data) || data?.action === 'readyUp' || isPlayerRequestedReset(data);
}

/**
 * The seat a per-seat packet acts for. A solo room's own socket without a valid `seat` is
 * refused (`bad_seat`); any other unseated socket gets `seat: null` and is ignored, as before.
 *
 * @param {object|null} gameRoom the authoritative room, or null without authority
 * @param {string} socketId
 * @param {object} data a pushAction packet
 * @returns {{ seat: string|null, refused: 'bad_seat'|null }}
 */
export function setupActionSeat(gameRoom, socketId, data) {
  if (!gameRoom) return { seat: null, refused: null };
  const seat = gameRoom.seatFor(socketId, data);
  if (seat) return { seat, refused: null };
  const refused = gameRoom.solo && gameRoom.socketToPlayer.has(socketId) ? 'bad_seat' : null;
  return { seat: null, refused };
}

/**
 * The setupActionCache key for a deck packet: the sender socket, except in a solo room, which
 * keeps one entry per seat so a rejoin (new socket) replaces rather than adds to them.
 *
 * @param {object|null} gameRoom
 * @param {string} socketId
 * @param {string|null} seat
 * @returns {string}
 */
export function setupActionCacheKey(gameRoom, socketId, seat) {
  return gameRoom?.solo && seat ? `solo:${seat}` : socketId;
}

/**
 * Remembers the latest deck packet of each kind under `key`.
 *
 * @param {Map<string, object>|undefined} cache roomInfo's setupActionCache
 * @param {string} key from setupActionCacheKey
 * @param {object} data a deck-load pushAction packet
 */
export function cacheSetupAction(cache, key, data) {
  if (!cache || !isDeckLoadAction(data)) return;
  const existing = cache.get(key) || {};
  existing[data.action] = data;
  cache.set(key, existing);
}

/**
 * Applies a per-seat packet to the room for `seat`: a deck load runs the `loadDeck` command
 * (so it lands in commandLog for undo replay), `readyUp` marks the seat ready. The Reset
 * request is reported back; the caller resets, since that is room-wide and emits.
 *
 * @param {object} gameRoom
 * @param {string} socketId
 * @param {string} seat from setupActionSeat
 * @param {object} data a pushAction packet
 * @returns {{ readied: boolean, deckLoaded: boolean, resetRequested: boolean }}
 */
export function applySetupAction(gameRoom, socketId, seat, data) {
  const outcome = { readied: false, deckLoaded: false, resetRequested: false };
  if (!gameRoom || !seat) return outcome;
  if (data?.action === 'readyUp') {
    gameRoom.markReady(seat);
    outcome.readied = gameRoom.readyPlayerIds.has(seat);
  }
  if (isPlayerRequestedReset(data)) outcome.resetRequested = true;
  if (isDeckLoadAction(data)) {
    const deckData = extractDeckData(data.action, data.parameters);
    if (Array.isArray(deckData)) {
      const format = extractDeckFormat(data.action, data.parameters);
      const result = gameRoom.handleCommand(
        socketId,
        { type: 'loadDeck', payload: { deckData, format } },
        seat
      );
      outcome.deckLoaded = Boolean(result.success);
    }
  }
  return outcome;
}

/**
 * A seat's syncInstance -> instanceId lookup, named by `seat` so a solo socket, which gets
 * both seats' copies, can tell them apart.
 *
 * @param {object} gameRoom
 * @param {string} roomId
 * @param {string} seat
 * @returns {{ roomId: string, seat: string, map: Record<number, number> }}
 */
export function instanceMapPayload(gameRoom, roomId, seat) {
  return { roomId, seat, map: gameRoom.getInstanceMap(seat) };
}

/**
 * A seat's deal order — [prizes, hand, rest of deck] by syncInstance — and who starts,
 * relative to that seat ('self'|'opp'|null).
 *
 * @param {object} gameRoom
 * @param {string} roomId
 * @param {string} seat
 * @returns {{ roomId: string, seat: string, order: number[], starter: 'self'|'opp'|null }}
 */
export function dealOrderPayload(gameRoom, roomId, seat) {
  const zones = gameRoom.state.players[seat]?.zones;
  const order = zones
    ? [...zones.prizes, ...zones.hand, ...zones.deck].map((card) => card.syncInstance)
    : [];
  const starterId = gameRoom.state.turn?.player ?? null;
  const starter = starterId == null ? null : starterId === seat ? 'self' : 'opp';
  return { roomId, seat, order, starter };
}
