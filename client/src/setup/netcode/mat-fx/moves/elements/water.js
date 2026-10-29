// Design 077 slice 4: the water element kit. Sheets and splash tongues become tapering water
// streams that refract the board, bodies become refracting water drops, a travelling shot a drop
// dragging streams and throwing droplets, the halo a soft light, and a straight beam (Hydro Pump,
// Water Gun) one even column of running water from the attacker to the defender with a breaking
// head. Wider than the canvas sheets (user: bigger effects, 2026-10-29).
import { beamPose } from '../move-poses.mjs';
import { beamPoint } from '../move-drawers.js';
import { elementKit } from './_kit.js';
import { alphaOf, dissolveOf, emit, rgb01, stageAngle, stageLen, stageOf } from './_emit.js';

export const WATER_SCALE = Object.freeze({ stream: 1.4, streamLength: 1.25, drop: 1.6, projectile: 1.8, beam: 1.5, glow: 1.4 });
const DROPLETS = 8;
const DROPLET_TEXTURE = 'T_VFX_Water_Drop_Blurred.webp';
const GLOW_TEXTURE = 'TEX_VFX_Gradient_Radial.webp';
const SPLASH_TEXTURE = 'T_VFX_Water_Splash_2x2.webp';
const DEG = Math.PI / 180;

const paletteOf = (kit) => ({ deep: rgb01(kit.palette.deep), body: rgb01(kit.palette.body), hot: rgb01(kit.palette.hot) });

/** A stream of water from (spec.x, spec.y) along spec.angleDeg: a tapering water beam. */
function tongue(ctx, spec, { alpha = 1 } = {}) {
  if (!(spec?.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
  const length = spec.length * WATER_SCALE.streamLength;
  emit(ctx, 'waterBeam', {
    from: stageOf(ctx, spec.x, spec.y),
    to: stageOf(ctx, spec.x + Math.cos(spec.angleDeg * DEG) * length, spec.y + Math.sin(spec.angleDeg * DEG) * length),
    width: stageLen(ctx, spec.width) * WATER_SCALE.stream,
    alpha: alphaOf(ctx, alpha),
    seed: spec.seed ?? 0,
    taper: 1,
    flow: 1.4,
    dissolve: dissolveOf(ctx),
    palette: paletteOf(this.base),
  });
}

/** A ball of water: a refracting drop. */
function body(ctx, x, y, r, alpha) {
  if (!(r > 0) || !(alpha > 0)) return;
  emit(ctx, 'waterDrop', {
    at: stageOf(ctx, x, y),
    radius: stageLen(ctx, r) * WATER_SCALE.drop,
    alpha: alphaOf(ctx, alpha),
    seed: r * 0.37,
    dissolve: dissolveOf(ctx),
    palette: paletteOf(this.base),
  });
}

/** A soft cool light. */
function glow(ctx, x, y, r, alpha) {
  if (!(r > 0) || !(alpha > 0)) return;
  emit(ctx, 'sprite', {
    texture: GLOW_TEXTURE,
    at: stageOf(ctx, x, y),
    size: stageLen(ctx, r) * 2 * WATER_SCALE.glow,
    colour: rgb01(this.base.palette.body, 0.8),
    alpha: alphaOf(ctx, alpha) * 0.35,
    dissolve: dissolveOf(ctx),
  });
}

/**
 * A water shot along `headingDeg`: a drop leading streams behind it, droplets thrown off its
 * flanks. Placed by time and seed alone, so a frozen preview stands still.
 */
function projectile(ctx, { x, y, r, headingDeg = 0, time = 0, seed = 0, alpha = 1, tongues = 3 }) {
  if (!(r > 0) || !(alpha > 0)) return;
  const at = stageOf(ctx, x, y);
  const radius = stageLen(ctx, r) * WATER_SCALE.projectile;
  const heading = stageAngle(ctx, headingDeg) * DEG;
  const a = alphaOf(ctx, alpha);
  const dissolve = dissolveOf(ctx);
  const palette = paletteOf(this.base);
  const back = heading + Math.PI;
  for (let k = 0; k < Math.max(0, tongues); k += 1) {
    const spread = (tongues > 1 ? -0.5 + k / (tongues - 1) : 0) * 0.7 + 0.08 * Math.sin(time * 4 + seed + k);
    const length = radius * (2.6 + 0.8 * Math.abs(Math.sin(seed * 3.1 + k * 1.9)));
    emit(ctx, 'waterBeam', {
      from: at,
      to: { x: at.x + Math.cos(back + spread) * length, y: at.y + Math.sin(back + spread) * length, z: at.z },
      width: radius * 1.2,
      alpha: a * 0.9,
      seed: seed + k * 2.1,
      taper: 1,
      flow: 2,
      dissolve,
      palette,
    });
  }
  emit(ctx, 'waterDrop', { at, radius, alpha: a, seed, dissolve, palette });
  for (let k = 0; k < DROPLETS; k += 1) {
    const phase = (((time * 1.6 + k * 0.173 + seed * 0.29) % 1) + 1) % 1;
    const side = back + (k % 2 ? 1 : -1) * (0.6 + 0.5 * Math.abs(Math.sin(k * 2.7 + seed)));
    const distance = radius * (1 + phase * 2.6);
    emit(ctx, 'sprite', {
      texture: DROPLET_TEXTURE,
      at: { x: at.x + Math.cos(side) * distance, y: at.y + Math.sin(side) * distance, z: at.z + radius * 0.6 * Math.sin(Math.PI * phase) },
      size: radius * (0.35 - 0.15 * phase),
      colour: rgb01(this.base.palette.hot, 1.3),
      alpha: a * (1 - phase),
    });
  }
}

/**
 * A straight beam (drawer `beam`, kinds solid / widening / segmented): even water columns over
 * the pose's segments, a breaking splash at the head. The other kinds (helix, pulse-train) are
 * strings of bodies: returning false leaves them to the canvas drawer, whose bodies are drops.
 */
function beam(ctx, lane, s, info) {
  const pose = beamPose(s, lane, info.params);
  if (!(pose.to > pose.from)) return;
  const kind = info.params?.kind ?? 'solid';
  if (kind === 'helix' || kind === 'pulse-train') return false;
  const palette = paletteOf(info.material);
  const width = stageLen(ctx, pose.width) * WATER_SCALE.beam;
  const dissolve = dissolveOf(ctx);
  for (const [index, segment] of pose.segments.entries()) {
    const a = beamPoint(lane, segment.f0, 0);
    const b = beamPoint(lane, segment.f1, 0);
    emit(ctx, 'waterBeam', {
      from: stageOf(ctx, a.x, a.y),
      to: stageOf(ctx, b.x, b.y),
      width: kind === 'segmented' ? width * 0.8 : width,
      alpha: alphaOf(ctx, segment.alpha),
      seed: info.seed + index * 1.3,
      taper: 0,
      flow: 2.4,
      foam: 0.75,
      dissolve,
      palette,
    });
  }
  // The head breaks into spray: the splash flipbook, standing up where the water lands.
  const head = beamPoint(lane, pose.to, 0);
  const at = stageOf(ctx, head.x, head.y);
  const frame = Math.floor((info.elapsedMs ?? 0) / 70);
  for (let k = 0; k < 3; k += 1) {
    emit(ctx, 'sprite', {
      texture: SPLASH_TEXTURE,
      at: { ...at, z: at.z + width * 0.3 },
      size: width * (2.4 + 0.6 * k),
      rotation: 120 * k + (info.seed ?? 0) * 40,
      frame: frame + k,
      colour: rgb01(info.material.palette.hot, 1.4),
      alpha: alphaOf(ctx, 0.75),
      dissolve,
    });
  }
}

export const waterElements = elementKit({ tongue, body, glow, projectile, beats: { beam } });
