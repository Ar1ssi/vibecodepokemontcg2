/**
 * @file Reads the deck list and deck format out of a legacy deck-load packet (`exchangeData` /
 * `loadDeckData` pushAction); server.js turns the result into a `loadDeck` command.
 */

import { DECK_FORMAT_TCG, isDeckFormat } from '../../shared/engine/formats.mjs';

/**
 * Extracts deckData array from legacy action parameters.
 * - exchangeData: parameters are [username, deckData, cardBack, coachingMode, callback, matId, format]
 * - loadDeckData: parameters are [deckData, format] (or legacy [user, deckData])
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
 * Design 051: the deck format a legacy deck-load packet names.
 * - exchangeData: parameters[6], after matId
 * - loadDeckData: parameters[1] (parameters are [deckData, format])
 * Anything that is not a known format reads as Standard.
 * @param {string} action
 * @param {any[]} parameters
 * @returns {'tcg'|'build-battle'}
 */
export function extractDeckFormat(action, parameters) {
  if (!Array.isArray(parameters)) return DECK_FORMAT_TCG;
  const index = { exchangeData: 6, loadDeckData: 1 }[action];
  const format = index == null ? null : parameters[index];
  return isDeckFormat(format) ? format : DECK_FORMAT_TCG;
}
