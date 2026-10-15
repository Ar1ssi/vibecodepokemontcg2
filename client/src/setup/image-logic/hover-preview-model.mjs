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
 * The blurred band between the board's left edge and the mat art. Each probe rect is one half's art
 * box (`--mat-offset-x`/`--mat-width`) in viewport coordinates; the narrower band wins so the
 * preview never overlaps either half. No measurable probe → width 0 (no band).
 */
export function gutterBox({ boardRect, probeRects, viewport }) {
  const left = Math.max(0, boardRect?.left ?? 0);
  const rects = (probeRects || []).filter(isUsableRect);
  if (!boardRect || rects.length === 0) {
    return { left, top: 0, width: 0, height: viewport.height };
  }
  const right = Math.min(...rects.map((rect) => rect.left));
  return { left, top: 0, width: Math.max(0, right - left), height: viewport.height };
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

/**
 * Where the preview goes, in whole viewport pixels. `band`: centred in the blurred band. `edge`: the
 * band is too narrow (two-player / `sim` layouts have none), so it overlays the board's left edge at
 * HOVER_MIN_WIDTH. Either mirrors to the right (`band-right`/`edge-right`) when it would cover the
 * hovered card. Vertically centred, clamped inside the viewport.
 */
export function previewPlacement({ gutter, boardRect, sourceRect, viewport }) {
  const boardLeft = boardRect?.left ?? 0;
  const boardRight = boardRect ? boardRect.left + boardRect.width : viewport.width;
  const usable = gutter.width - 2 * HOVER_EDGE_GAP;
  const inBand = usable >= HOVER_MIN_WIDTH;
  const { width, height } = fitCard(inBand ? usable : HOVER_MIN_WIDTH, viewport);
  const top = (viewport.height - height) / 2;

  let left = inBand ? gutter.left + (gutter.width - width) / 2 : boardLeft + HOVER_EDGE_GAP;
  let mode = inBand ? 'band' : 'edge';
  if (intersects({ left, top, width, height }, sourceRect)) {
    // layoutToCssVars centres the art, so the right band mirrors the left one.
    const rightBandLeft = boardRight - (gutter.left - boardLeft) - gutter.width;
    left = inBand
      ? rightBandLeft + (gutter.width - width) / 2
      : boardRight - HOVER_EDGE_GAP - width;
    mode = `${mode}-right`;
  }

  return {
    left: Math.round(clamp(left, 0, viewport.width - width)),
    top: Math.round(clamp(top, 0, viewport.height - height)),
    width: Math.round(width),
    height: Math.round(height),
    mode,
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
