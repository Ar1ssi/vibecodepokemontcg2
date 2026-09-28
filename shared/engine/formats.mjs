/**
 * @file Deck formats the engine deals for (design 051). Pure.
 * Standard: 60 cards, 6 Prizes. Build & Battle (Prerelease rules, pokemon.com):
 * a 40-card deck with four Prize cards set aside at the start of play.
 */

export const DECK_FORMAT_TCG = 'tcg';
export const DECK_FORMAT_BUILD_BATTLE = 'build-battle';
export const DECK_FORMAT_VALUES = Object.freeze([
  DECK_FORMAT_TCG,
  DECK_FORMAT_BUILD_BATTLE,
]);

export const PRIZE_COUNT_BY_FORMAT = Object.freeze({
  [DECK_FORMAT_TCG]: 6,
  [DECK_FORMAT_BUILD_BATTLE]: 4,
});

export const OPENING_HAND_SIZE = 7;

const FORMAT_LABELS = Object.freeze({
  [DECK_FORMAT_TCG]: 'Standard (60 cards, 6 Prizes)',
  [DECK_FORMAT_BUILD_BATTLE]: 'Build & Battle (40 cards, 4 Prizes)',
});

/** @returns {string} the label a chat line uses for a format; unknown reads as Standard. */
export function formatLabel(format) {
  return FORMAT_LABELS[format] || FORMAT_LABELS[DECK_FORMAT_TCG];
}

/** @returns {'tcg'|'build-battle'} a known format, or Standard for anything else. */
export function normalizeDeckFormat(format) {
  return isDeckFormat(format) ? format : DECK_FORMAT_TCG;
}

/** @returns {boolean} true when both decks deal under the same format (unknown reads as Standard). */
export function deckFormatsMatch(a, b) {
  return normalizeDeckFormat(a) === normalizeDeckFormat(b);
}

/**
 * The chat line when the opening deal is refused because the two decks' formats differ
 * (I202: checked at the deal, never at deck load, so a restored deck can still be replaced).
 * @param {{ username: string, format: string }[]} players
 */
export function formatMismatchMessage(players) {
  const decks = players.map(({ username, format }) => `${username}: ${formatLabel(format)}`);
  return `Deck formats differ (${decks.join('; ')}). Both players must use the same format — load a matching deck and press Set Up again.`;
}

/** @returns {boolean} true only for a format the engine knows. */
export function isDeckFormat(value) {
  return DECK_FORMAT_VALUES.includes(value);
}

/** @returns {6|4} Prize cards set aside at setup; an unknown format deals Standard's 6. */
export function prizeCountForFormat(format) {
  return isDeckFormat(format)
    ? PRIZE_COUNT_BY_FORMAT[format]
    : PRIZE_COUNT_BY_FORMAT[DECK_FORMAT_TCG];
}

/**
 * Prize cards a player has taken, from the ones left and their format's starting count.
 * Card text like "for each Prize card your opponent has taken" reads this (I203).
 * @param {number} remaining
 * @param {string} [format]
 */
export function prizesTakenFor(remaining, format) {
  return Math.max(0, prizeCountForFormat(format) - (Number(remaining) || 0));
}
