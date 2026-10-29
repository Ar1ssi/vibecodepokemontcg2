// Design 077 slice 7: the air element kit (flying, silver). A gust, an air blade or a wing
// stroke is a TCG Live swipe laid along it on screen; a gust ball is a pale puff of smoke with a
// light heart; a thrown blade trails swipes; the clouds and smoke are white air.
import { elementKit } from './_kit.js';
import { smokeBeats } from './_smoke.js';
import { alphaOf, dissolveOf, emit, rgb01, stageAngle, stageLen, stageOf } from './_emit.js';

export const AIR_SCALE = Object.freeze({ swipe: 1.35, body: 1.6, glow: 1.4 });
const SWIPE_TEXTURE = 'T_VFX_Slash02_1x4.webp';
const GLOW_TEXTURE = 'TEX_VFX_Gradient_Radial.webp';
const DEG = Math.PI / 180;

/** A gust or blade from (spec.x, spec.y) along spec.angleDeg: a swipe laid along it. */
function tongue(ctx, spec, { alpha = 1 } = {}) {
  if (!(spec?.length > 0) || !(alpha > 0)) return;
  const mid = 0.5 * spec.length;
  const seed = Math.abs(Math.round((spec.seed ?? 0) * 5));
  emit(ctx, 'sprite', {
    texture: SWIPE_TEXTURE,
    channel: 'a',
    at: stageOf(ctx, spec.x + Math.cos(spec.angleDeg * DEG) * mid, spec.y + Math.sin(spec.angleDeg * DEG) * mid),
    size: stageLen(ctx, spec.length) * AIR_SCALE.swipe,
    aspect: Math.max(0.2, Math.min(0.6, (spec.width ?? spec.length * 0.25) / spec.length)),
    alignDeg: stageAngle(ctx, spec.angleDeg),
    frame: 2 + (seed % 2),
    colour: rgb01(this.base.palette.hot, 1.4),
    alpha: alphaOf(ctx, alpha) * 0.9,
    dissolve: dissolveOf(ctx),
  });
}

/** A gust ball: a pale puff with a light heart. */
function body(ctx, x, y, r, alpha) {
  if (!(r > 0) || !(alpha > 0)) return;
  emit(ctx, 'smoke', {
    at: stageOf(ctx, x, y),
    radius: stageLen(ctx, r) * AIR_SCALE.body,
    alpha: alphaOf(ctx, alpha) * 0.8,
    seed: r * 0.37,
    tint: rgb01(this.base.palette.hot, 0.95),
    light: rgb01(this.base.palette.core ?? this.base.palette.hot, 1.3),
    density: 0.4,
    rise: 0.8,
    glow: 0.4,
    dissolve: dissolveOf(ctx),
  });
}

function glow(ctx, x, y, r, alpha) {
  if (!(r > 0) || !(alpha > 0)) return;
  emit(ctx, 'sprite', {
    texture: GLOW_TEXTURE,
    at: stageOf(ctx, x, y),
    size: stageLen(ctx, r) * 2 * AIR_SCALE.glow,
    colour: rgb01(this.base.palette.hot, 0.9),
    alpha: alphaOf(ctx, alpha) * 0.35,
    dissolve: dissolveOf(ctx),
  });
}

/** A thrown blade: a swipe along the heading and two fainter ones trailing it. */
function projectile(ctx, { x, y, r, headingDeg = 0, alpha = 1, seed = 0, time = 0 }) {
  if (!(r > 0) || !(alpha > 0)) return;
  for (let k = 0; k < 3; k += 1) {
    const back = r * 1.6 * k;
    const bx = x - Math.cos(headingDeg * DEG) * back;
    const by = y - Math.sin(headingDeg * DEG) * back;
    tongue.call(this, ctx, { x: bx - Math.cos(headingDeg * DEG) * r * 1.5, y: by - Math.sin(headingDeg * DEG) * r * 1.5, angleDeg: headingDeg, length: r * 3, width: r * 0.9, seed: seed + k + Math.floor(time * 6) }, { alpha: alpha * (1 - k * 0.3) });
  }
}

export const airElements = elementKit({
  tongue,
  body,
  glow,
  projectile,
  beats: smokeBeats((info) => ({
    tint: rgb01(info.material.palette.hot, 0.95),
    light: rgb01(info.material.palette.core ?? info.material.palette.hot, 1.2),
    density: 0.35,
    rise: 0.9,
    glow: 0.1,
    cloudGlow: 0.3,
    alphaGain: 1.5,
  })),
});
