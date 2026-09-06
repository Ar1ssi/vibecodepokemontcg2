import { getZone } from '../zones/get-zone.js';
import {
  buildHoloCard,
  resolveHoloEffect,
  startHoloAnimation,
  stopHoloAnimation,
} from '../deck-builder/core/holo.mjs';
import { ensureCardData } from '../rules/rules-state.mjs';
import { closeCardPreview } from './full-view.js';

/** @type {{ overlay: HTMLElement, stack: HTMLElement, slides: HTMLElement[], cards: object[], index: number, countEl: HTMLElement, nameEl: HTMLElement, onKeyDown: (event: KeyboardEvent) => void, pointerId: number | null } | null} */
let viewerState = null;

const MAX_BEHIND = 2;
const PEEK_PERCENT = 24;
const SWIPE_THRESHOLD = 40;
const SWIPE_START_PX = 8;

export const isDiscardPileViewerOpen = () => viewerState != null;

const clampIndex = (index, max) => Math.max(0, Math.min(index, max));

const slideWrapper = (slide) =>
  slide.holoWrapper ?? slide.querySelector('.mat-holo');

const buildSlideContent = async (card) => {
  const existingRarity = card.wrapper?.dataset?.rarity;
  if (existingRarity) {
    const wrapper = buildHoloCard(card.image.src, existingRarity);
    wrapper.classList.add('mat-holo', 'discard-pile-holo');
    return { node: wrapper, holoWrapper: wrapper };
  }

  const data = await ensureCardData({
    name: card.name,
    type: card.type,
    number: card.number,
    set: card.set,
    id: card.id,
  });
  const effect = resolveHoloEffect(data);
  if (effect) {
    const wrapper = buildHoloCard(card.image.src, effect);
    wrapper.classList.add('mat-holo', 'discard-pile-holo');
    return { node: wrapper, holoWrapper: wrapper };
  }

  const img = document.createElement('img');
  img.src = card.image.src;
  img.alt = card.name ?? '';
  img.className = 'discard-pile-card';
  img.draggable = false;
  return { node: img, holoWrapper: null };
};

const syncHoloAnimations = (state) => {
  state.slides.forEach((slide, i) => {
    const wrapper = slideWrapper(slide);
    if (!wrapper) return;
    stopHoloAnimation(wrapper);
    if (state.index - i === 0) {
      startHoloAnimation(wrapper);
    }
  });
};

const layoutStack = (state, dragOffsetX = 0) => {
  const { slides, index } = state;
  slides.forEach((slide, i) => {
    const behind = index - i;
    slide.classList.remove('is-active', 'is-behind', 'is-hidden');
    if (behind < 0 || behind > MAX_BEHIND) {
      slide.classList.add('is-hidden');
      slide.style.zIndex = '0';
      slide.style.transform = '';
      slide.style.opacity = '';
      return;
    }
    slide.style.zIndex = String(300 - behind);
    if (behind === 0) {
      slide.classList.add('is-active');
      slide.style.transform = dragOffsetX
        ? `translateX(${dragOffsetX}px) scale(1)`
        : 'translateX(0) scale(1)';
      slide.style.opacity = '1';
    } else {
      slide.classList.add('is-behind');
      slide.style.transform = `translateX(calc(${behind} * ${PEEK_PERCENT}%)) scale(${1 - behind * 0.035})`;
      slide.style.opacity = String(Math.max(0.45, 0.9 - behind * 0.2));
    }
  });
  if (!dragOffsetX) syncHoloAnimations(state);
};

const updateFooter = (state) => {
  const card = state.cards[state.index];
  state.countEl.textContent = `${state.index + 1} / ${state.cards.length}`;
  state.nameEl.textContent = card?.name ?? '';
  layoutStack(state);
};

const goToIndex = (state, index) => {
  state.index = clampIndex(index, state.slides.length - 1);
  updateFooter(state);
};

export const closeDiscardPileViewer = () => {
  if (!viewerState) return;

  const { overlay, onKeyDown, slides } = viewerState;
  document.removeEventListener('keydown', onKeyDown);
  slides.forEach((slide) => {
    const wrapper = slideWrapper(slide);
    if (wrapper) stopHoloAnimation(wrapper);
  });
  overlay.remove();
  viewerState = null;
};

const attachSwipe = (state) => {
  const { stack } = state;
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let dragging = false;

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    tracking = true;
    dragging = false;
    startX = event.clientX;
    startY = event.clientY;
    state.pointerId = event.pointerId;
    stack.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!tracking || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (
      !dragging &&
      Math.abs(dx) >= SWIPE_START_PX &&
      Math.abs(dx) > Math.abs(dy) * 1.2
    ) {
      dragging = true;
      stack.classList.add('is-dragging');
    }
    if (dragging) {
      layoutStack(state, dx);
    }
  };

  const endSwipe = (event) => {
    if (!tracking || state.pointerId !== event.pointerId) return;
    tracking = false;
    stack.classList.remove('is-dragging');
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    const horizontal =
      Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy);
    if (horizontal) {
      if (dx > 0) {
        goToIndex(state, state.index + 1);
      } else {
        goToIndex(state, state.index - 1);
      }
    } else {
      layoutStack(state);
    }
    dragging = false;
    state.pointerId = null;
    try {
      stack.releasePointerCapture(event.pointerId);
    } catch {
      // capture may already be released
    }
  };

  stack.addEventListener('pointerdown', onPointerDown);
  stack.addEventListener('pointermove', onPointerMove);
  stack.addEventListener('pointerup', endSwipe);
  stack.addEventListener('pointercancel', endSwipe);
};

export const openDiscardPileViewer = async (user, startIndex = null) => {
  closeCardPreview(null, true);
  closeDiscardPileViewer();

  const zone = getZone(user, 'discard');
  const cards = zone.array;
  if (!cards.length) return;

  const initialIndex = clampIndex(
    startIndex ?? cards.length - 1,
    cards.length - 1
  );

  const overlay = document.createElement('div');
  overlay.className = 'discard-pile-overlay';
  overlay.id = 'discardPileViewer';

  const header = document.createElement('div');
  header.className = 'discard-pile-header';
  header.textContent = 'Discard Pile';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'discard-pile-close';
  closeBtn.setAttribute('aria-label', 'Close discard pile viewer');
  closeBtn.textContent = '×';

  const stage = document.createElement('div');
  stage.className = 'discard-pile-stage';

  const stack = document.createElement('div');
  stack.className = 'discard-pile-stack';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'discard-pile-nav discard-pile-nav--prev';
  prevBtn.setAttribute('aria-label', 'Older card');
  prevBtn.textContent = '‹';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'discard-pile-nav discard-pile-nav--next';
  nextBtn.setAttribute('aria-label', 'Newer card');
  nextBtn.textContent = '›';

  const slides = [];
  for (let i = 0; i < cards.length; i += 1) {
    const card = cards[i];
    const slide = document.createElement('div');
    slide.className = 'discard-pile-slide';
    slide.dataset.index = String(i);
    const { node, holoWrapper } = await buildSlideContent(card);
    slide.appendChild(node);
    if (holoWrapper) slide.holoWrapper = holoWrapper;
    stack.appendChild(slide);
    slides.push(slide);
  }

  stage.append(stack, nextBtn);
  if (cards.length > 1) {
    stage.appendChild(prevBtn);
  }

  const footer = document.createElement('div');
  footer.className = 'discard-pile-footer';
  const countEl = document.createElement('span');
  countEl.className = 'discard-pile-count';
  const nameEl = document.createElement('span');
  nameEl.className = 'discard-pile-name';
  footer.append(countEl, nameEl);

  overlay.append(header, closeBtn, stage, footer);
  document.body.appendChild(overlay);

  const state = {
    overlay,
    stack,
    slides,
    cards,
    index: initialIndex,
    countEl,
    nameEl,
    pointerId: null,
    onKeyDown: null,
  };

  state.onKeyDown = (event) => {
    if (!viewerState) return;
    if (event.key === 'Escape' || event.key === 'v') {
      closeDiscardPileViewer();
    } else if (event.key === 'ArrowLeft') {
      goToIndex(state, state.index - 1);
    } else if (event.key === 'ArrowRight') {
      goToIndex(state, state.index + 1);
    }
  };

  closeBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    closeDiscardPileViewer();
  });
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeDiscardPileViewer();
  });
  prevBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    goToIndex(state, state.index - 1);
  });
  nextBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    goToIndex(state, state.index + 1);
  });
  document.addEventListener('keydown', state.onKeyDown);
  attachSwipe(state);

  viewerState = state;
  goToIndex(state, initialIndex);
};
