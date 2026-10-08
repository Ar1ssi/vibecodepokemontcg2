// Design 063: the one player every move spec runs through (the Fire Blast look test,
// generalised). One `fx-move` host spans both cards and stacks: a back canvas (what sits
// behind the cards), ghost copies of both cards that carry the motion (the real cards hide
// meanwhile), a front canvas with the move itself, then CSS particles. Both canvases run on
// canvas stages (D119 single clock); the ghosts are WAAPI keyframes sampled from the pure
// card-motion presets (D103). The contact moment is announced to the impact queue so the
// damage number, flash and table shake land on it.
import {
  animateFrames,
  hideDuring,
  removeWhen,
  sampleKeyframes,
  spawnOverlay,
  spawnParticles,
} from '../../../image-logic/mat-fx.mjs';
import { playCanvasStage } from '../canvas-stage.js';
import { burstParticles } from '../particles.mjs';
import { attackerPose, defenderPose } from './card-motion.mjs';
import { DRAWERS } from './move-drawers.js';
import { laneGeometry, localLane, phaseProgress, toLocal, unionPadded } from './move-geometry.mjs';
import { terrainPose } from './move-poses.mjs';
import { DEFAULT_PAD, withDefaults } from './move-spec.mjs';
import { materialFor } from './materials/index.js';
import { lighten, tintedPalette } from './materials/_shared.js';

const BACKSTOP_PAD_MS = 400;
const GHOST_SAMPLES = 150;
const GHOST_DECODE_WAIT_MS = 120;
const TRAILS = Object.freeze([
  { lag: 0.035, alpha: 0.38 },
  { lag: 0.07, alpha: 0.2 },
]);

const isSourceOver = (beat) =>
  beat.drawer === 'vignette' || beat.drawer === 'smoke' || (beat.drawer === 'terrain' && beat.params.kind === 'crack');

// ---- beat colours (design 065 § New pieces A) ----------------------------------

/**
 * A per-scene memo of tinted materials: `cachedTint(material, tint)` is `material` redrawn
 * over its palette with `tint`'s keys replaced, built once per material key and tint.
 */
export function tintCache() {
  const cache = new Map();
  return function cachedTint(material, tint) {
    const key = `${material.key}|${JSON.stringify(tint)}`;
    if (!cache.has(key)) cache.set(key, material.withPalette(tintedPalette(material.palette, tint)));
    return cache.get(key);
  };
}

/**
 * Resolve a beat's `tint` and `hues` against the scene material: `material` is what the
 * drawer draws with; `materialAt(i)` is item `i`'s material (hues[i % n] as its body, a
 * lighter hot), or the beat material without hues. The returned params drop both keys, so
 * drawers never see them.
 */
export function resolveBeatColours(material, params, cachedTint) {
  const { tint = null, hues = null, ...rest } = params ?? {};
  const beatMaterial = tint ? cachedTint(material, tint) : material;
  const materialAt =
    hues && hues.length > 0
      ? (i) => {
          const hue = hues[((i % hues.length) + hues.length) % hues.length];
          return cachedTint(material, { ...tint, body: hue, hot: lighten(hue, 0.35) });
        }
      : () => beatMaterial;
  return { material: beatMaterial, materialAt, params: rest };
}

// ---- ghost cards ---------------------------------------------------------------

const cardGhost = (host, rect, src, turn, className, { layers = true } = {}) => {
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
  const rim = layers ? document.createElement('div') : null;
  const heat = layers ? document.createElement('div') : null;
  if (layers) {
    rim.className = 'fx-move__rim';
    heat.className = 'fx-move__heat';
    ghost.append(img, rim, heat);
  } else {
    ghost.append(img);
  }
  host.appendChild(ghost);
  // The real card hides only once the ghost's art has decoded, else both are blank for a
  // frame (Chromium decodes a freshly inserted <img> asynchronously).
  const ready = Promise.race([
    (img.decode?.() ?? Promise.resolve()).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, GHOST_DECODE_WAIT_MS)),
  ]);
  return { ghost, rim, heat, ready };
};

const ghostTransform = (lane, { along = 0, across = 0, lift = 0, scaleAlong = 1, scaleAcross = 1, scale = 1, rotate = 0 }) => {
  const x = (lane.ux * along + lane.nx * across) * lane.h;
  const y = (lane.uy * along + lane.ny * across - lift) * lane.h;
  const squash =
    scaleAlong !== 1 || scaleAcross !== 1
      ? ` rotate(${lane.angleDeg}deg) scale(${scaleAlong}, ${scaleAcross}) rotate(${-lane.angleDeg}deg)`
      : '';
  return `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)${squash} rotate(${rotate.toFixed(2)}deg) scale(${scale})`;
};

const animateGhost = (parts, lane, durationMs, poseAt) => {
  const at = (t) => poseAt(t * durationMs);
  const body = sampleKeyframes(at, (p) => ({ transform: ghostTransform(lane, p) }), GHOST_SAMPLES);
  const rim = sampleKeyframes(at, (p) => ({ opacity: p.glow ?? p.heat ?? 0 }), GHOST_SAMPLES);
  const heat = sampleKeyframes(at, (p) => ({ opacity: p.heat ?? 0 }), GHOST_SAMPLES);
  return [
    animateFrames(parts.ghost, body, { duration: durationMs }),
    animateFrames(parts.rim, rim, { duration: durationMs }),
    animateFrames(parts.heat, heat, { duration: durationMs }),
  ];
};

/** A lagged copy of the attacker that smears the dash (today's lunge trails). */
const trailGhost = (host, rect, src, turn) => {
  const parts = cardGhost(host, rect, src, turn, 'fx-move__ghost--trail', { layers: false });
  parts.ghost.style.opacity = '0';
  return parts;
};

const animateTrail = (parts, lane, spec, lag, alpha, poseAt) => {
  const { contactMs: c, durationMs } = spec;
  const frames = sampleKeyframes(
    (t) => {
      const ms = t * durationMs;
      const window = Math.max(0, Math.sin((Math.PI * (ms - 0.3 * c)) / (0.85 * c)));
      return { pose: poseAt(Math.max(0, ms - lag * durationMs)), opacity: ms >= 0.3 * c && ms <= 1.15 * c ? alpha * window : 0 };
    },
    ({ pose, opacity }) => ({ transform: ghostTransform(lane, pose), opacity }),
    GHOST_SAMPLES
  );
  return animateFrames(parts.ghost, frames, { duration: durationMs });
};

// ---- particle bursts -----------------------------------------------------------

const spawnBurst = (host, anchorRect, burst, material, seed) => {
  const layer = document.createElement('div');
  layer.className = 'fx-move__embers';
  layer.style.left = `${anchorRect.left}px`;
  layer.style.top = `${anchorRect.top}px`;
  layer.style.width = `${anchorRect.width}px`;
  layer.style.height = `${anchorRect.height}px`;
  host.appendChild(layer);
  const h = anchorRect.height;
  const rows = burstParticles({
    count: burst.count,
    distance: h * burst.distance,
    direction: burst.direction,
    spread: burst.spread,
    size: [h * burst.size[0], h * burst.size[1]],
    aspect: burst.aspect,
    gravity: h * burst.gravity,
    maxDelay: burst.maxDelay,
    seed,
  });
  return spawnParticles(layer, rows, {
    className: `fx-particle--${burst.kind}`,
    color: material.particle.color,
    duration: burst.durationMs,
  });
};

// ---- the player ------------------------------------------------------------------

const warned = new Set();
const runBeat = (beat, index, ctx, local, progress, info) => {
  try {
    DRAWERS[beat.drawer]?.draw(ctx, local, progress, {
      ...info,
      material: beat.material,
      materialAt: beat.materialAt,
      params: beat.params,
      beatMs: beat.until - beat.at,
    });
  } catch (error) {
    // One bad spec must never blank the scene: log once per beat, keep drawing the rest.
    const key = `${info.spec.id}:${index}`;
    if (!warned.has(key)) {
      warned.add(key);
      console.debug('move beat failed', key, error);
    }
  }
};

/**
 * Play `spec` from `attacker` to `defender` (`rect` in parent-viewport px, `src` the card
 * art, `turn` the board's rotation in degrees, `element` the real card to hide while its
 * ghost moves). Announces the contact moment on `impacts` (combat.js's queue) when given.
 * @param {{spec: object, attacker: {rect: object, src: string, turn?: number, element?: Element|null},
 *   defender: {rect: object, src: string, turn?: number, element?: Element|null},
 *   seed?: number, impacts?: {strikeIn: Function}|null, attackerCard?: object|null}} opts
 * @returns {{holdMs:number, durationMs:number, contactMs:number}|null} null when nothing could play
 */
export function playMove({ spec, attacker, defender, seed = 1, impacts = null, attackerCard = null }) {
  const from = attacker?.rect;
  const to = defender?.rect;
  if (!spec || !from || !to || !attacker.src || !defender.src) return null;
  const lane = laneGeometry(from, to);
  if (!lane) return null;
  const { durationMs, contactMs } = spec;
  const material = materialFor(spec.material);
  const hostRect = unionPadded(from, to, lane.h * (spec.pad ?? DEFAULT_PAD));
  const host = spawnOverlay({
    rect: hostRect,
    className: `fx-overlay fx-move fx-move--${spec.id} fx-move--m-${material.key}`,
  });
  const local = localLane(lane, hostRect);
  const size = Math.ceil(Math.max(hostRect.width, hostRect.height));
  const ox = (size - hostRect.width) / 2;
  const oy = (size - hostRect.height) / 2;
  const anchors = { attacker: toLocal(from, hostRect), defender: toLocal(to, hostRect) };
  const time0 = seed * 0.37;
  const cachedTint = tintCache();
  const beats = spec.beats.map((beat) => ({
    ...beat,
    ...resolveBeatColours(material, withDefaults(beat.drawer, beat.params), cachedTint),
  }));
  const quakes = beats.filter((beat) => beat.drawer === 'terrain' && beat.params.kind === 'quake');
  const pendingBursts = (spec.particles ?? []).map((burst, index) => ({ burst, index, spawned: false }));

  const drawLayer = (ctx, layer, elapsedMs, info) => {
    for (const composite of ['source-over', 'lighter']) {
      ctx.globalCompositeOperation = composite;
      beats.forEach((beat, index) => {
        if (beat.layer !== layer || isSourceOver(beat) !== (composite === 'source-over')) return;
        const progress = phaseProgress(elapsedMs, [beat.at, beat.until]);
        if (progress !== null) runBeat(beat, index, ctx, local, progress, info);
      });
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  const sceneInfo = (elapsedMs) => ({ elapsedMs, time: time0 + elapsedMs / 1000, seed, material, spec });

  const drawBack = (ctx, _t, elapsedMs) => {
    ctx.translate(ox, oy);
    drawLayer(ctx, 'back', elapsedMs, sceneInfo(elapsedMs));
    if (quakes.length === 0) return;
    let x = 0;
    let y = 0;
    for (const quake of quakes) {
      const progress = phaseProgress(elapsedMs, [quake.at, quake.until]);
      if (progress === null) continue;
      const jitter = terrainPose(progress, local.h, seed, quake.params).jitter;
      x += jitter.x;
      y += jitter.y;
    }
    host.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
  };

  const drawFront = (ctx, _t, elapsedMs) => {
    const info = sceneInfo(elapsedMs);
    const dpr = ctx.canvas.width / size;
    ctx.translate(ox, oy);
    drawLayer(ctx, 'front', elapsedMs, info);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    material.grain(ctx, ctx.canvas.width, info.time, spec.grain ?? 0);
    ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
    drawLayer(ctx, 'top', elapsedMs, info);
    for (const pending of pendingBursts) {
      if (pending.spawned || elapsedMs < pending.burst.at) continue;
      pending.spawned = true;
      spawnBurst(host, anchors[pending.burst.anchor], pending.burst, material, seed + pending.index);
    }
  };

  impacts?.strikeIn?.(contactMs, {
    direction: lane.angleDeg,
    attackerCard,
    move: spec.id,
    family: spec.family,
  });

  const stageOpts = { cx: hostRect.width / 2, cy: hostRect.height / 2, size, duration: durationMs };
  const back = playCanvasStage(host, { ...stageOpts, className: 'fx-move__canvas', draw: drawBack });

  const laneH = lane.length / lane.h;
  const attackerAt = (ms) => {
    const p = attackerPose(spec.attacker.motion, ms, { contactMs, durationMs, params: spec.attacker.params, laneH });
    return { along: p.along, across: p.across, scale: p.scale, rotate: p.tilt, glow: p.glow };
  };
  const defenderAt = (ms) => {
    const p = defenderPose(spec.defender.motion, ms, { contactMs, durationMs, params: spec.defender.params, laneH });
    return {
      along: p.along,
      across: p.across,
      lift: p.lift,
      scaleAlong: p.scaleAlong,
      scaleAcross: p.scaleAcross,
      rotate: p.wobble,
      heat: p.heat,
    };
  };

  const trails =
    spec.attacker.motion === 'dash'
      ? TRAILS.map(() => trailGhost(host, anchors.attacker, attacker.src, attacker.turn || 0))
      : [];
  const attackerGhost = cardGhost(host, anchors.attacker, attacker.src, attacker.turn || 0, 'fx-move__ghost--attacker');
  const defenderGhost = cardGhost(host, anchors.defender, defender.src, defender.turn || 0, 'fx-move__ghost--defender');
  if (spec.defender.motion === 'freeze') defenderGhost.heat.classList.add('fx-move__heat--cold');
  const front = playCanvasStage(host, { ...stageOpts, className: 'fx-move__canvas fx-move__canvas--front', draw: drawFront });

  const ghosts = [
    ...animateGhost(attackerGhost, local, durationMs, attackerAt),
    ...animateGhost(defenderGhost, local, durationMs, defenderAt),
    ...trails.map((trail, index) => animateTrail(trail, local, spec, TRAILS[index].lag, TRAILS[index].alpha, attackerAt)),
  ];
  const burstMs = Math.max(0, ...(spec.particles ?? []).map((burst) => burst.durationMs));
  const backstop = durationMs + burstMs + BACKSTOP_PAD_MS;
  removeWhen(host, [back, front, ...ghosts], backstop);
  const cardsDone = Promise.all([back, front]);
  Promise.all([attackerGhost.ready, defenderGhost.ready]).then(() => {
    if (!host.isConnected) return;
    hideDuring(attacker.element, cardsDone, backstop);
    hideDuring(defender.element, cardsDone, backstop);
  });
  return { holdMs: contactMs + 40, durationMs, contactMs };
}
