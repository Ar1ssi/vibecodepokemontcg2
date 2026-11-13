// Design 079 slice 7: element beats every type shares, built from TCG Live's own impact
// textures in the type's palette. The impact flash (the most used drawer) becomes a glow, a
// spiked star, an expanding shock ring and flash lines; a slash keeps the type's tongue for its
// body and gains a bright slash streak along it; an aura is a soft energy ring pulsing round the
// card. A type's own element kit may still replace any of them.
import { centreOf } from '../move-drawers.js';
import { auraPose, flashPose, slashPose } from '../move-poses.mjs';
import { elementKit } from './_kit.js';
import { alphaOf, dissolveOf, emit, rgb01, stageAngle, stageLen, stageOf } from './_emit.js';

const WHITE = Object.freeze([255, 255, 255]);
const TEXTURES = Object.freeze({
  glow: 'TEX_VFX_Gradient_Radial.webp',
  spikes: 'TEX_VFX_ImpactSpikes_White.webp',
  ring: 'TEX_VFX_Impact_Ring.webp',
  lines: 'TEX_VFX_Impact_Flash.webp',
  softRing: 'TEX_VFX_Energy_Ring_Soft.webp',
  thinRing: 'TEX_VFX_Ring_InnerGlow.webp',
  splash: 'T_VFX_Water_Splash_2x2.webp',
  crack: 'TEX_VFX_ElectricCrack_SubUV_2x4.webp',
  shard: 'TEX_VFX_Diamond_Shard.webp',
  star: 'TEX_VFX_M_Star_Flare_Glow.webp',
  glints: 'TEX_VFX_Sparkle_Star_Debris.webp',
  slash: 'T_VFX_Slash_1x4.webp',
  auraRing: 'TEX_VFX_Energy_Ring_Soft.webp',
  innerGlow: 'TEX_VFX_Ring_InnerGlow.webp',
});
/** A Slash_1x4 frame is four times as wide as it is tall. */
const SLASH_ASPECT = 0.25;
const DEG = Math.PI / 180;

/**
 * Design 089: how each material's hit lands. One flash for every type (a glow, a spiked star, a
 * ring, flash lines) made a Fire move and a Rock move meet their target alike; that look stays for
 * blows (fighting, aura, normal). Light blooms, water splashes, electricity cracks, hard things
 * shatter into shards, bright things flare a star, living things scatter glints.
 */
export const CONTACT_STYLE = Object.freeze({
  fire: 'bloom',
  solar: 'bloom',
  dragon: 'bloom',
  psychic: 'bloom',
  ghost: 'bloom',
  dark: 'bloom',
  poison: 'bloom',
  water: 'splash',
  mud: 'splash',
  electric: 'crack',
  buzz: 'crack',
  ice: 'shatter',
  aurora: 'shatter',
  rock: 'shatter',
  ground: 'shatter',
  ancient: 'shatter',
  steel: 'star',
  gem: 'star',
  silver: 'star',
  fairy: 'star',
  stellar: 'star',
  grass: 'scatter',
  petal: 'scatter',
  bug: 'scatter',
  flying: 'scatter',
});
const SHARDS = 7;
const TAU = Math.PI * 2;

const CONTACTS = {
  /** A blow: the spiked star, the ring and the flash lines. */
  spike({ ctx, at, size, s, a, palette, white, dissolve, spin }) {
    emit(ctx, 'sprite', { texture: TEXTURES.glow, at, size: size * 1.2, colour: rgb01(palette.core, 1.2), alpha: a * 0.7, dissolve });
    emit(ctx, 'sprite', { texture: TEXTURES.ring, at, size: size * (0.5 + 1.1 * s), colour: rgb01(palette.hot, 1.3), alpha: a * (1 - s), dissolve });
    emit(ctx, 'sprite', { texture: TEXTURES.spikes, channel: 'a', at, size: size * (0.7 + 0.5 * s), rotation: spin, colour: rgb01(white, 1.8), alpha: a, dissolve });
    emit(ctx, 'sprite', { texture: TEXTURES.lines, channel: 'a', at, size: size * 1.4, rotation: spin * 1.9, colour: rgb01(white, 1.5), alpha: a * 0.8, dissolve });
  },
  /** Light and gas: a soft bloom in the body colour with a hot heart, and one soft ring leaving it. */
  bloom({ ctx, at, size, s, a, palette, dissolve }) {
    emit(ctx, 'sprite', { texture: TEXTURES.glow, at, size: size * (1.5 + 0.4 * s), colour: rgb01(palette.body, 1.3), alpha: a * 0.75, dissolve });
    emit(ctx, 'sprite', { texture: TEXTURES.glow, at, size: size * 0.7, colour: rgb01(palette.core, 1.6), alpha: a * 0.8 * (1 - s), dissolve });
    emit(ctx, 'sprite', { texture: TEXTURES.softRing, at, size: size * (0.7 + 1.2 * s), colour: rgb01(palette.hot, 1.3), alpha: a * (1 - s) ** 1.5, dissolve });
  },
  /** Water: a crown splash played through its four frames over a faint ring. */
  splash({ ctx, at, size, s, a, palette, white, dissolve }) {
    emit(ctx, 'sprite', { texture: TEXTURES.softRing, at, size: size * (0.6 + 1.3 * s), colour: rgb01(palette.body, 1.1), alpha: a * 0.7 * (1 - s), dissolve });
    emit(ctx, 'sprite', { texture: TEXTURES.splash, at: { ...at, z: at.z + size * 0.15 }, size: size * (1.1 + 0.5 * s), frame: Math.min(3, Math.floor(s * 4)), colour: rgb01(palette.hot, 0.9).map((v, i) => v + rgb01(white, 0.7)[i]), alpha: a, dissolve });
  },
  /** Electricity: a crack of lightning stepping through its sheet, a hard small flash. */
  crack({ ctx, at, size, s, a, palette, white, dissolve, spin }) {
    emit(ctx, 'sprite', { texture: TEXTURES.glow, at, size: size * 1.1, colour: rgb01(palette.body, 1.3), alpha: a * 0.6 * (1 - s), dissolve });
    emit(ctx, 'sprite', { texture: TEXTURES.crack, at, size: size * 1.5, frame: Math.min(7, Math.floor(s * 8)), rotation: spin, colour: rgb01(white, 1.2).map((v, i) => v + rgb01(palette.hot, 0.9)[i]), alpha: a, dissolve });
    emit(ctx, 'sprite', { texture: TEXTURES.thinRing, at, size: size * (0.6 + 1.1 * s), colour: rgb01(palette.hot, 1.6), alpha: a * 0.7 * (1 - s), dissolve });
  },
  /** Ice and stone: the ring of a hard hit and shards thrown out of it, each along its own heading. */
  shatter({ ctx, at, size, s, a, palette, dissolve, spin }) {
    emit(ctx, 'sprite', { texture: TEXTURES.ring, at, size: size * (0.5 + 1.0 * s), colour: rgb01(palette.hot, 1.2), alpha: a * (1 - s), dissolve });
    emit(ctx, 'sprite', { texture: TEXTURES.glow, at, size: size * 0.9, colour: rgb01(palette.core, 1.2), alpha: a * 0.5 * (1 - s), dissolve });
    for (let k = 0; k < SHARDS; k += 1) {
      const angle = (k / SHARDS) * TAU + spin * 0.02;
      const reach = size * (0.15 + 0.6 * (1 - (1 - s) ** 2)) * (0.8 + 0.4 * Math.sin(k * 2.7 + spin));
      emit(ctx, 'sprite', {
        texture: TEXTURES.shard,
        at: { x: at.x + Math.cos(angle) * reach, y: at.y + Math.sin(angle) * reach, z: at.z + size * 0.25 * Math.sin(Math.PI * s) },
        size: size * (0.26 - 0.1 * s),
        alignDeg: (angle * 180) / Math.PI,
        colour: rgb01(palette.core, 1.5),
        alpha: a * (1 - s * s),
        dissolve,
      });
    }
  },
  /** Metal, gems and fairy light: an eight-point star opens and turns a little; a thin ring rings out. */
  star({ ctx, at, size, s, a, palette, white, dissolve, spin }) {
    emit(ctx, 'sprite', { texture: TEXTURES.glow, at, size: size * 1.1, colour: rgb01(palette.body, 1.1), alpha: a * 0.5, dissolve });
    emit(ctx, 'sprite', { texture: TEXTURES.star, at, size: size * (0.7 + 0.6 * s), rotation: spin + 25 * s, colour: rgb01(white, 0.9).map((v, i) => v + rgb01(palette.hot, 0.9)[i]), alpha: a * (1 - s * s), dissolve });
    emit(ctx, 'sprite', { texture: TEXTURES.thinRing, at, size: size * (0.7 + 1.2 * s), colour: rgb01(palette.hot, 1.5), alpha: a * 0.8 * (1 - s), dissolve });
  },
  /** Leaves, wings and bugs: a soft ring and a scatter of glints flung wide. */
  scatter({ ctx, at, size, s, a, palette, dissolve, spin }) {
    emit(ctx, 'sprite', { texture: TEXTURES.glow, at, size: size * 1.2, colour: rgb01(palette.body, 1.1), alpha: a * 0.5 * (1 - s), dissolve });
    emit(ctx, 'sprite', { texture: TEXTURES.softRing, at, size: size * (0.6 + 1.2 * s), colour: rgb01(palette.hot, 1.2), alpha: a * 0.8 * (1 - s), dissolve });
    emit(ctx, 'sprite', { texture: TEXTURES.glints, at: { ...at, z: at.z + size * 0.2 * s }, size: size * (0.9 + 1.1 * s), rotation: spin, colour: rgb01(palette.core, 1.8), alpha: a * (1 - s * s), dissolve });
  },
};

/** The impact flash at the target, in its material's contact style. */
function impactFlash(ctx, lane, s, info) {
  const flash = flashPose(s, lane.h, info.params);
  if (!(flash.alpha > 0)) return;
  const c = centreOf(lane, info.params?.target);
  const { palette, key } = info.material;
  const style = Object.hasOwn(CONTACT_STYLE, key) ? CONTACT_STYLE[key] : 'spike';
  CONTACTS[style]({
    ctx,
    at: stageOf(ctx, c.x, c.y),
    size: stageLen(ctx, flash.r) * 2,
    s,
    a: alphaOf(ctx, flash.alpha),
    palette,
    white: palette.white ?? WHITE,
    dissolve: dissolveOf(ctx),
    spin: (info.seed ?? 0) * 47,
  });
}

/**
 * The slash: each arc keeps the type's own tongue (its element or canvas body) and gains a
 * TCG Live slash streak laid along it on screen, where the canvas drew a thin white line.
 */
function slashArc(ctx, lane, s, info) {
  const c = centreOf(lane, info.params?.target);
  const { palette } = info.material;
  const white = palette.white ?? WHITE;
  slashPose(s, lane.h, info.params).forEach((t, index) => {
    if (!(t.length > 0) || !(t.alpha > 0)) return;
    const x = c.x + t.x;
    const y = c.y + t.y;
    info.material.tongue(
      ctx,
      { x, y, angleDeg: t.angleDeg, length: t.length, width: t.width, time: info.time, seed: (info.seed ?? 0) + index * 2.7 },
      { alpha: t.alpha, hot: 1 }
    );
    const mid = 0.5 * t.length;
    emit(ctx, 'sprite', {
      texture: TEXTURES.slash,
      channel: 'a',
      at: stageOf(ctx, x + Math.cos(t.angleDeg * DEG) * mid, y + Math.sin(t.angleDeg * DEG) * mid),
      size: stageLen(ctx, t.length) * 1.3,
      aspect: SLASH_ASPECT * 1.6,
      alignDeg: stageAngle(ctx, t.angleDeg),
      frame: 3 - (index % 2),
      colour: rgb01(palette.hot, 0.6).map((v, i) => v + rgb01(white, 1.2)[i]),
      alpha: alphaOf(ctx, t.alpha * (0.5 + 0.5 * t.edge)),
      dissolve: dissolveOf(ctx),
    });
  });
}

/** The aura: a soft glow and an energy ring breathing round the card. */
function aura(ctx, lane, s, info) {
  const pose = auraPose(s, lane.h, { ...info.params, beatMs: info.beatMs });
  if (!(pose.alpha > 0)) return;
  const c = centreOf(lane, info.params?.target);
  const at = stageOf(ctx, c.x, c.y);
  const size = stageLen(ctx, pose.r) * 2.7;
  const { palette } = info.material;
  const a = alphaOf(ctx, pose.alpha);
  const breath = 1 + 0.06 * Math.sin((info.time ?? 0) * 6);
  emit(ctx, 'sprite', { texture: TEXTURES.glow, at, size: size * 1.3, colour: rgb01(palette.body, 1), alpha: a * 0.45 });
  emit(ctx, 'sprite', { texture: TEXTURES.innerGlow, at, size: size * breath, colour: rgb01(palette.body, 1.2), alpha: a * 0.5 });
  emit(ctx, 'sprite', { texture: TEXTURES.auraRing, at, size: size * 1.05 * breath, colour: rgb01(palette.hot, 1.4), alpha: a * 0.8 });
}

export const sharedBeats = elementKit({ beats: { impactFlash, slashArc, aura } });
