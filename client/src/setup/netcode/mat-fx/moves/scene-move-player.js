// Design 075: the one player every move spec runs through (design 063's, moved into the three.js
// board). The beats' drawers draw on the board's GPU recorder in stage px (flat table px, y down),
// so the lane maths is design 063's; the real card meshes carry the motion (scene.drive), and the
// rim, heat, trails, echo and bursts are drawn in the scene too. One FX entry per scene, on the
// scene clock (a WAAPI time, so a frozen preview freezes it).
import { fxDisabled } from '../../../image-logic/mat-fx.mjs';
import { LAYER_Z, driveOffset, particleState, stageRectOf } from '../../../board3d/fx/fx-stage.mjs';
import { burstParticles } from '../particles.mjs';
import { resolveBeatColours, tintCache } from './beat-colours.js';
import { drawHeat, drawRim, tintedGlow } from './card-glow.mjs';
import { attackerPose, defenderPose } from './card-motion.mjs';
import { DRAWERS } from './move-drawers.js';
import { laneGeometry, phaseProgress } from './move-geometry.mjs';
import { terrainPose } from './move-poses.mjs';
import { ECHO_PARAMS, fillDefaults, travelBeats, withDefaults } from './move-spec.mjs';
import { materialFor } from './materials/index.js';
import { drawParticle } from './particle-shapes.mjs';

const DEG = Math.PI / 180;
/** The dash's lagged copies: how far each trails the attacker (of the scene) and how strong it shows. */
const TRAILS = Object.freeze([
  { lag: 0.035, alpha: 0.38 },
  { lag: 0.07, alpha: 0.2 },
]);
/** The 2D trails' `blur(2px)`. */
const TRAIL_BLUR_PX = 2;

const isSourceOver = (beat) =>
  beat.drawer === 'vignette' ||
  beat.drawer === 'smoke' ||
  beat.drawer === 'shade' ||
  (beat.drawer === 'terrain' && beat.params.kind === 'crack');

const centreOf = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

const warned = new Set();
const runBeat = (beat, index, ctx, lane, progress, info) => {
  try {
    DRAWERS[beat.drawer]?.draw(ctx, lane, progress, {
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

/** The beats of `layer` that are live at `ms`: the source-over ones (veils, smoke) first, then the light. */
const drawBeats = (ctx, beats, layer, lane, ms, info) => {
  for (const composite of ['source-over', 'lighter']) {
    ctx.globalCompositeOperation = composite;
    beats.forEach((beat, index) => {
      if ((layer && beat.layer !== layer) || isSourceOver(beat) !== (composite === 'source-over')) return;
      const progress = phaseProgress(ms, [beat.at, beat.until]);
      if (progress !== null) runBeat(beat, index, ctx, lane, progress, info);
    });
  }
  ctx.globalCompositeOperation = 'source-over';
};

/**
 * Puts the context's origin at a driven card's centre with its pose: the lane squash about the
 * lane, then its own yaw plus the drive's, then the drive's scale.
 * `offset` is a drive offset (table px, fx-stage.mjs driveOffset).
 */
export function cardTransform(ctx, { centre, yawDeg = 0 }, offset = null) {
  ctx.translate(centre.x + (offset?.dx ?? 0), centre.y - (offset?.dy ?? 0));
  const along = offset?.scaleAlong ?? 1;
  const across = offset?.scaleAcross ?? 1;
  if (along !== 1 || across !== 1) {
    const lane = (offset.laneAngleDeg ?? 0) * DEG;
    ctx.rotate(lane);
    ctx.scale(along, across);
    ctx.rotate(-lane);
  }
  ctx.rotate((yawDeg + (offset?.yawDeg ?? 0)) * DEG);
  const scale = offset?.scale ?? 1;
  if (scale !== 1) ctx.scale(scale, scale);
}

/** A copy of a card's art (`map`, a three Texture) at a pose, e.g. a dash's trail. */
export function drawCardArt(ctx, map, card, offset, { alpha = 1, blurPx = 0 } = {}) {
  if (!map || !(alpha > 0)) return;
  ctx.save();
  cardTransform(ctx, card, offset);
  ctx.globalAlpha *= alpha;
  ctx.filter = blurPx > 0 ? `blur(${blurPx}px)` : 'none';
  ctx.drawImage(map, -card.width / 2, -card.height / 2, card.width, card.height);
  ctx.restore();
}

/** A scene card: its stage rect, centre, size and own yaw, from the scene's table pose. */
const sceneCard = (scene, id) => {
  const pose = id == null ? null : scene.cardTablePose(id);
  if (!pose) return null;
  const rect = stageRectOf(pose);
  return { id, rect, centre: centreOf(rect), width: rect.width, height: rect.height, yawDeg: pose.yawDeg ?? 0 };
};

/**
 * Play `spec` from the attacker's card to the defender's inside the 3D board `scene`
 * (board-scene.js: `cardTablePose`, `cardFrontMap`, `drive`, `fx`, `clock`). Announces the contact
 * moment on `impacts` (combat.js's queue) with `strikeContext`. `branches`
 * (design 069): more cards the attack damages, `{ id, delayMs }` each; the travel beats also fly to
 * them, `delayMs` after the main contact.
 * @returns {{ holdMs: number, durationMs: number, contactMs: number, branchEndMs: number } | null}
 *   null when it cannot play (effects off, a card the scene does not draw, no lane).
 */
export function playMoveInScene({
  scene,
  spec,
  attackerId,
  defenderId,
  seed = 1,
  impacts = null,
  attackerCard = null,
  strikeContext = null,
  branches = [],
}) {
  if (!scene?.fx || !spec || fxDisabled()) return null;
  const attacker = sceneCard(scene, attackerId);
  const defender = sceneCard(scene, defenderId);
  if (!attacker || !defender) return null;
  const lane = laneGeometry(attacker.rect, defender.rect);
  if (!lane) return null;

  const { durationMs, contactMs } = spec;
  const material = materialFor(spec.material);
  const glowColours = spec.tint ? tintedGlow(material.key, spec.tint) : null;
  const cachedTint = tintCache();
  const resolve = (beat) => ({ ...beat, ...resolveBeatColours(material, withDefaults(beat.drawer, beat.params), cachedTint) });
  const beats = spec.beats.map(resolve);
  const quakes = beats.filter((beat) => beat.drawer === 'terrain' && beat.params.kind === 'quake');
  const time0 = seed * 0.37;
  const sceneInfo = (elapsedMs) => ({ elapsedMs, time: time0 + elapsedMs / 1000, seed, material, spec });

  const laneH = lane.length / lane.h;
  const attackerAt = (ms) => {
    const p = attackerPose(spec.attacker.motion, ms, { contactMs, durationMs, params: spec.attacker.params, laneH });
    return { along: p.along, across: p.across, scale: p.scale, rotate: p.tilt, glow: p.glow };
  };
  const defenderAt = (ms) => {
    const p = defenderPose(spec.defender.motion, ms, { contactMs, durationMs, params: spec.defender.params, laneH });
    return { along: p.along, across: p.across, lift: p.lift, scaleAlong: p.scaleAlong, scaleAcross: p.scaleAcross, rotate: p.wobble, heat: p.heat };
  };

  /** The summed quake jitter at `ms`, in stage px: it shakes the whole scene, cards included. */
  const jitterAt = (ms) => {
    let x = 0;
    let y = 0;
    for (const quake of quakes) {
      const progress = phaseProgress(ms, [quake.at, quake.until]);
      if (progress === null) continue;
      const jitter = terrainPose(progress, lane.h, seed, quake.params).jitter;
      x += jitter.x;
      y += jitter.y;
    }
    return { x, y };
  };
  const offsetWith = (pose, ms) => {
    const offset = driveOffset(lane, pose);
    const jitter = jitterAt(ms);
    offset.dx += jitter.x;
    offset.dy -= jitter.y;
    return offset;
  };

  const bursts = (spec.particles ?? []).map((burst, index) => {
    const anchor = burst.anchor === 'attacker' ? attacker : defender;
    const h = anchor.height;
    return {
      burst,
      anchor,
      rows: burstParticles({
        count: burst.count,
        distance: h * burst.distance,
        direction: burst.direction,
        spread: burst.spread,
        size: [h * burst.size[0], h * burst.size[1]],
        aspect: burst.aspect,
        gravity: h * burst.gravity,
        maxDelay: burst.maxDelay,
        seed: seed + index,
      }),
    };
  });
  const burstEndMs = Math.max(0, ...bursts.map(({ burst }) => burst.at + burst.durationMs));

  const travel = Array.isArray(branches) ? travelBeats(spec).map(resolve) : [];
  const lanes =
    travel.length === 0
      ? []
      : branches
          .map((branch, index) => ({ card: sceneCard(scene, branch?.id), branch, index }))
          .filter(({ card }) => card)
          .map(({ card, branch, index }) => ({
            lane: laneGeometry(attacker.rect, card.rect),
            delayMs: Math.max(0, branch.delayMs || 0),
            seed: seed + index + 1,
          }))
          .filter(({ lane: branchLane }) => branchLane);
  const branchEndMs = lanes.length > 0 ? durationMs + Math.max(...lanes.map((entry) => entry.delayMs)) : 0;
  const endMs = Math.max(durationMs, branchEndMs, burstEndMs);

  const trails = spec.attacker.motion === 'dash' ? TRAILS : [];
  const echo = spec.attacker.echo ? fillDefaults(ECHO_PARAMS, spec.attacker.echo) : null;
  const cold = spec.defender.motion === 'freeze';
  const particleColour = material.particle?.color ?? '#fff';

  impacts?.strikeIn?.(contactMs, {
    direction: lane.angleDeg,
    attackerCard,
    move: spec.id,
    family: spec.family,
    ...strikeContext,
  });

  scene.drive(attackerId, (ms) => offsetWith(attackerAt(ms), ms), durationMs);
  scene.drive(defenderId, (ms) => offsetWith(defenderAt(ms), ms), durationMs);

  const start = scene.clock.now();
  const pass = (canvas, layer, z, depthTest) => canvas.begin({ layer, z, depthTest, unit: lane.h, seed });

  scene.fx.add({
    frame(now, canvas) {
      const elapsed = now - start;
      if (elapsed > endMs) return false;
      const ctx = canvas.ctx;
      const info = sceneInfo(elapsed);
      const jitter = jitterAt(elapsed);
      const live = elapsed <= durationMs;
      const a = live ? attackerAt(elapsed) : null;
      const d = live ? defenderAt(elapsed) : null;
      const aOffset = a ? offsetWith(a, elapsed) : null;
      const dOffset = d ? offsetWith(d, elapsed) : null;

      // Back: what the cards hide (depth-tested under their faces), with the rims and trails.
      pass(canvas, 'back', LAYER_Z.back, true);
      ctx.save();
      ctx.translate(jitter.x, jitter.y);
      drawBeats(ctx, beats, 'back', lane, elapsed, info);
      ctx.restore();
      if (live) {
        const map = scene.cardFrontMap(attackerId);
        trails.forEach(({ lag, alpha }) => {
          const window = Math.max(0, Math.sin((Math.PI * (elapsed - 0.3 * contactMs)) / (0.85 * contactMs)));
          const shown = elapsed >= 0.3 * contactMs && elapsed <= 1.15 * contactMs ? alpha * window : 0;
          const lagged = Math.max(0, elapsed - lag * durationMs);
          drawCardArt(ctx, map, attacker, offsetWith(attackerAt(lagged), lagged), { alpha: shown, blurPx: TRAIL_BLUR_PX });
        });
        if (echo) {
          const behind = { ...a, along: a.along - echo.offset };
          drawCardArt(ctx, map, attacker, offsetWith(behind, elapsed), { alpha: echo.alpha * Math.max(0, 1 - elapsed / echo.fadeMs) });
        }
        for (const [card, pose, offset] of [
          [attacker, a, aOffset],
          [defender, d, dOffset],
        ]) {
          ctx.save();
          cardTransform(ctx, card, offset);
          drawRim(ctx, { width: card.width, height: card.height, alpha: pose.glow ?? pose.heat ?? 0, material: material.key, colours: glowColours });
          ctx.restore();
        }
        // Heat on the struck card's face, at its height off the cloth.
        if (d.heat > 0) {
          pass(canvas, 'front', LAYER_Z.front + (dOffset.dz ?? 0), false);
          ctx.save();
          cardTransform(ctx, defender, dOffset);
          drawHeat(ctx, { width: defender.width, height: defender.height, alpha: d.heat, material: material.key, cold, colours: glowColours });
          ctx.restore();
        }
      }

      // Front: the move itself, then its branch lanes.
      pass(canvas, 'front', LAYER_Z.front, false);
      ctx.save();
      ctx.translate(jitter.x, jitter.y);
      drawBeats(ctx, beats, 'front', lane, elapsed, info);
      for (const branch of lanes) {
        const laneMs = elapsed - branch.delayMs;
        const branchInfo = { elapsedMs: laneMs, time: branch.seed * 0.37 + laneMs / 1000, seed: branch.seed, material, spec };
        drawBeats(ctx, travel, null, branch.lane, laneMs, branchInfo);
      }
      ctx.restore();

      // Top: the top beats and the bursts.
      pass(canvas, 'top', LAYER_Z.top, false);
      ctx.save();
      ctx.translate(jitter.x, jitter.y);
      drawBeats(ctx, beats, 'top', lane, elapsed, info);
      ctx.restore();
      for (const { burst, anchor, rows } of bursts) {
        for (const row of rows) {
          drawParticle(ctx, burst.kind, particleState(row, elapsed, { durationMs: burst.durationMs, delayMs: burst.at }), {
            originX: anchor.centre.x,
            originY: anchor.centre.y,
            size: row.size,
            aspect: row.aspect,
            colour: particleColour,
          });
        }
      }
      return true;
    },
  });

  return { holdMs: contactMs + 40, durationMs, contactMs, branchEndMs };
}
