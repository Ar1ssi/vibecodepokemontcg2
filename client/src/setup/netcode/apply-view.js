/**
 * @file Authoritative client DOM renderer for server-authoritative netcode (Slice 7).
 * Reconciles browser DOM directly from authoritative redacted GameState views.
 * Enforces Invariants 1, 4, 5 and Edge Cases 6, 8, 11, 12, 18.
 *
 * Invariant (design 002 §0.2): a renderer that cannot see the whole board writes to no
 * part of it. `applyView` probes render targets before any mutation and bails out
 * without touching `lastRenderedVersion` or the DOM when a zone cannot be resolved.
 */

import { diffViews } from './view-diff.mjs';
import { buildMatPickerRequest } from './mat-pick-request.mjs';
import { clearInFlightAffordances, emitResolveChoice } from './cmd-emitter.js';
import { buildCardImage } from '../image-logic/build-card-image.js';
import { setStadiumFacing } from '../zones/stadium-facing.mjs';
import { rulesState } from '../../../../shared/engine/rules/rules-state.mjs';
import {
  DAMAGE_COUNTER_TIERS,
  getDamageCounterTier,
} from '../counters/damage-counter-style.mjs';
import { applySpecialConditionStyle } from '../counters/special-condition-style-apply.js';
import { resetImage } from '../image-logic/reset-image.js';
import {
  getEnergyTokenFront,
  isEnergyCard,
} from '../../actions/move-card-bundle/energy-token-assets.mjs';
import { topPokemonCard } from '../../../../shared/engine/rules/evolved-pokemon.mjs';
import { isPokemon } from '../../../../shared/engine/cards.mjs';
import { createViewBoardButton } from '../image-logic/view-board-toggle.mjs';
import {
  listConditions,
  ROTATION_CONDITIONS,
} from '../../../../shared/engine/rules/special-conditions.mjs';

let lastRenderedVersion = -1;
const cardRegistry = new Map(); // instanceId -> { instanceId, element, card, side, zone, container }
const coverRegistry = new Map(); // "side:zoneId" -> HTMLImageElement

// Design 002 I24: the last view this renderer actually applied. Legacy's own
// per-player `zoneArrays` (get-zone.js) are never populated from server views
// (I15) — nothing under authoritative dispatch writes to them (design 003
// gates local mutation too) — so callers that need a real live zone array
// under server-authoritative rendering (the 3.11 desync heartbeat, the e2e
// API) read through `getAuthoritativeZoneArray`/`getAuthoritativeStadiumArray`
// below instead, which are backed by this cache.
let lastAppliedView = null;

let defaultNetcodeContext = {
  socket: null,
  roomId: null,
  systemState: null,
  getZone: null,
  cardListeners: null,
  coverListeners: null,
  sortZoneCards: null,
  // { hydrate(card), unhydrate(card) } — hydrate-holo.js, injected because it
  // imports front-end.js, which is unimportable outside a browser.
  holo: null,
  // { open({ choice, onResolve }), close() } — card-picker.js, injected for the
  // same reason (it pulls in get-zone.js).
  choicePicker: null,
  // { open({ choice, cards, onResolve }), close() } — the prize fly-up picker
  // (prize-take-prompt.js), injected for the same reason.
  prizePicker: null,
  // { open({ choice, candidates, cancellable, onResolve, onCancel }), close() } —
  // the in-play-Pokémon mat picker (mat-picker.js), for choices whose options are
  // all cards on the board (D19). Injected for the same reason.
  matPicker: null,
  reconcileHandStacks: null,
  // clearHandStackPositioning(node) — hand-stack-dom.js, injected for the same
  // reason. Undoes the hand stack's inline positioning on a card that left the
  // hand, which would otherwise outrank the board's own `.play-container` rules
  // and leave the card not drawing where its slot is.
  clearHandStackPositioning: null,
};

// choiceId the injected card picker is currently showing, so re-applying a view
// that still carries the same pendingChoice doesn't reopen (and reset) it.
let openPickerChoiceId = null;
// Same guard for the prize picker.
let openPrizeChoiceId = null;
// Same guard for the mat picker.
let openMatChoiceId = null;

// Options of the last applied view, reused when overlays re-measure on resize.
let lastOverlayOptions = null;
let resizeListenerBound = false;

const PLAY_ZONES = ['active', 'bench'];

// Zones legacy move-card.js gives a holofoil wrapper; stadium and attached cards
// never get one.
const HOLO_ZONES = [
  'hand',
  'prizes',
  'discard',
  'lostZone',
  'board',
  'active',
  'bench',
];

// Legacy attach-card.js token geometry, as fractions of the parent card.
const ENERGY_TOKEN_SIZE = 0.24;
const ENERGY_TOKEN_SPACING = 1.15;
const ENERGY_TOKEN_BOTTOM = 0.03;
// Legacy attach-card.js / evolve-card.js offsets, as fractions of the visible card's width.
const ATTACHED_CARD_SHIFT = 1 / 6;
const UNDER_POKEMON_SHIFT = 1 / 15;
const STACK_STYLE_KEYS = [
  'position',
  'width',
  'height',
  'left',
  'bottom',
  'zIndex',
];
const COUNT_ZONES = ['deck', 'discard', 'lostZone', 'hand'];

/**
 * Returns the highest stateVersion successfully applied by the renderer.
 *
 * @returns {number}
 */
export function getLastRenderedVersion() {
  return lastRenderedVersion;
}

/**
 * Sets default socket and roomId context for choice resolution.
 *
 * @param {object} [ctx={}]
 * @param {object} [ctx.socket]
 * @param {string|Function} [ctx.roomId]
 * @param {object} [ctx.systemState]
 * @param {Function} [ctx.getZone] Real legacy zone resolver: `(user, zoneId) => { element, array, ... }`
 *   with `user` in `'self' | 'opp'`. `resolveZone` adapts its own `'you' | 'them'` side
 *   terminology into this before calling it (design 002 slice 3.6).
 * @param {object} [ctx.cardListeners] Interaction listener table (design 002 slice 3.6,
 *   `card-listener-table.js`'s `CARD_IMAGE_LISTENERS`) applied to authoritative-rendered
 *   card images via the shared `buildCardImage` factory. Left null in tests / until wired
 *   in production: renderer falls back to a bare, non-interactive `<img>` (unchanged
 *   pre-3.6 behavior) when absent.
 * @param {object} [ctx.coverListeners] Interaction listener table for deck/discard/lostZone
 *   cover images (design 002 slice 3.8, `cover-listener-table.js`'s `COVER_IMAGE_LISTENERS`).
 *   Same absent-until-wired fallback as `cardListeners`.
 * @param {Function} [ctx.sortZoneCards] `(side, zoneId, cards) => cards` render-order hook
 *   (design 002 slice 3.8) mirroring legacy's `sort()` deck-list ordering. Left null in
 *   tests / until wired: cards render in the view's own array order, unchanged.
 */
export function setDefaultNetcodeContext(ctx = {}) {
  if (ctx.socket !== undefined) defaultNetcodeContext.socket = ctx.socket;
  if (ctx.roomId !== undefined) defaultNetcodeContext.roomId = ctx.roomId;
  if (ctx.systemState !== undefined)
    defaultNetcodeContext.systemState = ctx.systemState;
  if (ctx.getZone !== undefined) defaultNetcodeContext.getZone = ctx.getZone;
  if (ctx.cardListeners !== undefined)
    defaultNetcodeContext.cardListeners = ctx.cardListeners;
  if (ctx.coverListeners !== undefined)
    defaultNetcodeContext.coverListeners = ctx.coverListeners;
  if (ctx.sortZoneCards !== undefined)
    defaultNetcodeContext.sortZoneCards = ctx.sortZoneCards;
  if (ctx.holo !== undefined) defaultNetcodeContext.holo = ctx.holo;
  if (ctx.choicePicker !== undefined)
    defaultNetcodeContext.choicePicker = ctx.choicePicker;
  if (ctx.prizePicker !== undefined)
    defaultNetcodeContext.prizePicker = ctx.prizePicker;
  if (ctx.matPicker !== undefined)
    defaultNetcodeContext.matPicker = ctx.matPicker;
  if (ctx.reconcileHandStacks !== undefined)
    defaultNetcodeContext.reconcileHandStacks = ctx.reconcileHandStacks;
  if (ctx.clearHandStackPositioning !== undefined)
    defaultNetcodeContext.clearHandStackPositioning = ctx.clearHandStackPositioning;
}

/**
 * Returns default netcode context.
 *
 * @returns {{ socket: any, roomId: string|null, systemState: any }}
 */
export function getDefaultNetcodeContext() {
  return {
    socket: defaultNetcodeContext.socket,
    roomId:
      typeof defaultNetcodeContext.roomId === 'function'
        ? defaultNetcodeContext.roomId()
        : defaultNetcodeContext.roomId ||
          defaultNetcodeContext.systemState?.roomId ||
          null,
    systemState: defaultNetcodeContext.systemState,
  };
}

/**
 * Resets renderer state and clears cached registries (used for room teardown or test suites).
 */
export function resetRenderState() {
  lastRenderedVersion = -1;
  cardRegistry.clear();
  coverRegistry.clear();
  lastAppliedView = null;
  clearInFlightAffordances();
  openPickerChoiceId = null;
  openPrizeChoiceId = null;
  openMatChoiceId = null;
  lastOverlayOptions = null;
  defaultNetcodeContext = {
    socket: null,
    roomId: null,
    systemState: null,
    getZone: null,
    cardListeners: null,
    coverListeners: null,
    sortZoneCards: null,
    holo: null,
    choicePicker: null,
    prizePicker: null,
    matPicker: null,
    reconcileHandStacks: null,
    clearHandStackPositioning: null,
  };
}

/**
 * Returns the live registry of tracked cards.
 *
 * @returns {Map<number, object>}
 */
export function getCardRegistry() {
  return cardRegistry;
}

/**
 * True once this renderer has applied at least one authoritative view (i.e.
 * server-authoritative rendering is actually active for this session), false
 * before that or after `resetRenderState()`. Callers use this to decide
 * whether `getAuthoritativeZoneArray`/`getAuthoritativeStadiumArray` have
 * anything real to return, versus legacy mode where they never will.
 *
 * @returns {boolean}
 */
export function hasAuthoritativeView() {
  return lastAppliedView !== null;
}

/**
 * Returns one side's live card array for one zone, sourced from the last
 * view this renderer applied (design 002 I24). `deck` never has a card
 * array here — the view redacts it to `{ count }` even for its own owner
 * (design O4-A / I5) — callers must not treat an empty result for `deck` as
 * "the deck is empty".
 *
 * @param {string} side 'you' | 'them'
 * @param {string} zoneId
 * @returns {object[]}
 */
export function getAuthoritativeZoneArray(side, zoneId) {
  const cards = lastAppliedView?.[side]?.zones?.[zoneId];
  return Array.isArray(cards) ? cards : [];
}

/**
 * Deck is always redacted to `{ count }` (design O4-A / I5), even for its own
 * owner, so it never satisfies `getAuthoritativeZoneArray`'s array shape.
 * Design 009 slice 5's shuffle-flight animation needs a real card count to
 * size itself, so this reads the redacted count directly.
 *
 * @param {string} side 'you' | 'them'
 * @returns {number}
 */
export function getAuthoritativeDeckCount(side) {
  const deck = lastAppliedView?.[side]?.zones?.deck;
  return typeof deck?.count === 'number' ? deck.count : 0;
}

/**
 * Returns the neutral Stadium card as a single-element array, matching the
 * shape `hashState`'s `playerHashZones` builds server-side
 * (`state.stadium ? [state.stadium] : []`), or an empty array when there is
 * no Stadium in play or no view has been applied yet.
 *
 * @returns {object[]}
 */
export function getAuthoritativeStadiumArray() {
  return lastAppliedView?.stadium ? [lastAppliedView.stadium] : [];
}

/**
 * Resolves the DOM document and zone container for a player side ('you' | 'them').
 *
 * @param {string} side 'you' | 'them'
 * @param {string} zoneId Zone name
 * @param {object} [options] Injected overrides for headless tests
 * @returns {{ element: HTMLElement|null, array: object[] }}
 */
function resolveZone(side, zoneId, options = {}) {
  if (typeof options.getZone === 'function') {
    return options.getZone(side, zoneId);
  }

  // Production wiring (design 002 slice 3.6): the real legacy zone resolver,
  // injected via setDefaultNetcodeContext({ getZone }) in
  // socket-event-listeners.js. Its `user` terminology ('self' | 'opp') is
  // adapted from this renderer's `side` terminology ('you' | 'them') here so
  // the injected module itself stays untouched.
  if (typeof defaultNetcodeContext.getZone === 'function') {
    const user = side === 'you' ? 'self' : 'opp';
    return defaultNetcodeContext.getZone(user, zoneId);
  }

  const doc =
    options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc) return { element: null, array: [] };

  const element = doc.getElementById ? doc.getElementById(zoneId) : null;
  return { element, array: [] };
}

/**
 * Probes one render target per side before any mutation. A blind renderer (no resolvable
 * zone element on one or both sides — e.g. `window.__getZone` unset and no injected
 * `options.getZone`) must not write to the DOM at all: see file header invariant.
 *
 * @param {object} options Renderer options (forwarded to resolveZone)
 * @returns {{ ok: boolean, reason?: string }}
 */
function resolveRenderTargets(options = {}) {
  const sides = ['you', 'them'];
  for (const side of sides) {
    const zone = resolveZone(side, 'active', options);
    if (!zone.element) {
      return { ok: false, reason: 'no_render_target' };
    }
  }
  return { ok: true };
}

/**
 * Resolves the per-player card-back skin ("sleeve") a redacted card or a deck
 * cover should display, mirroring `updateDestinationCover`'s inline choice
 * (`client/src/actions/move-card-bundle/update-cover.js`): the owner's own
 * chosen back for 'you', the matching opponent back (`p1OppCardBackSrc` in 1P,
 * `p2OppCardBackSrc` in 2P) for 'them'. Falls back to `options.cardBackSrc` or
 * the bundled default when `systemState` isn't wired (tests, or before
 * `setDefaultNetcodeContext` has run).
 *
 * @param {string} side 'you' | 'them'
 * @param {object} options
 * @returns {string}
 */
function resolveCardBackSrc(side, options = {}) {
  const fallback = options.cardBackSrc || '/src/assets/cardback.png';
  const systemState = options.systemState || defaultNetcodeContext.systemState;
  if (!systemState) return fallback;

  if (side === 'you') return systemState.cardBackSrc || fallback;
  return (
    (systemState.isTwoPlayer
      ? systemState.p2OppCardBackSrc
      : systemState.p1OppCardBackSrc) || fallback
  );
}

/**
 * Creates or updates an image element for a card representation.
 *
 * @param {object} cardData Pure card data from view
 * @param {string} side 'you' | 'them'
 * @param {string} zoneId Zone name
 * @param {object} options Renderer options
 * @returns {HTMLElement}
 */
function createOrUpdateCardElement(cardData, side, zoneId, options = {}) {
  const doc =
    options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.createElement !== 'function') {
    return {
      tagName: 'IMG',
      dataset: {},
      style: {},
      classList: { add: () => {}, remove: () => {} },
      setAttribute: () => {},
      removeAttribute: () => {},
    };
  }

  const instanceId = cardData.instanceId;
  const isRedacted = !cardData.name && !cardData.src;
  const cardBackSrc = resolveCardBackSrc(side, options);
  const displaySrc = isRedacted ? cardBackSrc : cardData.src || cardBackSrc;

  let record = cardRegistry.get(instanceId);
  let img = record?.element;

  if (!img) {
    // Design 002 slice 3.6: build through the same factory as the legacy
    // `Card` class (`buildCardImage`) so the two renderers never diverge
    // into subtly-different <img> construction again (N1's root cause).
    // The interaction listeners themselves are only attached once the
    // production wiring has injected them (setDefaultNetcodeContext in
    // socket-event-listeners.js) — apply-view.js cannot statically import
    // them itself (they pull in state.js, which is unimportable outside a
    // browser). Unwired (tests, or before that wiring lands) the card is a
    // bare, non-interactive <img> — identical to pre-3.6 behavior.
    const cardListeners =
      options.cardListeners || defaultNetcodeContext.cardListeners;
    const user = side === 'you' ? 'self' : side === 'them' ? 'opp' : side;
    img = buildCardImage(doc, {
      user,
      type: cardData.type,
      draggable: true,
      ...(cardListeners || {}),
    });
    img.className = 'card-image';
    if (cardListeners) {
      // Seed the drag-state fields legacy listeners read directly off the
      // element (`.attached`, `.layer`, ...; see reset-image.js), and give
      // them a `.card` to read identity off of via identifyCard/
      // findZoneCardIndex. This is a read-oriented shim, not a legacy Card
      // instance: it has no `.attachedCards`, no evolve/attach behavior.
      // Zone-mutating interactions (drag completing a move, evolve, attach)
      // still route through the legacy per-player zoneArrays, which the
      // authoritative renderer does not populate — that gap is real and is
      // the rest of Phase 3B's job (slices 3.7-3.10), not closed here.
      img.attached = false;
      img.layer = 0;
      img.energyLayer = 0;
      img.relative = 0;
      img.target = 'off';
      img.card = cardData;
    }
  }

  // Setting src — even to the same value — re-runs the image load and repaints.
  if (img.getAttribute?.('src') !== displaySrc) img.setAttribute('src', displaySrc);
  img.setAttribute('alt', cardData.name || 'Face-down card');
  img.dataset.instanceId = String(instanceId);
  img.dataset.zone = zoneId;
  img.dataset.side = side;

  // Track damage counter overlay on the element
  if (typeof cardData.damage === 'number' && cardData.damage > 0) {
    img.dataset.damage = String(cardData.damage);
  } else {
    delete img.dataset.damage;
  }

  // Track special condition overlay
  if (cardData.specialCondition) {
    img.dataset.specialCondition = cardData.specialCondition;
  } else {
    delete img.dataset.specialCondition;
  }

  // Track ability used marker
  if (cardData.abilityUsed) {
    img.dataset.abilityUsed = 'true';
  } else {
    delete img.dataset.abilityUsed;
  }

  // Update or insert registry entry
  if (!record) {
    record = {
      instanceId,
      element: img,
      card: { ...cardData },
      side,
      zone: zoneId,
      container: null,
      // Stable per-card shim for hydrateHolo, which keys its pending lookups
      // off the card object and stores the wrapper on it.
      holoCard: { image: img },
    };
    cardRegistry.set(instanceId, record);
  } else {
    if (record.zone === 'prizes' && zoneId !== 'prizes') {
      // The prize picker hides prize cards while they fan out; a chosen prize stays
      // hidden until the server moves it, so reveal it once it has left the prizes.
      img.classList?.remove('draw-flight-source');
      record.holoCard?.wrapper?.classList?.remove('draw-flight-source');
    }
    record.card = { ...cardData };
    record.side = side;
    record.zone = zoneId;
  }
  record.holoCard.name = cardData.name;
  record.holoCard.type = cardData.type;
  record.holoCard.user = img.user;
  record.isRedacted = isRedacted;
  // Keep the stamped data current: double-click previews read img.card
  // (preview-card.mjs), including the attachedCards rebuilt each view.
  if (img.card) img.card = record.card;

  return img;
}

/**
 * Server-side special conditions are stored as full words (`normalizeSpecialCondition`
 * in dual-run-bridge.js); the legacy overlay styling helpers (`getSpecialConditionClass`)
 * key off the short editable codes ('P', 'B', 'A', 'PA', 'C'). Translate at the render
 * boundary so `special-condition-style-apply.js` stays untouched and shared with legacy.
 */
const CONDITION_WORD_TO_CODE = {
  Poisoned: 'P',
  Burned: 'B',
  Asleep: 'A',
  Paralyzed: 'PA',
  Confused: 'C',
};

function getRect(el) {
  if (el && typeof el.getBoundingClientRect === 'function') {
    return el.getBoundingClientRect();
  }
  return { left: 0, top: 0, width: 0, height: 0 };
}

/**
 * Positions a counter/status overlay relative to its card image, replicating the
 * absolute-positioning scheme `damage-counter.js`/`special-condition.js` use.
 *
 * @param {object} overlay
 * @param {object} targetRect Card image's bounding rect
 * @param {object} zoneRect Zone element's bounding rect
 * @param {{ leftOffset: number, size: number, fontSize: number, topOffset?: number }} spec
 */
function positionOverlay(
  overlay,
  targetRect,
  zoneRect,
  { leftOffset, size, fontSize, topOffset = 0 }
) {
  overlay.style.display = 'inline-block';
  overlay.style.left = `${targetRect.left - zoneRect.left + leftOffset}px`;
  overlay.style.top = `${targetRect.top - zoneRect.top + targetRect.height / 4 + topOffset}px`;
  overlay.style.width = `${size}px`;
  overlay.style.height = `${size}px`;
  overlay.style.lineHeight = `${size}px`;
  overlay.style.fontSize = `${fontSize}px`;
  overlay.style.zIndex = '1';
}

/**
 * Same self/opp-circle side class legacy counters use, keyed off `systemState.initiator`
 * instead of the browser-only `initiator` getter (`global-variables.js`) apply-view.js
 * cannot import.
 *
 * @param {string} side 'you' | 'them'
 * @param {object} options
 * @returns {string}
 */
function overlaySideClass(side, options = {}) {
  const systemState = options.systemState || defaultNetcodeContext.systemState;
  const initiatorIsSelf = systemState?.initiator === 'self';
  const user = side === 'you' ? 'self' : 'opp';
  if (user === 'self') return initiatorIsSelf ? 'self-circle' : 'opp-circle';
  return initiatorIsSelf ? 'opp-circle' : 'self-circle';
}

/**
 * Creates, updates or removes the damage-counter sibling `<div>` for a card, mirroring
 * `addDamageCounter`/`updateDamageCounter`/`removeDamageCounter`
 * (`client/src/actions/counters/damage-counter.js`) but display-only: this reconciles
 * from the authoritative view, it never emits a command. Reuses `img.damageCounter` as
 * the storage slot so a legacy-built counter (reached via `cardListeners`' contextmenu
 * handler once zoneArrays support authoritative cards) and this reconciliation never
 * fight over two different nodes (design 002's N1 mechanism, applied to overlays).
 *
 * @param {object} cardData
 * @param {object} img
 * @param {object|null} zoneElement
 * @param {string} side
 * @param {object} options
 */
function reconcileDamageOverlay(
  cardData,
  img,
  zoneElement,
  side,
  options = {},
  rectImg = img
) {
  const damage =
    typeof cardData.damage === 'number' && cardData.damage > 0
      ? cardData.damage
      : 0;

  if (damage <= 0) {
    if (img.damageCounter) {
      if (img.damageCounter.parentNode) {
        img.damageCounter.parentNode.removeChild(img.damageCounter);
      }
      img.damageCounter = null;
    }
    return;
  }

  const doc =
    img.ownerDocument ||
    options.document ||
    (typeof document !== 'undefined' ? document : null);
  let counter = img.damageCounter;
  if (!counter) {
    if (!doc || typeof doc.createElement !== 'function') return;
    counter = doc.createElement('div');
    counter.contentEditable = 'false';
    counter.className = overlaySideClass(side, options);
    img.damageCounter = counter;
  }

  counter.textContent = String(damage);
  counter.classList.add('damage-counter');
  counter.classList.remove(...DAMAGE_COUNTER_TIERS);
  counter.classList.add(getDamageCounterTier(damage));

  if (zoneElement && counter.parentNode !== zoneElement) {
    zoneElement.appendChild(counter);
  }

  const targetRect = getRect(rectImg);
  const zoneRect = getRect(zoneElement);
  positionOverlay(counter, targetRect, zoneRect, {
    leftOffset: targetRect.width / 1.5,
    size: targetRect.width / 3,
    fontSize: targetRect.width / 6,
  });
}

// Where each condition's marker `<div>` is stored on the card image (design 011): the
// rotation condition keeps legacy's `img.specialCondition` slot; Poison and Burn stack
// with it, so each gets a slot of its own.
export const CONDITION_MARKER_SLOTS = {
  rotation: 'specialCondition',
  Poisoned: 'poisonMarker',
  Burned: 'burnMarker',
};

function removeOverlaySlot(img, slot) {
  const overlay = img[slot];
  if (!overlay) return;
  if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  img[slot] = null;
}

/**
 * Creates, updates or removes the special-condition sibling `<div>`s for a card, mirroring
 * `addSpecialCondition`/`updateSpecialCondition`/`removeSpecialCondition`
 * (`client/src/actions/counters/special-condition.js`) but display-only — see
 * `reconcileDamageOverlay`'s header for why. One marker per held condition, stacked
 * top-down in the order rotation condition, Poison, Burn.
 *
 * @param {object} cardData
 * @param {object} img
 * @param {object|null} zoneElement
 * @param {string} side
 * @param {object} options
 */
function reconcileSpecialConditionOverlay(
  cardData,
  img,
  zoneElement,
  side,
  options = {},
  rectImg = img
) {
  const held = listConditions(cardData);
  const markersInDisplayOrder = [
    ...held
      .filter((c) => ROTATION_CONDITIONS.includes(c))
      .map((c) => [CONDITION_MARKER_SLOTS.rotation, c]),
    ...held
      .filter((c) => !ROTATION_CONDITIONS.includes(c))
      .map((c) => [CONDITION_MARKER_SLOTS[c], c]),
  ];
  const wantedSlots = new Set(markersInDisplayOrder.map(([slot]) => slot));
  for (const slot of Object.values(CONDITION_MARKER_SLOTS)) {
    if (!wantedSlots.has(slot)) removeOverlaySlot(img, slot);
  }
  if (markersInDisplayOrder.length === 0) return;

  const doc =
    img.ownerDocument ||
    options.document ||
    (typeof document !== 'undefined' ? document : null);
  const targetRect = getRect(rectImg);
  const zoneRect = getRect(zoneElement);
  const size = targetRect.width / 3;

  markersInDisplayOrder.forEach(([slot, condition], position) => {
    let marker = img[slot];
    if (!marker) {
      if (!doc || typeof doc.createElement !== 'function') return;
      marker = doc.createElement('div');
      marker.contentEditable = 'false';
      marker.className = overlaySideClass(side, options);
      img[slot] = marker;
    }

    applySpecialConditionStyle(
      marker,
      CONDITION_WORD_TO_CODE[condition] || condition
    );

    if (zoneElement && marker.parentNode !== zoneElement) {
      zoneElement.appendChild(marker);
    }

    positionOverlay(marker, targetRect, zoneRect, {
      leftOffset: 0,
      topOffset: position * size,
      size,
      fontSize: targetRect.width / 4,
    });
  });
}

/**
 * Reconciles both counter overlays for one card. Called after `placeCardInZone` so the
 * image has already been inserted into its final zone (position math reads the live rect).
 *
 * @param {object} cardData
 * @param {object} img
 * @param {object|null} zoneElement
 * @param {string} side
 * @param {object} options
 */
function reconcileCardOverlays(
  cardData,
  img,
  zoneElement,
  side,
  options = {},
  rectImg = img
) {
  reconcileDamageOverlay(cardData, img, zoneElement, side, options, rectImg);
  reconcileSpecialConditionOverlay(
    cardData,
    img,
    zoneElement,
    side,
    options,
    rectImg
  );
  reconcileAbilityOverlay(cardData, img, zoneElement, side, options, rectImg);
}

/**
 * The "ability used" tab legacy `addAbilityCounter` (ability-counter.js)
 * draws across the card's middle, display-only like the other overlays.
 * Stored in `img.abilityCounter`, the same slot legacy uses.
 */
function reconcileAbilityOverlay(
  cardData,
  img,
  zoneElement,
  side,
  options = {},
  rectImg = img
) {
  if (!cardData.abilityUsed) {
    if (img.abilityCounter) {
      if (img.abilityCounter.parentNode)
        img.abilityCounter.parentNode.removeChild(img.abilityCounter);
      img.abilityCounter = null;
    }
    return;
  }

  const doc =
    img.ownerDocument ||
    options.document ||
    (typeof document !== 'undefined' ? document : null);
  let tab = img.abilityCounter;
  if (!tab) {
    if (!doc || typeof doc.createElement !== 'function') return;
    tab = doc.createElement('div');
    tab.className = side === 'you' ? 'self-tab' : 'opp-tab';
    img.abilityCounter = tab;
  }
  if (zoneElement && tab.parentNode !== zoneElement) {
    zoneElement.appendChild(tab);
  }

  const targetRect = getRect(rectImg);
  const zoneRect = getRect(zoneElement);
  tab.style.display = 'inline-block';
  tab.style.left = `${targetRect.left - zoneRect.left}px`;
  tab.style.top = `${targetRect.top - zoneRect.top + targetRect.height / 2}px`;
  tab.style.width = `${targetRect.width}px`;
  tab.style.height = `${targetRect.width / 5}px`;
  tab.style.lineHeight = `${targetRect.width / 3}px`;
  tab.style.zIndex = '1';
}

/**
 * Re-positions every in-play card's overlays against its current rect.
 * Overlays are absolutely positioned from a measured rect, so a window
 * resize leaves them behind until the next view (legacy counters re-add on
 * resize for the same reason).
 */
export function repositionCardOverlays(options = lastOverlayOptions) {
  if (!options) return;
  for (const record of cardRegistry.values()) {
    if (!record.overlayImage || !record.element.parentNode) continue;
    const zone = resolveZone(record.side, record.zone, options);
    if (!zone.element) continue;
    const overlayData = {
      ...record.card,
      abilityUsed: Boolean(record.element.abilityCounter),
    };
    reconcileCardOverlays(
      overlayData,
      record.element,
      zone.element,
      record.side,
      options,
      record.overlayImage
    );
  }
}

/**
 * The registry record whose `.play-container` hosts this attachment.
 *
 * The immediate `attachedTo` parent is not always the host: the server keeps
 * evolutions attached under the Basic (D40), so a parent that is itself an
 * attachment (an evolution in the stack) owns no container of its own. Walking up
 * to the nearest ancestor that has one keeps the card inside its host's
 * `.play-container`, the way legacy `attach-card.js` inserted it beside the target
 * card's own anchor. Returns null when no ancestor in the chain hosts a container
 * — the caller then falls through to the unchanged top-level branch.
 *
 * @param {object} cardData
 * @param {string} zoneId
 * @returns {object|null}
 */
function attachmentHostRecord(cardData, zoneId) {
  if (!PLAY_ZONES.includes(zoneId) || cardData.attachedTo == null) return null;

  // `visited` only guards a malformed view that points a card's `attachedTo` at
  // itself or into a cycle: this walk must never spin the render loop.
  const visited = new Set();
  let record = cardRegistry.get(cardData.attachedTo);
  while (record && !record.container && !visited.has(record)) {
    visited.add(record);
    const hostId = record.card?.attachedTo;
    record = hostId != null ? cardRegistry.get(hostId) : null;
  }
  return record?.container ? record : null;
}

/**
 * Places a card element into its target zone, handling play-containers and attachments.
 *
 * @param {object} cardData
 * @param {string} side
 * @param {string} zoneId
 * @param {object} options
 * @returns {{ attachedParent: object|null }} the parent's registry record when the
 *   card was placed as an attachment
 */
function placeCardInZone(cardData, side, zoneId, options = {}) {
  const doc =
    options.document || (typeof document !== 'undefined' ? document : null);
  const zone = resolveZone(side, zoneId, options);
  const record = cardRegistry.get(cardData.instanceId);
  if (!zone.element || !record) return { attachedParent: null };

  const img = record.element;
  const parentRecord = attachmentHostRecord(cardData, zoneId);

  // A card fresh out of a duplicate hand stack still carries that stack's inline
  // positioning (`position: absolute` plus a `translateY` lift, written by
  // hand-stack-dom.js). That is only valid inside `#hand`; anywhere else it outranks
  // the destination's own rules (`.play-container img`, `.play-container .mat-holo`),
  // so the card does not draw where its slot is — the zone keeps the space and the card
  // is missing from it until a re-render builds a clean element. This covers an
  // Evolution played onto a Pokémon too (attached branch below), not only a card
  // placed on its own. The hand keeps its styles, because that is where they belong.
  if (zoneId !== 'hand') {
    defaultNetcodeContext.clearHandStackPositioning?.(cardNodeOf(record));
    defaultNetcodeContext.clearHandStackPositioning?.(img);
  }

  // Handle play zones (active & bench)
  if (parentRecord && parentRecord.container) {
    // Holo is settled after stack layout (reconcilePlacedCard): only the
    // stack's visible card, e.g. a Stage 1 attached under its Basic, keeps foil.
    // Append attached card under parent container with attached style.
    // Placed in view order, so sibling order among a parent's attachments
    // is reconciled every view (finding #10).
    img.classList.add('attached-card');
    placeInViewOrder(parentRecord.container, cardNodeOf(record));
    return { attachedParent: parentRecord };
  }

  // A card that was attached last view (and maybe drawn as an Energy token)
  // must lose that look wherever it lands now, not only on the
  // leaves-play-zones branch (finding #11).
  img.classList.remove('attached-card');
  clearStackStyle(img);
  const node = cardNodeOf(record);

  if (PLAY_ZONES.includes(zoneId)) {
    // Top-level active/bench Pokemon: wrap in .play-container.
    let container = record.container;
    if (!container || !container.parentNode) {
      container = doc.createElement('div');
      container.className = 'play-container';
      container.dataset.instanceId = String(cardData.instanceId);
      record.container = container;
    }
    // Reconciles both the image-within-container order and the
    // container-within-zone order (finding #10) on every view.
    placeInViewOrder(container, node);
    placeInViewOrder(zone.element, container);
    return { attachedParent: null };
  }

  // If card was previously in a play-container, clean up container
  if (record.container && record.container.parentNode) {
    record.container.parentNode.removeChild(record.container);
    record.container = null;
  }

  // Reconciles intra-zone order to match the view's array order on every
  // applyView (finding #10) instead of freezing the first-seen DOM position.
  placeInViewOrder(zone.element, node);
  return { attachedParent: null };
}

// The node placed last in each parent during the current applyView.
let lastPlacedIn = new WeakMap();

const indexIn = (parent, node) => Array.prototype.indexOf.call(parent.children || [], node);

/**
 * Appends `node` to `parent` only when it is not already after the node placed
 * before it this view. Re-inserting a node detaches it, which restarts its CSS
 * animations (holo foil, status idles) and repaints the card — every card
 * blinked on every view when each one was re-appended unconditionally.
 */
function placeInViewOrder(parent, node) {
  const previous = lastPlacedIn.get(parent);
  lastPlacedIn.set(parent, node);
  if (node.parentNode === parent) {
    const previousIndex = previous?.parentNode === parent ? indexIn(parent, previous) : -1;
    if (indexIn(parent, node) > previousIndex) return;
  }
  parent.appendChild(node);
}

/**
 * The node that represents a card in its zone: its holo wrapper once
 * hydrated (the <img> then lives inside the wrapper's `.card__rotator`),
 * otherwise the bare <img>. Moving the <img> itself would tear it out of
 * the wrapper and leave an empty foil frame behind.
 *
 * @param {object} record
 * @returns {object}
 */
function cardNodeOf(record) {
  return record.holoCard?.wrapper || record.element;
}

function holoApi(options = {}) {
  return options.holo || defaultNetcodeContext.holo || null;
}

function unhydrateCard(record, options = {}) {
  if (!record.holoCard?.wrapper) return;
  holoApi(options)?.unhydrate?.(record.holoCard);
}

/**
 * Gives a face-up card in a holo zone its holofoil wrapper (async, idempotent:
 * hydrateHolo returns early once `card.wrapper` exists), and strips it from
 * face-down cards and cards in zones legacy never foils.
 *
 * @param {object} record
 * @param {string} zoneId
 * @param {boolean} isAttached
 * @param {object} options
 */
function reconcileHolo(record, zoneId, isAttached, options = {}) {
  const holo = holoApi(options);
  if (!holo) return;
  const wantsHolo =
    !isAttached &&
    !record.isRedacted &&
    Boolean(record.holoCard.name) &&
    HOLO_ZONES.includes(zoneId);
  if (!wantsHolo) {
    unhydrateCard(record, options);
    return;
  }
  if (!record.element.parentNode) return;
  try {
    const pending = holo.hydrate?.(record.holoCard);
    pending?.catch?.(() => {});
  } catch {
    // A holo failure is cosmetic; the card is already placed.
  }
}

/**
 * Undoes every inline style and token swap `layoutCardStack` wrote, so a card
 * that left a stack (or changed its place in one) starts from a clean <img>.
 * `createOrUpdateCardElement` has already reset `src` to the card art.
 */
function clearStackStyle(img) {
  if (!img.dataset?.stackStyled || !img.style) return;
  delete img.dataset.stackStyled;
  delete img.dataset.energyCardSrc;
  img.classList.remove('energy-token-3d');
  for (const key of STACK_STYLE_KEYS) img.style[key] = '';
}

function setStackStyle(img, styles) {
  if (!img.dataset || !img.style) return;
  img.dataset.stackStyled = 'true';
  img.style.position = 'absolute';
  for (const [key, value] of Object.entries(styles)) img.style[key] = value;
}

/**
 * Draws an attached Energy as the same small round type token legacy
 * attach-card.js uses: full card art stashed in `data-energy-card-src` (the
 * double-click carousel shows it), a row along the visible card's bottom
 * edge, layered above its face.
 *
 * @returns {boolean} whether a token was drawn
 */
function applyEnergyToken(img, cardData, cardWidth, cardHeight, layer) {
  const tokenSrc = getEnergyTokenFront(cardData);
  if (!tokenSrc || !img.dataset || !img.style) return false;
  const tokenSize = cardWidth * ENERGY_TOKEN_SIZE;
  const cardArt = img.getAttribute('src');
  setStackStyle(img, {
    width: `${tokenSize}px`,
    height: `${tokenSize}px`,
    left: `${(layer - 1) * tokenSize * ENERGY_TOKEN_SPACING}px`,
    bottom: `${cardHeight * ENERGY_TOKEN_BOTTOM}px`,
    zIndex: String(100 + layer),
  });
  img.dataset.energyCardSrc = cardArt;
  img.setAttribute('src', tokenSrc);
  img.classList.add('energy-token-3d');
  img.energyLayer = layer;
  return true;
}

/**
 * Lays out one in-play Pokémon's stack the way legacy attach/evolve does.
 * The server keeps evolutions attached under the Basic (D40), so the highest
 * Stage card is drawn as the visible card; the Basic and lower Stages peek out
 * underneath, Tools and token-less cards fan out behind to the right (growing
 * the slot), and Energy becomes tokens on the visible card.
 *
 * @param {object} rootRecord
 * @param {{ cardData: object, record: object }[]} attached in view order
 * @returns {object} the registry record of the visible card
 */
function layoutCardStack(rootRecord, attached) {
  const stackCards = [rootRecord.card, ...attached.map((a) => a.cardData)];
  const top = topPokemonCard(stackCards, rootRecord.card);
  const displayRecord = cardRegistry.get(top.instanceId) || rootRecord;
  const displayImg = displayRecord.element;

  const members = [rootRecord, ...attached.map((a) => a.record)];
  for (const record of members) clearStackStyle(record.element);
  const cardWidth = displayImg.clientWidth || 0;
  const cardHeight = displayImg.clientHeight || 0;
  rootRecord.stackAttached = attached;
  if (!cardWidth) relayoutWhenLoaded(rootRecord, displayImg);

  // Closest Stage under the visible card first: the one attached last.
  const underPokemon = members
    .filter((record) => record !== displayRecord && isPokemon(record.card))
    .reverse();
  // Pin `left`: an absolute card with `left: auto` keeps its static position, which
  // lands beside the visible card whenever it follows that card in DOM order (a swap
  // re-emits the stack as [top Evolution, Stage 1, Basic]).
  underPokemon.forEach((record, i) => {
    const layer = i + 1;
    setStackStyle(record.element, {
      left: '0px',
      bottom: `${layer * cardWidth * UNDER_POKEMON_SHIFT}px`,
      zIndex: String(-layer),
    });
  });

  let tokenLayer = 0;
  let shiftLayer = 0;
  for (const { cardData, record } of attached) {
    if (record === displayRecord || isPokemon(cardData)) continue;
    const img = record.element;
    if (
      isEnergyCard(cardData) &&
      applyEnergyToken(img, cardData, cardWidth, cardHeight, tokenLayer + 1)
    ) {
      tokenLayer += 1;
      continue;
    }
    shiftLayer += 1;
    setStackStyle(img, {
      left: `${shiftLayer * cardWidth * ATTACHED_CARD_SHIFT}px`,
      zIndex: String(-shiftLayer),
    });
  }
  if (rootRecord.container?.style) {
    rootRecord.container.style.width =
      shiftLayer > 0 && cardWidth
        ? `${cardWidth * (1 + shiftLayer * ATTACHED_CARD_SHIFT)}px`
        : '';
  }

  // The double-click carousel reads the clicked card's attachedCards
  // (click-events.js); only the visible card is clickable.
  for (const record of members) record.card.attachedCards = [];
  displayRecord.card.attachedCards = members
    .filter((record) => record !== displayRecord)
    .map((record) => ({ ...record.card, image: record.element }));
  return displayRecord;
}

/**
 * A card that just arrived has no size until its art loads, which would draw
 * every offset and token at 0px. Lay the stack out again once it has one.
 */
function relayoutWhenLoaded(rootRecord, displayImg) {
  if (
    displayImg.complete !== false ||
    typeof displayImg.addEventListener !== 'function'
  )
    return;
  if (displayImg.stackRelayoutPending) return;
  displayImg.stackRelayoutPending = true;
  displayImg.addEventListener(
    'load',
    () => {
      displayImg.stackRelayoutPending = false;
      if (cardRegistry.get(rootRecord.instanceId) !== rootRecord) return;
      layoutCardStack(rootRecord, rootRecord.stackAttached || []);
      repositionCardOverlays();
    },
    { once: true }
  );
}

/**
 * @param {{ cardData: object, zoneId: string, record: object, attachedParent: object|null }[]} placed
 * @returns {Map<object, object>} root record -> visible card record
 */
function layoutCardStacks(placed) {
  const attachedByRoot = new Map();
  for (const entry of placed) {
    if (!entry.attachedParent) continue;
    if (!attachedByRoot.has(entry.attachedParent))
      attachedByRoot.set(entry.attachedParent, []);
    attachedByRoot.get(entry.attachedParent).push(entry);
  }
  const displayByRoot = new Map();
  for (const entry of placed) {
    if (entry.attachedParent || !PLAY_ZONES.includes(entry.zoneId)) continue;
    displayByRoot.set(
      entry.record,
      layoutCardStack(entry.record, attachedByRoot.get(entry.record) || [])
    );
  }
  return displayByRoot;
}

function bindOverlayResize() {
  if (
    resizeListenerBound ||
    typeof window === 'undefined' ||
    typeof window.addEventListener !== 'function'
  )
    return;
  resizeListenerBound = true;
  window.addEventListener('resize', () => repositionCardOverlays());
}

/**
 * Server rotation (reduce.mjs rotateCard) as the inline transform legacy
 * rotate-card.js writes. Attached cards turn with their root (syncRotation).
 */
function applyRotation(img, rotation) {
  if (!img.dataset || !img.style) return;
  const degrees = Number(rotation) || 0;
  if (degrees === 0) {
    if (img.dataset.rotation) {
      delete img.dataset.rotation;
      img.style.transform = '';
    }
    return;
  }
  img.dataset.rotation = String(degrees);
  img.style.transform = `rotate(${degrees}deg)`;
}

const NO_OVERLAYS = { damage: 0, specialCondition: null, abilityUsed: false };

/**
 * Per-card work that depends on the finished stack layout: rotation, holofoil
 * (only the visible card of a stack keeps its foil) and counter overlays
 * (drawn on the visible card, from the root's damage/conditions).
 */
function reconcilePlacedCard(entry, displayByRoot, options = {}) {
  const { cardData, side, zoneId, record, attachedParent } = entry;
  const root = attachedParent || record;
  const displayRecord = displayByRoot.get(root) || root;
  const isVisible = record === displayRecord;

  applyRotation(record.element, root.card.rotation);
  reconcileHolo(record, zoneId, !isVisible, options);

  const zone = resolveZone(side, zoneId, options);
  if (attachedParent) {
    reconcileCardOverlays(
      NO_OVERLAYS,
      record.element,
      zone.element,
      side,
      options
    );
    return;
  }
  record.overlayImage = displayRecord.element;
  const overlayData = {
    ...cardData,
    abilityUsed: Boolean(
      cardData.abilityUsed || displayRecord.card.abilityUsed
    ),
  };
  if (displayRecord !== record) {
    // Overlays live on the root's <img> (their storage slot), positioned over the visible card.
    reconcileCardOverlays(
      NO_OVERLAYS,
      displayRecord.element,
      zone.element,
      side,
      options
    );
  }
  reconcileCardOverlays(
    overlayData,
    record.element,
    zone.element,
    side,
    options,
    displayRecord.element
  );
}

/**
 * Legacy count.js's `(<span id="deckCount">)` labels, from the view: the deck
 * is `{ count }`, every other zone an array (redacted cards still count).
 */
function reconcileZoneCounts(side, zones, options = {}) {
  for (const zoneId of COUNT_ZONES) {
    const zoneData = zones[zoneId];
    if (zoneData === undefined) continue;
    const count = Array.isArray(zoneData)
      ? zoneData.length
      : Number(zoneData?.count) || 0;
    const doc = resolveZone(side, zoneId, options).element?.ownerDocument;
    const label = doc?.getElementById?.(`${zoneId}Count`);
    if (label) label.textContent = String(count);
  }
}

/**
 * Legacy VSTAR-GX.js marks a spent once-per-game button `.used-special-move`;
 * the server tracks the same thing as player flags (useVStarGX sets both).
 */
function reconcileSpecialMoveButtons(side, flags, options = {}) {
  if (!flags || typeof flags !== 'object') return;
  const doc = resolveZone(side, 'active', options).element?.ownerDocument;
  if (!doc?.getElementById) return;
  const buttons = [
    ['VSTARButton', flags.vstarUsed],
    ['GXButton', flags.gxUsed],
  ];
  for (const [id, used] of buttons) {
    const button = doc.getElementById(id);
    if (!button) continue;
    if (used) button.classList.add('used-special-move');
    else button.classList.remove('used-special-move');
  }
}

const COVER_ZONES = ['deck', 'discard', 'lostZone'];

/**
 * Reconciles the top-card "Cover" preview image for deck/discard/lostZone
 * (design 002 slice 3.8, mirrors `updateOriginCover`/`updateDestinationCover`
 * in `client/src/actions/move-card-bundle/update-cover.js`), but display-only:
 * this reconciles from the authoritative view on every applyView, it never
 * emits a command, and it recomputes from scratch rather than reacting to a
 * single move.
 *
 * `deck` carries no card array in the view (`view.mjs`'s `redactOwnerZones`/
 * `redactOpponentZones` reduce it to `{ count }` — deck order is secret from
 * both players, including its own owner, by design; see design 002 O4-A /
 * I5). So the deck cover only ever shows the side's chosen card-back skin
 * when `count > 0`, never a card face. `discard`/`lostZone` are public
 * zones (full card arrays), so their cover mirrors the real top card — the
 * last entry, matching legacy's `array[array.length - 1]` convention.
 *
 * @param {string} side 'you' | 'them'
 * @param {string} zoneId 'deck' | 'discard' | 'lostZone'
 * @param {object[]|{count:number}|undefined} zoneData
 * @param {object} options
 */
function reconcileZoneCover(side, zoneId, zoneData, options = {}) {
  const zone = resolveZone(side, zoneId, options);
  if (!zone.elementCover) return;

  const key = `${side}:${zoneId}`;
  const isDeck = zoneId === 'deck';
  const topCard = isDeck
    ? null
    : Array.isArray(zoneData) && zoneData.length > 0
      ? zoneData[zoneData.length - 1]
      : null;
  const hasCards = isDeck
    ? Boolean(zoneData && zoneData.count > 0)
    : Boolean(topCard);

  if (!hasCards) {
    const existing = coverRegistry.get(key);
    if (existing?.parentNode) existing.parentNode.removeChild(existing);
    coverRegistry.delete(key);
    return;
  }

  const doc =
    options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.createElement !== 'function') return;

  const coverListeners =
    options.coverListeners || defaultNetcodeContext.coverListeners;
  const user = side === 'you' ? 'self' : 'opp';
  const id = `${zoneId}Cover`;

  let img = coverRegistry.get(key);
  if (!img) {
    img = buildCardImage(doc, {
      user,
      id,
      draggable: true,
      ...(coverListeners || {}),
    });
    // Same as legacy Cover: the <img> shares its container's id
    // (`discardCover`), so the container's `#discardCover { position: fixed }`
    // rule also matches the image; resetImage's inline `position: relative`
    // keeps it inside the slot instead of at natural size across the board.
    resetImage(img);
    coverRegistry.set(key, img);
  }

  const src = isDeck
    ? resolveCardBackSrc(side, options)
    : topCard.src || resolveCardBackSrc(side, options);
  img.setAttribute('src', src);
  img.setAttribute('alt', isDeck ? id : topCard.name || id);

  // Legacy keeps exactly one child in elementCover, replacing it on every
  // update (`update-cover.js`'s removeChild-then-appendChild pattern).
  if (img.parentNode !== zone.elementCover) {
    while (
      zone.elementCover.children &&
      zone.elementCover.children.length > 0
    ) {
      zone.elementCover.removeChild(zone.elementCover.children[0]);
    }
    zone.elementCover.appendChild(img);
  }
}

/**
 * Reconciles the neutral Stadium card in the top-level document.
 *
 * @param {object|null} stadiumCard
 * @param {object} options
 */
function reconcileStadium(stadiumCard, localPlayerId, options = {}) {
  const doc =
    options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;

  const stadiumElement = doc.getElementById
    ? doc.getElementById('stadium')
    : null;
  if (!stadiumElement) return;

  if (!stadiumCard) {
    // Clear stadium
    if (stadiumElement.innerHTML !== undefined) {
      stadiumElement.innerHTML = '';
    }
    return;
  }

  const img = createOrUpdateCardElement(
    stadiumCard,
    'neutral',
    'stadium',
    options
  );
  unhydrateCard(cardRegistry.get(stadiumCard.instanceId), options);
  // Legacy update-stadium-card.js: the Stadium reads upright for whoever played it.
  const ownerId = stadiumCard.ownerId || stadiumCard.playerId || null;
  setStadiumFacing(
    stadiumElement,
    Boolean(ownerId && localPlayerId && ownerId !== localPlayerId)
  );
  if (img.parentNode !== stadiumElement) {
    if (stadiumElement.innerHTML !== undefined) {
      stadiumElement.innerHTML = '';
    }
    stadiumElement.appendChild(img);
  }
}

/**
 * Renders or removes the PendingChoice interactive modal.
 *
 * @param {object|null} pendingChoice
 * @param {string|null} localPlayerId
 * @param {object} options
 */
function reconcilePendingChoice(pendingChoice, localPlayerId, options = {}) {
  const doc =
    options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;

  const existingModal = doc.getElementById
    ? doc.getElementById('netcodeChoiceModal')
    : null;
  const existingBanner = doc.getElementById
    ? doc.getElementById('netcodeChoiceBanner')
    : null;

  if (!pendingChoice) {
    closePrizePicker(options);
    closeMatPicker(options);
    closeChoicePicker(options);
    if (existingModal?.parentNode)
      existingModal.parentNode.removeChild(existingModal);
    if (existingBanner?.parentNode)
      existingBanner.parentNode.removeChild(existingBanner);
    return;
  }

  const isOwner =
    !pendingChoice.player || pendingChoice.player === localPlayerId;

  if (!isOwner) {
    // Opponent is choosing: show non-interactive waiting banner
    closePrizePicker(options);
    closeMatPicker(options);
    closeChoicePicker(options);
    if (existingModal?.parentNode)
      existingModal.parentNode.removeChild(existingModal);
    let banner = existingBanner;
    if (!banner) {
      banner = doc.createElement('div');
      banner.id = 'netcodeChoiceBanner';
      banner.className = 'choice-waiting-banner';
      doc.body?.appendChild(banner);
    }
    banner.textContent = `Opponent is making a choice: ${pendingChoice.prompt || '...'}`;
    return;
  }

  // Local player must make a choice: mount interactive picker
  if (existingBanner?.parentNode)
    existingBanner.parentNode.removeChild(existingBanner);

  if (openChoiceInPrizePicker(pendingChoice, options)) {
    closeMatPicker(options);
    closeChoicePicker(options);
    if (existingModal?.parentNode)
      existingModal.parentNode.removeChild(existingModal);
    return;
  }
  closePrizePicker(options);

  if (openChoiceInMatPicker(pendingChoice, options)) {
    closeChoicePicker(options);
    if (existingModal?.parentNode)
      existingModal.parentNode.removeChild(existingModal);
    return;
  }
  closeMatPicker(options);

  if (openChoiceInCardPicker(pendingChoice, options)) {
    if (existingModal?.parentNode)
      existingModal.parentNode.removeChild(existingModal);
    return;
  }
  closeChoicePicker(options);

  let modal = existingModal;
  if (!modal) {
    modal = doc.createElement('div');
    modal.id = 'netcodeChoiceModal';
    modal.className = 'choice-modal-overlay';
    doc.body?.appendChild(modal);
  } else if (modal.children) {
    while (modal.children.length > 0) {
      modal.removeChild(modal.children[0]);
    }
  }

  const min = pendingChoice.min ?? 1;
  const max = pendingChoice.max ?? 1;
  const selectedIds = new Set();
  if (modal.dataset) modal.dataset.min = String(min);

  const container = doc.createElement('div');
  container.className = 'choice-modal-container';
  modal.appendChild(container);

  const title = doc.createElement('h3');
  title.className = 'choice-modal-title';
  title.textContent = pendingChoice.prompt || 'Make a choice';
  container.appendChild(title);

  const optionsContainer = doc.createElement('div');
  optionsContainer.id = 'choiceOptionsContainer';
  optionsContainer.className = 'choice-modal-options';
  container.appendChild(optionsContainer);

  const footer = doc.createElement('div');
  footer.className = 'choice-modal-footer';
  container.appendChild(footer);

  const confirmBtn = doc.createElement('button');
  confirmBtn.id = 'choiceConfirmBtn';
  confirmBtn.className = 'choice-confirm-btn';
  confirmBtn.disabled = true;
  confirmBtn.textContent = `Confirm (0/${max})`;
  footer.appendChild(createViewBoardButton(doc, modal));
  footer.appendChild(confirmBtn);

  const updateConfirmState = () => {
    const count = selectedIds.size;
    confirmBtn.disabled = count < min || count > max;
    confirmBtn.textContent = `Confirm (${count}/${max})`;
  };

  const optionsList = Array.isArray(pendingChoice.options)
    ? pendingChoice.options
    : [];
  for (const opt of optionsList) {
    const optDiv = doc.createElement('div');
    optDiv.className = 'choice-option-card';
    optDiv.dataset.instanceId = String(opt.instanceId);

    // Artless options are answers (Yes/No sentinels), not cards: a cardback per
    // option would make them indistinguishable, so show their label instead.
    if (opt.src) {
      const optImg = doc.createElement('img');
      optImg.src = opt.src;
      optImg.alt = opt.name || 'Card';
      optDiv.appendChild(optImg);
    } else {
      optDiv.classList.add('choice-option-text');
      optDiv.textContent = opt.name || `Option ${opt.instanceId}`;
    }

    optDiv.addEventListener?.('click', () => {
      if (selectedIds.has(opt.instanceId)) {
        selectedIds.delete(opt.instanceId);
        optDiv.classList.remove('selected');
      } else if (selectedIds.size < max) {
        selectedIds.add(opt.instanceId);
        optDiv.classList.add('selected');
      }
      updateConfirmState();
    });

    optionsContainer?.appendChild(optDiv);
  }

  confirmBtn?.addEventListener?.('click', async () => {
    confirmBtn.disabled = true;
    const selection = Array.from(selectedIds);
    try {
      await submitChoiceSelection(pendingChoice, selection, options);
    } finally {
      if (modal.parentNode) modal.parentNode.removeChild(modal);
    }
  });
}

async function submitChoiceSelection(pendingChoice, selection, options = {}) {
  if (typeof options.onResolveChoice === 'function') {
    options.onResolveChoice({ choiceId: pendingChoice.choiceId, selection });
    return;
  }
  const { socket, roomId } = await resolveNetcodeContext(options);
  if (socket && roomId) {
    emitResolveChoice({
      socket,
      roomId,
      choiceId: pendingChoice.choiceId,
      selection,
    });
  }
}

function choicePickerApi(options = {}) {
  return options.choicePicker || defaultNetcodeContext.choicePicker || null;
}

/**
 * Shows a card choice in the injected PTCG Live-style card picker (the same
 * one single-player rules mode uses) instead of the flat grid modal. Only
 * card choices qualify: every option needs art to draw a carousel slide.
 *
 * @returns {boolean} whether the picker owns this choice
 */
function openChoiceInCardPicker(pendingChoice, options = {}) {
  const picker = choicePickerApi(options);
  if (typeof picker?.open !== 'function') return false;
  const choiceOptions = Array.isArray(pendingChoice.options)
    ? pendingChoice.options
    : [];
  if (choiceOptions.length === 0 || !choiceOptions.every((opt) => opt?.src))
    return false;
  if (openPickerChoiceId === pendingChoice.choiceId) return true;

  closeChoicePicker(options);
  openPickerChoiceId = pendingChoice.choiceId;
  try {
    picker.open({
      choice: pendingChoice,
      onResolve: (selection) => {
        // Mirrors the modal, which unmounts on confirm: a later view that
        // still carries this choice (e.g. the server rejected it) reopens.
        openPickerChoiceId = null;
        return submitChoiceSelection(pendingChoice, selection, options);
      },
    });
  } catch (err) {
    openPickerChoiceId = null;
    console.error('[apply-view] card picker failed, using choice modal:', err);
    return false;
  }
  return true;
}

/**
 * Shows a prize pendingChoice (server `resumeToken.effectType === 'prizes'`) as the TCG
 * Live fly-up prize fan over this player's server-drawn prize cards. Falls back to the
 * choice modal when no picker is injected or a prize card isn't on the board yet.
 *
 * @returns {boolean} whether the prize picker owns this choice
 */
function openChoiceInPrizePicker(pendingChoice, options = {}) {
  if (pendingChoice.resumeToken?.effectType !== 'prizes') return false;
  const picker = options.prizePicker || defaultNetcodeContext.prizePicker;
  if (typeof picker?.open !== 'function') return false;
  if (openPrizeChoiceId === pendingChoice.choiceId) return true;

  const records = (pendingChoice.options || []).map((opt) =>
    cardRegistry.get(opt.instanceId)
  );
  if (records.length === 0 || records.some((record) => !record?.element))
    return false;
  const cards = records.map((record) => ({
    instanceId: record.instanceId,
    image: record.element,
    wrapper: record.holoCard?.wrapper,
  }));

  closePrizePicker(options);
  openPrizeChoiceId = pendingChoice.choiceId;
  try {
    picker.open({
      choice: pendingChoice,
      cards,
      onResolve: (selection) => {
        openPrizeChoiceId = null;
        return submitChoiceSelection(pendingChoice, selection, options);
      },
    });
  } catch (err) {
    openPrizeChoiceId = null;
    console.error('[apply-view] prize picker failed, using choice modal:', err);
    return false;
  }
  return true;
}

function closePrizePicker(options = {}) {
  if (openPrizeChoiceId == null) return;
  openPrizeChoiceId = null;
  (options.prizePicker || defaultNetcodeContext.prizePicker)?.close?.();
}

/**
 * Shows a pendingChoice whose options are all in-play Pokémon by outlining the real
 * cards on the mat (the legacy openMatPick UI, D19), instead of the card carousel.
 * Single-pick resolves on click; multi-pick toggles cards and confirms. Falls back
 * when no picker is injected or an option is not on the board.
 *
 * @returns {boolean} whether the mat picker owns this choice
 */
function openChoiceInMatPicker(pendingChoice, options = {}) {
  const picker = options.matPicker || defaultNetcodeContext.matPicker;
  if (typeof picker?.open !== 'function') return false;
  const request = buildMatPickerRequest(pendingChoice, cardRegistry);
  if (!request) return false;
  if (openMatChoiceId === pendingChoice.choiceId) return true;

  closeMatPicker(options);
  openMatChoiceId = pendingChoice.choiceId;
  try {
    picker.open({
      choice: pendingChoice,
      candidates: request.candidates,
      cancellable: request.cancellable,
      min: request.min,
      max: request.max,
      onResolve: (selection) => {
        // Mirrors the card picker: a resolved pick already tore its own UI down,
        // so a later view that still carries this choice reopens if rejected.
        openMatChoiceId = null;
        return submitChoiceSelection(pendingChoice, selection, options);
      },
      onCancel: () => {
        // Only a cancellable choice (min 0) reaches here; the required case hides
        // Cancel and ignores Escape. Report the decline so the server completes
        // the effect instead of leaving the choice pending forever.
        openMatChoiceId = null;
        if (request.cancellable) {
          return submitChoiceSelection(pendingChoice, [], options);
        }
      },
    });
  } catch (err) {
    openMatChoiceId = null;
    console.error('[apply-view] mat picker failed, using card picker:', err);
    return false;
  }
  return true;
}

function closeMatPicker(options = {}) {
  if (openMatChoiceId == null) return;
  openMatChoiceId = null;
  (options.matPicker || defaultNetcodeContext.matPicker)?.close?.();
}

function closeChoicePicker(options = {}) {
  if (openPickerChoiceId == null) return;
  openPickerChoiceId = null;
  choicePickerApi(options)?.close?.();
}

/**
 * Syncs the client's local rules turn state from the authoritative view.
 *
 * Design 002 slice 3.12: views have always carried turn.player/isYourTurn/number/phase,
 * but nothing ever applied them. Under the flag every legacy turn-advancing body is
 * skipped (design 003 gates attack/pass/takeTurn), so `rulesState.turnPlayer` stayed
 * frozen at whatever the local coin flip produced while the server advanced its own turn
 * — the next command from the client was then rejected with "It's not your turn."
 *
 * Deliberately does not dispatch `rules-turn-began`: rules-bridge.js hangs legacy
 * knockout/deck-out adjudication off that event, which the server now owns (I25). Instead
 * it dispatches `rules-turn-view-applied` — a display-only signal the HUD banner and status
 * badges listen for so they stop going stale, without re-arming any local adjudication.
 *
 * @param {object} view Authoritative redacted view
 * @param {object} [options={}]
 * @param {object} [options.rulesState] Test seam; defaults to the shared rulesState
 * @param {Document} [options.document] Test seam; defaults to the global document
 * @returns {{applied: boolean, reason?: string, turnPlayer?: string, changed?: boolean}}
 */
export function reconcileTurnState(view, options = {}) {
  const turn = view?.turn;
  if (!turn) return { applied: false, reason: 'no_turn' };
  // A spectator's view reports isYourTurn:false for both players (view.mjs), so there is
  // no honest self/opp mapping to make — leave a spectator's local state untouched.
  if (view.isSpectator || !view.you?.playerId) {
    return { applied: false, reason: 'spectator' };
  }

  const state = options.rulesState || rulesState;
  const turnPlayer = turn.isYourTurn ? 'self' : 'opp';
  const changed = state.turnPlayer !== turnPlayer;

  state.turnPlayer = turnPlayer;

  const bothActivesSet =
    Array.isArray(view.you?.zones?.active) &&
    view.you.zones.active.length > 0 &&
    Array.isArray(view.them?.zones?.active) &&
    view.them.zones.active.length > 0;

  if (!state.startingActiveDone && !bothActivesSet && (turn.number == null || turn.number <= 1)) {
    state.turnNumber = 0;
    state.phase = 'setup';
  } else {
    if (bothActivesSet) {
      state.startingActiveDone = true;
    }
    if (typeof turn.number === 'number') state.turnNumber = turn.number;
    if (typeof turn.phase === 'string') state.phase = turn.phase;
  }

  // Per-turn flags, for the same reason as the turn fields above: under the flag the legacy
  // bodies that used to set them (markRetreated, markSupporterPlayed, the energy-attach and
  // attack markers) are gated away, so `rulesState.flags` stays frozen while the SERVER
  // tracks the real ones. `canPerformAction` reads these, so a stale set makes the client
  // offer moves the server then rejects — "Already retreated this turn." after one retreat
  // is the reproducible case. The view already carries them (view.mjs's you/them.flags);
  // nothing applied them. Merged rather than replaced so any purely local flag the server
  // does not model survives.
  if (!state.flags || typeof state.flags !== 'object') state.flags = {};
  const sides = [
    ['self', view.you?.flags],
    ['opp', view.them?.flags],
  ];
  for (const [side, flags] of sides) {
    if (!flags || typeof flags !== 'object') continue;
    state.flags[side] = { ...(state.flags[side] || {}), ...flags };
  }

  const doc =
    options.document || (typeof document !== 'undefined' ? document : null);
  if (doc) {
    doc.dispatchEvent(
      new CustomEvent('rules-turn-view-applied', {
        detail: { player: turnPlayer },
      })
    );
  }

  return { applied: true, turnPlayer, changed };
}

/**
 * Renders or removes the Game Ended modal and dispatches win/loss announcements.
 *
 * @param {object} view Authoritative redacted view
 * @param {object} [options={}]
 */
export function reconcileGameEnded(view, options = {}) {
  const doc =
    options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;

  const existingModal = doc.getElementById
    ? doc.getElementById('netcodeEndModal')
    : null;
  const rulesEndScreen = doc.getElementById
    ? doc.getElementById('rulesEndScreen')
    : null;

  if (!view || view.turn?.phase !== 'ended') {
    if (existingModal?.parentNode) {
      existingModal.parentNode.removeChild(existingModal);
    }
    if (rulesEndScreen) {
      rulesEndScreen.hidden = true;
    }
    return;
  }

  // Phase is ended: ensure pending choice overlays are cleared
  const existingChoiceModal = doc.getElementById
    ? doc.getElementById('netcodeChoiceModal')
    : null;
  const existingChoiceBanner = doc.getElementById
    ? doc.getElementById('netcodeChoiceBanner')
    : null;
  if (existingChoiceModal?.parentNode)
    existingChoiceModal.parentNode.removeChild(existingChoiceModal);
  if (existingChoiceBanner?.parentNode)
    existingChoiceBanner.parentNode.removeChild(existingChoiceBanner);
  closeChoicePicker(options);

  const localPlayerId = view.you?.playerId || null;
  const isWinner = Boolean(
    view.winner && localPlayerId && view.winner === localPlayerId
  );
  const isLoser = Boolean(
    view.winner && localPlayerId && view.winner !== localPlayerId
  );

  let titleText = 'Game Over';
  if (isWinner) {
    titleText = 'Victory!';
  } else if (isLoser) {
    titleText = 'Defeat';
  } else if (view.winner) {
    const oppName = view.them?.username || view.winner;
    titleText = `${oppName} Wins!`;
  }

  const reasonText = view.winReason
    ? `Reason: ${view.winReason}`
    : 'The game has ended.';

  // If rulesEndScreen exists from HTML/EJS, synchronize and display it
  if (rulesEndScreen) {
    const title = rulesEndScreen.querySelector?.('.rules-end-title');
    const reason = rulesEndScreen.querySelector?.('.rules-end-reason');
    if (title) title.textContent = titleText;
    if (reason) reason.textContent = reasonText;
    rulesEndScreen.hidden = false;
  }

  // Mount or update netcodeEndModal
  let modal = existingModal;
  if (!modal) {
    modal = doc.createElement('div');
    modal.id = 'netcodeEndModal';
    modal.className = 'game-end-modal-overlay';
    doc.body?.appendChild(modal);
  } else if (modal.children) {
    while (modal.children.length > 0) {
      modal.removeChild(modal.children[0]);
    }
  }

  const container = doc.createElement('div');
  container.className = 'game-end-modal-container';
  modal.appendChild(container);

  const titleEl = doc.createElement('h2');
  titleEl.className =
    `game-end-modal-title ${isWinner ? 'winner' : isLoser ? 'loser' : ''}`.trim();
  titleEl.textContent = titleText;
  container.appendChild(titleEl);

  const reasonEl = doc.createElement('p');
  reasonEl.className = 'game-end-modal-reason';
  reasonEl.textContent = reasonText;
  container.appendChild(reasonEl);

  const closeBtn = doc.createElement('button');
  closeBtn.id = 'netcodeEndCloseBtn';
  closeBtn.className = 'game-end-close-btn';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener?.('click', () => {
    if (modal.parentNode) modal.parentNode.removeChild(modal);
  });
  container.appendChild(closeBtn);

  // Dispatch custom event for DOM / client listeners
  if (typeof doc.dispatchEvent === 'function') {
    try {
      doc.dispatchEvent(
        new CustomEvent('rules-game-ended', {
          detail: {
            winner: view.winner,
            reason: view.winReason,
            isWinner,
            title: titleText,
          },
        })
      );
    } catch {
      // CustomEvent dispatch ignored if environment does not support it
    }
  }

  if (typeof options.onGameEnded === 'function') {
    options.onGameEnded({
      winner: view.winner,
      reason: view.winReason,
      isWinner,
      title: titleText,
    });
  }
}

/**
 * Resolves netcode socket and roomId context from options, defaults, or dynamic state import.
 *
 * @param {object} [options={}]
 * @returns {Promise<{ socket: any, roomId: string|null }>}
 */
async function resolveNetcodeContext(options = {}) {
  const defaultCtx = getDefaultNetcodeContext();
  let socket = options.socket || defaultCtx.socket;
  let roomId = options.roomId || defaultCtx.roomId;

  if (typeof window !== 'undefined') {
    if (!socket && window.socket) socket = window.socket;
    if (!roomId && window.systemState?.roomId)
      roomId = window.systemState.roomId;
  }

  if ((!socket || !roomId) && typeof window !== 'undefined') {
    try {
      const state = await import('../../state.js');
      if (!socket && state.socket) socket = state.socket;
      if (!roomId && state.systemState?.roomId)
        roomId = state.systemState.roomId;
    } catch {
      // dynamic import fallback ignored if unavailable
    }
  }

  return { socket, roomId };
}

/**
 * Main authoritative view renderer.
 * Reconciles browser DOM directly from authoritative view snapshot.
 *
 * @param {object} view Authoritative redacted view
 * @param {object[]} [events=[]] Advisory events for animation (Invariant 4)
 * @param {object} [options={}] Overrides and hooks
 * @returns {{ applied: boolean, reason?: string, diff?: object }}
 */
export function applyView(view, events = [], options = {}) {
  if (!view || typeof view !== 'object') {
    return { applied: false, reason: 'invalid_view' };
  }

  // §0.2 guard: a renderer that cannot see the whole board writes to no part of it.
  // Must run before the monotonic version guard so a blind view never advances
  // lastRenderedVersion and is never mistaken for "already applied".
  const renderTargets = resolveRenderTargets(options);
  if (!renderTargets.ok) {
    return { applied: false, reason: renderTargets.reason };
  }

  // Edge Case 8: Monotonic stateVersion guard (ignore out-of-order or duplicate views)
  if (typeof view.stateVersion === 'number') {
    if (view.stateVersion <= lastRenderedVersion) {
      return {
        applied: false,
        reason: 'out_of_order',
        stateVersion: view.stateVersion,
        lastRenderedVersion,
      };
    }
    lastRenderedVersion = view.stateVersion;
  }
  lastPlacedIn = new WeakMap();

  // Clear in-flight affordances now that server response has landed
  clearInFlightAffordances();

  // Computed early (not just at reconcilePendingChoice below) so slice 6's
  // onBeforeApply hook can resolve event.playerId -> self/opp before the diff
  // runs.
  const localPlayerId = view.you?.playerId || null;

  // Design 009 slice 6: snapshot knockout victims BEFORE the DOM diff removes
  // them. A knocked-out card's instanceId is still in cardRegistry here; by the
  // time the diff runs (below), it may already be gone from its zone's view.
  if (Array.isArray(events) && typeof options.onBeforeApply === 'function') {
    options.onBeforeApply(events, localPlayerId);
  }

  const diff = diffViews(options.previousView || null, view);

  // Reconcile player sides ('you' and 'them')
  const sides = ['you', 'them'];
  const placed = [];
  for (const side of sides) {
    const playerView = view[side];
    if (!playerView || !playerView.zones) continue;

    for (const [zoneId, cards] of Object.entries(playerView.zones)) {
      if (COVER_ZONES.includes(zoneId)) {
        reconcileZoneCover(side, zoneId, cards, options);
      }
      if (!Array.isArray(cards)) continue;

      const sortFn =
        options.sortZoneCards || defaultNetcodeContext.sortZoneCards;
      const orderedCards =
        typeof sortFn === 'function'
          ? sortFn(side, zoneId, cards) || cards
          : cards;

      for (const cardData of orderedCards) {
        createOrUpdateCardElement(cardData, side, zoneId, options);
      }
      // A stack's root can come after its attachments in view order: a retreat
      // reorders each stack (applyRetreatSwap pushes the attached top Evolution
      // before its Basic root). placeCardInZone drops an attachment into its
      // host's `.play-container`, which only exists once the root has been
      // placed — so place every root before any attachment, or the attachment
      // falls through to the top-level play-zone branch and the stack renders
      // as two separate side-by-side cards.
      const placementOrder = [
        ...orderedCards.filter((c) => c.attachedTo == null),
        ...orderedCards.filter((c) => c.attachedTo != null),
      ];
      for (const cardData of placementOrder) {
        const { attachedParent } = placeCardInZone(
          cardData,
          side,
          zoneId,
          options
        );
        const record = cardRegistry.get(cardData.instanceId);
        if (record)
          placed.push({ cardData, side, zoneId, record, attachedParent });
      }
    }
    reconcileZoneCounts(side, playerView.zones, options);
    reconcileSpecialMoveButtons(side, playerView.flags, options);
  }
  // Stack layout needs every card of a stack placed first: a root can come
  // after its attachments in view order.
  const displayByRoot = layoutCardStacks(placed);
  for (const entry of placed) {
    reconcilePlacedCard(entry, displayByRoot, options);
  }
  lastOverlayOptions = options;
  bindOverlayResize();

  // Clean up removed cards from registry and DOM
  const liveInstanceIds = new Set();
  for (const side of sides) {
    const playerView = view[side];
    if (!playerView?.zones) continue;
    for (const cards of Object.values(playerView.zones)) {
      if (!Array.isArray(cards)) continue;
      for (const c of cards) {
        if (c.instanceId != null) liveInstanceIds.add(c.instanceId);
      }
    }
  }
  if (view.stadium?.instanceId != null) {
    liveInstanceIds.add(view.stadium.instanceId);
  }

  for (const [id, record] of cardRegistry.entries()) {
    if (!liveInstanceIds.has(id)) {
      // Counter overlays are siblings of the image in the zone element, not children of
      // it or its play-container — removing the image/container leaves them orphaned.
      if (record.element?.damageCounter?.parentNode) {
        record.element.damageCounter.parentNode.removeChild(
          record.element.damageCounter
        );
      }
      for (const slot of Object.values(CONDITION_MARKER_SLOTS)) {
        if (record.element?.[slot]?.parentNode) {
          record.element[slot].parentNode.removeChild(record.element[slot]);
        }
      }
      if (record.element?.abilityCounter?.parentNode) {
        record.element.abilityCounter.parentNode.removeChild(
          record.element.abilityCounter
        );
      }
      unhydrateCard(record, options);
      if (record.container && record.container.parentNode) {
        record.container.parentNode.removeChild(record.container);
      } else if (record.element && record.element.parentNode) {
        record.element.parentNode.removeChild(record.element);
      }
      cardRegistry.delete(id);
    }
  }

  const reconcileHand =
    options.reconcileHandStacks || defaultNetcodeContext.reconcileHandStacks;
  if (typeof reconcileHand === 'function') {
    reconcileHand('self', options);
  }

  // Reconcile neutral Stadium
  reconcileStadium(view.stadium || null, localPlayerId, options);

  // Reconcile PendingChoice modal / banner
  reconcilePendingChoice(view.pendingChoice || null, localPlayerId, options);

  // Sync local turn state — the server is the only turn authority under the flag
  reconcileTurnState(view, options);

  // Reconcile Game Ended modal / banner (Finding 12)
  reconcileGameEnded(view, options);

  // Play advisory events for UI animations/logs (Invariant 4: deletion leaves client correct)
  if (Array.isArray(events) && typeof options.onAdvisoryEvent === 'function') {
    for (const ev of events) {
      options.onAdvisoryEvent(ev, localPlayerId);
    }
  }

  lastAppliedView = view;

  return {
    applied: true,
    stateVersion: view.stateVersion,
    diff,
  };
}
