// Design 036: the vortex that follows the Mega orb's burst, drawn on the orb's
// canvas. Orange and blue energy ribbons are flung out of the burst onto
// tilted orbits round the card, whip round and decelerate, and pass behind
// the card on the far side of their orbit; then each unwinds (its tail
// catches its head) and fades. The ribbons are light (energy-ribbon.mjs): a
// glow, a body and a hot core, twisting as they fly, deep at the tail and
// burning at the head; a two-colour ribbon crosses over through a brightened
// middle. Their orbits ring the card (about one to two card heights out, tilted
// 30–65° and rolled different ways) so the vortex wraps it in depth instead of
// stretching flat across the mat. DOM-free like mega-orb.mjs, so it runs under
// `node --test`.
import { backFace, drawEnergyRibbon, drawRibbonHead, ribbonColourAt, ribbonTwist, twistedHalf } from './energy-ribbon.mjs';
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

// One ribbon per row: tail → head colour, orbit radius and ribbon width (card
// heights), arc length (deg), orbit tilt about x (0 = flat, seen edge-on; 90 =
// facing the viewer) and roll about z (deg), start phase (deg), spin
// direction, launch lag (entry fraction) and how many times it twists along
// its length. The last rows are small flecks thrown off the main ribbons.
export const MEGA_VORTEX_RIBBONS = [
  ['blue', 'blue', 1.45, 0.28, 150, 38, -14, 20, 1, 0, 1.2],
  ['orange', 'orange', 1.25, 0.26, 140, 52, 18, 150, 1, 0.01, 1],
  ['blue', 'orange', 1.6, 0.24, 130, 34, 8, 260, 1, 0.02, 1.4],
  ['orange', 'blue', 1.1, 0.24, 120, 60, -30, 320, 1, 0.005, 0.9],
  ['blue', 'blue', 1.7, 0.22, 110, 30, -22, 90, -1, 0.03, 1.1],
  ['orange', 'orange', 1.5, 0.24, 125, 46, 34, 210, -1, 0.025, 1.3],
  ['blue', 'orange', 1.3, 0.2, 100, 64, -40, 120, 1, 0.04, 0.8],
  ['orange', 'blue', 1.75, 0.2, 95, 28, 24, 0, -1, 0.045, 1],
  ['blue', 'blue', 1.9, 0.07, 28, 40, -8, 60, 1, 0.02, 0.5],
  ['orange', 'orange', 1.85, 0.06, 24, 48, 14, 190, 1, 0.035, 0.5],
  ['blue', 'blue', 1.65, 0.06, 22, 56, -26, 300, -1, 0.03, 0.5],
  ['blue', 'blue', 2.0, 0.05, 20, 36, 10, 140, 1, 0.05, 0.5],
].map(([from, to, radius, width, arc, tiltX, roll, phase, spin, lag, turns]) => ({
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
  turns,
}));

/** How far (deg) a ribbon's head travels over its whole flight. */
const SWEEP_DEG = 330;
// Viewer distance (card heights): near ribbons swell, far ones shrink.
const CAMERA = 9;
const SEGMENTS = 64;
// The orbits are centred a little above the card, so the ribbons arch over it.
const LIFT = 0.12;
// The far side of an orbit, behind the card: dimmer, as light seen through the haze round it.
const BACK_ALPHA = 0.6;
// How fast the twist runs along a ribbon (radians a second).
const TWIST_SPEED = 5;

/**
 * One ribbon at t in [0, 1] of the Mega entry: it launches from the orb at the
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
    length: easeOutCubic(span(c, start, start + 0.08)) * (1 - 0.65 * easeInCubic(span(c, 0.74, 0.96))),
  };
}

/** A point `angleDeg` round a ribbon's tilted orbit, in card heights (y up, z toward the viewer). */
export function vortexPoint(ribbon, angleDeg) {
  const a = angleDeg * DEG;
  const x = Math.cos(a) * ribbon.radius;
  const z = Math.sin(a) * ribbon.radius;
  const tilt = ribbon.tiltX * DEG;
  const y1 = -z * Math.sin(tilt);
  const z1 = z * Math.cos(tilt);
  const roll = ribbon.roll * DEG;
  return [x * Math.cos(roll) - y1 * Math.sin(roll), x * Math.sin(roll) + y1 * Math.cos(roll), z1];
}

/** Ribbon width along its length (0 = tail, 1 = head): pointed at both ends, fattest past the middle. */
export const strokeTaper = (u) => Math.sin(Math.PI * clamp01(u) ** 1.3);

/** Brightness along a ribbon: it fades out toward the tail. */
export const ribbonFade = (u) => clamp01(u / 0.45) ** 1.5;

/**
 * Split a ribbon into runs on the far (`back`, z < 0) or near side of its
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

/** Screen points along one ribbon, tail first, or [] while it is hidden. */
function ribbonPoints(ribbon, pose, cx, cy, unit, time) {
  if (!(pose.opacity > 0) || !(pose.length > 0)) return [];
  const head = ribbon.phase + ribbon.spin * SWEEP_DEG * pose.sweep;
  const length = ribbon.arc * pose.length;
  const from = MEGA_ORB_PALETTE[ribbon.from];
  const to = MEGA_ORB_PALETTE[ribbon.to];
  const twistPhase = ribbon.phase * DEG - time * TWIST_SPEED;
  const points = [];
  for (let s = 0; s <= SEGMENTS; s += 1) {
    const u = s / SEGMENTS;
    const [x, y, z] = vortexPoint(ribbon, head - ribbon.spin * length * (1 - u));
    const zs = z * pose.spread;
    const k = CAMERA / (CAMERA - zs);
    const half = ((unit * ribbon.width * k) / 2) * strokeTaper(u);
    const twist = ribbonTwist(u, ribbon.turns, twistPhase);
    const rgb = ribbonColourAt(u, from, to);
    points.push({
      x: cx + x * pose.spread * unit * k,
      y: cy - (y * pose.spread + LIFT) * unit * k,
      z: zs,
      u,
      half: twistedHalf(half, twist.facing),
      facing: twist.facing,
      rgb: twist.back ? backFace(rgb) : rgb,
      alpha: ribbonFade(u),
    });
  }
  return points;
}

/** A run drawn at `alpha` of its ribbon's brightness. */
const dimmed = (run, alpha) => run.map((p) => ({ ...p, alpha: p.alpha * alpha }));

/**
 * Draw the vortex at t of the Mega entry. (cx, cy) is the card centre and
 * `unit` the card height, both in canvas CSS pixels; `card` is the card's
 * size, cut out of the far half of each orbit so ribbons pass behind it.
 * `time` (seconds) runs the twist along the ribbons.
 */
export function drawMegaVortex(ctx, t, { cx, cy, unit, card = null, burstAt = 0.5, time = t * 3.2 }) {
  if (!(unit > 0)) return;
  const ribbons = MEGA_VORTEX_RIBBONS.map((ribbon) => {
    const pose = megaRibbonPose(t, burstAt, ribbon.lag);
    return { ribbon, pose, points: ribbonPoints(ribbon, pose, cx, cy, unit, time) };
  }).filter((r) => r.points.length > 1);
  if (!ribbons.length) return;

  ctx.save();
  if (card?.width > 0 && card?.height > 0) {
    ctx.beginPath();
    ctx.rect(cx - unit * 8, cy - unit * 8, unit * 16, unit * 16);
    ctx.rect(cx - card.width / 2, cy - card.height / 2, card.width, card.height);
    ctx.clip('evenodd');
  }
  for (const { pose, points } of ribbons) {
    for (const run of sideRuns(points, 'back')) drawEnergyRibbon(ctx, dimmed(run, pose.opacity * BACK_ALPHA));
  }
  ctx.restore();

  for (const { ribbon, pose, points } of ribbons) {
    for (const run of sideRuns(points, 'front')) drawEnergyRibbon(ctx, dimmed(run, pose.opacity));
    const reach = points[Math.round(points.length * 0.7)];
    // The head burns where the ribbon is fattest; behind the card it is hidden with the run.
    if (reach.z >= 0) drawRibbonHead(ctx, reach.x, reach.y, reach.half * 2.6, MEGA_ORB_PALETTE[ribbon.to], 0.55 * pose.opacity);
  }
}
