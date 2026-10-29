// Design 079 slice 6: the rock, ground and grass element kits. Rock and ground are solid: their
// boulders and clods become real tumbling 3-D stones (debris), their spires, shards and spikes
// stretched stones along the tongue, a thrown rock a stone trailing dust, and their smoke beats
// dust. Grass leaves become TCG Live leaf sprites turned along the leaf. Larger than the canvas
// shapes (user: bigger effects, 2026-10-29).
import { elementKit } from './_kit.js';
import { smokeBeats } from './_smoke.js';
import { alphaOf, dissolveOf, emit, rgb01, stageAngle, stageLen, stageOf } from './_emit.js';

export const EARTH_SCALE = Object.freeze({ body: 1.25, projectile: 1.35, shard: 1.3, leaf: 1.5 });
const MAX_STRETCH = 4;
const DUST_PUFFS = 3;
const LEAF_TEXTURE = 'T_VFX_Leaves_2x2.webp';
const PETAL_TEXTURE = 'T_VFX_Fairy_Petal_Soft_2x2.webp';
const DEG = Math.PI / 180;

/** A stone kit in a palette role: `look(palette)` → `{ colour, light, dust }` (0–1 rgb). */
function stoneKit(look) {
  const lookOf = (kit) => look(kit.palette, kit.smoke);

  /** A boulder or clod: one stone, its tumble fixed by its size so it holds still. */
  function body(ctx, x, y, r, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    const { colour, light } = lookOf(this.base);
    emit(ctx, 'debris', {
      at: stageOf(ctx, x, y),
      size: stageLen(ctx, r) * EARTH_SCALE.body,
      alpha: alphaOf(ctx, alpha),
      seed: r * 0.37,
      spin: r * 0.11,
      colour,
      light,
      dissolve: dissolveOf(ctx),
    });
  }

  /** A spire, shard or spike from (spec.x, spec.y) along spec.angleDeg: a stretched stone. */
  function tongue(ctx, spec, { alpha = 1 } = {}) {
    if (!(spec?.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
    const { colour, light } = lookOf(this.base);
    const mid = 0.5 * spec.length;
    const cx = spec.x + Math.cos(spec.angleDeg * DEG) * mid;
    const cy = spec.y + Math.sin(spec.angleDeg * DEG) * mid;
    const size = stageLen(ctx, spec.width) * 0.5 * EARTH_SCALE.shard;
    emit(ctx, 'debris', {
      at: stageOf(ctx, cx, cy),
      size,
      stretch: Math.min(MAX_STRETCH, Math.max(1, spec.length / spec.width)),
      headingDeg: stageAngle(ctx, spec.angleDeg),
      alpha: alphaOf(ctx, alpha),
      seed: spec.seed ?? 0,
      spin: (spec.seed ?? 0) * 0.7,
      colour,
      light,
      dissolve: dissolveOf(ctx),
    });
  }

  /** A thrown rock: a stone tumbling with time along its heading, dust trailing behind. */
  function projectile(ctx, { x, y, r, headingDeg = 0, time = 0, seed = 0, alpha = 1, tongues = DUST_PUFFS }) {
    if (!(r > 0) || !(alpha > 0)) return;
    const { colour, light, dust } = lookOf(this.base);
    const at = stageOf(ctx, x, y);
    const size = stageLen(ctx, r) * EARTH_SCALE.projectile;
    const back = stageAngle(ctx, headingDeg) * DEG + Math.PI;
    const a = alphaOf(ctx, alpha);
    const dissolve = dissolveOf(ctx);
    for (let k = 0; k < Math.max(0, tongues); k += 1) {
      const phase = (((time * 1.8 + k / Math.max(1, tongues) + seed * 0.19) % 1) + 1) % 1;
      const distance = size * (1 + phase * 2.4);
      emit(ctx, 'smoke', {
        at: { x: at.x + Math.cos(back) * distance, y: at.y + Math.sin(back) * distance, z: at.z * (1 - 0.5 * phase) },
        radius: size * (0.7 + 0.7 * phase),
        alpha: a * (1 - phase) * 0.7,
        seed: seed + k * 1.9,
        tint: dust,
        light,
        density: 0.5,
        rise: 0.5,
        dissolve,
      });
    }
    emit(ctx, 'debris', { at, size, alpha: a, seed, spin: time * 4 + seed, colour, light, dissolve });
  }

  return elementKit({
    body,
    tongue,
    projectile,
    beats: smokeBeats((info) => {
      const style = look(info.material.palette, info.material.smoke);
      return { tint: style.dust, light: style.light, density: 0.5, rise: 0.4, glow: 0, cloudGlow: 0, alphaGain: 2 };
    }),
  });
}

export const rockElements = stoneKit((palette, smoke) => ({
  colour: rgb01(palette.body),
  light: rgb01(palette.hot, 1.1),
  dust: rgb01(smoke ?? palette.body, 0.85),
}));

export const groundElements = stoneKit((palette, smoke) => ({
  colour: rgb01(palette.body),
  light: rgb01(palette.hot, 1.05),
  dust: rgb01(smoke ?? palette.body, 0.85),
}));

/**
 * Leaves from (spec.x, spec.y) along spec.angleDeg: a TCG Live leaf sprite laid along it on
 * screen. `texture` / `channel` pick the sheet (green leaves keep their own colour; petals are a
 * mask tinted by `tint(palette)`).
 */
function leafKit({ texture, channel, blend, tint }) {
  function leaf(ctx, spec, { alpha = 1 } = {}) {
    if (!(spec?.length > 0) || !(alpha > 0)) return;
    const mid = 0.5 * spec.length;
    const seed = Math.abs(Math.round((spec.seed ?? 0) * 7));
    emit(ctx, 'sprite', {
      texture,
      channel,
      blend,
      at: stageOf(ctx, spec.x + Math.cos(spec.angleDeg * DEG) * mid, spec.y + Math.sin(spec.angleDeg * DEG) * mid),
      size: stageLen(ctx, spec.length) * EARTH_SCALE.leaf,
      // The sheet's leaves point up the texture; laid along the leaf, that is a quarter turn.
      alignDeg: stageAngle(ctx, spec.angleDeg),
      rotation: -90,
      frame: seed % 4,
      colour: tint(this.base.palette),
      alpha: alphaOf(ctx, alpha),
      dissolve: dissolveOf(ctx),
    });
  }
  return elementKit({ tongue: leaf });
}

export const grassElements = leafKit({ texture: LEAF_TEXTURE, channel: 'rgba', blend: 'over', tint: () => [1, 1, 1] });
export const petalElements = leafKit({ texture: PETAL_TEXTURE, channel: 'a', blend: 'over', tint: (palette) => rgb01(palette.body, 1.1) });
