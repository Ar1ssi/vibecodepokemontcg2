// Design 077 slice 7: the crystal element kits (ice, aurora, gem, steel, bug needles). Spires,
// shards, blades and needles are stretched glossy stones (debris with gloss); bodies are a
// glassy drop (ice) or a sphere of light (steel, gem: Flash Cannon and Power Gem are light, and
// their beams' motes are bodies, so a polished metal ball read black inside them); a thrown one
// trails sparkles; the halo is a cool light. Ice's smoke beats are frost mist.
import { elementKit } from './_kit.js';
import { smokeBeats } from './_smoke.js';
import { alphaOf, dissolveOf, emit, rgb01, stageAngle, stageLen, stageOf } from './_emit.js';

export const CRYSTAL_SCALE = Object.freeze({ shard: 1.3, body: 1.4, projectile: 1.5, glow: 1.4 });
const MAX_STRETCH = 5;
const SPARKLES = 6;
const GLOW_TEXTURE = 'TEX_VFX_Gradient_Radial.webp';
const SPARKLE_TEXTURE = 'T_VFX_Star_Bright_2x2.webp';
const DEG = Math.PI / 180;

/**
 * A crystal kit. `finish` = `{ gloss, stretchGain, orb: 'drop' | 'light', thin }`: how polished,
 * how much longer its shards run than the canvas tongue's ratio, what its bodies are, and how
 * thin its shards are (needles).
 */
function crystalKit({ gloss, stretchGain = 1, orb, thin = 1, mist = false }) {
  const colours = (kit) => ({ colour: rgb01(kit.palette.body, 1.05), light: rgb01(kit.palette.hot, 1.1) });

  function tongue(ctx, spec, { alpha = 1 } = {}) {
    if (!(spec?.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
    const mid = 0.5 * spec.length;
    emit(ctx, 'debris', {
      at: stageOf(ctx, spec.x + Math.cos(spec.angleDeg * DEG) * mid, spec.y + Math.sin(spec.angleDeg * DEG) * mid),
      size: stageLen(ctx, spec.width) * 0.5 * CRYSTAL_SCALE.shard * thin,
      stretch: Math.min(MAX_STRETCH, Math.max(1, (spec.length / spec.width) * stretchGain / thin)),
      headingDeg: stageAngle(ctx, spec.angleDeg),
      alpha: alphaOf(ctx, alpha),
      seed: spec.seed ?? 0,
      spin: (spec.seed ?? 0) * 0.7,
      gloss,
      dissolve: dissolveOf(ctx),
      ...colours(this.base),
    });
  }

  function body(ctx, x, y, r, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    const at = stageOf(ctx, x, y);
    const radius = stageLen(ctx, r) * CRYSTAL_SCALE.body;
    if (orb === 'drop') {
      const { palette } = this.base;
      emit(ctx, 'waterDrop', {
        at,
        radius,
        alpha: alphaOf(ctx, alpha),
        seed: r * 0.37,
        dissolve: dissolveOf(ctx),
        palette: { deep: rgb01(palette.deep), body: rgb01(palette.body), hot: rgb01(palette.hot) },
      });
      return;
    }
    const { palette } = this.base;
    emit(ctx, 'plasma', {
      at,
      radius,
      alpha: alphaOf(ctx, alpha),
      heat: 0.8,
      arcs: 0,
      shell: 1,
      seed: r * 0.37,
      dissolve: dissolveOf(ctx),
      hot: rgb01(palette.core ?? palette.hot, 1.1),
      glow: rgb01(palette.hot, 1),
    });
  }

  function glow(ctx, x, y, r, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    emit(ctx, 'sprite', {
      texture: GLOW_TEXTURE,
      at: stageOf(ctx, x, y),
      size: stageLen(ctx, r) * 2 * CRYSTAL_SCALE.glow,
      colour: rgb01(this.base.palette.hot, 0.9),
      alpha: alphaOf(ctx, alpha) * 0.4,
      dissolve: dissolveOf(ctx),
    });
  }

  function projectile(ctx, { x, y, r, headingDeg = 0, time = 0, seed = 0, alpha = 1 }) {
    if (!(r > 0) || !(alpha > 0)) return;
    body.call(this, ctx, x, y, r * (CRYSTAL_SCALE.projectile / CRYSTAL_SCALE.body), alpha);
    const at = stageOf(ctx, x, y);
    const radius = stageLen(ctx, r) * CRYSTAL_SCALE.projectile;
    const back = stageAngle(ctx, headingDeg) * DEG + Math.PI;
    const a = alphaOf(ctx, alpha);
    for (let k = 0; k < SPARKLES; k += 1) {
      const phase = (((time * 1.5 + k / SPARKLES + seed * 0.13) % 1) + 1) % 1;
      const sway = Math.sin(k * 2.9 + seed) * 0.7;
      const distance = radius * (1 + phase * 2.6);
      emit(ctx, 'sprite', {
        texture: SPARKLE_TEXTURE,
        at: { x: at.x + Math.cos(back + sway) * distance, y: at.y + Math.sin(back + sway) * distance, z: at.z },
        size: radius * (0.7 - 0.4 * phase),
        frame: k,
        colour: rgb01(this.base.palette.hot, 2),
        alpha: a * (1 - phase),
      });
    }
  }

  const beats = mist
    ? smokeBeats((info) => ({
        tint: rgb01(info.material.palette.hot, 0.9),
        light: rgb01(info.material.palette.core ?? info.material.palette.hot, 1.3),
        density: 0.45,
        rise: 0.3,
        glow: 0.1,
        cloudGlow: 0.25,
        alphaGain: 1.6,
      }))
    : {};
  return elementKit({ tongue, body, glow, projectile, beats });
}

export const iceElements = crystalKit({ gloss: 0.85, stretchGain: 1, orb: 'drop', mist: true });
export const gemElements = crystalKit({ gloss: 0.9, stretchGain: 0.8, orb: 'light' });
export const steelElements = crystalKit({ gloss: 1, stretchGain: 1.2, orb: 'light', thin: 0.7 });
export const needleElements = crystalKit({ gloss: 0.5, stretchGain: 1.5, orb: 'light', thin: 0.5 });
