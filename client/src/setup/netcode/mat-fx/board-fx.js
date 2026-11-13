// Design 089 § D5: the board effects that fill what the engine reported and nothing showed. Each
// draws in the three.js board's FX layer from the pure poses of board-fx.mjs; the only DOM is a
// short text tag over the card. Every effect no-ops when its card or the scene cannot be found.
//
// The look, after the first renders: a card is never washed out. A card effect is light round the
// card — a halo on the cloth behind it (depth-tested, so the card hides its inside), a thin
// outline on its edge and a glint sweeping its face — plus small sprites at real heights. No
// filled plate over the art, no ray fans (the user's standing corrections: no whiteouts, no
// sunbursts, flares local to the card).
import { getBoardScene } from '../../board3d/board3d.js';
import { LAYER_Z, stageRectOf } from '../../board3d/fx/fx-stage.mjs';
import { getCardRegistry } from '../apply-view.js';
import { animateFrames, rectForInstance, removeWhen, sampleKeyframes, spawnOverlay } from '../../image-logic/mat-fx.mjs';
import { playBanner } from './banner.js';
import {
  BLOCK_MS,
  ENTER_MS,
  FIZZLE_MS,
  HEAL_MS,
  POWER_FLARE_MS,
  PRIZE_PULSE_MS,
  TAG_MS,
  attackFailText,
  blockPose,
  blockSpark,
  blockTagText,
  enterDust,
  enterPose,
  fizzlePose,
  fizzlePuff,
  healMote,
  healPose,
  powerFlarePose,
  powerGlint,
  prizePulsePose,
  tagPose,
} from './board-fx.mjs';
import { brighten, fxRgbForCard } from './fx-colors.mjs';
import { drawRim } from './moves/card-glow.mjs';
import { emit, rgb01 } from './moves/elements/_emit.js';
import { visibleStackId, zoneCardIds } from './origins.mjs';

const BACKSTOP_PAD_MS = 400;
/** Light over a card rides this far above its face (stage px), clear of counters and tokens. */
const FACE_CLEARANCE_PX = 7;

const TEXTURES = Object.freeze({
  cells: 'TEX_VFX_Tile_Cell_Soft.webp',
  thinRing: 'TEX_VFX_Ring_InnerGlow.webp',
  softRing: 'TEX_VFX_Energy_Ring_Soft.webp',
  stars: 'TEX_VFX_Star_Variants_SubUV_2x2.webp',
  sparkle: 'TEX_VFX_Sparkle_2x2.webp',
  cloud: 'TEX_VFX_Cloud_Round.webp',
});

const SHIELD_RGB = Object.freeze([96, 190, 255]);
const RETREAT_LOCK_RGB = Object.freeze([255, 176, 72]);
const HEAL_RGB = Object.freeze([84, 232, 132]);
const FIZZLE_RGB = Object.freeze([150, 144, 172]);
const DUST_RGB = Object.freeze([196, 186, 170]);
const PRIZE_RGB = Object.freeze([255, 200, 84]);
const POWER_RGB = Object.freeze({ gx: [92, 176, 255], vstar: [255, 196, 72] });

const rgba = ([r, g, b], a) => `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;

/** A card as the scene draws it: its stage rect, centre, size and height off the cloth. Null when not drawn. */
function stageCard(scene, instanceId) {
  const pose = instanceId == null ? null : scene.cardTablePose(instanceId);
  if (!pose) return null;
  const rect = stageRectOf(pose);
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    w: rect.width,
    h: rect.height,
    z: (pose.z ?? 0) + FACE_CLEARANCE_PX,
  };
}

/** The card drawn on top of `instanceId`'s stack (an evolved Pokémon's id is its Basic's). */
const shownId = (instanceId) => visibleStackId(getCardRegistry(), instanceId);

/**
 * Runs `draw({ back, top }, t, elapsedMs)` every frame for `ms` of scene time. `back(fn)` draws on
 * the cloth, depth-tested, so cards hide what lies under them; `top(z, fn)` draws `z` px above the
 * cloth over everything. Each hands `fn` the recorder's context (Canvas2D calls and sprite emits).
 * False when no scene draws the board.
 */
function playStageFx(scene, { ms, unit, seed = 0, draw }) {
  if (!scene?.fx || !(ms > 0)) return false;
  const start = scene.clock.now();
  scene.fx.add({
    frame(now, canvas) {
      const elapsed = now - start;
      if (elapsed > ms) return false;
      const passes = {
        back(fn) {
          canvas.begin({ layer: 'back', z: LAYER_Z.back, depthTest: true, unit, seed });
          fn(canvas.ctx);
        },
        top(z, fn) {
          canvas.begin({ layer: 'top', z: Math.max(LAYER_Z.top, z), depthTest: false, unit, seed });
          fn(canvas.ctx);
        },
      };
      draw(passes, elapsed / ms, elapsed);
      return true;
    },
  });
  return true;
}

const sprite = (ctx, texture, at, size, rgb, gain, alpha, extra = {}) =>
  emit(ctx, 'sprite', { texture, at, size, colour: rgb01(rgb, gain), alpha, ...extra });

const cardPath = (ctx, w, h) => {
  const r = Math.min(w, h) * 0.045;
  const x = -w / 2;
  const y = -h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - r);
  ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  ctx.closePath();
};

/** The halo round a card on the cloth behind it: only what the card does not cover shows. */
function cardHalo(ctx, card, rgb, alpha, scale = 1) {
  if (!(alpha > 0)) return;
  ctx.save();
  ctx.translate(card.x, card.y);
  ctx.scale(scale, scale);
  drawRim(ctx, { width: card.w, height: card.h, alpha, colours: { body: rgb, hot: brighten(rgb, 0.45) } });
  ctx.restore();
}

/** A thin line of light on the card's edge. */
function cardEdge(ctx, card, rgb, alpha, scale = 1) {
  if (!(alpha > 0)) return;
  ctx.save();
  ctx.translate(card.x, card.y);
  ctx.scale(scale, scale);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = Math.max(1.2, card.w * 0.022);
  ctx.strokeStyle = rgba(brighten(rgb, 0.55), alpha);
  cardPath(ctx, card.w, card.h);
  ctx.stroke();
  ctx.restore();
}

/**
 * A glint crossing the card's face: a soft diagonal band at `sweep` (0 = before the top-left
 * corner, 1 = past the bottom-right), clipped to the card so the art stays readable beside it.
 */
function cardSheen(ctx, card, rgb, alpha, sweep) {
  if (!(alpha > 0)) return;
  const reach = card.w + card.h;
  const at = -reach / 2 + reach * sweep;
  const half = card.w * 0.22;
  ctx.save();
  ctx.translate(card.x, card.y);
  cardPath(ctx, card.w, card.h);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  ctx.rotate(-Math.PI / 5);
  const band = ctx.createLinearGradient(at - half, 0, at + half, 0);
  band.addColorStop(0, rgba(rgb, 0));
  band.addColorStop(0.5, rgba(brighten(rgb, 0.6), alpha));
  band.addColorStop(1, rgba(rgb, 0));
  ctx.fillStyle = band;
  ctx.fillRect(at - half, -reach, half * 2, reach * 2);
  ctx.restore();
}

/** A ring of light lying on the cloth, `radius` wide to its bright line. */
function groundRing(ctx, x, y, radius, width, rgb, alpha) {
  if (!(alpha > 0) || !(radius > 0)) return;
  const inner = Math.max(0, radius - width);
  const outer = radius + width;
  const ring = ctx.createRadialGradient(x, y, inner, x, y, outer);
  ring.addColorStop(0, rgba(rgb, 0));
  ring.addColorStop(0.5, rgba(brighten(rgb, 0.25), alpha));
  ring.addColorStop(1, rgba(rgb, 0));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(x, y, outer, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A short word over a card ("No damage"): an HTML tag, crisp at any zoom, that pops and rises away. */
function popTag(rect, text, variant) {
  if (!rect || !text) return;
  const host = spawnOverlay({ rect, className: `fx-overlay fx-tag-pop fx-tag-pop--${variant}` });
  const label = document.createElement('span');
  label.className = 'fx-tag-pop__label';
  label.style.fontSize = `${Math.max(11, rect.width * 0.17)}px`;
  label.textContent = text;
  host.appendChild(label);
  const frames = sampleKeyframes(
    tagPose,
    (p) => ({ transform: `translate3d(0, ${(p.y * rect.height).toFixed(2)}px, 0) scale(${p.scale.toFixed(3)})`, opacity: p.opacity }),
    24
  );
  removeWhen(host, [animateFrames(label, frames, { duration: TAG_MS })], TAG_MS + BACKSTOP_PAD_MS);
}

/** The shield over card `instanceId` in `rgb`, with `tag` over it. */
function playShield(instanceId, rgb, tag, variant) {
  const scene = getBoardScene();
  const id = shownId(instanceId);
  const card = scene ? stageCard(scene, id) : null;
  if (!card) return 0;
  const seed = Number(instanceId) || 1;
  const sparkCount = 7;
  const played = playStageFx(scene, {
    ms: BLOCK_MS,
    unit: card.h,
    seed,
    draw({ back, top }, t) {
      const pose = blockPose(t);
      back((ctx) => cardHalo(ctx, card, rgb, pose.plate.alpha, pose.plate.scale));
      top(card.z, (ctx) => {
        const at = { x: card.x, y: card.y, z: card.z };
        cardEdge(ctx, card, rgb, pose.plate.alpha, pose.plate.scale);
        cardSheen(ctx, card, rgb, pose.sheen.alpha, pose.sheen.sweep);
        sprite(ctx, TEXTURES.cells, { ...at, z: at.z + 1 }, card.w * pose.cells.scale, rgb, 1, pose.cells.alpha, { aspect: card.h / card.w });
        sprite(ctx, TEXTURES.thinRing, { ...at, z: at.z + 2 }, card.h * 1.1 * pose.ring.scale, brighten(rgb, 0.3), 1.6, pose.ring.alpha);
        for (let index = 0; index < sparkCount; index += 1) {
          const spark = blockSpark(t, index, sparkCount, seed);
          sprite(ctx, TEXTURES.stars, { x: card.x + spark.x * card.h, y: card.y + spark.y * card.h, z: at.z + 4 }, spark.size * card.h, brighten(rgb, 0.6), 1.8, spark.alpha, { frame: spark.frame });
        }
      });
    },
  });
  if (!played) return 0;
  popTag(rectForInstance(id, getCardRegistry()), tag, variant);
  return undefined;
}

/** `block`: an attack's damage was prevented, or a Knock Out survived. */
export const block = (plan) => playShield(plan.instanceId, SHIELD_RGB, blockTagText({ survived: Boolean(plan.survived) }), 'block');

/** `retreat-blocked`: the Active Pokémon cannot retreat. */
export const retreatBlocked = (plan) => playShield(plan.instanceId, RETREAT_LOCK_RGB, blockTagText({ retreat: true }), 'lock');

/** `attack-fail`: an attack that was declared and does not happen. */
export const attackFail = (plan) => {
  playBanner(attackFailText(plan.attackName, plan.cause), plan.user, 'attack-fail');
  const scene = getBoardScene();
  const id = plan.attackerId == null ? null : shownId(plan.attackerId);
  const card = scene && id != null ? stageCard(scene, id) : null;
  if (!card) return;
  const seed = Number(plan.attackerId) || 1;
  const puffs = 6;
  scene.drive(
    id,
    (ms) => {
      const { droop } = fizzlePose(ms / FIZZLE_MS);
      return { dx: 0, dy: 0, dz: 0, yawDeg: droop.yawDeg, scale: droop.scale, scaleAlong: 1, scaleAcross: 1, laneAngleDeg: 0 };
    },
    FIZZLE_MS
  );
  playStageFx(scene, {
    ms: FIZZLE_MS,
    unit: card.h,
    seed,
    draw({ top }, t) {
      top(card.z, (ctx) => {
        for (let index = 0; index < puffs; index += 1) {
          const puff = fizzlePuff(t, index, puffs, seed);
          sprite(ctx, TEXTURES.cloud, { x: card.x + puff.x * card.h, y: card.y + puff.y * card.h, z: card.z + 2 + index }, puff.size * card.h, FIZZLE_RGB, 0.55, puff.alpha, { rotation: puff.rotation });
        }
      });
    },
  });
};

/** A heal on card `instanceId` (called by the `damage` effect for a heal). False when it could not play. */
export function playHeal(instanceId) {
  const scene = getBoardScene();
  const card = scene ? stageCard(scene, shownId(instanceId)) : null;
  if (!card) return false;
  const seed = Number(instanceId) || 1;
  const motes = 12;
  return playStageFx(scene, {
    ms: HEAL_MS,
    unit: card.h,
    seed,
    draw({ back, top }, t) {
      const pose = healPose(t);
      back((ctx) => cardHalo(ctx, card, HEAL_RGB, pose.glow.alpha, pose.glow.scale));
      top(card.z, (ctx) => {
        cardEdge(ctx, card, HEAL_RGB, pose.glow.alpha * 0.8);
        sprite(ctx, TEXTURES.softRing, { x: card.x, y: card.y, z: card.z + 1 }, card.h * 1.3 * pose.ring.scale, HEAL_RGB, 1.3, pose.ring.alpha);
        for (let index = 0; index < motes; index += 1) {
          const mote = healMote(t, index, motes, seed);
          sprite(ctx, TEXTURES.sparkle, { x: card.x + mote.x * card.w, y: card.y + mote.y * card.h, z: card.z + mote.rise * card.h }, mote.size * card.h, brighten(HEAL_RGB, 0.2), 1.4, mote.alpha, { frame: mote.frame });
        }
      });
    },
  });
}

/**
 * The landing of a Pokémon put into play: its card settles onto the slot while a ring in its type
 * colour rolls out from under it on the cloth and dust lifts round it. False when it could not play.
 */
export function playLanding(instanceId, cardData) {
  const scene = getBoardScene();
  const id = shownId(instanceId);
  const card = scene ? stageCard(scene, id) : null;
  if (!card) return false;
  const seed = Number(instanceId) || 1;
  const rgb = cardData ? fxRgbForCard(cardData) : DUST_RGB;
  const dust = 7;
  scene.drive(
    id,
    (ms) => {
      const { drop } = enterPose(ms / ENTER_MS);
      return { dx: 0, dy: 0, dz: drop.lift * card.h, yawDeg: 0, scale: drop.scale, scaleAlong: 1, scaleAcross: 1, laneAngleDeg: 0 };
    },
    ENTER_MS
  );
  return playStageFx(scene, {
    ms: ENTER_MS,
    unit: card.h,
    seed,
    draw({ back, top }, t) {
      const pose = enterPose(t);
      back((ctx) => groundRing(ctx, card.x, card.y, card.h * 0.62 * pose.ring.scale, card.h * 0.16, rgb, pose.ring.alpha));
      top(LAYER_Z.top, (ctx) => {
        for (let index = 0; index < dust; index += 1) {
          const puff = enterDust(t, index, dust, seed);
          sprite(ctx, TEXTURES.cloud, { x: card.x + puff.x * card.h, y: card.y + puff.y * card.h, z: 2 }, puff.size * card.h, DUST_RGB, 0.5, puff.alpha, { rotation: index * 51 });
        }
      });
    },
  });
}

/** The stage cards of a side's Prize slots that hold a card, as the scene lays them out. */
function prizeSlots(scene, user) {
  const registry = getCardRegistry();
  return zoneCardIds(registry, user, 'prizes')
    .map((id) => stageCard(scene, id))
    .filter(Boolean);
}

/** `prize-pulse`: something touched the Prize cards (turned up, swapped, reset): each slot lights in turn. */
export const prizePulse = (plan) => {
  const scene = getBoardScene();
  const slots = scene && plan.user ? prizeSlots(scene, plan.user) : [];
  if (slots.length === 0) return 0;
  const played = playStageFx(scene, {
    ms: PRIZE_PULSE_MS,
    unit: slots[0].h,
    draw({ back, top }, t) {
      const poses = slots.map((_, index) => prizePulsePose(t, index, slots.length));
      back((ctx) => slots.forEach((slot, index) => cardHalo(ctx, slot, PRIZE_RGB, poses[index].alpha * 0.8)));
      top(slots[0].z, (ctx) =>
        slots.forEach((slot, index) => {
          cardEdge(ctx, slot, PRIZE_RGB, poses[index].alpha);
          cardSheen(ctx, slot, PRIZE_RGB, poses[index].alpha * 0.5, poses[index].sweep);
        })
      );
    },
  });
  return played ? undefined : 0;
};

/**
 * The flare of a GX attack or a VSTAR Power on the attacker (`power`: 'gx' | 'vstar'): its edge
 * lights in the power's metal, a glint crosses it twice and star glints rise off its corners.
 */
export function playPowerFlare(instanceId, power) {
  const rgb = POWER_RGB[power];
  const scene = getBoardScene();
  const card = scene && rgb ? stageCard(scene, shownId(instanceId)) : null;
  if (!card) return false;
  const seed = Number(instanceId) || 1;
  const glints = 8;
  return playStageFx(scene, {
    ms: POWER_FLARE_MS,
    unit: card.h,
    seed,
    draw({ back, top }, t) {
      const pose = powerFlarePose(t);
      back((ctx) => cardHalo(ctx, card, rgb, pose.halo.alpha, pose.halo.scale));
      top(card.z, (ctx) => {
        cardEdge(ctx, card, rgb, pose.edge.alpha);
        cardSheen(ctx, card, rgb, pose.sheen.alpha, pose.sheen.sweep);
        for (let index = 0; index < glints; index += 1) {
          const glint = powerGlint(t, index, glints, seed);
          sprite(ctx, TEXTURES.stars, { x: card.x + glint.x * card.w, y: card.y + glint.y * card.h, z: card.z + glint.rise * card.h }, glint.size * card.h, brighten(rgb, 0.55), 1.8, glint.alpha, { frame: glint.frame, rotation: glint.rotation });
        }
      });
    },
  });
}
