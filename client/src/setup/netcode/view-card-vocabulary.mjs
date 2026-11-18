/**
 * @file The facts about a view that the renderer (apply-view.js), the sync check and the
 * manual board tools (manual-card-commands.mjs) must read the same way. DOM-free, so all load it.
 */

// Zones whose cards are in play: the Active Pokémon and the Bench.
export const PLAY_ZONES = ['active', 'bench'];

/**
 * A view card's damage in HP, 0 when it carries none.
 *
 * @param {{ damage?: number }} card
 * @returns {number}
 */
export function damageOf(card) {
  return typeof card?.damage === 'number' && card.damage > 0 ? card.damage : 0;
}

/**
 * The legacy `user` ('self' | 'opp') of a view side ('you' | 'them').
 *
 * @param {'you'|'them'} side
 * @returns {'self'|'opp'}
 */
export function userOfSide(side) {
  return side === 'you' ? 'self' : 'opp';
}

/**
 * The view side ('you' | 'them') of a legacy `user` ('self' | 'opp').
 *
 * @param {'self'|'opp'} user
 * @returns {'you'|'them'}
 */
export function sideOfUser(user) {
  return user === 'self' ? 'you' : 'them';
}
