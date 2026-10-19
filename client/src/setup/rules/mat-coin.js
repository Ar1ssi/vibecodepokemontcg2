// Persistent battle-mat coin tokens: render each player's chosen coin beside
// their Active Pokémon and play flip animations on the mat (not full-screen).

import {
  selfContainerDocument,
  oppContainerDocument,
} from '../../initialization/global-variables/containers.js';
import { systemState } from '../../initialization/global-variables/global-variables.js';
import {
  DEFAULT_COIN,
  coinCatalogLoaded,
  getCoinById,
  loadCoinCatalog,
} from '../deck-builder/core/coins.mjs';
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
export const pickDefaultCoin = () => ({ ...DEFAULT_COIN });

const COIN_CATALOG = { isLoaded: coinCatalogLoaded, load: loadCoinCatalog, lookup: getCoinById };

/**
 * Calls `play(coin)` at once with the catalog coin `coinId` names, or null (no id, an unknown id, a
 * catalog not in memory yet or that failed to load); each caller falls back as it always has. Never
 * deferred: the flip ceremonies' timers, FX holds and the deal start at the call, so the ceremony
 * must too. The catalog is JSON fetched after boot (design 073) and initMatCoins starts that fetch;
 * a call that finds it missing starts it again so the next flip names its coin.
 */
export const withCatalogCoin = (coinId, play, catalog = COIN_CATALOG) => {
  if (!coinId) return play(null);
  if (catalog.isLoaded()) return play(catalog.lookup(coinId));
  catalog.load().catch((error) => console.warn('[mat coin] coin catalog unavailable.', error));
  return play(null);
};

/** Position is CSS-driven inside each board mirror root (#matCoinSlot). */
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
  // The mask URL must be resolved the same way as the <img>.
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
  // Warm the coin catalog so flips that name a coin never wait for it (withCatalogCoin).
  loadCoinCatalog().catch((error) => console.warn('[mat coin] coin catalog unavailable.', error));
  hookLayoutRefresh();
  renderMatCoins();
};
