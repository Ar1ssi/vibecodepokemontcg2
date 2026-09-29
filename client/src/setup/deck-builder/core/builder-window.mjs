/**
 * The deck builder runs in its own browser tab (design 050). That tab is the
 * editor; the game tab that opened it is the host and owns the board. The two
 * talk through `postMessage` with the messages defined here.
 *
 * Pure: role resolution plus building and validating messages. Every message
 * is validated on arrival — a same-origin page can post anything, and the
 * host must never load a malformed deck into a game.
 */

import { DECK_FORMAT_TCG, isDeckFormat } from '../../../../../shared/engine/formats.mjs';

export { DECK_FORMAT_VALUES } from '../../../../../shared/engine/formats.mjs';

export const BUILDER_WINDOW_NAME = 'ptcgDeckBuilder';
export const BUILDER_WINDOW_PATH = '/deck-builder';
// Build & Battle (design 051) is the same editor tab in another mode.
export const BUILD_BATTLE_WINDOW_NAME = 'ptcgBuildBattle';
export const BUILD_BATTLE_WINDOW_PATH = '/build-and-battle';
export const BUILDER_MESSAGE_SOURCE = 'ptcg-deck-builder';
const PROTOCOL_VERSION = 1;

const MAX_ID_LENGTH = 128;
const MAX_URL_LENGTH = 2048;
const MAX_DECK_ROWS = 500;
// A sim deck row: [qty, name, type, url, number?, set?, tcgId?].
const MIN_ROW_LENGTH = 4;
const MAX_ROW_LENGTH = 7;

const trimPath = (pathname) => String(pathname ?? '').replace(/\/+$/, '');

/** `'editor'` on either builder tab path, `'host'` everywhere else. */
export function resolveBuilderRole(pathname = '') {
  const path = trimPath(pathname);
  return path === BUILDER_WINDOW_PATH || path === BUILD_BATTLE_WINDOW_PATH ? 'editor' : 'host';
}

/** `'build-battle'` on the Build & Battle path, `'standard'` everywhere else. */
export function resolveBuilderMode(pathname = '') {
  return trimPath(pathname) === BUILD_BATTLE_WINDOW_PATH ? 'build-battle' : 'standard';
}

export function buildBuilderMessage(type, payload = {}) {
  return { source: BUILDER_MESSAGE_SOURCE, version: PROTOCOL_VERSION, type, payload };
}

const isTarget = (value) => value === 'self' || value === 'opp';

const isId = (value) => typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;

const isNullableId = (value) => value === null || isId(value);

// Card backs and sleeve art are either absolute web URLs or site-rooted
// asset paths; anything else (javascript:, data:, protocol-relative) is refused.
const isImageUrl = (value) =>
  typeof value === 'string' &&
  value.length <= MAX_URL_LENGTH &&
  (/^https?:\/\//i.test(value) || /^\/(?!\/)/.test(value));

const isRowCell = (cell) =>
  cell === null ||
  (typeof cell === 'number' && Number.isFinite(cell)) ||
  (typeof cell === 'string' && cell.length <= MAX_URL_LENGTH);

const isDeckRows = (rows) =>
  Array.isArray(rows) &&
  rows.length <= MAX_DECK_ROWS &&
  rows.every(
    (row) =>
      Array.isArray(row) &&
      row.length >= MIN_ROW_LENGTH &&
      row.length <= MAX_ROW_LENGTH &&
      row.every(isRowCell)
  );

const PAYLOAD_VALIDATORS = {
  ready: () => true,
  'host-state': (payload) =>
    typeof payload.isTwoPlayer === 'boolean' &&
    (payload.roomId === undefined || isNullableId(payload.roomId)),
  'load-deck': (payload) =>
    isTarget(payload.target) &&
    isNullableId(payload.deckId) &&
    isDeckRows(payload.rows) &&
    (payload.format === undefined || isDeckFormat(payload.format)),
  'card-back': (payload) =>
    isTarget(payload.target) && isImageUrl(payload.image) && typeof payload.emit === 'boolean',
  sleeve: (payload) =>
    isTarget(payload.target) && (payload.image === null || isImageUrl(payload.image)),
  mat: (payload) =>
    isTarget(payload.target) && isNullableId(payload.matId) && typeof payload.emit === 'boolean',
  coin: (payload) => isTarget(payload.target) && isNullableId(payload.coinId),
  play: (payload) => isTarget(payload.target),
};

/**
 * @returns {{type: string, payload: object} | null} the message, or null when
 *   it is not a well-formed deck builder message.
 */
export function parseBuilderMessage(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.source !== BUILDER_MESSAGE_SOURCE || data.version !== PROTOCOL_VERSION) return null;
  const validate = PAYLOAD_VALIDATORS[data.type];
  if (!validate) return null;
  const payload = data.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (!validate(payload)) return null;
  // A builder without formats sends no `format`: that deck is Standard.
  if (data.type === 'load-deck') {
    return { type: data.type, payload: { ...payload, format: payload.format ?? DECK_FORMAT_TCG } };
  }
  return { type: data.type, payload };
}
