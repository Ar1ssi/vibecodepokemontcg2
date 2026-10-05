// Design 063, first move built as a look test: plays Fire Blast between two card
// rects. One `fx-move` host spans both cards and stacks: a back canvas (vignette,
// rings, speed lines, the orbs while they pass behind the attacker), ghost copies
// of both cards that carry the motion (the real cards hide meanwhile), and a front
// canvas with the fire itself. Both canvases run on canvas stages (D119 single
// clock); the ghosts are WAAPI keyframes sampled from the pure poses (D103). The
// contact moment is announced to the impact queue so the damage number, flash and
// table shake land on the burst.
import {
  animateFrames,
  hideDuring,
  removeWhen,
  sampleKeyframes,
  spawnOverlay,
  spawnParticles,
} from '../../../image-logic/mat-fx.mjs';
import { playCanvasStage } from '../canvas-stage.js';
import { rgbCss } from '../fx-colors.mjs';
import { burstParticles } from '../particles.mjs';
import {
  FIRE,
  drawFireball,
  drawGlow,
  drawOrb,
  drawTongue,
  grainPass,
} from './fire-material.js';
import {
  FIRE_BLAST_CONTACT_MS,
  FIRE_BLAST_HOLD_MS,
  FIRE_BLAST_MS,
  armTongues,
  attackerCardPose,
  chargeCore,
  chargeOrbs,
  defenderCardPose,
  fireballPose,
  flarePose,
  flashPose,
  laneGeometry,
  phaseProgress,
  raysPose,
  releaseRings,
  smokePuffs,
  vignettePose,
} from './fire-blast-pose.mjs';

const BACKSTOP_PAD_MS = 400;
const EMBER_MS = 760;
const EMBER_COUNT = 22;
const GHOST_SAMPLES = 150;
const GHOST_DECODE_WAIT_MS = 120;
const TAU = Math.PI * 2;
const SHADE = [70, 6, 0];
const SMOKE = [120, 96, 84];
const EMBER_COLOR = rgbCss(FIRE.yellow);

const unionPadded = (a, b, pad) => {
  const left = Math.min(a.left, b.left) - pad;
  const top = Math.min(a.top, b.top) - pad;
  const right = Math.max(a.left + a.width, b.left + b.width) + pad;
  const bottom = Math.max(a.top + a.height, b.top + b.height) + pad;
  return { left, top, width: right - left, height: bottom - top };
};

const toLocal = (rect, host) => ({
  left: rect.left - host.left,
  top: rect.top - host.top,
  width: rect.width,
  height: rect.height,
});

const lanePoint = (lane, f, side) => {
  const start = lane.h * 0.42;
  const d = start + (lane.length - start) * f;
  return {
    x: lane.ax + lane.ux * d + lane.nx * side,
    y: lane.ay + lane.uy * d + lane.ny * side,
  };
};

// ---- back canvas: what sits behind the cards ---------------------------------

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

const drawRings = (ctx, lane, s) => {
  for (const ring of releaseRings(s, lane.h)) {
    ctx.strokeStyle = rgbCss(FIRE.orange, ring.alpha);
    ctx.lineWidth = ring.width;
    ctx.beginPath();
    ctx.ellipse(lane.ax, lane.ay, ring.r, ring.r * 0.45, 0, 0, TAU);
    ctx.stroke();
  }
};

const drawRays = (ctx, lane, s) => {
  const rays = raysPose(s, lane.h);
  if (!(rays.alpha > 0)) return;
  ctx.strokeStyle = rgbCss(FIRE.yellow, rays.alpha);
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

const drawOrbs = (ctx, lane, t, time, seed, front) => {
  for (const orb of chargeOrbs(t, lane.h)) {
    if (front ? orb.depth < 0 : orb.depth >= 0) continue;
    drawFireball(ctx, {
      x: lane.ax + orb.dx,
      y: lane.ay + orb.dy,
      r: orb.r,
      headingDeg: orb.heading,
      time,
      seed: seed + orb.dx,
      alpha: orb.alpha,
      tongues: 4,
      hot: 0.8,
    });
  }
};

// ---- front canvas: the fire ----------------------------------------------------

const drawCharge = (ctx, lane, t, time, seed) => {
  const core = chargeCore(t, lane.h);
  const x = lane.ax + lane.ux * core.lead;
  const y = lane.ay + lane.uy * core.lead;
  drawGlow(ctx, x, y, core.r * 2, core.alpha * 0.5);
  drawOrb(ctx, x, y, core.r, core.alpha, 0.9);
  drawOrbs(ctx, lane, t, time, seed, true);
};

const drawRelease = (ctx, lane, s, time, seed) => {
  const ball = fireballPose(s, lane.h);
  const p = lanePoint(lane, ball.f, ball.side);
  drawFireball(ctx, {
    x: p.x,
    y: p.y,
    r: ball.r,
    headingDeg: lane.angleDeg,
    time,
    seed,
    alpha: ball.alpha,
    tongues: 9,
  });
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
  g.addColorStop(0, rgbCss(FIRE.white, flash.alpha));
  g.addColorStop(0.5, rgbCss(FIRE.core, flash.alpha * 0.7));
  g.addColorStop(1, rgbCss(FIRE.yellow, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(lane.bx, lane.by, flash.r, 0, TAU);
  ctx.fill();
};

const drawFlare = (ctx, lane, s, time, seed) => {
  const flare = flarePose(s, lane.h);
  drawGlow(ctx, lane.bx, lane.by, lane.h * 1.3, flare.core.alpha * 0.4);
  flare.arms.forEach((arm, index) => {
    const a = (arm.angle * Math.PI) / 180;
    for (const tongue of armTongues(arm, flare.breakUp)) {
      drawTongue(
        ctx,
        {
          x: lane.bx + Math.cos(a) * tongue.from,
          y: lane.by + Math.sin(a) * tongue.from,
          angleDeg: tongue.angleDeg,
          length: tongue.length,
          width: tongue.width,
          time,
          seed: seed + index * 3.3 + tongue.from * 0.01,
        },
        { alpha: tongue.alpha, hot: 1 - 0.5 * flare.breakUp }
      );
    }
  });
  drawOrb(ctx, lane.bx, lane.by, flare.core.r, flare.core.alpha, 1);
};

const drawSmoke = (ctx, lane, s) => {
  for (const puff of smokePuffs(s, lane.h)) {
    const x = lane.bx + puff.dx;
    const y = lane.by + puff.dy;
    const g = ctx.createRadialGradient(x, y, 0, x, y, puff.r);
    g.addColorStop(0, rgbCss(SMOKE, puff.alpha));
    g.addColorStop(1, rgbCss(SMOKE, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, puff.r, 0, TAU);
    ctx.fill();
  }
};

// ---- ghost cards ---------------------------------------------------------------

const cardGhost = (host, rect, src, turn, className) => {
  const ghost = document.createElement('div');
  ghost.className = `fx-move__ghost ${className}`;
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  const img = document.createElement('img');
  img.className = 'fx-move__ghost-art';
  img.src = src;
  img.alt = '';
  img.draggable = false;
  if (turn) img.style.transform = `rotate(${turn}deg)`;
  const rim = document.createElement('div');
  rim.className = 'fx-move__rim';
  const heat = document.createElement('div');
  heat.className = 'fx-move__heat';
  ghost.append(img, rim, heat);
  host.appendChild(ghost);
  // The real card hides only once the ghost's art has decoded, else both are
  // blank for a frame (Chromium decodes a freshly inserted <img> asynchronously).
  const ready = Promise.race([
    (img.decode?.() ?? Promise.resolve()).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, GHOST_DECODE_WAIT_MS)),
  ]);
  return { ghost, rim, heat, ready };
};

const ghostTransform = (
  lane,
  {
    along = 0,
    across = 0,
    scaleAlong = 1,
    scaleAcross = 1,
    scale = 1,
    rotate = 0,
  }
) => {
  const x = (lane.ux * along + lane.nx * across) * lane.h;
  const y = (lane.uy * along + lane.ny * across) * lane.h;
  const squash =
    scaleAlong !== 1 || scaleAcross !== 1
      ? ` rotate(${lane.angleDeg}deg) scale(${scaleAlong}, ${scaleAcross}) rotate(${-lane.angleDeg}deg)`
      : '';
  return `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)${squash} rotate(${rotate.toFixed(2)}deg) scale(${scale})`;
};

const animateGhost = (parts, lane, poseAt) => {
  const ms = (t) => t * FIRE_BLAST_MS;
  const body = sampleKeyframes(
    (t) => poseAt(ms(t)),
    (p) => ({ transform: ghostTransform(lane, p) }),
    GHOST_SAMPLES
  );
  const rim = sampleKeyframes(
    (t) => poseAt(ms(t)),
    (p) => ({ opacity: p.glow ?? p.heat ?? 0 }),
    GHOST_SAMPLES
  );
  const heat = sampleKeyframes(
    (t) => poseAt(ms(t)),
    (p) => ({ opacity: p.heat ?? 0 }),
    GHOST_SAMPLES
  );
  return [
    animateFrames(parts.ghost, body, { duration: FIRE_BLAST_MS }),
    animateFrames(parts.rim, rim, { duration: FIRE_BLAST_MS }),
    animateFrames(parts.heat, heat, { duration: FIRE_BLAST_MS }),
  ];
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
    distance: h * 1.3,
    direction: -90,
    spread: 300,
    size: [h * 0.05, h * 0.13],
    aspect: 0.3,
    gravity: h * 0.6,
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
 * Play Fire Blast from `attacker` to `defender` (`rect` in parent-viewport
 * pixels, `src` the card art, `turn` the board's rotation in degrees, `element`
 * the real card to hide while its ghost moves). Announces the contact moment on
 * `impacts` (combat.js's queue) when given.
 * @param {{attacker: {rect: object, src: string, turn?: number, element?: Element|null},
 *   defender: {rect: object, src: string, turn?: number, element?: Element|null},
 *   seed?: number, impacts?: {strikeIn: Function}|null, attackerCard?: object|null}} opts
 * @returns {{holdMs:number, durationMs:number, contactMs:number}|null} null when nothing could play
 */
export function playFireBlast({
  attacker,
  defender,
  seed = 1,
  impacts = null,
  attackerCard = null,
}) {
  const from = attacker?.rect;
  const to = defender?.rect;
  if (!from || !to || !attacker.src || !defender.src) return null;
  const lane = laneGeometry(from, to);
  if (!lane) return null;
  const hostRect = unionPadded(from, to, lane.h * 1.7);
  const host = spawnOverlay({
    rect: hostRect,
    className: 'fx-overlay fx-move fx-move--fire-blast',
  });
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
  const defenderLocal = toLocal(to, hostRect);
  const time0 = seed * 0.37;
  let embersSpawned = false;

  const drawBack = (ctx, _t, elapsedMs) => {
    ctx.translate(ox, oy);
    const time = time0 + elapsedMs / 1000;
    const vignette = phaseProgress(elapsedMs, 'vignette');
    if (vignette !== null) drawVignette(ctx, local, vignette);
    ctx.globalCompositeOperation = 'lighter';
    const charge = phaseProgress(elapsedMs, 'charge');
    if (charge !== null) drawOrbs(ctx, local, charge, time, seed, false);
    const rings = phaseProgress(elapsedMs, 'rings');
    if (rings !== null) drawRings(ctx, local, rings);
    const rays = phaseProgress(elapsedMs, 'rays');
    if (rays !== null) drawRays(ctx, local, rays);
    ctx.globalCompositeOperation = 'source-over';
  };

  const drawFront = (ctx, _t, elapsedMs) => {
    ctx.translate(ox, oy);
    const time = time0 + elapsedMs / 1000;
    const smoke = phaseProgress(elapsedMs, 'smoke');
    if (smoke !== null) drawSmoke(ctx, local, smoke);
    ctx.globalCompositeOperation = 'lighter';
    const charge = phaseProgress(elapsedMs, 'charge');
    if (charge !== null) drawCharge(ctx, local, charge, time, seed);
    const release = phaseProgress(elapsedMs, 'release');
    if (release !== null) drawRelease(ctx, local, release, time, seed);
    const flare = phaseProgress(elapsedMs, 'flare');
    if (flare !== null) drawFlare(ctx, local, flare, time, seed);
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    grainPass(ctx, ctx.canvas.width, time, 0.28);
    ctx.translate(ox, oy);
    ctx.globalCompositeOperation = 'lighter';
    const flash = phaseProgress(elapsedMs, 'flash');
    if (flash !== null) drawFlash(ctx, local, flash);
    ctx.globalCompositeOperation = 'source-over';
    if (!embersSpawned && elapsedMs >= FIRE_BLAST_CONTACT_MS) {
      embersSpawned = true;
      spawnEmbers(host, defenderLocal, seed);
    }
  };

  impacts?.strikeIn?.(FIRE_BLAST_CONTACT_MS, {
    direction: lane.angleDeg,
    attackerCard,
    move: 'fire-blast',
    family: 'burst',
  });

  const stageOpts = {
    cx: hostRect.width / 2,
    cy: hostRect.height / 2,
    size,
    duration: FIRE_BLAST_MS,
  };
  const back = playCanvasStage(host, {
    ...stageOpts,
    className: 'fx-move__canvas',
    draw: drawBack,
  });
  const attackerGhost = cardGhost(
    host,
    toLocal(from, hostRect),
    attacker.src,
    attacker.turn || 0,
    'fx-move__ghost--attacker'
  );
  const defenderGhost = cardGhost(
    host,
    toLocal(to, hostRect),
    defender.src,
    defender.turn || 0,
    'fx-move__ghost--defender'
  );
  const front = playCanvasStage(host, {
    ...stageOpts,
    className: 'fx-move__canvas fx-move__canvas--front',
    draw: drawFront,
  });
  const ghosts = [
    ...animateGhost(attackerGhost, local, (ms) => {
      const p = attackerCardPose(ms);
      return { along: p.along, scale: p.scale, rotate: p.tilt, glow: p.glow };
    }),
    ...animateGhost(defenderGhost, local, (ms) => {
      const p = defenderCardPose(ms);
      return {
        along: p.along,
        across: p.across,
        scaleAlong: p.scaleAlong,
        scaleAcross: p.scaleAcross,
        rotate: p.wobble,
        heat: p.heat,
      };
    }),
  ];
  const backstop = FIRE_BLAST_MS + EMBER_MS + BACKSTOP_PAD_MS;
  removeWhen(host, [back, front, ...ghosts], backstop);
  const cardsDone = Promise.all([back, front]);
  Promise.all([attackerGhost.ready, defenderGhost.ready]).then(() => {
    if (!host.isConnected) return;
    hideDuring(attacker.element, cardsDone, backstop);
    hideDuring(defender.element, cardsDone, backstop);
  });
  return {
    holdMs: FIRE_BLAST_HOLD_MS,
    durationMs: FIRE_BLAST_MS,
    contactMs: FIRE_BLAST_CONTACT_MS,
  };
}
