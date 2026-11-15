// What the signature entries throw: a crystal shard, a piece of shell. A thrown thing rises and
// falls under gravity, takes one low bounce and comes to rest; drag takes its speed along the
// cloth away. Closed forms of time, so a frozen frame stands still and the maths is testable.
// Heights and distances are card heights (h), times seconds.

export const TOSS_GRAVITY = 7;
const BOUNCE = 0.3;
const DRAG = 1.7;

/**
 * The height of a thing thrown from `z0` with upward speed `up`, `t` seconds on.
 * @returns {{ z: number, flight: number, hop: number, airborne: boolean }} `flight` s until it
 *   first lands, `hop` s of its one bounce; `airborne` until that bounce ends
 */
export function tossHeight(t, z0, up) {
  const flight = (up + Math.sqrt(up ** 2 + 2 * TOSS_GRAVITY * z0)) / TOSS_GRAVITY;
  const rebound = BOUNCE * (TOSS_GRAVITY * flight - up);
  const hop = (2 * rebound) / TOSS_GRAVITY;
  let z = 0;
  if (t < flight) z = z0 + up * t - 0.5 * TOSS_GRAVITY * t * t;
  else if (t < flight + hop) z = rebound * (t - flight) - 0.5 * TOSS_GRAVITY * (t - flight) ** 2;
  return { z: Math.max(0, z), flight, hop, airborne: t < flight + hop };
}

/** How far along the cloth it has gone after `t` seconds at launch speed `speed`: it stops once it rests at `until`. */
export const tossReach = (t, speed, until) => (speed / DRAG) * (1 - Math.exp(-DRAG * Math.min(Math.max(t, 0), until)));
