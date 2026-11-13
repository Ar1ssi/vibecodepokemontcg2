// Design 089 § D5: pose maths for the board effects that fill the gaps the engine reported with
// nothing on screen — a shield over a card whose damage or Knock Out was prevented, the fizzle of
// an attack that does not happen, the motes of a heal, the ring a Pokémon lands with, the pulse
// over the Prize cards, the flare of a GX attack or VSTAR Power. DOM- and GL-free: board-fx.js
// draws them in the three.js board's FX layer from these poses. Every pose takes `t` in [0, 1].
import { seededRandom } from './flow-pose.mjs';

export const BLOCK_MS = 780;
export const FIZZLE_MS = 900;
export const HEAL_MS = 1150;
export const ENTER_MS = 640;
export const PRIZE_PULSE_MS = 950;
export const POWER_FLARE_MS = 1150;
/** A tag ("No damage", "Survived") rises over its card this long. */
export const TAG_MS = 1250;

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeOutBack = (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const lerp = (a, b, t) => a + (b - a) * t;
/** 0 → 1 over [a, b]. */
const span = (t, a, b) => clamp01((t - a) / (b - a));
/** Up over [0, peak], down over [peak, 1]. */
const pulse = (t, peak) => (t <= peak ? span(t, 0, peak) : 1 - span(t, peak, 1));

/**
 * The shield: a card-shaped edge of light (`plate`: its halo and outline) that snaps on oversize
 * and settles on the card, a faint cell pattern on the face, a glint crossing it, a ring thrown
 * off its edge and sparks that fly from where the hit was stopped. Nothing fills the card.
 */
export function blockPose(time) {
  const t = clamp01(time);
  const on = easeOutBack(span(t, 0, 0.16));
  const fade = 1 - easeOutCubic(span(t, 0.38, 1));
  return {
    plate: { scale: lerp(1.22, 1, on), alpha: span(t, 0, 0.06) * fade },
    cells: { scale: lerp(1.15, 1, on), alpha: span(t, 0.03, 0.14) * fade * 0.18 },
    sheen: { sweep: span(t, 0.06, 0.5), alpha: pulse(span(t, 0.06, 0.5), 0.5) * 0.45 },
    ring: { scale: lerp(0.9, 1.45, easeOutCubic(span(t, 0.04, 0.6))), alpha: (1 - span(t, 0.1, 0.62)) * span(t, 0.04, 0.1) },
    sparks: { travel: easeOutCubic(span(t, 0.05, 0.7)), alpha: 1 - span(t, 0.3, 0.75) },
  };
}

/**
 * One spark of the shield: thrown from the card's centre toward `angleDeg` (stage degrees, y down).
 * @returns {{ x: number, y: number, size: number, frame: number, alpha: number }} x/y and size in card heights
 */
export function blockSpark(time, index, count, seed = 1) {
  const rand = seededRandom(seed * 31 + index * 7 + 1);
  const angle = ((index + rand() * 0.6) / Math.max(1, count)) * Math.PI * 2;
  const reach = 0.55 + 0.35 * rand();
  const { sparks } = blockPose(time);
  return {
    x: Math.cos(angle) * reach * sparks.travel,
    y: Math.sin(angle) * reach * sparks.travel,
    size: 0.1 + 0.08 * rand(),
    frame: Math.floor(rand() * 4),
    alpha: sparks.alpha,
  };
}

/**
 * A failed attack: the card sags and shudders; grey puffs leave it and thin out.
 * @returns {{ droop: { scale: number, yawDeg: number }, alpha: number }}
 */
export function fizzlePose(time) {
  const t = clamp01(time);
  const sag = pulse(span(t, 0, 0.55), 0.3);
  return {
    droop: { scale: 1 - 0.05 * sag, yawDeg: Math.sin(t * Math.PI * 7) * 2.2 * (1 - span(t, 0.1, 0.6)) },
    alpha: 1 - span(t, 0.45, 1),
  };
}

/**
 * One puff of the fizzle, drifting up the screen and outward.
 * @returns {{ x: number, y: number, size: number, rotation: number, alpha: number }} card heights
 */
export function fizzlePuff(time, index, count, seed = 1) {
  const rand = seededRandom(seed * 17 + index * 13 + 3);
  const start = (index / Math.max(1, count)) * 0.22;
  const t = span(clamp01(time), start, 1);
  const side = (index % 2 ? 1 : -1) * (0.12 + 0.2 * rand());
  const out = easeOutCubic(t);
  return {
    x: side * (0.4 + out),
    y: -0.05 - 0.34 * out * (0.7 + 0.5 * rand()),
    size: lerp(0.28, 0.6, out) * (0.8 + 0.4 * rand()),
    rotation: (rand() - 0.5) * 80 * out,
    alpha: pulse(t, 0.2) * 0.55,
  };
}

/** A heal: a halo that breathes out round the card (`glow`) and a ring that leaves it. */
export function healPose(time) {
  const t = clamp01(time);
  return {
    glow: { scale: lerp(1, 1.1, easeOutCubic(t)), alpha: pulse(t, 0.25) * 0.9 },
    ring: { scale: lerp(1, 1.5, easeOutCubic(span(t, 0.05, 0.75))), alpha: pulse(span(t, 0.05, 0.8), 0.2) * 0.6 },
  };
}

/**
 * One mote of the heal: it rises off the card, sways, twinkles and thins out.
 * @returns {{ x: number, y: number, rise: number, size: number, frame: number, alpha: number }}
 *   x/y on the card and `rise` off the cloth in card heights
 */
export function healMote(time, index, count, seed = 1) {
  const rand = seededRandom(seed * 23 + index * 11 + 5);
  const start = (index / Math.max(1, count)) * 0.45;
  const t = span(clamp01(time), start, start + 0.55);
  const x0 = (rand() - 0.5) * 0.62;
  const y0 = (rand() - 0.5) * 0.8;
  const sway = Math.sin(t * Math.PI * 2 + rand() * 6) * 0.04;
  return {
    x: x0 + sway,
    y: y0 - 0.12 * t,
    rise: 0.08 + 0.75 * easeOutCubic(t) * (0.6 + 0.6 * rand()),
    size: (0.2 + 0.14 * rand()) * (1 - 0.35 * t),
    // The sheet's first cell is a soft dot, which reads as a smudge on a card: the three glints only.
    frame: 1 + Math.floor(rand() * 3),
    alpha: pulse(t, 0.18) * (0.75 + 0.25 * Math.sin(t * 24 + index)),
  };
}

/**
 * A Pokémon put into play: the card drops the last of its height and settles while a ring rolls
 * out from under it on the cloth.
 */
export function enterPose(time) {
  const t = clamp01(time);
  const land = span(t, 0, 0.22);
  const settle = span(t, 0.22, 0.6);
  return {
    drop: { lift: (1 - easeOutCubic(land)) * 0.16, scale: land < 1 ? lerp(1.06, 0.97, land) : lerp(0.97, 1, easeOutBack(settle)) },
    ring: { scale: lerp(0.75, 1.9, easeOutCubic(span(t, 0.2, 1))), alpha: pulse(span(t, 0.2, 1), 0.12) * 0.75 },
  };
}

/**
 * One dust puff of the landing, pushed out along the cloth from the card's edge.
 * @returns {{ x: number, y: number, size: number, alpha: number }} card heights
 */
export function enterDust(time, index, count, seed = 1) {
  const rand = seededRandom(seed * 29 + index * 5 + 7);
  const angle = ((index + 0.5 * rand()) / Math.max(1, count)) * Math.PI * 2;
  const t = span(clamp01(time), 0.2, 0.2 + 0.6 * (0.7 + 0.3 * rand()));
  const reach = lerp(0.42, 0.85 + 0.3 * rand(), easeOutCubic(t));
  return {
    x: Math.cos(angle) * reach * 0.8,
    y: Math.sin(angle) * reach,
    size: lerp(0.2, 0.46, t),
    alpha: pulse(t, 0.2) * 0.38,
  };
}

/** The Prize pulse: slot `index` of `count` lights after the one before it, a glint crossing it. */
export function prizePulsePose(time, index = 0, count = 1) {
  const start = (index / Math.max(1, count)) * 0.45;
  const t = span(clamp01(time), start, start + 0.55);
  return { alpha: pulse(t, 0.25), sweep: t };
}

/**
 * The GX / VSTAR flare on the attacker: its halo beats twice, its edge lights and holds, and a
 * glint crosses its face with each beat.
 */
export function powerFlarePose(time) {
  const t = clamp01(time);
  const first = pulse(span(t, 0, 0.45), 0.3);
  const second = pulse(span(t, 0.38, 1), 0.3);
  return {
    halo: { scale: 1 + 0.06 * first + 0.04 * second, alpha: Math.max(first, second * 0.85) },
    edge: { alpha: span(t, 0, 0.1) * (1 - span(t, 0.72, 1)) },
    sheen: { sweep: t < 0.42 ? span(t, 0.04, 0.4) : span(t, 0.44, 0.84), alpha: Math.max(pulse(span(t, 0.04, 0.4), 0.5), pulse(span(t, 0.44, 0.84), 0.5)) * 0.65 },
  };
}

/**
 * One star glint of the flare: it leaves the card's edge, rises and turns as it fades.
 * @returns {{ x: number, y: number, rise: number, size: number, rotation: number, frame: number, alpha: number }}
 *   x/y in card widths / heights from its centre, `rise` and `size` in card heights
 */
export function powerGlint(time, index, count, seed = 1) {
  const rand = seededRandom(seed * 37 + index * 19 + 11);
  const start = (index / Math.max(1, count)) * 0.5;
  const t = span(clamp01(time), start, start + 0.45);
  const edge = rand();
  // Glints start on the card's rim: alternately its left / right edges and its top / bottom ones.
  const onSide = index % 2 === 0;
  const sign = index % 4 < 2 ? 1 : -1;
  return {
    x: onSide ? sign * 0.52 : (edge - 0.5) * 0.9,
    y: (onSide ? (edge - 0.5) * 0.9 : sign * 0.52) - 0.1 * easeOutCubic(t),
    rise: 0.05 + 0.5 * easeOutCubic(t),
    size: (0.16 + 0.12 * rand()) * (1 - 0.3 * t),
    rotation: 60 * t * (rand() < 0.5 ? -1 : 1),
    frame: Math.floor(rand() * 4),
    alpha: pulse(t, 0.25),
  };
}

/** A tag over a card: it pops, holds, then rises away. @returns {{ y: number, scale: number, opacity: number }} y in card heights */
export function tagPose(time) {
  const t = clamp01(time);
  return {
    y: -0.08 - 0.3 * easeOutCubic(span(t, 0.45, 1)),
    scale: lerp(0.6, 1, easeOutBack(span(t, 0, 0.18))),
    opacity: span(t, 0, 0.08) * (1 - span(t, 0.7, 1)),
  };
}

/** What the shield's tag says, by why the hit did nothing. */
export function blockTagText({ survived = false, retreat = false } = {}) {
  if (retreat) return "Can't retreat";
  return survived ? 'Survived' : 'No damage';
}

const FAIL_SUBS = {
  prevented: 'Attack prevented',
  condition: 'It does nothing',
  confused: 'Hurt itself in confusion',
  'nothing-to-copy': 'Nothing to copy',
};

/** The banner of an attack that does not happen. */
export function attackFailText(attackName, cause) {
  const title = typeof attackName === 'string' && attackName.trim() !== '' ? attackName.trim() : cause === 'confused' ? 'Confused' : 'Attack';
  return { title, sub: FAIL_SUBS[cause] ?? 'Attack failed' };
}
