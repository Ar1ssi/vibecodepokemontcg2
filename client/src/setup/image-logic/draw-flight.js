import {
  oppContainerDocument,
  selfContainerDocument,
  systemState,
} from '../../state.js';
import { shouldAnimateDrawFlight } from './draw-flight-predicate.mjs';
export { shouldAnimateDrawFlight };
import { cardNode, isCardHidden } from '../deck-constructor/hydrate-holo.js';
import { viewportRectOf } from './card-pop.mjs';
import { playDrawScene, playOppDrawFlights } from '../netcode/mat-fx/draw-scene.js';
import { frameTurnOf } from '../netcode/mat-fx/evolve-scene.js';

export const hideForFlight = (card) => {
  card?.image?.classList.add('draw-flight-source');
  card?.wrapper?.classList.add('draw-flight-source');
};

export const showAfterFlight = (card) => {
  card?.image?.classList.remove('draw-flight-source');
  card?.wrapper?.classList.remove('draw-flight-source');
};

const deckOriginEl = (user) => {
  const doc = user === 'self' ? selfContainerDocument : oppContainerDocument;
  const cover = doc?.getElementById('deckCover');
  return cover?.querySelector('img') || cover;
};

export const originRectForHandFlight = (user, oZoneId, card) => {
  const el =
    oZoneId === 'deck'
      ? deckOriginEl(user)
      : oZoneId === 'prizes'
        ? cardNode(card) ?? card?.image
        : null;
  return el ? viewportRectOf(el) : null;
};

// Design 045: a picked prize's fan sleeve stays on screen until the flight into
// the hand takes over from it. Keyed by the card object (legacy mover) and its
// instanceId (server path); the sleeve is released after PRIZE_HANDOFF_MS if
// no flight ever claims it.
const PRIZE_HANDOFF_MS = 4000;
const prizeHandoffs = new Map();

const onceOnly = (fn) => {
  let called = false;
  return () => {
    if (called) return;
    called = true;
    fn?.();
  };
};

/**
 * @param {object} card - the prize card (`instanceId` optional)
 * @param {{rect: object, release: () => void}} handoff - the sleeve's page rect and how to remove it
 */
export const registerPrizeHandoff = (card, { rect, release }) => {
  const keys = [card, card?.instanceId].filter((key) => key != null);
  if (keys.length === 0 || !rect) return;
  const entry = { rect, turn: 0, release: onceOnly(release) };
  entry.timer = globalThis.setTimeout(() => {
    dropHandoff(entry);
    entry.release();
  }, PRIZE_HANDOFF_MS);
  keys.forEach((key) => prizeHandoffs.set(key, entry));
};

const dropHandoff = (entry) => {
  for (const [key, value] of prizeHandoffs) {
    if (value === entry) prizeHandoffs.delete(key);
  }
};

/**
 * Claims a registered fan sleeve: the caller now owns `release`.
 * @returns {{rect: object, turn: number, release: () => void} | null}
 */
export const takePrizeHandoff = (key) => {
  const entry = key == null ? null : prizeHandoffs.get(key);
  if (!entry) return null;
  globalThis.clearTimeout(entry.timer);
  dropHandoff(entry);
  return { rect: entry.rect, turn: entry.turn, release: entry.release };
};

const drawFlightAllowed = () =>
  typeof document !== 'undefined' &&
  shouldAnimateDrawFlight({
    syncReplaying: !!systemState.syncReplaying,
    hidden: !!document.hidden,
  });

// A card that will not fly: its fan sleeve goes and the real card shows.
const settle = (item) => {
  item.from?.release?.();
  showAfterFlight(item);
};

// Design 044: the legacy mover draws one card per call, so calls for a side
// within BATCH_WINDOW_MS join one draw; a side's draws play one after another.
const BATCH_WINDOW_MS = 90;
const batches = { self: null, opp: null };
const sideBusyUntil = { self: 0, opp: 0 };

const sideKey = (user) => (user === 'self' ? 'self' : 'opp');

const runBatch = (user, items) => {
  const live = items.filter((item) => item.image?.isConnected);
  items.filter((item) => !live.includes(item)).forEach(settle);
  const faceDown = live.filter((item) => user === 'opp' && (item.redacted || isCardHidden(item)));
  const faceUp = live.filter((item) => !faceDown.includes(item));
  const sceneMs = faceUp.length > 0 ? playDrawScene(user, faceUp, settle) : 0;
  const flightMs = faceDown.length > 0 ? playOppDrawFlights(user, faceDown, settle) : 0;
  return Math.max(sceneMs, flightMs);
};

const queueBatch = (user, items) => {
  const key = sideKey(user);
  const wait = Math.max(0, sideBusyUntil[key] - performance.now());
  const start = () => {
    const ms = runBatch(user, items);
    sideBusyUntil[key] = Math.max(sideBusyUntil[key], performance.now() + ms);
  };
  // Held back until the previous draw has landed, so two draws never share the mat.
  sideBusyUntil[key] = Math.max(sideBusyUntil[key], performance.now() + wait);
  if (wait > 0) globalThis.setTimeout(start, wait);
  else start();
};

/**
 * Design 044: plays one whole draw at once (the authoritative advisory path,
 * where every drawn card arrives in one event). When draws may not animate
 * the cards are just shown. Design 045: `from` starts a card somewhere other
 * than the deck (a prize), and its `release` removes what stood there.
 * @param {'self'|'opp'} user
 * @param {{image: HTMLImageElement, wrapper?: Element, redacted?: boolean,
 *   from?: {rect: object, turn?: number, release?: () => void} | null}[]} cards
 * @returns {number} how many cards the draw plays
 */
export const playDrawBatch = (user, cards) => {
  const valid = (cards || []).filter((card) => card?.image);
  if (valid.length === 0) return 0;
  if (!drawFlightAllowed()) {
    valid.forEach(settle);
    return 0;
  }
  valid.forEach(hideForFlight);
  queueBatch(user, valid);
  return valid.length;
};

// Where a legacy prize take starts: its fan sleeve, else the prize card's seat.
const prizeStartOf = (card, fromRect) =>
  takePrizeHandoff(card) || (fromRect ? { rect: fromRect, turn: frameTurnOf(card.image) } : null);

// Pokémon TCG Live draw / prize take (designs 044/045): deck draws and prize
// takes join the side's batch; prizes start where the prize was.
export const playDrawToHand = (user, card, { fromRect, source = 'deck' } = {}) => {
  if (!card?.image) return;
  const item = {
    image: card.image,
    wrapper: card.wrapper,
    user: card.user,
    from: source === 'prizes' ? prizeStartOf(card, fromRect) : null,
  };
  if (!drawFlightAllowed()) {
    item.from?.release?.();
    return;
  }
  hideForFlight(item);
  const key = sideKey(user);
  if (batches[key]) {
    batches[key].items.push(item);
    return;
  }
  batches[key] = { items: [item] };
  globalThis.setTimeout(() => {
    const { items } = batches[key];
    batches[key] = null;
    queueBatch(user, items);
  }, BATCH_WINDOW_MS);
};
