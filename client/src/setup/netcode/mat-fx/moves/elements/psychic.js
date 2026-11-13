// Design 079 slice 5: the psychic element kit. Sigils (the glyph drawer) and orbs become lens
// fields that bend and colour-split the board behind them inside turning psychic rings; the
// halo is a pink light, a travelling orb trails motes. Ribbons keep the canvas kit's tongue.
import { elementKit } from './_kit.js';
import { alphaOf, dissolveOf, emit, rgb01, stageAngle, stageLen, stageOf } from './_emit.js';

// Design 089: sigil 1.4 → 1.0, body 1.6 → 1.3, projectile 1.8 → 1.5: a field is sized to the card
// it works on (radius 0.4–0.9 card heights), not to the board ("psychic rings large").
export const PSYCHIC_SCALE = Object.freeze({ sigil: 1.0, body: 1.3, projectile: 1.5, glow: 1.5 });
const GLOW_TEXTURE = 'TEX_VFX_Gradient_Radial.webp';
const MOTE_TEXTURE = 'TEX_VFX_Gradient_Radial_Small.webp';
const MOTES = 8;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/**
 * Design 089: no field is wider than the card it works on. A sigil or orb the spec draws larger
 * (Psychic's is 0.9 card heights in radius) stops at this share of a card height: past it the
 * disc was mostly dark cloth inside a bright ring, a bullseye two cards across.
 */
export const MAX_FIELD_RADIUS = 0.62;
const fieldRadius = (ctx, radius) => {
  const cardHeight = ctx.stageUnit?.() ?? 0;
  return cardHeight > 0 ? Math.min(radius, cardHeight * MAX_FIELD_RADIUS) : radius;
};

const colours = (kit) => ({ body: rgb01(kit.palette.body), hot: rgb01(kit.palette.hot) });

/** A sigil at (x, y), radius r, `s` its beat progress: a lens field turning with it. */
function sigil(ctx, x, y, r, s) {
  if (!(r > 0)) return;
  emit(ctx, 'lens', {
    at: stageOf(ctx, x, y),
    radius: fieldRadius(ctx, stageLen(ctx, r) * PSYCHIC_SCALE.sigil),
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
  const radius = fieldRadius(ctx, stageLen(ctx, r) * PSYCHIC_SCALE.body);
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
  const radius = fieldRadius(ctx, stageLen(ctx, r) * PSYCHIC_SCALE.projectile);
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
