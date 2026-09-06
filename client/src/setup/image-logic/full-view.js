import { startHoloAnimation } from '../deck-builder/core/holo.mjs';
import {
  cardBackSrcForUser,
  cardNode,
  fullViewHost,
  hydrateHolo,
  imageAnchor,
  isInCardPreview,
} from '../deck-constructor/hydrate-holo.js';
import {
  playSelectPop,
  playDeselectPop,
  makePopFrame,
  stopPop,
  viewportRectOf,
} from './card-pop.mjs';

const DEFAULT_SLEEVE = 'https://ptcgsim.online/src/assets/cardback.png';

/** @type {{ overlay: HTMLElement, popHost: HTMLElement, placeholder: HTMLElement, anchor: HTMLElement, host: HTMLElement | null, zoneDoc: Document, card?: { image: HTMLImageElement, wrapper?: HTMLElement, name?: string, type?: string, user?: string }, wrapper?: HTMLElement } | null} */
let cardPreviewState = null;

export const isCardPreviewOpen = () => cardPreviewState != null;

export const resolvePreviewSleeveSrc = (card, image) => {
  const user = card?.user ?? card?.image?.user ?? image?.user ?? 'self';
  return cardBackSrcForUser(user) || DEFAULT_SLEEVE;
};

const adoptNode = (node, doc) => {
  if (!node || node.ownerDocument === doc) return node;
  return doc.adoptNode(node);
};

const startPreviewHolo = (wrapper) => {
  if (!wrapper) return;
  wrapper.style.width = '';
  wrapper.style.height = '';
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

// Double-click on active/bench: spring-pop enlargement of the Pokémon only.
export const openCardPreview = (targetImage, card) => {
  if (cardPreviewState) {
    closeCardPreview(null, true);
  }

  const zoneDoc = targetImage.ownerDocument;
  const host = fullViewHost(targetImage);
  const anchor = cardNode(card) ?? imageAnchor(targetImage);
  const rect = viewportRectOf(anchor);

  const placeholder = zoneDoc.createElement('span');
  placeholder.className = 'card-preview-placeholder';
  placeholder.style.display = 'inline-block';
  placeholder.style.width = `${rect.width}px`;
  placeholder.style.height = `${rect.height}px`;
  placeholder.style.verticalAlign = 'bottom';
  anchor.before(placeholder);

  const overlay = document.createElement('div');
  overlay.className = 'card-preview-overlay';

  const popHost = document.createElement('div');
  popHost.className = 'card-preview-pop';
  popHost.style.left = `${rect.left}px`;
  popHost.style.top = `${rect.top}px`;
  popHost.style.width = `${rect.width}px`;
  popHost.style.height = `${rect.height}px`;

  const frontNode = adoptNode(anchor, document);
  frontNode.classList.add('card-preview-card');
  popHost.appendChild(buildPreviewFlip(frontNode, resolvePreviewSleeveSrc(card, targetImage)));
  overlay.appendChild(popHost);
  document.body.appendChild(overlay);

  hideCardCounters(targetImage);

  const wrapper = card?.wrapper ?? anchor.closest?.('.mat-holo') ?? undefined;
  if (wrapper) {
    startPreviewHolo(wrapper);
  } else if (card) {
    hydrateHolo(card).then((hydratedWrapper) => {
      if (!hydratedWrapper || !cardPreviewState || cardPreviewState.card !== card) {
        return;
      }
      hydratedWrapper.classList.add('card-preview-card');
      const front = cardPreviewState.popHost.querySelector('.card-preview-face--front');
      if (front && hydratedWrapper.parentElement !== front) {
        front.appendChild(hydratedWrapper);
      }
      cardPreviewState.wrapper = hydratedWrapper;
      cardPreviewState.anchor = hydratedWrapper;
      startPreviewHolo(hydratedWrapper);
    });
  }

  playSelectPop(popHost, null, null, rect);

  cardPreviewState = {
    overlay,
    popHost,
    placeholder,
    anchor: card?.wrapper ?? anchor.closest?.('.mat-holo') ?? anchor,
    host,
    zoneDoc,
    card,
    wrapper: card?.wrapper ?? wrapper,
  };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeCardPreview(event);
    }
  });
};

export const closeCardPreview = (event, immediate = false) => {
  if (!cardPreviewState) return;
  if (event?.target && cardPreviewState.overlay.contains(event.target)) {
    if (event.target !== cardPreviewState.overlay) return;
  }

  const state = cardPreviewState;
  cardPreviewState = null;
  state.overlay.classList.add('is-closing');

  const revert = () => {
    const anchor =
      (state.card ? cardNode(state.card) : null) ?? state.anchor;
    const wrapper =
      state.card?.wrapper ?? state.wrapper ?? anchor.closest?.('.mat-holo') ?? undefined;

    if (wrapper) {
      startHoloAnimation(wrapper, { auto: true });
    }
    anchor.classList.remove('card-preview-card');
    const primaryImg = anchor.matches('img')
      ? anchor
      : anchor.querySelector('img');
    if (primaryImg) {
      showCardCounters(primaryImg);
    }

    const homeAnchor = adoptNode(anchor, state.zoneDoc);
    if (state.placeholder.isConnected) {
      state.placeholder.before(homeAnchor);
      state.placeholder.remove();
    } else if (state.host?.isConnected) {
      state.host.appendChild(homeAnchor);
    }

    state.overlay.remove();

    if (state.card && !isInCardPreview(state.card)) {
      hydrateHolo(state.card);
    }
  };

  if (immediate) {
    stopPop(state.popHost);
    revert();
  } else {
    playDeselectPop(state.popHost, null, revert);
  }
};

// Re-export closeFullView's revert helper target — closeFullView stays in
// close-popups.js because it wires refreshBoard + document queries there.
