// The persistent Tera crystal skin (design 037, mat-fx/tera-skin.js) evaluated at a time, for the
// three.js board, which animates planes instead of CSS layers (design 074 §D6 "In-card-DOM
// effects"). Pure: reproduces css/mat-ambient.css's `fx-tera-skin-in` fade, `fx-tera-sheen` sweep,
// `fx-tera-rim` breathing and `fx-tera-glint` twinkle. Times are ms since the skin went on.
import { easeInOut } from './status-loop-frame.mjs';

export const TERA_SKIN_TIMING = Object.freeze({ fadeMs: 450, sheenMs: 6000, rimMs: 3200, glintMs: 3300 });

/** mat-ambient.css: the tint layer's opacity, the facets', and the sheen strip's width (of the card). */
export const TERA_SKIN_LOOK = Object.freeze({ tintAlpha: 0.55, facetAlpha: 0.85, sheenSpan: 2.5 });

/** `ease-out` = cubic-bezier(0, 0, 0.58, 1), solved for x by bisection. */
function easeOut(x) {
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
}

const cycle = (elapsed, duration) => (((elapsed % duration) + duration) % duration) / duration;

/** Values at keyframes `[[p, ...values]]`, eased in-out per segment (CSS's per-keyframe timing). */
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

/** `fx-tera-skin-in`: every layer fades in over 0.45 s, ease-out. */
export const teraSkinFade = (elapsedMs) => easeOut(elapsedMs / TERA_SKIN_TIMING.fadeMs);

/**
 * `fx-tera-sheen` (6 s, after the 0.45 s fade-in): the strip's `background-position` goes 160 % →
 * −60 % over the first 55 % and rests there. Returned as the strip's left edge in card widths
 * (CSS: `(1 - span) × position`): −2.4 puts its bright band left of the card, 0.9 right of it.
 */
export function teraSheenLeft(elapsedMs) {
  const span = TERA_SKIN_LOOK.sheenSpan;
  const at = (position) => (1 - span) * position;
  const t = elapsedMs - TERA_SKIN_TIMING.fadeMs;
  if (!(t > 0)) return at(1.6);
  const [position] = keyframesAt(
    [
      [0, 1.6],
      [0.55, -0.6],
      [1, -0.6],
    ],
    cycle(t, TERA_SKIN_TIMING.sheenMs)
  );
  return at(position);
}

/** `fx-tera-rim`: the rim glow breathes 0.75 → 1 → 0.75 over 3.2 s. */
export function teraRimOpacity(elapsedMs) {
  const [opacity] = keyframesAt(
    [
      [0, 0.75],
      [0.5, 1],
      [1, 0.75],
    ],
    cycle(Math.max(0, elapsedMs), TERA_SKIN_TIMING.rimMs)
  );
  return opacity;
}

/**
 * `fx-tera-glint` (3.3 s, after its `delay` in s): hidden until 62 %, flares to full size turned
 * 25° at 72 %, shrinks to a quarter at 84 %, gone again by 100 %. Before its delay a glint shows
 * its base style (scale 0, opacity 0).
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
