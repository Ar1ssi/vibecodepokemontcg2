/**
 * Design 074 D7: a solo room sets isTwoPlayer too, but its far seat is the solo "alt" deck
 * (the 1P opponent slots), not a room opponent. Every opponent-slot choice goes through here.
 * @param {{ isTwoPlayer?: boolean, solo?: boolean }} state systemState
 */
export function isRoomOpponent(state) {
  return Boolean(state?.isTwoPlayer) && !state?.solo;
}

/** @returns {'p2OppCardBackSrc'|'p1OppCardBackSrc'} the systemState key holding the opponent's card back */
export function opponentCardBackKey(state) {
  return isRoomOpponent(state) ? 'p2OppCardBackSrc' : 'p1OppCardBackSrc';
}

/**
 * The card back a side's deck cover and hidden cards show.
 * @param {object} state systemState
 * @param {'self'|'opp'} user
 */
export function cardBackSrcFor(state, user) {
  return user === 'self' ? state.cardBackSrc : state[opponentCardBackKey(state)];
}
