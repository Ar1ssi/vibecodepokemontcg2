// Design 063, first move built as a look test: plays Fire Blast between two card
// rects on one canvas stage (D119 single clock) over one `fx-move` host, and
// announces its contact moment to the impact queue so the damage number, flash
// and table shake land on the burst. Embers at contact are CSS particles.
import {
  removeWhen,
  spawnOverlay,
  spawnParticles,
} from '../../../image-logic/mat-fx.mjs';
import { playCanvasStage } from '../canvas-stage.js';
import { rgbCss } from '../fx-colors.mjs';
import { burstParticles } from '../particles.mjs';
import {
  FIRE_BLAST_CONTACT_MS,
  FIRE_BLAST_HOLD_MS,
  FIRE_BLAST_MS,
  armBlobs,
  chargeCore,
  chargeOrbs,
  fireballPose,
  fireballTrail,
  flarePose,
  flashPose,
  laneGeometry,
  phaseProgress,
  raysPose,
  releaseRings,
  vignettePose,
} from './fire-blast-pose.mjs';

const BACKSTOP_PAD_MS = 400;
const EMBER_MS = 760;
const EMBER_COUNT = 20;
const TAU = Math.PI * 2;
// Palette from the B2W2 sprite: red, orange, yellow, and a near-white core.
const RED = [210, 41, 8];
const ORANGE = [235, 108, 6];
const YELLOW = [241, 175, 13];
const CORE = [255, 246, 214];
const EMBER_COLOR = rgbCss(YELLOW);
const SHADE = [70, 6, 0];

const unionPadded = (a, b, pad) => {
  const left = Math.min(a.left, b.left) - pad;
  const top = Math.min(a.top, b.top) - pad;
  const right = Math.max(a.left + a.width, b.left + b.width) + pad;
  const bottom = Math.max(a.top + a.height, b.top + b.height) + pad;
  return { left, top, width: right - left, height: bottom - top };
};

/** One soft fireball: near-white core, yellow, orange, red falling to nothing. */
const fireBlob = (ctx, x, y, r, alpha, core = 1) => {
  if (!(r > 0) || !(alpha > 0)) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgbCss(CORE, alpha * core));
  g.addColorStop(0.28, rgbCss(YELLOW, alpha));
  g.addColorStop(0.58, rgbCss(ORANGE, alpha * 0.8));
  g.addColorStop(1, rgbCss(RED, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
};

const drawCharge = (ctx, lane, t) => {
  const core = chargeCore(t, lane.h);
  fireBlob(
    ctx,
    lane.ax + lane.ux * core.lead,
    lane.ay + lane.uy * core.lead,
    core.r,
    core.alpha,
    0.9
  );
  for (const orb of chargeOrbs(t, lane.h)) {
    fireBlob(ctx, lane.ax + orb.dx, lane.ay + orb.dy, orb.r, orb.alpha, 0.8);
  }
};

const drawRings = (ctx, lane, s) => {
  for (const ring of releaseRings(s, lane.h)) {
    ctx.strokeStyle = rgbCss(ORANGE, ring.alpha);
    ctx.lineWidth = ring.width;
    ctx.beginPath();
    ctx.ellipse(lane.ax, lane.ay, ring.r, ring.r * 0.45, 0, 0, TAU);
    ctx.stroke();
  }
};

const lanePoint = (lane, f, side) => ({
  x:
    lane.ax +
    lane.ux * (lane.h * 0.42 + (lane.length - lane.h * 0.42) * f) +
    lane.nx * side,
  y:
    lane.ay +
    lane.uy * (lane.h * 0.42 + (lane.length - lane.h * 0.42) * f) +
    lane.ny * side,
});

const drawRelease = (ctx, lane, s) => {
  for (const puff of fireballTrail(s, lane.h)) {
    const p = lanePoint(lane, puff.f, puff.side);
    fireBlob(ctx, p.x, p.y, puff.r, puff.alpha, 0.5);
  }
  const ball = fireballPose(s, lane.h);
  const p = lanePoint(lane, ball.f, ball.side);
  fireBlob(ctx, p.x, p.y, ball.r * 1.6, ball.alpha * 0.45, 0.3);
  fireBlob(ctx, p.x, p.y, ball.r, ball.alpha, 1);
};

const drawVignette = (ctx, lane, t) => {
  const v = vignettePose(t, lane.h);
  if (!(v.alpha > 0)) return;
  const g = ctx.createRadialGradient(
    lane.bx,
    lane.by,
    v.inner,
    lane.bx,
    lane.by,
    v.outer
  );
  g.addColorStop(0, rgbCss(SHADE, 0));
  g.addColorStop(0.45, rgbCss(SHADE, v.alpha));
  g.addColorStop(1, rgbCss(SHADE, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(lane.bx, lane.by, v.outer, 0, TAU);
  ctx.fill();
};

const drawRays = (ctx, lane, s) => {
  const rays = raysPose(s, lane.h);
  if (!(rays.alpha > 0)) return;
  ctx.strokeStyle = rgbCss(YELLOW, rays.alpha);
  ctx.lineWidth = lane.h * 0.03;
  ctx.beginPath();
  for (let i = 0; i < rays.count; i += 1) {
    const a = (i / rays.count) * TAU + rays.spin;
    ctx.moveTo(
      lane.bx + Math.cos(a) * rays.inner,
      lane.by + Math.sin(a) * rays.inner
    );
    ctx.lineTo(
      lane.bx + Math.cos(a) * rays.outer,
      lane.by + Math.sin(a) * rays.outer
    );
  }
  ctx.stroke();
};

const drawFlash = (ctx, lane, s) => {
  const flash = flashPose(s, lane.h);
  if (!(flash.alpha > 0)) return;
  const g = ctx.createRadialGradient(
    lane.bx,
    lane.by,
    0,
    lane.bx,
    lane.by,
    flash.r
  );
  g.addColorStop(0, rgbCss([255, 255, 255], flash.alpha));
  g.addColorStop(0.5, rgbCss(CORE, flash.alpha * 0.7));
  g.addColorStop(1, rgbCss(YELLOW, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(lane.bx, lane.by, flash.r, 0, TAU);
  ctx.fill();
};

const drawFlare = (ctx, lane, s, elapsedMs) => {
  const flare = flarePose(s, lane.h);
  flare.arms.forEach((arm, index) => {
    const rad = (arm.angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    for (const blob of armBlobs(arm, lane.h, elapsedMs, index)) {
      fireBlob(
        ctx,
        lane.bx + cos * blob.at,
        lane.by + sin * blob.at,
        blob.r,
        blob.alpha,
        0.85
      );
    }
  });
  fireBlob(ctx, lane.bx, lane.by, flare.core.r, flare.core.alpha, 1);
};

const spawnEmbers = (host, defenderLocal, seed) => {
  const layer = document.createElement('div');
  layer.className = 'fx-move__embers';
  layer.style.left = `${defenderLocal.left}px`;
  layer.style.top = `${defenderLocal.top}px`;
  layer.style.width = `${defenderLocal.width}px`;
  layer.style.height = `${defenderLocal.height}px`;
  host.appendChild(layer);
  const h = defenderLocal.height;
  const embers = burstParticles({
    count: EMBER_COUNT,
    distance: h * 1.25,
    direction: -90,
    spread: 300,
    size: [h * 0.06, h * 0.14],
    aspect: 0.3,
    gravity: h * 0.55,
    maxDelay: 0.12,
    seed,
  });
  spawnParticles(layer, embers, {
    className: 'fx-particle--streak',
    color: EMBER_COLOR,
    duration: EMBER_MS,
  });
};

/**
 * Play Fire Blast from `from` to `to` (parent-viewport rects). Announces the
 * contact moment on `impacts` (combat.js's queue) when given.
 * @param {{from: object, to: object, seed?: number, impacts?: {strikeIn: Function}|null,
 *   attackerCard?: object|null}} opts
 * @returns {{holdMs:number, durationMs:number, contactMs:number}|null} null when nothing could play
 */
export function playFireBlast({
  from,
  to,
  seed = 1,
  impacts = null,
  attackerCard = null,
}) {
  if (!from || !to) return null;
  const lane = laneGeometry(from, to);
  if (!lane) return null;
  const pad = lane.h * 1.7;
  const hostRect = unionPadded(from, to, pad);
  const host = spawnOverlay({
    rect: hostRect,
    className: 'fx-overlay fx-move fx-move--fire-blast',
  });
  // Draw in host-local pixels: shift the lane by the host's origin.
  const local = {
    ...lane,
    ax: lane.ax - hostRect.left,
    ay: lane.ay - hostRect.top,
    bx: lane.bx - hostRect.left,
    by: lane.by - hostRect.top,
  };
  const size = Math.ceil(Math.max(hostRect.width, hostRect.height));
  const ox = (size - hostRect.width) / 2;
  const oy = (size - hostRect.height) / 2;
  const defenderLocal = {
    left: to.left - hostRect.left,
    top: to.top - hostRect.top,
    width: to.width,
    height: to.height,
  };
  let embersSpawned = false;

  const draw = (ctx, _t, elapsedMs) => {
    ctx.translate(ox, oy);
    const vignette = phaseProgress(elapsedMs, 'vignette');
    if (vignette !== null) drawVignette(ctx, local, vignette);
    ctx.globalCompositeOperation = 'lighter';
    const charge = phaseProgress(elapsedMs, 'charge');
    if (charge !== null) drawCharge(ctx, local, charge);
    const rings = phaseProgress(elapsedMs, 'rings');
    if (rings !== null) drawRings(ctx, local, rings);
    const release = phaseProgress(elapsedMs, 'release');
    if (release !== null) drawRelease(ctx, local, release);
    const rays = phaseProgress(elapsedMs, 'rays');
    if (rays !== null) drawRays(ctx, local, rays);
    const flare = phaseProgress(elapsedMs, 'flare');
    if (flare !== null) drawFlare(ctx, local, flare, elapsedMs);
    const flash = phaseProgress(elapsedMs, 'flash');
    if (flash !== null) drawFlash(ctx, local, flash);
    ctx.globalCompositeOperation = 'source-over';
    if (!embersSpawned && elapsedMs >= FIRE_BLAST_CONTACT_MS) {
      embersSpawned = true;
      spawnEmbers(host, defenderLocal, seed);
    }
  };

  impacts?.strikeIn?.(FIRE_BLAST_CONTACT_MS, {
    direction: (Math.atan2(lane.uy, lane.ux) * 180) / Math.PI,
    attackerCard,
    move: 'fire-blast',
    family: 'burst',
  });
  const stage = playCanvasStage(host, {
    className: 'fx-move__canvas',
    cx: hostRect.width / 2,
    cy: hostRect.height / 2,
    size,
    duration: FIRE_BLAST_MS,
    draw,
  });
  // Embers are spawned mid-scene, so the backstop is the only thing waiting on them.
  removeWhen(host, [stage], FIRE_BLAST_MS + EMBER_MS + BACKSTOP_PAD_MS);
  return {
    holdMs: FIRE_BLAST_HOLD_MS,
    durationMs: FIRE_BLAST_MS,
    contactMs: FIRE_BLAST_CONTACT_MS,
  };
}
