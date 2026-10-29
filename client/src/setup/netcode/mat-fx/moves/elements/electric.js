// Design 079 slice 3: the electric element kit. The drawers' lightning polylines become bolt
// capsules (white core, gold glow, crackle and strobe in the shader), jags become short bolts,
// bodies become plasma balls, a travelling spark a plasma ball dragging forked bolts, and the
// halo a light sprite. Thicker than the canvas strokes (user: bigger effects, 2026-10-29).
import { boltSegments } from '../../../../board3d/fx/elements/bolt.mjs';
import { elementKit } from './_kit.js';
import { alphaOf, dissolveOf, emit, rgb01, stageAngle, stageLen, stageOf } from './_emit.js';

export const ELECTRIC_SCALE = Object.freeze({ bolt: 1.6, jag: 1.5, body: 1.6, projectile: 1.8, glow: 1.6 });
/** Jags and trailing forks re-roll this often (Hz), like the canvas kit's flicker clock. */
export const FLICKER_HZ = 14;
const JAG_POINTS = 7;
const SPARKS = 6;
const GLOW_TEXTURE = 'TEX_VFX_Gradient_Radial.webp';
const SPARK_TEXTURE = 'TEX_VFX_Sparkle_2x2.webp';
const DEG = Math.PI / 180;

/** A small seeded generator (mulberry32): the same seed and flicker step give the same jags. */
export function flickerRandom(seed, time) {
  let state = (Math.floor((Number(time) || 0) * FLICKER_HZ) * 2654435761 + Math.floor((Number(seed) || 0) * 1000)) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const colours = (kit) => ({ hot: rgb01(kit.palette.hot), glow: rgb01(kit.palette.body) });

/** Emits one polyline (points already in stage px) as bolt segments; returns how many queued. */
function emitLine(ctx, points, options) {
  let queued = 0;
  for (const segment of boltSegments(points, options)) queued += emit(ctx, 'bolt', segment) ? 1 : 0;
  return queued;
}

/**
 * A jagged line in the kit's own space from (x, y) along `angleDeg`, `length` long, its kinks
 * pushed off the axis by up to `jag` × length, re-rolled on the flicker clock.
 */
export function jagPoints({ x, y, angleDeg, length }, { jag = 0.18, seed = 0, time = 0 } = {}) {
  const rand = flickerRandom(seed, time);
  const ux = Math.cos(angleDeg * DEG);
  const uy = Math.sin(angleDeg * DEG);
  const points = [];
  for (let i = 0; i <= JAG_POINTS; i += 1) {
    const t = i / JAG_POINTS;
    const kink = i === 0 || i === JAG_POINTS ? 0 : (rand() - 0.5) * 2 * jag * length * Math.sin(Math.PI * t);
    points.push([x + ux * length * t - uy * kink, y + uy * length * t + ux * kink]);
  }
  return points;
}

/** Lightning along the drawer's polylines (`lines` = [[x, y]...][]), in its own space. */
function jagStroke(ctx, lines, { width, alpha = 1 }) {
  if (!(width > 0) || !(alpha > 0) || !lines?.length) return;
  const { hot, glow } = colours(this.base);
  const stageWidth = stageLen(ctx, width) * ELECTRIC_SCALE.bolt;
  const a = alphaOf(ctx, alpha);
  lines.forEach((line, index) => {
    const points = line.map(([px, py]) => stageOf(ctx, px, py));
    // The first line is the trunk; branches run thinner and dimmer.
    const trunk = index === 0;
    emitLine(ctx, points, { width: trunk ? stageWidth : stageWidth * 0.6, alpha: trunk ? a : a * 0.8, seed: index * 1.7, hot, glow });
  });
  // A flash of light where the trunk lands.
  const end = lines[0]?.[lines[0].length - 1];
  if (end) {
    emit(ctx, 'sprite', { texture: GLOW_TEXTURE, at: stageOf(ctx, end[0], end[1]), size: stageWidth * 14, colour: rgb01(this.base.palette.body, 1.2), alpha: a * 0.55 });
  }
}

/** A jag from its base along `angleDeg`: a short bolt, faint at its root so fans do not stack. */
function tongue(ctx, spec, { alpha = 1, hot = 1, jag = 0 } = {}) {
  if (!(spec?.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
  const points = jagPoints(spec, { jag: 0.12 + 0.2 * jag, seed: spec.seed ?? 0, time: spec.time ?? 0 }).map(([px, py]) =>
    stageOf(ctx, px, py)
  );
  const { glow } = colours(this.base);
  const length = stageLen(ctx, spec.length);
  emitLine(ctx, points, {
    width: stageLen(ctx, spec.width) * 0.35 * ELECTRIC_SCALE.jag,
    alpha: alphaOf(ctx, alpha),
    seed: spec.seed ?? 0,
    hot: rgb01(this.base.palette.hot, 0.6 + 0.4 * Math.min(1, Math.max(0, hot))),
    glow,
    rootAlpha: 0.1,
    rampPx: length * 0.25,
  });
}

/** A charged ball: plasma. `hot` dims its white heart. */
function body(ctx, x, y, r, alpha, hot = 1) {
  if (!(r > 0) || !(alpha > 0)) return;
  const { hot: hotColour, glow } = colours(this.base);
  emit(ctx, 'plasma', {
    at: stageOf(ctx, x, y),
    radius: stageLen(ctx, r) * ELECTRIC_SCALE.body,
    alpha: alphaOf(ctx, alpha),
    heat: hot,
    seed: r * 0.37,
    dissolve: dissolveOf(ctx),
    hot: hotColour,
    glow,
  });
}

/** A soft light halo in the body colour. */
function glow(ctx, x, y, r, alpha) {
  if (!(r > 0) || !(alpha > 0)) return;
  emit(ctx, 'sprite', {
    texture: GLOW_TEXTURE,
    at: stageOf(ctx, x, y),
    size: stageLen(ctx, r) * 2 * ELECTRIC_SCALE.glow,
    colour: rgb01(this.base.palette.body, 1),
    alpha: alphaOf(ctx, alpha) * 0.5,
    dissolve: dissolveOf(ctx),
  });
}

/**
 * A spark in flight along `headingDeg`: a plasma ball dragging forked bolts behind it, sparks
 * thrown off, and a light halo. Everything re-rolls on the flicker clock from time and seed.
 */
function projectile(ctx, { x, y, r, headingDeg = 0, time = 0, seed = 0, alpha = 1, tongues = 3, hot = 1 }) {
  if (!(r > 0) || !(alpha > 0)) return;
  const at = stageOf(ctx, x, y);
  const radius = stageLen(ctx, r) * ELECTRIC_SCALE.projectile;
  const heading = stageAngle(ctx, headingDeg) * DEG;
  const a = alphaOf(ctx, alpha);
  const { hot: hotColour, glow: glowColour } = colours(this.base);
  const rand = flickerRandom(seed, time);
  emit(ctx, 'sprite', { texture: GLOW_TEXTURE, at, size: radius * 5, colour: rgb01(this.base.palette.body, 1), alpha: a * 0.4 });
  for (let k = 0; k < Math.max(0, tongues); k += 1) {
    const spread = (tongues > 1 ? -0.5 + k / (tongues - 1) : 0) * 0.9 + (rand() - 0.5) * 0.35;
    const back = heading + Math.PI + spread;
    const length = radius * (2.2 + 1.2 * rand());
    const tip = { x: at.x + Math.cos(back) * length, y: at.y + Math.sin(back) * length, z: at.z };
    const points = [at];
    for (let i = 1; i < 5; i += 1) {
      const t = i / 5;
      const kink = (rand() - 0.5) * radius * 0.9;
      points.push({ x: at.x + (tip.x - at.x) * t - Math.sin(back) * kink, y: at.y + (tip.y - at.y) * t + Math.cos(back) * kink, z: at.z });
    }
    points.push(tip);
    emitLine(ctx, points, { width: radius * 0.16, alpha: a * 0.85, seed: seed + k, hot: hotColour, glow: glowColour, rootAlpha: 0.2, rampPx: radius });
  }
  emit(ctx, 'plasma', { at, radius, alpha: a, heat: hot, seed, dissolve: dissolveOf(ctx), hot: hotColour, glow: glowColour });
  for (let k = 0; k < SPARKS; k += 1) {
    const angle = rand() * Math.PI * 2;
    const distance = radius * (1.1 + rand() * 1.6);
    emit(ctx, 'sprite', {
      texture: SPARK_TEXTURE,
      at: { x: at.x + Math.cos(angle) * distance, y: at.y + Math.sin(angle) * distance, z: at.z + radius * rand() },
      size: radius * (0.3 + 0.3 * rand()),
      rotation: rand() * 360,
      frame: k,
      colour: rgb01(this.base.palette.hot, 2.2),
      alpha: a * (0.5 + 0.5 * rand()),
    });
  }
}

export const electricElements = elementKit({ jagStroke, tongue, body, glow, projectile });
