// Design 068: the seeded random stream every attack-impact effect draws from, so both seats and
// a frozen-time capture see the same particles. DOM-free.

const mix = (seed, key) => {
  let h = (seed ^ Math.imul(key + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
};

/**
 * A mulberry32 stream. `next()` is uniform in [0, 1); `fork(key)` is an independent stream
 * that does not advance this one, so one system's draws never shift another's.
 */
export function createRandom(seed = 1) {
  let state = (Math.trunc(Number(seed)) || 0) >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const origin = state;
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    signed: () => next() * 2 - 1,
    fork: (key) => createRandom(mix(origin, Math.trunc(Number(key)) || 0)),
  };
}

/** A uniformly random unit vector. */
export function randomUnit(random) {
  const z = random.signed();
  const angle = random.next() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return [r * Math.cos(angle), r * Math.sin(angle), z];
}
