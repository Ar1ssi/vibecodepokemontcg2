import {
  oppContainerDocument,
  selfContainerDocument,
} from '../../state.js';
import {
  cardBackSrcForUser,
  cardNode,
  isCardHidden,
} from '../deck-constructor/hydrate-holo.js';
import { toHighResCardImageUrl } from './card-image-url.mjs';
import { playDrawFlight, viewportRectOf } from './card-pop.mjs';

const DEFAULT_SLEEVE = 'https://ptcgsim.online/src/assets/cardback.png';
const STAGGER_MS = 180;

let nextStartAt = 0;

const hideForFlight = (card) => {
  card?.image?.classList.add('draw-flight-source');
  card?.wrapper?.classList.add('draw-flight-source');
};

const showAfterFlight = (card) => {
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

// Pokémon TCG Live draw / prize take: card lifts from the origin, arcs
// into the hand, and flips sleeve → face.
export const playDrawToHand = (user, card, { fromRect } = {}) => {
  if (!card?.image || typeof document === 'undefined') return;
  hideForFlight(card);
  const wait = Math.max(0, nextStartAt - performance.now());
  nextStartAt = performance.now() + wait + STAGGER_MS;
  globalThis.setTimeout(() => startDrawToHand(user, card, fromRect), wait);
};
