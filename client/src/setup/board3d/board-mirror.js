// Design 074 D4 (O2-A): the board mirror. Two open shadow roots stand in for the two playmat
// iframe documents while the three.js board runs: they carry the same element ids, so
// apply-view.js keeps building every card <img> through getZone(...).element, and every
// consumer of `selfContainerDocument`/`oppContainerDocument` (getElementById, querySelector,
// event listeners) keeps working. The mirror is invisible (`opacity: 0`, no pointer events);
// `sync` writes each card's projected screen rect onto its <img> so getBoundingClientRect on a
// mirror node is where the scene draws it, and `observe`/`uiState` read the UI state the DOM
// code paints onto those nodes (selection, glow, mat pick, FX hide) back for the scene.

const SIDES = ['self', 'opp'];
/** Zones sized to the union of their cards' rects (the cards the scene draws there). */
const CARD_RECT_ZONES = ['active', 'bench', 'hand', 'prizes', 'board'];
/** Piles sized to the scene's `pile:<side>:<zone>` footprint: zone, cover, and the deck's stack. */
const PILE_ELEMENTS = {
  deck: ['deck', 'deckCover', 'deckStack'],
  discard: ['discard', 'discardCover'],
  lostZone: ['lostZone', 'lostZoneCover'],
};
const RECT_KEYS = ['left', 'top', 'width', 'height'];
const SELECTED_CLASSES = ['highlight', 'selectHighlight'];
// mat-picker.js OUTLINE_IDLE / OUTLINE_SELECTED, as written and as the browser normalizes them.
const PICKED_OUTLINES = ['#38d66b', 'rgb(56, 214, 107)'];
const IDLE_OUTLINES = ['#ffd23f', 'rgb(255, 210, 63)'];
// index.css `.has-glow`: `rgba(var(--glow-rgb, 120, 200, 255), 0.6)`.
export const DEFAULT_GLOW_RGB = '120, 200, 255';
const OBSERVED_ATTRIBUTES = ['class', 'style', 'data-mat-pick'];
const NEUTRAL_STATE = Object.freeze({ selected: false, glow: null, matPick: null, hidden: false });

// The host is the containing block of everything in its root (the transform makes it one for
// `position: fixed` too), so every rect `sync` writes is in px from the host's box. Card images
// are fixed so a zone, `.play-container` or `.mat-holo` between them and the host never offsets
// them, and untransformed so their box is the projected rect (the scene draws the rotation).
const MIRROR_STYLE = `
:host { position: absolute; inset: 0; display: block; transform: translateZ(0);
  opacity: 0; pointer-events: none; }
#playfield { position: absolute; inset: 0; }
#playfield > *, #handLabel, #handText, #hand, #attachedCards, #viewCards {
  position: absolute; left: 0; top: 0; width: 0; height: 0; margin: 0;
  pointer-events: none; opacity: 0; }
#deck, #discard, #lostZone, #attachedCards, #viewCards { display: none; }
img.card-image { position: fixed !important; transform: none !important; margin: 0 !important; }
#deckCover > img, #discardCover > img, #lostZoneCover > img {
  position: absolute !important; inset: 0; width: 100% !important; height: 100% !important; }
`;

const zoneButtons = (buttons) =>
  buttons.map(([id, label]) => `<button id="${id}" class="zone-button">${label}</button>`).join('');

const popupZone = (id, buttons, view) => `
  <div id="${id}Text" class="${view}-text">(<span id="${id}Count">0</span>)</div>
  <div id="${id}" class="zone ${view}-view"><div class="zone-button-container">
    ${zoneButtons(buttons)}
    <input type="checkbox" id="sort${id[0].toUpperCase()}${id.slice(1)}Checkbox">
  </div></div>`;

/** The id skeleton of `self-containers.html` / `opp-containers.html` (same ids on both sides). */
const mirrorMarkup = (view) => `<style>${MIRROR_STYLE}</style>
<div id="playfield">
  <div id="boardCenterDesign"><div id="boardCircle"></div><div id="innerCircle"></div></div>
  ${popupZone('deck', [['shuffleDeckButton', 'Shuffle'], ['closeDeckButton', 'Close']], view)}
  ${popupZone('discard', [['shuffleDiscardButton', 'Shuffle all to Deck'], ['closeDiscardButton', 'Close']], view)}
  ${popupZone('lostZone', [['closeLostZoneButton', 'Close']], view)}
  <div id="discardCover" class="outline"></div>
  <div id="deckStack" aria-hidden="true"></div>
  <div id="deckCover" class="outline"></div>
  <div id="lostZoneCover" class="outline"></div>
  <div id="bench" class="outline"></div>
  <div id="active" class="outline"></div>
  <div id="matCoinSlot" class="mat-coin-slot"></div>
  <div id="prizes" class="outline"></div>
  <div id="board" class="${view}-board"></div>
</div>
<div id="handLabel"><input type="checkbox" id="sortHandCheckbox" class="${view}-text">
  <div id="sortHandText" class="${view}-text">Sort</div></div>
<div id="handText" class="${view}-text">(<span id="handCount">0</span>)</div>
<div id="hand"></div>
<div id="attachedCards" class="${view}-view">
  <div id="attachedCardsHeader" class="header ${view}-header">${view === 'self' ? 'Move attached cards' : 'Opponent moving cards...'}</div>
  <div id="attachedCardsButtonContainer" class="${view}-zone-button-container">
    ${zoneButtons([
      ['discardAttachedCardsButton', 'Discard all'],
      ['shuffleAttachedCardsButton', 'Shuffle all'],
      ['lostZoneAttachedCardsButton', 'Lost Zone all'],
      ['handAttachedCardsButton', 'To Hand'],
      ['leaveAttachedCardsButton', 'Leave in play'],
    ])}
  </div>
</div>
<div id="viewCards" class="${view}-view">
  <div id="viewCardsHeader" class="header ${view}-header">Looking at cards...</div>
  <div id="viewCardsButtonContainer" class="${view}-zone-button-container">
    ${zoneButtons([
      ['discardViewCardsButton', 'Discard all'],
      ['shuffleViewCardsButton', 'Shuffle all'],
      ['shuffleBottomViewCardsButton', 'Shuffle to bottom'],
      ['lostZoneViewCardsButton', 'Lost Zone all'],
      ['handViewCardsButton', 'To Hand'],
    ])}
  </div>
</div>`;

const instanceIdOf = (node) => {
  const raw = node?.dataset?.instanceId;
  if (raw === undefined || raw === '') return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
};

/** The card instance a mutated node paints for: its own stamp, or the card <img> it wraps. */
const instanceOfNode = (node) => {
  if (!node || node.nodeType !== 1) return null;
  const own = instanceIdOf(node);
  if (own !== null) return own;
  if (!node.classList?.contains('mat-holo')) return null;
  return instanceIdOf(node.querySelector?.('img[data-instance-id]'));
};

const unionOf = (rects) => {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.left + r.width));
  const bottom = Math.max(...rects.map((r) => r.top + r.height));
  return { left, top, width: right - left, height: bottom - top };
};

const isRect = (rect) =>
  Boolean(rect) && RECT_KEYS.every((key) => Number.isFinite(rect[key]));

/** Writes a rect (px from `origin`) as inline left/top/width/height, touching only what changed. */
const writeRect = (el, rect, origin) => {
  if (!el?.style || !isRect(rect)) return;
  const values = {
    left: `${rect.left - origin.left}px`,
    top: `${rect.top - origin.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
  for (const key of RECT_KEYS) {
    if (el.style[key] !== values[key]) el.style[key] = values[key];
  }
};

const outlineState = (node) => {
  const outline = String(node.style?.outline ?? '').toLowerCase();
  if (PICKED_OUTLINES.some((colour) => outline.includes(colour))) return 'picked';
  if (IDLE_OUTLINES.some((colour) => outline.includes(colour))) return 'idle';
  return node.dataset?.matPick === '1' ? 'idle' : null;
};

/**
 * @param {{ hostSelf: HTMLElement, hostOpp: HTMLElement, doc?: Document }} options
 * @returns {{ roots: { self: ShadowRoot, opp: ShadowRoot }, hosts: { self: HTMLElement, opp: HTMLElement },
 *   zoneElement: (side: 'self'|'opp', zoneId: string) => HTMLElement|null,
 *   sync: (model: object|null, rects: Record<string, {left:number,top:number,width:number,height:number}>) => void,
 *   observe: (onUiState: (instanceId: number, patch: object) => void) => () => void,
 *   uiState: () => import('./board-model.mjs').UiState, dispose: () => void }}
 */
export function createBoardMirror({ hostSelf, hostOpp, doc = globalThis.document } = {}) {
  if (!hostSelf || !hostOpp || !doc) throw new Error('board mirror needs both hosts and a document');
  const hosts = { self: hostSelf, opp: hostOpp };
  const roots = {};
  for (const side of SIDES) {
    const root = hosts[side].shadowRoot ?? hosts[side].attachShadow({ mode: 'open' });
    root.innerHTML = mirrorMarkup(side);
    // Legacy counters and hand stacks build their nodes with `<container document>.createElement`;
    // a shadow root has no factory of its own, so it lends the page's.
    if (typeof root.createElement !== 'function') {
      Object.defineProperty(root, 'createElement', {
        configurable: true,
        value: (tagName, options) => doc.createElement(tagName, options),
      });
    }
    roots[side] = root;
  }

  const observers = new Set();
  // The state last handed to the scene per card, by a report or a `uiState()` snapshot (which
  // feeds the model): a mutation that leaves a card's state as the scene has it (sync's own rect
  // writes, an unrelated class) reports nothing, so the scene never re-dresses in a loop.
  const known = new Map();
  let disposed = false;

  const zoneElement = (side, zoneId) => roots[side]?.getElementById(zoneId) ?? null;

  const cardImage = (id) => {
    for (const side of SIDES) {
      const img = roots[side].querySelector(`img[data-instance-id="${id}"]`);
      if (img) return img;
    }
    return null;
  };

  /** Every mirror node that carries this card's UI state: the <img>, its holo wrapper, its slot. */
  const nodesOf = (img, id) => {
    const nodes = [img];
    const wrapper = img.parentElement?.closest?.('.mat-holo');
    if (wrapper) nodes.push(wrapper);
    const slot = img.closest?.('.play-container');
    if (slot && instanceIdOf(slot) === id) nodes.push(slot);
    return nodes;
  };

  /** The full UI state of one card instance, read off its mirror nodes. */
  const stateOf = (id) => {
    const img = cardImage(id);
    if (!img) return { ...NEUTRAL_STATE };
    const nodes = nodesOf(img, id);
    const glowNode = nodes.find((node) => node.classList?.contains('has-glow'));
    const picks = nodes.map(outlineState);
    return {
      selected: nodes.some((node) => SELECTED_CLASSES.some((name) => node.classList?.contains(name))),
      glow: glowNode
        ? glowNode.style?.getPropertyValue('--glow-rgb')?.trim() || DEFAULT_GLOW_RGB
        : null,
      matPick: picks.includes('picked') ? 'picked' : picks.includes('idle') ? 'idle' : null,
      // FX hideDuring and card focus hide the <img> or its `.mat-holo` wrapper.
      hidden: nodes.slice(0, 2).some((node) => node.style?.visibility === 'hidden'),
    };
  };

  const sameState = (a, b) =>
    a.selected === b.selected &&
    a.glow === b.glow &&
    a.matPick === b.matPick &&
    a.hidden === b.hidden;

  const uiState = () => {
    const state = { selected: new Set(), glows: new Map(), matPick: new Map(), hidden: new Set() };
    for (const side of SIDES) {
      for (const img of roots[side].querySelectorAll('img[data-instance-id]')) {
        const id = instanceIdOf(img);
        if (id === null) continue;
        const card = stateOf(id);
        known.set(id, card);
        if (card.selected) state.selected.add(id);
        if (card.glow !== null) state.glows.set(id, card.glow);
        if (card.matPick !== null) state.matPick.set(id, card.matPick);
        if (card.hidden) state.hidden.add(id);
      }
    }
    return state;
  };

  const observe = (onUiState) => {
    if (disposed || typeof onUiState !== 'function') return () => {};
    const Observer = doc.defaultView?.MutationObserver ?? globalThis.MutationObserver;
    if (typeof Observer !== 'function') return () => {};
    const onRecords = (records) => {
      const ids = new Set();
      for (const record of records) {
        const id = instanceOfNode(record.target);
        if (id !== null) ids.add(id);
      }
      for (const id of ids) {
        const next = stateOf(id);
        if (sameState(known.get(id) ?? NEUTRAL_STATE, next)) continue;
        known.set(id, next);
        onUiState(id, next);
      }
    };
    const perRoot = SIDES.map((side) => {
      const observer = new Observer(onRecords);
      observer.observe(roots[side], { subtree: true, attributes: true, attributeFilter: OBSERVED_ATTRIBUTES });
      return observer;
    });
    const entry = { disconnect: () => perRoot.forEach((observer) => observer.disconnect()) };
    observers.add(entry);
    return () => {
      if (!observers.delete(entry)) return;
      entry.disconnect();
    };
  };

  const hostBox = (side) => {
    const box = hosts[side].getBoundingClientRect?.();
    return box ? { left: box.left, top: box.top, width: box.width, height: box.height } : null;
  };

  const sync = (model, rects) => {
    if (disposed || !rects || typeof rects !== 'object') return;
    const placements = Array.isArray(model?.placements) ? model.placements : [];
    for (const side of SIDES) {
      const origin = hostBox(side) ?? { left: 0, top: 0, width: 0, height: 0 };
      for (const img of roots[side].querySelectorAll('img[data-instance-id]')) {
        const id = instanceIdOf(img);
        if (id !== null) writeRect(img, rects[id], origin);
      }
      for (const zoneId of CARD_RECT_ZONES) {
        const cardRects = placements
          .filter((placement) => placement.side === side && placement.zone === zoneId)
          .map((placement) => rects[placement.instanceId])
          .filter(isRect);
        writeRect(zoneElement(side, zoneId), unionOf(cardRects) ?? origin, origin);
      }
      for (const [pile, ids] of Object.entries(PILE_ELEMENTS)) {
        const rect = rects[`pile:${side}:${pile}`];
        for (const id of ids) writeRect(zoneElement(side, id), isRect(rect) ? rect : origin, origin);
      }
    }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const entry of observers) entry.disconnect();
    observers.clear();
    known.clear();
  };

  return { roots, hosts, zoneElement, sync, observe, uiState, dispose };
}
