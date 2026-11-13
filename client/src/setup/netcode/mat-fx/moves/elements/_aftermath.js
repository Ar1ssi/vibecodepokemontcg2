// Design 089 § D7: what a move leaves on the card it struck. Every move used to end the same way:
// the same flash, then nothing. For three quarters of a second after contact the struck card now
// carries the element that hit it — embers and soot, drips, arcs crawling its edges, falling
// leaves, settling dust, frost, sparks, a bend in the air, curling wisps, a gust. It plays under
// and after the TCG Live impact (which stays the hit itself), so a Fire move and a Water move no
// longer part ways only in colour.
//
// One function per material group: `(ctx, card, s, info)` with `card = { x, y, w, h }` in the
// pass's stage px, `s` in [0, 1) and `info = { palette, time, seed }`. Everything is placed by
// `s`, the seed and the scene time alone, so a frozen preview stands still. Element-only: the
// player calls these on a lit GPU pass.
import { boltSegments } from '../../../../board3d/fx/elements/bolt.mjs';
import { emit, rgb01 } from './_emit.js';

const TAU = Math.PI * 2;
/** Residue rides just over the struck card's face. */
const FACE_Z = 6;

const GLOW = 'TEX_VFX_Gradient_Radial.webp';
const EMBER = 'TEX_VFX_Gradient_Radial_Small.webp';
const SPARKLE = 'TEX_VFX_Sparkle_2x2.webp';
const STAR = 'T_VFX_Star_Bright_2x2.webp';
const FOUR_POINT = 'TEX_VFX_Star_FourPoint_Light.webp';
const LEAVES = 'T_VFX_Leaves_2x2.webp';
const PETALS = 'T_VFX_Fairy_Petal_Soft_2x2.webp';
const FLAKE = 'TEX_VFX_Flake_Sharp.webp';
const BOKEH = 'TEX_VFX_Circle_Bokeh_2x2.webp';
const SWIPE = 'T_VFX_Slash02_1x4.webp';
const CLOUD = 'TEX_VFX_Cloud_Round.webp';
const THIN_RING = 'TEX_VFX_Ring_InnerGlow.webp';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** In over the first 15 %, out with a soft tail. */
const fadeOf = (s) => (s < 0.15 ? s / 0.15 : (1 - s) ** 1.5);
/** A repeatable 0–1 number for item `index` of an effect seeded `seed`. */
const rand = (seed, index, salt = 0) => {
  const x = Math.sin(seed * 12.9898 + index * 78.233 + salt * 37.719) * 43758.5453;
  return x - Math.floor(x);
};
/** Item `index`'s own progress: it starts `spread` late in turn and lives `life` of the beat. */
const staggered = (s, index, count, spread = 0.4, life = 0.6) => clamp01((s - (index / Math.max(1, count)) * spread) / life);
const bell = (t) => Math.sin(Math.PI * clamp01(t));

const sprite = (ctx, texture, x, y, z, size, colour, alpha, extra = {}) =>
  emit(ctx, 'sprite', { texture, at: { x, y, z }, size, colour, alpha: clamp01(alpha), ...extra });

/** A point on the card's rim: `u` in [0, 1) runs clockwise from its top-left corner. */
const rimPoint = (card, u) => {
  const t = (((u % 1) + 1) % 1) * 4;
  const side = Math.floor(t);
  const f = t - side;
  const hw = card.w / 2;
  const hh = card.h / 2;
  if (side === 0) return { x: card.x - hw + card.w * f, y: card.y - hh };
  if (side === 1) return { x: card.x + hw, y: card.y - hh + card.h * f };
  if (side === 2) return { x: card.x + hw - card.w * f, y: card.y + hh };
  return { x: card.x - hw, y: card.y + hh - card.h * f };
};

/** Fire, solar, dragon: embers lift off the card and soot rolls up from it. */
function embers(ctx, card, s, { palette, seed, time }) {
  const hot = rgb01(palette.hot, 2.3);
  for (let i = 0; i < 9; i += 1) {
    const t = staggered(s, i, 9, 0.45, 0.55);
    if (!(t > 0) || t >= 1) continue;
    const x0 = (rand(seed, i) - 0.5) * card.w * 0.9;
    const sway = Math.sin(time * 5 + i * 1.7) * card.h * 0.03;
    sprite(ctx, EMBER, card.x + x0 + sway, card.y + (rand(seed, i, 1) - 0.5) * card.h * 0.7, FACE_Z + t * card.h * (0.35 + 0.4 * rand(seed, i, 2)), card.h * (0.05 - 0.025 * t), hot, bell(t));
  }
  for (let i = 0; i < 2; i += 1) {
    const t = staggered(s, i, 2, 0.3, 0.7);
    if (!(t > 0) || t >= 1) continue;
    emit(ctx, 'smoke', {
      at: { x: card.x + (i ? 0.2 : -0.18) * card.w, y: card.y - card.h * 0.1, z: FACE_Z + card.h * (0.1 + 0.4 * t) },
      radius: card.h * (0.16 + 0.14 * t),
      alpha: 0.5 * bell(t),
      seed: seed + i * 3.1,
      tint: [0.1, 0.085, 0.08],
      light: rgb01(palette.hot, 0.7),
      density: 0.5,
      rise: 0.6,
    });
  }
}

/** Water, mud: the card drips, and a cool mist hangs on it for a moment. */
function drips(ctx, card, s, { palette, seed }) {
  const drop = { deep: rgb01(palette.deep), body: rgb01(palette.body), hot: rgb01(palette.hot), core: rgb01(palette.core) };
  sprite(ctx, GLOW, card.x, card.y, FACE_Z, card.h * 1.1, rgb01(palette.body, 0.8), 0.16 * fadeOf(s));
  for (let i = 0; i < 7; i += 1) {
    const t = staggered(s, i, 7, 0.5, 0.5);
    if (!(t > 0) || t >= 1) continue;
    const x = card.x + (rand(seed, i) - 0.5) * card.w * 0.85;
    // Each drop runs down the face, gathers at the near edge and falls to the cloth.
    const run = Math.min(1, t / 0.6);
    const fall = clamp01((t - 0.6) / 0.4);
    emit(ctx, 'waterDrop', {
      at: { x, y: card.y - card.h * 0.2 + card.h * 0.7 * run * run + card.h * 0.06 * fall, z: FACE_Z * (1 - fall) + 1 },
      radius: card.h * (0.03 + 0.015 * rand(seed, i, 1)) * (1 - 0.4 * fall),
      alpha: 0.9 * (1 - fall * fall),
      seed: seed + i,
      palette: drop,
    });
  }
}

/** Poison: bubbles swell out of the card and burst. */
function bubbles(ctx, card, s, { palette, seed }) {
  const body = rgb01(palette.hot, 1.3);
  sprite(ctx, GLOW, card.x, card.y, FACE_Z, card.h * 1.05, rgb01(palette.body, 0.9), 0.18 * fadeOf(s));
  for (let i = 0; i < 8; i += 1) {
    const t = staggered(s, i, 8, 0.5, 0.5);
    if (!(t > 0) || t >= 1) continue;
    // A bubble grows as it rises and is gone at its fullest: a burst, not a fade.
    const size = card.h * (0.05 + 0.09 * rand(seed, i, 1)) * (0.4 + 0.6 * t);
    sprite(ctx, BOKEH, card.x + (rand(seed, i) - 0.5) * card.w * 0.8, card.y + (rand(seed, i, 2) - 0.5) * card.h * 0.7, FACE_Z + t * card.h * 0.3, size, body, t < 0.9 ? 0.8 : 0.8 * (1 - (t - 0.9) / 0.1), { frame: i % 4 });
  }
}

/** Electric, buzz: arcs crawl the card's edges and spit sparks, re-struck 14 times a second. */
function arcs(ctx, card, s, { palette, seed, time }) {
  const fade = fadeOf(s);
  const strike = Math.floor(time * 14);
  const hot = rgb01(palette.core ?? palette.hot, 2.4);
  const glow = rgb01(palette.body, 1.4);
  for (let i = 0; i < 3; i += 1) {
    const from = rand(seed + strike, i);
    const span = 0.1 + 0.12 * rand(seed + strike, i, 1);
    const points = [];
    for (let k = 0; k <= 5; k += 1) {
      const rim = rimPoint(card, from + (span * k) / 5);
      const jag = (rand(seed + strike, i * 7 + k, 2) - 0.5) * card.h * 0.07;
      points.push({ x: rim.x + jag, y: rim.y + jag * 0.6, z: FACE_Z + 2 });
    }
    for (const segment of boltSegments(points, { width: card.h * 0.012, alpha: 0.9 * fade, hot, glow, seed: seed + i })) emit(ctx, 'bolt', segment);
  }
  for (let i = 0; i < 5; i += 1) {
    const rim = rimPoint(card, rand(seed + strike, i, 3));
    sprite(ctx, SPARKLE, rim.x, rim.y, FACE_Z + 4, card.h * (0.08 + 0.06 * rand(seed + strike, i, 4)), hot, fade * 0.9, { frame: 1 + (i % 3) });
  }
}

/** Grass and petal: leaves the hit threw up come down round the card, turning. */
function leaves(texture, channel, tint) {
  return (ctx, card, s, { palette, seed, time }) => {
    const colour = tint(palette);
    for (let i = 0; i < 7; i += 1) {
      const t = staggered(s, i, 7, 0.35, 0.65);
      if (!(t > 0) || t >= 1) continue;
      const side = rand(seed, i) - 0.5;
      const sway = Math.sin(time * 3 + i * 2.1) * card.h * 0.06;
      sprite(ctx, texture, card.x + side * card.w * 1.3 + sway, card.y + (rand(seed, i, 1) - 0.5) * card.h * 0.9, FACE_Z + card.h * 0.45 * (1 - t) ** 1.4, card.h * (0.1 + 0.05 * rand(seed, i, 2)), colour, bell(Math.min(1, t * 1.6)), {
        frame: i % 4,
        channel,
        blend: 'over',
        rotation: (time * 90 + i * 53) * (side < 0 ? -1 : 1),
      });
    }
  };
}

/** Rock, ground, ancient: dust rolls out along the cloth and grit skips off it. */
function dust(ctx, card, s, { palette, seed }) {
  const tint = rgb01(palette.body, 0.75);
  for (let i = 0; i < 4; i += 1) {
    const t = staggered(s, i, 4, 0.2, 0.8);
    if (!(t > 0) || t >= 1) continue;
    const angle = (i / 4) * TAU + rand(seed, i) * 0.8;
    const reach = card.h * (0.45 + 0.35 * t);
    emit(ctx, 'smoke', {
      at: { x: card.x + Math.cos(angle) * reach * 0.8, y: card.y + Math.sin(angle) * reach, z: 3 + card.h * 0.06 * t },
      radius: card.h * (0.14 + 0.14 * t),
      alpha: 0.42 * bell(t),
      seed: seed + i * 2.3,
      tint,
      light: rgb01(palette.hot, 0.9),
      density: 0.45,
      rise: 0.2,
    });
  }
  for (let i = 0; i < 6; i += 1) {
    const t = staggered(s, i, 6, 0.15, 0.6);
    if (!(t > 0) || t >= 1) continue;
    const angle = rand(seed, i, 1) * TAU;
    const reach = card.h * (0.5 + 0.5 * t);
    // Two skips: a high one, then a low one.
    const hop = Math.abs(Math.sin(t * Math.PI * 2)) * (1 - t) * card.h * 0.22;
    emit(ctx, 'debris', {
      at: { x: card.x + Math.cos(angle) * reach * 0.8, y: card.y + Math.sin(angle) * reach, z: 2 + hop },
      size: card.h * (0.018 + 0.016 * rand(seed, i, 2)),
      alpha: 1 - t * t,
      seed: seed + i,
      spin: t * 9 + i,
      colour: rgb01(palette.deep, 1.1),
      light: rgb01(palette.hot, 1),
    });
  }
}

/** Ice, aurora: a cold breath hangs on the card and flakes drift down through it. */
function frost(ctx, card, s, { palette, seed, time }) {
  const fade = fadeOf(s);
  emit(ctx, 'smoke', {
    at: { x: card.x, y: card.y + card.h * 0.1, z: FACE_Z + card.h * 0.08 },
    radius: card.h * (0.42 + 0.12 * s),
    alpha: 0.3 * fade,
    seed,
    tint: [0.72, 0.86, 0.95],
    light: rgb01(palette.core ?? palette.hot, 1.1),
    density: 0.3,
    rise: 0.1,
  });
  for (let i = 0; i < 8; i += 1) {
    const t = staggered(s, i, 8, 0.4, 0.6);
    if (!(t > 0) || t >= 1) continue;
    const sway = Math.sin(time * 2.4 + i * 1.9) * card.h * 0.04;
    sprite(ctx, FLAKE, card.x + (rand(seed, i) - 0.5) * card.w * 1.1 + sway, card.y + (rand(seed, i, 1) - 0.5) * card.h * 0.9, FACE_Z + card.h * 0.38 * (1 - t), card.h * (0.05 + 0.04 * rand(seed, i, 2)), rgb01(palette.core ?? palette.hot, 1.7), bell(t), { rotation: time * 40 + i * 61 });
  }
}

/** Steel, gem, silver: the blow rings off the card and sparks skitter away. */
function sparks(ctx, card, s, { palette, seed }) {
  const bright = rgb01(palette.core ?? palette.hot, 2.2);
  sprite(ctx, THIN_RING, card.x, card.y, FACE_Z + 1, card.h * (1.15 + 0.45 * s), rgb01(palette.hot, 1.4), 0.7 * (1 - s) ** 2);
  for (let i = 0; i < 9; i += 1) {
    const t = staggered(s, i, 9, 0.2, 0.55);
    if (!(t > 0) || t >= 1) continue;
    const angle = rand(seed, i) * TAU;
    const reach = card.h * (0.25 + 0.6 * (1 - (1 - t) ** 2));
    // Thrown up, pulled down: a spark's arc.
    const arc = card.h * 0.3 * (t - t * t) * 4 * (0.5 + 0.5 * rand(seed, i, 1));
    sprite(ctx, FOUR_POINT, card.x + Math.cos(angle) * reach, card.y + Math.sin(angle) * reach, FACE_Z + arc, card.h * (0.07 + 0.05 * rand(seed, i, 2)) * (1 - 0.5 * t), bright, 1 - t * t, { channel: 'a', rotation: t * 140 });
  }
}

/** Psychic, stellar: the air over the card bends and slowly lets go; motes rise through it. */
function bend(ctx, card, s, { palette, seed, time }) {
  const fade = fadeOf(s);
  emit(ctx, 'lens', {
    at: { x: card.x, y: card.y, z: FACE_Z + card.h * 0.1 },
    radius: card.h * (0.42 + 0.18 * s),
    alpha: 0.8 * fade,
    seed,
    spin: time * 1.6,
    strength: 0.55 * (1 - s),
    rings: 0.35 * fade,
    body: rgb01(palette.body),
    hot: rgb01(palette.hot),
  });
  for (let i = 0; i < 6; i += 1) {
    const t = staggered(s, i, 6, 0.4, 0.6);
    if (!(t > 0) || t >= 1) continue;
    const angle = (i / 6) * TAU + time * 1.2;
    sprite(ctx, EMBER, card.x + Math.cos(angle) * card.w * 0.5, card.y + Math.sin(angle) * card.h * 0.42, FACE_Z + card.h * 0.5 * t, card.h * 0.045, rgb01(palette.hot, 2), bell(t));
  }
}

/** Fairy: twinkles open and close round the card as a few petals of light drift off. */
function twinkles(ctx, card, s, { palette, seed, time }) {
  const pink = rgb01(palette.hot, 1.9);
  sprite(ctx, GLOW, card.x, card.y, FACE_Z, card.h * 1.15, rgb01(palette.body, 0.9), 0.16 * fadeOf(s));
  for (let i = 0; i < 9; i += 1) {
    const t = staggered(s, i, 9, 0.5, 0.5);
    if (!(t > 0) || t >= 1) continue;
    const rim = rimPoint(card, rand(seed, i));
    const out = 1 + 0.25 * rand(seed, i, 1);
    sprite(ctx, STAR, card.x + (rim.x - card.x) * out, card.y + (rim.y - card.y) * out, FACE_Z + card.h * 0.12 * t, card.h * (0.1 + 0.08 * rand(seed, i, 2)) * bell(t), pink, bell(t), { frame: i % 4, rotation: time * 30 + i * 40 });
  }
}

/** Ghost, dark: wisps curl up off the card's edges and thin out. */
function wisps(ctx, card, s, { palette, seed }) {
  for (let i = 0; i < 5; i += 1) {
    const t = staggered(s, i, 5, 0.35, 0.65);
    if (!(t > 0) || t >= 1) continue;
    const rim = rimPoint(card, rand(seed, i));
    const curl = Math.sin(t * Math.PI * 1.5 + i) * card.h * 0.08;
    emit(ctx, 'smoke', {
      at: { x: rim.x + curl, y: rim.y - card.h * 0.12 * t, z: FACE_Z + card.h * 0.42 * t },
      radius: card.h * (0.1 + 0.1 * t),
      alpha: 0.6 * bell(t),
      seed: seed + i * 1.7,
      tint: rgb01(palette.deep, 1),
      light: rgb01(palette.hot, 1.2),
      density: 0.6,
      rise: 0.7,
      glow: 0.25,
    });
  }
}

/** Flying, silver: the wind that struck keeps circling the card for a turn. */
function gust(ctx, card, s, { palette, seed, time }) {
  const fade = fadeOf(s);
  const white = rgb01(palette.core ?? palette.hot, 1.4);
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * TAU + time * 4.5 + seed;
    const reach = card.h * (0.55 + 0.12 * s);
    sprite(ctx, SWIPE, card.x + Math.cos(angle) * reach * 0.85, card.y + Math.sin(angle) * reach, FACE_Z + card.h * (0.1 + 0.06 * i), card.h * 0.7, white, 0.55 * fade, {
      channel: 'a',
      aspect: 0.3,
      frame: i % 4,
      alignDeg: (angle * 180) / Math.PI + 90,
    });
  }
  for (let i = 0; i < 4; i += 1) {
    const t = staggered(s, i, 4, 0.3, 0.7);
    if (!(t > 0) || t >= 1) continue;
    const angle = rand(seed, i) * TAU;
    sprite(ctx, CLOUD, card.x + Math.cos(angle) * card.h * (0.4 + 0.5 * t), card.y + Math.sin(angle) * card.h * (0.4 + 0.5 * t), 4 + card.h * 0.1 * t, card.h * (0.22 + 0.2 * t), white, 0.22 * bell(t), { rotation: i * 70 });
  }
}

/** Fighting, aura, normal: the blow's dust kicks out along the cloth and stars pop off the corners. */
function blow(ctx, card, s, { palette, seed }) {
  const bright = rgb01(palette.hot, 1.9);
  for (let i = 0; i < 5; i += 1) {
    const t = staggered(s, i, 5, 0.15, 0.7);
    if (!(t > 0) || t >= 1) continue;
    const angle = (i / 5) * TAU + rand(seed, i) * 0.9;
    const reach = card.h * (0.5 + 0.45 * (1 - (1 - t) ** 2));
    sprite(ctx, CLOUD, card.x + Math.cos(angle) * reach * 0.8, card.y + Math.sin(angle) * reach, 3 + card.h * 0.05 * t, card.h * (0.2 + 0.22 * t), [0.8, 0.76, 0.7], 0.3 * bell(t), { rotation: i * 63 });
  }
  for (let i = 0; i < 4; i += 1) {
    const t = staggered(s, i, 4, 0.25, 0.45);
    if (!(t > 0) || t >= 1) continue;
    const corner = rimPoint(card, i / 4 + 0.02 * rand(seed, i));
    sprite(ctx, FOUR_POINT, card.x + (corner.x - card.x) * (1 + 0.3 * t), card.y + (corner.y - card.y) * (1 + 0.3 * t), FACE_Z + card.h * 0.1 * t, card.h * 0.16 * bell(t), bright, bell(t), { channel: 'a', rotation: t * 90 + i * 45 });
  }
}

const greenLeaves = leaves(LEAVES, 'rgba', () => [1, 1, 1]);
const lightPetals = leaves(PETALS, 'a', (palette) => rgb01(palette.body, 1.2));

/** What each material leaves on the card it struck. A material missing here leaves nothing. */
export const AFTERMATHS = Object.freeze({
  fire: embers,
  solar: embers,
  dragon: embers,
  water: drips,
  mud: drips,
  poison: bubbles,
  electric: arcs,
  buzz: arcs,
  grass: greenLeaves,
  bug: greenLeaves,
  petal: lightPetals,
  rock: dust,
  ground: dust,
  ancient: dust,
  ice: frost,
  aurora: frost,
  steel: sparks,
  gem: sparks,
  silver: sparks,
  psychic: bend,
  stellar: bend,
  fairy: twinkles,
  ghost: wisps,
  dark: wisps,
  flying: gust,
  fighting: blow,
  aura: blow,
  normal: blow,
});

/** How long the aftermath runs, and how long after contact it starts (the contact frame is the hit's own). */
export const AFTERMATH_MS = 760;
export const AFTERMATH_DELAY_MS = 70;

/** The aftermath of material `key`, or null. */
export const aftermathFor = (key) => (Object.hasOwn(AFTERMATHS, key) ? AFTERMATHS[key] : null);
