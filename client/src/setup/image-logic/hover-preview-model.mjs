// Design 069: the TCG Live hover preview's pure half — the dwell/warm-swap state machine, where the
// preview sits (the blurred band left of the letterboxed mat art), who may arm it, and which card a
// hovered in-play stack shows. DOM-free; the clock and timers are injected so tests drive them.
import { isPokemon } from '../../../../shared/engine/cards.mjs';
import { topPokemonCard } from '../../../../shared/engine/rules/evolved-pokemon.mjs';

export const HOVER_DWELL_MS = 800;
// After a preview hides, entering another card this soon swaps it in with no dwell (a sweep).
export const HOVER_WARM_MS = 300;
export const HOVER_FADE_IN_MS = 120;
export const HOVER_FADE_OUT_MS = 80;
export const HOVER_EDGE_GAP = 12;
export const HOVER_MIN_WIDTH = 160;
export const HOVER_MAX_WIDTH = 480;
export const HOVER_MAX_HEIGHT_FRAC = 0.9;
export const CARD_ASPECT = 1.397;

/**
 * idle → arming (enter) → shown (dwell elapsed). While shown, or within HOVER_WARM_MS of a leave,
 * entering another card shows it at once. Any suppress ends the sweep: the next card dwells again.
 * @param {{ now: () => number, setTimer: (fn: () => void, ms: number) => unknown, clearTimer: (id: unknown) => void }} deps
 */
export function createHoverModel({ now, setTimer, clearTimer }) {
  let phase = 'idle';
  let key = null;
  let timer = null;
  let warmUntil = -Infinity;
  const listeners = new Set();

  const emit = () => {
    for (const listener of listeners) listener({ phase, key });
  };
  const cancelTimer = () => {
    if (timer === null) return;
    clearTimer(timer);
    timer = null;
  };
  const show = (nextKey) => {
    cancelTimer();
    phase = 'shown';
    key = nextKey;
    emit();
  };

  const enter = (nextKey, { pointerType } = {}) => {
    if (nextKey == null || pointerType !== 'mouse') return;
    if (phase === 'shown') {
      if (nextKey !== key) show(nextKey);
      return;
    }
    if (phase === 'arming' && nextKey === key) return;
    if (now() < warmUntil) {
      show(nextKey);
      return;
    }
    cancelTimer();
    phase = 'arming';
    key = nextKey;
    timer = setTimer(() => {
      timer = null;
      if (phase === 'arming' && key === nextKey) show(nextKey);
    }, HOVER_DWELL_MS);
    emit();
  };

  const leave = (leftKey) => {
    if (phase === 'idle' || leftKey !== key) return;
    if (phase === 'shown') warmUntil = now() + HOVER_WARM_MS;
    cancelTimer();
    phase = 'idle';
    key = null;
    emit();
  };

  // reason: 'pointerdown' | 'drag' | 'contextmenu' | 'wheel' | 'modal' | 'blur' | 'detached' | 'setting'
  const suppress = () => {
    warmUntil = -Infinity;
    cancelTimer();
    if (phase === 'idle') return;
    phase = 'idle';
    key = null;
    emit();
  };

  return {
    enter,
    leave,
    suppress,
    state: () => ({ phase, key, warmUntil }),
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const isUsableRect = (rect) =>
  Boolean(rect) && Number.isFinite(rect.left) && rect.width > 0 && rect.height > 0;

/**
 * The free space either side of the mat art. Each probe rect is one half's art box
 * (`--mat-offset-x`/`--mat-width`) in viewport coordinates. `left`/`width` span the board's left edge
 * to the nearer art edge (the blurred band); `artRight` is the farther art edge, so the right side
 * runs from there to the viewport edge. No measurable probe → width 0, `artRight` null.
 */
export function gutterBox({ boardRect, probeRects, viewport }) {
  const left = Math.max(0, boardRect?.left ?? 0);
  const rects = (probeRects || []).filter(isUsableRect);
  if (!boardRect || rects.length === 0) {
    return { left, top: 0, width: 0, height: viewport.height, artRight: null };
  }
  const right = Math.min(...rects.map((rect) => rect.left));
  const artRight = Math.max(...rects.map((rect) => rect.left + rect.width));
  return { left, top: 0, width: Math.max(0, right - left), height: viewport.height, artRight };
}

const fitCard = (width, viewport) => {
  const cap = HOVER_MAX_HEIGHT_FRAC * viewport.height;
  const height = width * CARD_ASPECT;
  if (height <= cap) return { width, height };
  return { width: cap / CARD_ASPECT, height: cap };
};

const intersects = (a, b) =>
  isUsableRect(b) &&
  a.left < b.left + b.width &&
  b.left < a.left + a.width &&
  a.top < b.top + b.height &&
  b.top < a.top + a.height;

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

// A card hugging the art edge inside `room` px of free space, or null when it would be under the minimum.
const sideBox = ({ room, artEdge, side, viewport }) => {
  const usable = room - 2 * HOVER_EDGE_GAP;
  if (usable < HOVER_MIN_WIDTH) return null;
  const { width, height } = fitCard(Math.min(usable, HOVER_MAX_WIDTH), viewport);
  const left = side === 'left' ? artEdge - HOVER_EDGE_GAP - width : artEdge + HOVER_EDGE_GAP;
  return { left, top: (viewport.height - height) / 2, width, height };
};

/**
 * Where the preview goes, in whole viewport pixels, vertically centred. `band`: against the mat art's
 * left edge; `band-right`: against its right edge, where the band plus the sidebox leave far more
 * room. The side that fits the larger card wins (left on a tie); a side that would cover the hovered
 * card loses to one that doesn't. `edge`: no side fits (two-player / `sim` layouts have no art box),
 * so it overlays the board's left edge at HOVER_MIN_WIDTH, mirrored to `edge-right` over the source.
 */
export function previewPlacement({ gutter, boardRect, sourceRect, viewport }) {
  const sides = [
    {
      mode: 'band',
      box: sideBox({ room: gutter.width, artEdge: gutter.left + gutter.width, side: 'left', viewport }),
    },
    {
      mode: 'band-right',
      box:
        gutter.artRight == null
          ? null
          : sideBox({ room: viewport.width - gutter.artRight, artEdge: gutter.artRight, side: 'right', viewport }),
    },
  ].filter((side) => side.box);

  let chosen = null;
  if (sides.length > 0) {
    const clear = sides.filter((side) => !intersects(side.box, sourceRect));
    const pool = clear.length > 0 ? clear : sides;
    chosen = pool.reduce((best, side) => (side.box.width > best.box.width ? side : best));
  } else {
    const boardLeft = boardRect?.left ?? 0;
    const boardRight = boardRect ? boardRect.left + boardRect.width : viewport.width;
    const { width, height } = fitCard(HOVER_MIN_WIDTH, viewport);
    const top = (viewport.height - height) / 2;
    const covers = intersects({ left: boardLeft + HOVER_EDGE_GAP, top, width, height }, sourceRect);
    chosen = {
      mode: covers ? 'edge-right' : 'edge',
      box: { left: covers ? boardRight - HOVER_EDGE_GAP - width : boardLeft + HOVER_EDGE_GAP, top, width, height },
    };
  }

  const { box } = chosen;
  return {
    left: Math.round(clamp(box.left, 0, viewport.width - box.width)),
    top: Math.round(clamp(box.top, 0, viewport.height - box.height)),
    width: Math.round(box.width),
    height: Math.round(box.height),
    mode: chosen.mode,
  };
}

/** Whether a hover may arm or keep a preview. `buttons` is the pointer event's held-button mask. */
export function isHoverEligible({ card, enabled, modalOpen, buttons }) {
  return Boolean(enabled) && card != null && !modalOpen && !buttons;
}

/**
 * The card a hover over an in-play stack previews (design 069 A5): the top Pokémon, whichever stack
 * member — Basic, lower Stage, Energy token, Tool — is under the pointer. A stack whose root is not
 * a Pokémon, or a card with no stack, previews itself.
 * @param {object} hovered the card under the pointer
 * @param {object[]} stackCards every card in the hovered card's play-container, root included
 */
export function stackTopCard(hovered, stackCards) {
  if (!hovered) return null;
  const cards = (stackCards || []).filter(Boolean);
  const root = cards.find((card) => card.attachedTo == null && card.instanceId != null);
  if (!root) return hovered;
  const top = topPokemonCard(cards, root);
  return isPokemon(top) ? top : hovered;
}
