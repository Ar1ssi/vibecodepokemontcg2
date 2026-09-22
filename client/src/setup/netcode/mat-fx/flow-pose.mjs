// Design 022 slice 6: pure text + math for the flow effects (turn banner,
// ability banner, win confetti, lose dim). DOM-free; flow.js drives overlays.

export const BANNER_MS = 1600;
export const ABILITY_TAG_MS = 1500;
export const EDGE_GLOW_MS = 900;
export const CONFETTI_MS = 3600;
export const CONFETTI_COUNT = 72;
export const DIM_MS = 1600;
export const DIM_PEAK = 0.45;

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInCubic = (t) => t ** 3;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

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
 * Design 026: the tag names the ability itself when the card has exactly one
 * (the event only carries the Pokémon's name); otherwise the Pokémon's name.
 * @returns {{title:string, sub:string}|null}
 */
export function abilityTagText(card, eventName) {
  const abilities = Array.isArray(card?.abilities) ? card.abilities : [];
  const sole = abilities.length === 1 ? abilities[0]?.name : null;
  if (typeof sole === 'string' && sole.trim()) return { title: sole.trim(), sub: 'Ability' };
  return abilityBannerText(eventName);
}

/**
 * Box for the ability tag: centered over the card's top edge, at least
 * `minWidth` wide, kept inside the viewport.
 */
export function abilityTagRect(cardRect, viewport, { minWidth = 170, height = 46 } = {}) {
  const width = Math.min(viewport.width, Math.max(minWidth, cardRect.width * 2.2));
  const centerX = cardRect.left + cardRect.width / 2;
  const left = Math.max(0, Math.min(viewport.width - width, centerX - width / 2));
  const top = Math.max(0, Math.min(viewport.height - height, cardRect.top + cardRect.height * 0.12 - height / 2));
  return { left, top, width, height };
}

/** Ability tag: pops in with overshoot, holds, then floats up and fades. */
export function abilityTagPose(t) {
  const c = clamp01(t);
  if (c < 0.12) return { y: 0, scale: 0.6 + 0.55 * easeOutCubic(c / 0.12), opacity: c / 0.12 };
  if (c < 0.2) return { y: 0, scale: 1.15 - 0.15 * ((c - 0.12) / 0.08), opacity: 1 };
  if (c < 0.8) return { y: 0, scale: 1, opacity: 1 };
  const out = (c - 0.8) / 0.2;
  return { y: -14 * easeOutCubic(out), scale: 1, opacity: (1 - c) / 0.2 };
}

/** Light sweep across a banner/card: `x` runs -1 → 1 (fraction of width). */
export function sweepPose(t, { start = 0.15, end = 0.55 } = {}) {
  const c = clamp01(t);
  const local = clamp01((c - start) / (end - start));
  return { x: -1 + 2 * easeInOutCubic(local), opacity: local > 0 && local < 1 ? 1 : 0 };
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
 * Confetti piece parameters. A third fall from the top edge; the rest fire
 * from the two bottom corners (`cannon`) and arc back down. `x0` is the start
 * fraction of viewport width, `delay`/`speed` shape timing, `hue` colours it,
 * `flutter` drives the 3D flip and sideways sway.
 */
export function confettiPieces(count = CONFETTI_COUNT, seed = 1) {
  const rand = seededRandom(seed);
  return Array.from({ length: count }, (_, i) => {
    const cannon = i % 3 === 0 ? 'top' : i % 3 === 1 ? 'left' : 'right';
    return {
      cannon,
      x0: cannon === 'top' ? rand() : cannon === 'left' ? 0 : 0.999,
      delay: cannon === 'top' ? 0.1 + rand() * 0.25 : rand() * 0.08,
      speed: 0.7 + rand() * 0.6,
      drift: (rand() - 0.5) * 0.25,
      spin: (rand() - 0.5) * 1080,
      size: 6 + rand() * 8,
      hue: Math.floor(rand() * 360),
      vx: 0.25 + rand() * 0.35,
      vy: 1.05 + rand() * 0.3,
      flutter: 2 + rand() * 4,
    };
  });
}

/**
 * Position of one confetti piece at progress `t`, in viewport fractions
 * (`y` 0 = top edge). Top pieces fall with a sway; cannon pieces follow a
 * ballistic arc. `flip` (deg) is the 3D tumble. Invisible before its delay.
 */
export function confettiPiecePose(piece, t) {
  const local = clamp01((clamp01(t) - piece.delay) / (1 - piece.delay));
  const flutter = piece.flutter ?? 3;
  const sway = Math.sin(local * Math.PI * flutter) * 0.02;
  const opacity = local <= 0 ? 0 : local < 0.85 ? 1 : 1 - (local - 0.85) / 0.15;
  const flip = Math.sin(local * Math.PI * flutter * 2) * 180;
  if (piece.cannon === 'left' || piece.cannon === 'right') {
    const dir = piece.cannon === 'left' ? 1 : -1;
    const time = local * 2.6;
    return {
      x: piece.x0 + dir * piece.vx * (1 - Math.exp(-time * 0.9)) + sway,
      y: 1.02 - piece.vy * time + 0.48 * time * time,
      rotate: piece.spin * local,
      flip,
      opacity,
    };
  }
  const fall = clamp01(local * piece.speed * 1.25);
  return {
    x: piece.x0 + piece.drift * local + sway,
    y: -0.05 + 1.15 * (0.35 * fall + 0.65 * fall * fall),
    rotate: piece.spin * local,
    flip,
    opacity,
  };
}

/** Lose dim: darkens quickly, holds, then eases back off. */
export function dimPose(t) {
  const c = clamp01(t);
  if (c < 0.25) return { opacity: DIM_PEAK * easeOutCubic(c / 0.25) };
  if (c < 0.7) return { opacity: DIM_PEAK };
  return { opacity: Math.max(0, DIM_PEAK * (1 - (c - 0.7) / 0.3)) };
}
