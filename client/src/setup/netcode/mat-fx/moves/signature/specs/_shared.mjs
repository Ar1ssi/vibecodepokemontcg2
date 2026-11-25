// Design 065: the pieces the per-type signature spec files share: the five-spike star arms and
// the small mote burst on the defender.

/** Five spikes 72° apart: the entries' "starFlare arms 'ring'" inside the 30-tongue budget. */
export const RING5 = Object.freeze([-90, -18, 54, 126, 198].map((angle) => Object.freeze({ angle, reach: 0.85 })));

/** A small round-mote burst on the defender; `over` overrides any default. */
export const motes = (at, count, over = {}) =>
  Object.freeze({
    at,
    anchor: 'defender',
    count,
    distance: 1.1,
    direction: -90,
    spread: 360,
    size: [0.03, 0.07],
    aspect: 1,
    gravity: 0,
    maxDelay: 0.2,
    durationMs: 800,
    kind: 'mote',
    ...over,
  });
