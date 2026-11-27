// Design 092 psychic-fairy: two drawers.
// The hoop coil (Max Mindstorm, G-Max Gravitas, G-Max Finale's whirl): each hoop is a lit tube of
// light: a soft glow, its body and a hot line along it, the far half dimmer and thinner than the
// near half so it reads as a ring in depth, and a brighter run of light turning round it. The coil
// is drawn above its anchor on screen and stood up off the card's near edge (beat-lift.mjs), so it
// hangs in the air over the card and comes down onto it. Hoop k takes item k's material (a beat's
// `hues` alternate the hoops' colours).
// The sky column (the fairy Max Moves' light pillars, the psychic column): straight shafts of light
// with soft ends — a wide glow, the shaft and a hot core line, each fading toward its open end —
// and a pool of light where a shaft stands. Shaft i takes item i's material. Light is additive (the
// player) and stays tinted: the core is the palette's core, never white. The coil's tubes burn away
// as its ripple fades; the shafts are light and fade whole (a dissolving glow reads as grey blotches).
import { rgbCss } from '../../fx-colors.mjs';
import { standOn } from '../beat-lift.mjs';
import { dissolveTail, withFxMod } from '../materials/_mods.js';
import { anchorPoint } from '../move-poses.mjs';
import { hoopCoilPose, skyColumnPose } from './psychic-fairy-poses.mjs';

const TAU = Math.PI * 2;
// A slow current runs round the tubes on the GPU canvas (gpu-canvas STYLE_PARAMS energy).
const HOOP_STYLE = Object.freeze({ id: 'energy', streak: 0.45, speed: 1.2, gain: 0.3 });
// Lit tubes with a soft glint (the psychic kit's ring tubes), so a ring never strings into beads.
const HOOP_TUBE = Object.freeze({ volume: Object.freeze({ amount: 0.85, spec: 0.35, rim: 0.6, light: 120, bump: 0, ambient: 0.3 }) });
// Passes per half: [palette key, alpha, width scale]. The far half is seen through the coil's light.
const PASSES = Object.freeze([
  ['body', 0.22, 2.6],
  ['body', 0.7, 1],
  ['hot', 0.8, 0.34],
]);
const FAR_ALPHA = 0.5;
const FAR_WIDTH = 0.7;
// The run of light turning round each hoop: its length (radians) and strength.
const RUN = 0.9;
const RUN_ALPHA = 0.55;
// The coil burns away from this share of its after-landing ripple.
const BURN_FROM = 0.55;

/** Stroke the arc [a0, a1] of the ellipse (x, y, rx, ry). */
const strokeArc = (ctx, x, y, rx, ry, a0, a1) => {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, a0, a1);
  ctx.stroke();
};

/** One hoop: far half (screen-up, angles π..2π) dim, then the near half bright, then its run of light. */
const drawHoop = (ctx, x, y, hoop, palette) => {
  const halves = [
    [Math.PI, TAU, FAR_ALPHA, FAR_WIDTH],
    [0, Math.PI, 1, 1],
  ];
  for (const [a0, a1, alpha, widthScale] of halves) {
    for (const [key, passAlpha, passWidth] of PASSES) {
      ctx.strokeStyle = rgbCss(palette[key], passAlpha * alpha * hoop.alpha);
      ctx.lineWidth = Math.max(1, hoop.width * passWidth * widthScale);
      strokeArc(ctx, x, y, hoop.rx, hoop.ry, a0, a1);
    }
  }
  // The light runs round the near half (where the eye reads it), wrapping through the far half.
  const start = ((hoop.spin % TAU) + TAU) % TAU;
  ctx.strokeStyle = rgbCss(palette.core, RUN_ALPHA * hoop.alpha * (start < Math.PI ? 1 : FAR_ALPHA));
  ctx.lineWidth = Math.max(1, hoop.width * 0.45);
  strokeArc(ctx, x, y, hoop.rx, hoop.ry, start, start + RUN);
};

export function hoopCoil(ctx, lane, s, info) {
  const p = info.params;
  const c = anchorPoint(lane, p.target, p.dx, p.dy);
  const hoops = hoopCoilPose(s, lane.h, p);
  if (!hoops.some((hoop) => hoop.alpha > 0)) return;
  // Hung over the card: what is drawn above it on screen rises off its near edge.
  ctx.fxLift = standOn({ x: c.x, y: c.y + 0.5 * lane.h });
  ctx.lineCap = 'round';
  ctx.fxStyle = HOOP_STYLE;
  const burn = dissolveTail(hoops[0].landed, BURN_FROM);
  withFxMod(ctx, { ...HOOP_TUBE, dissolve: { amount: burn } }, () => {
    // Top hoop first: the lower hoops are nearer the eye and pass over it.
    for (let k = hoops.length - 1; k >= 0; k -= 1) {
      const hoop = hoops[k];
      if (!(hoop.alpha > 0) || !(hoop.rx > 0)) continue;
      drawHoop(ctx, c.x, c.y - hoop.lift, hoop, materialOf(info, k).palette);
    }
  });
  ctx.fxStyle = null;
}

/** Item k's material: the hued one when the beat has hues, else the beat material. */
const materialOf = (info, k) => (typeof info.materialAt === 'function' ? info.materialAt(k) : info.material);

// Light streaming along a shaft on the GPU canvas.
const SHAFT_STYLE = Object.freeze({ id: 'energy', streak: 0.6, speed: 1.6, gain: 0.25 });
// A shaft's passes across its width: [half-width × the shaft's width, palette key at the edge, at the
// centre, alpha]: a wide soft glow, the shaft itself, a thin hot core.
const SHAFT_PASSES = Object.freeze([
  [1.7, 'deep', 'body', 0.3],
  [0.5, 'body', 'hot', 0.75],
  [0.14, 'hot', 'core', 0.85],
]);
const SLICES = 12;
// The open end of a shaft fades over this share of its length; the foot end is cut soft and short.
const OPEN_FADE = 0.35;
const FOOT_FADE = 0.08;

/** Alpha along a shaft at u (0 open end … 1 foot end). */
const shaftEnvelope = (u) => Math.min(1, u / OPEN_FADE, (1 - u) / FOOT_FADE);

/**
 * One shaft from y0 (its open end, up the screen) to y1 (its foot), drawn in slices so both ends
 * are soft. `x` is its centre line, `width` its width.
 */
const drawShaft = (ctx, x, y0, y1, width, alpha, palette) => {
  const length = y1 - y0;
  if (!(length > 0.5) || !(width > 0)) return;
  const base = ctx.globalAlpha;
  for (const [halfScale, edgeKey, centreKey, passAlpha] of SHAFT_PASSES) {
    const half = Math.max(0.5, width * halfScale);
    const across = ctx.createLinearGradient(x - half, 0, x + half, 0);
    across.addColorStop(0, rgbCss(palette[edgeKey], 0));
    across.addColorStop(0.5, rgbCss(palette[centreKey], 1));
    across.addColorStop(1, rgbCss(palette[edgeKey], 0));
    ctx.fillStyle = across;
    for (let k = 0; k < SLICES; k += 1) {
      const a = shaftEnvelope((k + 0.5) / SLICES) * passAlpha * alpha;
      if (!(a > 0.003)) continue;
      ctx.globalAlpha = base * a;
      // Slices abut exactly: added light that overlapped would draw a bright seam at each joint.
      ctx.fillRect(x - half, y0 + (length * k) / SLICES, half * 2, length / SLICES);
    }
  }
  ctx.globalAlpha = base;
};

/** The light pooled where a shaft stands: a flat glow, its colour, under the shaft's foot. */
const drawFoot = (ctx, x, y, width, alpha, palette) => {
  if (!(alpha > 0)) return;
  const rx = width * 2.2;
  const ry = rx * 0.4;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, rgbCss(palette.hot, 0.7 * alpha));
  g.addColorStop(0.4, rgbCss(palette.body, 0.35 * alpha));
  g.addColorStop(1, rgbCss(palette.body, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fill();
  ctx.restore();
};

export function skyColumn(ctx, lane, s, info) {
  const p = info.params;
  const c = anchorPoint(lane, p.target, p.dx, p.dy);
  const shafts = skyColumnPose(s, lane.h, { ...p, beatMs: info.beatMs });
  if (shafts.length === 0) return;
  // Stood up off the card's near edge, like a pillar: what is above the card on screen is in the air.
  ctx.fxLift = standOn({ x: c.x, y: c.y + 0.5 * lane.h });
  ctx.fxStyle = SHAFT_STYLE;
  // Light fades whole (its pose thins and dims it): a dissolving glow reads as grey blotches (078).
  shafts.forEach((shaft) => {
    if (!(shaft.alpha > 0)) return;
    const { palette } = materialOf(info, shaft.index);
    const x = c.x + shaft.x;
    // Either way the open end is up the screen (the sky, or the head of a rising shaft).
    drawShaft(ctx, x, c.y + shaft.top, c.y + shaft.bottom, shaft.width, shaft.alpha, palette);
    drawFoot(ctx, x, c.y + shaft.ground, shaft.width, shaft.foot, palette);
  });
  ctx.fxStyle = null;
}
