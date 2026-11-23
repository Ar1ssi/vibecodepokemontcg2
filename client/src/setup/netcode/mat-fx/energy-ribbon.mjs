// The Mega entry's energy ribbons: the bands that wrap the keystone orb (mega-orb.mjs) and the
// vortex they whip into after its burst (mega-vortex.mjs). A ribbon is light, not paint: it is
// drawn additively in three layers (a wide soft glow, the band's body and a hot core) one segment
// at a time, so its colour and brightness change along it, and it twists as it flies: it narrows
// where it turns edge-on, its core burns brighter there, and its back face is a deeper tone. That
// reads as a band turning in space where a filled outline reads as a flat cut-out.
// Pure: it draws only on the 2D context passed in, so it runs under `node --test`.

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const mixRgb = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgba = ([r, g, b], a) => `rgba(${r}, ${g}, ${b}, ${clamp01(a).toFixed(3)})`;

const WHITE = [255, 255, 255];
const INK = [10, 8, 24];

/** The three layers, outermost first: half-width scale, alpha scale, how far toward white. */
const LAYERS = Object.freeze([
  { width: 2.4, alpha: 0.2, white: 0 },
  { width: 1, alpha: 0.88, white: 0.1 },
  { width: 0.3, alpha: 0.9, white: 0.62 },
]);
const CORE = LAYERS[2];

/**
 * How a ribbon faces the viewer at `u` along it (0 tail … 1 head) as it twists `turns` times
 * along its length, rolled by `phase` radians: 1 flat on, 0 edge-on; `back` when its back face
 * shows.
 * @returns {{ facing: number, back: boolean }}
 */
export function ribbonTwist(u, turns, phase = 0) {
  const c = Math.cos(clamp01(u) * turns * Math.PI * 2 + phase);
  return { facing: Math.abs(c), back: c < 0 };
}

/** Half-width of a twisting band of half-width `half` where it faces the viewer by `facing`. */
export const twistedHalf = (half, facing) => half * (0.28 + 0.72 * clamp01(facing));

/**
 * The colour along a ribbon running from `from` (tail) to `to` (head): a deep tail, its body,
 * a hot head. A two-colour ribbon crosses over round `split` through a brightened middle, the way
 * two lights add, never through a muddy blend.
 */
export function ribbonColourAt(u, from, to, split = 0.55) {
  const c = clamp01(u);
  const cross = from === to ? 0 : clamp01((c - split + 0.14) / 0.28);
  const body = cross > 0 ? mixRgb(mixRgb(from, to, cross), WHITE, 0.35 * Math.sin(Math.PI * cross)) : from;
  const tail = mixRgb(body, INK, 0.35 * (1 - clamp01(c / 0.4)));
  return mixRgb(tail, WHITE, 0.4 * clamp01((c - 0.8) / 0.2));
}

/** Unit normals of a screen polyline, one per point, from its neighbours. */
function normalsOf(points) {
  return points.map((p, i) => {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    return [-dy / len, dx / len];
  });
}

/**
 * Draw one run of a ribbon through screen points `{ x, y, half, rgb, alpha, facing }` (`facing`
 * 0 edge-on … 1 flat on), tail first. Draws nothing for fewer than two points.
 */
export function drawEnergyRibbon(ctx, points) {
  if (!Array.isArray(points) || points.length < 2) return;
  const normals = normalsOf(points);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const layer of LAYERS) {
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const alpha = ((a.alpha + b.alpha) / 2) * layer.alpha;
      if (!(alpha > 0.002)) continue;
      // Edge-on, the band is seen through its whole width: its core burns brighter there. Taken
      // per point, so neighbouring segments meet edge to edge.
      const coreA = layer === CORE ? 1 + 0.6 * (1 - a.facing) : 1;
      const coreB = layer === CORE ? 1 + 0.6 * (1 - b.facing) : 1;
      const wa = a.half * layer.width * coreA;
      const wb = b.half * layer.width * coreB;
      const [nax, nay] = normals[i];
      const [nbx, nby] = normals[i + 1];
      ctx.fillStyle = rgba(mixRgb(mixRgb(a.rgb, b.rgb, 0.5), WHITE, layer.white), (alpha * (coreA + coreB)) / 2);
      ctx.beginPath();
      ctx.moveTo(a.x + nax * wa, a.y + nay * wa);
      ctx.lineTo(b.x + nbx * wb, b.y + nby * wb);
      ctx.lineTo(b.x - nbx * wb, b.y - nby * wb);
      ctx.lineTo(a.x - nax * wa, a.y - nay * wa);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

/** The burning head of a ribbon: a soft hot glow of `radius` at (x, y). */
export function drawRibbonHead(ctx, x, y, radius, rgb, alpha) {
  if (!(radius > 0) || !(alpha > 0)) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
  grad.addColorStop(0, rgba(mixRgb(rgb, WHITE, 0.75), alpha));
  grad.addColorStop(0.35, rgba(rgb, 0.55 * alpha));
  grad.addColorStop(1, rgba(rgb, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A ribbon's back face: the same light a little deeper, so the twist reads. */
export const backFace = (rgb) => mixRgb(rgb, INK, 0.28);
