// Design 089 § D7: hit-stop. A heavy move's scene holds still on its contact frame for a few
// frames — the oldest trick for weight — and then runs on. Only the scene's own clock stops: the
// FX queue's hold ends at contact as before, so the hit's number and the impact land in the pause.
// Pure: the move player maps wall time to scene time with this.

/** How long the scene holds at contact, by the spec's tier (ms). Light moves do not stop. */
export const HIT_STOP_MS = Object.freeze({ 3: 70, S: 90 });

/**
 * The scene holds this long after contact: one frame into the contact beats, so the frame it
 * stands on shows the hit (a beat that starts at contact has drawn nothing at its very first instant).
 */
export const HIT_STOP_FRAME_MS = 24;

/** The hold of `spec`'s scene at contact, in ms (0 = none). */
export const hitStopFor = (spec) => (Object.hasOwn(HIT_STOP_MS, String(spec?.tier)) ? HIT_STOP_MS[spec.tier] : 0);

/**
 * The scene's own time at `elapsedMs` of wall time: it runs with the wall clock to the contact
 * frame (`contactMs` + HIT_STOP_FRAME_MS), stands there for `stopMs`, then runs on, `stopMs` behind.
 */
export function sceneTimeAt(elapsedMs, contactMs, stopMs) {
  const frame = contactMs + HIT_STOP_FRAME_MS;
  if (!(stopMs > 0) || !(elapsedMs > frame)) return elapsedMs;
  return elapsedMs <= frame + stopMs ? frame : elapsedMs - stopMs;
}
