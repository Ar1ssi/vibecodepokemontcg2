// Persistent battle-mat coin tokens: render each player's chosen coin beside
// their Active Pokémon and play flip animations on the mat (not full-screen).

import {
  selfContainer,
  oppContainer,
  selfContainerDocument,
  oppContainerDocument,
  systemState,
} from '../../front-end.js';
import { getCoins } from '../deck-builder/core/coins.mjs';

const MAT_COIN_BACK_URL = '/src/assets/coins/coin-back.png';
const MAT_COIN_SLOTS = {
  self: () => document.getElementById('matCoinSlotSelf'),
  opp: () => document.getElementById('matCoinSlotOpp'),
};
const CONTAINER_DOCS = {
  self: () => selfContainerDocument,
  opp: () => oppContainerDocument,
};

const selectedCoins = { self: null, opp: null };
const tossRevolutions = { self: 0, opp: 0 };
let layoutObserver = null;
let layoutHooked = false;

const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const getSelectedCoin = (target) => selectedCoins[target] || null;

export const setSelectedCoin = (target, coin) => {
  if (target !== 'self' && target !== 'opp') return;
  selectedCoins[target] = coin || null;
  renderMatCoinSlot(target);
};

export const pickRandomCoin = () => {
  const coins = getCoins();
  if (coins.length === 0) return null;
  return coins[Math.floor(Math.random() * coins.length)];
};

const CONTAINER_ELS = {
  self: () => selfContainer,
  opp: () => oppContainer,
};

/** Each player's coin sits to *their* right at the table. */
const coinScreenSide = (target) => {
  const container = CONTAINER_ELS[target]?.();
  // Top-half iframes use the .opp class and are mirrored — "player right"
  // maps to screen-left of the Active zone; bottom-half maps to screen-right.
  return container?.classList.contains('opp') ? 'left' : 'right';
};

export const positionMatCoinSlots = () => {
  for (const target of ['self', 'opp']) {
    const slot = MAT_COIN_SLOTS[target]();
    const active = CONTAINER_DOCS[target]()?.getElementById('active');
    if (!slot || !active) continue;

    const rect = active.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    const size = Math.max(
      32,
      Math.min(rect.height * 0.38, rect.width * 0.18, window.innerHeight * 0.065)
    );
    const gap = size * 0.2;
    const side = coinScreenSide(target);

    slot.style.width = `${size}px`;
    slot.style.height = `${size}px`;
    slot.style.top = `${rect.top + rect.height / 2}px`;
    slot.style.transform = 'translateY(-50%)';
    slot.style.right = 'auto';

    if (side === 'left') {
      slot.style.left = `${rect.left - size - gap}px`;
    } else {
      slot.style.left = `${rect.right + gap}px`;
    }
  }
};

export const renderMatCoinSlot = (target) => {
  const slot = MAT_COIN_SLOTS[target]?.();
  if (!slot) return;

  const coin = selectedCoins[target];
  slot.innerHTML = '';
  if (!coin) {
    slot.classList.remove('has-coin');
    return;
  }

  slot.classList.add('has-coin');
  slot.innerHTML = [
    `<span class="coin-toss-wrap mat-coin-toss-wrap" data-mat-coin-toss="${target}">`,
    `<div class="coin-3d coin-mat-${escapeHtml(coin.material || 'silver')} mat-coin-token" data-mat-coin-el="${target}">`,
    `<div class="coin-face coin-front"><img src="${escapeHtml(coin.thumb)}" alt="${escapeHtml(coin.name || 'coin')}"></div>`,
    `<div class="coin-face coin-backc"><img src="${MAT_COIN_BACK_URL}" alt=""></div>`,
    `</div>`,
    `</span>`,
  ].join('');

  positionMatCoinSlots();
};

export const renderMatCoins = () => {
  renderMatCoinSlot('self');
  renderMatCoinSlot('opp');
};

/** Animate a coin flip on the mat. Returns a promise resolving to `result`. */
export const flipMatCoin = ({
  target,
  result,
  coin = null,
  durationMs = 1400,
} = {}) => {
  return new Promise((resolve) => {
    if (target !== 'self' && target !== 'opp') {
      resolve(result);
      return;
    }

    if (coin && (!selectedCoins[target] || selectedCoins[target].id !== coin.id)) {
      selectedCoins[target] = coin;
      renderMatCoinSlot(target);
    }

    positionMatCoinSlots();

    const slot = MAT_COIN_SLOTS[target]();
    const wrap = slot?.querySelector(`[data-mat-coin-toss="${target}"]`);
    const coinEl = slot?.querySelector(`[data-mat-coin-el="${target}"]`);

    if (!slot?.classList.contains('has-coin') || !wrap || !coinEl) {
      resolve(result);
      return;
    }

    slot.classList.add('flipping');

    tossRevolutions[target] += 1;
    const finalDeg =
      tossRevolutions[target] * 1440 + (result === 'tails' ? 180 : 0);

    coinEl.style.setProperty('--coin-flip', `${finalDeg}deg`);
    wrap.classList.remove('tossing');
    void wrap.offsetWidth;
    wrap.classList.add('tossing');

    const finish = () => {
      wrap.classList.remove('tossing');
      slot.classList.remove('flipping');
      resolve(result);
    };

    wrap.addEventListener('animationend', finish, { once: true });
    setTimeout(finish, durationMs);
  });
};

/** Manual / board-button coin flip for the bottom-of-screen player. */
export const flipBoardCoin = async (initiator, result) => {
  const target =
    initiator === 'self' || initiator === 'opp' ? initiator : systemState.initiator;
  const coin = selectedCoins[target] || pickRandomCoin();
  const flipResult =
    result === 'heads' || result === 'tails'
      ? result
      : Math.random() < 0.5
        ? 'heads'
        : 'tails';

  await flipMatCoin({ target, result: flipResult, coin });
  return flipResult;
};

const hookLayoutRefresh = () => {
  if (layoutHooked) return;
  layoutHooked = true;

  window.addEventListener('resize', positionMatCoinSlots);

  if (typeof ResizeObserver !== 'undefined') {
    layoutObserver = new ResizeObserver(() => positionMatCoinSlots());
    for (const target of ['self', 'opp']) {
      const active = CONTAINER_DOCS[target]()?.getElementById('active');
      if (active) layoutObserver.observe(active);
    }
  }

  document.addEventListener('rules-coin-changed', (event) => {
    const { target, coin } = event.detail || {};
    if (target !== 'self' && target !== 'opp') return;
    setSelectedCoin(target, coin);
  });
};

export const initMatCoins = () => {
  hookLayoutRefresh();
  renderMatCoins();
  requestAnimationFrame(positionMatCoinSlots);
};
