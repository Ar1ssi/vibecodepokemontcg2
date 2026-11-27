// Design 092 ghost-dark-dragon: the drawers the Ghost, Dark and Dragon Max Moves added, merged
// into move-drawers.js's registry (its design 092 block). Their poses are pure
// (ghost-dark-dragon-poses.mjs). Like every drawer they draw on the context the player hands
// them in its composite (light, added), never setting one; what is matter (the dome's ink, the
// tornado's debris) is a shader element, emitted only while the GPU canvas records a lit pass,
// so a 2D context, the cast pass and the tests draw the light alone.
import { rgbCss } from '../../fx-colors.mjs';
import { LIFT, burstLift, standOn, travelLift } from '../beat-lift.mjs';
import { anchorPoint } from '../move-poses.mjs';
import { alphaOf, elementsLive, emit, rgb01, stageLen, stageOf } from '../elements/_emit.js';
import { crackleArcs, domeEyes, domePose, furniturePose, hexesRgb, ribbonPaths, tornadoPose } from './ghost-dark-dragon-poses.mjs';

const TAU = Math.PI * 2;
const GLOW_TEXTURE = 'TEX_VFX_Gradient_Radial.webp';
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const mixRgb = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const WHITE = Object.freeze([255, 255, 255]);

/** An anchored beat's point (move-drawers.js anchorOf). */
const anchorOf = (lane, p) => anchorPoint(lane, p.target, p.dx, p.dy);

// ---- hauntedFurniture -------------------------------------------------------------------

/** Each piece's silhouette in a unit frame (radius 1, y down), as sub-paths on one path. */
const PIECE_PATHS = Object.freeze({
  chair(ctx) {
    // A ladder-back chair: the back's frame (its window cut out), seat, four legs.
    ctx.rect(-0.46, -1, 0.92, 0.9);
    // The window runs the other way round, so the recorder cuts it out as a hole.
    ctx.moveTo(-0.3, -0.84);
    ctx.lineTo(-0.3, -0.32);
    ctx.lineTo(0.3, -0.32);
    ctx.lineTo(0.3, -0.84);
    ctx.closePath();
    ctx.rect(-0.58, -0.12, 1.16, 0.2);
    for (const x of [-0.52, -0.3, 0.24, 0.44]) ctx.rect(x, 0.08, 0.08, 0.92);
  },
  teapot(ctx) {
    ctx.ellipse(0, 0.18, 0.62, 0.48, 0, 0, TAU);
    ctx.moveTo(0.34, -0.38);
    ctx.ellipse(0, -0.38, 0.34, 0.1, 0, 0, TAU);
    ctx.moveTo(0.09, -0.54);
    ctx.arc(0, -0.54, 0.09, 0, TAU);
    // The spout, a tapering crook up and out to the right.
    ctx.moveTo(0.5, 0.05);
    ctx.quadraticCurveTo(0.82, 0.08, 0.98, -0.3);
    ctx.lineTo(0.9, -0.34);
    ctx.quadraticCurveTo(0.76, -0.06, 0.52, 0.32);
    ctx.closePath();
    // The handle: a ring on the left, its hole (wound the other way) cut out.
    ctx.moveTo(-0.4, 0.12);
    ctx.ellipse(-0.66, 0.12, 0.26, 0.32, 0, 0, TAU);
    ctx.moveTo(-0.54, 0.12);
    ctx.ellipse(-0.66, 0.12, 0.12, 0.18, 0, 0, -TAU, true);
  },
  tophat(ctx) {
    ctx.moveTo(-0.36, 0.3);
    ctx.lineTo(-0.42, -0.86);
    ctx.quadraticCurveTo(0, -0.98, 0.42, -0.86);
    ctx.lineTo(0.36, 0.3);
    ctx.closePath();
    ctx.moveTo(0.8, 0.36);
    ctx.ellipse(0, 0.36, 0.8, 0.16, 0, 0, TAU);
  },
  boot(ctx) {
    ctx.moveTo(-0.34, -0.96);
    ctx.lineTo(0.22, -0.96);
    ctx.lineTo(0.24, 0.3);
    ctx.quadraticCurveTo(0.62, 0.34, 0.84, 0.62);
    ctx.quadraticCurveTo(0.94, 0.8, 0.84, 0.96);
    ctx.lineTo(-0.36, 0.96);
    ctx.lineTo(-0.38, 0.6);
    ctx.closePath();
  },
  teacup(ctx) {
    ctx.moveTo(-0.58, -0.32);
    ctx.lineTo(0.58, -0.32);
    ctx.quadraticCurveTo(0.56, 0.34, 0, 0.42);
    ctx.quadraticCurveTo(-0.56, 0.34, -0.58, -0.32);
    ctx.closePath();
    ctx.moveTo(0.82, -0.1);
    ctx.ellipse(0.62, -0.1, 0.2, 0.22, 0, 0, TAU);
    ctx.moveTo(0.71, -0.1);
    ctx.ellipse(0.62, -0.1, 0.09, 0.11, 0, 0, -TAU, true);
    ctx.moveTo(0.86, 0.56);
    ctx.ellipse(0, 0.56, 0.86, 0.13, 0, 0, TAU);
  },
});

/**
 * One haunted piece as lit ghost-matter: a halo behind it, its body shaded from a lit upper-left
 * (hot) through its colour (body) to a dim far side (deep), and a lit rim along its outline.
 */
function drawPiece(ctx, piece, x, y, r, angleDeg, alpha, palette) {
  if (!(r > 0) || !(alpha > 0)) return;
  ctx.save();
  ctx.translate(x, y);
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.7);
  halo.addColorStop(0, rgbCss(palette.body, 0.28 * alpha));
  halo.addColorStop(1, rgbCss(palette.body, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.7, 0, TAU);
  ctx.fill();
  ctx.rotate((angleDeg * Math.PI) / 180);
  ctx.scale(r, r);
  const shade = ctx.createLinearGradient(-0.8, -0.9, 0.8, 0.9);
  shade.addColorStop(0, rgbCss(mixRgb(palette.hot, WHITE, 0.25), 0.95 * alpha));
  shade.addColorStop(0.45, rgbCss(palette.body, 0.8 * alpha));
  shade.addColorStop(1, rgbCss(palette.deep, 0.55 * alpha));
  ctx.fillStyle = shade;
  ctx.beginPath();
  PIECE_PATHS[piece](ctx);
  ctx.fill();
  ctx.strokeStyle = rgbCss(mixRgb(palette.hot, WHITE, 0.35), alpha);
  ctx.lineWidth = 0.08;
  ctx.stroke();
  ctx.restore();
}

/** Design 092: haunted furniture floats up round the attacker, flies down the lane and swarms the defender. */
export const hauntedFurniture = (ctx, lane, s, info) => {
  const { palette } = info.material;
  for (const p of furniturePose(s, lane, info.params, info.seed)) {
    ctx.fxLift = burstLift({ x: p.x, y: p.y }, { z: p.z, stand: LIFT.bodyStand });
    drawPiece(ctx, p.piece, p.x, p.y, p.r, p.angleDeg, p.alpha, palette);
  }
};

// ---- darkDome ----------------------------------------------------------------------------

/** A jagged arc crawling on the dome's shell, as screen points round (cx, cy). */
function shellArc(cx, cy, r, a0, sweep, jag, rand) {
  const points = [];
  for (let k = 0; k <= 7; k += 1) {
    const a = a0 + (sweep * k) / 7;
    const rr = r * (0.55 + 0.4 * rand()) + (rand() - 0.5) * jag;
    points.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92]);
  }
  return points;
}

const tinyRand = (seed) => {
  let a = (Math.trunc(seed) >>> 0) || 1;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
};

/** A flame-eye of the shadow world: a pointed lick of red light, lit along its middle. */
function drawEye(ctx, x, y, size, alpha, palette) {
  if (!(alpha > 0) || !(size > 0)) return;
  ctx.save();
  ctx.translate(x, y);
  const flame = ctx.createLinearGradient(0, size, 0, -size);
  flame.addColorStop(0, rgbCss(palette.body, 0.9 * alpha));
  flame.addColorStop(0.6, rgbCss(palette.hot, 0.95 * alpha));
  flame.addColorStop(1, rgbCss(palette.hot, 0));
  ctx.fillStyle = flame;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.quadraticCurveTo(size * 0.55, -size * 0.1, size * 0.32, size * 0.55);
  ctx.quadraticCurveTo(0, size * 0.85, -size * 0.32, size * 0.55);
  ctx.quadraticCurveTo(-size * 0.55, -size * 0.1, 0, -size);
  ctx.fill();
  ctx.restore();
}

/**
 * Design 092: a dome of energy rises over the defender: dark ink inside (a smoke element), a
 * lit shell with arcs crawling on it (a plasma element), a gloss crescent on its lit upper left.
 * Off the GPU canvas the shell is a rim of light with the arcs stroked on it.
 */
export const darkDome = (ctx, lane, s, info) => {
  const p = info.params;
  const pose = domePose(s, lane.h, p);
  if (!(pose.alpha > 0) && !(pose.eyes > 0)) return;
  const c = anchorOf(lane, p);
  const { palette } = info.material;
  const R = pose.r;
  ctx.fxLift = burstLift(c, { z: 0.1, stand: 0.15 });
  const veinRgb = mixRgb(palette.hot, palette.core, pose.veins);
  if (elementsLive(ctx)) {
    const at = stageOf(ctx, c.x, c.y);
    const radius = stageLen(ctx, R);
    if (pose.ink > 0) {
      emit(ctx, 'smoke', {
        at,
        radius: radius * 1.08,
        alpha: alphaOf(ctx, pose.ink),
        seed: info.seed * 0.71,
        tint: rgb01(palette.deep, 1),
        light: rgb01(palette.body, 1.1),
        density: 0.95,
        rise: 0.15,
        glow: 0.08 + 0.3 * pose.veins,
      });
    }
    // The shell: one colour, rim and halo.
    emit(ctx, 'plasma', {
      at,
      radius,
      alpha: alphaOf(ctx, pose.alpha),
      heat: 0,
      arcs: 0,
      shell: 1,
      seed: info.seed,
      hot: rgb01(palette.body, 1.45),
      glow: rgb01(palette.body, 1.2),
    });
    // The arcs crawling inside it, in their own colour, with no halo of their own.
    if (pose.arcs > 0) {
      emit(ctx, 'plasma', {
        at,
        radius: radius * 0.92,
        alpha: alphaOf(ctx, pose.alpha),
        heat: 0,
        arcs: pose.arcs,
        shell: 0,
        seed: info.seed + 11,
        hot: rgb01(veinRgb, 1.8),
        glow: rgb01(palette.deep, 0.5),
      });
    }
    // The burst: a shell of the veins' light swelling out of the breaking dome.
    if (pose.flash > 0) {
      const out = clamp01((s - 0.8) / 0.2);
      emit(ctx, 'plasma', {
        at,
        radius: radius * (1.05 + 0.35 * out),
        alpha: alphaOf(ctx, pose.flash),
        heat: 0,
        arcs: 0.5,
        shell: 1,
        seed: info.seed + 23,
        hot: rgb01(palette.core, 1.6),
        glow: rgb01(palette.core, 1.4),
      });
    }
  } else if (pose.alpha > 0) {
    // The rim, brightest where the eye looks along the shell.
    const rim = ctx.createRadialGradient(c.x, c.y, R * 0.55, c.x, c.y, R * 1.08);
    rim.addColorStop(0, rgbCss(palette.body, 0));
    rim.addColorStop(0.75, rgbCss(palette.body, 0.35 * pose.alpha));
    rim.addColorStop(0.9, rgbCss(palette.hot, 0.8 * pose.alpha));
    rim.addColorStop(1, rgbCss(palette.body, 0));
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(c.x, c.y, R * 1.08, 0, TAU);
    ctx.fill();
    if (pose.arcs > 0) {
      const rand = tinyRand(info.seed * 977 + Math.floor((info.elapsedMs ?? 0) / 45));
      ctx.strokeStyle = rgbCss(veinRgb, 0.85 * pose.alpha);
      ctx.lineWidth = Math.max(1, lane.h * 0.012);
      const count = Math.round(2 + 4 * pose.arcs);
      for (let k = 0; k < count; k += 1) {
        const points = shellArc(c.x, c.y, R, rand() * TAU, 0.5 + rand() * 0.7, R * 0.12, rand);
        ctx.beginPath();
        points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.stroke();
      }
    }
  }
  if (pose.flash > 0) {
    // The burst: its veins' light floods out of the breaking shell.
    const light = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, R * 1.25);
    light.addColorStop(0, rgbCss(mixRgb(palette.core, WHITE, 0.2), 0.75 * pose.flash));
    light.addColorStop(0.5, rgbCss(palette.core, 0.45 * pose.flash));
    light.addColorStop(1, rgbCss(palette.core, 0));
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(c.x, c.y, R * 1.25, 0, TAU);
    ctx.fill();
  }
  const out = p.end === 'burst' ? clamp01((s - 0.8) / 0.2) : 0;
  if (out > 0 && elementsLive(ctx)) {
    // ... and the shell itself breaks into dark glass shards thrown outward, falling.
    const rand = tinyRand(info.seed * 31 + 7);
    for (let k = 0; k < 9; k += 1) {
      const a = (k / 9) * TAU + rand() * 0.6;
      const reach = R * (0.85 + (0.9 + rand() * 0.6) * out);
      const x = c.x + Math.cos(a) * reach;
      const y = c.y + Math.sin(a) * reach * 0.85;
      const at = stageOf(ctx, x, y);
      emit(ctx, 'debris', {
        at: { ...at, z: at.z + stageLen(ctx, lane.h * (0.35 * Math.sin(Math.PI * out) - 0.15 * out)) },
        size: stageLen(ctx, lane.h * (0.05 + 0.03 * rand())),
        alpha: alphaOf(ctx, 1 - out * out),
        seed: info.seed + k * 3.1,
        colour: rgb01(palette.deep, 1.4),
        light: rgb01(palette.body, 1.3),
        stretch: 2.2,
        headingDeg: (a * 180) / Math.PI,
        spin: out * (3 + k),
        gloss: 0.8,
      });
    }
  }
  if (pose.alpha > 0) {
    // Gloss: a crescent of light along the shell's lit upper left.
    ctx.strokeStyle = rgbCss(mixRgb(palette.hot, WHITE, 0.3), 0.55 * pose.alpha);
    ctx.lineWidth = Math.max(1, R * 0.05);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(c.x, c.y, R * 0.84, Math.PI * 1.08, Math.PI * 1.42);
    ctx.stroke();
  }
  if (pose.eyes > 0) {
    const t = (info.elapsedMs ?? 0) / 1000;
    const live = elementsLive(ctx);
    for (const eye of domeEyes(p.eyes, info.seed)) {
      const flicker = 0.75 + 0.25 * Math.sin(t * 11 + eye.flicker);
      const ex = c.x + eye.x * R;
      const ey = c.y + eye.y * R - R * 0.2;
      const size = eye.size * R * 1.5;
      for (const side of [-1, 1]) {
        const x = ex + side * eye.size * R * 0.6;
        if (live) {
          emit(ctx, 'flameJet', {
            from: stageOf(ctx, x, ey + size * 0.45),
            to: stageOf(ctx, x + side * size * 0.1, ey - size),
            width: stageLen(ctx, size * 0.55),
            alpha: alphaOf(ctx, pose.eyes * flicker),
            heat: 0.25,
            seed: info.seed + eye.flicker + side,
            flow: 0.6,
            palette: { deep: rgb01(palette.deep, 1), body: rgb01(palette.body, 1.1), hot: rgb01(palette.hot, 1.4), core: rgb01(palette.core, 1.3) },
          });
        } else drawEye(ctx, x, ey, size, pose.eyes * flicker, palette);
      }
    }
  }
};

// ---- darkRibbons -------------------------------------------------------------------------

/** A ribbon of light drawn segment by segment: glow, body and a hot core, twisting as it goes. */
function drawRibbonRun(ctx, points, halfOf, colourOf, alphaOf2, facingOf, coreWhite = 0.55) {
  const normals = points.map((p, i) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return [-dy / len, dx / len];
  });
  for (const [width, alphaScale, white] of [
    [2.3, 0.2, 0],
    [1, 0.85, 0.08],
    [0.3, 0.9, coreWhite],
  ]) {
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const alpha = ((alphaOf2(a) + alphaOf2(b)) / 2) * alphaScale;
      if (!(alpha > 0.003)) continue;
      const core = width < 0.5 ? 1 + 0.6 * (1 - (facingOf(a) + facingOf(b)) / 2) : 1;
      const wa = halfOf(a) * width * core;
      const wb = halfOf(b) * width * core;
      const [nax, nay] = normals[i];
      const [nbx, nby] = normals[i + 1];
      ctx.fillStyle = rgbCss(mixRgb(colourOf(a), WHITE, white), clamp01(alpha * core));
      ctx.beginPath();
      ctx.moveTo(a.x + nax * wa, a.y + nay * wa);
      ctx.lineTo(b.x + nbx * wb, b.y + nby * wb);
      ctx.lineTo(b.x - nbx * wb, b.y - nby * wb);
      ctx.lineTo(a.x - nax * wa, a.y - nay * wa);
      ctx.closePath();
      ctx.fill();
    }
  }
}

/** Design 092: twisting ribbons of energy streak from the attacker and wrap round the defender. */
export const darkRibbons = (ctx, lane, s, info) => {
  const p = info.params;
  const { palette } = info.material;
  const half = (p.w * lane.h) / 2;
  const fade = 1 - clamp01((s - 0.9) / 0.1);
  ctx.fxLift = travelLift({ x: lane.ax, y: lane.ay }, { x: lane.bx, y: lane.by }, { z: p.z, arc: 0.08 });
  for (const ribbon of ribbonPaths(s, lane, p, info.seed)) {
    const phase = ribbon.index * 1.7 - (info.time ?? 0) * 5;
    const twist = (q) => Math.cos(q.u * p.turns * TAU + phase);
    const facing = (q) => Math.abs(twist(q));
    drawRibbonRun(
      ctx,
      ribbon.points,
      (q) => half * Math.sin(Math.PI * clamp01(q.u) ** 1.2) * (0.3 + 0.7 * facing(q)),
      (q) => {
        const lit = mixRgb(palette.body, palette.hot, clamp01((q.u - 0.55) / 0.45));
        return twist(q) < 0 ? mixRgb(lit, palette.deep, 0.55) : lit;
      },
      (q) => fade * clamp01(q.u / 0.35),
      facing
    );
  }
};

// ---- wyrmTornado -------------------------------------------------------------------------

/** A flame fin: a curved blade of fire, hot at its root, thinning to its tip. */
function drawFin(ctx, x, y, size, angle, depth, alpha, colours) {
  if (!(alpha > 0)) return;
  ctx.save();
  ctx.translate(x, y);
  // It sweeps along the band: leaning the way the band turns, nearer ones larger.
  ctx.rotate(-0.5 + 0.4 * Math.cos(angle));
  const k = 0.75 + 0.25 * depth;
  ctx.scale(k, k);
  const blade = ctx.createLinearGradient(-size * 0.2, size * 0.3, size * 0.25, -size);
  blade.addColorStop(0, rgbCss(colours[0], 0.95 * alpha));
  blade.addColorStop(0.55, rgbCss(colours[1], 0.85 * alpha));
  blade.addColorStop(1, rgbCss(colours[1], 0));
  ctx.fillStyle = blade;
  ctx.beginPath();
  ctx.moveTo(-size * 0.3, size * 0.32);
  ctx.quadraticCurveTo(size * 0.0, -size * 0.3, size * 0.34, -size);
  ctx.quadraticCurveTo(size * 0.12, -size * 0.32, size * 0.2, size * 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Design 092: a funnel of spinning bands stands on its card (the column drawn up the screen and
 * stood up like a pillar), flame fins riding it, debris tumbling round its foot (rock or metal
 * shards, shader elements when live) and a crackle running on the ground under it.
 */
export const wyrmTornado = (ctx, lane, s, info) => {
  const p = info.params;
  const pose = tornadoPose(s, lane.h, p, info.time ?? 0, info.seed);
  if (!(pose.env > 0)) return;
  const base = anchorOf(lane, p);
  const { palette } = info.material;
  ctx.fxLift = standOn(base, { stand: LIFT.upright });
  const toScreen = (x, y) => ({ x: base.x + x, y: base.y - y });
  const runs = { back: [], front: [] };
  for (const band of pose.bands) {
    if (!(band.alpha > 0)) continue;
    let run = null;
    let layer = null;
    const steps = 28;
    for (let k = 0; k <= steps; k += 1) {
      const a = band.from + ((band.to - band.from) * k) / steps;
      const depth = Math.sin(a);
      const here = depth >= 0 ? 'front' : 'back';
      const pt = toScreen(Math.cos(a) * band.rx, band.y - depth * band.ry);
      const point = { ...pt, u: k / steps, depth };
      if (here !== layer) {
        if (run && run.length > 1) runs[layer].push({ band, points: run });
        run = run ? [run[run.length - 1], point] : [point];
        layer = here;
      } else run.push(point);
    }
    if (run && run.length > 1) runs[layer].push({ band, points: run });
  }
  for (const band of pose.bands) {
    if (!(band.alpha > 0)) continue;
    const centre = toScreen(0, band.y);
    const haze = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, band.rx);
    haze.addColorStop(0, rgbCss(palette.deep, 0.2 * band.alpha));
    haze.addColorStop(0.7, rgbCss(palette.body, 0.08 * band.alpha));
    haze.addColorStop(1, rgbCss(palette.body, 0));
    ctx.fillStyle = haze;
    ctx.beginPath();
    ctx.ellipse(centre.x, centre.y, band.rx, band.rx * 0.6, 0, 0, TAU);
    ctx.fill();
  }
  const twistPhase = (info.time ?? 0) * 6;
  const draw = ({ band, points }, dim) =>
    drawRibbonRun(
      ctx,
      points,
      (q) => (band.width / 2) * Math.sin(Math.PI * clamp01(q.u) ** 1.1) * (0.45 + 0.55 * Math.abs(Math.cos(q.u * 3 + twistPhase))),
      (q) => {
        const lit = mixRgb(palette.body, palette.hot, clamp01((q.u - 0.5) / 0.5));
        return q.depth < 0 ? mixRgb(lit, palette.deep, 0.45) : lit;
      },
      (q) => band.alpha * dim * clamp01(q.u / 0.3),
      (q) => Math.abs(Math.cos(q.u * 3 + twistPhase)),
      0.25
    );
  runs.back.forEach((run) => draw(run, 0.55));
  const finColours = [hexesRgb(p.fin, 0, palette.hot), hexesRgb(p.fin, 1, palette.core)];
  const fin = (f, dim) => {
    const at = toScreen(f.x, f.y);
    drawFin(ctx, at.x, at.y, f.size, f.angle, f.depth, f.alpha * dim, finColours);
  };
  pose.fins.filter((f) => f.depth < 0).forEach((f) => fin(f, 0.6));
  runs.front.forEach((run) => draw(run, 1));
  pose.fins.filter((f) => f.depth >= 0).forEach((f) => fin(f, 1));

  if (pose.debris.length > 0) {
    const rock = hexesRgb(p.debrisColour, 0, palette.deep);
    const glint = hexesRgb(p.debrisColour, 1, palette.hot);
    for (const bit of pose.debris) {
      const at2 = toScreen(bit.x, bit.y);
      if (elementsLive(ctx)) {
        emit(ctx, 'debris', {
          at: stageOf(ctx, at2.x, at2.y),
          size: stageLen(ctx, bit.size),
          alpha: alphaOf(ctx, bit.alpha),
          seed: info.seed + bit.spin,
          colour: rgb01(rock, 1),
          light: rgb01(glint, 1.2),
          spin: bit.spin,
          stretch: p.metal > 0.5 ? 2.4 : 1.2,
          headingDeg: (bit.spin * 57) % 360,
          gloss: p.metal,
        });
      } else {
        ctx.fillStyle = rgbCss(glint, 0.5 * bit.alpha);
        ctx.beginPath();
        ctx.arc(at2.x, at2.y, bit.size, 0, TAU);
        ctx.fill();
      }
    }
  }

  if (pose.crackle > 0) {
    const colour = hexesRgb(p.crackleColour, 0, palette.hot);
    const hot = hexesRgb(p.crackleColour, 1, WHITE);
    const arcs = crackleArcs(7, p.r0 * lane.h * 1.25, info.elapsedMs ?? 0, info.seed, 45, lane.h * 0.3);
    for (const [width, rgb, alpha] of [
      [lane.h * 0.03, colour, 0.5],
      [Math.max(1, lane.h * 0.01), hot, 0.9],
    ]) {
      ctx.strokeStyle = rgbCss(rgb, alpha * pose.crackle);
      ctx.lineWidth = width;
      for (const arc of arcs) {
        ctx.beginPath();
        arc.forEach((q, i) => {
          const pt = toScreen(q.x, q.y);
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
      }
    }
  }
};

/** The design 092 ghost-dark-dragon drawers, by name (move-drawers.js wraps each in `guarded`). */
export const GHOST_DARK_DRAGON_DRAWERS = Object.freeze({ hauntedFurniture, darkDome, darkRibbons, wyrmTornado });
