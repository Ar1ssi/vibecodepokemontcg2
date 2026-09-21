// Design 022 slice 6: pure text + math for the flow effects (turn banner,
// ability banner, win confetti, lose dim). DOM-free; flow.js drives overlays.

export const BANNER_MS = 1500;
export const EDGE_GLOW_MS = 900;
export const CONFETTI_MS = 3200;
export const CONFETTI_COUNT = 56;
export const DIM_MS = 1600;
export const DIM_PEAK = 0.45;

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInCubic = (t) => t ** 3;

/** @returns {{title:string, sub:string}|null} null when the side is unknown. */
export function turnBannerText(user, number) {
  if (user !== 'self' && user !== 'opp') return null;
  return {
    title: user === 'self' ? 'Your Turn' : "Opponent's Turn",
    sub: Number.isFinite(number) ? `Turn ${number}` : '',
  };
}

/** @returns {{title:string, sub:string}|null} null when the ability has no name. */
export function abilityBannerText(name) {
  const title = typeof name === 'string' ? name.trim() : '';
  return title ? { title, sub: 'Ability' } : null;
}

/**
 * Banner sweep: slides in from the left, holds, exits to the right.
 * `x` is a fraction of the strip width (-1 = one width left of rest).
 */
export function bannerPose(t) {
  const c = clamp01(t);
  if (c < 0.2) return { x: -(1 - easeOutCubic(c / 0.2)), opacity: c / 0.2 };
  if (c < 0.8) return { x: 0, opacity: 1 };
  const out = (c - 0.8) / 0.2;
  return { x: easeInCubic(out), opacity: 1 - out };
}

/** Screen-edge glow: rises fast, falls slowly. */
export function edgeGlowPose(t) {
  const c = clamp01(t);
  return { opacity: c < 0.25 ? c / 0.25 : 1 - (c - 0.25) / 0.75 };
}

/** Deterministic pseudo-random sequence in [0, 1) (mulberry32). */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Confetti piece parameters. `x0` is the start fraction of viewport width,
 * `delay` and `speed` shape when/how fast it falls, `hue` colors it.
 */
export function confettiPieces(count = CONFETTI_COUNT, seed = 1) {
  const rand = seededRandom(seed);
  return Array.from({ length: count }, () => ({
    x0: rand(),
    delay: rand() * 0.35,
    speed: 0.7 + rand() * 0.6,
    drift: (rand() - 0.5) * 0.25,
    spin: (rand() - 0.5) * 1080,
    size: 6 + rand() * 8,
    hue: Math.floor(rand() * 360),
  }));
}

/**
 * Position of one confetti piece at progress `t`, in viewport fractions
 * (`y` 0 = top edge, above it before it enters). Invisible before its delay.
 */
export function confettiPiecePose(piece, t) {
  const local = clamp01((clamp01(t) - piece.delay) / (1 - piece.delay));
  const fall = clamp01(local * piece.speed);
  return {
    x: piece.x0 + piece.drift * local,
    y: -0.05 + 1.15 * fall,
    rotate: piece.spin * local,
    opacity: local <= 0 ? 0 : local < 0.85 ? 1 : 1 - (local - 0.85) / 0.15,
  };
}

/** Lose dim: darkens quickly, holds, then eases back off. */
export function dimPose(t) {
  const c = clamp01(t);
  if (c < 0.25) return { opacity: DIM_PEAK * easeOutCubic(c / 0.25) };
  if (c < 0.7) return { opacity: DIM_PEAK };
  return { opacity: Math.max(0, DIM_PEAK * (1 - (c - 0.7) / 0.3)) };
}
