import { appendMessage } from '../../setup/chatbox/append-message.js';
import { getZone } from '../../setup/zones/get-zone.js';
import { takePrizesByIndex } from './prizes-actions.js';

/** @type {{ user: string, remaining: number, taken: number, zone: ReturnType<typeof getZone>, resolve: (taken: number) => void } | null} */
let pending = null;

const finishPrizeTake = (taken) => {
  if (!pending) return;
  const { zone, resolve } = pending;
  zone.element.classList.remove('prize-take-ready');
  zone.element.removeEventListener('click', onPrizeClick, true);
  zone.element.removeEventListener('dblclick', blockPrizeReveal, true);
  zone.element.removeEventListener('contextmenu', blockPrizeReveal, true);
  pending = null;
  resolve(taken);
};

const resolvePrizeImage = (event) => {
  const target = event.target;
  if (!target) return null;
  if (target.nodeName === 'IMG') return target;
  const nested = target.querySelector?.('img');
  if (nested) return nested;
  return target.closest?.('img') ?? null;
};

const findPrizeIndex = (zone, img) => {
  if (!img) return -1;
  return zone.array.findIndex((card) => {
    if (!card?.image) return false;
    return card.image === img || card.image.contains?.(img) || img.contains?.(card.image);
  });
};

const blockPrizeReveal = (event) => {
  if (!pending) return;
  event.preventDefault();
  event.stopPropagation();
};

const onPrizeClick = (event) => {
  if (!pending) return;
  const img = resolvePrizeImage(event);
  const index = findPrizeIndex(pending.zone, img);
  if (index === -1) return;

  event.preventDefault();
  event.stopPropagation();

  const { user } = pending;
  takePrizesByIndex(user, user, [index]);
  pending.taken += 1;
  pending.remaining -= 1;
  if (pending.remaining <= 0 || pending.zone.getCount() === 0) {
    finishPrizeTake(pending.taken);
  }
};

export const isPrizeTakePending = () => pending != null;

export const cancelPrizeTake = () => {
  if (!pending) return;
  finishPrizeTake(0);
};

// Highlight the prize zone and wait for the player to click face-down
// prizes. Does not reveal names or open a menu.
export const promptPrizeTake = (user, count) => {
  cancelPrizeTake();
  const zone = getZone(user, 'prizes');
  const needed = Math.min(Math.max(0, count), zone.getCount());
  if (needed <= 0) {
    return Promise.resolve(0);
  }

  zone.element.classList.add('prize-take-ready');
  zone.element.addEventListener('click', onPrizeClick, true);
  zone.element.addEventListener('dblclick', blockPrizeReveal, true);
  zone.element.addEventListener('contextmenu', blockPrizeReveal, true);

  const noun = needed === 1 ? 'prize card' : `${needed} prize cards`;
  appendMessage('', `Click ${noun} to take.`, 'announcement', false);

  return new Promise((resolve) => {
    pending = { user, remaining: needed, taken: 0, zone, resolve };
  });
};
