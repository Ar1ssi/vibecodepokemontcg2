// Design 063: the shared beat library. Every drawer is `draw(ctx, lane, s, info)` where `s`
// in [0, 1) is the beat's progress, `lane` the host-local lane (move-geometry.mjs) and
// `info = { elapsedMs, beatMs, time, seed, material, params, spec }` (params already have
// their defaults). The pure math lives in move-poses.mjs; a drawer only maps it to material
// calls. A drawer draws nothing when `s` is out of range, leaves `ctx.filter` at 'none' and
// the context state balanced, and never sets `globalCompositeOperation` (the player does:
// source-over for vignette / smoke / terrain cracks / shade, additive for everything else).
// Design 065: `info.materialAt(i)` is item i's material on the multi-item drawers (beat `hues`),
// anchored drawers place themselves with `anchorPoint`, and travelling / orbiting drawers draw
// their `unit` (materials/_units.js; 'body' is the material's own body / projectile).
// Design 078: travelling and burst drawers own their exit as a GPU dissolve (`burnOut`), called
// inside the drawer or by the registry's `burning` wrapper (IMPLEMENTATIONS), and
// every drawer owns its place in height (`ctx.fxLift`, beat-lift.mjs): no beat lies on the cloth.
import { rgbCss } from '../fx-colors.mjs';
import { LIFT, anchorLift, bodyLift, burstLift, standOn, travelLift } from './beat-lift.mjs';
import { LEAD_H, lanePoint, skyLane } from './move-geometry.mjs';
import { dissolveTail, withFxMod } from './materials/_mods.js';
import { getNoiseTile } from './materials/_shared.js';
import { UNITS } from './materials/_units.js';
import { DRAWER_PARAMS, checkParams, tonguesAt } from './move-spec.mjs';
import { hoopCoil, skyColumn } from './max/psychic-fairy-drawers.js';
// design 092 ghost-dark-dragon
import { GHOST_DARK_DRAGON_DRAWERS } from './max/ghost-dark-dragon-drawers.js';
import { STORM_GREYS, stormCloudPose } from './max/storm-cloud.mjs';
import {
  armTongues,
  auraPose,
  beamPose,
  anchorPoint,
  boltAfterimage,
  boltPoses,
  boltStep,
  chainPose,
  chargeCore,
  clusterPose,
  fanPose,
  finsPose,
  gripPose,
  laneFromPoint,
  pillarColumns,
  shadePose,
  chargeOrbs,
  cloudPose,
  flarePose,
  flashPose,
  glyphPose,
  pillarPose,
  projectilePose,
  shotFlarePose,
  rainPose,
  raysPose,
  releaseRings,
  ringPose,
  shardsPose,
  slashPose,
  smokePuffs,
  spiralPose,
  splashPose,
  terrainPose,
  vignettePose,
  volleyPose,
} from './move-poses.mjs';
// design 092 ground-rock-steel
import { monolithPose } from './max/ground-rock-steel-poses.mjs';
// design 092 grass-bug-flying
import { prop, tornado, vine } from './max/max-drawers-gbf.js';
// design 092 water-ice
import { alphaOf, dissolveOf, elementsLive, emit, rgb01, stageAngle, stageLen, stageOf } from './elements/_emit.js';
import { auroraVeilPose, chiCrescentPose, splashCrownPose, surgeStonesPose } from './max/water-ice-poses.mjs';

const TAU = Math.PI * 2;
const HELIX_SAMPLES = 12;

export const centreOf = (lane, target) => (target === 'attacker' ? { x: lane.ax, y: lane.ay } : { x: lane.bx, y: lane.by });
/** An anchored beat's point: its target (kind anchor) moved by its dx / dy. */
export const anchorOf = (lane, p) => anchorPoint(lane, p.target, p.dx, p.dy);
/** Item i's material: the hued one when the beat has hues, else the beat material. */
const itemMaterial = (info, i) => (typeof info.materialAt === 'function' ? info.materialAt(i) : info.material);
const isSky = (target) => target === 'sky' || target === 'sky-attacker';

// Design 078: where each travelling / burst beat starts burning away, as a fraction of its
// progress. Each starts at or a little before its pose's own alpha fade, so on the GPU canvas
// the noise eats the shape (rims blooming) while it is still bright; Canvas2D ignores `fxMod`,
// so there the pose's fade is the exit. Held, anchored and charging beats keep their fades, and
// glows (impactFlash, every `material.glow` a drawer calls) fade whole: a dissolving soft glow
// read as dull grey blotches, so only bodies, tongues, strokes and shards burn.
const BURN_FROM = Object.freeze({
  projectile: 0.85, // lands nearly whole and burns into the target over its last stretch
  volley: 0.7, // per ball, by the lane fraction it has covered (its own progress)
  shockRings: 0.4,
  ring: 0.45,
  fins: 0.6,
  splash: 0.5,
  shards: 0.5,
  slashArc: 0.55,
  bolt: 0.55,
  pillar: 0.65, // per column
  fan: 0.7,
});
/** A beam starts burning a quarter of its retract before the retract does. */
const BEAM_BURN_LEAD = 1.25;

/** Runs `draw` with the dissolve at `amount`, merged over whatever the caller set (078 contract). */
const burnOut = (ctx, amount, draw) => withFxMod(ctx, { dissolve: { amount } }, draw);

const WHOLE = Object.freeze({ dissolve: Object.freeze({ amount: 0 }) });
/** A drawer's `material.glow`, kept out of any dissolve round it: it fades, it never burns. */
const glowWhole = (ctx, material, x, y, r, alpha) => withFxMod(ctx, WHOLE, () => material.glow(ctx, x, y, r, alpha));

/**
 * `draw` lifted as a whole by `liftOf(lane, params)`. A drawer may also assign `ctx.fxLift` itself
 * (per item); `guarded` puts the caller's lift back after every draw.
 */
const lifted = (draw, liftOf) => (ctx, lane, s, info) => {
  ctx.fxLift = liftOf(lane, info.params);
  draw(ctx, lane, s, info);
};

/**
 * A travelling / orbiting body: the material's own projectile for unit 'body' (063), else the
 * unit drawn in the material's palette at the body's alpha.
 */
const drawUnit = (ctx, material, unit, s, body) => {
  if (!unit || unit === 'body' || !Object.hasOwn(UNITS, unit)) {
    material.projectile(ctx, body);
    return;
  }
  if (!(body.alpha > 0)) return;
  ctx.save();
  ctx.globalAlpha *= body.alpha;
  UNITS[unit](ctx, body.x, body.y, body.r, body.headingDeg, s, material.palette);
  ctx.restore();
};

const poseParams = (info) => ({ ...info.params, beatMs: info.beatMs });

const guarded = (name, draw) =>
  Object.freeze({
    draw(ctx, lane, s, info) {
      if (!(s >= 0 && s < 1)) return;
      const lift = ctx.fxLift ?? null;
      ctx.save();
      try {
        draw(ctx, lane, s, info);
      } finally {
        ctx.filter = 'none';
        ctx.restore();
        ctx.fxLift = lift;
      }
    },
    check: (params) => checkParams(name, params),
    tonguesAt: (params) => tonguesAt(name, params),
  });

/** A tongue starting at (x, y) and ending where it points `length` px along `angleDeg`. */
const drawTongueAt = (ctx, info, x, y, angleDeg, length, width, seedOffset, opts, material = info.material) =>
  material.tongue(
    ctx,
    { x, y, angleDeg, length, width, time: info.time, seed: info.seed + seedOffset },
    opts
  );

const orbitCharge = (ctx, lane, s, info) => {
  const { params: p } = info;
  const target = p.target ?? 'attacker';
  const c = anchorOf(lane, { target, dx: p.dx, dy: p.dy });
  ctx.fxLift = anchorLift(lane, target, c, { stand: 0, z: LIFT.travelZ });
  chargeOrbs(s, lane.h, p).forEach((orb, index) => {
    if (p.half === 'front' && orb.depth < 0) return;
    if (p.half === 'back' && orb.depth >= 0) return;
    drawUnit(ctx, itemMaterial(info, index), p.unit, s, {
      x: c.x + orb.dx,
      y: c.y + orb.dy,
      r: orb.r,
      headingDeg: orb.heading,
      time: info.time,
      seed: info.seed + orb.dx,
      alpha: orb.alpha,
      tongues: p.tongues,
      hot: 0.8,
    });
  });
};

const coreCharge = (ctx, lane, s, info) => {
  const p = info.params;
  const core = chargeCore(s, lane.h, p);
  const target = p.target ?? 'attacker';
  const base = anchorOf(lane, { target, dx: p.dx, dy: p.dy });
  // A sky orb hangs at its point; on a card it builds `lead` h up the lane, as in 063.
  const x = isSky(target) ? base.x : base.x + lane.ux * core.x + lane.nx * core.y;
  const y = isSky(target) ? base.y : base.y + lane.uy * core.x + lane.ny * core.y;
  // It hangs at chest height facing the camera, where the shot or beam then leaves from.
  ctx.fxLift = anchorLift(lane, target, { x, y }, { stand: LIFT.bodyStand, z: LIFT.travelZ });
  glowWhole(ctx, info.material, x, y, core.r * 2, core.alpha * 0.5);
  // A dim white heart (design 075 parity): at .9 the gathering orb bloomed into a white blob.
  info.material.body(ctx, x, y, core.r, core.alpha, 0.45);
  // Rings: tongue arcs round the body at 1.25 r, one turn a second.
  const rings = p.rings ?? 0;
  if (rings > 0 && core.r > 0 && core.alpha > 0) {
    const radius = core.r * 1.25;
    for (let k = 0; k < rings; k += 1) {
      const a = TAU * (info.elapsedMs / 1000) + (k * Math.PI) / rings + k * 0.6;
      const tx = x + Math.cos(a) * radius;
      const ty = y + Math.sin(a) * radius * 0.45;
      const heading = (Math.atan2(Math.cos(a) * 0.45, -Math.sin(a)) * 180) / Math.PI;
      drawTongueAt(ctx, info, tx, ty, heading, radius * 1.4, core.r * 0.3, 5 + k, { alpha: core.alpha * 0.9 });
    }
  }
};

const shockRings = (ctx, lane, s, info) => {
  const c = anchorOf(lane, { target: info.params.target ?? 'attacker', dx: info.params.dx, dy: info.params.dy });
  for (const ring of releaseRings(s, lane.h, info.params)) {
    ctx.strokeStyle = rgbCss(info.material.palette.body, ring.alpha);
    ctx.lineWidth = ring.width;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, ring.r, ring.r * info.params.squash, 0, 0, TAU);
    ctx.stroke();
  }
};

/** A flarePose / shotFlarePose at (x, y): glow, arm tongues, then the core. `h` scales the glow. */
const drawFlare = (ctx, info, x, y, flare, h) => {
  glowWhole(ctx, info.material, x, y, h * 1.3, flare.core.alpha * 0.4);
  flare.arms.forEach((arm, index) => {
    const a = (arm.angle * Math.PI) / 180;
    for (const tongue of armTongues(arm, flare.breakUp)) {
      drawTongueAt(
        ctx,
        info,
        x + Math.cos(a) * tongue.from,
        y + Math.sin(a) * tongue.from,
        tongue.angleDeg,
        tongue.length,
        tongue.width,
        index * 3.3 + tongue.from * 0.01,
        { alpha: tongue.alpha, hot: 1 - 0.5 * flare.breakUp }
      );
    }
  });
  info.material.body(ctx, x, y, flare.core.r, flare.core.alpha, 1);
};

/**
 * A body flying along `path` (a drain flies it backwards), drawn at `at`: a drop from the sky
 * falls out of the air onto the defender; anything else arcs off the attacker at chest height and
 * comes down on the defender, its disc turned to the camera.
 */
const flightLift = (lane, from, path, at) =>
  from === 'sky' ? standOn({ x: lane.bx, y: lane.by }) : bodyLift(lanePoint(path, 0), lanePoint(path, 1), at);

const projectile = (ctx, lane, s, info) => {
  const from = info.params.from ?? 'attacker';
  const ball = projectilePose(s, lane.h, info.params);
  const back = from === 'defender';
  let path = lane;
  if (from === 'sky') path = skyLane(lane);
  else if (from === 'sky-attacker') {
    const start = anchorPoint(lane, 'sky-attacker');
    path = laneFromPoint(lane, start.x, start.y);
  }
  const at = lanePoint(path, back ? 1 - ball.f : ball.f, ball.side);
  ctx.fxLift = flightLift(lane, from, path, at);
  if (info.params.flare !== 'none') {
    // Lands whole: the starFlare at contact takes it over without a jump (shotFlarePose).
    drawFlare(ctx, info, at.x, at.y, shotFlarePose(s, lane.h, info.params), lane.h * info.params.size);
    return;
  }
  burnOut(ctx, dissolveTail(s, BURN_FROM.projectile), () =>
    drawUnit(ctx, info.material, info.params.unit, s, {
      x: at.x,
      y: at.y,
      r: ball.r,
      headingDeg: path.angleDeg + ball.headingDeg + (back ? 180 : 0),
      time: info.time,
      seed: info.seed,
      alpha: ball.alpha,
      tongues: info.params.tongues,
    })
  );
};

const vignette = (ctx, lane, s, info) => {
  const v = vignettePose(s, lane.h, info.params);
  if (!(v.alpha > 0)) return;
  const c = centreOf(lane, info.params.target);
  const shade = info.material.shade;
  const g = ctx.createRadialGradient(c.x, c.y, v.inner, c.x, c.y, v.outer);
  g.addColorStop(0, rgbCss(shade, 0));
  g.addColorStop(0.45, rgbCss(shade, v.alpha));
  g.addColorStop(1, rgbCss(shade, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c.x, c.y, v.outer, 0, TAU);
  ctx.fill();
};

const speedRays = (ctx, lane, s, info) => {
  const rays = raysPose(s, lane.h, info.params);
  if (!(rays.alpha > 0)) return;
  const c = anchorOf(lane, info.params);
  ctx.strokeStyle = rgbCss(info.material.palette.hot, rays.alpha);
  ctx.lineWidth = lane.h * 0.03;
  ctx.beginPath();
  for (let i = 0; i < rays.count; i += 1) {
    const a = (i / rays.count) * TAU + rays.spin;
    ctx.moveTo(c.x + Math.cos(a) * rays.inner, c.y + Math.sin(a) * rays.inner);
    ctx.lineTo(c.x + Math.cos(a) * rays.outer, c.y + Math.sin(a) * rays.outer);
  }
  ctx.stroke();
};

const starFlare = (ctx, lane, s, info) => {
  const c = anchorOf(lane, info.params);
  drawFlare(ctx, info, c.x, c.y, flarePose(s, lane.h, info.params), lane.h * info.params.size);
};

const impactFlash = (ctx, lane, s, info) => {
  const flash = flashPose(s, lane.h, info.params);
  if (!(flash.alpha > 0)) return;
  const c = centreOf(lane, info.params.target);
  const { palette } = info.material;
  const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, flash.r);
  g.addColorStop(0, rgbCss(palette.white, flash.alpha));
  g.addColorStop(0.5, rgbCss(palette.core, flash.alpha * 0.7));
  g.addColorStop(1, rgbCss(palette.hot, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c.x, c.y, flash.r, 0, TAU);
  ctx.fill();
};

const smoke = (ctx, lane, s, info) => {
  const tint = info.material.smoke;
  if (!tint) return;
  const c = centreOf(lane, info.params.target);
  for (const puff of smokePuffs(s, lane.h, info.params)) {
    const x = c.x + puff.dx;
    const y = c.y + puff.dy;
    const g = ctx.createRadialGradient(x, y, 0, x, y, puff.r);
    g.addColorStop(0, rgbCss(tint, puff.alpha));
    g.addColorStop(1, rgbCss(tint, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, puff.r, 0, TAU);
    ctx.fill();
  }
};

// A beam is a column of light, not a stretched tongue: a tongue tapers to a tip, so drawn
// lane-long it read as a short spike (an icicle on ice), and the lane from the attacker's
// leading edge is under 0.8 h when both cards are Active. The column starts BEAM_ORIGIN_H in
// from that edge (it leaves the attacker's face), keeps its width to the head, and carries the
// material in its colours and in BEAM_MOTES bodies streaming down it.
const BEAM_ORIGIN_H = 0.3;
const BEAM_MOTES = 4;
/** Glow, body, hot and core passes: [palette key, width factor, alpha]. */
// Design 075 parity: drawn additively and bloomed, the old passes (hot .8, a .26-wide white core and
// white streaks) summed to a white slab; the body colour now leads and the white is a thin filament.
const BEAM_PASSES = [
  ['deep', 1.7, 0.22],
  ['body', 1.1, 0.55],
  ['hot', 0.55, 0.5],
  ['white', 0.12, 0.8],
];

/** The lane point `f` along a beam that starts BEAM_ORIGIN_H back inside the attacker. */
export const beamPoint = (lane, f, side = 0) => {
  const run = Math.max(lane.length - lane.h * LEAD_H, 1);
  const back = (lane.h * BEAM_ORIGIN_H) / run;
  return lanePoint(lane, -back + (1 + back) * f, side);
};

/** One straight column of light from a to b, round-capped, `width` wide. */
const beamColumn = (ctx, palette, a, b, width, alpha, time, dashed = false) => {
  if (!(width > 0) || !(alpha > 0) || (a.x === b.x && a.y === b.y)) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (const [key, factor, passAlpha] of BEAM_PASSES) {
    ctx.strokeStyle = rgbCss(palette[key] ?? palette.core, passAlpha * alpha);
    ctx.lineWidth = width * factor;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // Energy streaks racing down the core, so a held beam still reads as flowing.
  const streak = width * (dashed ? 0.9 : 1.6);
  ctx.setLineDash([streak, streak * 1.4]);
  ctx.lineDashOffset = -time * width * 9;
  ctx.strokeStyle = rgbCss(palette.hot ?? palette.core, 0.5 * alpha);
  ctx.lineWidth = width * 0.3;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
};

const beam = (ctx, lane, s, info) => {
  const pose = beamPose(s, lane, info.params);
  const { material, params: p } = info;
  const toPoint = (f) => beamPoint(lane, f, 0);
  if (pose.to <= pose.from) return;
  if (p.kind === 'helix') {
    beamColumn(ctx, material.palette, toPoint(pose.from), toPoint(pose.to), pose.width * 0.3, 0.55, info.time);
    for (const strand of pose.segments) {
      for (let i = 0; i <= HELIX_SAMPLES; i += 1) {
        const u = i / HELIX_SAMPLES;
        const f = strand.f0 + (strand.f1 - strand.f0) * u;
        const side = strand.side * Math.sin(strand.turns * TAU * u + strand.phase);
        const at = beamPoint(lane, f, side);
        material.body(ctx, at.x, at.y, pose.width * 0.22, 0.9, 0.8);
      }
    }
    return;
  }
  if (p.kind === 'pulse-train') {
    for (const seg of pose.segments) {
      const at = toPoint(seg.f0);
      material.body(ctx, at.x, at.y, pose.width * 0.5, seg.alpha, 0.9);
    }
    return;
  }
  const segmented = p.kind === 'segmented';
  const tail = toPoint(pose.from);
  const head = toPoint(pose.to);
  glowWhole(ctx, material, tail.x, tail.y, pose.width * 1.1, 0.4);
  for (const seg of pose.segments) {
    beamColumn(ctx, material.palette, toPoint(seg.f0), toPoint(seg.f1), pose.width * (segmented ? 0.8 : 1), seg.alpha, info.time, segmented);
  }
  const reach = pose.to - pose.from;
  for (let i = 0; i < BEAM_MOTES; i += 1) {
    const f = pose.from + reach * ((i / BEAM_MOTES + info.time * 1.3) % 1);
    const at = beamPoint(lane, f, Math.sin(info.time * 7 + i * 2.1) * pose.width * 0.18);
    material.body(ctx, at.x, at.y, pose.width * 0.3, 0.85, 0.9);
  }
  glowWhole(ctx, material, head.x, head.y, pose.width * 1.8, 0.5);
  material.body(ctx, head.x, head.y, pose.width * 0.55, 0.9, 1);
};

const splash = (ctx, lane, s, info) => {
  const c = centreOf(lane, info.params.target);
  splashPose(s, lane.h, info.seed, info.params).forEach((t, index) => {
    drawTongueAt(ctx, info, c.x + t.x, c.y + t.y, t.angleDeg, t.length, t.width, index * 2.3, { alpha: t.alpha }, itemMaterial(info, index));
  });
};

const pillar = (ctx, lane, s, info) => {
  const c = anchorOf(lane, info.params);
  pillarColumns(s, lane.h, poseParams(info)).forEach((column, index) => {
    if (column.s === null) return;
    const material = itemMaterial(info, index);
    const t = pillarPose(column.s, lane.h, info.params);
    if (!(t.length > 0) || !(t.alpha > 0)) return;
    const x = c.x + column.x + t.x;
    const y = c.y + t.y;
    const seed = index * 4.1;
    // A column falling from above lands on the card: a kit that draws its tongues longer than the
    // pose (water) grows them back toward the sky, not on past the card onto the other Pokémon.
    const fixedTip = info.params?.from === 'above';
    // A column rises off the card's near edge (its base line in the 2D layout).
    ctx.fxLift = standOn({ x, y: c.y + 0.5 * lane.h });
    burnOut(ctx, dissolveTail(column.s, BURN_FROM.pillar), () => {
      drawTongueAt(ctx, info, x, y, t.angleDeg, t.length, t.width, seed, { alpha: t.alpha, hot: t.hot, fixedTip }, material);
      for (const side of [-1, 1]) {
        drawTongueAt(
          ctx,
          info,
          x + side * t.width * 0.3,
          y,
          t.angleDeg + side * 10,
          t.length * 0.7,
          t.width * 0.55,
          side + 2 + seed,
          { alpha: t.alpha * 0.85, hot: t.hot, fixedTip },
          material
        );
      }
    });
  });
};

const slashArc = (ctx, lane, s, info) => {
  const c = centreOf(lane, info.params.target);
  slashPose(s, lane.h, info.params).forEach((t, index) => {
    if (!(t.length > 0) || !(t.alpha > 0)) return;
    const x = c.x + t.x;
    const y = c.y + t.y;
    drawTongueAt(ctx, info, x, y, t.angleDeg, t.length, t.width, index * 2.7, { alpha: t.alpha, hot: 1 });
    const a = (t.angleDeg * Math.PI) / 180;
    ctx.strokeStyle = rgbCss(info.material.palette.white, t.alpha * t.edge * 0.9);
    ctx.lineWidth = Math.max(1, lane.h * 0.015);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * t.length, y + Math.sin(a) * t.length);
    ctx.stroke();
  });
};

const terrain = (ctx, lane, s, info) => {
  const c = centreOf(lane, info.params.target);
  const pose = terrainPose(s, lane.h, info.seed, info.params);
  const { palette } = info.material;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const line of pose.cracks) {
    ctx.strokeStyle = rgbCss(palette.deep, pose.alpha * 0.9);
    ctx.lineWidth = lane.h * 0.035;
    ctx.beginPath();
    line.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(c.x + x, c.y + y) : ctx.lineTo(c.x + x, c.y + y)));
    ctx.stroke();
  }
  for (const wave of pose.waves) {
    ctx.strokeStyle = rgbCss(palette.body, wave.alpha);
    ctx.lineWidth = lane.h * 0.05;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, wave.r, wave.r * 0.45, 0, 0, TAU);
    ctx.stroke();
  }
  const tint = info.material.smoke ?? palette.deep;
  for (const puff of pose.dust) {
    const x = c.x + puff.dx;
    const y = c.y + puff.dy;
    const g = ctx.createRadialGradient(x, y, 0, x, y, puff.r);
    g.addColorStop(0, rgbCss(tint, puff.alpha));
    g.addColorStop(1, rgbCss(tint, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, puff.r, 0, TAU);
    ctx.fill();
  }
};

const cloud = (ctx, lane, s, info) => {
  const c = anchorOf(lane, info.params);
  for (const puff of cloudPose(s, lane.h, info.seed, info.params)) {
    glowWhole(ctx, info.material, c.x + puff.dx, c.y + puff.dy, puff.r, puff.alpha);
  }
};

const spiral = (ctx, lane, s, info) => {
  const c = centreOf(lane, info.params.target);
  spiralPose(s, lane.h, info.params).forEach((t, index) => {
    drawTongueAt(ctx, info, c.x + t.x, c.y + t.y, t.angleDeg, t.length, t.width, index * 1.9, { alpha: t.alpha }, itemMaterial(info, index));
  });
};

const volley = (ctx, lane, s, info) => {
  const back = info.params.from === 'defender';
  const path = info.params.from === 'sky' ? skyLane(lane) : lane;
  volleyPose(s, lane.h, poseParams(info)).forEach((ball, index) => {
    const at = lanePoint(path, back ? 1 - ball.f : ball.f, ball.side);
    ctx.fxLift = flightLift(lane, info.params.from, path, at);
    burnOut(ctx, dissolveTail(ball.f, BURN_FROM.volley), () =>
      drawUnit(ctx, itemMaterial(info, index), info.params.unit, s, {
        x: at.x,
        y: at.y,
        r: ball.r,
        headingDeg: path.angleDeg + ball.headingDeg + (back ? 180 : 0),
        time: info.time,
        seed: info.seed + ball.side,
        alpha: ball.alpha,
        tongues: info.params.tongues,
      })
    );
  });
};

const aura = (ctx, lane, s, info) => {
  const pose = auraPose(s, lane.h, poseParams(info));
  if (!(pose.alpha > 0)) return;
  const c = centreOf(lane, info.params.target);
  // A pulsing glow only: the stroked circle it used to carry read as clip art (design 075 parity).
  glowWhole(ctx, info.material, c.x, c.y, pose.r * 1.35, pose.alpha * 0.7);
};

const rain = (ctx, lane, s, info) => {
  const c = centreOf(lane, info.params.target);
  rainPose(s, lane.h, info.seed, info.params).forEach((drop, index) => {
    if (drop.splash > 0) {
      glowWhole(ctx, info.material, c.x + drop.x, c.y + drop.y, lane.h * 0.2 * (0.4 + drop.splash), drop.alpha * 0.6);
      return;
    }
    drawTongueAt(ctx, info, c.x + drop.x, c.y + drop.y - drop.length, 90, drop.length, drop.width, index * 1.3, {
      alpha: drop.alpha,
    });
  });
};

// A burst flies out and burns away; a cluster is held to its end and keeps its fade-in.
const shards = (ctx, lane, s, info) => {
  const c = centreOf(lane, info.params.target);
  if (info.params.mode === 'cluster') {
    // Crystals growing upright out of the card's near edge.
    ctx.fxLift = standOn({ x: c.x, y: c.y + 0.5 * lane.h });
    drawShards(ctx, lane, s, info, true);
    return;
  }
  ctx.fxLift = burstLift(c);
  burnOut(ctx, dissolveTail(s, BURN_FROM.shards), () => drawShards(ctx, lane, s, info, false));
};

const drawShards = (ctx, lane, s, info, cluster) => {
  const c = centreOf(lane, info.params.target);
  const { unit } = info.params;
  const pose = cluster ? clusterPose(s, lane.h, info.seed, info.params) : shardsPose(s, lane.h, info.seed, info.params);
  pose.forEach((t, index) => {
    const material = itemMaterial(info, index);
    if (unit && unit !== 'body') {
      drawUnit(ctx, material, unit, s, {
        x: c.x + t.x,
        y: c.y + t.y - (cluster ? t.length * 0.5 : 0),
        r: t.length * 0.5,
        headingDeg: t.angleDeg,
        time: info.time,
        seed: info.seed + index,
        alpha: t.alpha,
        tongues: 0,
      });
      return;
    }
    drawTongueAt(ctx, info, c.x + t.x, c.y + t.y, t.angleDeg, t.length, t.width, index * 2.1, { alpha: t.alpha, jag: 1 }, material);
    if (cluster && t.length > 0 && t.alpha > 0) {
      // Lit on the upper edge: a hot glint at each fragment's tip.
      const a = (t.angleDeg * Math.PI) / 180;
      glowWhole(ctx, material, c.x + t.x + Math.cos(a) * t.length, c.y + t.y + Math.sin(a) * t.length, t.width * 0.9, t.alpha * 0.6);
    }
  });
};

const strokePolyline = (ctx, points) => {
  ctx.beginPath();
  points.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
};

const bolt = (ctx, lane, s, info) => {
  const poses = boltPoses(s, lane, info.seed, info.elapsedMs, info.params);
  const pose = poses[0];
  if (!(pose.alpha > 0)) return;
  const lines = poses.flatMap((one) => [one.points, ...one.branches]);
  // A material with its own lightning (electric) strokes the polylines in its jag passes. It is
  // also told which lines are trunks (one per bolt), where the trunks ran one re-roll ago and
  // which re-roll this is: a kit may taper the trunks, leave an afterimage and time the forks.
  if (typeof info.material.jagStroke === 'function') {
    const trunks = [];
    poses.reduce((index, one) => {
      trunks.push(index);
      return index + 1 + one.branches.length;
    }, 0);
    info.material.jagStroke(ctx, lines, {
      width: pose.width,
      alpha: pose.alpha,
      trunks,
      afterimage: boltAfterimage(s, lane, info.seed, info.elapsedMs, info.params).map((one) => one.points),
      step: boltStep(info.elapsedMs, info.params),
    });
    return;
  }
  const { palette } = info.material;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const passes = [
    [palette.body, 0.35, 2.4],
    [palette.hot, 0.9, 1],
    [palette.white, 1, 0.35],
  ];
  for (const [rgb, alpha, scale] of passes) {
    ctx.strokeStyle = rgbCss(rgb, alpha * pose.alpha);
    ctx.lineWidth = Math.max(1, pose.width * scale);
    for (const line of lines) strokePolyline(ctx, line);
  }
};

const ring = (ctx, lane, s, info) => {
  const { kind } = info.params;
  const fins = kind === 'fins';
  // A floor shockwave runs along the cloth; a face-on ring stands up round the target (Psychic).
  if (kind === 'face') ctx.fxLift = burstLift(anchorOf(lane, info.params), { stand: LIFT.faceStand });
  else if (fins) ctx.fxLift = burstLift(anchorOf(lane, info.params));
  burnOut(ctx, dissolveTail(s, fins ? BURN_FROM.fins : BURN_FROM.ring), () => (fins ? drawFins : drawRings)(ctx, lane, s, info));
};

const drawFins = (ctx, lane, s, info) => {
  const c = anchorOf(lane, info.params);
  finsPose(s, lane.h, poseParams(info)).forEach((t, index) => {
    drawTongueAt(ctx, info, c.x + t.x, c.y + t.y, t.angleDeg, t.length, t.width, index * 1.7, { alpha: t.alpha }, itemMaterial(info, index));
  });
};

const drawRings = (ctx, lane, s, info) => {
  const c = anchorOf(lane, info.params);
  const squash = info.params.kind === 'floor' ? 0.45 : 1;
  ringPose(s, lane.h, info.params).forEach((r, index) => {
    ctx.strokeStyle = rgbCss(itemMaterial(info, index).palette.hot, r.alpha);
    ctx.lineWidth = r.width;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, r.r, r.r * squash, 0, 0, TAU);
    ctx.stroke();
  });
};

/** A 4 x 3 grid of 1 px strokes over a 2r x 1.5r plate, turning 20°/s (`seconds` into the beat). */
const glyphLattice = (ctx, x, y, r, seconds, palette, alpha) => {
  ctx.translate(x, y);
  ctx.rotate((20 * seconds * Math.PI) / 180);
  ctx.strokeStyle = rgbCss(palette.hot, alpha);
  ctx.lineWidth = 1;
  ctx.beginPath();
  const w = r;
  const hh = r * 0.75;
  for (let i = 0; i <= 4; i += 1) {
    const gx = -w + (2 * w * i) / 4;
    ctx.moveTo(gx, -hh);
    ctx.lineTo(gx, hh);
  }
  for (let j = 0; j <= 3; j += 1) {
    const gy = -hh + (2 * hh * j) / 3;
    ctx.moveTo(-w, gy);
    ctx.lineTo(w, gy);
  }
  ctx.stroke();
};

const glyphHex = (ctx, x, y, r, spin, palette, alpha) => {
  ctx.translate(x, y);
  ctx.rotate((spin * Math.PI) / 180);
  ctx.beginPath();
  for (let k = 0; k < 6; k += 1) {
    const a = (k * TAU) / 6;
    if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = rgbCss(palette.body, alpha * 0.8);
  ctx.fill();
  ctx.strokeStyle = rgbCss(palette.core, alpha);
  ctx.lineWidth = 1;
  ctx.stroke();
};

const glyphHeart = (ctx, x, y, r, s, beatMs, palette, alpha, h) => {
  const pulse = 1 + 0.06 * Math.sin(TAU * 2 * s * (beatMs / 1000));
  const k = r * pulse;
  ctx.translate(x, y);
  ctx.beginPath();
  // A heart of height 2r: two lobes over a point.
  ctx.moveTo(0, k * 1);
  ctx.bezierCurveTo(-k * 1.3, k * 0.1, -k * 0.9, -k * 1, 0, -k * 0.45);
  ctx.bezierCurveTo(k * 0.9, -k * 1, k * 1.3, k * 0.1, 0, k * 1);
  ctx.closePath();
  ctx.fillStyle = rgbCss(palette.body, alpha * 0.5);
  ctx.fill();
  ctx.strokeStyle = rgbCss(palette.deep, alpha);
  ctx.lineWidth = Math.max(1, h * 0.03);
  ctx.stroke();
};

const glyph = (ctx, lane, s, info) => {
  const kind = info.params.kind ?? 'material';
  if (kind === 'material' && typeof info.material.sigil !== 'function') return;
  const pose = glyphPose(s, lane.h, info.params);
  if (!(pose.alpha > 0)) return;
  const c = anchorOf(lane, info.params);
  const { palette } = info.material;
  if (kind === 'lattice') return glyphLattice(ctx, c.x, c.y, pose.r, s * (info.beatMs / 1000), palette, pose.alpha);
  if (kind === 'hex') return glyphHex(ctx, c.x, c.y, pose.r, pose.spin, palette, pose.alpha);
  if (kind === 'heart') return glyphHeart(ctx, c.x, c.y, pose.r, s, info.beatMs, palette, pose.alpha, lane.h);
  ctx.globalAlpha = pose.alpha;
  info.material.sigil(ctx, c.x, c.y, pose.r, s);
};

// ---- design 065 § New pieces D ---------------------------------------------------

const fan = (ctx, lane, s, info) => {
  const pose = fanPose(s, lane.h, poseParams(info));
  if (!(pose.alpha > 0)) return;
  const c = anchorOf(lane, info.params);
  pose.tongues.forEach((t, index) => {
    if (!(t.length > 0)) return;
    drawTongueAt(ctx, info, c.x + t.x, c.y + t.y, lane.angleDeg + t.angleDeg, t.length, t.width, index * 2.9, { alpha: pose.alpha }, itemMaterial(info, index));
  });
};

const GIANT_EYES = [255, 210, 63]; // #FFD23F

const shadePath = (ctx, kind, x, y, rx, ry) => {
  ctx.beginPath();
  if (kind === 'dome') {
    ctx.ellipse(x, y, rx, ry, 0, Math.PI, TAU);
    ctx.closePath();
  } else if (kind === 'giant') {
    // A tall rounded silhouette: a head dome over shoulders widening to the floor.
    ctx.moveTo(x - rx * 1.3, y + ry);
    ctx.lineTo(x - rx, y - ry * 0.4);
    ctx.ellipse(x, y - ry * 0.4, rx, ry * 0.6, 0, Math.PI, TAU);
    ctx.lineTo(x + rx * 1.3, y + ry);
    ctx.closePath();
  } else {
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  }
};

const shade = (ctx, lane, s, info) => {
  const p = info.params;
  const pose = shadePose(s, lane.h, poseParams(info));
  if (!(pose.alpha > 0) || !(pose.rx > 0) || !(pose.ry > 0)) return;
  const c = anchorOf(lane, p);
  const x = c.x + pose.x;
  const y = c.y + pose.y;
  const { palette } = info.material;
  shadePath(ctx, p.kind, x, y, pose.rx, pose.ry);
  ctx.fillStyle = rgbCss(palette[p.fill] ?? palette.deep, p.fillAlpha * pose.alpha);
  ctx.fill();
  const tile = getNoiseTile();
  const pattern = tile ? ctx.createPattern(tile, 'repeat') : null;
  if (pattern) {
    // Value-noise mottling, turned by the swirl.
    ctx.save();
    shadePath(ctx, p.kind, x, y, pose.rx, pose.ry);
    ctx.clip();
    ctx.translate(x, y);
    ctx.rotate(pose.swirl);
    ctx.globalAlpha = 0.25 * pose.alpha;
    ctx.fillStyle = pattern;
    const reach = Math.max(pose.rx, pose.ry) * 1.5;
    ctx.fillRect(-reach, -reach, reach * 2, reach * 2);
    ctx.restore();
  }
  // The rim as a soft inner glow following the shape (design 075 parity: a stroked outline read as
  // clip art), drawn in a frame squashed so a circular gradient fits the ellipse.
  if (pose.rimAlpha > 0 && pose.rx > 0 && pose.ry > 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, pose.ry / pose.rx);
    const rim = ctx.createRadialGradient(0, 0, pose.rx * 0.5, 0, 0, pose.rx);
    rim.addColorStop(0, rgbCss(palette.body, 0));
    rim.addColorStop(0.82, rgbCss(palette.body, pose.rimAlpha * 0.55));
    rim.addColorStop(1, rgbCss(palette.hot, pose.rimAlpha * 0.2));
    ctx.fillStyle = rim;
    shadePath(ctx, p.kind, 0, 0, pose.rx, pose.rx);
    ctx.fill();
    ctx.restore();
  }
  if (p.kind === 'giant' && p.eyes) {
    ctx.fillStyle = rgbCss(GIANT_EYES, pose.alpha);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(x + side * pose.rx * 0.35, y - pose.ry * 0.55, pose.rx * 0.14, pose.rx * 0.07, 0, 0, TAU);
      ctx.fill();
    }
  }
};

const chain = (ctx, lane, s, info) => {
  const pose = chainPose(s, lane.h, { ...info.params, length: lane.length });
  if (!(pose.alpha > 0)) return;
  const { palette } = info.material;
  const R = info.params.r * lane.h;
  const toScreen = (x, y) => ({ x: lane.bx + lane.ux * x + lane.nx * y, y: lane.by + lane.uy * x + lane.ny * y });
  const lane0 = (lane.angleDeg * Math.PI) / 180;
  for (const [rgb, width, alpha] of [
    [palette.body, lane.h * 0.025, 1],
    [palette.hot, Math.max(1, lane.h * 0.008), 0.9],
  ]) {
    ctx.strokeStyle = rgbCss(rgb, alpha * pose.alpha);
    ctx.lineWidth = width;
    for (const link of pose.links) {
      const at = toScreen(link.x, link.y);
      ctx.beginPath();
      ctx.ellipse(at.x, at.y, R * 1.2, R, lane0 + (link.rotDeg * Math.PI) / 180, 0, TAU);
      ctx.stroke();
    }
  }
};

const GLOVE_OUTLINE = [30, 27, 31]; // #1E1B1F

const grip = (ctx, lane, s, info) => {
  const pose = gripPose(s);
  if (!(pose.alpha > 0)) return;
  const sky = anchorPoint(lane, 'sky');
  const x = sky.x + (lane.bx - sky.x) * pose.y;
  const y = sky.y + (lane.by - sky.y) * pose.y;
  const size = info.params.size * lane.h * 0.5;
  const { palette } = info.material;
  ctx.translate(x, y);
  ctx.fillStyle = rgbCss(palette.body, pose.alpha);
  ctx.strokeStyle = rgbCss(GLOVE_OUTLINE, pose.alpha);
  ctx.lineWidth = 1;
  // Palm: a rounded block above the target, fingers hanging down and curling in.
  const palmW = size * 0.9;
  const palmH = size * 0.7;
  ctx.beginPath();
  ctx.ellipse(0, -palmH * 0.5, palmW * 0.5, palmH * 0.5, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  const curl = (pose.curl * Math.PI) / 180;
  for (let i = 0; i < 5; i += 1) {
    const thumb = i === 0;
    const fx = thumb ? -palmW * 0.55 : -palmW * 0.36 + (palmW * 0.72 * (i - 1)) / 3;
    const fy = thumb ? -palmH * 0.5 : -palmH * 0.05;
    const len = size * (thumb ? 0.4 : 0.55);
    const w = size * 0.14;
    ctx.save();
    ctx.translate(fx, fy);
    // Fingers hang down (+y) and curl toward the palm's centre line; the thumb curls the other way.
    ctx.rotate((thumb ? -0.6 : 0) + (fx < 0 ? 1 : -1) * curl * 0.5);
    ctx.beginPath();
    ctx.ellipse(0, len * 0.5, w * 0.5, len * 0.5, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
};

// ---- design 092 ground-rock-steel -------------------------------------------------------

/** Where a monolith stands: its foot `back` h up the screen from its card's centre. */
export const monolithBase = (lane, p) => {
  const c = centreOf(lane, p.target);
  return { x: c.x, y: c.y - (Number(p.back) || 0) * lane.h };
};

/**
 * The monolith's outline about its foot (0, 0), rising up the screen: a slab with a flat-ish top,
 * one shoulder chipped, a little wider at the foot. `w`, `tall` px.
 */
export const monolithOutline = (w, tall) => [
  [-0.5 * w, 0],
  [-0.47 * w, -0.62 * tall],
  [-0.34 * w, -0.95 * tall],
  [0.08 * w, -tall],
  [0.4 * w, -0.86 * tall],
  [0.47 * w, -0.4 * tall],
  [0.5 * w, 0],
];

/**
 * The canvas monolith (the earth kit draws it as a real stone on the board): a slab lit on its
 * left face, its right face in shadow and a darker outline, falling onto its foot, with a shadow
 * on the cloth that tightens and darkens as it nears.
 */
const monolith = (ctx, lane, s, info) => {
  const pose = monolithPose(s, lane.h, poseParams(info));
  if (!(pose.alpha > 0)) return;
  const { palette } = info.material;
  const base = monolithBase(lane, info.params);
  const spread = 1 + 0.6 * (1 - pose.shadow);
  ctx.fillStyle = rgbCss(palette.deep, 0.4 * pose.shadow * pose.alpha);
  ctx.beginPath();
  ctx.ellipse(base.x, base.y, pose.w * 0.6 * spread, pose.w * 0.22 * spread, 0, 0, TAU);
  ctx.fill();
  const visible = Math.max(0, pose.tall - pose.sink) * pose.scale;
  if (!(visible > 0)) return;
  ctx.save();
  ctx.translate(base.x, base.y - pose.height);
  ctx.rotate((pose.lean * Math.PI) / 180);
  const w = pose.w * pose.scale;
  const points = monolithOutline(w, visible);
  const lit = ctx.createLinearGradient(-0.5 * w, -visible, 0.5 * w, 0);
  lit.addColorStop(0, rgbCss(palette.hot, pose.alpha));
  lit.addColorStop(0.45, rgbCss(palette.body, pose.alpha));
  lit.addColorStop(1, rgbCss(palette.deep, pose.alpha));
  ctx.fillStyle = lit;
  ctx.beginPath();
  points.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgbCss(palette.deep, pose.alpha);
  ctx.lineWidth = Math.max(1, lane.h * 0.015);
  ctx.stroke();
  ctx.restore();
};

// ---- design 092 electric-poison-fighting ---------------------------------------------

const mixStormRgb = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const fillStormDisc = (ctx, x, y, r, style) => {
  ctx.fillStyle = style;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
};
// Grain for the cloud's body on the GPU canvas: a slow scrolling noise multiplied in.
const STORM_TEXTURE = Object.freeze({ detail: Object.freeze({ amount: 0.4, speed: 0.5, scale: 5, angle: -90 }) });

/**
 * The storm cloud over the target (max/storm-cloud.mjs): matter, drawn source-over. Each lobe is a
 * soft-edged lit volume (a dark mass fading out at its edge, a body lit from the upper left, lit
 * tops last); the strike's light glows faintly along the underside and a flash lights it inside.
 */
const stormCloud = (ctx, lane, s, info) => {
  const p = info.params;
  const pose = stormCloudPose(s, lane.h, info.seed, p);
  if (!(pose.alpha > 0)) return;
  const c = anchorOf(lane, p);
  ctx.fxLift = anchorLift(lane, p.target, c, { stand: 0, z: LIFT.travelZ });
  const { palette } = info.material;
  const a = pose.alpha;
  withFxMod(ctx, STORM_TEXTURE, () => {
    for (const lobe of pose.lobes) {
      const x = c.x + lobe.x;
      const y = c.y + lobe.y;
      const mass = ctx.createRadialGradient(x, y, 0, x, y, lobe.r);
      mass.addColorStop(0, rgbCss(STORM_GREYS.shadow, a));
      mass.addColorStop(0.7, rgbCss(STORM_GREYS.shadow, 0.95 * a));
      mass.addColorStop(1, rgbCss(STORM_GREYS.shadow, 0));
      fillStormDisc(ctx, x, y, lobe.r, mass);
      const r = lobe.r * 0.82;
      const bx = x - lobe.r * 0.1;
      const by = y - lobe.r * 0.14;
      const body = ctx.createRadialGradient(bx - r * 0.3, by - r * 0.35, r * 0.05, bx, by, r);
      body.addColorStop(0, rgbCss(mixStormRgb(STORM_GREYS.body, STORM_GREYS.lit, lobe.shade), 0.9 * a));
      body.addColorStop(0.55, rgbCss(STORM_GREYS.body, 0.75 * a));
      body.addColorStop(1, rgbCss(STORM_GREYS.body, 0));
      fillStormDisc(ctx, bx, by, r, body);
    }
  });
  // The strike's light from below, along the whole underside.
  const under = c.y + pose.width * 0.12;
  ctx.save();
  ctx.translate(c.x, under);
  ctx.scale(1, 0.28);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, pose.width);
  glow.addColorStop(0, rgbCss(palette.body, 0.16 * a));
  glow.addColorStop(1, rgbCss(palette.body, 0));
  fillStormDisc(ctx, 0, 0, pose.width, glow);
  ctx.restore();
  if (pose.flash) {
    const { x, y, r, alpha } = pose.flash;
    const g = ctx.createRadialGradient(c.x + x, c.y + y, 0, c.x + x, c.y + y, r);
    g.addColorStop(0, rgbCss(palette.hot, 0.8 * alpha * a));
    g.addColorStop(0.45, rgbCss(palette.body, 0.35 * alpha * a));
    g.addColorStop(1, rgbCss(palette.body, 0));
    fillStormDisc(ctx, c.x + x, c.y + y, r, g);
  }
};

// ---- design 092 water-ice: Stonesurge's stones and Resonance's boulders, the Aurora Veil -----

/** A stone drawn on a 2D context (no GL layer, or the cast pass): a lit jagged polygon, tip along its heading. */
const canvasStone = (ctx, palette, x, y, stone, seed) => {
  const a = (stone.headingDeg * Math.PI) / 180;
  const along = [Math.cos(a), Math.sin(a)];
  const across = [-along[1], along[0]];
  const len = stone.size * stone.stretch;
  const corners = [0, 1, 2, 3, 4, 5].map((k) => {
    const t = (k / 6) * TAU;
    const wob = 0.75 + 0.25 * Math.sin(seed * 3.1 + k * 2.3);
    const u = Math.cos(t) * len * wob;
    const v = Math.sin(t) * stone.size * wob;
    return [x + along[0] * u + across[0] * v, y + along[1] * u + across[1] * v];
  });
  const g = ctx.createLinearGradient(x - stone.size, y - len, x + stone.size, y + len);
  g.addColorStop(0, rgbCss(palette.hot, stone.alpha));
  g.addColorStop(0.45, rgbCss(palette.body, stone.alpha));
  g.addColorStop(1, rgbCss(palette.deep, stone.alpha));
  ctx.fillStyle = g;
  ctx.beginPath();
  corners.forEach(([px, py], k) => (k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
  ctx.fill();
};

/** Ice's hard corner glints (the crystal kit's sparkle): white, the one place ice passes 1.0. */
const ICE_GLINT_TEXTURE = 'T_VFX_Star_Bright_2x2.webp';
const ICE_GLINT = Object.freeze([1.8, 1.9, 2.0]);

/**
 * An ice stone's dressing on the GL layer: a refracting skin round the faceted body (ice is
 * translucent: it bends the board behind it) and hard white glints at two corners that catch the
 * light in turn. Ice never glows from inside, so there is no halo.
 */
const frostSkin = (ctx, palette, at, size, alpha, frost, seed, time) => {
  // Tight to the body: a looser skin read as a soap bubble round a stone.
  emit(ctx, 'waterDrop', {
    at,
    radius: size * 1.02,
    alpha: alpha * 0.6 * frost,
    seed,
    dissolve: dissolveOf(ctx),
    palette: { deep: rgb01(palette.deep), body: rgb01(palette.body), hot: rgb01(palette.hot) },
  });
  for (let k = 0; k < 2; k += 1) {
    const flicker = Math.sin(time * 7 + seed * 2.3 + k * 2.6) > 0.1 ? 1 : 0.25;
    const corner = k === 0 ? [-0.55, -0.6] : [0.5, 0.35];
    emit(ctx, 'sprite', {
      texture: ICE_GLINT_TEXTURE,
      at: { x: at.x + corner[0] * size, y: at.y + corner[1] * size, z: at.z + size * 0.6 },
      size: size * (k === 0 ? 1.25 : 0.75),
      rotation: seed * 40,
      frame: Math.floor(seed * 7) + k,
      colour: ICE_GLINT,
      alpha: alpha * frost * flicker,
    });
  }
};

/**
 * Stones (Stonesurge) or ice boulders (Resonance, `from` 'sky', `frost` 1) as real tumbling 3-D
 * stones on the GL layer, each standing on its own ground point round the target, so what flies
 * above it rises off the cloth and what stands throws its shadow at its foot. Frost makes a stone
 * ice: a translucent faceted body with a pale Fresnel rim, a refracting skin and corner glints.
 */
const surgeStones = (ctx, lane, s, info) => {
  const p = info.params;
  const c = centreOf(lane, p.target);
  const { palette } = info.material;
  const frost = p.frost ?? 0;
  surgeStonesPose(s, lane.h, info.seed, p).forEach((stone, index) => {
    if (!(stone.alpha > 0) || !(stone.size > 0)) return;
    ctx.fxLift = standOn({ x: c.x + stone.gx, y: c.y + stone.gy });
    const x = c.x + stone.x;
    const y = c.y + stone.y;
    const seed = info.seed + index * 1.37;
    const at = elementsLive(ctx) ? stageOf(ctx, x, y) : null;
    const size = at ? stageLen(ctx, stone.size) : 0;
    const alpha = at ? alphaOf(ctx, stone.alpha) : 0;
    const drawn =
      Boolean(at) &&
      emit(ctx, 'debris', {
        at,
        size,
        stretch: stone.stretch,
        headingDeg: stageAngle(ctx, stone.headingDeg),
        spin: stone.spin,
        // Ice is translucent: its body lets a little of the board through.
        alpha: alpha * (1 - 0.25 * frost),
        seed,
        colour: rgb01(palette.body, 1),
        light: rgb01(palette.hot, 1.1 + 0.4 * frost),
        // The spec's own gloss: a fully glossy stone reflects the sky and reads as chrome, not ice.
        gloss: p.gloss,
        smooth: p.smooth * (1 - 0.7 * frost),
        dissolve: dissolveOf(ctx),
      });
    if (drawn && frost > 0) frostSkin(ctx, palette, at, size, alpha, frost, seed, info.time ?? 0);
    if (!drawn) canvasStone(ctx, palette, x, y, stone, seed);
  });
};

/** A curtain's light passes, outermost first: [palette key, width factor, alpha]. Nested and added, they fall off softly. */
const AURORA_PASSES = Object.freeze([
  ['deep', 1.6, 0.1],
  ['body', 1, 0.22],
  ['body', 0.55, 0.36],
  ['hot', 0.22, 0.6],
]);
const AURORA_STEPS = 10;

/**
 * The Aurora Veil: soft curtains of light standing on a ring round the target, each nested passes
 * of one wavering ribbon, narrowing as it rises, bright at its foot and fading toward its top;
 * item i takes hue i (beat `hues`).
 */
const auroraVeil = (ctx, lane, s, info) => {
  const p = info.params;
  const c = centreOf(lane, p.target);
  for (const curtain of auroraVeilPose(s, lane.h, info.seed, p)) {
    if (!(curtain.alpha > 0) || !(curtain.height > 1)) continue;
    const { palette } = itemMaterial(info, curtain.index);
    const footX = c.x + curtain.x;
    const footY = c.y + curtain.y;
    const sway = (v) => Math.sin(v * 4 + info.time * 2 + curtain.index * 1.7) * curtain.width * 0.25;
    ctx.fxLift = standOn({ x: footX, y: footY });
    for (const [key, factor, passAlpha] of AURORA_PASSES) {
      const g = ctx.createLinearGradient(footX, footY, footX, footY - curtain.height);
      g.addColorStop(0, rgbCss(palette[key], 0));
      g.addColorStop(0.1, rgbCss(palette[key], passAlpha * curtain.alpha));
      g.addColorStop(0.55, rgbCss(palette[key], passAlpha * curtain.alpha * 0.45));
      g.addColorStop(1, rgbCss(palette[key], 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      for (let k = 0; k <= AURORA_STEPS; k += 1) {
        const v = k / AURORA_STEPS;
        const half = (curtain.width / 2) * factor * (1 - 0.4 * v);
        ctx.lineTo(footX + sway(v) - half, footY - v * curtain.height);
      }
      for (let k = AURORA_STEPS; k >= 0; k -= 1) {
        const v = k / AURORA_STEPS;
        const half = (curtain.width / 2) * factor * (1 - 0.4 * v);
        ctx.lineTo(footX + sway(v) + half, footY - v * curtain.height);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
};

// The water kit's crown flipbook (four frames from a chunky mass to scattered drops), its splash
// lying along each frame's width from the left: turned to a plume's heading, the mass leaves its base.
const CROWN_TEXTURE = 'TEX_VFX_Splash_Water_1x4.webp';
/** A crown frame is four times as wide as it is tall; its splash starts this far in from the left. */
const CROWN_FRAME_ASPECT = 0.25;
const CROWN_BASE = 0.06;
/** The light comes from the upper left: the lit sheet sits that way of the water sheet (card heights). */
const CROWN_LIGHT = Object.freeze([-0.04, -0.06]);

/** Light-blue foam, never white: `palette.hot` softened toward a pale tint. */
const foamOf = (palette) => rgb01(palette.hot, 1).map((v) => 0.55 * v + 0.38);

/**
 * The geyser crown erupting out of the struck card: plumes of the water kit's crown flipbook, 2-3
 * card heights tall, rising off the card's near edge and stood per the beat lifts, each a darker
 * water sheet with a lit light-blue sheet over it toward the light (matter: it covers, never
 * adds), stepping from a chunky mass to scattered drops; real water drops are thrown off its top
 * and fall. It fades cleanly. On a 2D context each plume is the material's own stream.
 */
const splashCrown = (ctx, lane, s, info) => {
  const p = info.params;
  const c = centreOf(lane, p.target);
  const base = { x: c.x, y: c.y + 0.5 * lane.h };
  const pose = splashCrownPose(s, lane.h, info.seed, p);
  const { palette } = info.material;
  ctx.fxLift = standOn(base);
  const live = elementsLive(ctx);
  const water = rgb01(palette.body, 0.85);
  const foam = foamOf(palette);
  for (const plume of pose.plumes) {
    if (!(plume.alpha > 0) || !(plume.rise > 1)) continue;
    if (!live) {
      drawTongueAt(ctx, info, base.x, base.y, plume.headingDeg, plume.rise, plume.width * 0.5, plume.index * 2.3, { alpha: plume.alpha });
      continue;
    }
    const a = (plume.headingDeg * Math.PI) / 180;
    // The quad is the whole frame: its splash runs from CROWN_BASE of its length to the far end.
    const length = plume.rise / (1 - CROWN_BASE);
    const mid = length * (0.5 - CROWN_BASE);
    const centre = { x: base.x + Math.cos(a) * mid, y: base.y + Math.sin(a) * mid };
    const size = stageLen(ctx, length);
    // The frame's own aspect, widened so the plume is `width` across (the splash fills half a frame).
    const aspect = Math.max(CROWN_FRAME_ASPECT, (plume.width / length) * 2);
    const rotation = stageAngle(ctx, plume.headingDeg);
    const sheet = (dx, dy, colour, alpha) =>
      emit(ctx, 'sprite', {
        texture: CROWN_TEXTURE,
        at: stageOf(ctx, centre.x + dx * lane.h, centre.y + dy * lane.h),
        size,
        aspect,
        rotation,
        frame: plume.frame,
        colour,
        alpha: alphaOf(ctx, alpha),
        blend: 'over',
      });
    sheet(0.02, 0.03, water, plume.alpha * 0.8);
    sheet(CROWN_LIGHT[0], CROWN_LIGHT[1], foam, plume.alpha * 0.85);
  }
  for (const drop of pose.drops) {
    if (!(drop.alpha > 0)) continue;
    if (!live) {
      info.material.body(ctx, base.x + drop.x, base.y + drop.y, drop.r, drop.alpha, 0.6);
      continue;
    }
    emit(ctx, 'waterDrop', {
      at: stageOf(ctx, base.x + drop.x, base.y + drop.y),
      radius: stageLen(ctx, drop.r),
      alpha: alphaOf(ctx, drop.alpha),
      seed: info.seed + drop.r,
      palette: { deep: rgb01(palette.deep), body: rgb01(palette.body), hot: rgb01(palette.hot) },
    });
  }
};

/** A crescent's light passes, widest first: [palette key, thickness factor, alpha, shift toward the outer edge]. */
const CRESCENT_PASSES = Object.freeze([
  ['deep', 1.9, 0.22, 0],
  ['body', 1, 0.62, 0.1],
  ['hot', 0.55, 0.8, 0.45],
  ['core', 0.16, 0.9, 0.85],
]);

/** One crescent band through `points` at `scale` of its thickness, shifted `out` of it toward its outer edge. */
const traceCrescent = (ctx, cx, cy, points, scale, out) => {
  ctx.beginPath();
  points.forEach((pt, k) => {
    const r = pt.half * (out + scale);
    const x = cx + pt.x + pt.nx * r;
    const y = cy + pt.y + pt.ny * r;
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  for (let k = points.length - 1; k >= 0; k -= 1) {
    const pt = points[k];
    const r = pt.half * (out - scale);
    ctx.lineTo(cx + pt.x + pt.nx * r, cy + pt.y + pt.ny * r);
  }
  ctx.closePath();
};

/**
 * Rapid Flow's crescent blades: lit bands of light sweeping round the struck card, each nested
 * passes from a dark wide glow to a hot edge and a thin core along its outer (leading) side, so
 * the blade has a lit edge and a shadowed inner side. They fade cleanly: no burn.
 */
const chiCrescent = (ctx, lane, s, info) => {
  const c = centreOf(lane, info.params.target);
  ctx.fxLift = burstLift(c);
  const { palette } = info.material;
  for (const blade of chiCrescentPose(s, lane.h, info.params)) {
    if (!(blade.alpha > 0) || blade.points.length < 2) continue;
    for (const [key, scale, alpha, out] of CRESCENT_PASSES) {
      ctx.fillStyle = rgbCss(palette[key] ?? palette.hot, alpha * blade.alpha);
      traceCrescent(ctx, c.x, c.y, blade.points, scale, out);
      ctx.fill();
    }
  }
};

/** `draw` with its whole beat burning away from `fromOf(params)` of its progress. */
const burning = (draw, fromOf) => (ctx, lane, s, info) =>
  burnOut(ctx, dissolveTail(s, fromOf(info.params)), () => draw(ctx, lane, s, info));

// Design 078 § Depth: the whole-beat lifts (beat-lift.mjs). Unlisted drawers lift per item
// (projectile, volley, pillar, shards, ring, the charges) or stay on the cloth: ground waves and
// cracks (shockRings, terrain, ring 'floor'), the card-hugging aura and vignette, shade and chain.
const atAnchor = (lane, p) => anchorLift(lane, p.target, anchorOf(lane, p));
const atCentre = (lane, p) => burstLift(centreOf(lane, p.target));
const fromSky = (lane) => standOn({ x: lane.bx, y: lane.by });
/** A bolt from the sky comes down out of the air onto the defender; a lane bolt arcs to it. */
const boltLift = (lane, p) =>
  p.from === 'sky' ? fromSky(lane) : travelLift({ x: lane.ax, y: lane.ay }, { x: lane.bx, y: lane.by }, { arc: LIFT.boltArc });
const beamLift = (lane) => travelLift(beamPoint(lane, 0), beamPoint(lane, 1), { arc: LIFT.beamArc });

/**
 * Design 079: a material's element kit may draw a beat as shader meshes. The hook sits on the raw
 * drawer, inside its lift and burn wrappers, so an element beat rises and dissolves like the
 * canvas one; the element drawer may return false to leave this beat to the canvas drawer.
 */
const elementable = (name, draw) => (ctx, lane, s, info) => {
  const elementDraw = info?.material?.drawBeat?.(name, ctx);
  if (!elementDraw || elementDraw(ctx, lane, s, info) === false) draw(ctx, lane, s, info);
};

const IMPLEMENTATIONS = {
  orbitCharge: elementable('orbitCharge', orbitCharge),
  coreCharge: elementable('coreCharge', coreCharge),
  shockRings: burning(elementable('shockRings', shockRings), () => BURN_FROM.shockRings),
  projectile: elementable('projectile', projectile),
  vignette: elementable('vignette', vignette),
  speedRays: lifted(elementable('speedRays', speedRays), atAnchor),
  // Burns as it breaks up: the arms' alpha only starts to drop there (easeInCubic).
  starFlare: lifted(burning(elementable('starFlare', starFlare), (p) => p.breakAt), atAnchor),
  impactFlash: lifted(elementable('impactFlash', impactFlash), atCentre),
  // Soot rises off the struck card.
  smoke: lifted(elementable('smoke', smoke), (lane, p) => burstLift(centreOf(lane, p.target), { z: 0.05 })),
  beam: lifted(burning(elementable('beam', beam), (p) => 1 - p.retract * BEAM_BURN_LEAD), beamLift),
  splash: lifted(burning(elementable('splash', splash), () => BURN_FROM.splash), atCentre),
  pillar: elementable('pillar', pillar),
  slashArc: lifted(burning(elementable('slashArc', slashArc), () => BURN_FROM.slashArc), atCentre),
  terrain: elementable('terrain', terrain),
  cloud: lifted(elementable('cloud', cloud), (lane, p) => anchorLift(lane, p.target, anchorOf(lane, p), { stand: 0, z: LIFT.travelZ })),
  spiral: lifted(elementable('spiral', spiral), atCentre),
  volley: elementable('volley', volley),
  aura: elementable('aura', aura),
  // Rain falls out of the air onto the card.
  rain: lifted(elementable('rain', rain), (lane, p) => standOn(centreOf(lane, p.target))),
  shards: elementable('shards', shards),
  bolt: lifted(burning(elementable('bolt', bolt), () => BURN_FROM.bolt), boltLift),
  ring: elementable('ring', ring),
  glyph: lifted(elementable('glyph', glyph), (lane, p) => anchorLift(lane, p.target, anchorOf(lane, p), { stand: LIFT.faceStand })),
  fan: lifted(burning(elementable('fan', fan), () => BURN_FROM.fan), atAnchor),
  shade: elementable('shade', shade),
  chain: elementable('chain', chain),
  // The glove comes down out of the air.
  grip: lifted(elementable('grip', grip), fromSky),
  // design 092 psychic-fairy: both lift themselves (stood off the card's near edge); the coil burns,
  // the shafts (light) fade whole.
  hoopCoil: elementable('hoopCoil', hoopCoil),
  skyColumn: elementable('skyColumn', skyColumn),
  // design 092 ground-rock-steel: the slab stands on its foot and falls out of the air onto it.
  monolith: lifted(elementable('monolith', monolith), (lane, p) => standOn(monolithBase(lane, p))),
  // design 092 ghost-dark-dragon: each sets its own lift (per piece, per ribbon run, per column).
  ...Object.fromEntries(Object.entries(GHOST_DARK_DRAGON_DRAWERS).map(([name, draw]) => [name, elementable(name, draw)])),
  // design 092 grass-bug-flying: each lifts itself (props stand off their feet, the vines and the
  // tube travel at chest height).
  prop: elementable('prop', prop),
  vine: elementable('vine', vine),
  tornado: elementable('tornado', tornado),
  // design 092 electric-poison-fighting: the storm cloud hangs over the target (it lifts itself).
  stormCloud: elementable('stormCloud', stormCloud),
  // design 092 water-ice: each stone and curtain stands on its own ground point (they lift per item);
  // the crown and the crescents set their own lifts and fade cleanly (no burn).
  surgeStones,
  auroraVeil,
  splashCrown,
  chiCrescent,
};

/** The drawer registry: `{ draw, check, tonguesAt }` per drawer name. */
export const DRAWERS = Object.freeze(
  Object.fromEntries(
    Object.keys(DRAWER_PARAMS).map((name) => {
      const implementation = IMPLEMENTATIONS[name];
      return [name, guarded(name, implementation)];
    })
  )
);
