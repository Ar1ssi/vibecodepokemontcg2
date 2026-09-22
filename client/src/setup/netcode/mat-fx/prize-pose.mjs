// Design 024 slice 4/3: pure math for the prize-claim burst. Taking a Prize is
// the game's scoreboard moment and had no effect at all before this; the burst
// fires at the claimer's prize zone, one spark per card taken.

export const PRIZE_CLAIM_MS = 900;
export const PRIZE_MAX_SPARKS = 6;

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;

/**
 * How many sparks to draw for a claim. One per card taken, capped so a
 * multi-prize Knockout cannot flood the overlay; 0 (or junk) draws nothing.
 */
export function prizeSparkCount(count) {
  const n = Number.parseInt(String(count ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(PRIZE_MAX_SPARKS, n);
}

/**
 * Evenly spaced launch angles (radians) for `count` sparks, starting upward
 * so a single-prize claim always throws its spark straight up.
 */
export function prizeSparkAngles(count) {
  if (count <= 0) return [];
  const start = -Math.PI / 2;
  return Array.from({ length: count }, (_, i) => start + (i * 2 * Math.PI) / count);
}

/** One spark: flies out along its angle, decelerating, and fades over the tail. */
export function prizeSparkPose(angle, t, { distance = 70 } = {}) {
  const c = clamp01(t);
  const out = easeOutCubic(c);
  return {
    x: Math.cos(angle) * distance * out,
    y: Math.sin(angle) * distance * out,
    scale: 1.1 - 0.6 * out,
    opacity: c < 0.15 ? c / 0.15 : Math.max(0, 1 - (c - 0.15) / 0.85),
  };
}

/** The halo behind the sparks: a quick bloom that settles back down. */
export function prizeHaloPose(t) {
  const c = clamp01(t);
  const bell = Math.sin(clamp01(c / 0.6) * Math.PI);
  return { scale: 0.6 + 0.9 * easeOutCubic(c), opacity: bell };
}
