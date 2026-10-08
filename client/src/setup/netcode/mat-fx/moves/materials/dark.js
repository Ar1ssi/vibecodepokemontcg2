// Design 063: the dark material (recipe in the design's § Materials). Dark is the one type
// whose substance is darker than the board, and an additive pass cannot darken: so every unit
// draws its shadow mass with `source-over` inside its own save/restore (the caller's composite
// comes back untouched) and its crimson edges and haze on the caller's additive pass, where
// they glow. The elongated unit is a *shadow slash*: a thin near-black blade over a blurred
// crimson halo, one crimson line on its leading edge; `jag` makes it an angular splinter. The
// round unit is a *dark pulse*: a shadow core ringed by dark rings rippling outward with crimson
// between them. A projectile is a pulse in a crimson haze, wreathed in splinters and blades.
// Palette #3B3B4F #6E6E8C #B9B9D6, deep #101018, accent #FF3D6E (crimson) as `hot`. Every
// call draws on the context it is handed and is otherwise pure.
import { rgbCss } from '../../fx-colors.mjs';
import { grainPass, inShadow, shardOutline, sphere, tongueOutline, traceOutline } from './_shared.js';

export { shardOutline };

const TAU = Math.PI * 2;
const BLADE_WIDTH = 0.8;
const HALO_WIDTH = 1.5;
const BLADE_AMP = 0.35;
const BLADE_ALPHA = 0.9;
const HALO_ALPHA = 0.7;
const HALO_BLUR = 0.1;
const EDGE_WIDTH = 0.1;
const PULSE_RINGS = 3;
const PULSE_INNER = 0.3;
const PULSE_HZ = 1.6;
const TAIL_SPREAD = 24;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const fract = (v) => v - Math.floor(v);
const rad = (deg) => (deg * Math.PI) / 180;

const PALETTE = Object.freeze({
  deep: Object.freeze([16, 16, 24]),
  shadow: Object.freeze([59, 59, 79]),
  body: Object.freeze([110, 110, 140]),
  hot: Object.freeze([255, 61, 110]),
  core: Object.freeze([185, 185, 214]),
  white: Object.freeze([255, 255, 255]),
});

/**
 * The dark pulse's rings at `phase` (cycles): `PULSE_RINGS` rings born at 0.3 r rippling out
 * to r, a third of a cycle apart, each fading in and out over its cycle.
 * @returns {{radius: number, alpha: number}[]}
 */
export function pulseRings(phase, r) {
  const rings = [];
  for (let i = 0; i < PULSE_RINGS; i += 1) {
    const u = fract(phase + i / PULSE_RINGS);
    rings.push({ radius: r * (PULSE_INNER + (1 - PULSE_INNER) * u), alpha: Math.sin(Math.PI * u) });
  }
  return rings;
}

/** The dark material drawn in `palette` (any palette with the same keys). */
function darkKit(palette) {
  /** Crimson haze: an additive glow fading to clear. */
  function glow(ctx, x, y, r, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgbCss(palette.hot, alpha * 0.5));
    g.addColorStop(0.55, rgbCss(palette.hot, alpha * 0.18));
    g.addColorStop(1, rgbCss(palette.hot, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  /** A dark pulse turned to `phase`: shadow core, dark rings rippling out with crimson between. */
  function pulse(ctx, x, y, r, alpha, hot, phase) {
    inShadow(ctx, () => {
      sphere(
        ctx,
        x,
        y,
        r,
        [
          [0, palette.deep, alpha * 0.92],
          [0.6, palette.shadow, alpha * 0.75],
          [1, palette.shadow, 0],
        ],
        0
      );
    });
    const rings = pulseRings(phase, r);
    inShadow(ctx, () => {
      ctx.lineWidth = Math.max(1, r * 0.14);
      for (const ring of rings) {
        ctx.strokeStyle = rgbCss(palette.deep, 0.8 * alpha * ring.alpha);
        ctx.beginPath();
        ctx.arc(x, y, ring.radius, 0, TAU);
        ctx.stroke();
      }
    });
    ctx.lineWidth = Math.max(1, r * 0.05);
    for (const ring of rings) {
      ctx.strokeStyle = rgbCss(palette.hot, 0.9 * alpha * ring.alpha);
      ctx.beginPath();
      ctx.arc(x, y, ring.radius + r * 0.1, 0, TAU);
      ctx.stroke();
    }
    const spark = alpha * clamp01(hot);
    if (!(spark > 0)) return;
    ctx.fillStyle = rgbCss(palette.core, 0.55 * spark);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.16, 0, TAU);
    ctx.fill();
  }

  // The interface's `body` carries no clock, so a pulse ripples with where it is and how big it
  // has grown (it ripples as it swells or travels, and holds still at rest), as psychic's lens.
  /** A dark pulse of radius `r`; `hot` lights its pale centre. */
  function body(ctx, x, y, r, alpha, hot = 1) {
    if (!(r > 0) || !(alpha > 0)) return;
    pulse(ctx, x, y, r, alpha, hot, (x * 0.02 + y * 0.03 + r * 0.15) / TAU);
  }

  /**
   * A shadow slash: a blurred crimson halo (additive), a thin near-black blade over it (shadow),
   * one crimson line on its leading edge. `jag` makes it an angular splinter; `hot` 0 drops
   * the halo's heat to an ember.
   */
  function tongue(ctx, spec, { alpha = 1, hot = 1, jag = 0 } = {}) {
    if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
    const shape = (widthScale) =>
      jag
        ? shardOutline({ ...spec, width: spec.width * widthScale })
        : tongueOutline({ ...spec, width: spec.width * widthScale, amp: BLADE_AMP }, 1);
    const halo = shape(HALO_WIDTH);
    const blade = shape(BLADE_WIDTH);
    ctx.filter = `blur(${Math.max(1, spec.width * HALO_BLUR).toFixed(2)}px)`;
    ctx.fillStyle = rgbCss(palette.hot, HALO_ALPHA * alpha * (0.4 + 0.6 * clamp01(hot)));
    traceOutline(ctx, halo);
    ctx.fill();
    ctx.filter = 'none';
    inShadow(ctx, () => {
      ctx.fillStyle = rgbCss(palette.deep, BLADE_ALPHA * alpha);
      traceOutline(ctx, blade);
      ctx.fill();
    });
    ctx.strokeStyle = rgbCss(palette.hot, 0.9 * alpha);
    ctx.lineWidth = Math.max(1, spec.width * EDGE_WIDTH);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    blade.left.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.stroke();
  }

  /**
   * A dark pulse in flight along `headingDeg`: a crimson haze, `tongues` splinters and blades
   * wreathing behind it and swaying out of step, and the pulse rippling on the scene clock.
   * 0 tongues = a bare pulse.
   */
  function projectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 3, hot = 1 }) {
    if (!(r > 0) || !(alpha > 0)) return;
    glow(ctx, x, y, r * 2.2, 0.45 * alpha);
    const back = headingDeg + 180;
    for (let k = 0; k < tongues; k += 1) {
      // A narrow tail streaming behind, not a fan: a wide spread of spikes reads as a sunburst.
      const spread = tongues > 1 ? -TAIL_SPREAD + (2 * TAIL_SPREAD * k) / (tongues - 1) : 0;
      const angleDeg = back + spread + 8 * Math.sin(time * 4 + k * 1.7 + seed);
      const a = rad(angleDeg);
      tongue(
        ctx,
        {
          x: x + Math.cos(a) * r * 0.6,
          y: y + Math.sin(a) * r * 0.6,
          angleDeg,
          length: r * (1.5 + 0.6 * Math.abs(Math.sin(seed * 1.3 + k * 2.1))),
          width: r * 0.42,
          time,
          seed: seed + k * 1.9,
        },
        { alpha: alpha * 0.85, hot: hot * 0.8, jag: k % 2 }
      );
    }
    pulse(ctx, x, y, r, alpha, hot, time * PULSE_HZ + seed * 0.1);
  }

  return Object.freeze({
    key: 'dark',
    palette,
    // The sprite games' night: a violet-black, kept local to a card.
    shade: Object.freeze([10, 6, 18]),
    smoke: Object.freeze([40, 40, 60]),
    particle: Object.freeze({ className: 'fx-particle--streak', color: rgbCss(palette.hot), aspect: 0.3 }),
    glow,
    body,
    tongue,
    projectile,
    grain: grainPass,
    withPalette: (p) => darkKit(p),
  });
}

export const dark = darkKit(PALETTE);
