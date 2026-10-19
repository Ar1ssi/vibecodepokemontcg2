/**
 * @file Stack view (design 074) — TCG Live's StackedCardOverlay_Landscape, the deep inspection of an
 * in-play Pokémon.
 *
 * The left half is the card carousel (the Pokémon, its evolution line, then its Tools and Energy),
 * the right half the card info panel: name and HP bar, the Attached Energy and Attached Tools rows,
 * the attack list in the same option prefabs the overlay uses, and the footer with the Weakness /
 * Resistance / Retreat bar and the Status Effects button. It inspects only: nothing in it acts.
 * The opponent's Pokémon open here, and so does the overlay HUD's Stack button.
 *
 * Only public cards reach this view: the caller passes the in-play stack it already shows.
 */

import { uiCue } from '../netcode/mat-fx/ui-cue.mjs';
import { buildSlideContent } from '../image-logic/card-picker.js';
import {
  MAT_HOLO_OPTIONS,
  startHoloAnimation,
  stopHoloAnimation,
} from '../deck-builder/core/holo.mjs';
import { suppressHoverPreview } from '../image-logic/hover-preview-bus.mjs';
import { stackViewModelFor } from './card-inspector.mjs';
import { buildStackInfoPanel } from './stack-view-panel.mjs';
import { closeStatusPopup, isStatusPopupOpen, openStatusPopup } from './status-popup.mjs';

const CLOSE_EVENTS = ['rules-turn-began', 'rules-session-reset'];

/** @type {null | object} */
let viewState = null;

export const isStackViewOpen = () => viewState !== null;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
};

// One round sprite button (shadow_32, circle_32 stroke round a circle_26 face, #333333 icon).
const roundButton = (className, label, onClick) => {
  const button = el('button', `tcgl-stack__btn ${className}`);
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.title = label;
  const face = el('span', 'tcgl-stack__btn-face');
  face.appendChild(el('span', 'tcgl-stack__btn-icon'));
  button.appendChild(face);
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!button.disabled) onClick();
  });
  return button;
};

// CardCarousel: one card at a time between the left / right arrows.
const buildCarousel = (state) => {
  const region = el('section', 'tcgl-stack__carousel');
  const stage = el('div', 'tcgl-stack__card');
  const left = roundButton('tcgl-stack__arrow tcgl-stack__arrow--left', 'Previous card', () =>
    showCard(state, state.index - 1)
  );
  const right = roundButton('tcgl-stack__arrow tcgl-stack__arrow--right', 'Next card', () =>
    showCard(state, state.index + 1)
  );
  const dots = el('div', 'tcgl-stack__dots');
  region.append(left, stage, right, dots);
  state.carousel = { stage, left, right, dots };
  return region;
};

const showCard = (state, index) => {
  const { cards, carousel } = state;
  if (index < 0 || index >= cards.length) return;
  state.index = index;
  if (state.holoWrapper) stopHoloAnimation(state.holoWrapper);
  const built = buildSlideContent(cards[index]);
  state.holoWrapper = built.holoWrapper;
  carousel.stage.replaceChildren(built.node);
  if (state.holoWrapper) startHoloAnimation(state.holoWrapper, MAT_HOLO_OPTIONS);
  carousel.left.disabled = index === 0;
  carousel.right.disabled = index === cards.length - 1;
  const single = cards.length < 2;
  carousel.left.hidden = single;
  carousel.right.hidden = single;
  carousel.dots.replaceChildren(
    ...cards.map((_, i) => el('span', `tcgl-stack__dot${i === index ? ' tcgl-stack__dot--on' : ''}`))
  );
  carousel.dots.hidden = single;
};

const closeImmediately = () => closeStackView();
const onKeydown = (event) => {
  // The status popup sits above and closes first (keybinds.js).
  if (event.key !== 'Escape' || isStatusPopupOpen()) return;
  event.stopPropagation();
  closeStackView();
};

/**
 * Open the stack view. Returns false (and opens nothing) when one is already open or the card
 * cannot be shown.
 *
 * @param {object} options
 * @param {object} options.card the in-play Pokémon (a preview card)
 * @param {object[]} [options.cards] the stack, left to right; defaults to the card alone
 * @param {'active'|'bench'} [options.zone]
 * @param {{ positive: object[], negative: object[] }} [options.statuses]
 */
export function openStackView({
  card,
  cards = null,
  zone = 'active',
  statuses = { positive: [], negative: [] },
} = {}) {
  suppressHoverPreview('modal');
  if (viewState || !card) return false;
  const state = { cards: cards?.length ? cards : [card], index: 0, holoWrapper: null };
  try {
    const root = el('div', 'tcgl-stack');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', `${card.name ?? 'Pokémon'} — stack view`);
    const layout = el('div', 'tcgl-stack__layout');
    layout.appendChild(buildCarousel(state));
    const { model, energyTypes } = stackViewModelFor(card, zone);
    layout.appendChild(
      buildStackInfoPanel({ card, model, energyTypes, statuses, onStatus: () => openStatusPopup(statuses) })
    );
    root.appendChild(layout);
    root.appendChild(roundButton('tcgl-stack__close', 'Close', closeImmediately));
    // The dimmed table around the layout closes it; clicks on the layout itself stay inside.
    root.addEventListener('click', (event) => {
      event.stopPropagation();
      if (event.target === root || event.target === layout) closeStackView();
    });
    state.root = root;
    viewState = state;
    showCard(state, 0);
    document.body.appendChild(root);
    CLOSE_EVENTS.forEach((name) => document.addEventListener(name, closeImmediately));
    document.addEventListener('keydown', onKeydown, true);
    uiCue('big-card-in');
    return true;
  } catch (error) {
    console.error('stack view failed to open', error);
    viewState = state;
    closeStackView();
    return false;
  }
}

/** Close the stack view (and its status popup) if open. Idempotent. */
export function closeStackView() {
  const state = viewState;
  if (!state) return;
  viewState = null;
  closeStatusPopup();
  CLOSE_EVENTS.forEach((name) => document.removeEventListener(name, closeImmediately));
  document.removeEventListener('keydown', onKeydown, true);
  if (state.holoWrapper) stopHoloAnimation(state.holoWrapper);
  state.root?.remove();
  uiCue('big-card-out');
}
