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

/** @returns {string} the chat line when a deck's format differs from the opponent's. */
export function formatMismatchMessage(username, format) {
  const label = FORMAT_LABELS[format] || FORMAT_LABELS[DECK_FORMAT_TCG];
  return `${username}'s deck is ${label}; both players must use the same format`;
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
