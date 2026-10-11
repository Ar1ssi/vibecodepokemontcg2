// Design 068: Unity AnimationCurves are cubic Hermite splines; the runtime evaluates
// piecewise-linear keys (`curveAt` in tcgl-fx.mjs, design 066). This bakes one into the other.

const SAMPLES_PER_SEGMENT = 24;
const RELATIVE_TOLERANCE = 0.005;
const MIN_TOLERANCE = 1e-4;

/** Unity's Hermite segment between two keys; an infinite tangent holds the left key (stepped). */
export function hermite(left, right, time) {
  const span = right.time - left.time;
  if (!(span > 0)) return right.value;
  if (!Number.isFinite(left.outSlope) || !Number.isFinite(right.inSlope)) return left.value;
  const u = (time - left.time) / span;
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    (2 * u3 - 3 * u2 + 1) * left.value +
    (u3 - 2 * u2 + u) * left.outSlope * span +
    (-2 * u3 + 3 * u2) * right.value +
    (u3 - u2) * right.inSlope * span
  );
}

/** The curve's value at `time`, clamped to its first / last key outside them; 0 without keys. */
export function evaluateUnityCurve(keys, time) {
  if (!Array.isArray(keys) || keys.length === 0) return 0;
  if (time <= keys[0].time) return keys[0].value;
  for (let index = 1; index < keys.length; index += 1) {
    if (time <= keys[index].time) return hermite(keys[index - 1], keys[index], time);
  }
  return keys[keys.length - 1].value;
}

const distanceToChord = (point, start, end) => {
  const span = end[0] - start[0];
  if (!(span > 0)) return Math.abs(point[1] - start[1]);
  const along = (point[0] - start[0]) / span;
  return Math.abs(point[1] - (start[1] + (end[1] - start[1]) * along));
};

/** Ramer–Douglas–Peucker on the value axis: drop points a straight chord already predicts. */
export function simplifyPolyline(points, tolerance) {
  if (points.length <= 2) return points;
  let worst = 0;
  let worstIndex = 0;
  const last = points.length - 1;
  for (let index = 1; index < last; index += 1) {
    const distance = distanceToChord(points[index], points[0], points[last]);
    if (distance > worst) {
      worst = distance;
      worstIndex = index;
    }
  }
  if (worst <= tolerance) return [points[0], points[last]];
  const head = simplifyPolyline(points.slice(0, worstIndex + 1), tolerance);
  const tail = simplifyPolyline(points.slice(worstIndex), tolerance);
  return [...head.slice(0, -1), ...tail];
}

const round = (value) => Number(value.toFixed(5));

/**
 * `{m_Curve: [{time, value, inSlope, outSlope}, …]}` → `[[t, v], …]`, within 0.5 % of the
 * curve's value range of the spline. No keys → `[]` (reads as 0).
 */
export function bakeCurve(curve) {
  const keys = [...(curve?.m_Curve ?? [])].sort((a, b) => a.time - b.time);
  if (keys.length === 0) return [];
  if (keys.length === 1) return [[round(keys[0].time), round(keys[0].value)]];
  const points = [];
  for (let index = 1; index < keys.length; index += 1) {
    const left = keys[index - 1];
    const right = keys[index];
    for (let step = index === 1 ? 0 : 1; step <= SAMPLES_PER_SEGMENT; step += 1) {
      const time = left.time + ((right.time - left.time) * step) / SAMPLES_PER_SEGMENT;
      points.push([time, step === SAMPLES_PER_SEGMENT ? right.value : hermite(left, right, time)]);
    }
  }
  const values = points.map((point) => point[1]);
  const range = Math.max(...values) - Math.min(...values);
  return simplifyPolyline(points, Math.max(MIN_TOLERANCE, range * RELATIVE_TOLERANCE)).map(([t, v]) => [round(t), round(v)]);
}
