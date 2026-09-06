import { appendMessage } from '../../setup/chatbox/append-message.js';
import { cardBackSrcForUser, cardNode } from '../../setup/deck-constructor/hydrate-holo.js';
import {
  playDrawFlight,
  playReturnFlight,
  prizeFanCardSize,
  prizeFanSlots,
  viewportRectOf,
} from '../../setup/image-logic/card-pop.mjs';
import {
  hideForFlight,
  setHandFlightOrigin,
  showAfterFlight,
} from '../../setup/image-logic/draw-flight.js';
import { getZone } from '../../setup/zones/get-zone.js';
import { takePrizesByIndex } from './prizes-actions.js';

const DEFAULT_SLEEVE = 'https://ptcgsim.online/src/assets/cardback.png';
const STAGGER_MS = 70;

/** @type {{
 *  user: string,
 *  needed: number,
 *  zone: ReturnType<typeof getZone>,
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

const flyUp = (host, origin, dest) =>
  new Promise((resolve) => {
    const startTranslate = {
      x: origin.left + origin.width / 2 - (dest.left + dest.width / 2),
      y: origin.top + origin.height / 2 - (dest.top + dest.height / 2),
    };
    playDrawFlight(host, {
      startTranslate,
      startScale: origin.width / Math.max(dest.width, 1),
      flip: false,
      arcSign: -1,
      onDone: resolve,
    });
  });

const flyBack = (host, origin, dest) =>
  new Promise((resolve) => {
    playReturnFlight(host, {
      endTranslate: {
        x: origin.left + origin.width / 2 - (dest.left + dest.width / 2),
        y: origin.top + origin.height / 2 - (dest.top + dest.height / 2),
      },
      endScale: origin.width / Math.max(dest.width, 1),
      onDone: resolve,
    });
  });

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
  await Promise.all(
    leftover.map((entry) => flyBack(entry.host, entry.origin, entry.dest))
  );
  finishPrizeTake(taken, false);
};

const confirmSelection = () => {
  if (!pending || !pending.ready || pending.resolving) return;
  const { user, zone, entries, selected, needed } = pending;
  if (selected.size < needed) return;
  pending.ready = false;
  pending.overlay.classList.remove('is-ready');

  const chosen = entries.filter((entry) => selected.has(entry.card));
  const indices = chosen
    .map((entry) => zone.array.indexOf(entry.card))
    .filter((index) => index >= 0);

  for (const entry of chosen) {
    setHandFlightOrigin(entry.card, viewportRectOf(entry.host));
    entry.host.style.visibility = 'hidden';
  }

  if (indices.length > 0) {
    takePrizesByIndex(user, user, indices);
  }

  returnUnselectedThenFinish(indices.length);
};

const toggleSelect = (card, host) => {
  if (!pending?.ready || pending.resolving) return;
  if (pending.selected.has(card)) {
    pending.selected.delete(card);
    host.classList.remove('is-selected');
    return;
  }
  if (pending.selected.size >= pending.needed) return;
  pending.selected.add(card);
  host.classList.add('is-selected');
  if (pending.selected.size >= pending.needed) {
    globalThis.setTimeout(confirmSelection, 220);
  }
};

export const isPrizeTakePending = () => pending != null;

export const cancelPrizeTake = () => {
  if (!pending) return;
  finishPrizeTake(0);
};

// TCG Live prize pick: every remaining prize flies up sleeve-forward.
// The player clicks as many as they earned; the rest drop back.
export const promptPrizeTake = (user, count) => {
  cancelPrizeTake();
  const zone = getZone(user, 'prizes');
  const needed = Math.min(Math.max(0, count), zone.getCount());
  if (needed <= 0) {
    return Promise.resolve(0);
  }

  const cards = [...zone.array];
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
  const hint = document.createElement('div');
  hint.className = 'prize-take-hint';
  const noun = needed === 1 ? 'prize card' : `${needed} prize cards`;
  hint.textContent = `Pick ${noun}`;
  overlay.appendChild(hint);
  document.body.appendChild(overlay);

  const entries = cards.map((card, i) => {
    const originEl = cardNode(card) ?? card.image;
    const origin = originEl
      ? viewportRectOf(originEl)
      : { left: 40, top: viewport.height - 180, width: 70, height: 98 };
    hideForFlight(card);
    const host = buildSleeveHost(dests[i], sleeveSrc);
    host.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleSelect(card, host);
    });
    overlay.appendChild(host);
    return { card, host, origin, dest: dests[i] };
  });

  appendMessage('', `Pick ${noun}.`, 'announcement', false);

  return new Promise((resolve) => {
    pending = {
      user,
      needed,
      zone,
      entries,
      selected: new Set(),
      overlay,
      ready: false,
      resolving: false,
      resolve,
    };

    let arrived = 0;
    entries.forEach((entry, i) => {
      globalThis.setTimeout(() => {
        flyUp(entry.host, entry.origin, dests[i]).then(() => {
          if (!pending || pending.overlay !== overlay) return;
          arrived += 1;
          if (arrived >= pending.entries.length) {
            pending.ready = true;
            overlay.classList.add('is-ready');
          }
        });
      }, i * STAGGER_MS);
    });
  });
};
