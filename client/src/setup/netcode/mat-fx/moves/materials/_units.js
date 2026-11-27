// Design 065 § New pieces C: `unit`s — the body a travelling or orbiting drawer draws
// (projectile, orbitCharge, volley, shards). Each is `(ctx, x, y, r, angleDeg, s, palette)`:
// centre (x, y), radius r, heading `angleDeg`, beat progress `s` (0–1) and a material palette
// ({ deep, body, hot, core, … } of [r, g, b]). Every unit draws only palette colours, saves and
// restores the context it is handed, and draws nothing for r ≤ 0. The drawer owns alpha
// (`globalAlpha`) and the composite operation.
//   'body' is the material's own body / projectile: the drawer calls the material for it (slice
//   4's hand-off); the function here is the palette-only fallback (a hot → body sphere) so the
//   table is total.
import { rgbCss } from '../../fx-colors.mjs';
import { withFxMod } from './_mods.js';

const TAU = Math.PI * 2;
const rad = (deg) => (deg * Math.PI) / 180;

/** Run `draw` translated to (x, y) and turned by `deg`, inside a save/restore pair. */
function framed(ctx, x, y, deg, draw) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rad(deg));
  draw();
  ctx.restore();
}

/** A filled circle at the origin. */
function disc(ctx, r, rgb, alpha = 1) {
  ctx.fillStyle = rgbCss(rgb, alpha);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
}

/** A closed polygon through `points`. */
function poly(ctx, points) {
  ctx.beginPath();
  points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
}

/** The six corners of a flat hexagon of radius r about the origin. */
export const hexCorners = (r) => Array.from({ length: 6 }, (_, k) => [Math.cos((k * TAU) / 6) * r, Math.sin((k * TAU) / 6) * r]);

/** Palette-only fallback for 'body': a hot core falling through body to nothing. */
function bodyUnit(ctx, x, y, r, angleDeg, s, palette) {
  if (!(r > 0)) return;
  framed(ctx, x, y, 0, () => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, rgbCss(palette.core, 1));
    g.addColorStop(0.45, rgbCss(palette.hot, 0.9));
    g.addColorStop(1, rgbCss(palette.body, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
  });
}

/** Three 0.1 r-wide rings at 0°/60°/120° tilt about a small core, turning with s (Psystrike). */
function ringsUnit(ctx, x, y, r, angleDeg, s, palette) {
  if (!(r > 0)) return;
  framed(ctx, x, y, angleDeg + 360 * s, () => {
    disc(ctx, r * 0.3, palette.core, 0.9);
    ctx.lineWidth = Math.max(1, r * 0.1);
    [0, 60, 120].forEach((tilt, k) => {
      ctx.strokeStyle = rgbCss(k === 1 ? palette.hot : palette.body, 0.9);
      ctx.beginPath();
      ctx.ellipse(0, 0, r, Math.max(0.5, r * Math.abs(Math.cos(rad(tilt + 360 * s)))) * 0.6 + r * 0.1, rad(tilt), 0, TAU);
      ctx.stroke();
    });
  });
}

/** Body plus 14 triangular spikes 0.45 r long, turning 30°/s over a ~2 s tier-S beat (Sunsteel Strike). */
function spikedUnit(ctx, x, y, r, angleDeg, s, palette) {
  if (!(r > 0)) return;
  framed(ctx, x, y, 60 * s, () => {
    ctx.fillStyle = rgbCss(palette.hot, 0.9);
    ctx.beginPath();
    for (let k = 0; k < 14; k += 1) {
      const a = (k * TAU) / 14;
      const half = TAU / 28 / 1.6;
      ctx.moveTo(Math.cos(a - half) * r, Math.sin(a - half) * r);
      ctx.lineTo(Math.cos(a) * r * 1.45, Math.sin(a) * r * 1.45);
      ctx.lineTo(Math.cos(a + half) * r, Math.sin(a + half) * r);
      ctx.closePath();
    }
    ctx.fill();
    disc(ctx, r, palette.body, 1);
    disc(ctx, r * 0.55, palette.core, 0.9);
  });
}

// The facet unit's six triangles, lit side first: hot → body → deep and back, so the faceted
// sphere reads as lit from its heading's upper side.
const FACET_SHADES = Object.freeze([
  ['hot', 1],
  ['body', 1],
  ['deep', 1],
  ['deep', 0.85],
  ['body', 0.85],
  ['hot', 0.85],
]);

/** A hexagon-faceted sphere: six triangles shaded hot → deep by angle, a 1 px core edge (Freeze Shock, Tera Starstorm). */
function facetUnit(ctx, x, y, r, angleDeg, s, palette) {
  if (!(r > 0)) return;
  framed(ctx, x, y, angleDeg - 120 + 60 * s, () => {
    const corners = hexCorners(r);
    corners.forEach((corner, k) => {
      const [key, alpha] = FACET_SHADES[k];
      ctx.fillStyle = rgbCss(palette[key], alpha);
      poly(ctx, [[0, 0], corner, corners[(k + 1) % 6]]);
      ctx.fill();
    });
    ctx.strokeStyle = rgbCss(palette.core, 0.9);
    ctx.lineWidth = 1;
    poly(ctx, corners);
    ctx.stroke();
  });
}

/** An upright ellipse 0.65 r × r of short tongues on its rim, spinning about the vertical axis (Electro Drift). */
function hoopUnit(ctx, x, y, r, angleDeg, s, palette) {
  if (!(r > 0)) return;
  const squash = Math.cos(TAU * 2 * s);
  framed(ctx, x, y, 0, () => {
    ctx.scale(Math.abs(squash) < 0.05 ? 0.05 : squash, 1);
    ctx.strokeStyle = rgbCss(palette.body, 0.9);
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.65, r, 0, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = rgbCss(palette.hot, 0.9);
    ctx.beginPath();
    for (let k = 0; k < 12; k += 1) {
      const a = (k * TAU) / 12;
      const px = Math.cos(a) * r * 0.65;
      const py = Math.sin(a) * r;
      const len = r * 0.28;
      const w = r * 0.07;
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      ctx.moveTo(px - ny * w, py + nx * w);
      ctx.lineTo(px + nx * len, py + ny * len);
      ctx.lineTo(px + ny * w, py - nx * w);
      ctx.closePath();
    }
    ctx.fill();
  });
}

/**
 * A tongue bent along a circular arc (bow 0.3 of its width 2 r, across the heading), tapering
 * to both tips, with a 1 px core edge line on its leading side (Tachyon Cutter, Mighty Cleave).
 */
function crescentUnit(ctx, x, y, r, angleDeg, s, palette) {
  if (!(r > 0)) return;
  framed(ctx, x, y, angleDeg, () => {
    // Local frame: +x is the heading; the blade spans y ∈ [-r, r] and bows forward by 0.3 · 2r.
    const bow = 0.6 * r;
    const thick = 0.35 * r;
    const steps = 12;
    const front = [];
    const back = [];
    for (let k = 0; k <= steps; k += 1) {
      const t = -1 + (2 * k) / steps;
      const along = bow * (1 - t * t);
      const half = thick * (1 - t * t) * 0.5;
      front.push([along + half, t * r]);
      back.push([along - half, t * r]);
    }
    ctx.fillStyle = rgbCss(palette.body, 0.85);
    poly(ctx, [...front, ...back.reverse()]);
    ctx.fill();
    ctx.strokeStyle = rgbCss(palette.core, 0.95);
    ctx.lineWidth = 1;
    ctx.beginPath();
    front.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.stroke();
  });
}

/** A rounded-square fist silhouette 0.8 r with a 0.25 r cuff band in hot behind it (Hyperspace Fury). */
function fistUnit(ctx, x, y, r, angleDeg, s, palette) {
  if (!(r > 0)) return;
  framed(ctx, x, y, angleDeg, () => {
    const h = 0.8 * r;
    const k = 0.3 * h;
    ctx.fillStyle = rgbCss(palette.hot, 0.95);
    ctx.fillRect(-h - 0.25 * r, -h * 0.85, 0.25 * r, h * 1.7);
    ctx.fillStyle = rgbCss(palette.body, 1);
    ctx.beginPath();
    ctx.moveTo(-h + k, -h);
    ctx.lineTo(h - k, -h);
    ctx.arc(h - k, -h + k, k, -Math.PI / 2, 0);
    ctx.lineTo(h, h - k);
    ctx.arc(h - k, h - k, k, 0, Math.PI / 2);
    ctx.lineTo(-h + k, h);
    ctx.arc(-h + k, h - k, k, Math.PI / 2, Math.PI);
    ctx.lineTo(-h, -h + k);
    ctx.arc(-h + k, -h + k, k, Math.PI, Math.PI * 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgbCss(palette.deep, 0.9);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const fy of [-h / 3, h / 3]) {
      ctx.moveTo(h * 0.35, fy);
      ctx.lineTo(h, fy);
    }
    ctx.stroke();
  });
}

/** The glyph hexagon plate (body fill, 1 px core edge), tumbling: turned 360·s (Roar of Time). */
function hexUnit(ctx, x, y, r, angleDeg, s, palette) {
  if (!(r > 0)) return;
  framed(ctx, x, y, 360 * s, () => {
    const corners = hexCorners(r);
    ctx.fillStyle = rgbCss(palette.body, 0.85);
    poly(ctx, corners);
    ctx.fill();
    ctx.strokeStyle = rgbCss(palette.core, 1);
    ctx.lineWidth = 1;
    poly(ctx, corners);
    ctx.stroke();
  });
}

/** A body disc of radius r with 10 short tongues 0.5 r long on its rim, rolling 720·s° (Collision Course). */
function wheelUnit(ctx, x, y, r, angleDeg, s, palette) {
  if (!(r > 0)) return;
  framed(ctx, x, y, 720 * s, () => {
    ctx.fillStyle = rgbCss(palette.hot, 0.9);
    ctx.beginPath();
    for (let k = 0; k < 10; k += 1) {
      const a = (k * TAU) / 10;
      const half = TAU / 40;
      ctx.moveTo(Math.cos(a - half) * r, Math.sin(a - half) * r);
      ctx.lineTo(Math.cos(a + half * 0.5) * r * 1.5, Math.sin(a + half * 0.5) * r * 1.5);
      ctx.lineTo(Math.cos(a + half) * r, Math.sin(a + half) * r);
      ctx.closePath();
    }
    ctx.fill();
    disc(ctx, r, palette.body, 1);
    disc(ctx, r * 0.5, palette.core, 0.8);
  });
}

// ---- design 092 electric-poison-fighting -------------------------------------------------

// The fist's lit body on the GPU canvas: a padded volume lit from the upper left, rimmed.
const FIST_VOLUME = Object.freeze({
  volume: Object.freeze({ amount: 0.9, spec: 0.55, rim: 0.6, ambient: 0.32, light: 120, bump: 0.2 }),
});

/** A rounded-rectangle path from (x0, y0) to (x1, y1), corner radius k. */
function roundRectPath(ctx, x0, y0, x1, y1, k) {
  ctx.beginPath();
  ctx.moveTo(x0 + k, y0);
  ctx.lineTo(x1 - k, y0);
  ctx.arc(x1 - k, y0 + k, k, -Math.PI / 2, 0);
  ctx.lineTo(x1, y1 - k);
  ctx.arc(x1 - k, y1 - k, k, 0, Math.PI / 2);
  ctx.lineTo(x0 + k, y1);
  ctx.arc(x0 + k, y1 - k, k, Math.PI / 2, Math.PI);
  ctx.lineTo(x0, y0 + k);
  ctx.arc(x0 + k, y0 + k, k, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

/** A capsule path along y from x0 to x1, half-height hh. */
function capsulePath(ctx, x0, x1, y, hh) {
  ctx.beginPath();
  ctx.moveTo(x0, y - hh);
  ctx.lineTo(x1, y - hh);
  ctx.arc(x1, y, hh, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x0, y + hh);
  ctx.arc(x0, y, hh, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath();
}

const FINGER_ROWS = Object.freeze([-0.45, -0.15, 0.15, 0.45]);
const SPEED_LINES = Object.freeze([
  [-0.42, 1.1],
  [-0.12, 1.5],
  [0.2, 1.25],
  [0.48, 0.9],
]);

/**
 * Max Knuckle's giant Dynamax fist, knuckles leading along `angleDeg` (Max Knuckle, G-Max Chi
 * Strike): a glow round it, speed lines trailing, the cuff, the back of the hand, four finger rolls
 * (the gaps between them are the creases) and the thumb, each lit from the upper left (core → hot →
 * body → deep), the hand and fingers rimmed in hot like the Dynamax outline.
 */
function maxFistUnit(ctx, x, y, r, angleDeg, s, palette) {
  if (!(r > 0)) return;
  framed(ctx, x, y, angleDeg, () => {
    const halo = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 1.6);
    halo.addColorStop(0, rgbCss(palette.body, 0.35));
    halo.addColorStop(1, rgbCss(palette.deep, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.6, 0, TAU);
    ctx.fill();
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgbCss(palette.core, 0.45);
    ctx.lineWidth = Math.max(1, r * 0.045);
    for (const [dy, len] of SPEED_LINES) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.95, dy * r);
      ctx.lineTo(-r * (0.95 + len), dy * r);
      ctx.stroke();
    }
    const lit = (lx, ly, reach) => {
      const g = ctx.createRadialGradient(lx, ly, reach * 0.05, lx + reach * 0.35, ly + reach * 0.4, reach);
      g.addColorStop(0, rgbCss(palette.core, 0.95));
      g.addColorStop(0.3, rgbCss(palette.hot, 0.9));
      g.addColorStop(0.7, rgbCss(palette.body, 0.88));
      g.addColorStop(1, rgbCss(palette.deep, 0.85));
      return g;
    };
    withFxMod(ctx, FIST_VOLUME, () => {
      ctx.fillStyle = rgbCss(palette.body, 0.75);
      roundRectPath(ctx, -1.12 * r, -0.4 * r, -0.62 * r, 0.4 * r, 0.12 * r);
      ctx.fill();
      ctx.fillStyle = rgbCss(palette.hot, 0.85);
      roundRectPath(ctx, -0.74 * r, -0.44 * r, -0.6 * r, 0.44 * r, 0.05 * r);
      ctx.fill();
      ctx.fillStyle = lit(-0.4 * r, -0.4 * r, 1.05 * r);
      roundRectPath(ctx, -0.66 * r, -0.6 * r, 0.18 * r, 0.6 * r, 0.26 * r);
      ctx.fill();
      for (const fy of FINGER_ROWS) {
        ctx.fillStyle = lit(0.2 * r, (fy - 0.1) * r, 0.62 * r);
        capsulePath(ctx, 0.08 * r, 0.6 * r, fy * r, 0.135 * r);
        ctx.fill();
      }
      ctx.fillStyle = lit(-0.15 * r, 0.45 * r, 0.6 * r);
      capsulePath(ctx, -0.32 * r, 0.3 * r, 0.6 * r, 0.12 * r);
      ctx.fill();
    });
    ctx.strokeStyle = rgbCss(palette.hot, 0.9);
    ctx.lineWidth = Math.max(1, r * 0.05);
    roundRectPath(ctx, -0.66 * r, -0.6 * r, 0.18 * r, 0.6 * r, 0.26 * r);
    ctx.stroke();
    for (const fy of FINGER_ROWS) {
      capsulePath(ctx, 0.08 * r, 0.6 * r, fy * r, 0.135 * r);
      ctx.stroke();
    }
  });
}

export const UNITS = Object.freeze({
  body: bodyUnit,
  rings: ringsUnit,
  spiked: spikedUnit,
  facet: facetUnit,
  hoop: hoopUnit,
  crescent: crescentUnit,
  fist: fistUnit,
  hex: hexUnit,
  wheel: wheelUnit,
  // design 092 electric-poison-fighting
  maxFist: maxFistUnit,
});

export const UNIT_KEYS = Object.freeze(Object.keys(UNITS));
