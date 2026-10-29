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
  slash: 'T_VFX_Slash_1x4.webp',
  auraRing: 'TEX_VFX_Energy_Ring_Soft.webp',
  innerGlow: 'TEX_VFX_Ring_InnerGlow.webp',
});
/** A Slash_1x4 frame is four times as wide as it is tall. */
const SLASH_ASPECT = 0.25;
const DEG = Math.PI / 180;

/** The impact flash: glow, spiked star, expanding ring and flash lines at the target. */
function impactFlash(ctx, lane, s, info) {
  const flash = flashPose(s, lane.h, info.params);
  if (!(flash.alpha > 0)) return;
  const c = centreOf(lane, info.params?.target);
  const at = stageOf(ctx, c.x, c.y);
  const size = stageLen(ctx, flash.r) * 2;
  const { palette } = info.material;
  const white = palette.white ?? WHITE;
  const a = alphaOf(ctx, flash.alpha);
  const dissolve = dissolveOf(ctx);
  const spin = (info.seed ?? 0) * 47;
  emit(ctx, 'sprite', { texture: TEXTURES.glow, at, size: size * 1.2, colour: rgb01(palette.core, 1.2), alpha: a * 0.7, dissolve });
  emit(ctx, 'sprite', { texture: TEXTURES.ring, at, size: size * (0.5 + 1.1 * s), colour: rgb01(palette.hot, 1.3), alpha: a * (1 - s), dissolve });
  emit(ctx, 'sprite', { texture: TEXTURES.spikes, channel: 'a', at, size: size * (0.7 + 0.5 * s), rotation: spin, colour: rgb01(white, 1.8), alpha: a, dissolve });
  emit(ctx, 'sprite', { texture: TEXTURES.lines, channel: 'a', at, size: size * 1.4, rotation: spin * 1.9, colour: rgb01(white, 1.5), alpha: a * 0.8, dissolve });
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
