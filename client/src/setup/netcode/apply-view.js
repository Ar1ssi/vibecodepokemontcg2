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
import { clearInFlightAffordances, emitResolveChoice } from './cmd-emitter.js';
import { buildCardImage } from '../image-logic/build-card-image.js';
import { rulesState } from '../../../../shared/engine/rules/rules-state.mjs';
import {
  DAMAGE_COUNTER_TIERS,
  getDamageCounterTier,
} from '../counters/damage-counter-style.mjs';
import { applySpecialConditionStyle } from '../counters/special-condition-style-apply.js';

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
};

const PLAY_ZONES = ['active', 'bench'];

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
  if (ctx.systemState !== undefined) defaultNetcodeContext.systemState = ctx.systemState;
  if (ctx.getZone !== undefined) defaultNetcodeContext.getZone = ctx.getZone;
  if (ctx.cardListeners !== undefined) defaultNetcodeContext.cardListeners = ctx.cardListeners;
  if (ctx.coverListeners !== undefined) defaultNetcodeContext.coverListeners = ctx.coverListeners;
  if (ctx.sortZoneCards !== undefined) defaultNetcodeContext.sortZoneCards = ctx.sortZoneCards;
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
        : defaultNetcodeContext.roomId || defaultNetcodeContext.systemState?.roomId || null,
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
  defaultNetcodeContext = {
    socket: null,
    roomId: null,
    systemState: null,
    getZone: null,
    cardListeners: null,
    coverListeners: null,
    sortZoneCards: null,
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

  const doc = options.document || (typeof document !== 'undefined' ? document : null);
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
  return (systemState.isTwoPlayer ? systemState.p2OppCardBackSrc : systemState.p1OppCardBackSrc) || fallback;
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
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
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
  const displaySrc = isRedacted ? cardBackSrc : (cardData.src || cardBackSrc);

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
    const cardListeners = options.cardListeners || defaultNetcodeContext.cardListeners;
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

  img.setAttribute('src', displaySrc);
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
    };
    cardRegistry.set(instanceId, record);
  } else {
    record.card = { ...cardData };
    record.side = side;
    record.zone = zoneId;
  }

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
 * @param {{ leftOffset: number, size: number, fontSize: number }} spec
 */
function positionOverlay(overlay, targetRect, zoneRect, { leftOffset, size, fontSize }) {
  overlay.style.display = 'inline-block';
  overlay.style.left = `${targetRect.left - zoneRect.left + leftOffset}px`;
  overlay.style.top = `${targetRect.top - zoneRect.top + targetRect.height / 4}px`;
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
function reconcileDamageOverlay(cardData, img, zoneElement, side, options = {}) {
  const damage = typeof cardData.damage === 'number' && cardData.damage > 0 ? cardData.damage : 0;

  if (damage <= 0) {
    if (img.damageCounter) {
      if (img.damageCounter.parentNode) {
        img.damageCounter.parentNode.removeChild(img.damageCounter);
      }
      img.damageCounter = null;
    }
    return;
  }

  const doc = img.ownerDocument || options.document || (typeof document !== 'undefined' ? document : null);
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

  const targetRect = getRect(img);
  const zoneRect = getRect(zoneElement);
  positionOverlay(counter, targetRect, zoneRect, {
    leftOffset: targetRect.width / 1.5,
    size: targetRect.width / 3,
    fontSize: targetRect.width / 6,
  });
}

/**
 * Creates, updates or removes the special-condition sibling `<div>` for a card, mirroring
 * `addSpecialCondition`/`updateSpecialCondition`/`removeSpecialCondition`
 * (`client/src/actions/counters/special-condition.js`) but display-only — see
 * `reconcileDamageOverlay`'s header for why.
 *
 * @param {object} cardData
 * @param {object} img
 * @param {object|null} zoneElement
 * @param {string} side
 * @param {object} options
 */
function reconcileSpecialConditionOverlay(cardData, img, zoneElement, side, options = {}) {
  const condition = cardData.specialCondition || null;

  if (!condition) {
    if (img.specialCondition) {
      if (img.specialCondition.parentNode) {
        img.specialCondition.parentNode.removeChild(img.specialCondition);
      }
      img.specialCondition = null;
    }
    return;
  }

  const doc = img.ownerDocument || options.document || (typeof document !== 'undefined' ? document : null);
  let marker = img.specialCondition;
  if (!marker) {
    if (!doc || typeof doc.createElement !== 'function') return;
    marker = doc.createElement('div');
    marker.contentEditable = 'false';
    marker.className = overlaySideClass(side, options);
    img.specialCondition = marker;
  }

  const code = CONDITION_WORD_TO_CODE[condition] || condition;
  applySpecialConditionStyle(marker, code);

  if (zoneElement && marker.parentNode !== zoneElement) {
    zoneElement.appendChild(marker);
  }

  const targetRect = getRect(img);
  const zoneRect = getRect(zoneElement);
  positionOverlay(marker, targetRect, zoneRect, {
    leftOffset: 0,
    size: targetRect.width / 3,
    fontSize: targetRect.width / 4,
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
function reconcileCardOverlays(cardData, img, zoneElement, side, options = {}) {
  reconcileDamageOverlay(cardData, img, zoneElement, side, options);
  reconcileSpecialConditionOverlay(cardData, img, zoneElement, side, options);
}

/**
 * Places a card element into its target zone, handling play-containers and attachments.
 *
 * @param {object} cardData
 * @param {string} side
 * @param {string} zoneId
 * @param {object} options
 */
function placeCardInZone(cardData, side, zoneId, options = {}) {
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  const zone = resolveZone(side, zoneId, options);
  const record = cardRegistry.get(cardData.instanceId);
  if (!zone.element || !record) return;

  const img = record.element;

  // Handle play zones (active & bench)
  if (PLAY_ZONES.includes(zoneId)) {
    // Check if card is attached to another Pokemon
    if (cardData.attachedTo != null) {
      const parentRecord = cardRegistry.get(cardData.attachedTo);
      if (parentRecord && parentRecord.container) {
        // Append attached card under parent container with attached style.
        // Always appendChild (not just when the parent differs): appendChild
        // on an existing child moves it to the end, so re-appending every
        // card in view order each applyView reconciles sibling order among
        // a parent's attachments (finding #10) instead of only placing a
        // card the first time it arrives.
        img.classList.add('attached-card');
        parentRecord.container.appendChild(img);
        return;
      }
    }

    // Top-level active/bench Pokemon: wrap in .play-container. A card that
    // was attached last view and is top-level this view must lose the
    // 'attached-card' class here too, not only on the leaves-play-zones
    // branch below (finding #11).
    img.classList.remove('attached-card');

    let container = record.container;
    if (!container || !container.parentNode) {
      container = doc.createElement('div');
      container.className = 'play-container';
      container.dataset.instanceId = String(cardData.instanceId);
      record.container = container;
    }
    // Always appendChild: reconciles both the image-within-container order
    // and the container-within-zone order (finding #10) on every view.
    container.appendChild(img);
    zone.element.appendChild(container);
    return;
  }

  // If card was previously in a play-container, clean up container
  if (record.container && record.container.parentNode) {
    record.container.parentNode.removeChild(record.container);
    record.container = null;
  }

  img.classList.remove('attached-card');
  // Always appendChild (not just when the parent differs): reconciles
  // intra-zone order to match the view's array order on every applyView
  // (finding #10) instead of freezing the first-seen DOM position.
  zone.element.appendChild(img);
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
  const topCard = isDeck ? null : Array.isArray(zoneData) && zoneData.length > 0 ? zoneData[zoneData.length - 1] : null;
  const hasCards = isDeck ? Boolean(zoneData && zoneData.count > 0) : Boolean(topCard);

  if (!hasCards) {
    const existing = coverRegistry.get(key);
    if (existing?.parentNode) existing.parentNode.removeChild(existing);
    coverRegistry.delete(key);
    return;
  }

  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.createElement !== 'function') return;

  const coverListeners = options.coverListeners || defaultNetcodeContext.coverListeners;
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
    coverRegistry.set(key, img);
  }

  const src = isDeck ? resolveCardBackSrc(side, options) : topCard.src || resolveCardBackSrc(side, options);
  img.setAttribute('src', src);
  img.setAttribute('alt', isDeck ? id : topCard.name || id);

  // Legacy keeps exactly one child in elementCover, replacing it on every
  // update (`update-cover.js`'s removeChild-then-appendChild pattern).
  if (img.parentNode !== zone.elementCover) {
    while (zone.elementCover.children && zone.elementCover.children.length > 0) {
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
function reconcileStadium(stadiumCard, options = {}) {
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;

  const stadiumElement = doc.getElementById ? doc.getElementById('stadium') : null;
  if (!stadiumElement) return;

  if (!stadiumCard) {
    // Clear stadium
    if (stadiumElement.innerHTML !== undefined) {
      stadiumElement.innerHTML = '';
    }
    return;
  }

  const img = createOrUpdateCardElement(stadiumCard, 'neutral', 'stadium', options);
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
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;

  const existingModal = doc.getElementById ? doc.getElementById('netcodeChoiceModal') : null;
  const existingBanner = doc.getElementById ? doc.getElementById('netcodeChoiceBanner') : null;

  if (!pendingChoice) {
    if (existingModal?.parentNode) existingModal.parentNode.removeChild(existingModal);
    if (existingBanner?.parentNode) existingBanner.parentNode.removeChild(existingBanner);
    return;
  }

  const isOwner = !pendingChoice.player || pendingChoice.player === localPlayerId;

  if (!isOwner) {
    // Opponent is choosing: show non-interactive waiting banner
    if (existingModal?.parentNode) existingModal.parentNode.removeChild(existingModal);
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
  if (existingBanner?.parentNode) existingBanner.parentNode.removeChild(existingBanner);

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
  footer.appendChild(confirmBtn);

  const updateConfirmState = () => {
    const count = selectedIds.size;
    confirmBtn.disabled = count < min || count > max;
    confirmBtn.textContent = `Confirm (${count}/${max})`;
  };

  const optionsList = Array.isArray(pendingChoice.options) ? pendingChoice.options : [];
  for (const opt of optionsList) {
    const optDiv = doc.createElement('div');
    optDiv.className = 'choice-option-card';
    optDiv.dataset.instanceId = String(opt.instanceId);

    const optImg = doc.createElement('img');
    optImg.src = opt.src || '/src/assets/cardback.png';
    optImg.alt = opt.name || 'Card';
    optDiv.appendChild(optImg);

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
      if (typeof options.onResolveChoice === 'function') {
        options.onResolveChoice({ choiceId: pendingChoice.choiceId, selection });
      } else {
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
    } finally {
      if (modal.parentNode) modal.parentNode.removeChild(modal);
    }
  });
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
  if (typeof turn.number === 'number') state.turnNumber = turn.number;
  if (typeof turn.phase === 'string') state.phase = turn.phase;

  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  if (doc) {
    doc.dispatchEvent(
      new CustomEvent('rules-turn-view-applied', { detail: { player: turnPlayer } })
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
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;

  const existingModal = doc.getElementById ? doc.getElementById('netcodeEndModal') : null;
  const rulesEndScreen = doc.getElementById ? doc.getElementById('rulesEndScreen') : null;

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
  const existingChoiceModal = doc.getElementById ? doc.getElementById('netcodeChoiceModal') : null;
  const existingChoiceBanner = doc.getElementById ? doc.getElementById('netcodeChoiceBanner') : null;
  if (existingChoiceModal?.parentNode) existingChoiceModal.parentNode.removeChild(existingChoiceModal);
  if (existingChoiceBanner?.parentNode) existingChoiceBanner.parentNode.removeChild(existingChoiceBanner);

  const localPlayerId = view.you?.playerId || null;
  const isWinner = Boolean(view.winner && localPlayerId && view.winner === localPlayerId);
  const isLoser = Boolean(view.winner && localPlayerId && view.winner !== localPlayerId);

  let titleText = 'Game Over';
  if (isWinner) {
    titleText = 'Victory!';
  } else if (isLoser) {
    titleText = 'Defeat';
  } else if (view.winner) {
    const oppName = view.them?.username || view.winner;
    titleText = `${oppName} Wins!`;
  }

  const reasonText = view.winReason ? `Reason: ${view.winReason}` : 'The game has ended.';

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
  titleEl.className = `game-end-modal-title ${isWinner ? 'winner' : isLoser ? 'loser' : ''}`.trim();
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
    if (!roomId && window.systemState?.roomId) roomId = window.systemState.roomId;
  }

  if ((!socket || !roomId) && typeof window !== 'undefined') {
    try {
      const state = await import('../../state.js');
      if (!socket && state.socket) socket = state.socket;
      if (!roomId && state.systemState?.roomId) roomId = state.systemState.roomId;
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

  // Clear in-flight affordances now that server response has landed
  clearInFlightAffordances();

  const diff = diffViews(options.previousView || null, view);

  // Reconcile player sides ('you' and 'them')
  const sides = ['you', 'them'];
  for (const side of sides) {
    const playerView = view[side];
    if (!playerView || !playerView.zones) continue;

    for (const [zoneId, cards] of Object.entries(playerView.zones)) {
      if (COVER_ZONES.includes(zoneId)) {
        reconcileZoneCover(side, zoneId, cards, options);
      }
      if (!Array.isArray(cards)) continue;

      const sortFn = options.sortZoneCards || defaultNetcodeContext.sortZoneCards;
      const orderedCards = typeof sortFn === 'function' ? sortFn(side, zoneId, cards) || cards : cards;

      for (const cardData of orderedCards) {
        const img = createOrUpdateCardElement(cardData, side, zoneId, options);
        placeCardInZone(cardData, side, zoneId, options);
        const zone = resolveZone(side, zoneId, options);
        reconcileCardOverlays(cardData, img, zone.element, side, options);
      }
    }
  }

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
        record.element.damageCounter.parentNode.removeChild(record.element.damageCounter);
      }
      if (record.element?.specialCondition?.parentNode) {
        record.element.specialCondition.parentNode.removeChild(record.element.specialCondition);
      }
      if (record.container && record.container.parentNode) {
        record.container.parentNode.removeChild(record.container);
      } else if (record.element && record.element.parentNode) {
        record.element.parentNode.removeChild(record.element);
      }
      cardRegistry.delete(id);
    }
  }

  // Reconcile neutral Stadium
  reconcileStadium(view.stadium || null, options);

  // Reconcile PendingChoice modal / banner
  const localPlayerId = view.you?.playerId || null;
  reconcilePendingChoice(view.pendingChoice || null, localPlayerId, options);

  // Sync local turn state — the server is the only turn authority under the flag
  reconcileTurnState(view, options);

  // Reconcile Game Ended modal / banner (Finding 12)
  reconcileGameEnded(view, options);

  // Play advisory events for UI animations/logs (Invariant 4: deletion leaves client correct)
  if (Array.isArray(events) && typeof options.onAdvisoryEvent === 'function') {
    for (const ev of events) {
      options.onAdvisoryEvent(ev);
    }
  }

  lastAppliedView = view;

  return {
    applied: true,
    stateVersion: view.stateVersion,
    diff,
  };
}
