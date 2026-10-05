// Design 063: the fire material for move scenes, drawn on a 2D canvas (no WebGL,
// D-constraint in the design). A flame is a tapered tongue whose edges wobble with
// time, filled in three passes — a blurred orange body, a yellow mid, a near-white
// core — and composited additively; a grain pass eats speckles out of the whole
// layer so the gradients stop reading as flat discs. Every function takes the
// context it draws on and is otherwise pure.
import { rgbCss } from '../fx-colors.mjs';

export const FIRE = {
  red: [210, 41, 8],
  orange: [235, 108, 6],
  yellow: [241, 175, 13],
  core: [255, 246, 214],
  white: [255, 255, 255],
};

const TAU = Math.PI * 2;
const TONGUE_SAMPLES = 14;
const NOISE_SIZE = 192;
const rad = (deg) => (deg * Math.PI) / 180;

/** Cheap 1-D turbulence in [-1, 1]: three sines at unrelated rates. */
export const wobble = (s, time, seed) =>
  0.5 * Math.sin(s * 6.3 + time * 7 + seed) +
  0.3 * Math.sin(s * 13.1 - time * 11 + seed * 1.7) +
  0.2 * Math.sin(s * 23 + time * 17 + seed * 2.9);

/**
 * Trace one flame tongue as a closed path: from (x, y) along `angleDeg`, `length`
 * long, `width` wide at the shoulder, tapering to a tip that drifts with time.
 * `scale` shrinks it about its base for the inner passes.
 */
export function tonguePath(
  ctx,
  { x, y, angleDeg, length, width, time, seed },
  scale = 1
) {
  const a = rad(angleDeg);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const nx = -uy;
  const ny = ux;
  const len = length * (0.85 + 0.15 * scale);
  const halfWidth = (s) => {
    const envelope =
      s < 0.22 ? Math.sqrt(s / 0.22) : (1 - (s - 0.22) / 0.78) ** 0.85;
    return width * 0.5 * scale * envelope * (1 + 0.3 * wobble(s, time, seed));
  };
  const drift = (s) =>
    width * 0.35 * s * s * Math.sin(time * 5 + seed) +
    width * 0.2 * s * wobble(s * 0.5, time * 0.7, seed + 9);
  const left = [];
  const right = [];
  for (let i = 0; i <= TONGUE_SAMPLES; i += 1) {
    const s = i / TONGUE_SAMPLES;
    const cx = x + ux * s * len + nx * drift(s);
    const cy = y + uy * s * len + ny * drift(s);
    const w = i === TONGUE_SAMPLES ? 0 : halfWidth(s);
    left.push([cx + nx * w, cy + ny * w]);
    right.push([cx - nx * w, cy - ny * w]);
  }
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < left.length; i += 1) ctx.lineTo(left[i][0], left[i][1]);
  for (let i = right.length - 2; i >= 0; i -= 1)
    ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
}

/** Three-pass flame tongue: blurred body, mid, hot core. `hot` dims the core. */
export function drawTongue(ctx, spec, { alpha = 1, hot = 1 } = {}) {
  if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
  // One blurred pass only: canvas blur is the costly part of this material.
  ctx.filter = `blur(${Math.max(1, spec.width * 0.12).toFixed(1)}px)`;
  ctx.fillStyle = rgbCss(FIRE.orange, 0.6 * alpha);
  tonguePath(ctx, spec, 1);
  ctx.fill();
  ctx.filter = 'none';
  ctx.fillStyle = rgbCss(FIRE.yellow, 0.8 * alpha);
  tonguePath(ctx, spec, 0.66);
  ctx.fill();
  if (hot > 0) {
    ctx.fillStyle = rgbCss(FIRE.core, 0.9 * alpha * hot);
    tonguePath(ctx, { ...spec, seed: spec.seed + 0.5 }, 0.4);
    ctx.fill();
  }
}

/** A soft radial glow, red at the rim. */
export function drawGlow(ctx, x, y, r, alpha, rgb = FIRE.orange) {
  if (!(r > 0) || !(alpha > 0)) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgbCss(rgb, alpha));
  g.addColorStop(0.55, rgbCss(FIRE.red, alpha * 0.45));
  g.addColorStop(1, rgbCss(FIRE.red, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** A hot sphere: white core, yellow, orange, falling to nothing. */
export function drawOrb(ctx, x, y, r, alpha, hot = 1) {
  if (!(r > 0) || !(alpha > 0)) return;
  const g = ctx.createRadialGradient(x - r * 0.15, y - r * 0.15, 0, x, y, r);
  g.addColorStop(0, rgbCss(FIRE.white, alpha * hot));
  g.addColorStop(0.3, rgbCss(FIRE.core, alpha));
  g.addColorStop(0.62, rgbCss(FIRE.yellow, alpha * 0.9));
  g.addColorStop(0.86, rgbCss(FIRE.orange, alpha * 0.5));
  g.addColorStop(1, rgbCss(FIRE.red, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/**
 * A fireball of radius `r` travelling along `headingDeg`: a glow halo, a fan of
 * tongues streaming behind it, the hot sphere, and a few sparks shed off it.
 */
export function drawFireball(
  ctx,
  { x, y, r, headingDeg, time, seed, alpha = 1, tongues = 7, hot = 1 }
) {
  if (!(r > 0) || !(alpha > 0)) return;
  drawGlow(ctx, x, y, r * 2.4, 0.35 * alpha);
  const back = headingDeg + 180;
  for (let k = 0; k < tongues; k += 1) {
    const spread = tongues > 1 ? -50 + (100 * k) / (tongues - 1) : 0;
    const jitter = 8 * wobble(k * 0.37, time, seed + k);
    const len =
      r *
      (1.4 +
        0.9 *
          Math.abs(Math.sin(seed * 3.1 + k * 1.9)) *
          (1 - Math.abs(spread) / 70));
    drawTongue(
      ctx,
      {
        x,
        y,
        angleDeg: back + spread + jitter,
        length: len,
        width: r * 0.9,
        time,
        seed: seed + k * 2.1,
      },
      { alpha: alpha * 0.9, hot: hot * 0.6 }
    );
  }
  drawOrb(ctx, x, y, r, alpha, hot);
  ctx.fillStyle = rgbCss(FIRE.core, 0.9 * alpha);
  for (let k = 0; k < 6; k += 1) {
    const a = seed * 1.3 + k * 1.05 + time * 2;
    const d = r * (1.1 + 0.9 * Math.abs(Math.sin(a * 2.7 + k)));
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.06, 0, TAU);
    ctx.fill();
  }
}

let noiseTile = null;

/** A tiling value-noise alpha mask, built once; null where canvases are unavailable. */
export function getNoiseTile() {
  if (noiseTile !== null) return noiseTile || null;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = NOISE_SIZE;
  canvas.height = NOISE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    noiseTile = false;
    return null;
  }
  const image = ctx.createImageData(NOISE_SIZE, NOISE_SIZE);
  // Three octaves of lattice noise that wrap at the tile edge.
  const lattice = (cells) => {
    const grid = new Float32Array(cells * cells);
    let a = 2463534242;
    for (let i = 0; i < grid.length; i += 1) {
      a ^= a << 13;
      a ^= a >>> 17;
      a ^= a << 5;
      grid[i] = (a >>> 0) / 4294967296;
    }
    return (x, y) => {
      const gx = (x / NOISE_SIZE) * cells;
      const gy = (y / NOISE_SIZE) * cells;
      const x0 = Math.floor(gx) % cells;
      const y0 = Math.floor(gy) % cells;
      const x1 = (x0 + 1) % cells;
      const y1 = (y0 + 1) % cells;
      const fx = gx - Math.floor(gx);
      const fy = gy - Math.floor(gy);
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const top = grid[y0 * cells + x0] * (1 - sx) + grid[y0 * cells + x1] * sx;
      const bottom =
        grid[y1 * cells + x0] * (1 - sx) + grid[y1 * cells + x1] * sx;
      return top * (1 - sy) + bottom * sy;
    };
  };
  const octaves = [
    [lattice(6), 0.5],
    [lattice(12), 0.3],
    [lattice(24), 0.2],
  ];
  for (let y = 0; y < NOISE_SIZE; y += 1) {
    for (let x = 0; x < NOISE_SIZE; x += 1) {
      let v = 0;
      for (const [fn, weight] of octaves) v += fn(x, y) * weight;
      const i = (y * NOISE_SIZE + x) * 4;
      image.data[i + 3] = Math.round(
        255 * Math.max(0, Math.min(1, (v - 0.35) * 2.2))
      );
    }
  }
  ctx.putImageData(image, 0, 0);
  noiseTile = canvas;
  return canvas;
}

/**
 * Grain pass: punch scrolling noise out of what is already on `ctx`, so flat
 * gradients break into embers and tongues. `strength` 0–1; `time` scrolls it.
 */
export function grainPass(ctx, size, time, strength = 0.3) {
  const tile = getNoiseTile();
  if (!tile || !(strength > 0)) return;
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = strength;
  ctx.translate((time * 90) % NOISE_SIZE, (-time * 140) % NOISE_SIZE);
  ctx.fillStyle = pattern;
  ctx.fillRect(
    -NOISE_SIZE,
    -NOISE_SIZE,
    size + NOISE_SIZE * 2,
    size + NOISE_SIZE * 2
  );
  ctx.restore();
}
