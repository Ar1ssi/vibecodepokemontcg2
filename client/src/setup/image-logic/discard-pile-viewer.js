import { getZone } from '../zones/get-zone.js';
import { stopHoloAnimation } from '../deck-builder/core/holo.mjs';
import { closeCardPreview } from './full-view.js';

/** @type {{ overlay: HTMLElement, viewport: HTMLElement, slides: HTMLElement[], cards: object[], index: number, countEl: HTMLElement, nameEl: HTMLElement, onKeyDown: (event: KeyboardEvent) => void, onScroll: () => void, scrollTimer: ReturnType<typeof setTimeout> | null } | null} */
let viewerState = null;

export const isDiscardPileViewerOpen = () => viewerState != null;

const clampIndex = (index, max) => Math.max(0, Math.min(index, max));

const findNearestIndex = (viewport, slides) => {
  const center = viewport.scrollLeft + viewport.clientWidth / 2;
  let best = 0;
  let bestDist = Infinity;
  slides.forEach((slide, i) => {
    const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
    const dist = Math.abs(center - slideCenter);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  return best;
};

const updateSlideFocus = (state) => {
  state.slides.forEach((slide, i) => {
    slide.classList.toggle('is-active', i === state.index);
  });
};

const updateFooter = (state) => {
  const card = state.cards[state.index];
  state.countEl.textContent = `${state.index + 1} / ${state.cards.length}`;
  state.nameEl.textContent = card?.name ?? '';
  updateSlideFocus(state);
};

const scrollToIndex = (state, index, behavior = 'smooth') => {
  state.index = clampIndex(index, state.slides.length - 1);
  state.slides[state.index].scrollIntoView({
    inline: 'center',
    block: 'nearest',
    behavior,
  });
  updateFooter(state);
};

export const closeDiscardPileViewer = () => {
  if (!viewerState) return;

  const { overlay, onKeyDown, onScroll, viewport, scrollTimer } = viewerState;
  document.removeEventListener('keydown', onKeyDown);
  viewport.removeEventListener('scroll', onScroll);
  if (scrollTimer) clearTimeout(scrollTimer);
  overlay.querySelectorAll('.mat-holo').forEach((wrapper) => {
    stopHoloAnimation(wrapper);
  });
  overlay.remove();
  viewerState = null;
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

  const viewport = document.createElement('div');
  viewport.className = 'discard-pile-viewport';

  const track = document.createElement('div');
  track.className = 'discard-pile-track';

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
    track.appendChild(slide);
    return slide;
  });

  viewport.appendChild(track);

  const footer = document.createElement('div');
  footer.className = 'discard-pile-footer';
  const countEl = document.createElement('span');
  countEl.className = 'discard-pile-count';
  const nameEl = document.createElement('span');
  nameEl.className = 'discard-pile-name';
  footer.append(countEl, nameEl);

  overlay.append(header, closeBtn, prevBtn, nextBtn, viewport, footer);
  document.body.appendChild(overlay);

  const state = {
    overlay,
    viewport,
    slides,
    cards,
    index: initialIndex,
    countEl,
    nameEl,
    scrollTimer: null,
    onScroll: null,
    onKeyDown: null,
  };

  state.onScroll = () => {
    if (state.scrollTimer) clearTimeout(state.scrollTimer);
    state.scrollTimer = setTimeout(() => {
      state.index = findNearestIndex(viewport, slides);
      updateFooter(state);
    }, 80);
  };

  state.onKeyDown = (event) => {
    if (!viewerState) return;
    if (event.key === 'Escape' || event.key === 'v') {
      closeDiscardPileViewer();
    } else if (event.key === 'ArrowLeft') {
      scrollToIndex(state, state.index - 1);
    } else if (event.key === 'ArrowRight') {
      scrollToIndex(state, state.index + 1);
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
    scrollToIndex(state, state.index - 1);
  });
  nextBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    scrollToIndex(state, state.index + 1);
  });
  viewport.addEventListener('scroll', state.onScroll, { passive: true });
  document.addEventListener('keydown', state.onKeyDown);

  viewerState = state;
  updateFooter(state);

  requestAnimationFrame(() => {
    scrollToIndex(state, initialIndex, 'instant');
  });
};
