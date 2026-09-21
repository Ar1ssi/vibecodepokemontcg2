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
import {
  applyCoinEffect,
  coinArtUrl,
  coinEffectLayerMarkup,
  COIN_BACK_URL,
  startCoinDrift,
  stopCoinDrift,
} from '../deck-builder/core/coin-effects.mjs';
import { playCoinFlipCeremony } from './coin-flip-ceremony.js';

const MAT_COIN_SLOTS = {
  self: () => selfContainerDocument.getElementById('matCoinSlot'),
  opp: () => oppContainerDocument.getElementById('matCoinSlot'),
};

const selectedCoins = { self: null, opp: null };
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

/**
 * Stable fallback for a player who has not chosen a coin: the first catalog
 * coin. Deterministic so repeated flips never shuffle the art mid-match.
 */
export const pickDefaultCoin = () => {
  const coins = getCoins();
  return coins.length > 0 ? coins[0] : null;
};

/** Position is CSS-driven inside each playmat iframe (#matCoinSlot). */
export const positionMatCoinSlots = () => {};

export const renderMatCoinSlot = (target) => {
  const slot = MAT_COIN_SLOTS[target]?.();
  if (!slot) return;

  const coin = selectedCoins[target];
  slot.querySelectorAll('.coin-3d').forEach((el) => stopCoinDrift(el));
  slot.innerHTML = '';
  if (!coin) {
    slot.classList.remove('has-coin');
    return;
  }

  const layers = coinEffectLayerMarkup('div');
  slot.classList.add('has-coin');
  slot.innerHTML = [
    `<span class="coin-toss-wrap mat-coin-toss-wrap" data-mat-coin-toss="${target}">`,
    `<div class="coin-3d mat-coin-token" data-mat-coin-el="${target}">`,
    `<div class="coin-face coin-front"><img src="${escapeHtml(coinArtUrl(coin.thumb))}" alt="${escapeHtml(coin.name || 'coin')}">${layers}</div>`,
    `<div class="coin-face coin-backc"><img src="${COIN_BACK_URL}" alt="">${layers}</div>`,
    `</div>`,
    `</span>`,
  ].join('');
  const coinEl = slot.querySelector('[data-mat-coin-el]');
  // The mask URL must be resolved the same way as the <img>, or the relative
  // catalog path would resolve against the iframe's base and 404.
  applyCoinEffect(coinEl, { ...coin, thumb: coinArtUrl(coin.thumb) });
  startCoinDrift(coinEl, { phaseOffset: target === 'opp' ? 0.5 : 0 });
};

export const renderMatCoins = () => {
  renderMatCoinSlot('self');
  renderMatCoinSlot('opp');
};

/** Manual / board-button coin flip — plays the shared full-screen ceremony. */
export const flipBoardCoin = async (initiator, result) => {
  const target =
    initiator === 'self' || initiator === 'opp' ? initiator : systemState.initiator;
  const coin = selectedCoins[target] || pickDefaultCoin();
  const flipResult =
    result === 'heads' || result === 'tails'
      ? result
      : Math.random() < 0.5
        ? 'heads'
        : 'tails';

  await playCoinFlipCeremony({
    coin,
    result: flipResult,
    ownerLabel: target === 'self' ? 'Your' : "Opponent's",
  });
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
