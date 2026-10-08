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
import { rgbCss } from '../fx-colors.mjs';
import { lanePoint, skyLane } from './move-geometry.mjs';
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
      ctx.save();
      try {
        draw(ctx, lane, s, info);
      } finally {
        ctx.filter = 'none';
        ctx.restore();
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
  const c = anchorOf(lane, { target: p.target ?? 'attacker', dx: p.dx, dy: p.dy });
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
  info.material.glow(ctx, x, y, core.r * 2, core.alpha * 0.5);
  info.material.body(ctx, x, y, core.r, core.alpha, 0.9);
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
  drawUnit(ctx, info.material, info.params.unit, s, {
    x: at.x,
    y: at.y,
    r: ball.r,
    headingDeg: path.angleDeg + ball.headingDeg + (back ? 180 : 0),
    time: info.time,
    seed: info.seed,
    alpha: ball.alpha,
    tongues: info.params.tongues,
  });
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
  const flare = flarePose(s, lane.h, info.params);
  const c = anchorOf(lane, info.params);
  info.material.glow(ctx, c.x, c.y, lane.h * 1.3, flare.core.alpha * 0.4);
  flare.arms.forEach((arm, index) => {
    const a = (arm.angle * Math.PI) / 180;
    for (const tongue of armTongues(arm, flare.breakUp)) {
      drawTongueAt(
        ctx,
        info,
        c.x + Math.cos(a) * tongue.from,
        c.y + Math.sin(a) * tongue.from,
        tongue.angleDeg,
        tongue.length,
        tongue.width,
        index * 3.3 + tongue.from * 0.01,
        { alpha: tongue.alpha, hot: 1 - 0.5 * flare.breakUp }
      );
    }
  });
  info.material.body(ctx, c.x, c.y, flare.core.r, flare.core.alpha, 1);
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

const beam = (ctx, lane, s, info) => {
  const pose = beamPose(s, lane, info.params);
  const { material, params: p } = info;
  const toPoint = (f) => lanePoint(lane, f, 0);
  const strip = (f0, f1, width, alpha = 1) => {
    const a = toPoint(f0);
    const b = toPoint(f1);
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length > 0) drawTongueAt(ctx, info, a.x, a.y, lane.angleDeg, length, width, f0 * 7, { alpha });
  };
  if (p.kind === 'helix') {
    for (const strand of pose.segments) {
      for (let i = 0; i <= HELIX_SAMPLES; i += 1) {
        const u = i / HELIX_SAMPLES;
        const f = strand.f0 + (strand.f1 - strand.f0) * u;
        const side = strand.side * Math.sin(strand.turns * TAU * u + strand.phase);
        const at = lanePoint(lane, f, side);
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
  for (const seg of pose.segments) strip(seg.f0, seg.f1, pose.width * (p.kind === 'segmented' ? 0.8 : 1), seg.alpha);
  const head = toPoint(pose.to);
  material.glow(ctx, head.x, head.y, pose.width * 1.2, 0.35);
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
    info.material.glow(ctx, c.x + puff.dx, c.y + puff.dy, puff.r, puff.alpha);
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
    drawUnit(ctx, itemMaterial(info, index), info.params.unit, s, {
      x: at.x,
      y: at.y,
      r: ball.r,
      headingDeg: path.angleDeg + ball.headingDeg + (back ? 180 : 0),
      time: info.time,
      seed: info.seed + ball.side,
      alpha: ball.alpha,
      tongues: info.params.tongues,
    });
  });
};

const aura = (ctx, lane, s, info) => {
  const pose = auraPose(s, lane.h, poseParams(info));
  if (!(pose.alpha > 0)) return;
  const c = centreOf(lane, info.params.target);
  info.material.glow(ctx, c.x, c.y, pose.r * 1.2, pose.alpha * 0.5);
  ctx.strokeStyle = rgbCss(info.material.palette.hot, pose.alpha);
  ctx.lineWidth = lane.h * 0.04;
  ctx.beginPath();
  ctx.arc(c.x, c.y, pose.r, 0, TAU);
  ctx.stroke();
};

const rain = (ctx, lane, s, info) => {
  const c = centreOf(lane, info.params.target);
  rainPose(s, lane.h, info.seed, info.params).forEach((drop, index) => {
    if (drop.splash > 0) {
      info.material.glow(ctx, c.x + drop.x, c.y + drop.y, lane.h * 0.2 * (0.4 + drop.splash), drop.alpha * 0.6);
      return;
    }
    drawTongueAt(ctx, info, c.x + drop.x, c.y + drop.y - drop.length, 90, drop.length, drop.width, index * 1.3, {
      alpha: drop.alpha,
    });
  });
};

const shards = (ctx, lane, s, info) => {
  const c = centreOf(lane, info.params.target);
  const { unit, mode } = info.params;
  const cluster = mode === 'cluster';
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
      material.glow(ctx, c.x + t.x + Math.cos(a) * t.length, c.y + t.y + Math.sin(a) * t.length, t.width * 0.9, t.alpha * 0.6);
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
  const c = anchorOf(lane, info.params);
  if (info.params.kind === 'fins') {
    finsPose(s, lane.h, poseParams(info)).forEach((t, index) => {
      drawTongueAt(ctx, info, c.x + t.x, c.y + t.y, t.angleDeg, t.length, t.width, index * 1.7, { alpha: t.alpha }, itemMaterial(info, index));
    });
    return;
  }
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
  ctx.strokeStyle = rgbCss(palette.body, pose.rimAlpha);
  ctx.lineWidth = lane.h * 0.04;
  shadePath(ctx, p.kind, x, y, pose.rx, pose.ry);
  ctx.stroke();
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

const IMPLEMENTATIONS = {
  orbitCharge,
  coreCharge,
  shockRings,
  projectile,
  vignette,
  speedRays,
  starFlare,
  impactFlash,
  smoke,
  beam,
  splash,
  pillar,
  slashArc,
  terrain,
  cloud,
  spiral,
  volley,
  aura,
  rain,
  shards,
  bolt,
  ring,
  glyph,
  fan,
  shade,
  chain,
  grip,
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
