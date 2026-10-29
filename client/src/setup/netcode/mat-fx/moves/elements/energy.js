// Design 077 slice 7: the energy element kit (fighting, aura, normal). A ki orb or an impact
// body is a plasma ball with almost no arcs and a strong shell — a sphere of force; streaks are
// flame jets in the type's palette; a thrown orb drags streaks; the halo is a light sprite.
import { elementKit } from './_kit.js';
import { fireElements } from './fire.js';
import { alphaOf, dissolveOf, emit, rgb01, stageAngle, stageLen, stageOf } from './_emit.js';

export const ENERGY_SCALE = Object.freeze({ body: 1.5, projectile: 1.7, glow: 1.5 });
const GLOW_TEXTURE = 'TEX_VFX_Gradient_Radial.webp';
const STREAKS = 3;
const DEG = Math.PI / 180;

const sphereOf = (kit) => ({ hot: rgb01(kit.palette.hot), glow: rgb01(kit.palette.body) });

function body(ctx, x, y, r, alpha, hot = 1) {
  if (!(r > 0) || !(alpha > 0)) return;
  emit(ctx, 'plasma', {
    at: stageOf(ctx, x, y),
    radius: stageLen(ctx, r) * ENERGY_SCALE.body,
    alpha: alphaOf(ctx, alpha),
    heat: Math.min(1, Math.max(0, hot)) * 0.8,
    arcs: 0.15,
    shell: 0.9,
    seed: r * 0.37,
    dissolve: dissolveOf(ctx),
    ...sphereOf(this.base),
  });
}

function glow(ctx, x, y, r, alpha) {
  if (!(r > 0) || !(alpha > 0)) return;
  emit(ctx, 'sprite', {
    texture: GLOW_TEXTURE,
    at: stageOf(ctx, x, y),
    size: stageLen(ctx, r) * 2 * ENERGY_SCALE.glow,
    colour: rgb01(this.base.palette.body, 1),
    alpha: alphaOf(ctx, alpha) * 0.5,
    dissolve: dissolveOf(ctx),
  });
}

function projectile(ctx, { x, y, r, headingDeg = 0, time = 0, seed = 0, alpha = 1, hot = 1 }) {
  if (!(r > 0) || !(alpha > 0)) return;
  const at = stageOf(ctx, x, y);
  const radius = stageLen(ctx, r) * ENERGY_SCALE.projectile;
  const back = stageAngle(ctx, headingDeg) * DEG + Math.PI;
  const a = alphaOf(ctx, alpha);
  const dissolve = dissolveOf(ctx);
  const palette = { deep: rgb01(this.base.palette.deep), body: rgb01(this.base.palette.body), hot: rgb01(this.base.palette.hot), core: rgb01(this.base.palette.core) };
  emit(ctx, 'sprite', { texture: GLOW_TEXTURE, at, size: radius * 4, colour: rgb01(this.base.palette.body, 1), alpha: a * 0.4 });
  for (let k = 0; k < STREAKS; k += 1) {
    const spread = (k - (STREAKS - 1) / 2) * 0.32 + 0.1 * Math.sin(time * 5 + seed + k);
    const length = radius * (2.4 + 0.5 * Math.sin(seed * 2.3 + k));
    emit(ctx, 'flameJet', {
      from: at,
      to: { x: at.x + Math.cos(back + spread) * length, y: at.y + Math.sin(back + spread) * length, z: at.z },
      width: radius * 1.1,
      alpha: a * 0.8,
      heat: hot * 0.5,
      seed: seed + k * 1.7,
      flow: 2,
      dissolve,
      palette,
    });
  }
  emit(ctx, 'plasma', { at, radius, alpha: a, heat: hot * 0.8, arcs: 0.15, shell: 0.9, seed, dissolve, ...sphereOf(this.base) });
}

export const energyElements = elementKit({ body, glow, projectile, tongue: fireElements.methods.tongue });
