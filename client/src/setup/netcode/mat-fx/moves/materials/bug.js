// Design 063: the bug material (recipe in the design's § Materials) and its two variants.
//   bug — the elongated unit is a *needle*: straight and thin, widest a quarter of the way along,
//     tapering to a sharp point; one bright fill, a pale centre line, and a dark tip (deep,
//     drawn source-over so it covers what is under it: a chitin point). `jag` makes it a chip of
//     chitin. The round unit is a bug-wing disc: two translucent wings with vein lines either side
//     of a bright core, beating (open/shut). A projectile is a needle in a faint halo trailing
//     `tongues` fading after-images (pins, stingers, the horn); at 0 tongues it is a wing disc
//     beating at 12 Hz (a flying bug: swarms, Lunge's ball). Palette #8CBF26 #BFE34D #F0F7B0,
//     deep #4A6B10. No grain, no blur.
//   buzz — Bug Buzz's sound: the bug needle, but the round unit is a disc of three sound rings
//     breathing out of phase, so a pulse-train of them reads as a train of sound discs.
//   silver — Silver Wind's powder: a silver-white palette whose round unit is a glinting powder
//     scale and whose elongated unit is a soft silver streak.
// Everything but the needle's dark tip is additive (the player's `lighter`).
import { rgbCss } from '../../fx-colors.mjs';
import { grainPass, inShadow, shardOutline, sphere, tongueOutline, traceOutline } from './_shared.js';

const TAU = Math.PI * 2;
// A needle is drawn at 0.6 of the width a drawer hands it: at full width a spindle reads as a leaf.
const WAIST_HALF = 0.3;
const BASE_HALF = 0.1;
const NEEDLE_WAIST = 0.28;
const NEEDLE_ALPHA = 0.85;
const TIP_FROM = 0.8;
const TIP_ALPHA = 0.8;
const CENTRE_LINE = 0.12;
// A needle projectile sits with its tip `r` ahead of the centre: it starts 1.6 r behind it.
const HEAD_BACK = 1.6;
const HEAD_LENGTH = 2.6;
const HEAD_WIDTH = 1;
const TRAIL_STEP = 0.9;
// A flying wing disc beats at 12 Hz; |sin| beats twice per cycle, so the phase runs at 6 Hz.
const WING_HZ = 12;
const WING_ALPHA = 0.35;
const VEIN_ALPHA = 0.6;
const SOUND_RINGS = Object.freeze([
  ['hot', 1],
  ['body', 0.68],
  ['core', 0.38],
]);
const STREAK_AMP = 0.3;
const STREAK_ALPHA = 0.45;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const rad = (deg) => (deg * Math.PI) / 180;

const palette = Object.freeze({
  deep: Object.freeze([74, 107, 16]),
  body: Object.freeze([140, 191, 38]),
  hot: Object.freeze([191, 227, 77]),
  core: Object.freeze([240, 247, 176]),
  white: Object.freeze([255, 255, 255]),
});

const SILVER_PALETTE = Object.freeze({
  deep: Object.freeze([124, 138, 150]),
  body: Object.freeze([200, 210, 218]),
  hot: Object.freeze([232, 238, 242]),
  core: Object.freeze([246, 248, 250]),
  white: Object.freeze([255, 255, 255]),
});

/** Map (f along, side across) in units of `length` / `width` from the base (x, y) along `angleDeg`. */
const framer = ({ x, y, angleDeg, length, width }) => {
  const a = rad(angleDeg);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  return (f, side) => [x + ux * length * f - uy * width * side, y + uy * length * f + ux * width * side];
};

/** Half the needle's width (in units of `width`) at `f` along it: widest at the waist, 0 at the tip. */
const needleHalf = (f) => (f <= NEEDLE_WAIST ? BASE_HALF + (WAIST_HALF - BASE_HALF) * (f / NEEDLE_WAIST) : (WAIST_HALF * (1 - f)) / (1 - NEEDLE_WAIST));

/**
 * A needle from its base (x, y) along `angleDeg`: a blunt base 0.2 `width` across, widening to
 * 0.6 `width` at 28 % of `length`, then straight to a sharp tip on the axis. Both chains run base
 * to tip, as `traceOutline` takes; `left` is the side on the normal (-uy, ux).
 * @returns {{left: number[][], right: number[][]}}
 */
export function needleOutline(spec) {
  const at = framer(spec);
  return {
    left: [at(0, BASE_HALF), at(NEEDLE_WAIST, WAIST_HALF), at(1, 0)],
    right: [at(0, -BASE_HALF), at(NEEDLE_WAIST, -WAIST_HALF), at(1, 0)],
  };
}

/** The needle's dark tip: the triangle from 80 % of its length to the point. */
export function needleTip(spec) {
  const at = framer(spec);
  const half = needleHalf(TIP_FROM);
  return [at(TIP_FROM, half), at(1, 0), at(TIP_FROM, -half)];
}

/** How far a wing disc's wings are open for `phase`: 0.55 (shut) to 1 (spread), twice a cycle. */
export function wingOpen(phase) {
  return 0.55 + 0.45 * Math.abs(Math.sin(phase));
}

/** The three sound rings' alphas for `phase`: each breathes between 0.35 and 1, a third of a cycle apart. */
export function soundAlphas(phase) {
  return SOUND_RINGS.map((_, k) => 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(phase + (k * TAU) / SOUND_RINGS.length)));
}

const tracePoints = (ctx, points) => {
  ctx.beginPath();
  points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
};

/** A soft halo: the pale core fading through the body colour to nothing. */
const haloOf = (pal, coreAlpha, bodyAlpha) =>
  function glow(ctx, x, y, r, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgbCss(pal.core, alpha * coreAlpha));
    g.addColorStop(0.5, rgbCss(pal.body, alpha * bodyAlpha));
    g.addColorStop(1, rgbCss(pal.deep, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  };

// The interface's `body` carries no clock, so a lone disc beats with where it is and how big it
// has grown (it beats as it swells or travels and holds still at rest), as ice's flake turns.
const restingPhase = (x, y, r) => x * 0.05 + y * 0.07 + r * 0.9;

/**
 * One needle (or with `jag`, a chip of chitin): the bright fill, a pale centre line (`hot` 0
 * drops it), then the dark tip drawn source-over so it covers.
 */
function needle(ctx, pal, spec, { alpha = 1, hot = 1, jag = 0 } = {}) {
  if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
  if (jag) {
    const chip = shardOutline(spec);
    ctx.fillStyle = rgbCss(pal.body, NEEDLE_ALPHA * alpha);
    traceOutline(ctx, chip);
    ctx.fill();
    ctx.strokeStyle = rgbCss(pal.hot, 0.9 * alpha);
    ctx.lineWidth = 1;
    traceOutline(ctx, chip);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = rgbCss(pal.body, NEEDLE_ALPHA * alpha);
  traceOutline(ctx, needleOutline(spec));
  ctx.fill();
  const line = 0.9 * alpha * clamp01(hot);
  if (line > 0) {
    const at = framer(spec);
    const [x0, y0] = at(0.04, 0);
    const [x1, y1] = at(TIP_FROM, 0);
    ctx.strokeStyle = rgbCss(pal.core, line);
    ctx.lineWidth = Math.max(1, spec.width * CENTRE_LINE);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  inShadow(ctx, () => {
    ctx.fillStyle = rgbCss(pal.deep, TIP_ALPHA * alpha);
    tracePoints(ctx, needleTip(spec));
    ctx.fill();
  });
}

/** A bug-wing disc: two translucent wings (one fill), their veins (one stroke), a bright core. */
function wingDisc(ctx, pal, x, y, r, alpha, hot, phase) {
  const open = wingOpen(phase);
  ctx.fillStyle = rgbCss(pal.hot, WING_ALPHA * alpha);
  ctx.beginPath();
  for (const side of [-1, 1]) {
    // Each wing tilts up and out; start the sub-path where its ellipse starts (no joining line).
    const cx = x + side * r * 0.48 * open;
    const cy = y - r * 0.12;
    const rx = r * 0.52 * open;
    const tilt = side * -0.35;
    ctx.moveTo(cx + rx * Math.cos(tilt), cy + rx * Math.sin(tilt));
    ctx.ellipse(cx, cy, rx, r * 0.3, tilt, 0, TAU);
  }
  ctx.fill();
  ctx.strokeStyle = rgbCss(pal.hot, VEIN_ALPHA * alpha);
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(x, y);
    ctx.lineTo(x + side * r * 0.95 * open, y - r * 0.32);
    ctx.moveTo(x, y);
    ctx.lineTo(x + side * r * 0.7 * open, y + r * 0.06);
  }
  ctx.stroke();
  sphere(
    ctx,
    x,
    y,
    r * 0.32,
    [
      [0, pal.white, alpha * 0.9 * clamp01(hot)],
      [0.5, pal.core, alpha * 0.7],
      [1, pal.body, 0],
    ],
    0.1
  );
}

/**
 * A needle flying along `headingDeg` (its tip leads, `r` past the centre), trailing `tongues`
 * fading after-images; at 0 tongues a wing disc beating on the scene clock.
 */
const projectileOf = (pal, glow, round) =>
  function projectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 2, hot = 1 }) {
    if (!(r > 0) || !(alpha > 0)) return;
    glow(ctx, x, y, r * 2.2, 0.45 * alpha);
    if (!(tongues > 0)) {
      round(ctx, x, y, r, alpha, hot, time * Math.PI * WING_HZ + seed);
      return;
    }
    const a = rad(headingDeg);
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const length = r * HEAD_LENGTH;
    const width = r * HEAD_WIDTH;
    for (let k = tongues; k >= 1; k -= 1) {
      const back = r * (HEAD_BACK + TRAIL_STEP * k);
      needle(
        ctx,
        pal,
        { x: x - ux * back, y: y - uy * back, angleDeg: headingDeg, length: length * Math.max(0.4, 1 - 0.08 * k), width: width * Math.max(0.4, 1 - 0.1 * k), seed: seed + k },
        { alpha: alpha * Math.max(0.08, 0.55 - 0.1 * k), hot: 0 }
      );
    }
    needle(ctx, pal, { x: x - ux * r * HEAD_BACK, y: y - uy * r * HEAD_BACK, angleDeg: headingDeg, length, width, seed }, { alpha, hot });
  };

// ---- bug -------------------------------------------------------------------------------

const bugGlow = haloOf(palette, 0.45, 0.25);

function bugBody(ctx, x, y, r, alpha, hot = 1) {
  if (!(r > 0) || !(alpha > 0)) return;
  wingDisc(ctx, palette, x, y, r, alpha, hot, restingPhase(x, y, r));
}

function bugTongue(ctx, spec, opts) {
  needle(ctx, palette, spec, opts);
}

const bugParticle = Object.freeze({ className: 'fx-particle--shard', color: rgbCss(palette.hot), aspect: 0.6 });
// A deep forest black, kept local to a card, so the yellow-green reads against it.
const bugShade = Object.freeze([14, 22, 4]);

export const bug = Object.freeze({
  key: 'bug',
  palette,
  shade: bugShade,
  smoke: null,
  particle: bugParticle,
  glow: bugGlow,
  body: bugBody,
  tongue: bugTongue,
  projectile: projectileOf(palette, bugGlow, (ctx, x, y, r, alpha, hot, phase) => wingDisc(ctx, palette, x, y, r, alpha, hot, phase)),
  grain: grainPass,
});

// ---- buzz ------------------------------------------------------------------------------

/** A sound disc: a faint halo, then three concentric rings (hot, body, core) breathing with `phase`. */
function soundDisc(ctx, x, y, r, alpha, hot, phase) {
  bugGlow(ctx, x, y, r * 1.1, 0.6 * alpha);
  const alphas = soundAlphas(phase);
  ctx.lineWidth = Math.max(1, r * 0.1);
  SOUND_RINGS.forEach(([key, scale], k) => {
    ctx.strokeStyle = rgbCss(palette[key], alpha * alphas[k] * (0.6 + 0.4 * clamp01(hot)));
    ctx.beginPath();
    ctx.arc(x, y, r * scale, 0, TAU);
    ctx.stroke();
  });
}

function buzzBody(ctx, x, y, r, alpha, hot = 1) {
  if (!(r > 0) || !(alpha > 0)) return;
  soundDisc(ctx, x, y, r, alpha, hot, restingPhase(x, y, r));
}

/** A sound disc flying along `headingDeg`, trailing `tongues` fainter, smaller discs. */
function buzzProjectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 2, hot = 1 }) {
  if (!(r > 0) || !(alpha > 0)) return;
  const a = rad(headingDeg);
  for (let k = tongues; k >= 1; k -= 1) {
    const back = r * 0.85 * k;
    const scale = Math.max(0.3, 1 - 0.15 * k);
    soundDisc(ctx, x - Math.cos(a) * back, y - Math.sin(a) * back, r * scale, alpha * Math.max(0.1, 0.8 - 0.15 * k), hot * 0.6, time * 9 + seed + k);
  }
  soundDisc(ctx, x, y, r, alpha, hot, time * 9 + seed);
}

export const buzz = Object.freeze({
  key: 'buzz',
  palette,
  shade: bugShade,
  smoke: null,
  particle: bugParticle,
  glow: bugGlow,
  body: buzzBody,
  tongue: bugTongue,
  projectile: buzzProjectile,
  grain: grainPass,
});

// ---- silver ----------------------------------------------------------------------------

const silverGlow = haloOf(SILVER_PALETTE, 0.5, 0.28);

/** A powder scale: a pearly sphere and a four-point glint (one stroke) turned `phase`; hot 0 drops the glint. */
function scaleMote(ctx, x, y, r, alpha, hot, phase) {
  const lit = clamp01(hot);
  sphere(ctx, x, y, r, [
    [0, SILVER_PALETTE.white, alpha * 0.85 * lit],
    [0.35, SILVER_PALETTE.hot, alpha * 0.55],
    [0.75, SILVER_PALETTE.body, alpha * 0.18],
    [1, SILVER_PALETTE.deep, 0],
  ]);
  const glint = 0.8 * alpha * lit;
  if (!(glint > 0)) return;
  ctx.strokeStyle = rgbCss(SILVER_PALETTE.white, glint);
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const turn of [0, Math.PI / 2]) {
    const dx = Math.cos(phase + turn) * r * 0.75;
    const dy = Math.sin(phase + turn) * r * 0.75;
    ctx.moveTo(x - dx, y - dy);
    ctx.lineTo(x + dx, y + dy);
  }
  ctx.stroke();
}

function silverBody(ctx, x, y, r, alpha, hot = 1) {
  if (!(r > 0) || !(alpha > 0)) return;
  scaleMote(ctx, x, y, r, alpha, hot, restingPhase(x, y, r));
}

/**
 * A silver streak: a soft translucent tongue (a third of fire's wobble) and a white centre line
 * (`hot` 0 drops it); `jag` makes it a flake of powder scale (a pale chip with a white edge).
 */
function silverTongue(ctx, spec, { alpha = 1, hot = 1, jag = 0 } = {}) {
  if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
  if (jag) {
    const flake = shardOutline(spec);
    ctx.fillStyle = rgbCss(SILVER_PALETTE.hot, 0.75 * alpha);
    traceOutline(ctx, flake);
    ctx.fill();
    ctx.strokeStyle = rgbCss(SILVER_PALETTE.white, 0.6 * alpha);
    ctx.lineWidth = 1;
    traceOutline(ctx, flake);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = rgbCss(SILVER_PALETTE.body, STREAK_ALPHA * alpha);
  traceOutline(ctx, tongueOutline({ ...spec, time: spec.time ?? 0, seed: spec.seed ?? 0, amp: STREAK_AMP }));
  ctx.fill();
  const line = 0.8 * alpha * clamp01(hot);
  if (!(line > 0)) return;
  const at = framer(spec);
  const [x0, y0] = at(0.05, 0);
  const [x1, y1] = at(0.8, 0);
  ctx.strokeStyle = rgbCss(SILVER_PALETTE.white, line);
  ctx.lineWidth = Math.max(1, spec.width * 0.08);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** A powder scale in a halo trailing `tongues` silver streaks behind its heading. */
function silverProjectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 2, hot = 1 }) {
  if (!(r > 0) || !(alpha > 0)) return;
  silverGlow(ctx, x, y, r * 2.2, 0.45 * alpha);
  const a = rad(headingDeg);
  for (let k = 1; k <= tongues; k += 1) {
    const side = r * 0.35 * k * (k % 2 ? 1 : -1);
    silverTongue(
      ctx,
      { x: x - Math.sin(a) * side, y: y + Math.cos(a) * side, angleDeg: headingDeg + 180, length: r * 2.2 * Math.max(0.4, 1 - 0.1 * k), width: r * 0.8, time, seed: seed + k },
      { alpha: alpha * Math.max(0.1, 0.7 - 0.1 * k), hot: 0 }
    );
  }
  scaleMote(ctx, x, y, r, alpha, hot, time * 4 + seed);
}

export const silver = Object.freeze({
  key: 'silver',
  palette: SILVER_PALETTE,
  // A slate night, kept local to a card, so the pale powder reads against it.
  shade: Object.freeze([10, 14, 22]),
  smoke: null,
  particle: Object.freeze({ className: 'fx-particle--mote', color: rgbCss(SILVER_PALETTE.hot), aspect: 1 }),
  glow: silverGlow,
  body: silverBody,
  tongue: silverTongue,
  projectile: silverProjectile,
  grain: grainPass,
});
