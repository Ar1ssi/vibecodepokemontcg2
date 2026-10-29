// Design 077 slice 2: the fire element kit. The drawers' fire bodies become boiling fireballs,
// their tongues flame jets, a travelling projectile a comet that sheds flame and embers, and the
// halo a light sprite. Sizes run larger than the canvas kit's (user: bigger effects, 2026-10-29);
// colours come from the kit palette, so a tinted beat's fire takes its tint.
import { elementKit } from './_kit.js';
import { alphaOf, dissolveOf, emit, rgb01, stageAngle, stageLen, stageOf } from './_emit.js';

/** How much larger than the canvas kit each piece draws. */
export const FIRE_SCALE = Object.freeze({ body: 1.7, projectile: 1.9, tongueWidth: 1.6, tongueLength: 1.45, glow: 1.5 });
/** A moving fireball's comet tail (0–1) and the flame it sheds behind it. */
const COMET_STRETCH = 0.85;
const TRAIL_JETS = 3;
const EMBERS = 10;
// Soft radial falloffs: TEX_VFX_Dot_Glow is a hard-edged disc.
const EMBER_TEXTURE = 'TEX_VFX_Gradient_Radial_Small.webp';
const GLOW_TEXTURE = 'TEX_VFX_Gradient_Radial.webp';
const DEG = Math.PI / 180;

const paletteOf = (kit) => ({
  deep: rgb01(kit.palette.deep),
  body: rgb01(kit.palette.body),
  hot: rgb01(kit.palette.hot),
  core: rgb01(kit.palette.core),
});

/** A soft light halo: an additive glow sprite in the body colour. */
function glow(ctx, x, y, r, alpha) {
  if (!(r > 0) || !(alpha > 0)) return;
  emit(ctx, 'sprite', {
    texture: GLOW_TEXTURE,
    at: stageOf(ctx, x, y),
    size: stageLen(ctx, r) * 2 * FIRE_SCALE.glow,
    colour: rgb01(this.base.palette.body, 1.1),
    alpha: alphaOf(ctx, alpha) * 0.45,
    dissolve: dissolveOf(ctx),
  });
}

/** A hot sphere: a boiling fireball. `hot` dims its white heart. */
function body(ctx, x, y, r, alpha, hot = 1) {
  if (!(r > 0) || !(alpha > 0)) return;
  emit(ctx, 'fireball', {
    at: stageOf(ctx, x, y),
    radius: stageLen(ctx, r) * FIRE_SCALE.body,
    alpha: alphaOf(ctx, alpha),
    heat: hot,
    // A ball's own radius seeds it: steady while it moves, different from its neighbours.
    seed: r * 0.37,
    dissolve: dissolveOf(ctx),
    palette: paletteOf(this.base),
  });
}

/** A flame tongue from (spec.x, spec.y) along spec.angleDeg: a flame jet. */
function tongue(ctx, spec, { alpha = 1, hot = 1 } = {}) {
  if (!(spec?.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
  const length = spec.length * FIRE_SCALE.tongueLength;
  const tipX = spec.x + Math.cos(spec.angleDeg * DEG) * length;
  const tipY = spec.y + Math.sin(spec.angleDeg * DEG) * length;
  emit(ctx, 'flameJet', {
    from: stageOf(ctx, spec.x, spec.y),
    to: stageOf(ctx, tipX, tipY),
    width: stageLen(ctx, spec.width) * FIRE_SCALE.tongueWidth,
    alpha: alphaOf(ctx, alpha),
    heat: hot,
    seed: spec.seed ?? 0,
    dissolve: dissolveOf(ctx),
    palette: paletteOf(this.base),
  });
}

/**
 * A travelling fireball: a comet along its heading with flame jets streaming behind, embers
 * shed off its tail and a light halo. Embers are placed by time and seed alone, so a frozen
 * preview stands still.
 */
function projectile(ctx, { x, y, r, headingDeg = 0, time = 0, seed = 0, alpha = 1, hot = 1 }) {
  if (!(r > 0) || !(alpha > 0)) return;
  const at = stageOf(ctx, x, y);
  const radius = stageLen(ctx, r) * FIRE_SCALE.projectile;
  const heading = stageAngle(ctx, headingDeg);
  const a = alphaOf(ctx, alpha);
  const dissolve = dissolveOf(ctx);
  const palette = paletteOf(this.base);
  emit(ctx, 'sprite', { texture: GLOW_TEXTURE, at, size: radius * 4, colour: rgb01(this.base.palette.body, 0.9), alpha: a * 0.35, dissolve });
  const back = (heading + 180) * DEG;
  for (let k = 0; k < TRAIL_JETS; k += 1) {
    const spread = (k - (TRAIL_JETS - 1) / 2) * 22 * DEG + 0.12 * Math.sin(time * 5 + seed + k);
    const length = radius * (2.4 + 0.6 * Math.sin(seed * 3.1 + k * 1.9 + time * 3));
    emit(ctx, 'flameJet', {
      from: at,
      to: { x: at.x + Math.cos(back + spread) * length, y: at.y + Math.sin(back + spread) * length, z: at.z + radius * 0.2 },
      width: radius * 1.3,
      alpha: a * 0.85,
      heat: hot * 0.6,
      seed: seed + k * 2.1,
      dissolve,
      flow: 1.6,
      palette,
    });
  }
  emit(ctx, 'fireball', { at, radius, alpha: a, heat: hot, seed, dissolve, headingDeg: heading, stretch: COMET_STRETCH, palette });
  for (let k = 0; k < EMBERS; k += 1) {
    const phase = (((time * 1.4 + k * 0.137 + seed * 0.31) % 1) + 1) % 1;
    const drift = back + (Math.sin(k * 2.3 + seed) * 0.6);
    const distance = radius * (0.9 + phase * 3.8);
    emit(ctx, 'sprite', {
      texture: EMBER_TEXTURE,
      at: { x: at.x + Math.cos(drift) * distance, y: at.y + Math.sin(drift) * distance, z: at.z + radius * phase * 1.2 },
      size: radius * (0.22 - 0.12 * phase),
      colour: rgb01(this.base.palette.hot, 2.4),
      alpha: a * (1 - phase),
      dissolve,
    });
  }
}

export const fireElements = elementKit({ glow, body, tongue, projectile });
