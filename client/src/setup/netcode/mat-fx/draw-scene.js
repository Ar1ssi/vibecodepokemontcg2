// Design 044: plays a draw. Face-up cards (yours) run the TCG Live scene
// (draw-scene.mjs): out of the deck, flipped face up into a spread over the
// mat, then down into the hand. Face-down cards (the opponent's) fly from
// their deck to their hand on design 042's arc, sleeve up. Every card handed
// in is already hidden in the hand and is shown the moment its overlay lands.
// Draws animate even with effects off, like the flight they replace.
// Design 045: a card with `from` (a taken prize) starts there instead of at
// the deck, and `from.release` removes the sleeve that stood there as it goes.
import { selfContainerDocument, oppContainerDocument } from '../../../state.js';
import { visualRectOf } from '../../image-logic/iframe-rect.mjs';
import { animateFrames, removeWhen, sampleKeyframes, spawnOverlay } from '../../image-logic/mat-fx.mjs';
import { toHighResCardImageUrl } from '../../image-logic/card-image-url.mjs';
import { cardBackSrcForUser, imageAnchor } from '../../deck-constructor/hydrate-holo.js';
import { viewportRect } from './banner.js';
import { playCardTrack } from './card-flight.js';
import { FLIGHT_MS, FLIGHT_STAGGER_MS, flightPose, planFlight, rectFlightEnds } from './card-flight.mjs';
import { drawCardTrack, drawSceneTimes, drawSpreadRects } from './draw-scene.mjs';
import { frameTurnOf } from './evolve-scene.js';
import { matCenter } from './opp-play.mjs';
import { docForSide } from './side-doc.mjs';

const DEFAULT_SLEEVE = 'https://ptcgsim.online/src/assets/cardback.png';
const BACKSTOP_PAD_MS = 400;
const SAMPLES = 60;

const usable = (r) => Boolean(r) && r.width >= 2 && r.height >= 2;

const boardFrameRects = () =>
  ['oppContainer', 'selfContainer'].map((id) => document.getElementById(id)?.getBoundingClientRect() || null);

/** The side's deck cover: its page rect and board turn, or null. */
function deckOf(user) {
  const doc = docForSide(user, selfContainerDocument, oppContainerDocument);
  const cover = doc?.getElementById('deckCover');
  const el = cover?.querySelector('img') || cover;
  if (!el) return null;
  const rect = visualRectOf(el);
  return usable(rect) ? { rect, turn: frameTurnOf(el) } : null;
}

// The node that stands for the card in the hand: its holo wrapper, else the <img>.
const handNodeOf = (card) => card.wrapper ?? imageAnchor(card.image);

function handSpotOf(card) {
  const node = handNodeOf(card);
  if (!node?.isConnected) return null;
  const rect = visualRectOf(node);
  return usable(rect) ? { rect, turn: frameTurnOf(card.image) } : null;
}

const sleeveOf = (user) => cardBackSrcForUser(user) || DEFAULT_SLEEVE;

const cardFace = (className, src) => {
  const img = document.createElement('img');
  img.className = className;
  img.src = src;
  img.alt = '';
  img.draggable = false;
  return img;
};

// The sleeve standing where a card starts goes the moment its overlay starts.
const releaseAt = (card, delay) => {
  if (!card.from?.release) return;
  if (delay > 0) setTimeout(card.from.release, delay);
  else card.from.release();
};

const startOf = (card, deck) => (usable(card.from?.rect) ? card.from : deck);

/**
 * @param {'self'|'opp'} user
 * @param {{image: HTMLImageElement, wrapper?: Element, from?: {rect, turn?, release?}}[]} cards -
 *   hidden in the hand
 * @param {(card: object) => void} show - reveals one real card
 * @returns {number} the scene length in ms (0 when nothing played)
 */
export function playDrawScene(user, cards, show) {
  const viewport = viewportRect();
  if (cards.length === 0 || viewport.width < 2 || viewport.height < 2) {
    cards.forEach(show);
    return 0;
  }
  const slots = drawSpreadRects(cards.length, matCenter(boardFrameRects(), viewport), viewport);
  const deck = deckOf(user);
  const sleeve = sleeveOf(user);
  let played = 0;
  cards.forEach((card, index) => {
    const spot = handSpotOf(card);
    const start = startOf(card, deck);
    const track = drawCardTrack({
      index,
      count: cards.length,
      deck: start?.rect || null,
      slot: slots[index] || null,
      hand: spot?.rect || null,
      deckTurn: start?.turn || 0,
      handTurn: spot?.turn || 0,
      fadeIn: !card.from?.release,
    });
    const src = card.image.currentSrc || card.image.src;
    if (!track || !src) {
      show(card);
      return;
    }
    played += 1;
    const box = slots[index] || spot.rect;
    const host = spawnOverlay({ rect: box, className: 'fx-overlay fx-draw fx-draw-scene' });
    const flip = document.createElement('div');
    flip.className = 'fx-draw-scene__card';
    flip.append(
      cardFace('fx-draw-scene__back', sleeve),
      cardFace('fx-draw-scene__front', toHighResCardImageUrl(src))
    );
    host.appendChild(flip);
    const H = box.height;
    const timing = { duration: track.duration, delay: track.delay };
    const done = [
      animateFrames(
        flip,
        sampleKeyframes(
          track.pose,
          (p) => ({
            transform:
              `translate(${p.x}px, ${p.y}px) perspective(${H * 4}px) rotate(${p.rotate}deg) ` +
              `rotateX(${p.tiltX}deg) rotateY(${p.flip}deg) scale(${p.scale})`,
          }),
          SAMPLES
        ),
        timing
      ),
      // Opacity on the 3D card would flatten it and hide the sleeve (design 043).
      animateFrames(host, sampleKeyframes(track.pose, (p) => ({ opacity: p.opacity }), SAMPLES), timing),
    ];
    const backstop = track.delay + track.duration + BACKSTOP_PAD_MS;
    removeWhen(host, done, backstop);
    releaseAt(card, track.delay);
    revealWhen(card, show, done, backstop);
  });
  return played > 0 ? drawSceneTimes(cards.length).total : 0;
}

/**
 * The opponent's draw: each sleeve arcs from their deck (or its `from`) into its hand card,
 * turned like their board, FLIGHT_STAGGER_MS apart.
 * @returns {number} the last landing in ms (0 when nothing flew)
 */
export function playOppDrawFlights(user, cards, show) {
  const deck = deckOf(user);
  const sleeve = sleeveOf(user);
  let last = 0;
  let flown = 0;
  cards.forEach((card) => {
    const spot = handSpotOf(card);
    const start = startOf(card, deck);
    if (!start || !spot) {
      show(card);
      return;
    }
    const delay = flown * FLIGHT_STAGGER_MS;
    flown += 1;
    const flight = planFlight({
      ...rectFlightEnds(start.rect, spot.rect, { fromTurn: start.turn || 0, toTurn: spot.turn }),
      seed: Math.floor(Math.random() * 1e6),
    });
    releaseAt(card, delay);
    const landed = playCardTrack({
      rect: start.rect,
      src: sleeve,
      pose: (u) => ({ ...flightPose(u, flight), opacity: 1 }),
      duration: FLIGHT_MS,
      delay,
      className: 'fx-draw',
    });
    revealWhen(card, show, [landed], delay + FLIGHT_MS + BACKSTOP_PAD_MS);
    last = delay + FLIGHT_MS;
  });
  return last;
}

function revealWhen(card, show, promises, backstopMs) {
  let shown = false;
  const reveal = () => {
    if (shown) return;
    shown = true;
    show(card);
  };
  const timer = setTimeout(reveal, backstopMs);
  Promise.all(promises).then(() => {
    clearTimeout(timer);
    reveal();
  });
}
