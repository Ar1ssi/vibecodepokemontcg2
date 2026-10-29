// Design 079 slice 5: the ghost and dark element kits — both are made of smoke. Ghost is violet
// wisps that glow from inside; dark is near-black ink with a crimson edge. Their smoke and cloud
// beats become lit billowing smoke; their orbs (Shadow Ball, Dark Pulse) are dense smoke balls
// with a lit heart; the halo is a dim light; a travelling orb sheds smoke behind it.
import { elementKit } from './_kit.js';
import { smokeBeats } from './_smoke.js';
import { alphaOf, dissolveOf, emit, rgb01, stageAngle, stageLen, stageOf } from './_emit.js';

export const SHADOW_SCALE = Object.freeze({ body: 1.7, projectile: 1.9, glow: 1.4 });
const GLOW_TEXTURE = 'TEX_VFX_Gradient_Radial.webp';
const TRAIL_PUFFS = 5;
const DEG = Math.PI / 180;

/**
 * A smoke-made kit. `look(palette)` → smoke look `{ tint, light, density, rise, glow, cloudGlow,
 * alphaGain }`, `orbGlow` (the heart of its orbs) and `halo` (its light sprites' alpha: ghost
 * glows, dark barely does).
 */
function shadowKit(look) {
  const lookOf = (kit) => look(kit.palette);

  function body(ctx, x, y, r, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    const style = lookOf(this.base);
    emit(ctx, 'smoke', {
      at: stageOf(ctx, x, y),
      radius: stageLen(ctx, r) * SHADOW_SCALE.body,
      alpha: alphaOf(ctx, alpha),
      seed: r * 0.37,
      tint: style.tint,
      light: style.light,
      density: 1,
      rise: style.rise * 0.5,
      glow: style.orbGlow,
      dissolve: dissolveOf(ctx),
    });
  }

  function glow(ctx, x, y, r, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    emit(ctx, 'sprite', {
      texture: GLOW_TEXTURE,
      at: stageOf(ctx, x, y),
      size: stageLen(ctx, r) * 2 * SHADOW_SCALE.glow,
      colour: lookOf(this.base).light,
      alpha: alphaOf(ctx, alpha) * lookOf(this.base).halo,
      dissolve: dissolveOf(ctx),
    });
  }

  function projectile(ctx, { x, y, r, headingDeg = 0, time = 0, seed = 0, alpha = 1 }) {
    if (!(r > 0) || !(alpha > 0)) return;
    const style = lookOf(this.base);
    const at = stageOf(ctx, x, y);
    const radius = stageLen(ctx, r) * SHADOW_SCALE.projectile;
    const back = stageAngle(ctx, headingDeg) * DEG + Math.PI;
    const a = alphaOf(ctx, alpha);
    const dissolve = dissolveOf(ctx);
    for (let k = TRAIL_PUFFS - 1; k >= 0; k -= 1) {
      const phase = (((time * 1.5 + k / TRAIL_PUFFS + seed * 0.17) % 1) + 1) % 1;
      const distance = radius * (0.8 + phase * 2.8);
      emit(ctx, 'smoke', {
        at: { x: at.x + Math.cos(back) * distance, y: at.y + Math.sin(back) * distance, z: at.z + radius * 0.3 * phase },
        radius: radius * (0.7 + 0.5 * phase),
        alpha: a * (1 - phase) * 0.8,
        seed: seed + k * 1.7,
        tint: style.tint,
        light: style.light,
        density: style.density,
        rise: style.rise,
        glow: 0,
        dissolve,
      });
    }
    emit(ctx, 'sprite', { texture: GLOW_TEXTURE, at, size: radius * 3.4, colour: style.light, alpha: a * style.halo });
    emit(ctx, 'smoke', { at, radius, alpha: a, seed, tint: style.tint, light: style.light, density: 1, rise: style.rise * 0.5, glow: style.orbGlow, dissolve });
  }

  return elementKit({ body, glow, projectile, beats: smokeBeats((info) => look(info.material.palette)) });
}

export const ghostElements = shadowKit((palette) => ({
  tint: rgb01(palette.deep, 1.4),
  light: rgb01(palette.hot, 1.5),
  density: 0.6,
  rise: 0.6,
  glow: 0.15,
  cloudGlow: 0.45,
  orbGlow: 0.6,
  halo: 0.3,
  alphaGain: 2,
}));

export const darkElements = shadowKit((palette) => ({
  // Ink: near-black body, the crimson only at its lit edge and a faint heart.
  tint: rgb01(palette.deep, 0.8),
  light: rgb01(palette.hot, 0.9),
  density: 1,
  rise: 0.35,
  glow: 0,
  cloudGlow: 0.05,
  orbGlow: 0.15,
  halo: 0.08,
  alphaGain: 2.2,
}));

/** Fire's soot (Fire Blast's smoke beat): warm grey smoke with an ember-lit edge. */
export const sootBeats = smokeBeats((info) => ({
  tint: rgb01(info.material.smoke ?? [120, 96, 84], 0.8),
  light: rgb01(info.material.palette.hot, 1.2),
  density: 0.55,
  rise: 0.8,
  glow: 0,
  cloudGlow: 0.3,
  alphaGain: 2,
}));
