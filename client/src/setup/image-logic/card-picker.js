import { getZone } from '../zones/get-zone.js';
import {
  buildHoloCard,
  resolveHoloEffect,
  startHoloAnimation,
  stopHoloAnimation,
} from '../deck-builder/core/holo.mjs';
import { ensureCardData } from '../rules/rules-state.mjs';
import { closeCardPreview } from './full-view.js';

/** @type {object | null} */
let pickerState = null;

const PEEK_PERCENT = 24;
const SWIPE_THRESHOLD = 44;
const SWIPE_LOCK_PX = 10;
const SCREEN_EDGE_MARGIN = 32;
const DRAG_CARD_SCALE = 1.65;
const DRAG_LERP = 0.12;
const Z_HANDOFF_START = 0.68;
const Z_HANDOFF_MAX = 6;

const smoothstep = (t) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

export const isCardPickerOpen = () => pickerState != null;

const clampIndex = (index, max) => Math.max(0, Math.min(index, max));

const slideWrapper = (slide) =>
  slide.holoWrapper ?? slide.querySelector('.mat-holo');

const disableNativeDrag = (node) => {
  if (!node) return;
  if (node instanceof HTMLImageElement) node.draggable = false;
  node.querySelectorAll?.('img').forEach((img) => {
    img.draggable = false;
  });
};

const buildSlideContent = async (card) => {
  const src =
    card?.image?.src ||
    (typeof card?.image === 'string' ? card.image : '') ||
    card?.images?.small ||
    '';
  const existingRarity = card?.wrapper?.dataset?.rarity;
  if (existingRarity && src) {
    const wrapper = buildHoloCard(src, existingRarity);
    wrapper.classList.add('mat-holo', 'discard-pile-holo');
    disableNativeDrag(wrapper);
    return { node: wrapper, holoWrapper: wrapper };
  }

  const data = await ensureCardData({
    name: card?.name,
    type: card?.type,
    number: card?.number,
    set: card?.set,
    id: card?.id,
  });
  const effect = resolveHoloEffect(data);
  if (effect && src) {
    const wrapper = buildHoloCard(src, effect);
    wrapper.classList.add('mat-holo', 'discard-pile-holo');
    disableNativeDrag(wrapper);
    return { node: wrapper, holoWrapper: wrapper };
  }

  const img = document.createElement('img');
  img.src = src;
  img.alt = card?.name ?? '';
  img.className = 'discard-pile-card';
  img.draggable = false;
  return { node: img, holoWrapper: null };
};

const computeVirtualIndex = (index, dragPx, peekPx, slideCount) => {
  const cardStepPx = peekPx * DRAG_CARD_SCALE;
  const progress = dragPx / cardStepPx;
  return Math.max(0, Math.min(slideCount - 1, index + progress));
};

const computeSlideLayout = (slideIndex, virtualIndex) => {
  const peekOffset = virtualIndex - slideIndex;
  const absPeek = Math.abs(peekOffset);
  return {
    peekOffset,
    role: absPeek < 0.05 ? 'active' : peekOffset < 0 ? 'ahead' : 'behind',
  };
};

const computeSlideZIndex = (slideIndex, virtualIndex, index, dragPx) => {
  const dist = Math.abs(slideIndex - virtualIndex);
  let z = 300 - dist * 10;

  if (dragPx !== 0) {
    const progress = virtualIndex - index;
    const absProgress = Math.abs(progress);
    const incoming = dragPx > 0 ? index + 1 : index - 1;
    const handoffSpan = 1 - Z_HANDOFF_START;
    const t =
      handoffSpan > 0
        ? Math.max(0, Math.min(1, (absProgress - Z_HANDOFF_START) / handoffSpan))
        : 0;
    const handoff = smoothstep(t) * Z_HANDOFF_MAX;

    if (slideIndex === index) {
      z -= handoff;
      if (t < 0.05) z += 1;
    } else if (slideIndex === incoming) {
      z += handoff;
      if (t < 0.05) z -= 1;
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
    if (!pickerState || pickerState !== state) {
      stopDragLoop(state);
      return;
    }

    const delta = state.targetDragPx - state.renderDragPx;
    if (!state.tracking && Math.abs(delta) < 0.2) {
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

const updateSelectionUI = (state) => {
  if (!state.multiSelect) return;
  const { slides, selected } = state;
  const ordered = Array.from(selected);
  slides.forEach((slide, i) => {
    const card = state.cards[i];
    const badge = slide.querySelector('.card-picker-select-badge');
    if (selected.has(card)) {
      slide.classList.add('is-selected');
      if (badge) {
        badge.hidden = false;
        badge.textContent = String(ordered.indexOf(card) + 1);
      }
    } else {
      slide.classList.remove('is-selected');
      if (badge) badge.hidden = true;
    }
  });
  if (state.doneBtn) {
    const count = selected.size;
    state.doneBtn.disabled = count < state.minCount || count > state.maxCount;
  }
  renderSlotCards(state);
};

const renderSlotCards = (state) => {
  if (!state.slotStack) return;
  state.slotStack.replaceChildren();
  const cardsInSlot = state.multiSelect
    ? Array.from(state.selected)
    : state.slotCard
      ? [state.slotCard]
      : [];
  for (const card of cardsInSlot) {
    const wrap = document.createElement('div');
    wrap.className = 'card-picker-slot-card';
    const img = document.createElement('img');
    img.src =
      card?.image?.src ||
      (typeof card?.image === 'string' ? card.image : '') ||
      '';
    img.alt = card?.name ?? '';
    img.draggable = false;
    wrap.appendChild(img);
    state.slotStack.appendChild(wrap);
  }
  state.dropSlot?.classList.toggle('has-cards', cardsInSlot.length > 0);
};

const isPointInDropSlot = (state, x, y) => {
  if (!state.dropSlot) return false;
  const rect = state.dropSlot.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
};

const addFocusedCardToSlot = (state) => {
  const card = state.cards[state.index];
  if (!card) return;
  if (state.multiSelect) {
    if (state.selected.has(card)) state.selected.delete(card);
    else if (state.selected.size < state.maxCount) state.selected.add(card);
    updateSelectionUI(state);
    layoutStack(state);
    return;
  }
  state.slotCard = card;
  renderSlotCards(state);
};

const layoutStack = (state) => {
  const { slides, stack, index, renderDragPx, multiSelect } = state;
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
    const card = state.cards[i];

    slide.classList.remove(
      'is-active',
      'is-ahead',
      'is-behind',
      'is-hidden',
      'is-focused'
    );
    slide.classList.add(`is-${layout.role}`);
    if (layout.role === 'active') slide.classList.add('is-focused');
    if (multiSelect && state.selected.has(card)) {
      slide.classList.add('is-selected');
    }

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
  updateFooter(state);
};

const updateFooter = (state) => {
  const card = state.cards[state.index];
  if (state.countEl) {
    state.countEl.textContent = `${state.index + 1} / ${state.cards.length}`;
  }
  if (state.nameEl) {
    state.nameEl.textContent = card?.name ?? '';
  }
  if (state.mode !== 'browse' && state.instructionEl) {
    state.instructionEl.textContent = state.title;
  }
};

const goToIndex = (state, nextIndex) => {
  state.index = clampIndex(nextIndex, state.slides.length - 1);
  state.targetDragPx = 0;
  state.renderDragPx = 0;
  stopDragLoop(state);
  layoutStack(state);
};

const teardownPicker = (state) => {
  document.removeEventListener('keydown', state.onKeyDown);
  stopDragLoop(state);
  state.slides.forEach((slide) => {
    const wrapper = slideWrapper(slide);
    if (wrapper) stopHoloAnimation(wrapper);
  });
  const triggerWrapper = state.triggerHoloWrapper;
  if (triggerWrapper) stopHoloAnimation(triggerWrapper);
  state.overlay.remove();
  pickerState = null;
};

export const closeCardPicker = (event) => {
  if (!pickerState) return;
  if (event?.target) {
    const { overlay } = pickerState;
    if (overlay.contains(event.target) && event.target !== overlay) return;
  }
  teardownPicker(pickerState);
};

const toggleSelection = (state) => {
  if (!state.multiSelect) return;
  const card = state.cards[state.index];
  if (state.selected.has(card)) {
    state.selected.delete(card);
  } else if (state.selected.size < state.maxCount) {
    state.selected.add(card);
  }
  updateSelectionUI(state);
  layoutStack(state);
};

const confirmPicker = async (state) => {
  const {
    mode,
    multiSelect,
    selected,
    cards,
    index,
    pickOnly,
    zoneFrom,
    destination,
    user,
    onPick,
    onConfirm,
  } = state;

  if (mode === 'browse') {
    closeCardPicker();
    return;
  }

  let picks;
  if (multiSelect) {
    picks = Array.from(selected);
    if (picks.length < state.minCount || picks.length > state.maxCount) return;
  } else {
    picks = [state.slotCard ?? cards[index]];
  }

  if (!pickOnly && zoneFrom && destination) {
    const { moveCardBundle } = await import(
      '../../actions/move-card-bundle/move-card-bundle.js'
    );
    for (const cand of picks) {
      try {
        const z = getZone(user, zoneFrom);
        const idx = z.array.indexOf(cand);
        if (idx >= 0) {
          moveCardBundle(user, user, zoneFrom, destination, idx, false, 'move');
        }
      } catch {
        // move failed — still invoke callbacks
      }
    }
  }

  if (multiSelect) onConfirm?.(picks);
  else onPick?.(picks[0]);

  teardownPicker(state);
};

const cancelPicker = (state) => {
  state.onCancel?.();
  teardownPicker(state);
};

const setCandidateList = (state, candidates) => {
  state.cards = candidates;
  state.index = clampIndex(state.index, Math.max(0, candidates.length - 1));
  state.stack.innerHTML = '';
  state.slides = [];
  state.selected.clear();

  if (!candidates.length) return;

  candidates.forEach((card, i) => {
    const slide = document.createElement('div');
    slide.className = 'discard-pile-slide card-picker-slide';
    slide.dataset.index = String(i);

    const badge = document.createElement('span');
    badge.className = 'card-picker-select-badge';
    badge.hidden = true;
    slide.appendChild(badge);

    state.stack.appendChild(slide);
    state.slides.push(slide);
  });

  Promise.all(
    candidates.map(async (card, i) => {
      const { node, holoWrapper } = await buildSlideContent(card);
      const slide = state.slides[i];
      slide.appendChild(node);
      if (holoWrapper) slide.holoWrapper = holoWrapper;
    })
  ).then(() => {
    if (pickerState === state) {
      goToIndex(state, clampIndex(state.index, candidates.length - 1));
    }
  });
};

const isSwipeBlockedTarget = (target) =>
  target.closest(
    '.discard-pile-nav, .card-picker-done, .card-picker-cancel, .card-picker-filter, .card-picker-drop-slot, .card-picker-bottom-bar, button, a'
  );

const attachSwipe = (state) => {
  const { stage, stack } = state;
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let dragging = false;
  let gesture = 'pending';
  let ghost = null;

  const blockNativeDrag = (event) => event.preventDefault();

  const cleanupGhost = () => {
    ghost?.remove();
    ghost = null;
  };

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    if (isSwipeBlockedTarget(event.target)) return;
    stopDragLoop(state);
    tracking = true;
    state.tracking = true;
    dragging = false;
    gesture = 'pending';
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

    if (gesture === 'pending' && Math.hypot(dx, dy) >= SWIPE_LOCK_PX) {
      if (
        state.mode !== 'browse' &&
        state.dropSlot &&
        Math.abs(dy) >= Math.abs(dx) * 0.85
      ) {
        gesture = 'cardDrag';
        const slide = state.slides[state.index];
        const cardNode =
          slide?.querySelector('.discard-pile-card, .mat-holo') ?? slide;
        if (cardNode) {
          const rect = cardNode.getBoundingClientRect();
          ghost = cardNode.cloneNode(true);
          ghost.classList.add('card-picker-drag-ghost');
          ghost.style.width = `${rect.width}px`;
          ghost.style.height = `${rect.height}px`;
          document.body.appendChild(ghost);
        }
      } else if (Math.abs(dx) > Math.abs(dy) * 1.1) {
        gesture = 'swipe';
      }
    }

    if (gesture === 'cardDrag') {
      event.preventDefault();
      if (ghost) {
        ghost.style.left = `${event.clientX}px`;
        ghost.style.top = `${event.clientY}px`;
      }
      return;
    }

    if (
      gesture !== 'cardDrag' &&
      !dragging &&
      Math.abs(dx) >= SWIPE_LOCK_PX &&
      Math.abs(dx) > Math.abs(dy) * 1.1
    ) {
      gesture = 'swipe';
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
    const wasCardDrag = gesture === 'cardDrag';
    tracking = false;
    state.tracking = false;
    dragging = false;
    gesture = 'pending';
    stage.classList.remove('is-dragging');
    stack.classList.remove('is-dragging');

    if (wasCardDrag) {
      if (isPointInDropSlot(state, event.clientX, event.clientY)) {
        addFocusedCardToSlot(state);
      }
      cleanupGhost();
    } else {
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const horizontal =
        wasDragging &&
        Math.abs(dx) >= SWIPE_THRESHOLD &&
        Math.abs(dx) > Math.abs(dy);

      if (horizontal) {
        goToIndex(state, state.index + (dx > 0 ? 1 : -1));
      } else if (!wasDragging && state.mode !== 'browse') {
        if (isPointInDropSlot(state, event.clientX, event.clientY)) {
          addFocusedCardToSlot(state);
        }
      } else {
        state.targetDragPx = 0;
        stack.classList.add('is-dragging');
        stage.classList.add('is-dragging');
        startDragLoop(state);
      }
    }

    state.pointerId = null;
    if (wasDragging || wasCardDrag) event.preventDefault();
    event.stopPropagation();
    try {
      stage.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
  };

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', endSwipe);
  stage.addEventListener('pointercancel', endSwipe);
  stage.addEventListener('dragstart', blockNativeDrag, true);
  stack.addEventListener('dragstart', blockNativeDrag, true);
};

/**
 * Unified PTCG Live-style card picker / carousel viewer.
 */
export const openCardPicker = async ({
  title = 'Choose a card',
  candidates = [],
  allCandidates = null,
  triggerCard = null,
  mode = 'single',
  multiSelect = false,
  minCount = 1,
  maxCount = 1,
  requiredCount = 1,
  upTo = false,
  initialIndex = 0,
  pickOnly = false,
  zoneFrom = null,
  destination = null,
  user = 'self',
  onPick,
  onConfirm,
  onCancel,
}) => {
  closeCardPreview(null, true);
  closeCardPicker();
  document.getElementById('rulesChoicePicker')?.remove();

  if (!candidates.length) {
    onCancel?.();
    return;
  }

  const isBrowse = mode === 'browse';
  const isMulti = multiSelect || mode === 'multi';
  const minSel = upTo ? 0 : (minCount ?? (isMulti ? requiredCount : 1));
  const maxSel = Math.min(maxCount ?? requiredCount, candidates.length);

  if (isMulti && !upTo && minSel > candidates.length) {
    onCancel?.();
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'card-picker-overlay discard-pile-overlay';
  overlay.id = 'cardPickerOverlay';
  if (isBrowse) overlay.classList.add('card-picker-browse');
  else overlay.classList.add('card-picker-choose');

  const filters = document.createElement('div');
  filters.className = 'card-picker-filters';
  if (allCandidates && allCandidates.length > candidates.length) {
    const validBtn = document.createElement('button');
    validBtn.type = 'button';
    validBtn.className = 'card-picker-filter is-active';
    validBtn.textContent = `VALID ${candidates.length}`;
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'card-picker-filter';
    allBtn.textContent = `ALL ${allCandidates.length}`;
    filters.append(validBtn, allBtn);
  }

  const stage = document.createElement('div');
  stage.className = 'discard-pile-stage card-picker-stage';

  const stack = document.createElement('div');
  stack.className = 'discard-pile-stack card-picker-stack';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'discard-pile-nav discard-pile-nav--prev';
  prevBtn.setAttribute('aria-label', 'Previous card');
  prevBtn.textContent = '‹';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'discard-pile-nav discard-pile-nav--next';
  nextBtn.setAttribute('aria-label', 'Next card');
  nextBtn.textContent = '›';

  stage.append(stack, nextBtn);
  if (candidates.length > 1) stage.appendChild(prevBtn);

  const instructionEl = document.createElement('div');
  instructionEl.className = 'card-picker-instruction';
  instructionEl.textContent = title;

  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className = 'card-picker-done';
  doneBtn.textContent = isBrowse ? 'Close' : 'Done';

  const countEl = document.createElement('span');
  countEl.className = 'discard-pile-count';
  const nameEl = document.createElement('span');
  nameEl.className = 'discard-pile-name';

  let main = null;
  let triggerSlot = null;
  let dropSlot = null;
  let slotStack = null;
  let bottomBar = null;
  let actionBar = null;
  let meta = null;

  if (isBrowse) {
    main = document.createElement('div');
    main.className = 'card-picker-main card-picker-main--browse';
    main.appendChild(stage);

    meta = document.createElement('div');
    meta.className = 'discard-pile-footer card-picker-meta';
    meta.append(countEl, nameEl);

    actionBar = document.createElement('div');
    actionBar.className = 'card-picker-action-bar';
    actionBar.append(instructionEl, doneBtn);

    overlay.append(filters, main, meta, actionBar);
  } else {
    main = document.createElement('div');
    main.className = 'card-picker-workspace';

    const scene = document.createElement('div');
    scene.className = 'card-picker-scene';

    const carouselCol = document.createElement('div');
    carouselCol.className = 'card-picker-carousel-col';
    carouselCol.appendChild(stage);

    dropSlot = document.createElement('div');
    dropSlot.className = 'card-picker-drop-slot';
    slotStack = document.createElement('div');
    slotStack.className = 'card-picker-slot-stack';
    dropSlot.appendChild(slotStack);

    triggerSlot = document.createElement('div');
    triggerSlot.className = 'card-picker-trigger-slot';

    scene.append(carouselCol, dropSlot, triggerSlot);
    main.appendChild(scene);

    meta = document.createElement('div');
    meta.className = 'card-picker-meta card-picker-meta--choose';
    meta.append(countEl, nameEl);
    main.appendChild(meta);

    bottomBar = document.createElement('div');
    bottomBar.className = 'card-picker-bottom-bar';
    bottomBar.append(instructionEl, doneBtn);

    overlay.append(filters, main, bottomBar);
  }

  document.body.appendChild(overlay);

  const state = {
    overlay,
    stage,
    stack,
    slides: [],
    cards: candidates,
    index: clampIndex(initialIndex, candidates.length - 1),
    targetDragPx: 0,
    renderDragPx: 0,
    animFrameId: null,
    tracking: false,
    pointerId: null,
    countEl,
    nameEl,
    instructionEl,
    doneBtn,
    title,
    mode,
    multiSelect: isMulti,
    selected: new Set(),
    minCount: minSel,
    maxCount: maxSel,
    pickOnly,
    zoneFrom,
    destination,
    user,
    onPick,
    onConfirm,
    onCancel,
    triggerHoloWrapper: null,
    triggerSlot,
    dropSlot,
    slotStack,
    slotCard: null,
    onKeyDown: null,
    allCandidates,
    filteredCandidates: candidates,
    filterValidBtn: filters.querySelector('.card-picker-filter.is-active'),
    filterAllBtn: filters.querySelector('.card-picker-filter:not(.is-active)'),
  };

  pickerState = state;

  if (triggerCard) {
    const { node, holoWrapper } = await buildSlideContent(triggerCard);
    node.classList.add('card-picker-trigger-card');
    triggerSlot.appendChild(node);
    if (holoWrapper) {
      holoWrapper.classList.add('card-picker-trigger-holo');
      state.triggerHoloWrapper = holoWrapper;
      startHoloAnimation(holoWrapper, { auto: true, phaseOffset: 0.15 });
    }
  }

  state.onKeyDown = (event) => {
    if (!pickerState) return;
    if (event.key === 'Escape') {
      if (isBrowse) closeCardPicker();
      else cancelPicker(state);
    } else if (event.key === 'Enter' && !isBrowse) {
      confirmPicker(state);
    } else if (event.key === ' ' && isMulti) {
      event.preventDefault();
      toggleSelection(state);
    } else if (event.key === 'ArrowLeft') {
      goToIndex(state, state.index - 1);
    } else if (event.key === 'ArrowRight') {
      goToIndex(state, state.index + 1);
    }
  };

  doneBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (isBrowse) closeCardPicker();
    else confirmPicker(state);
  });

  if (state.filterValidBtn && state.filterAllBtn) {
    state.filterValidBtn.addEventListener('click', () => {
      state.filterValidBtn.classList.add('is-active');
      state.filterAllBtn.classList.remove('is-active');
      setCandidateList(state, state.filteredCandidates);
    });
    state.filterAllBtn.addEventListener('click', () => {
      state.filterAllBtn.classList.add('is-active');
      state.filterValidBtn.classList.remove('is-active');
      setCandidateList(state, state.allCandidates);
    });
  }

  prevBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    goToIndex(state, state.index - 1);
  });
  nextBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    goToIndex(state, state.index + 1);
  });

  overlay.addEventListener('click', (event) => {
    event.stopPropagation();
    if (event.target === overlay) {
      if (isBrowse) closeCardPicker();
      else cancelPicker(state);
    }
  });

  document.addEventListener('keydown', state.onKeyDown);
  attachSwipe(state);

  if (isMulti && upTo) doneBtn.disabled = false;

  setCandidateList(state, candidates);
};

/** Browse-only wrapper (discard pile viewer). */
export const openCarouselViewer = async ({
  title = 'Discard Pile',
  candidates,
  initialIndex = 0,
}) => {
  await openCardPicker({
    title,
    candidates,
    mode: 'browse',
    initialIndex,
    minCount: 0,
    maxCount: 0,
  });
};

export const isCarouselViewerOpen = isCardPickerOpen;
export const closeCarouselViewer = closeCardPicker;
