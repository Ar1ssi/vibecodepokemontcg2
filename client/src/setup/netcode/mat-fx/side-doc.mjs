// Design 024 (review fix): resolve a plan's side to its playmat iframe
// document — and, crucially, refuse to guess.
//
// `advisoryAnimationPlan` yields `user: null` whenever the event carries no
// playerId or `selfPlayerId` is not known yet. The zone lookups used to spell
// this `user === 'self' ? selfDoc : oppDoc`, which quietly resolved every one
// of those to the OPPONENT's mat — a discard puff or coin chip appearing on
// the wrong side of the board, silently and with no error. An unknown side
// draws nothing instead.
/**
 * @param {'self'|'opp'|null|undefined} user
 * @param {Document|null} selfDoc
 * @param {Document|null} oppDoc
 * @returns {Document|null} null when the side is unknown.
 */
export function docForSide(user, selfDoc, oppDoc) {
  if (user === 'self') return selfDoc ?? null;
  if (user === 'opp') return oppDoc ?? null;
  return null;
}
