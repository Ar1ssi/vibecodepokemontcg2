// Design 036: the vortex that follows the Mega orb's burst, drawn on the orb's
// canvas. TCG Live whips fat orange/blue brush crescents round the card on
// wide, nearly flat 3D orbits that decelerate: each stroke is thick in the
// middle with a pointed head and a tail split into sharp prongs, may switch
// abruptly from one colour to the other, and passes behind the card on the
// far side of its orbit. DOM-free like mega-orb.mjs, so it runs under `node --test`.
import { MEGA_ORB_PALETTE } from './mega-orb.mjs';

const DEG = Math.PI / 180;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const span = (t, a, b) => clamp01((t - a) / (b - a));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInCubic = (t) => t ** 3;
const plateau = (t, a, b, c, d) => {
  if (t <= a || t >= d) return 0;
  if (t < b) return easeOutCubic(span(t, a, b));
  if (t <= c) return 1;
  return 1 - easeInCubic(span(t, c, d));
};
const mixRgb = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgba = ([r, g, b], a) => `rgba(${r}, ${g}, ${b}, ${a})`;

const WHITE = [255, 255, 255];

// One stroke per row: tail → head colour, orbit radius and stroke width (card
// heights), arc length (deg), orbit tilt about x (0 = flat, seen edge-on; 90 =
// facing the viewer) and roll about z (deg), start phase (deg), spin
// direction, launch lag (entry fraction) and how many ragged prongs the tail
// splits into. As in Live the orbits are wide, low ellipses seen from above,
// so strokes sweep past below the card in front and above it behind; the
// last rows are small flecks thrown off the main strokes.
export const MEGA_VORTEX_RIBBONS = [
  ['blue', 'blue', 2.1, 0.5, 150, 22, -6, 20, 1, 0, 4],
  ['orange', 'orange', 1.75, 0.46, 140, 26, 10, 150, 1, 0.01, 3],
  ['blue', 'orange', 2.5, 0.42, 130, 18, 4, 260, 1, 0.02, 4],
  ['orange', 'blue', 1.5, 0.4, 120, 30, -14, 320, 1, 0.005, 3],
  ['blue', 'blue', 2.7, 0.38, 110, 16, -10, 90, -1, 0.03, 4],
  ['orange', 'orange', 2.3, 0.4, 125, 24, 18, 210, -1, 0.025, 3],
  ['blue', 'orange', 1.9, 0.34, 100, 34, -24, 120, 1, 0.04, 3],
  ['orange', 'blue', 2.8, 0.32, 95, 14, 12, 0, -1, 0.045, 2],
  ['blue', 'blue', 3.0, 0.14, 28, 20, -4, 60, 1, 0.02, 2],
  ['orange', 'orange', 2.9, 0.12, 24, 24, 8, 190, 1, 0.035, 1],
  ['blue', 'blue', 2.6, 0.12, 22, 28, -12, 300, -1, 0.03, 2],
  ['blue', 'blue', 3.1, 0.1, 20, 16, 6, 140, 1, 0.05, 1],
].map(
  ([from, to, radius, width, arc, tiltX, roll, phase, spin, lag, spikes]) => ({
    from,
    to,
    radius,
    width,
    arc,
    tiltX,
    roll,
    phase,
    spin,
    lag,
    spikes,
  })
);

/** How far (deg) a stroke's head travels over its whole flight. */
const SWEEP_DEG = 330;
// Viewer distance (card heights): near strokes swell, far ones shrink.
const CAMERA = 9;
const SEGMENTS = 40;
// The orbits are centred a little above the card, so the strokes arch over it.
const LIFT = 0.12;

/**
 * One stroke at t in [0, 1] of the Mega entry: it launches from the orb at the
 * burst, flies out to its orbit while it draws in, decelerates, and unwinds
 * (tail catching the head) as it fades.
 */
export function megaRibbonPose(t, burstAt = 0.5, lag = 0) {
  const c = clamp01(t);
  const start = burstAt - 0.01 + lag;
  return {
    opacity: plateau(c, start, start + 0.03, 0.8, 0.96 - lag),
    spread: 0.3 + 0.7 * easeOutCubic(span(c, start, start + 0.12)),
    sweep: easeOutCubic(span(c, start, 1)),
    length:
      easeOutCubic(span(c, start, start + 0.08)) *
      (1 - 0.65 * easeInCubic(span(c, 0.74, 0.96))),
  };
}

/** A point `angleDeg` round a stroke's tilted orbit, in card heights (y up, z toward the viewer). */
export function vortexPoint(ribbon, angleDeg) {
  const a = angleDeg * DEG;
  const x = Math.cos(a) * ribbon.radius;
  const z = Math.sin(a) * ribbon.radius;
  const tilt = ribbon.tiltX * DEG;
  const y1 = -z * Math.sin(tilt);
  const z1 = z * Math.cos(tilt);
  const roll = ribbon.roll * DEG;
  return [
    x * Math.cos(roll) - y1 * Math.sin(roll),
    x * Math.sin(roll) + y1 * Math.cos(roll),
    z1,
  ];
}

/** Stroke thickness along its length (0 = tail, 1 = head): a crescent, fattest past the middle. */
export const strokeTaper = (u) => Math.sin(Math.PI * clamp01(u) ** 1.3);

/**
 * How far the tail flares past the stroke body at u, as a fraction of the
 * stroke's full half-width: it splits into `spikes` sharp prongs, like the end
 * of a dry brush stroke. `shift` (radians) offsets the prongs so the two edges
 * of the stroke don't mirror each other. 0 = no prong.
 */
export function tailFlare(u, spikes, shift = 0) {
  const reach = 0.6;
  if (!(spikes > 0) || !(u >= 0) || u >= reach) return 0;
  const wave = Math.max(0, Math.sin((u / reach) * Math.PI * spikes + shift));
  return 0.9 * wave ** 4 * (1 - u / reach);
}

/**
 * Outline of a stroke through screen points `{x, y, outer, inner}` where the
 * two half-widths are measured away from and toward `centre`: the outer edge
 * forward, the inner edge back.
 */
export function strokeOutline(points, centre) {
  const outerEdge = [];
  const innerEdge = [];
  points.forEach((p, i) => {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    if (nx * (p.x - centre.x) + ny * (p.y - centre.y) < 0) {
      nx = -nx;
      ny = -ny;
    }
    outerEdge.push([p.x + nx * p.outer, p.y + ny * p.outer]);
    innerEdge.push([p.x - nx * p.inner, p.y - ny * p.inner]);
  });
  return outerEdge.concat(innerEdge.reverse());
}

/**
 * Split a stroke into runs on the far (`back`, z < 0) or near side of its
 * orbit. Each run keeps the neighbouring point across the crossing, so the
 * two layers meet without a notch.
 */
export function sideRuns(points, layer) {
  const onSide = (p) => p.z >= 0 === (layer === 'front');
  const runs = [];
  let run = [];
  points.forEach((p, i) => {
    if (onSide(p)) {
      if (!run.length && i > 0) run.push(points[i - 1]);
      run.push(p);
      return;
    }
    if (run.length) {
      run.push(p);
      runs.push(run);
      run = [];
    }
  });
  if (run.length > 1) runs.push(run);
  return runs;
}

function tracePolygon(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1)
    ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
}

/** Screen points along one stroke, or [] while it is hidden. */
function strokePoints(ribbon, pose, cx, cy, unit) {
  if (!(pose.opacity > 0) || !(pose.length > 0)) return [];
  const head = ribbon.phase + ribbon.spin * SWEEP_DEG * pose.sweep;
  const length = ribbon.arc * pose.length;
  const points = [];
  for (let s = 0; s <= SEGMENTS; s += 1) {
    const u = s / SEGMENTS;
    const [x, y, z] = vortexPoint(
      ribbon,
      head - ribbon.spin * length * (1 - u)
    );
    const zs = z * pose.spread;
    const k = CAMERA / (CAMERA - zs);
    const full = (unit * ribbon.width * k) / 2;
    const half = full * strokeTaper(u);
    points.push({
      x: cx + x * pose.spread * unit * k,
      y: cy - (y * pose.spread + LIFT) * unit * k,
      z: zs,
      half,
      outer: half + full * tailFlare(u, ribbon.spikes),
      inner: half + full * 0.45 * tailFlare(u, ribbon.spikes, Math.PI / 2),
      u,
    });
  }
  return points;
}

// Where a two-colour stroke switches colour, as a fraction of its length. Live
// strokes change colour abruptly: blending orange into blue goes muddy grey.
const COLOUR_SPLIT = 0.55;

/**
 * Colour stops for a run of a stroke spanning [u0, u1] of its length: solid
 * for one-colour strokes, else a hard switch from `from` to `to` at the split.
 */
export function runColourStops(from, to, u0, u1) {
  if (from === to)
    return [
      [0, from],
      [1, from],
    ];
  const at =
    u1 > u0 ? (COLOUR_SPLIT - u0) / (u1 - u0) : Number(u0 < COLOUR_SPLIT);
  if (at <= 0)
    return [
      [0, to],
      [1, to],
    ];
  if (at >= 1)
    return [
      [0, from],
      [1, from],
    ];
  return [
    [0, from],
    [Math.max(0, at - 0.02), from],
    [Math.min(1, at + 0.02), to],
    [1, to],
  ];
}

function fillRun(ctx, run, ribbon, centre, unit) {
  const first = run[0];
  const last = run[run.length - 1];
  const stops = runColourStops(ribbon.from, ribbon.to, first.u, last.u);
  const gradient = (lighten, alpha) => {
    const grad = ctx.createLinearGradient(first.x, first.y, last.x, last.y);
    for (const [at, name] of stops)
      grad.addColorStop(
        at,
        rgba(mixRgb(MEGA_ORB_PALETTE[name], WHITE, lighten), alpha)
      );
    return grad;
  };
  const band = (outer, inner) =>
    strokeOutline(
      run.map((p) => ({ ...p, outer: outer(p), inner: inner(p) })),
      centre
    );

  ctx.shadowColor = rgba(MEGA_ORB_PALETTE[ribbon.to], 0.8);
  ctx.shadowBlur = unit * 0.1;
  ctx.fillStyle = gradient(0, 1);
  tracePolygon(ctx, strokeOutline(run, centre));
  ctx.fill();
  ctx.shadowBlur = 0;
  // A lighter band toward the outer edge and a hot line near the head, as on
  // a painted stroke; kept saturated so the colour still reads.
  ctx.fillStyle = gradient(0.35, 0.85);
  tracePolygon(
    ctx,
    band(
      (p) => p.half * 0.7,
      (p) => -p.half * 0.1
    )
  );
  ctx.fill();
  ctx.fillStyle = rgba(WHITE, 0.7);
  tracePolygon(
    ctx,
    band(
      (p) => p.half * 0.45 * p.u ** 3,
      (p) => -p.half * 0.2 * p.u ** 3
    )
  );
  ctx.fill();
}

/**
 * Draw the vortex at t of the Mega entry. (cx, cy) is the card centre and
 * `unit` the card height, both in canvas CSS pixels; `card` is the card's
 * size, cut out of the far half of each orbit so strokes pass behind it.
 */
export function drawMegaVortex(
  ctx,
  t,
  { cx, cy, unit, card = null, burstAt = 0.5 }
) {
  if (!(unit > 0)) return;
  const centre = { x: cx, y: cy - LIFT * unit };
  const strokes = MEGA_VORTEX_RIBBONS.map((ribbon) => {
    const pose = megaRibbonPose(t, burstAt, ribbon.lag);
    return { ribbon, pose, points: strokePoints(ribbon, pose, cx, cy, unit) };
  }).filter((s) => s.points.length > 1);
  if (!strokes.length) return;

  const baseAlpha = ctx.globalAlpha;
  ctx.save();
  if (card?.width > 0 && card?.height > 0) {
    ctx.beginPath();
    ctx.rect(cx - unit * 8, cy - unit * 8, unit * 16, unit * 16);
    ctx.rect(
      cx - card.width / 2,
      cy - card.height / 2,
      card.width,
      card.height
    );
    ctx.clip('evenodd');
  }
  for (const { ribbon, pose, points } of strokes) {
    ctx.globalAlpha = baseAlpha * pose.opacity * 0.8;
    for (const run of sideRuns(points, 'back'))
      fillRun(ctx, run, ribbon, centre, unit);
  }
  ctx.restore();

  ctx.save();
  for (const { ribbon, pose, points } of strokes) {
    ctx.globalAlpha = baseAlpha * pose.opacity;
    for (const run of sideRuns(points, 'front'))
      fillRun(ctx, run, ribbon, centre, unit);
  }
  ctx.restore();
}
