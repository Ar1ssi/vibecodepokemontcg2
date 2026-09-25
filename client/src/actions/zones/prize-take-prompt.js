import { systemState } from '../../state.js';
import { appendMessage } from '../../setup/chatbox/append-message.js';
import { cardBackSrcForUser, cardNode } from '../../setup/deck-constructor/hydrate-holo.js';
import { prizeFanCardSize, prizeFanSlots, viewportRectOf } from '../../setup/image-logic/card-pop.mjs';
import {
  hideForFlight,
  registerPrizeHandoff,
  showAfterFlight,
} from '../../setup/image-logic/draw-flight.js';
import { sampleKeyframes } from '../../setup/image-logic/mat-fx.mjs';
import { frameTurnOf } from '../../setup/netcode/mat-fx/evolve-scene.js';
import { FAN_BACK_MS, FAN_UP_MS, fanFlightPose } from '../../setup/netcode/mat-fx/prize-fan.mjs';
import { getZone } from '../../setup/zones/get-zone.js';
import { takePrizesByIndex } from './prizes-actions.js';

const DEFAULT_SLEEVE = 'https://ptcgsim.online/src/assets/cardback.png';
const STAGGER_MS = 70;

/** @type {{
 *  user: string,
 *  needed: number,
 *  onChosen: (chosen: Array<{ card: object, host: HTMLElement }>) => number,
 *  entries: Array<{ card: object, host: HTMLElement, origin: object }>,
 *  selected: Set<object>,
 *  overlay: HTMLElement,
 *  ready: boolean,
 *  resolving: boolean,
 *  resolve: (taken: number) => void,
 * } | null} */
let pending = null;

const sleeveSrcFor = (user) => cardBackSrcForUser(user) || DEFAULT_SLEEVE;

const buildSleeveHost = (dest, sleeveSrc) => {
  const host = document.createElement('div');
  host.className = 'prize-take-card';
  host.style.left = `${dest.left}px`;
  host.style.top = `${dest.top}px`;
  host.style.width = `${dest.width}px`;
  host.style.height = `${dest.height}px`;
  const img = document.createElement('img');
  img.src = sleeveSrc;
  img.alt = '';
  img.draggable = false;
  host.appendChild(img);
  return host;
};

// Design 045: the sleeves fly up and drop back on design 042's arc (WAAPI).
// Flying up holds the start pose through its delay and then lets go, so the
// selected-card CSS still applies; dropping back holds its end until teardown.
const flyHost = (host, pose, { duration, delay = 0, fill }) => {
  if (typeof host.animate !== 'function') return Promise.resolve();
  const H = parseFloat(host.style.height) || 100;
  const frames = sampleKeyframes(
    pose,
    (p) => ({
      transform:
        `translate(${p.x}px, ${p.y}px) perspective(${H * 4}px) rotate(${p.rotate}deg) ` +
        `rotateX(${p.tiltX}deg) scale(${p.scale})`,
    }),
    36
  );
  return host.animate(frames, { duration, delay, fill, easing: 'linear' }).finished.then(
    () => undefined,
    () => undefined
  );
};

const flightSeed = () => Math.floor(Math.random() * 1e6);

const flyUp = (entry, delay) =>
  flyHost(entry.host, fanFlightPose({ from: entry.origin, to: entry.dest, fromTurn: entry.turn, seed: flightSeed() }), {
    duration: FAN_UP_MS,
    delay,
    fill: 'backwards',
  });

const flyBack = (entry) =>
  flyHost(
    entry.host,
    fanFlightPose({ from: entry.origin, to: entry.dest, fromTurn: entry.turn, reverse: true, seed: flightSeed() }),
    { duration: FAN_BACK_MS, fill: 'forwards' }
  );

const unhideSources = (cards) => {
  for (const card of cards) {
    showAfterFlight(card);
  }
};

const teardownOverlay = (unhideAll) => {
  if (!pending) return;
  pending.overlay.remove();
  if (unhideAll) {
    unhideSources(pending.entries.map((entry) => entry.card));
  } else {
    unhideSources(
      pending.entries
        .filter((entry) => !pending.selected.has(entry.card))
        .map((entry) => entry.card)
    );
  }
};

const finishPrizeTake = (taken, unhideAll = taken === 0) => {
  if (!pending || pending.resolving) return;
  pending.resolving = true;
  const { resolve } = pending;
  teardownOverlay(unhideAll);
  pending = null;
  resolve(taken);
};

const returnUnselectedThenFinish = async (taken) => {
  if (!pending) return;
  const leftover = pending.entries.filter((entry) => !pending.selected.has(entry.card));
  await Promise.all(leftover.map(flyBack));
  finishPrizeTake(taken, false);
};

// `force` lets the e2e bot answer before the fly-up animation has finished.
const confirmSelection = (force = false) => {
  if (!pending || pending.resolving) return;
  if (!pending.ready && !force) return;
  const { entries, selected, needed, onChosen } = pending;
  if (selected.size < needed) return;
  pending.ready = false;
  pending.overlay.classList.remove('is-ready');

  const chosen = entries.filter((entry) => selected.has(entry.card));
  for (const entry of chosen) handOffChosen(entry);

  returnUnselectedThenFinish(onChosen(chosen));
};

// Design 045: a picked sleeve leaves the overlay (it outlives the teardown) and
// waits for the flight into the hand to start from it.
const handOffChosen = (entry) => {
  const face = entry.host.querySelector('img') || entry.host;
  const rect = viewportRectOf(face);
  document.body.appendChild(entry.host);
  registerPrizeHandoff(entry.card, { rect, release: () => entry.host.remove() });
};

const selectEntry = (card, host) => {
  if (pending.selected.has(card)) {
    pending.selected.delete(card);
    host.classList.remove('is-selected');
    return false;
  }
  if (pending.selected.size >= pending.needed) return false;
  pending.selected.add(card);
  host.classList.add('is-selected');
  return pending.selected.size >= pending.needed;
};

const toggleSelect = (card, host) => {
  if (!pending?.ready || pending.resolving) return;
  if (selectEntry(card, host)) {
    globalThis.setTimeout(confirmSelection, 220);
  }
};

export const isPrizeTakePending = () => pending != null;

export const cancelPrizeTake = () => {
  if (!pending) return;
  finishPrizeTake(0);
};

/** e2e: the open prize fan as a card-picker snapshot, or null. */
export const getPrizeTakeSnapshot = () => {
  if (!pending || pending.resolving) return null;
  return {
    min: pending.needed,
    candidates: pending.entries.map((_, index) => ({ index, name: '' })),
  };
};

/** e2e: picks prize cards by index and confirms at once. */
export const pickPrizeTakeIndices = (indices = []) => {
  if (!pending || pending.resolving) return false;
  for (const index of indices) {
    const entry = pending.entries[index];
    if (entry && !pending.selected.has(entry.card)) selectEntry(entry.card, entry.host);
  }
  if (pending.selected.size < pending.needed) return false;
  confirmSelection(true);
  return true;
};

// TCG Live prize pick: every remaining prize flies up sleeve-forward. The player clicks
// as many as they earned; `onChosen` takes the chosen entries and returns how many
// prizes it took; the rest drop back.
const openPrizeFan = ({ user, cards, needed, onChosen }) => {
  cancelPrizeTake();
  const viewport = {
    width: globalThis.innerWidth,
    height: globalThis.innerHeight,
  };
  const size = prizeFanCardSize(cards.length, viewport);
  const dests = prizeFanSlots(cards.length, viewport, size);
  const sleeveSrc = sleeveSrcFor(user);

  const overlay = document.createElement('div');
  overlay.id = 'prizeTakeOverlay';
  overlay.className = 'prize-take-overlay';
  overlay.dataset.min = String(needed);
  const hint = document.createElement('div');
  hint.className = 'prize-take-hint';
  const noun = needed === 1 ? 'prize card' : `${needed} prize cards`;
  hint.textContent = `Pick ${noun}`;
  overlay.appendChild(hint);
  document.body.appendChild(overlay);

  const entries = cards.map((card, i) => {
    const originEl = cardNode(card);
    const origin = originEl
      ? viewportRectOf(originEl)
      : { left: 40, top: viewport.height - 180, width: 70, height: 98 };
    const turn = originEl ? frameTurnOf(card.image) : 0;
    hideForFlight(card);
    const host = buildSleeveHost(dests[i], sleeveSrc);
    host.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleSelect(card, host);
    });
    overlay.appendChild(host);
    return { card, host, origin, turn, dest: dests[i] };
  });

  appendMessage('', `Pick ${noun}.`, 'announcement', false);

  return new Promise((resolve) => {
    pending = {
      user,
      needed,
      onChosen,
      entries,
      selected: new Set(),
      overlay,
      ready: false,
      resolving: false,
      resolve,
    };

    let arrived = 0;
    entries.forEach((entry, i) => {
      flyUp(entry, i * STAGGER_MS).then(() => {
        if (!pending || pending.overlay !== overlay) return;
        arrived += 1;
        if (arrived >= pending.entries.length) {
          pending.ready = true;
          overlay.classList.add('is-ready');
        }
      });
    });
  });
};

// Legacy (non-authoritative) path: the chosen prizes are taken by zone index.
export const promptPrizeTake = (user, count) => {
  if (systemState.isTwoPlayer && user !== 'self') {
    return Promise.resolve(0);
  }
  const zone = getZone(user, 'prizes');
  const needed = Math.min(Math.max(0, count), zone.getCount());
  if (needed <= 0) {
    cancelPrizeTake();
    return Promise.resolve(0);
  }
  return openPrizeFan({
    user,
    cards: [...zone.array],
    needed,
    onChosen: (chosen) => {
      const indices = chosen
        .map((entry) => zone.array.indexOf(entry.card))
        .filter((index) => index >= 0);
      if (indices.length > 0) {
        takePrizesByIndex(user, user, indices);
      }
      return indices.length;
    },
  });
};

/**
 * Server-authoritative path: a prize pendingChoice. `cards` are the server-drawn prize
 * cards as `{ instanceId, image, wrapper }`; `onResolve` receives the chosen instanceIds,
 * which the server moves to hand.
 */
export const promptServerPrizeChoice = ({ cards, needed, onResolve }) =>
  openPrizeFan({
    user: 'self',
    cards,
    needed,
    onChosen: (chosen) => {
      onResolve(chosen.map((entry) => entry.card.instanceId));
      return chosen.length;
    },
  });
