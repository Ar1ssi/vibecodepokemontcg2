// Full-screen, TCG Live-style coin flip ceremony: dim the board, tumble the
// chosen coin at centre screen in 3D, reveal the result, fade out.
//
// Shared by the opening turn-order call and every in-game coin flip so there is
// one presentation. The overlay styling lives in index.css
// (#turnOrderCoinFlipOverlay + .turn-order-coin-flip-*); the coin's material
// and fixed-light layers come from css/coin/* via coin-effects.mjs.

import {
  applyCoinEffect,
  coinArtUrl,
  coinEffectLayerMarkup,
  COIN_BACK_URL,
} from '../deck-builder/core/coin-effects.mjs';

export const COIN_FLIP_OVERLAY_ID = 'turnOrderCoinFlipOverlay';

// Toss duration must match the --coin-flip transition / coin-toss-arc keyframes
// in css/coin/base.css (1.35s). Total stays inside the opening's
// e2eDelayMs(2700) start gate so the game does not begin mid-ceremony.
const TOSS_MS = 1350;
const REVEAL_MS = TOSS_MS + 50;
const HOLD_MS = 900;
const FADE_MS = 400;

const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const preferReducedMotion = (doc) => {
  const view = doc?.defaultView || (typeof window !== 'undefined' ? window : null);
  try {
    return view?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  } catch {
    return false;
  }
};

const scheduleFrame = (doc, fn) => {
  const view = doc?.defaultView || (typeof window !== 'undefined' ? window : null);
  if (typeof view?.requestAnimationFrame === 'function') {
    view.requestAnimationFrame(fn);
    return;
  }
  setTimeout(fn, 0);
};

/**
 * The markup for the ceremony overlay. Exported so tests can assert the coin
 * faces and material hooks without a full DOM.
 *
 * @param {{ coin?: object, result?: 'heads'|'tails', ownerLabel?: string }} args
 * @returns {string}
 */
export const coinFlipCeremonyMarkup = ({ coin = null, ownerLabel = '' } = {}) => {
  const label = ownerLabel
    ? `${ownerLabel} coin — flipping for turn order…`
    : 'Flipping the coin…';
  const front = coinArtUrl(coin?.thumb || coin?.url);
  const layers = coinEffectLayerMarkup();
  return [
    `<div class="turn-order-coin-flip-label">${escapeHtml(label)}</div>`,
    `<span class="coin-toss-wrap" data-coin-toss>`,
    `<div class="coin-3d" data-coin-flip-el>`,
    `<div class="coin-face coin-front"><img src="${escapeHtml(front)}" alt="${escapeHtml(coin?.name || 'coin')}" />${layers}</div>`,
    `<div class="coin-face coin-backc"><img src="${COIN_BACK_URL}" alt="back" />${layers}</div>`,
    `</div>`,
    `</span>`,
    `<div class="turn-order-coin-flip-result"></div>`,
  ].join('');
};

/**
 * Play the ceremony. Resolves once the overlay has faded and been removed, so
 * callers can await it or ignore it (the opening uses a fixed timer instead).
 *
 * @param {{
 *   coin?: object|null,
 *   result?: 'heads'|'tails',
 *   ownerLabel?: string,
 *   winnerLabel?: string,
 *   revealMs?: number,
 *   holdMs?: number,
 *   fadeMs?: number,
 *   doc?: Document,
 * }} [args]
 * @returns {Promise<void>}
 */
export const playCoinFlipCeremony = ({
  coin = null,
  result = 'heads',
  ownerLabel = '',
  winnerLabel = '',
  revealMs = REVEAL_MS,
  holdMs = HOLD_MS,
  fadeMs = FADE_MS,
  doc = typeof document !== 'undefined' ? document : null,
} = {}) => {
  return new Promise((resolve) => {
    if (!doc?.body) {
      resolve();
      return;
    }

    doc.getElementById(COIN_FLIP_OVERLAY_ID)?.remove();

    const overlay = doc.createElement('div');
    overlay.id = COIN_FLIP_OVERLAY_ID;
    overlay.innerHTML = coinFlipCeremonyMarkup({ coin, ownerLabel });
    doc.body.appendChild(overlay);

    const coinEl = overlay.querySelector('[data-coin-flip-el]');
    const wrap = overlay.querySelector('[data-coin-toss]');
    const resultEl = overlay.querySelector('.turn-order-coin-flip-result');

    applyCoinEffect(coinEl, { ...(coin || {}), thumb: coinArtUrl(coin?.thumb || coin?.url) });

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      overlay.classList.add('fading');
      setTimeout(() => {
        overlay.remove();
        resolve();
      }, fadeMs);
    };

    const revealResult = () => {
      const face = result === 'tails' ? 'Tails' : 'Heads';
      if (resultEl) {
        resultEl.textContent = winnerLabel ? `${face}! ${winnerLabel} first.` : `${face}!`;
        resultEl.classList.add('visible');
      }
      setTimeout(finish, holdMs);
    };

    if (preferReducedMotion(doc)) {
      coinEl?.style.setProperty('--coin-flip', result === 'tails' ? '180deg' : '0deg');
      revealResult();
      return;
    }

    scheduleFrame(doc, () => {
      const finalDeg = 4 * 360 + (result === 'tails' ? 180 : 0);
      coinEl?.style.setProperty('--coin-flip', `${finalDeg}deg`);
      wrap?.classList.add('tossing');
      setTimeout(revealResult, revealMs);
    });
  });
};
