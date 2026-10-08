// Design 063: the ghost material (recipe in the design's § Materials). Ghost is a shadow lit
// from inside: the violet light glows on the caller's additive pass, and every dark part
// (the wisp's core line, the shadow ball, the puffs `cloud` and `glow` lay down, the pupils)
// draws with `source-over` inside its own save/restore so it covers what is under it, as dark
// does. The elongated unit is a *wisp*: a blurred violet tongue with a paler inner pass and a
// dark core line down its middle, the one material whose inner pass is darker than its outer;
// `jag` makes it a violet splinter. The round unit is a *shadow ball*: a black-to-deep sphere
// inside a violet rim glow with a ragged violet edge. `glow` is a shadow puff with a violet
// fringe (the recipe's "cloud in deep for shadows"). A projectile is the shadow ball in a
// violet haze trailing wisps. `sigil` (the `glyph` drawer) is two slit eyes that open in a
// shadow and close again. Palette #6B4FA8 #9D7CF2 #D9CCFF, deep #1E1238; grain 0.2. Every
// call draws on the context it is handed and is otherwise pure.
import { rgbCss } from '../../fx-colors.mjs';
import { grainPass, inShadow, shardOutline, sphere, tongueOutline, traceOutline } from './_shared.js';
import { wavyRing } from './psychic.js';

const TAU = Math.PI * 2;
const rad = (deg) => (deg * Math.PI) / 180;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;

const WISP_AMP = 1.2;
// The recipe asks alpha 0.5 and blur 0.14 w; on the board 0.5 let the dark core line outweigh
// the light (wisps read as dark scribbles), and the shared material test caps blur at 0.12 w.
const WISP_ALPHA = 0.65;
const WISP_BLUR = 0.12;
const WISP_INNER = 0.55;
const WISP_INNER_ALPHA = 0.6;
const CORE_LINE = 0.12;
const CORE_ALPHA = 0.55;
const SHADOW_ALPHA = 0.6;
const RIM_REACH = 1.35;
const RIM_LOBES = 7;
const RIM_AMP = 0.04;
const RIM_HZ = 0.35;
const TAIL_SPREAD = 26;
const EYE_OPEN = 0.25;
const EYE_CLOSE = 0.8;

const palette = Object.freeze({
  deep: Object.freeze([30, 18, 56]),
  body: Object.freeze([107, 79, 168]),
  hot: Object.freeze([157, 124, 242]),
  core: Object.freeze([217, 204, 255]),
  white: Object.freeze([255, 255, 255]),
  black: Object.freeze([8, 4, 16]),
});

/**
 * How open the slit eyes are at glyph progress `s`: they open over the first quarter, stay
 * open, and close over the last fifth (0 = shut, 1 = wide).
 */
export function eyeOpenness(s) {
  const c = clamp01(s);
  if (c < EYE_OPEN) return easeOutCubic(c / EYE_OPEN);
  if (c <= EYE_CLOSE) return 1;
  return Math.max(0, 1 - easeOutCubic((c - EYE_CLOSE) / (1 - EYE_CLOSE)));
}

/**
 * Two slit eyes about (x, y), upright on screen and mirrored left/right, slanted so their
 * inner corners sit lower (a glare). Each eye is an almond from its inner to its outer corner
 * through two quadratic controls, with a vertical slit pupil; `open` scales the heights.
 * @returns {{inner: number[], outer: number[], top: number[], bottom: number[],
 *   pupil: {x: number, y: number, rx: number, ry: number, rotation: number}}[]}
 */
export function slitEyes(x, y, r, open) {
  const o = clamp01(open);
  const halfW = 0.24 * r;
  const halfH = 0.11 * r * o;
  return [-1, 1].map((side) => {
    const cx = x + side * 0.34 * r;
    const cy = y - 0.05 * r;
    // The inner corner faces the middle (x); rotating by `tilt` drops it.
    const tilt = -side * 0.22;
    const at = (lx, ly) => [cx + lx * Math.cos(tilt) - ly * Math.sin(tilt), cy + lx * Math.sin(tilt) + ly * Math.cos(tilt)];
    return {
      inner: at(-side * halfW, 0),
      outer: at(side * halfW, 0),
      top: at(0, -2 * halfH),
      bottom: at(0, 2 * halfH),
      pupil: { x: cx, y: cy, rx: 0.035 * r, ry: 0.095 * r * o, rotation: tilt },
    };
  });
}

/** A shadow puff: deep shadow covering what is under it, ringed by a faint violet fringe. */
function glow(ctx, x, y, r, alpha) {
  if (!(r > 0) || !(alpha > 0)) return;
  inShadow(ctx, () => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgbCss(palette.deep, alpha * SHADOW_ALPHA));
    g.addColorStop(0.6, rgbCss(palette.deep, alpha * SHADOW_ALPHA * 0.5));
    g.addColorStop(1, rgbCss(palette.deep, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  });
  const f = ctx.createRadialGradient(x, y, r * 0.45, x, y, r);
  f.addColorStop(0, rgbCss(palette.body, 0));
  f.addColorStop(0.65, rgbCss(palette.body, alpha * 0.22));
  f.addColorStop(1, rgbCss(palette.body, 0));
  ctx.fillStyle = f;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** Violet light, additive: the haze a shadow ball flies in. */
function haze(ctx, x, y, r, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgbCss(palette.hot, alpha * 0.5));
  g.addColorStop(0.5, rgbCss(palette.body, alpha * 0.25));
  g.addColorStop(1, rgbCss(palette.body, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** The shadow ball turned to `phase`: rim glow, dark sphere, ragged violet edge, a glint when hot. */
function shadowBall(ctx, x, y, r, alpha, hot, phase) {
  const rim = ctx.createRadialGradient(x, y, r * 0.7, x, y, r * RIM_REACH);
  rim.addColorStop(0, rgbCss(palette.hot, 0.55 * alpha));
  rim.addColorStop(0.4, rgbCss(palette.body, 0.3 * alpha));
  rim.addColorStop(1, rgbCss(palette.body, 0));
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(x, y, r * RIM_REACH, 0, TAU);
  ctx.fill();
  inShadow(ctx, () => {
    sphere(
      ctx,
      x,
      y,
      r,
      [
        [0, palette.black, 0.95 * alpha],
        [0.65, palette.deep, 0.92 * alpha],
        [1, palette.deep, 0.75 * alpha],
      ],
      0
    );
  });
  ctx.strokeStyle = rgbCss(palette.hot, 0.8 * alpha);
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  wavyRing(x, y, r * 0.98, phase * TAU, RIM_LOBES, RIM_AMP).forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.stroke();
  const glint = alpha * clamp01(hot);
  if (!(glint > 0)) return;
  sphere(
    ctx,
    x - r * 0.25,
    y - r * 0.25,
    r * 0.3,
    [
      [0, palette.core, 0.45 * glint],
      [1, palette.hot, 0],
    ],
    0
  );
}

// The interface's `body` carries no clock, so the ragged edge turns with where the ball is
// and how big it has grown (it churns as it swells or travels), as dark's pulse does.
/** A shadow ball of radius `r`; `hot` lights a violet glint in it. */
function body(ctx, x, y, r, alpha, hot = 1) {
  if (!(r > 0) || !(alpha > 0)) return;
  shadowBall(ctx, x, y, r, alpha, hot, (x * 0.02 + y * 0.03 + r * 0.15) / TAU);
}

/**
 * A wisp: a blurred violet tongue, a paler inner pass (dropped at `hot` 0), and a dark core
 * line down its middle that covers what is under it. `jag` makes it a violet splinter.
 */
function tongue(ctx, spec, { alpha = 1, hot = 1, jag = 0 } = {}) {
  if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
  const outline = (scale) =>
    jag ? shardOutline({ ...spec, width: spec.width * scale }) : tongueOutline({ ...spec, amp: WISP_AMP }, scale);
  const outer = outline(1);
  ctx.filter = `blur(${Math.max(1, spec.width * WISP_BLUR).toFixed(2)}px)`;
  ctx.fillStyle = rgbCss(palette.body, WISP_ALPHA * alpha);
  traceOutline(ctx, outer);
  ctx.fill();
  ctx.filter = 'none';
  const lit = alpha * clamp01(hot);
  if (lit > 0) {
    ctx.fillStyle = rgbCss(palette.hot, WISP_INNER_ALPHA * lit);
    traceOutline(ctx, outline(WISP_INNER));
    ctx.fill();
  }
  inShadow(ctx, () => {
    ctx.strokeStyle = rgbCss(palette.deep, CORE_ALPHA * alpha);
    ctx.lineWidth = Math.max(1, spec.width * CORE_LINE);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    outer.left.forEach(([lx, ly], i) => {
      const [rx, ry] = outer.right[i];
      const mx = (lx + rx) / 2;
      const my = (ly + ry) / 2;
      if (i === 0) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    });
    ctx.stroke();
  });
}

/**
 * A shadow ball in flight along `headingDeg`: a violet haze, `tongues` wisps streaming behind
 * it and swaying out of step, and the ball, its edge churning on the scene clock. 0 tongues =
 * a bare ball.
 */
function projectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 3, hot = 1 }) {
  if (!(r > 0) || !(alpha > 0)) return;
  haze(ctx, x, y, r * 2.1, 0.7 * alpha);
  const back = headingDeg + 180;
  for (let k = 0; k < tongues; k += 1) {
    const spread = tongues > 1 ? -TAIL_SPREAD + (2 * TAIL_SPREAD * k) / (tongues - 1) : 0;
    const angleDeg = back + spread + 10 * Math.sin(time * 3.5 + k * 1.9 + seed);
    const a = rad(angleDeg);
    tongue(
      ctx,
      {
        x: x + Math.cos(a) * r * 0.5,
        y: y + Math.sin(a) * r * 0.5,
        angleDeg,
        length: r * (1.6 + 0.7 * Math.abs(Math.sin(seed * 1.3 + k * 2.1))),
        width: r * 0.6,
        time,
        seed: seed + k * 1.9,
      },
      { alpha: alpha * 0.8, hot: hot * 0.8 }
    );
  }
  shadowBall(ctx, x, y, r, alpha, hot, time * RIM_HZ + seed * 0.1);
}

/** Two slit eyes opening over (x, y) as the glyph beat runs, in a shadow of their own. */
function sigil(ctx, x, y, r, s) {
  const open = eyeOpenness(s);
  if (!(r > 0) || !(open > 0)) return;
  glow(ctx, x, y - r * 0.05, r * 0.95, 0.8 * Math.min(1, open * 2));
  const eyes = slitEyes(x, y, r, open);
  ctx.beginPath();
  for (const eye of eyes) {
    ctx.moveTo(eye.inner[0], eye.inner[1]);
    ctx.quadraticCurveTo(eye.top[0], eye.top[1], eye.outer[0], eye.outer[1]);
    ctx.quadraticCurveTo(eye.bottom[0], eye.bottom[1], eye.inner[0], eye.inner[1]);
    ctx.closePath();
  }
  ctx.fillStyle = rgbCss(palette.core, 0.9);
  ctx.fill();
  ctx.strokeStyle = rgbCss(palette.hot, 0.9);
  ctx.lineWidth = Math.max(1, r * 0.035);
  ctx.lineJoin = 'round';
  ctx.stroke();
  inShadow(ctx, () => {
    ctx.fillStyle = rgbCss(palette.deep, 0.95);
    ctx.beginPath();
    for (const { pupil } of eyes) {
      ctx.moveTo(pupil.x + pupil.rx * Math.cos(pupil.rotation), pupil.y + pupil.rx * Math.sin(pupil.rotation));
      ctx.ellipse(pupil.x, pupil.y, pupil.rx, pupil.ry, pupil.rotation, 0, TAU);
    }
    ctx.fill();
  });
}

export const ghost = Object.freeze({
  key: 'ghost',
  palette,
  // The sprite games' haunted dusk, a violet-black kept local to a card.
  shade: Object.freeze([12, 6, 24]),
  smoke: Object.freeze([60, 40, 90]),
  particle: Object.freeze({ className: 'fx-particle--mote', color: rgbCss(palette.hot), aspect: 1 }),
  glow,
  body,
  tongue,
  projectile,
  sigil,
  grain: grainPass,
});
