import {
  buildHoloCard,
  resolveHoloEffect,
  startHoloAnimation,
} from '../deck-builder/core/holo.mjs';
import {
  cardBackSrcForUser,
  cardNode,
  fullViewHost,
  imageAnchor,
} from '../deck-constructor/hydrate-holo.js';
import { toHighResCardImageUrl } from './card-image-url.mjs';
import {
  playSelectPop,
  playDeselectPop,
  makePopFrame,
  previewSizeForSource,
  stopPop,
  viewportRectOf,
} from './card-pop.mjs';

const DEFAULT_SLEEVE = 'https://ptcgsim.online/src/assets/cardback.png';

/** @type {{ overlay: HTMLElement, popHost: HTMLElement, placeholder: HTMLElement | null, anchor: HTMLElement, host: HTMLElement | null, zoneDoc: Document, card?: { image: HTMLImageElement, wrapper?: HTMLElement, name?: string, type?: string, user?: string }, wrapper?: HTMLElement, mode?: 'board' | 'float', onClosed?: () => void } | null} */
let cardPreviewState = null;

export const isCardPreviewOpen = () => cardPreviewState != null;

export const resolvePreviewSleeveSrc = (card, image) => {
  const user = card?.user ?? card?.image?.user ?? image?.user ?? 'self';
  return cardBackSrcForUser(user) || DEFAULT_SLEEVE;
};

const startPreviewHolo = (wrapper) => {
  if (!wrapper) return;
  startHoloAnimation(wrapper, { auto: true });
};

const hideCardCounters = (image) => {
  if (image.damageCounter) image.damageCounter.style.display = 'none';
  if (image.specialCondition) image.specialCondition.style.display = 'none';
  if (image.abilityCounter) image.abilityCounter.style.display = 'none';
};

const showCardCounters = (image) => {
  if (image.damageCounter) image.damageCounter.style.display = '';
  if (image.specialCondition) image.specialCondition.style.display = '';
  if (image.abilityCounter) image.abilityCounter.style.display = '';
};

const applyHighResToImage = (image) => {
  if (!image?.src) return;
  const next = toHighResCardImageUrl(image.currentSrc || image.src);
  if (!next || next === image.src) return;
  const probe = new Image();
  probe.onload = () => {
    if (image.isConnected) image.src = next;
  };
  probe.src = next;
};

const placePopHostOnSource = (popHost, sourceRect) => {
  const target = previewSizeForSource(sourceRect);
  const startScale = sourceRect.width / Math.max(target.width, 1);
  const left = sourceRect.left + sourceRect.width / 2 - target.width / 2;
  const top = sourceRect.top + sourceRect.height / 2 - target.height / 2;
  popHost.style.left = `${left}px`;
  popHost.style.top = `${top}px`;
  popHost.style.width = `${target.width}px`;
  popHost.style.height = `${target.height}px`;
  return {
    startScale,
    hostRect: { left, top, width: target.width, height: target.height },
  };
};

const buildPreviewFlip = (frontNode, sleeveSrc) => {
  const flip = document.createElement('div');
  flip.className = 'card-preview-flip';

  const front = document.createElement('div');
  front.className = 'card-preview-face card-preview-face--front';
  front.appendChild(frontNode);

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

// Right-click → "View attached cards": the grey panel with the Pokémon plus its
// attached energies/tools spread in a row (the old double-click behavior).
export const openAttachedCardsPanel = (targetImage, card) => {
  if (cardPreviewState) {
    closeCardPreview(null, true);
  }

  const host = fullViewHost(targetImage);
  const anchor = imageAnchor(targetImage);
  if (!host || host.classList.contains('full-view')) return false;

  const images = host.querySelectorAll('img');
  images.forEach((image) => {
    hideCardCounters(image);
    if (image.attached) {
      image.style.position = 'static';
    }
    image.classList.add('default-rotation');
  });

  host.classList.add('full-view');
  anchor.classList.add('full-view-card');
  if (document.querySelector('.dark-mode-1')) {
    host.classList.add('dark-mode-5');
  }
  host.style.zIndex = '2';
  host.style.height = '70%';
  host.style.width = 'auto';

  host.parentElement.style.zIndex = '2';
  document.getElementById('stadium').style.zIndex = '-1';

  if (card?.wrapper) {
    startHoloAnimation(card.wrapper);
  }

  playSelectPop(host, makePopFrame(host));
  return true;
};

// Double-click on active/bench: hide the mat card in place and animate a
// high-res clone so closing does not re-seat a second copy.
export const openCardPreview = (targetImage, card) => {
  const anchor = cardNode(card) ?? imageAnchor(targetImage);
  if (!anchor) return;
  hideCardCounters(targetImage);
  openFloatingCardPreview({
    sourceEl: anchor,
    imageUrl: toHighResCardImageUrl(targetImage.currentSrc || targetImage.src),
    card,
    sleeveSrc: resolvePreviewSleeveSrc(card, targetImage),
    cloneFrom: card?.wrapper ?? (anchor.classList?.contains('mat-holo') ? anchor : null),
    hideSource: true,
    onClosed: () => {
      anchor.style.visibility = '';
      showCardCounters(targetImage);
    },
  });
};

// Deck-builder search / deck-list preview: clone a high-res card at the
// thumbnail's seat and run the same 360° spring as the board preview.
export const openFloatingCardPreview = ({
  sourceEl,
  sourceRect,
  imageUrl,
  card = null,
  sleeveSrc = DEFAULT_SLEEVE,
  cloneFrom = null,
  hideSource = false,
  onClosed = null,
} = {}) => {
  if (cardPreviewState) {
    closeCardPreview(null, true);
  }
  if ((!sourceEl && !sourceRect) || !imageUrl) return;

  const rect = sourceRect ?? viewportRectOf(sourceEl);
  const overlay = document.createElement('div');
  overlay.className = 'card-preview-overlay';

  const popHost = document.createElement('div');
  popHost.className = 'card-preview-pop';
  const { startScale, hostRect } = placePopHostOnSource(popHost, rect);

  const hiRes = toHighResCardImageUrl(imageUrl);
  let frontNode;
  let wrapper;
  if (cloneFrom) {
    frontNode = cloneFrom.cloneNode(true);
    frontNode.classList.add('card-preview-card', 'mat-holo');
    frontNode.style.visibility = '';
    applyHighResToImage(frontNode.matches('img') ? frontNode : frontNode.querySelector('img'));
    wrapper = frontNode;
  } else {
    const effect = resolveHoloEffect(card || {});
    if (effect) {
      wrapper = buildHoloCard(hiRes, effect);
      wrapper.classList.add('card-preview-card', 'mat-holo');
      frontNode = wrapper;
    } else {
      frontNode = document.createElement('img');
      frontNode.className = 'card-preview-card';
      frontNode.src = hiRes;
      frontNode.alt = card?.name || '';
      frontNode.draggable = false;
    }
  }

  popHost.appendChild(buildPreviewFlip(frontNode, sleeveSrc || DEFAULT_SLEEVE));
  overlay.appendChild(popHost);
  document.body.appendChild(overlay);
  if (hideSource && sourceEl) {
    sourceEl.style.visibility = 'hidden';
  }

  if (wrapper) {
    startPreviewHolo(wrapper);
  }

  playSelectPop(popHost, null, null, hostRect, { startScale, endScale: 1 });

  cardPreviewState = {
    overlay,
    popHost,
    placeholder: null,
    anchor: frontNode,
    host: null,
    zoneDoc: document,
    card: null,
    wrapper,
    mode: 'float',
    closing: false,
    onClosed,
  };

  overlay.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.target === overlay) {
      closeCardPreview(event);
    }
  });
};

export const closeCardPreview = (event, immediate = false) => {
  if (!cardPreviewState) return;
  event?.stopPropagation?.();
  if (
    event?.target &&
    cardPreviewState.overlay.contains(event.target) &&
    event.target !== cardPreviewState.overlay &&
    !cardPreviewState.closing
  ) {
    return;
  }
  if (cardPreviewState.closing && !immediate) return;

  const state = cardPreviewState;
  state.closing = true;
  state.overlay.classList.add('is-closing');

  const revert = () => {
    if (cardPreviewState === state) cardPreviewState = null;
    state.overlay.remove();
    state.onClosed?.();
  };

  if (immediate) {
    cardPreviewState = null;
    stopPop(state.popHost);
    revert();
  } else {
    playDeselectPop(state.popHost, null, revert);
  }
};

// Re-export closeFullView's revert helper target — closeFullView stays in
// close-popups.js because it wires refreshBoard + document queries there.
