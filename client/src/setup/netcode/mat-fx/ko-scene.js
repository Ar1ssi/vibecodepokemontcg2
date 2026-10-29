// Design 042: plays the knockout scene (ko-scene.mjs) from a ghost captured
// before the DOM diff removed the card: the gold stars, then the card and its attachments knocked back, fanned and flown to the
// discard pile. Every layer runs on WAAPI (D103) and removes itself. Design 074 H1: a card the 3D
// board still draws flies on its own mesh; one it no longer does (the view already buried it in
// the discard pile) keeps the cloned image. Design 078: the knocked-out card's mesh burns away
// (card-mesh.js cardFx) and re-forms in the pile; with motion reduced it burns where it stood.
import { getBoardScene } from '../../board3d/board3d.js';
import { flightPoseFromTrack } from '../../board3d/flight-pose.mjs';
import { removeWhen, spawnOverlay, spawnParticles } from '../../image-logic/mat-fx.mjs';
import {
  FLIGHT_LIFT_FRAC,
  meshCanFly,
  pileOf,
  playCardTrack,
  playMeshTrack,
  playPileCatch,
  playTrailTrack,
} from './card-flight.js';
import { burstParticles } from './particles.mjs';
import { takeSlidePin } from './lifecycle.js';
import {
  KO_FAN_MAX,
  KO_REDUCED_BURN_MS,
  KO_REDUCED_HOLD_MS,
  KO_SCENE_MS,
  koDissolveAt,
  koReducedDissolveAt,
  koTrack,
} from './ko-scene.mjs';

const BACKSTOP_PAD_MS = 400;
const STAR_MS = 900;
const STAR_COUNT = 11;
// Each card of the stack rides this much higher than the one under it, so they never cut through each other.
const STACK_LIFT_STEP = 0.12;

function playStars(rect) {
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-ko-stars' });
  const stars = burstParticles({
    count: STAR_COUNT,
    distance: rect.width * 1.15,
    size: [rect.width * 0.24, rect.width * 0.4],
    gravity: rect.width * 0.15,
    maxDelay: 0.08,
    seed: Math.floor(Math.random() * 1e6),
  });
  removeWhen(host, spawnParticles(host, stars, { className: 'fx-particle--star', duration: STAR_MS }), STAR_MS + BACKSTOP_PAD_MS);
}

/** Burns the knocked-out card's mesh by `dissolveAt(elapsedMs)` over `ms` (design 078). */
function burnCard(instanceId, dissolveAt, ms) {
  getBoardScene()?.cardFx?.(instanceId, { at: (elapsed) => ({ dissolve: dissolveAt(elapsed) }), ms, cut: true });
}

/**
 * Reduced motion (design 078): no knock, no flight, no stars; the card's mesh holds still where
 * it stood and burns away, then the board shows it in the pile. False when the board has no mesh.
 */
function playReducedBurn(ghost) {
  const scene = getBoardScene();
  if (!scene?.cardFx || !meshCanFly(ghost.instanceId)) return false;
  takeSlidePin(ghost.instanceId);
  const still = flightPoseFromTrack(ghost.rect, { rotate: ghost.turn || 0 }, 0, 0);
  scene.tween(ghost.instanceId, () => still, KO_REDUCED_HOLD_MS, { still: true });
  burnCard(ghost.instanceId, koReducedDissolveAt, KO_REDUCED_BURN_MS);
  return true;
}

/**
 * @param {{rect: object, src: string, user: 'self'|'opp', turn?: number, instanceId?: number,
 *   attached?: {src: string, instanceId?: number}[]}} ghost - from captureKnockoutGhost, plus the
 *   instance ids of the cards whose meshes can fly
 * @param {{reduced?: boolean}} [options] - motion reduced: only the still burn plays
 * @returns {boolean} false when nothing could play
 */
export function playKnockoutScene(ghost, { reduced = false } = {}) {
  const rect = ghost?.rect;
  if (!rect || !(rect.width > 1) || !(rect.height > 1) || !ghost.src) return false;
  if (reduced) return playReducedBurn(ghost);
  const turn = ghost.turn || 0;
  const pile = pileOf(ghost.user, 'discard');
  // Away from the attacker: the opponent's card goes up the screen, yours down.
  const dir = ghost.user === 'opp' ? -1 : 1;
  const seed = Math.floor(Math.random() * 1e6);
  const cards = [
    { src: ghost.src, instanceId: ghost.instanceId },
    ...(ghost.attached || []).filter((a) => a?.src).slice(0, KO_FAN_MAX),
  ];
  // Attachments first so the knocked-out card is drawn over them.
  for (let index = cards.length - 1; index >= 0; index -= 1) {
    const track = koTrack({
      index,
      dir,
      turn,
      pileTurn: pile ? pile.turn : turn,
      cardRect: rect,
      pileRect: pile?.rect || null,
      seed,
    });
    if (meshCanFly(cards[index].instanceId)) {
      takeSlidePin(cards[index].instanceId);
      playMeshTrack({
        instanceId: cards[index].instanceId,
        rect,
        pose: track.pose,
        duration: KO_SCENE_MS,
        lift: FLIGHT_LIFT_FRAC * rect.height * (1 + STACK_LIFT_STEP * (cards.length - 1 - index)),
      });
      if (index === 0) burnCard(cards[0].instanceId, koDissolveAt, KO_SCENE_MS);
      playTrailTrack({ rect, trail: track.trail, duration: KO_SCENE_MS, className: 'fx-card-flight--ko' });
    } else {
      playCardTrack({
        rect,
        src: cards[index].src,
        pose: track.pose,
        trail: track.trail,
        duration: KO_SCENE_MS,
        className: 'fx-card-flight--ko',
      });
    }
    if (pile) playPileCatch(pile.rect, track.landsAtMs - 60);
  }
  playStars(rect);
  return true;
}
