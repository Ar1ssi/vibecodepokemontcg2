import {
  oppContainerDocument,
  selfContainerDocument,
  systemState,
} from '../../state.js';
import { shouldAnimateDrawFlight } from './draw-flight-predicate.mjs';
export { shouldAnimateDrawFlight };
import {
  cardBackSrcForUser,
  cardNode,
  isCardHidden,
} from '../deck-constructor/hydrate-holo.js';
import { toHighResCardImageUrl } from './card-image-url.mjs';
import { playDrawFlight, viewportRectOf } from './card-pop.mjs';
import { playDrawScene, playOppDrawFlights } from '../netcode/mat-fx/draw-scene.js';

const pendingHandOrigins = new WeakMap();

export const setHandFlightOrigin = (card, rect) => {
  if (card && rect) pendingHandOrigins.set(card, rect);
};

const DEFAULT_SLEEVE = 'https://ptcgsim.online/src/assets/cardback.png';
const STAGGER_MS = 180;

let nextStartAt = 0;

export const hideForFlight = (card) => {
  card?.image?.classList.add('draw-flight-source');
  card?.wrapper?.classList.add('draw-flight-source');
};

export const showAfterFlight = (card) => {
  card?.image?.classList.remove('draw-flight-source');
  card?.wrapper?.classList.remove('draw-flight-source');
};

const deckOriginEl = (user) => {
  const doc = user === 'self' ? selfContainerDocument : oppContainerDocument;
  const cover = doc?.getElementById('deckCover');
  return cover?.querySelector('img') || cover;
};

const buildDrawFlip = (faceSrc, sleeveSrc) => {
  const flip = document.createElement('div');
  flip.className = 'card-preview-flip';

  const front = document.createElement('div');
  front.className = 'card-preview-face card-preview-face--front';
  const face = document.createElement('img');
  face.className = 'card-preview-card';
  face.src = faceSrc;
  face.alt = '';
  face.draggable = false;
  front.appendChild(face);

  const back = document.createElement('div');
  back.className = 'card-preview-face card-preview-face--back';
  const sleeve = document.createElement('img');
  sleeve.className = 'card-preview-sleeve';
  sleeve.src = sleeveSrc;
  sleeve.alt = '';
  sleeve.draggable = false;
  back.appendChild(sleeve);

  flip.append(front, back);
  return flip;
};

export const originRectForHandFlight = (user, oZoneId, card) => {
  const override = pendingHandOrigins.get(card);
  if (override) {
    pendingHandOrigins.delete(card);
    return override;
  }
  const el =
    oZoneId === 'deck'
      ? deckOriginEl(user)
      : oZoneId === 'prizes'
        ? cardNode(card) ?? card?.image
        : null;
  return el ? viewportRectOf(el) : null;
};

const startDrawToHand = (user, card, fromRect) => {
  hideForFlight(card);
  const toEl = cardNode(card) ?? card.image;
  const origin = fromRect || (deckOriginEl(user) && viewportRectOf(deckOriginEl(user)));
  if (!toEl?.isConnected || !origin) {
    showAfterFlight(card);
    return;
  }

  const dest = viewportRectOf(toEl);
  if (dest.width < 2 || dest.height < 2) {
    showAfterFlight(card);
    return;
  }

  const hidden = isCardHidden(card);
  const sleeveSrc = cardBackSrcForUser(user) || DEFAULT_SLEEVE;
  const faceSrc = hidden
    ? sleeveSrc
    : toHighResCardImageUrl(card.image.currentSrc || card.image.src);

  const host = document.createElement('div');
  host.className = 'card-draw-flight';
  host.style.left = `${dest.left}px`;
  host.style.top = `${dest.top}px`;
  host.style.width = `${dest.width}px`;
  host.style.height = `${dest.height}px`;
  host.appendChild(buildDrawFlip(faceSrc, sleeveSrc));
  document.body.appendChild(host);

  const startTranslate = {
    x: origin.left + origin.width / 2 - (dest.left + dest.width / 2),
    y: origin.top + origin.height / 2 - (dest.top + dest.height / 2),
  };
  const startScale = origin.width / Math.max(dest.width, 1);
  const destCy = dest.top + dest.height / 2;
  const arcSign = destCy > (globalThis.innerHeight || 0) / 2 ? 1 : -1;

  playDrawFlight(host, {
    startTranslate,
    startScale,
    flip: !hidden,
    arcSign,
    onDone: () => {
      host.remove();
      showAfterFlight(card);
    },
  });
};

const drawFlightAllowed = () =>
  typeof document !== 'undefined' &&
  shouldAnimateDrawFlight({
    syncReplaying: !!systemState.syncReplaying,
    hidden: !!document.hidden,
  });

// Design 044: the legacy mover draws one card per call, so calls for a side
// within BATCH_WINDOW_MS join one draw; a side's draws play one after another.
const BATCH_WINDOW_MS = 90;
const batches = { self: null, opp: null };
const sideBusyUntil = { self: 0, opp: 0 };

const sideKey = (user) => (user === 'self' ? 'self' : 'opp');

const runBatch = (user, cards) => {
  const live = cards.filter((card) => card.image?.isConnected);
  cards.filter((card) => !live.includes(card)).forEach(showAfterFlight);
  const faceDown = live.filter((card) => user === 'opp' && (card.redacted || isCardHidden(card)));
  const faceUp = live.filter((card) => !faceDown.includes(card));
  const sceneMs = faceUp.length > 0 ? playDrawScene(user, faceUp, showAfterFlight) : 0;
  const flightMs = faceDown.length > 0 ? playOppDrawFlights(user, faceDown, showAfterFlight) : 0;
  return Math.max(sceneMs, flightMs);
};

const queueBatch = (user, cards) => {
  const key = sideKey(user);
  const wait = Math.max(0, sideBusyUntil[key] - performance.now());
  const start = () => {
    const ms = runBatch(user, cards);
    sideBusyUntil[key] = Math.max(sideBusyUntil[key], performance.now() + ms);
  };
  // Held back until the previous draw has landed, so two draws never share the mat.
  sideBusyUntil[key] = Math.max(sideBusyUntil[key], performance.now() + wait);
  if (wait > 0) globalThis.setTimeout(start, wait);
  else start();
};

/**
 * Design 044: plays one whole draw at once (the authoritative advisory path,
 * where every drawn card arrives in one event). When draws may not animate
 * the cards are just shown.
 * @param {'self'|'opp'} user
 * @param {{image: HTMLImageElement, wrapper?: Element, redacted?: boolean}[]} cards
 * @returns {number} how many cards the draw plays
 */
export const playDrawBatch = (user, cards) => {
  const valid = (cards || []).filter((card) => card?.image);
  if (valid.length === 0) return 0;
  if (!drawFlightAllowed()) {
    valid.forEach(showAfterFlight);
    return 0;
  }
  valid.forEach(hideForFlight);
  queueBatch(user, valid);
  return valid.length;
};

// Pokémon TCG Live draw / prize take: card lifts from the origin, arcs
// into the hand, and flips sleeve → face. Deck draws (design 044) join the
// side's batch for the draw scene; prize takes keep this spring flight.
export const playDrawToHand = (user, card, { fromRect, source = 'deck' } = {}) => {
  if (!card?.image || !drawFlightAllowed()) return;
  hideForFlight(card);
  if (source === 'deck') {
    const key = sideKey(user);
    if (batches[key]) {
      batches[key].cards.push(card);
      return;
    }
    batches[key] = { cards: [card] };
    globalThis.setTimeout(() => {
      const { cards } = batches[key];
      batches[key] = null;
      queueBatch(user, cards);
    }, BATCH_WINDOW_MS);
    return;
  }
  const wait = Math.max(0, nextStartAt - performance.now());
  nextStartAt = performance.now() + wait + STAGGER_MS;
  globalThis.setTimeout(() => startDrawToHand(user, card, fromRect), wait);
};
