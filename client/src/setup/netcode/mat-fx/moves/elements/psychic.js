// Design 077 slice 5: the psychic element kit. Sigils (the glyph drawer) and orbs become lens
// fields that bend and colour-split the board behind them inside turning psychic rings; the
// halo is a pink light, a travelling orb trails motes. Ribbons keep the canvas kit's tongue.
import { elementKit } from './_kit.js';
import { alphaOf, dissolveOf, emit, rgb01, stageAngle, stageLen, stageOf } from './_emit.js';

export const PSYCHIC_SCALE = Object.freeze({ sigil: 1.4, body: 1.6, projectile: 1.8, glow: 1.5 });
const GLOW_TEXTURE = 'TEX_VFX_Gradient_Radial.webp';
const MOTE_TEXTURE = 'TEX_VFX_Gradient_Radial_Small.webp';
const MOTES = 8;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

const colours = (kit) => ({ body: rgb01(kit.palette.body), hot: rgb01(kit.palette.hot) });

/** A sigil at (x, y), radius r, `s` its beat progress: a lens field turning with it. */
function sigil(ctx, x, y, r, s) {
  if (!(r > 0)) return;
  emit(ctx, 'lens', {
    at: stageOf(ctx, x, y),
    radius: stageLen(ctx, r) * PSYCHIC_SCALE.sigil,
    alpha: alphaOf(ctx, 1),
    seed: r * 0.37,
    spin: (Number(s) || 0) * TAU * 1.2,
    strength: 0.8,
    dissolve: dissolveOf(ctx),
    ...colours(this.base),
  });
}

/** A psychic orb: a small, strongly bent lens with dim rings and a pink light round it. */
function body(ctx, x, y, r, alpha) {
  if (!(r > 0) || !(alpha > 0)) return;
  const at = stageOf(ctx, x, y);
  const radius = stageLen(ctx, r) * PSYCHIC_SCALE.body;
  const a = alphaOf(ctx, alpha);
  emit(ctx, 'sprite', { texture: GLOW_TEXTURE, at, size: radius * 3.2, colour: rgb01(this.base.palette.body, 1.1), alpha: a * 0.5 });
  emit(ctx, 'lens', { at, radius, alpha: a, seed: r * 0.37, spin: 0, strength: 1, rings: 0.6, dissolve: dissolveOf(ctx), ...colours(this.base) });
}

/** A soft pink light. */
function glow(ctx, x, y, r, alpha) {
  if (!(r > 0) || !(alpha > 0)) return;
  emit(ctx, 'sprite', {
    texture: GLOW_TEXTURE,
    at: stageOf(ctx, x, y),
    size: stageLen(ctx, r) * 2 * PSYCHIC_SCALE.glow,
    colour: rgb01(this.base.palette.body, 1),
    alpha: alphaOf(ctx, alpha) * 0.45,
    dissolve: dissolveOf(ctx),
  });
}

/** A psychic shot along `headingDeg`: an orb trailing motes that drift off behind it. */
function projectile(ctx, { x, y, r, headingDeg = 0, time = 0, seed = 0, alpha = 1 }) {
  if (!(r > 0) || !(alpha > 0)) return;
  const at = stageOf(ctx, x, y);
  const radius = stageLen(ctx, r) * PSYCHIC_SCALE.projectile;
  const back = stageAngle(ctx, headingDeg) * DEG + Math.PI;
  const a = alphaOf(ctx, alpha);
  emit(ctx, 'sprite', { texture: GLOW_TEXTURE, at, size: radius * 3.6, colour: rgb01(this.base.palette.body, 1.1), alpha: a * 0.5 });
  emit(ctx, 'lens', { at, radius, alpha: a, seed, spin: time * 3, strength: 1, rings: 0.8, dissolve: dissolveOf(ctx), ...colours(this.base) });
  for (let k = 0; k < MOTES; k += 1) {
    const phase = (((time * 1.2 + k * 0.125 + seed * 0.23) % 1) + 1) % 1;
    const sway = Math.sin(k * 2.1 + time * 3) * 0.5;
    const distance = radius * (1 + phase * 3);
    emit(ctx, 'sprite', {
      texture: MOTE_TEXTURE,
      at: { x: at.x + Math.cos(back + sway) * distance, y: at.y + Math.sin(back + sway) * distance, z: at.z + radius * 0.4 * phase },
      size: radius * (0.5 - 0.3 * phase),
      colour: rgb01(this.base.palette.hot, 1.8),
      alpha: a * (1 - phase),
    });
  }
}

export const psychicElements = elementKit({ sigil, body, glow, projectile });
