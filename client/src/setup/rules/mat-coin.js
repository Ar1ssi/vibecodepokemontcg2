// Persistent battle-mat coin tokens: render each player's chosen coin beside
// their Active Pokémon and play flip animations on the mat (not full-screen).

import {
  selfContainer,
  oppContainer,
  selfContainerDocument,
  oppContainerDocument,
} from '../../initialization/global-variables/containers.js';
import { systemState } from '../../initialization/global-variables/global-variables.js';
import { getCoins } from '../deck-builder/core/coins.mjs';

const MAT_COIN_BACK_URL = '/src/assets/coins/coin-back.png';
const MAT_COIN_SLOTS = {
  self: () => selfContainerDocument.getElementById('matCoinSlot'),
  opp: () => oppContainerDocument.getElementById('matCoinSlot'),
};

const selectedCoins = { self: null, opp: null };
const tossRevolutions = { self: 0, opp: 0 };
let layoutHooked = false;

const wireMatCoinLighting = (coinEl) => {
  if (!coinEl) return;
  coinEl.addEventListener('pointermove', (e) => {
    const r = coinEl.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * 100;
    const py = ((e.clientY - r.top) / r.height) * 100;
    coinEl.style.setProperty('--coin-x', px.toFixed(1) + '%');
    coinEl.style.setProperty('--coin-y', py.toFixed(1) + '%');
    coinEl.style.setProperty('--coin-rx', ((py - 50) * -0.14).toFixed(2) + 'deg');
    coinEl.style.setProperty('--coin-ry', ((px - 50) * 0.16).toFixed(2) + 'deg');
  });
  coinEl.addEventListener('pointerleave', () => {
    coinEl.style.setProperty('--coin-x', '50%');
    coinEl.style.setProperty('--coin-y', '50%');
    coinEl.style.setProperty('--coin-rx', '0deg');
    coinEl.style.setProperty('--coin-ry', '0deg');
  });
};

const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const coinUrl = (path) => {
  if (!path) return MAT_COIN_BACK_URL;
  if (/^https?:\/\//.test(path) || path.startsWith('/')) return path;
  return `/${path.replace(/^\//, '')}`;
};

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

/** Position is CSS-driven inside each playmat iframe (#matCoinSlot). */
export const positionMatCoinSlots = () => {};

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
    `<div class="coin-face coin-front"><img src="${escapeHtml(coinUrl(coin.thumb))}" alt="${escapeHtml(coin.name || 'coin')}"></div>`,
    `<div class="coin-face coin-backc"><img src="${MAT_COIN_BACK_URL}" alt=""></div>`,
    `</div>`,
    `</span>`,
  ].join('');
  wireMatCoinLighting(slot.querySelector('[data-mat-coin-el]'));
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

  document.addEventListener('rules-coin-changed', (event) => {
    const { target, coin } = event.detail || {};
    if (target !== 'self' && target !== 'opp') return;
    setSelectedCoin(target, coin);
  });
};

export const initMatCoins = () => {
  hookLayoutRefresh();
  renderMatCoins();
  for (const container of [selfContainer, oppContainer]) {
    container?.addEventListener('load', renderMatCoins, { once: true });
  }
};
