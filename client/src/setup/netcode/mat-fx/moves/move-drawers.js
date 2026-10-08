// Design 063: the shared beat library. Every drawer is `draw(ctx, lane, s, info)` where `s`
// in [0, 1) is the beat's progress, `lane` the host-local lane (move-geometry.mjs) and
// `info = { elapsedMs, beatMs, time, seed, material, params, spec }` (params already have
// their defaults). The pure math lives in move-poses.mjs; a drawer only maps it to material
// calls. A drawer draws nothing when `s` is out of range, leaves `ctx.filter` at 'none' and
// the context state balanced, and never sets `globalCompositeOperation` (the player does:
// source-over for vignette / smoke / terrain cracks, additive for everything else).
import { rgbCss } from '../fx-colors.mjs';
import { lanePoint, skyLane } from './move-geometry.mjs';
import { DRAWER_PARAMS, checkParams, tonguesAt } from './move-spec.mjs';
import {
  armTongues,
  auraPose,
  beamPose,
  boltPose,
  chargeCore,
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
const drawTongueAt = (ctx, info, x, y, angleDeg, length, width, seedOffset, opts) =>
  info.material.tongue(
    ctx,
    { x, y, angleDeg, length, width, time: info.time, seed: info.seed + seedOffset },
    opts
  );

const orbitCharge = (ctx, lane, s, info) => {
  const { params: p, material } = info;
  for (const orb of chargeOrbs(s, lane.h, p)) {
    if (p.half === 'front' && orb.depth < 0) continue;
    if (p.half === 'back' && orb.depth >= 0) continue;
    material.projectile(ctx, {
      x: lane.ax + orb.dx,
      y: lane.ay + orb.dy,
      r: orb.r,
      headingDeg: orb.heading,
      time: info.time,
      seed: info.seed + orb.dx,
      alpha: orb.alpha,
      tongues: p.tongues,
      hot: 0.8,
    });
  }
};

const coreCharge = (ctx, lane, s, info) => {
  const core = chargeCore(s, lane.h, info.params);
  const x = lane.ax + lane.ux * core.x + lane.nx * core.y;
  const y = lane.ay + lane.uy * core.x + lane.ny * core.y;
  info.material.glow(ctx, x, y, core.r * 2, core.alpha * 0.5);
  info.material.body(ctx, x, y, core.r, core.alpha, 0.9);
};

const shockRings = (ctx, lane, s, info) => {
  for (const ring of releaseRings(s, lane.h, info.params)) {
    ctx.strokeStyle = rgbCss(info.material.palette.body, ring.alpha);
    ctx.lineWidth = ring.width;
    ctx.beginPath();
    ctx.ellipse(lane.ax, lane.ay, ring.r, ring.r * info.params.squash, 0, 0, TAU);
    ctx.stroke();
  }
};

const projectile = (ctx, lane, s, info) => {
  const ball = projectilePose(s, lane.h, info.params);
  const at = lanePoint(lane, ball.f, ball.side);
  info.material.projectile(ctx, {
    x: at.x,
    y: at.y,
    r: ball.r,
    headingDeg: lane.angleDeg + ball.headingDeg,
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
  const c = centreOf(lane, info.params.target);
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
  const c = centreOf(lane, info.params.target);
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
    drawTongueAt(ctx, info, c.x + t.x, c.y + t.y, t.angleDeg, t.length, t.width, index * 2.3, { alpha: t.alpha });
  });
};

const pillar = (ctx, lane, s, info) => {
  const c = centreOf(lane, info.params.target);
  const t = pillarPose(s, lane.h, info.params);
  if (!(t.length > 0) || !(t.alpha > 0)) return;
  const x = c.x + t.x;
  const y = c.y + t.y;
  drawTongueAt(ctx, info, x, y, t.angleDeg, t.length, t.width, 0, { alpha: t.alpha, hot: t.hot });
  for (const side of [-1, 1]) {
    drawTongueAt(ctx, info, x + side * t.width * 0.3, y, t.angleDeg + side * 10, t.length * 0.7, t.width * 0.55, side + 2, {
      alpha: t.alpha * 0.85,
      hot: t.hot,
    });
  }
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
  const c = centreOf(lane, info.params.target);
  for (const puff of cloudPose(s, lane.h, info.seed, info.params)) {
    info.material.glow(ctx, c.x + puff.dx, c.y + puff.dy, puff.r, puff.alpha);
  }
};

const spiral = (ctx, lane, s, info) => {
  const c = centreOf(lane, info.params.target);
  spiralPose(s, lane.h, info.params).forEach((t, index) => {
    drawTongueAt(ctx, info, c.x + t.x, c.y + t.y, t.angleDeg, t.length, t.width, index * 1.9, { alpha: t.alpha });
  });
};

const volley = (ctx, lane, s, info) => {
  const back = info.params.from === 'defender';
  const path = info.params.from === 'sky' ? skyLane(lane) : lane;
  for (const ball of volleyPose(s, lane.h, poseParams(info))) {
    const at = lanePoint(path, back ? 1 - ball.f : ball.f, ball.side);
    info.material.projectile(ctx, {
      x: at.x,
      y: at.y,
      r: ball.r,
      headingDeg: path.angleDeg + ball.headingDeg + (back ? 180 : 0),
      time: info.time,
      seed: info.seed + ball.side,
      alpha: ball.alpha,
      tongues: info.params.tongues,
    });
  }
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
  shardsPose(s, lane.h, info.seed, info.params).forEach((t, index) => {
    drawTongueAt(ctx, info, c.x + t.x, c.y + t.y, t.angleDeg, t.length, t.width, index * 2.1, { alpha: t.alpha, jag: 1 });
  });
};

const strokePolyline = (ctx, points) => {
  ctx.beginPath();
  points.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
};

const bolt = (ctx, lane, s, info) => {
  const pose = boltPose(s, lane, info.seed, info.elapsedMs, info.params);
  if (!(pose.alpha > 0)) return;
  const lines = [pose.points, ...pose.branches];
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
  const c = centreOf(lane, info.params.target);
  const squash = info.params.kind === 'floor' ? 0.45 : 1;
  for (const r of ringPose(s, lane.h, info.params)) {
    ctx.strokeStyle = rgbCss(info.material.palette.hot, r.alpha);
    ctx.lineWidth = r.width;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, r.r, r.r * squash, 0, 0, TAU);
    ctx.stroke();
  }
};

const glyph = (ctx, lane, s, info) => {
  if (typeof info.material.sigil !== 'function') return;
  const pose = glyphPose(s, lane.h, info.params);
  if (!(pose.alpha > 0)) return;
  const c = centreOf(lane, info.params.target);
  ctx.globalAlpha = pose.alpha;
  info.material.sigil(ctx, c.x, c.y, pose.r, s);
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
