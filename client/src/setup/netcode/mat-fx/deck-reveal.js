// Design 059: plays a deck reveal — the Trainer preview (design 043) from the
// revealing player's deck, through the reveal spot in the middle of the mat,
// into their hand. One flip card per revealed card, laid out like a draw spread
// and timed by deck-reveal.mjs; a card going into the opponent's hand turns back
// to their sleeve as it lands. Every real hand card handed in is already hidden
// and is shown the moment its overlay lands. WAAPI (D103); overlays remove themselves.
import { animateFrames, playFrames, removeWhen, sampleKeyframes } from '../../image-logic/mat-fx.mjs';
import { toHighResCardImageUrl } from '../../image-logic/card-image-url.mjs';
import { resolveCardBackSrc } from '../apply-view.js';
import { viewportRect } from './banner.js';
import { pileOf } from './card-flight.js';
import {
  MAX_REVEAL_SPREAD,
  deckRevealHold,
  deckRevealTimes,
  landingMoved,
  retargetAtMs,
  revealHoldFor,
  revealShineFrames,
} from './deck-reveal.mjs';
import { handSpotOf, revealWhen } from './draw-scene.js';
import { drawSpreadRects } from './draw-scene.mjs';
import { matCenter, oppPlayTrack } from './opp-play.mjs';
import { boardFrameRects, spawnFlipCard } from './opp-play.js';

const BACKSTOP_PAD_MS = 400;
const SAMPLES = 72;
// The view that put the card in the hand was applied this tick: a fresh <img> has
// no width until it loads, so the scene waits (briefly, and never longer) for the
// deck cover and the hand cards to be laid out before it measures them.
const LAYOUT_POLL_MS = 16;
const LAYOUT_WAIT_MS = 320;

const cardTransform = (H) => (p) => ({
  transform:
    `translate(${p.x}px, ${p.y}px) perspective(${H * 4}px) rotate(${p.rotate}deg) ` +
    `rotateX(${p.tiltX}deg) rotateY(${p.flip}deg) scale(${p.scale})`,
});
const hostOpacity = (p) => ({ opacity: p.opacity });

// The hand card's spot, found from the <img> each time: a holo wrapper can wrap it mid-scene.
const landingOf = (card) => handSpotOf({ image: card.image });

function whenLaidOut(isLaidOut, start) {
  const began = performance.now();
  const attempt = () => {
    if (isLaidOut() || performance.now() - began >= LAYOUT_WAIT_MS) start();
    else setTimeout(attempt, LAYOUT_POLL_MS);
  };
  setTimeout(attempt, LAYOUT_POLL_MS);
}

function playSpread(user, cards, show, holdMs) {
  const viewport = viewportRect();
  const slots = drawSpreadRects(cards.length, matCenter(boardFrameRects(), viewport), viewport);
  const deck = pileOf(user, 'deck');
  const times = deckRevealTimes(cards.length, holdMs);
  // The sleeve apply-view draws for this side's face-down cards, so the landing matches the hand.
  const sleeve = resolveCardBackSrc(user === 'self' ? 'you' : 'them');
  cards.forEach((card, index) => {
    const slot = slots[index];
    if (!slot) {
      show(card);
      return;
    }
    const trackTo = (spot) =>
      oppPlayTrack({
        from: deck?.rect || null,
        preview: slot,
        to: spot?.rect || null,
        fromTurn: deck?.turn || 0,
        toTurn: spot?.turn || 0,
        toFade: !spot,
        holdMs: times.holdOf(index),
        toFaceDown: Boolean(card.redacted),
      });
    const hand = landingOf(card);
    const pose = trackTo(hand);
    const { host, card: flip, band } = spawnFlipCard({
      rect: slot,
      backSrc: sleeve,
      frontSrc: toHighResCardImageUrl(card.faceSrc),
      className: 'fx-deck-reveal',
    });
    const duration = times.duration(index);
    const timing = { duration, delay: times.start(index) };
    const cardPlay = playFrames(flip, sampleKeyframes(pose, cardTransform(slot.height), SAMPLES), timing);
    // Opacity on the 3D card would flatten it and hide the sleeve (design 043).
    const hostPlay = playFrames(host, sampleKeyframes(pose, hostOpacity, SAMPLES), timing);
    const done = [cardPlay.finished, hostPlay.finished, animateFrames(band, revealShineFrames(duration), timing)];
    // Re-aim just before the card is placed: the in and hold frames do not depend on the
    // landing, so swapping the keyframes on the same clock changes only the way down.
    setTimeout(() => {
      const now = landingOf(card);
      if (!landingMoved(hand, now)) return;
      const next = trackTo(now);
      cardPlay.setFrames(sampleKeyframes(next, cardTransform(slot.height), SAMPLES));
      hostPlay.setFrames(sampleKeyframes(next, hostOpacity, SAMPLES));
    }, retargetAtMs(times, index));
    const backstop = timing.delay + duration + BACKSTOP_PAD_MS;
    removeWhen(host, done, backstop);
    revealWhen(card, show, done, backstop);
  });
}

/**
 * @param {'self'|'opp'} user the side that revealed
 * @param {{image: HTMLImageElement, wrapper?: Element, redacted?: boolean,
 *   faceSrc?: string|null}[]} cards - hidden in the hand; `redacted` when the hand
 *   shows the card as a sleeve, `faceSrc` the revealed card's art
 * @param {(card: object) => void} show reveals one real hand card
 * @param {{onStart?: () => void}} [hooks] `onStart` runs as the cards leave the deck (the sound)
 * @returns {number} how long the FX queue waits (0 when nothing plays)
 */
export function playDeckReveal(user, cards, show, { onStart } = {}) {
  const list = Array.isArray(cards) ? cards : [];
  // Past the spread's slots, or with no art to show, a card is shown in the hand at once.
  const spread = list.slice(0, MAX_REVEAL_SPREAD).filter((card) => card?.faceSrc);
  list.filter((card) => !spread.includes(card)).forEach(show);
  const viewport = viewportRect();
  if (spread.length === 0 || viewport.width < 2 || viewport.height < 2) {
    spread.forEach(show);
    return 0;
  }
  const holdMs = revealHoldFor(user);
  const hold = deckRevealHold(spread.length, holdMs);
  const start = () => {
    onStart?.();
    playSpread(user, spread, show, holdMs);
  };
  const laidOut = () =>
    Boolean(pileOf(user, 'deck')) && spread.every((card) => !card.image?.isConnected || landingOf(card));
  if (laidOut()) {
    start();
    return hold;
  }
  whenLaidOut(laidOut, start);
  // The scene starts up to LAYOUT_WAIT_MS late, so what follows waits that much longer.
  return hold + LAYOUT_WAIT_MS;
}
