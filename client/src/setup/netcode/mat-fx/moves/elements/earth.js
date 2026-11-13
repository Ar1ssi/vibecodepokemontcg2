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
// Design 089: a rock tongue wider than `over` card heights is a column of earth (Earthquake's
// pillar: 0.7 wide, 2.1 tall). One stone that size is a boulder that buries the struck card and
// its damage; it is drawn as a crown of spires instead, each `width` of the tongue's width, set
// `across` it (in tongue widths), `length` of its length and leaning `lean` degrees outward.
const SPIRES = Object.freeze({
  over: 0.42,
  width: 0.36,
  each: Object.freeze([
    Object.freeze({ across: -0.36, length: 0.62, lean: -13 }),
    Object.freeze({ across: -0.1, length: 1, lean: -3 }),
    Object.freeze({ across: 0.16, length: 0.84, lean: 5 }),
    Object.freeze({ across: 0.38, length: 0.55, lean: 14 }),
  ]),
});
// Design 089: a tongue longer than this many of its own widths is a sweep (a slash arc), not one
// leaf: it is drawn as leaves of LEAF_ASPECT widths strung along it. One sprite stretched over a
// whole slash was a leaf half a card long.
const SWEEP_ASPECT = 6;
const LEAF_ASPECT = 3.2;
const MAX_SWEEP_LEAVES = 6;
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

  /** One stretched stone from (spec.x, spec.y) along spec.angleDeg, its root on that point. */
  function stone(ctx, kit, spec, alpha, maxStretch = MAX_STRETCH) {
    const { colour, light } = lookOf(kit);
    const stretch = Math.min(maxStretch, Math.max(1, spec.length / spec.width));
    // A stone whose stretch is capped is shorter than its tongue: it stands on the tongue's root,
    // not at the tongue's middle (where it hung in the air).
    const mid = 0.5 * Math.min(spec.length, spec.width * EARTH_SCALE.shard * stretch);
    emit(ctx, 'debris', {
      at: stageOf(ctx, spec.x + Math.cos(spec.angleDeg * DEG) * mid, spec.y + Math.sin(spec.angleDeg * DEG) * mid),
      size: stageLen(ctx, spec.width) * 0.5 * EARTH_SCALE.shard,
      stretch,
      headingDeg: stageAngle(ctx, spec.angleDeg),
      alpha: alphaOf(ctx, alpha),
      seed: spec.seed ?? 0,
      spin: (spec.seed ?? 0) * 0.7,
      colour,
      light,
      dissolve: dissolveOf(ctx),
    });
  }

  /** A spire, shard or spike from (spec.x, spec.y) along spec.angleDeg; a wide one is a crown of spires. */
  function tongue(ctx, spec, { alpha = 1 } = {}) {
    if (!(spec?.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
    const cardHeight = ctx.stageUnit?.() ?? 0;
    if (!(cardHeight > 0) || stageLen(ctx, spec.width) * EARTH_SCALE.shard <= cardHeight * SPIRES.over) {
      stone(ctx, this.base, spec, alpha);
      return;
    }
    const cos = Math.cos(spec.angleDeg * DEG);
    const sin = Math.sin(spec.angleDeg * DEG);
    SPIRES.each.forEach((spire, index) => {
      stone(
        ctx,
        this.base,
        {
          x: spec.x - sin * spire.across * spec.width,
          y: spec.y + cos * spire.across * spec.width,
          angleDeg: spec.angleDeg + spire.lean,
          length: spec.length * spire.length,
          width: spec.width * SPIRES.width,
          seed: (spec.seed ?? 0) + index * 1.3,
        },
        alpha,
        // The shorter spires are shorter stones too (the cap alone would level them all).
        Math.max(1, MAX_STRETCH * spire.length)
      );
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
  /** One leaf sprite, `length` long, its middle at (x, y), lying along `angleDeg`. */
  function one(ctx, kit, { x, y, angleDeg, length, seed, alpha }) {
    emit(ctx, 'sprite', {
      texture,
      channel,
      blend,
      at: stageOf(ctx, x, y),
      size: stageLen(ctx, length) * EARTH_SCALE.leaf,
      // The sheet's leaves point up the texture; laid along the leaf, that is a quarter turn.
      alignDeg: stageAngle(ctx, angleDeg),
      rotation: -90,
      frame: Math.abs(Math.round(seed * 7)) % 4,
      colour: tint(kit.palette),
      alpha: alphaOf(ctx, alpha),
      dissolve: dissolveOf(ctx),
    });
  }

  function leaf(ctx, spec, { alpha = 1 } = {}) {
    if (!(spec?.length > 0) || !(alpha > 0)) return;
    const cos = Math.cos(spec.angleDeg * DEG);
    const sin = Math.sin(spec.angleDeg * DEG);
    const seed = spec.seed ?? 0;
    const sweep = spec.width > 0 && spec.length > spec.width * SWEEP_ASPECT;
    if (!sweep) {
      one(ctx, this.base, { x: spec.x + cos * 0.5 * spec.length, y: spec.y + sin * 0.5 * spec.length, angleDeg: spec.angleDeg, length: spec.length, seed, alpha });
      return;
    }
    const length = spec.width * LEAF_ASPECT;
    const count = Math.min(MAX_SWEEP_LEAVES, Math.max(2, Math.round(spec.length / length)));
    for (let k = 0; k < count; k += 1) {
      const along = ((k + 0.5) / count) * spec.length;
      // Each leaf rides the sweep a little off its line and turned its own way, fixed by its seed.
      const wander = Math.sin(seed * 5.3 + k * 2.7);
      const off = wander * spec.width * 0.9;
      one(ctx, this.base, {
        x: spec.x + cos * along - sin * off,
        y: spec.y + sin * along + cos * off,
        angleDeg: spec.angleDeg + wander * 35,
        length: length * (0.85 + 0.3 * Math.abs(Math.sin(seed * 3.1 + k * 1.3))),
        seed: seed + k * 0.37,
        // The leading leaves are whole; the ones behind thin out.
        alpha: alpha * (0.55 + 0.45 * ((k + 1) / count)),
      });
    }
  }
  return elementKit({ tongue: leaf });
}

export const grassElements = leafKit({ texture: LEAF_TEXTURE, channel: 'rgba', blend: 'over', tint: () => [1, 1, 1] });
export const petalElements = leafKit({ texture: PETAL_TEXTURE, channel: 'a', blend: 'over', tint: (palette) => rgb01(palette.body, 1.1) });
