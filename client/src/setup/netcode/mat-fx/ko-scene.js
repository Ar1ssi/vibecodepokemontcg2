// Design 042: plays the knockout scene (ko-scene.mjs) from a ghost captured
// before the DOM diff removed the card: the gold stars, then the card and its attachments knocked back, fanned and flown to the
// discard pile. Every layer runs on WAAPI (D103) and removes itself.
import { removeWhen, spawnOverlay, spawnParticles } from '../../image-logic/mat-fx.mjs';
import { playCardTrack, pileOf, playPileCatch } from './card-flight.js';
import { burstParticles } from './particles.mjs';
import { KO_FAN_MAX, KO_SCENE_MS, koTrack } from './ko-scene.mjs';

const BACKSTOP_PAD_MS = 400;
const STAR_MS = 900;
const STAR_COUNT = 11;

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

/**
 * @param {{rect: object, src: string, user: 'self'|'opp', turn?: number,
 *   attached?: {src: string}[]}} ghost - from captureKnockoutGhost
 * @returns {boolean} false when nothing could play
 */
export function playKnockoutScene(ghost) {
  const rect = ghost?.rect;
  if (!rect || !(rect.width > 1) || !(rect.height > 1) || !ghost.src) return false;
  const turn = ghost.turn || 0;
  const pile = pileOf(ghost.user, 'discard');
  // Away from the attacker: the opponent's card goes up the screen, yours down.
  const dir = ghost.user === 'opp' ? -1 : 1;
  const seed = Math.floor(Math.random() * 1e6);
  const cards = [{ src: ghost.src }, ...(ghost.attached || []).filter((a) => a?.src).slice(0, KO_FAN_MAX)];
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
    playCardTrack({
      rect,
      src: cards[index].src,
      pose: track.pose,
      trail: track.trail,
      duration: KO_SCENE_MS,
      className: 'fx-card-flight--ko',
    });
    if (pile) playPileCatch(pile.rect, track.landsAtMs - 60);
  }
  playStars(rect);
  return true;
}
