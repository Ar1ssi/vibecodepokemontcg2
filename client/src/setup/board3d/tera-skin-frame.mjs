// The star glints of the Tera crystal coat (design 037, mat-fx/tera-skin.js) evaluated at a time,
// for the three.js board. Pure. Times are ms; the coat's own timing is tera-coat.mjs.
import { easeInOut } from './status-loop-frame.mjs';

export const TERA_SKIN_TIMING = Object.freeze({ fadeMs: 450, glintMs: 3300 });

const cycle = (elapsed, duration) => (((elapsed % duration) + duration) % duration) / duration;

/** Values at keyframes `[[p, ...values]]`, eased in-out per segment. */
function keyframesAt(keys, p) {
  for (let i = 1; i < keys.length; i++) {
    const [p1, ...v1] = keys[i];
    const [p0, ...v0] = keys[i - 1];
    if (p > p1) continue;
    const k = p1 > p0 ? easeInOut((p - p0) / (p1 - p0)) : 1;
    return v0.map((v, j) => v + (v1[j] - v) * k);
  }
  return keys.at(-1).slice(1);
}

/** The glints fade in over 0.45 s, ease-out, once the coat has formed (`elapsedMs` since then). */
export const teraSkinFade = (elapsedMs) => {
  // `ease-out` = cubic-bezier(0, 0, 0.58, 1), solved for x by bisection.
  const x = elapsedMs / TERA_SKIN_TIMING.fadeMs;
  if (!(x > 0)) return 0;
  if (x >= 1) return 1;
  const bezier = (t, p1, p2) => 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (bezier(mid, 0, 0.58) < x) lo = mid;
    else hi = mid;
  }
  return bezier((lo + hi) / 2, 0, 1);
};

/**
 * One glint's 3.3 s cycle, after its `delay` in s: hidden until 62 %, flares to full size turned
 * 25° at 72 %, shrinks to a quarter at 84 %, gone again by 100 %. Before its delay it is hidden.
 *
 * @returns {{ scale: number, rotateDeg: number, opacity: number }}
 */
export function teraGlintFrame(elapsedMs, delaySec = 0) {
  const t = elapsedMs - delaySec * 1000;
  if (!(t >= 0)) return { scale: 0, rotateDeg: 0, opacity: 0 };
  const [scale, rotateDeg, opacity] = keyframesAt(
    [
      [0, 0, 0, 0],
      [0.62, 0, 0, 0],
      [0.72, 1, 25, 1],
      [0.84, 0.25, 45, 0.6],
      [1, 0, 0, 0],
    ],
    cycle(t, TERA_SKIN_TIMING.glintMs)
  );
  return { scale, rotateDeg, opacity };
}
