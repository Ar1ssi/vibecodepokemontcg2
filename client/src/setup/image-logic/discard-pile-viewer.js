import { getZone } from '../zones/get-zone.js';
import {
  buildHoloCard,
  resolveHoloEffect,
  startHoloAnimation,
  stopHoloAnimation,
} from '../deck-builder/core/holo.mjs';
import { ensureCardData } from '../rules/rules-state.mjs';
import { closeCardPreview } from './full-view.js';

/** @type {{ overlay: HTMLElement, stage: HTMLElement, stack: HTMLElement, slides: HTMLElement[], cards: object[], index: number, targetDragPx: number, renderDragPx: number, animFrameId: number | null, tracking: boolean, countEl: HTMLElement, nameEl: HTMLElement, onKeyDown: (event: KeyboardEvent) => void, pointerId: number | null } | null} */
let viewerState = null;

const PEEK_PERCENT = 24;
const SWIPE_THRESHOLD = 40;
const SWIPE_LOCK_PX = 10;
const SCREEN_EDGE_MARGIN = 32;
/** Drag farther than one peek width to fully advance one card — lowers jitter sensitivity. */
const DRAG_CARD_SCALE = 1.45;
/** How quickly rendered drag catches up to the pointer (lower = smoother). */
const DRAG_LERP = 0.16;

const smoothstep = (t) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

export const isDiscardPileViewerOpen = () => viewerState != null;

const clampIndex = (index, max) => Math.max(0, Math.min(index, max));

const slideWrapper = (slide) =>
  slide.holoWrapper ?? slide.querySelector('.mat-holo');

const disableNativeDrag = (node) => {
  if (!node) return;
  if (node instanceof HTMLImageElement) {
    node.draggable = false;
  }
  node.querySelectorAll?.('img').forEach((img) => {
    img.draggable = false;
  });
};

const buildSlideContent = async (card) => {
  const existingRarity = card.wrapper?.dataset?.rarity;
  if (existingRarity) {
    const wrapper = buildHoloCard(card.image.src, existingRarity);
    wrapper.classList.add('mat-holo', 'discard-pile-holo');
    disableNativeDrag(wrapper);
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
    disableNativeDrag(wrapper);
    return { node: wrapper, holoWrapper: wrapper };
  }

  const img = document.createElement('img');
  img.src = card.image.src;
  img.alt = card.name ?? '';
  img.className = 'discard-pile-card';
  img.draggable = false;
  return { node: img, holoWrapper: null };
};

/** Fractional focus index: drag shifts the whole stack in peek-sized steps. */
const computeVirtualIndex = (index, dragPx, peekPx, slideCount) => {
  const cardStepPx = peekPx * DRAG_CARD_SCALE;
  const progress = dragPx / cardStepPx;
  return Math.max(0, Math.min(slideCount - 1, index + progress));
};

/** Every slide shares the same virtual index — the full stack moves together. */
const computeSlideLayout = (slideIndex, virtualIndex) => {
  const peekOffset = virtualIndex - slideIndex;
  const absPeek = Math.abs(peekOffset);
  return {
    peekOffset,
    role: absPeek < 0.05 ? 'active' : peekOffset < 0 ? 'ahead' : 'behind',
  };
};

/**
 * Crossfade stacking during drag so the incoming card rises above the outgoing
 * one past halfway — avoids a mid-swipe pop where the old front clips on top.
 */
const computeSlideZIndex = (slideIndex, virtualIndex, index, dragPx) => {
  const dist = Math.abs(slideIndex - virtualIndex);
  let z = 300 - dist * 10;

  if (dragPx !== 0) {
    const progress = virtualIndex - index;
    const handoff = smoothstep(Math.abs(progress)) * 5;
    const incoming = dragPx > 0 ? index + 1 : index - 1;

    if (slideIndex === index) {
      z -= handoff;
    } else if (slideIndex === incoming) {
      z += handoff;
    }
  }

  return Math.round(z);
};

const stopDragLoop = (state) => {
  if (state.animFrameId != null) {
    cancelAnimationFrame(state.animFrameId);
    state.animFrameId = null;
  }
};

const startDragLoop = (state) => {
  if (state.animFrameId != null) return;

  const tick = () => {
    if (!viewerState || viewerState !== state) {
      stopDragLoop(state);
      return;
    }

    const delta = state.targetDragPx - state.renderDragPx;
    if (!state.tracking && Math.abs(delta) < 0.35) {
      state.renderDragPx = state.targetDragPx;
      layoutStack(state);
      state.stack.classList.remove('is-dragging');
      state.stage.classList.remove('is-dragging');
      stopDragLoop(state);
      return;
    }

    state.renderDragPx += delta * DRAG_LERP;
    layoutStack(state);
    state.animFrameId = requestAnimationFrame(tick);
  };

  state.animFrameId = requestAnimationFrame(tick);
};

const isSlideOnScreen = (stackRect, stackWidth, peekOffset) => {
  const peekPx = (PEEK_PERCENT / 100) * stackWidth;
  const centerX = stackRect.left + stackRect.width / 2;
  const scale = 1 - Math.abs(peekOffset) * 0.035;
  const cardWidth = stackWidth * scale;
  const cardCenterX = centerX + peekOffset * peekPx;
  return (
    cardCenterX + cardWidth / 2 >= -SCREEN_EDGE_MARGIN &&
    cardCenterX - cardWidth / 2 <= window.innerWidth + SCREEN_EDGE_MARGIN
  );
};

const syncHoloAnimations = (state) => {
  state.slides.forEach((slide, i) => {
    const wrapper = slideWrapper(slide);
    if (!wrapper) return;

    const visible = !slide.classList.contains('is-hidden');
    if (!visible) {
      if (slide.holoRunning) {
        stopHoloAnimation(wrapper);
        slide.holoRunning = false;
      }
      return;
    }

    if (!slide.holoRunning) {
      startHoloAnimation(wrapper, {
        auto: true,
        phaseOffset: (i * 0.31) % 1,
      });
      slide.holoRunning = true;
    }
  });
};

const layoutStack = (state) => {
  const { slides, stack, index, renderDragPx } = state;
  const stackWidth = stack.clientWidth || 380;
  const stackRect = stack.getBoundingClientRect();
  const peekPx = (PEEK_PERCENT / 100) * stackWidth;
  const virtualIndex = computeVirtualIndex(
    index,
    renderDragPx,
    peekPx,
    slides.length
  );

  slides.forEach((slide, i) => {
    const layout = computeSlideLayout(i, virtualIndex);
    const absPeek = Math.abs(layout.peekOffset);

    slide.classList.remove('is-active', 'is-ahead', 'is-behind', 'is-hidden');
    slide.classList.add(`is-${layout.role}`);
    slide.style.zIndex = String(
      computeSlideZIndex(i, virtualIndex, index, renderDragPx)
    );

    const scale = 1 - absPeek * 0.035;
    slide.style.transform = `translate3d(${layout.peekOffset * PEEK_PERCENT}%, 0, 0) scale(${scale})`;
    slide.style.opacity = '1';

    if (!isSlideOnScreen(stackRect, stackWidth, layout.peekOffset)) {
      slide.classList.add('is-hidden');
    }
  });

  syncHoloAnimations(state);
};

const updateFooter = (state) => {
  const card = state.cards[state.index];
  state.countEl.textContent = `${state.index + 1} / ${state.cards.length}`;
  state.nameEl.textContent = card?.name ?? '';
  layoutStack(state);
};

const goToIndex = (state, index) => {
  state.index = clampIndex(index, state.slides.length - 1);
  state.targetDragPx = 0;
  state.renderDragPx = 0;
  stopDragLoop(state);
  updateFooter(state);
};

export const closeDiscardPileViewer = (event) => {
  if (!viewerState) return;
  if (event?.target) {
    const { overlay } = viewerState;
    if (overlay.contains(event.target) && event.target !== overlay) {
      return;
    }
  }

  const { overlay, onKeyDown, slides } = viewerState;
  document.removeEventListener('keydown', onKeyDown);
  stopDragLoop(viewerState);
  slides.forEach((slide) => {
    const wrapper = slideWrapper(slide);
    if (wrapper) stopHoloAnimation(wrapper);
  });
  overlay.remove();
  viewerState = null;
};

const isSwipeBlockedTarget = (target) =>
  target.closest('.discard-pile-nav, .discard-pile-close, button, a');

const attachSwipe = (state) => {
  const { stage, stack } = state;
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let dragging = false;

  const blockNativeDrag = (event) => {
    event.preventDefault();
  };

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    if (isSwipeBlockedTarget(event.target)) return;
    stopDragLoop(state);
    tracking = true;
    state.tracking = true;
    dragging = false;
    startX = event.clientX;
    startY = event.clientY;
    state.pointerId = event.pointerId;
    state.targetDragPx = 0;
    state.renderDragPx = 0;
    stage.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!tracking || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if (
      !dragging &&
      Math.abs(dx) >= SWIPE_LOCK_PX &&
      Math.abs(dx) > Math.abs(dy) * 1.1
    ) {
      dragging = true;
      stage.classList.add('is-dragging');
      stack.classList.add('is-dragging');
    }

    if (dragging) {
      event.preventDefault();
      state.targetDragPx = dx;
      startDragLoop(state);
    }
  };

  const endSwipe = (event) => {
    if (!tracking || state.pointerId !== event.pointerId) return;
    const wasDragging = dragging;
    tracking = false;
    state.tracking = false;
    dragging = false;
    stage.classList.remove('is-dragging');
    stack.classList.remove('is-dragging');

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    const horizontal =
      wasDragging &&
      Math.abs(dx) >= SWIPE_THRESHOLD &&
      Math.abs(dx) > Math.abs(dy);

    if (horizontal) {
      goToIndex(state, state.index + (dx > 0 ? 1 : -1));
    } else {
      state.targetDragPx = 0;
      stack.classList.add('is-dragging');
      stage.classList.add('is-dragging');
      startDragLoop(state);
    }

    state.pointerId = null;
    if (wasDragging) event.preventDefault();
    event.stopPropagation();
    try {
      stage.releasePointerCapture(event.pointerId);
    } catch {
      // capture may already be released
    }
  };

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', endSwipe);
  stage.addEventListener('pointercancel', endSwipe);
  stage.addEventListener('dragstart', blockNativeDrag, true);
  stack.addEventListener('dragstart', blockNativeDrag, true);
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
    stage,
    stack,
    slides,
    cards,
    index: initialIndex,
    targetDragPx: 0,
    renderDragPx: 0,
    animFrameId: null,
    tracking: false,
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
    event.stopPropagation();
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
