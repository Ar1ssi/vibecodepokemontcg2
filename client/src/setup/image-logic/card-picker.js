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
const SWIPE_THRESHOLD = 18;
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
  const progress = -dragPx / cardStepPx;
  return Math.max(0, Math.min(slideCount - 1, index + progress));
};

const resolveSwipeIndex = (state, dragPx) => {
  const stackWidth = state.stack?.clientWidth || 380;
  const peekPx = (getPeekPercent(state) / 100) * stackWidth;
  const virtual = computeVirtualIndex(
    state.index,
    dragPx,
    peekPx,
    state.slides.length
  );
  const progress = virtual - state.index;
  let next = Math.round(virtual);
  if (next === state.index && Math.abs(progress) >= 0.18) {
    next = state.index + Math.sign(progress);
  }
  if (next === state.index && Math.abs(dragPx) >= SWIPE_THRESHOLD) {
    next = state.index + (dragPx > 0 ? -1 : 1);
  }
  return clampIndex(next, state.slides.length - 1);
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
    const incoming = dragPx > 0 ? index - 1 : index + 1;
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

const isSlideOnScreen = (stackRect, stackWidth, peekOffset, peekPercent = PEEK_PERCENT) => {
  const peekPx = (peekPercent / 100) * stackWidth;
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

const CHOOSE_PEEK_PERCENT = PEEK_PERCENT;

const getPeekPercent = (state) =>
  state.mode === 'browse' ? PEEK_PERCENT : CHOOSE_PEEK_PERCENT;

const isCardSlotted = (state, card) =>
  state.mode !== 'browse' && state.slotAssignments?.includes(card);

const countAvailableAround = (state) => {
  const cards = state.cards ?? [];
  const index = clampIndex(state.index ?? 0, Math.max(0, cards.length - 1));
  let ahead = 0;
  let behind = 0;
  for (let i = index + 1; i < cards.length; i += 1) {
    if (!isCardSlotted(state, cards[i])) ahead += 1;
  }
  for (let i = index - 1; i >= 0; i -= 1) {
    if (!isCardSlotted(state, cards[i])) behind += 1;
  }
  return { ahead, behind, index };
};

const getChoosePeekCounts = (state) => {
  const { ahead, behind } = countAvailableAround(state);
  const total = ahead + behind + 1;
  if (total <= CHOOSE_PEEK_MAX + 1) {
    return { ahead, behind };
  }
  return {
    ahead: Math.min(ahead, CHOOSE_PEEK_MAX),
    behind: Math.min(behind, 1),
  };
};

const chooseStartIndex = (candidates, requestedIndex) => {
  const last = Math.max(0, candidates.length - 1);
  if (requestedIndex !== 0) return clampIndex(requestedIndex, last);
  if (candidates.length > 1 && candidates.length <= CHOOSE_PEEK_MAX + 1) {
    return Math.floor(last / 2);
  }
  return 0;
};

const focusNextAvailableCard = (state) => {
  if (state.mode === 'browse' || !state.slotAssignments?.length) return;
  if (!isCardSlotted(state, state.cards[state.index])) return;
  for (let step = 1; step < state.cards.length; step += 1) {
    const nextIdx = (state.index + step) % state.cards.length;
    if (!isCardSlotted(state, state.cards[nextIdx])) {
      state.index = nextIdx;
      state.targetDragPx = 0;
      state.renderDragPx = 0;
      return;
    }
  }
};

const updateSelectionUI = (state) => {
  if (state.multiSelect) {
    const { slides, slotAssignments } = state;
    state.selected.clear();
    slotAssignments.forEach((card) => {
      if (card) state.selected.add(card);
    });
    slides.forEach((slide, i) => {
      const card = state.cards[i];
      const badge = slide.querySelector('.card-picker-select-badge');
      const assignIdx = slotAssignments.indexOf(card);
      if (assignIdx >= 0) {
        slide.classList.add('is-selected');
        if (badge) {
          badge.hidden = false;
          badge.textContent = String(assignIdx + 1);
        }
      } else {
        slide.classList.remove('is-selected');
        if (badge) badge.hidden = true;
      }
    });
    if (state.doneBtn) {
      const count = slotAssignments.filter(Boolean).length;
      state.doneBtn.disabled = count < state.minCount || count > state.maxCount;
    }
  }
  renderSlotCards(state);
};

const CARD_ASPECT = 1.397;
const CHOOSE_TOP_GAP = 16;
const TRIGGER_NUDGE_PX = 10;
const CHOOSE_PEEK_MAX = 8;

const getPlaymatBounds = () => {
  if (document.body.classList.contains('side-menu-collapsed')) {
    return { left: 0, right: window.innerWidth, width: window.innerWidth };
  }
  const sidebox = [...document.querySelectorAll('.sidebox')].find(
    (el) => getComputedStyle(el).display !== 'none'
  );
  const sideboxLeft = sidebox?.getBoundingClientRect().left;
  const right = Number.isFinite(sideboxLeft)
    ? sideboxLeft
    : window.innerWidth * 0.76;
  return { left: 0, right, width: Math.max(0, right) };
};

const syncChooseLayout = (state) => {
  if (state.mode === 'browse' || !state.overlay) return;

  const hasTrigger = Boolean(state.triggerSlot?.childElementCount);
  const playmat = getPlaymatBounds();
  const vh = window.innerHeight;

  const reservedY = 320;
  const maxCardH = Math.max(180, vh - reservedY);
  const cardWFromH = maxCardH / CARD_ASPECT;
  const cardW = Math.min(playmat.width * 0.28, 220, cardWFromH);
  const cardH = cardW * CARD_ASPECT;

  const peeks = getChoosePeekCounts(state);
  const leftPeek = cardW * (PEEK_PERCENT / 100) * peeks.ahead;
  const rightPeek = cardW * (PEEK_PERCENT / 100) * peeks.behind;
  const carouselW = cardW + leftPeek + rightPeek;
  const triggerNudge = hasTrigger ? TRIGGER_NUDGE_PX : 0;
  const topRowW =
    carouselW + (hasTrigger ? CHOOSE_TOP_GAP + triggerNudge + cardW : 0);

  const playmatPad = 16;
  let cardGroupLeft = playmatPad;
  if (hasTrigger) {
    const desiredTriggerRight =
      playmat.left + playmat.width * 0.72 + TRIGGER_NUDGE_PX;
    cardGroupLeft = desiredTriggerRight - topRowW;
    const minLeft = playmatPad;
    const maxLeft = playmat.width - playmatPad - topRowW;
    cardGroupLeft = Math.max(minLeft, Math.min(cardGroupLeft, maxLeft));
  } else {
    cardGroupLeft = Math.max(playmatPad, (playmat.width - topRowW) / 2);
  }

  state.overlay.style.setProperty('--card-picker-card-w', `${Math.round(cardW)}px`);
  state.overlay.style.setProperty('--card-picker-card-h', `${Math.round(cardH)}px`);
  state.overlay.style.setProperty('--card-picker-carousel-w', `${Math.round(carouselW)}px`);
  state.overlay.style.setProperty('--card-picker-peek-left', `${Math.round(leftPeek)}px`);
  state.overlay.style.setProperty('--card-picker-peek-right', `${Math.round(rightPeek)}px`);
  state.overlay.style.setProperty('--card-picker-top-gap', `${CHOOSE_TOP_GAP}px`);
  state.overlay.style.setProperty(
    '--card-picker-trigger-nudge',
    `${triggerNudge}px`
  );
  state.overlay.style.setProperty('--card-picker-playmat-w', `${Math.round(playmat.width)}px`);
  state.overlay.style.setProperty('--card-picker-playmat-right', `${Math.round(window.innerWidth - playmat.right)}px`);

  if (state.cardsZone) {
    state.cardsZone.style.width = `${Math.round(topRowW)}px`;
    state.cardsZone.style.marginLeft = `${Math.round(cardGroupLeft)}px`;
    state.cardsZone.style.marginRight = '0';
    state.cardsZone.style.transform = '';
    state.cardsZone.style.alignSelf = 'flex-start';
  }

  state.scene?.classList.toggle('has-trigger', hasTrigger);
  state.topRow?.classList.toggle('has-trigger', hasTrigger);
  state.cardsZone?.classList.toggle('has-trigger', hasTrigger);
  state.main?.classList.toggle('has-trigger', hasTrigger);
};

const syncDropSlotLayout = (state) => {
  if (!state.slotElements?.length || !state.stack) return;
  syncChooseLayout(state);
  const slotCount = state.slotElements.length;
  const gap = 6;
  const minSlotW = 52;
  const playmat = getPlaymatBounds();
  const maxRowW = Math.min(playmat.width * 0.88, 720);
  const preferredW = Math.max(
    minSlotW,
    Math.round((state.stack.clientWidth || 160) * 0.58)
  );
  let slotW = preferredW;
  const totalNeeded = slotCount * slotW + (slotCount - 1) * gap;
  if (totalNeeded > maxRowW) {
    slotW = Math.max(
      minSlotW,
      Math.floor((maxRowW - (slotCount - 1) * gap) / slotCount)
    );
  }
  const slotH = Math.round(slotW * 1.397);
  state.slotRow?.style.setProperty('--card-picker-slot-w', `${slotW}px`);
  state.slotRow?.style.setProperty('--card-picker-slot-h', `${slotH}px`);
  state.slotRow?.style.setProperty('--card-picker-slot-gap', `${gap}px`);
  for (const slot of state.slotElements) {
    slot.style.width = `${slotW}px`;
    slot.style.height = `${slotH}px`;
  }
};

const renderSlotCards = (state) => {
  if (!state.slotElements?.length) return;
  syncDropSlotLayout(state);
  state.slotElements.forEach((slotEl, i) => {
    slotEl.replaceChildren();
    const card = state.slotAssignments[i];
    slotEl.classList.toggle('has-card', Boolean(card));
    slotEl.classList.toggle('is-empty', !card);
    if (card) {
      const inner = document.createElement('div');
      inner.className = 'card-picker-slot-card-inner';
      const img = document.createElement('img');
      img.src =
        card?.image?.src ||
        (typeof card?.image === 'string' ? card.image : '') ||
        '';
      img.alt = card?.name ?? '';
      img.draggable = false;
      inner.appendChild(img);
      slotEl.appendChild(inner);
    }
  });
};

const findDropSlotAt = (state, x, y) => {
  if (!state.slotElements?.length) return -1;
  for (let i = 0; i < state.slotElements.length; i += 1) {
    const rect = state.slotElements[i].getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return i;
    }
  }
  return -1;
};

const assignCardToSlot = (state, card, slotIndex) => {
  if (!card || !state.slotAssignments?.length) return;
  for (let i = 0; i < state.slotAssignments.length; i += 1) {
    if (state.slotAssignments[i] === card) state.slotAssignments[i] = null;
  }
  let target = slotIndex;
  if (target < 0) {
    target = state.slotAssignments.findIndex((entry) => entry == null);
  }
  if (target < 0 || target >= state.slotAssignments.length) return;
  state.slotAssignments[target] = card;
  if (!state.multiSelect) state.slotCard = card;
  updateSelectionUI(state);
  focusNextAvailableCard(state);
  layoutStack(state);
};

const addFocusedCardToSlot = (state, slotIndex = -1) => {
  const card = state.cards[state.index];
  if (!card) return;
  const existingIdx = state.slotAssignments.indexOf(card);
  if (existingIdx >= 0 && (slotIndex < 0 || slotIndex === existingIdx)) {
    state.slotAssignments[existingIdx] = null;
    if (!state.multiSelect) state.slotCard = null;
    updateSelectionUI(state);
    layoutStack(state);
    return;
  }
  assignCardToSlot(state, card, slotIndex);
};

const layoutStack = (state) => {
  const { slides, stack, index, renderDragPx, multiSelect } = state;
  const stackWidth = stack.clientWidth || 380;
  const stackRect = stack.getBoundingClientRect();
  const peekPercent = getPeekPercent(state);
  const peekPx = (peekPercent / 100) * stackWidth;
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
      'is-focused',
      'is-in-slot',
      'is-dragging-to-slot'
    );

    if (
      state.mode !== 'browse' &&
      (isCardSlotted(state, card) || state.draggingToSlotIndex === i)
    ) {
      slide.classList.add('is-in-slot', 'is-hidden');
      if (state.draggingToSlotIndex === i) {
        slide.classList.add('is-dragging-to-slot');
      }
      return;
    }

    slide.classList.add(`is-${layout.role}`);
    if (layout.role === 'active') slide.classList.add('is-focused');
    if (multiSelect && state.slotAssignments.includes(card)) {
      slide.classList.add('is-selected');
    }

    slide.style.zIndex = String(
      computeSlideZIndex(i, virtualIndex, index, renderDragPx)
    );

    const scale = 1 - absPeek * 0.035;
    slide.style.transform = `translate3d(${layout.peekOffset * peekPercent}%, 0, 0) scale(${scale})`;
    slide.style.opacity = '1';

    if (!isSlideOnScreen(stackRect, stackWidth, layout.peekOffset, peekPercent)) {
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
  const len = state.slides.length;
  if (!len) return;
  let idx = clampIndex(nextIndex, len - 1);
  if (state.mode !== 'browse' && state.slotAssignments?.length) {
    const dir = nextIndex >= state.index ? 1 : -1;
    for (let step = 0; step < len; step += 1) {
      if (!isCardSlotted(state, state.cards[idx])) break;
      idx = clampIndex(idx + dir, len - 1);
    }
  }
  state.index = idx;
  state.targetDragPx = 0;
  state.renderDragPx = 0;
  stopDragLoop(state);
  if (state.mode !== 'browse') syncChooseLayout(state);
  layoutStack(state);
};

const teardownPicker = (state) => {
  document.removeEventListener('keydown', state.onKeyDown);
  if (state.onResize) {
    window.removeEventListener('resize', state.onResize);
  }
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
  const existingIdx = state.slotAssignments.indexOf(card);
  if (existingIdx >= 0) {
    state.slotAssignments[existingIdx] = null;
  } else {
    const emptyIdx = state.slotAssignments.findIndex((entry) => entry == null);
    if (emptyIdx >= 0) state.slotAssignments[emptyIdx] = card;
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
    picks = state.slotAssignments.filter(Boolean);
    if (picks.length < state.minCount || picks.length > state.maxCount) return;
  } else {
    picks = [state.slotAssignments[0] ?? state.slotCard ?? cards[index]];
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
  state.slotAssignments.fill(null);

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
      if (state.slotElements?.length) renderSlotCards(state);
    }
  });
};

const isSwipeBlockedTarget = (target) =>
  target.closest(
    '.discard-pile-nav, .card-picker-done, .card-picker-cancel, .card-picker-filter, .card-picker-drop-slot, .card-picker-slot-row, .card-picker-bottom-bar, button, a'
  );

const attachSwipe = (state) => {
  const { stage, stack } = state;
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let dragging = false;
  let gesture = 'pending';
  let ghost = null;
  let activePointerId = null;

  const blockNativeDrag = (event) => event.preventDefault();

  const cleanupGhost = () => {
    ghost?.remove();
    ghost = null;
  };

  const clearSlotHighlights = () => {
    state.slotElements?.forEach((slot) => slot.classList.remove('is-drop-target'));
  };

  const unbindCardDrag = () => {
    document.removeEventListener('pointermove', onDocPointerMove, true);
    document.removeEventListener('pointerup', onDocPointerEnd, true);
    document.removeEventListener('pointercancel', onDocPointerEnd, true);
    clearSlotHighlights();
  };

  const onDocPointerMove = (event) => {
    if (activePointerId !== event.pointerId) return;
    event.preventDefault();
    if (ghost) {
      ghost.style.left = `${event.clientX}px`;
      ghost.style.top = `${event.clientY}px`;
    }
    clearSlotHighlights();
    const slotIdx = findDropSlotAt(state, event.clientX, event.clientY);
    if (slotIdx >= 0) state.slotElements[slotIdx]?.classList.add('is-drop-target');
  };

  const onDocPointerEnd = (event) => {
    if (activePointerId !== event.pointerId) return;
    const slotIdx = findDropSlotAt(state, event.clientX, event.clientY);
    state.draggingToSlotIndex = null;
    if (slotIdx >= 0) addFocusedCardToSlot(state, slotIdx);
    else layoutStack(state);
    cleanupGhost();
    unbindCardDrag();
    tracking = false;
    state.tracking = false;
    activePointerId = null;
    gesture = 'pending';
    event.preventDefault();
    event.stopPropagation();
  };

  const beginCardDrag = (event, cardNode) => {
    gesture = 'cardDrag';
    dragging = false;
    activePointerId = event.pointerId;
    tracking = false;
    state.tracking = false;
    state.pointerId = null;
    state.draggingToSlotIndex = state.index;
    stopDragLoop(state);
    state.targetDragPx = 0;
    state.renderDragPx = 0;
    layoutStack(state);
    stage.classList.remove('is-dragging');
    stack.classList.remove('is-dragging');
    const rect = cardNode.getBoundingClientRect();
    ghost = cardNode.cloneNode(true);
    ghost.classList.add('card-picker-drag-ghost');
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.left = `${event.clientX}px`;
    ghost.style.top = `${event.clientY}px`;
    document.body.appendChild(ghost);
    try {
      stage.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
    document.addEventListener('pointermove', onDocPointerMove, true);
    document.addEventListener('pointerup', onDocPointerEnd, true);
    document.addEventListener('pointercancel', onDocPointerEnd, true);
  };

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    if (isSwipeBlockedTarget(event.target)) return;
    if (activePointerId != null) return;
    stopDragLoop(state);
    tracking = true;
    state.tracking = true;
    dragging = false;
    gesture = 'pending';
    startX = event.clientX;
    startY = event.clientY;
    state.pointerId = event.pointerId;
    stage.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!tracking || state.pointerId !== event.pointerId || gesture === 'cardDrag') {
      return;
    }
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if (gesture === 'pending' && Math.hypot(dx, dy) >= SWIPE_LOCK_PX) {
      if (
        state.mode !== 'browse' &&
        state.slotElements?.length &&
        Math.abs(dy) >= 16 &&
        Math.abs(dy) > Math.abs(dx) * 1.1
      ) {
        const slide = state.slides[state.index];
        const cardNode =
          slide?.querySelector('.discard-pile-card, .mat-holo') ?? slide;
        if (cardNode) beginCardDrag(event, cardNode);
        return;
      }
      if (Math.abs(dx) > Math.abs(dy) * 1.15) {
        gesture = 'swipe';
      }
    }

    if (
      gesture !== 'cardDrag' &&
      !dragging &&
      Math.abs(dx) >= SWIPE_LOCK_PX &&
      Math.abs(dx) > Math.abs(dy) * 1.15
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
    if (!tracking || state.pointerId !== event.pointerId || gesture === 'cardDrag') {
      return;
    }
    const wasDragging = dragging;
    tracking = false;
    state.tracking = false;
    dragging = false;
    gesture = 'pending';
    stage.classList.remove('is-dragging');
    stack.classList.remove('is-dragging');

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (wasDragging && Math.abs(dx) >= SWIPE_LOCK_PX) {
      goToIndex(state, resolveSwipeIndex(state, dx));
    } else if (!wasDragging && state.mode !== 'browse') {
      const slotIdx = findDropSlotAt(state, event.clientX, event.clientY);
      if (slotIdx >= 0) addFocusedCardToSlot(state, slotIdx);
    } else if (wasDragging) {
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

  let prevBtn = null;
  let nextBtn = null;
  if (isBrowse) {
    prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'discard-pile-nav discard-pile-nav--prev';
    prevBtn.setAttribute('aria-label', 'Previous card');
    prevBtn.textContent = '‹';

    nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'discard-pile-nav discard-pile-nav--next';
    nextBtn.setAttribute('aria-label', 'Next card');
    nextBtn.textContent = '›';

    stage.append(stack, nextBtn);
    if (candidates.length > 1) stage.appendChild(prevBtn);
  } else {
    stage.appendChild(stack);
  }

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
  let scene = null;
  let carouselWrap = null;
  let triggerSlot = null;
  let slotRow = null;
  let slotElements = [];
  let bottomBar = null;
  let actionBar = null;
  let meta = null;
  let topRow = null;
  let cardsZone = null;

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

    scene = document.createElement('div');
    scene.className = 'card-picker-scene';

    topRow = document.createElement('div');
    topRow.className = 'card-picker-top-row';

    carouselWrap = document.createElement('div');
    carouselWrap.className = 'card-picker-carousel-wrap';
    carouselWrap.appendChild(stage);

    triggerSlot = document.createElement('div');
    triggerSlot.className = 'card-picker-trigger-slot';

    topRow.append(carouselWrap, triggerSlot);

    meta = document.createElement('div');
    meta.className = 'card-picker-meta card-picker-meta--choose';
    meta.append(countEl, nameEl);

    cardsZone = document.createElement('div');
    cardsZone.className = 'card-picker-cards-zone';
    cardsZone.append(topRow, meta);
    scene.appendChild(cardsZone);

    slotRow = document.createElement('div');
    slotRow.className = 'card-picker-slot-row';
    slotElements = [];
    for (let i = 0; i < maxSel; i += 1) {
      const slot = document.createElement('div');
      slot.className = 'card-picker-drop-slot is-empty';
      slot.dataset.slotIndex = String(i);
      slotRow.appendChild(slot);
      slotElements.push(slot);
    }
    scene.appendChild(slotRow);

    main.appendChild(scene);

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
    index: isBrowse
      ? clampIndex(initialIndex, candidates.length - 1)
      : chooseStartIndex(candidates, initialIndex),
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
    slotAssignments: Array(maxSel).fill(null),
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
    scene,
    carouselWrap,
    triggerSlot,
    cardsZone,
    slotRow,
    slotElements,
    slotCard: null,
    draggingToSlotIndex: null,
    topRow: topRow,
    main,
    onResize: null,
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

  if (!isBrowse) {
    syncChooseLayout(state);
    state.onResize = () => syncChooseLayout(state);
    window.addEventListener('resize', state.onResize);
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

  if (prevBtn && nextBtn) {
    prevBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      goToIndex(state, state.index - 1);
    });
    nextBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      goToIndex(state, state.index + 1);
    });
  }

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
  if (!isBrowse) renderSlotCards(state);
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
