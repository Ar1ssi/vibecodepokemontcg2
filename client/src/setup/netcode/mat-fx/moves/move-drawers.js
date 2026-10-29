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
// Design 076: travelling and burst drawers own their exit as a GPU dissolve (`burnOut`), and
// every drawer owns its place in height (`ctx.fxLift`, beat-lift.mjs): no beat lies on the cloth.
import { rgbCss } from '../fx-colors.mjs';
import { LIFT, anchorLift, bodyLift, burstLift, standOn, travelLift } from './beat-lift.mjs';
import { LEAD_H, lanePoint, skyLane } from './move-geometry.mjs';
import { dissolveTail, withFxMod } from './materials/_mods.js';
import { getNoiseTile } from './materials/_shared.js';
import { UNITS } from './materials/_units.js';
import { DRAWER_PARAMS, checkParams, tonguesAt } from './move-spec.mjs';
import {
  armTongues,
  auraPose,
  beamPose,
  anchorPoint,
  boltPoses,
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

const TAU = Math.PI * 2;
const HELIX_SAMPLES = 12;

const centreOf = (lane, target) => (target === 'attacker' ? { x: lane.ax, y: lane.ay } : { x: lane.bx, y: lane.by });
/** An anchored beat's point: its target (kind anchor) moved by its dx / dy. */
const anchorOf = (lane, p) => anchorPoint(lane, p.target, p.dx, p.dy);
/** Item i's material: the hued one when the beat has hues, else the beat material. */
const itemMaterial = (info, i) => (typeof info.materialAt === 'function' ? info.materialAt(i) : info.material);
const isSky = (target) => target === 'sky' || target === 'sky-attacker';

// Design 076: where each travelling / burst beat starts burning away, as a fraction of its
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

/** Runs `draw` with the dissolve at `amount`, merged over whatever the caller set (076 contract). */
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
        // Design 077: a material's element kit may draw this whole beat as shader meshes.
        const elementDraw = info?.material?.drawBeat?.(name, ctx);
        (elementDraw ?? draw)(ctx, lane, s, info);
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
const beamPoint = (lane, f, side = 0) => {
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
    // A column rises off the card's near edge (its base line in the 2D layout).
    ctx.fxLift = standOn({ x, y: c.y + 0.5 * lane.h });
    burnOut(ctx, dissolveTail(column.s, BURN_FROM.pillar), () => {
      drawTongueAt(ctx, info, x, y, t.angleDeg, t.length, t.width, seed, { alpha: t.alpha, hot: t.hot }, material);
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
          { alpha: t.alpha * 0.85, hot: t.hot },
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
  // A material with its own lightning (electric) strokes the polylines in its jag passes.
  if (typeof info.material.jagStroke === 'function') {
    info.material.jagStroke(ctx, lines, { width: pose.width, alpha: pose.alpha });
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

/** `draw` with its whole beat burning away from `fromOf(params)` of its progress. */
const burning = (draw, fromOf) => (ctx, lane, s, info) =>
  burnOut(ctx, dissolveTail(s, fromOf(info.params)), () => draw(ctx, lane, s, info));

// Design 076 § Depth: the whole-beat lifts (beat-lift.mjs). Unlisted drawers lift per item
// (projectile, volley, pillar, shards, ring, the charges) or stay on the cloth: ground waves and
// cracks (shockRings, terrain, ring 'floor'), the card-hugging aura and vignette, shade and chain.
const atAnchor = (lane, p) => anchorLift(lane, p.target, anchorOf(lane, p));
const atCentre = (lane, p) => burstLift(centreOf(lane, p.target));
const fromSky = (lane) => standOn({ x: lane.bx, y: lane.by });
/** A bolt from the sky comes down out of the air onto the defender; a lane bolt arcs to it. */
const boltLift = (lane, p) =>
  p.from === 'sky' ? fromSky(lane) : travelLift({ x: lane.ax, y: lane.ay }, { x: lane.bx, y: lane.by }, { arc: LIFT.boltArc });
const beamLift = (lane) => travelLift(beamPoint(lane, 0), beamPoint(lane, 1), { arc: LIFT.beamArc });

const IMPLEMENTATIONS = {
  orbitCharge,
  coreCharge,
  shockRings: burning(shockRings, () => BURN_FROM.shockRings),
  projectile,
  vignette,
  speedRays: lifted(speedRays, atAnchor),
  // Burns as it breaks up: the arms' alpha only starts to drop there (easeInCubic).
  starFlare: lifted(burning(starFlare, (p) => p.breakAt), atAnchor),
  impactFlash: lifted(impactFlash, atCentre),
  // Soot rises off the struck card.
  smoke: lifted(smoke, (lane, p) => burstLift(centreOf(lane, p.target), { z: 0.05 })),
  beam: lifted(burning(beam, (p) => 1 - p.retract * BEAM_BURN_LEAD), beamLift),
  splash: lifted(burning(splash, () => BURN_FROM.splash), atCentre),
  pillar,
  slashArc: lifted(burning(slashArc, () => BURN_FROM.slashArc), atCentre),
  terrain,
  cloud: lifted(cloud, (lane, p) => anchorLift(lane, p.target, anchorOf(lane, p), { stand: 0, z: LIFT.travelZ })),
  spiral: lifted(spiral, atCentre),
  volley,
  aura,
  // Rain falls out of the air onto the card.
  rain: lifted(rain, (lane, p) => standOn(centreOf(lane, p.target))),
  shards,
  bolt: lifted(burning(bolt, () => BURN_FROM.bolt), boltLift),
  ring,
  glyph: lifted(glyph, (lane, p) => anchorLift(lane, p.target, anchorOf(lane, p), { stand: LIFT.faceStand })),
  fan: lifted(burning(fan, () => BURN_FROM.fan), atAnchor),
  shade,
  chain,
  // The glove comes down out of the air.
  grip: lifted(grip, fromSky),
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
