// Design 063: the dragon material (recipe in the design's § Materials). The elongated unit is
// fire's tongue in the dragon palette: a blurred violet body, a lilac mid, and an *ember* core
// (the recipe's orange `hot` override), composited additively so the core reads as a white-hot
// pink at the heart of a violet flame. `jag` makes it a dragon scale: an angular shard with
// the same three passes. The round unit is a dragon orb, a violet sphere with a two-strand
// helix churning inside it; a projectile is the orb trailing flame tongues (a meteor when it
// falls from the sky). Palette #5A47C9 #8F7CF5 #D2C8FF, deep #2A1F6B, accent #FF9B3D; grain
// 0.25. Every call draws on the context it is handed and is otherwise pure.
import { rgbCss } from '../../fx-colors.mjs';
import { grainPass, shardOutline, sphere, traceOutline, tongueOutline, wobble } from './_shared.js';

const TAU = Math.PI * 2;
const HELIX_SAMPLES = 10;
const HELIX_SPAN = 0.72;
const HELIX_AMP = 0.32;
const HELIX_WAVES = 1.5;
const HELIX_TILT = -35;
const HELIX_HZ = 0.6;
const HELIX_MIN_R = 3;
const TRAIL_SPREAD = 70;

const palette = Object.freeze({
  deep: Object.freeze([42, 31, 107]),
  body: Object.freeze([90, 71, 201]),
  hot: Object.freeze([143, 124, 245]),
  core: Object.freeze([210, 200, 255]),
  white: Object.freeze([255, 255, 255]),
  ember: Object.freeze([255, 155, 61]),
});

/**
 * The helix inside a dragon orb of radius `r`: two sine strands, one the mirror of the other,
 * running `HELIX_SPAN` r either side of the centre and pinched to nothing at the ends so they
 * stay inside 0.8 r; `phase` (radians) turns them, `tiltDeg` leans the whole helix. Points are
 * offsets from the orb's centre, px.
 * @returns {number[][][]} two polylines
 */
export function helixStrands(r, phase, tiltDeg = HELIX_TILT) {
  if (!(r > 0)) return [[], []];
  const a = (tiltDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [1, -1].map((sign) => {
    const points = [];
    for (let i = 0; i <= HELIX_SAMPLES; i += 1) {
      const u = (i / HELIX_SAMPLES) * 2 - 1;
      const x = u * HELIX_SPAN * r;
      const y = sign * HELIX_AMP * r * Math.sin(Math.PI * HELIX_WAVES * u + phase) * Math.sqrt(1 - u * u);
      points.push([x * cos - y * sin, x * sin + y * cos]);
    }
    return points;
  });
}

/** A soft violet halo fading through deep to nothing. */
function glow(ctx, x, y, r, alpha) {
  if (!(r > 0) || !(alpha > 0)) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgbCss(palette.hot, alpha * 0.8));
  g.addColorStop(0.55, rgbCss(palette.body, alpha * 0.4));
  g.addColorStop(1, rgbCss(palette.deep, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/**
 * A dragon orb: a white-cored violet sphere with the helix churning inside it (ember and core
 * strands). `hot` dims the white heart; `time` (the scene clock, s) turns the helix, and a
 * growing orb churns as it swells.
 */
function body(ctx, x, y, r, alpha, hot = 1, time = 0) {
  if (!(r > 0) || !(alpha > 0)) return;
  sphere(ctx, x, y, r, [
    [0, palette.white, alpha * hot],
    [0.25, palette.core, alpha],
    [0.6, palette.hot, alpha * 0.9],
    [0.85, palette.body, alpha * 0.6],
    [1, palette.deep, 0],
  ]);
  if (r < HELIX_MIN_R) return;
  const phase = TAU * HELIX_HZ * time + r * 0.05;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, r * 0.07);
  helixStrands(r, phase).forEach((strand, index) => {
    ctx.strokeStyle = rgbCss(index === 0 ? palette.ember : palette.core, 0.85 * alpha);
    ctx.beginPath();
    strand.forEach(([dx, dy], i) => (i === 0 ? ctx.moveTo(x + dx, y + dy) : ctx.lineTo(x + dx, y + dy)));
    ctx.stroke();
  });
}

/** The outline of one pass at `scale`: a flickering flame tongue, or a straight-edged scale. */
const passOutline = (spec, scale, jag) =>
  jag
    ? shardOutline({ ...spec, length: spec.length * (0.85 + 0.15 * scale), width: spec.width * scale })
    : tongueOutline(spec, scale);

/** Three-pass dragon flame: blurred violet body, lilac mid, ember core. `hot` dims the core. */
function tongue(ctx, spec, { alpha = 1, hot = 1, jag = 0 } = {}) {
  if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
  // One blurred pass only: canvas blur is the costly call (design § Constraints).
  ctx.filter = `blur(${Math.max(1, spec.width * 0.12).toFixed(1)}px)`;
  ctx.fillStyle = rgbCss(palette.body, 0.65 * alpha);
  traceOutline(ctx, passOutline(spec, 1, jag));
  ctx.fill();
  ctx.filter = 'none';
  ctx.fillStyle = rgbCss(palette.hot, 0.8 * alpha);
  traceOutline(ctx, passOutline(spec, 0.66, jag));
  ctx.fill();
  if (!(hot > 0)) return;
  ctx.fillStyle = rgbCss(palette.ember, 0.85 * alpha * Math.min(1, hot));
  traceOutline(ctx, passOutline({ ...spec, seed: spec.seed + 0.5 }, 0.38, jag));
  ctx.fill();
}

/**
 * The orb travelling along `headingDeg`: a violet glow, `tongues` flame tongues streaming
 * behind it over ±`TRAIL_SPREAD`/2 degrees (the longest straight behind), then the orb.
 */
function projectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 5, hot = 1 }) {
  if (!(r > 0) || !(alpha > 0)) return;
  glow(ctx, x, y, r * 2.3, 0.4 * alpha);
  const back = headingDeg + 180;
  for (let k = 0; k < tongues; k += 1) {
    const spread = tongues > 1 ? -TRAIL_SPREAD / 2 + (TRAIL_SPREAD * k) / (tongues - 1) : 0;
    const jitter = 6 * wobble(k * 0.41, time, seed + k);
    const length = r * (1.6 + 1.1 * (1 - Math.abs(spread) / TRAIL_SPREAD)) * (0.85 + 0.3 * Math.abs(Math.sin(seed * 2.3 + k * 1.7)));
    tongue(
      ctx,
      { x, y, angleDeg: back + spread + jitter, length, width: r * 0.95, time, seed: seed + k * 2.3 },
      { alpha: alpha * 0.9, hot: hot * 0.7 }
    );
  }
  body(ctx, x, y, r, alpha, hot, time);
}

export const dragon = Object.freeze({
  key: 'dragon',
  palette,
  // A violet-black, kept local to a card.
  shade: Object.freeze([20, 12, 48]),
  smoke: Object.freeze([90, 70, 120]),
  particle: Object.freeze({ className: 'fx-particle--ember', color: rgbCss(palette.ember), aspect: 0.3 }),
  glow,
  body,
  tongue,
  projectile,
  grain: grainPass,
});
