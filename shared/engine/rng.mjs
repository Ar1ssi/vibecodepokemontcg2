/**
 * @file Seeded PRNG for server-authoritative netcode (mulberry32).
 * Pure and deterministic (Invariant 6).
 */

/**
 * Maps a string or number seed to an unsigned 32-bit integer.
 *
 * @param {string|number} seed
 * @returns {number}
 */
function toUint32Seed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return seed >>> 0 || 1;
  }
  const str = String(seed ?? 'ptcg-default-seed');
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

/**
 * Creates a deterministic seeded mulberry32 PRNG.
 *
 * @param {string|number} seed
 * @param {number} [initialCursor=0]
 * @returns {{
 *   next: () => number,
 *   int: (n: number) => number,
 *   shuffle: <T>(array: T[]) => T[],
 *   readonly cursor: number,
 *   advance: (steps: number) => void
 * }}
 */
export function createRng(seed = 0, initialCursor = 0) {
  const initialSeed = toUint32Seed(seed);
  let s = initialSeed;
  let cursor = 0;

  /**
   * Produces next pseudo-random float in [0, 1).
   * @returns {number}
   */
  function next() {
    cursor++;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Produces next pseudo-random integer in [0, n - 1].
   *
   * @param {number} n
   * @returns {number}
   */
  function int(n) {
    if (typeof n !== 'number' || n <= 1) return 0;
    return Math.floor(next() * n);
  }

  /**
   * Pure Fisher-Yates shuffle. Returns a new shuffled array without mutating the input.
   *
   * @template T
   * @param {T[]} array
   * @returns {T[]}
   */
  function shuffle(array) {
    if (!Array.isArray(array)) return [];
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = int(i + 1);
      const temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy;
  }

  /**
   * Advances the generator by a given number of steps.
   *
   * @param {number} steps
   */
  function advance(steps) {
    for (let i = 0; i < steps; i++) {
      next();
    }
  }

  if (initialCursor > 0) {
    advance(initialCursor);
  }

  return {
    next,
    int,
    shuffle,
    get cursor() {
      return cursor;
    },
    advance,
  };
}

/**
 * Creates an RNG source capable of consuming relayed randomness (e.g. client shuffle indices,
 * coin flip faces) for shadow mode, falling back to deterministic mulberry32.
 *
 * @param {string|number} [seed=0]
 * @param {number} [initialCursor=0]
 */
export function createRelayedRng(seed = 0, initialCursor = 0) {
  const base = createRng(seed, initialCursor);
  const queuedShuffles = [];
  const queuedCoins = [];

  return {
    queueShuffle(indices) {
      if (Array.isArray(indices)) {
        queuedShuffles.push([...indices]);
      }
    },
    queueCoin(coin) {
      queuedCoins.push(coin);
    },
    next() {
      if (queuedCoins.length > 0) {
        const c = queuedCoins.shift();
        return c === 'heads' || c === true ? 0.25 : 0.75;
      }
      return base.next();
    },
    int(n) {
      if (queuedCoins.length > 0) {
        const c = queuedCoins.shift();
        return c === 'heads' || c === true
          ? 0
          : Math.min(1, Math.max(0, n - 1));
      }
      return base.int(n);
    },
    shuffle(array) {
      if (!Array.isArray(array)) return [];
      if (queuedShuffles.length > 0) {
        const indices = queuedShuffles.shift();
        return indices.map((i) => array[i]).filter((c) => c !== undefined);
      }
      return base.shuffle(array);
    },
    get cursor() {
      return base.cursor;
    },
    advance(steps) {
      base.advance(steps);
    },
  };
}
