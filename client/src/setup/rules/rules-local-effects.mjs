/**
 * Whether this client should auto-execute rules effects that emit moves
 * (trainer steps, ability auto-draw, start-of-turn draw, etc.).
 *
 * In online 2P, only the client that locally initiated the action (not a
 * socket mirror replay) and owns the affected zone (`owner === 'self'`) may run
 * these effects. The peer replays the emitted moveCardBundle/draw actions.
 */

export function shouldExecuteLocalRulesEffect({
  isTwoPlayer = false,
  localPlay = false,
  owner = 'self',
} = {}) {
  if (!localPlay) return false;
  if (!isTwoPlayer) return true;
  return owner === 'self';
}

/** Start-of-turn draw: only the turn owner's client emits in 2P. */
export function shouldEmitTurnStartDraw({ isTwoPlayer = false, turnPlayer = 'self' } = {}) {
  if (!isTwoPlayer) return true;
  return turnPlayer === 'self';
}
