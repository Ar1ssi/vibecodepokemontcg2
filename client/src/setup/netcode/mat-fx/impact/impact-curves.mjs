// Design 068: evaluate the importer's compact MinMaxCurve / MinMaxGradient values
// (scripts/fx/attack/lib/normalize-system.mjs) with the curve maths design 066 put in
// tcgl-fx.mjs. DOM-free.
import { curveAt, gradientAt, lerp } from '../tcgl-fx.mjs';

/**
 * A MinMaxCurve at `t` in [0, 1]: a number, `[min, max]`, `{k, s}` or `{k, k2, s}`.
 * `mix` in [0, 1] picks between the two ends of a random-between form.
 */
export function evalMinMax(value, t = 0, mix = 0) {
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) return lerp(value[0], value[1], mix);
  if (!value || typeof value !== 'object') return 0;
  const upper = curveAt(value.k, t);
  return value.s * (value.k2 ? lerp(curveAt(value.k2, t), upper, mix) : upper);
}

/** The largest magnitude a MinMaxCurve can read (for bounds and durations). */
export function maxMagnitude(value) {
  if (typeof value === 'number') return Math.abs(value);
  if (Array.isArray(value)) return Math.max(Math.abs(value[0]), Math.abs(value[1]));
  if (!value || typeof value !== 'object') return 0;
  const peak = (keys) => (keys ?? []).reduce((most, key) => Math.max(most, Math.abs(key[1])), 0);
  return Math.abs(value.s) * Math.max(peak(value.k), peak(value.k2));
}

/** True when the value never reads anything but 0. */
export const isZeroCurve = (value) => maxMagnitude(value) === 0;

const WHITE = Object.freeze([1, 1, 1, 1]);

const gradientColor = (gradient, t) => {
  const { rgb, a } = gradientAt(gradient, t);
  return [rgb[0], rgb[1], rgb[2], a];
};

const mixColor = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];

/**
 * A MinMaxGradient at `t`: `[r, g, b, a]`, `{g}`, `{c2: [min, max]}`, `{g, g2}` or `{rnd}`
 * (a random point of the gradient, picked by `mix`). Returns `[r, g, b, a]`.
 */
export function evalColor(value, t = 0, mix = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return WHITE;
  if (value.c2) return mixColor(value.c2[0], value.c2[1], mix);
  if (value.rnd) return gradientColor(value.rnd, mix);
  if (value.g2) return mixColor(gradientColor(value.g2, t), gradientColor(value.g, t), mix);
  return value.g ? gradientColor(value.g, t) : WHITE;
}
