import { getZone } from '../zones/get-zone.js';
import { stopHoloAnimation } from '../deck-builder/core/holo.mjs';
import { closeCardPreview } from './full-view.js';

/** @type {{ overlay: HTMLElement, stack: HTMLElement, slides: HTMLElement[], cards: object[], index: number, countEl: HTMLElement, nameEl: HTMLElement, onKeyDown: (event: KeyboardEvent) => void, pointerId: number | null, dragStartX: number, dragActive: boolean } | null} */
let viewerState = null;

const MAX_BEHIND = 2;
const PEEK_PERCENT = 24;
const SWIPE_THRESHOLD = 48;

export const isDiscardPileViewerOpen = () => viewerState != null;

const clampIndex = (index, max) => Math.max(0, Math.min(index, max));

const layoutStack = (state) => {
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
    slide.style.zIndex = String(200 - behind);
    if (behind === 0) {
      slide.classList.add('is-active');
      slide.style.transform = 'translateX(0) scale(1)';
      slide.style.opacity = '1';
    } else {
      slide.classList.add('is-behind');
      slide.style.transform = `translateX(calc(${behind} * ${PEEK_PERCENT}%)) scale(${1 - behind * 0.035})`;
      slide.style.opacity = String(Math.max(0.45, 0.9 - behind * 0.2));
    }
  });
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

  const { overlay, onKeyDown, stack } = viewerState;
  document.removeEventListener('keydown', onKeyDown);
  stack.replaceWith(stack.cloneNode(true));
  overlay.querySelectorAll('.mat-holo').forEach((wrapper) => {
    stopHoloAnimation(wrapper);
  });
  overlay.remove();
  viewerState = null;
};

const attachSwipe = (state) => {
  const { stack } = state;

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    state.pointerId = event.pointerId;
    state.dragStartX = event.clientX;
    state.dragActive = true;
    stack.setPointerCapture(event.pointerId);
  };

  const onPointerUp = (event) => {
    if (!state.dragActive || state.pointerId !== event.pointerId) return;
    state.dragActive = false;
    state.pointerId = null;
    const delta = event.clientX - state.dragStartX;
    if (delta <= -SWIPE_THRESHOLD) {
      goToIndex(state, state.index + 1);
    } else if (delta >= SWIPE_THRESHOLD) {
      goToIndex(state, state.index - 1);
    }
    stack.releasePointerCapture(event.pointerId);
  };

  stack.addEventListener('pointerdown', onPointerDown);
  stack.addEventListener('pointerup', onPointerUp);
  stack.addEventListener('pointercancel', onPointerUp);
};

export const openDiscardPileViewer = (user, startIndex = null) => {
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

  const slides = cards.map((card, i) => {
    const slide = document.createElement('div');
    slide.className = 'discard-pile-slide';
    slide.dataset.index = String(i);

    const img = document.createElement('img');
    img.src = card.image.src;
    img.alt = card.name ?? '';
    img.className = 'discard-pile-card';
    img.draggable = false;
    slide.appendChild(img);
    stack.appendChild(slide);
    return slide;
  });

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
    dragStartX: 0,
    dragActive: false,
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
