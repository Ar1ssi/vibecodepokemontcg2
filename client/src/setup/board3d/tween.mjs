// Clock-driven tweens for the three.js board (design 074 O10, edge case 11). Pure: the caller
// supplies times (the scene clock's `now()`), so tests drive them without a browser.

/** CSS-like ease-out: fast start, gentle landing. */
export const easeOutCubic = (t) => 1 - (1 - t) ** 3;

const isObject = (value) => value !== null && typeof value === 'object';

/**
 * Interpolates `from` → `to` at progress `k`. Numbers mix; in objects every numeric field of
 * `to` mixes with the same field of `from` (missing there = the target), anything else takes
 * the target's value.
 */
function mix(from, to, k) {
  if (!isObject(to)) {
    return Number.isFinite(from) && Number.isFinite(to)
      ? from + (to - from) * k
      : to;
  }
  const out = {};
  for (const key of Object.keys(to)) {
    const target = to[key];
    const start = isObject(from) ? from[key] : undefined;
    out[key] =
      Number.isFinite(target) && Number.isFinite(start)
        ? start + (target - start) * k
        : target;
  }
  return out;
}

/**
 * @template T number or a flat object of numbers (non-numeric fields switch at once)
 * @param {{ from: T, to: T, ms: number, now: number, ease?: (t: number) => number }} options
 * @returns {{ at: (t: number) => T, done: (t: number) => boolean,
 *   retarget: (to: T, now: number, ms: number) => void, readonly target: T }}
 *   `retarget` continues from the value at `now`, so a new target never snaps the motion back
 *   to its start. `ms <= 0` is finished at once.
 */
export function createTween({ from, to, ms, now, ease = easeOutCubic }) {
  let start = from;
  let target = to;
  let startTime = Number(now) || 0;
  let duration = Math.max(0, Number(ms) || 0);

  const progress = (t) => {
    if (duration <= 0) return 1;
    const raw = (t - startTime) / duration;
    return raw >= 1 ? 1 : raw <= 0 ? 0 : raw;
  };

  const at = (t) => {
    const k = progress(t);
    return k >= 1 ? mix(target, target, 1) : mix(start, target, ease(k));
  };

  const done = (t) => progress(t) >= 1;

  const retarget = (to, now, ms) => {
    start = at(now);
    target = to;
    startTime = Number(now) || 0;
    duration = Math.max(0, Number(ms) || 0);
  };

  return {
    at,
    done,
    retarget,
    get target() {
      return target;
    },
  };
}
