// Full-screen, TCG Live-style coin flip ceremony: dim the board, tumble the
// chosen coin at centre screen in 3D, reveal the result, fade out.
//
// Shared by the opening turn-order call and every in-game coin flip so there is
// one presentation. Several flips from one effect toss one after another in the
// same overlay, with a running tally. The overlay styling lives in index.css
// (#turnOrderCoinFlipOverlay + .turn-order-coin-flip-*); the coin's material
// and fixed-light layers come from css/coin/* via coin-effects.mjs. The schedule
// (toss length, landings, hold) is coinCeremonyTimeline in mat-fx/coin-pose.mjs.

import {
  applyCoinEffect,
  coinArtUrl,
  coinEffectLayerMarkup,
  COIN_BACK_URL,
} from '../deck-builder/core/coin-effects.mjs';
import {
  coinCeremonyTimeline,
  coinFlipAngle,
  coinTallyText,
} from '../netcode/mat-fx/coin-pose.mjs';

export const COIN_FLIP_OVERLAY_ID = 'turnOrderCoinFlipOverlay';

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

// Commits the element's current style. A CSS transition only runs from a style
// the browser has already computed: set the spin target on a node that was
// never styled and it jumps straight to the end (the coin that never turned).
const flushStyle = (el) => {
  if (el) void el.offsetWidth;
};

const faceName = (face) => (face === 'tails' ? 'Tails' : 'Heads');

const defaultLabel = ({ ownerLabel, turnOrder }) => {
  if (!ownerLabel) return 'Flipping the coin…';
  return turnOrder ? `${ownerLabel} coin — flipping for turn order…` : `${ownerLabel} coin flip`;
};

/**
 * The markup for the ceremony overlay. Exported so tests can assert the coin
 * faces and material hooks without a full DOM.
 *
 * @param {{ coin?: object, ownerLabel?: string, label?: string, turnOrder?: boolean }} args
 * @returns {string}
 */
export const coinFlipCeremonyMarkup = ({
  coin = null,
  ownerLabel = '',
  label = '',
  turnOrder = true,
} = {}) => {
  const heading = label || defaultLabel({ ownerLabel, turnOrder });
  const front = coinArtUrl(coin?.thumb || coin?.url);
  const layers = coinEffectLayerMarkup();
  return [
    `<div class="turn-order-coin-flip-label">${escapeHtml(heading)}</div>`,
    `<span class="coin-toss-wrap" data-coin-toss>`,
    `<div class="coin-3d" data-coin-flip-el>`,
    `<div class="coin-face coin-front"><img src="${escapeHtml(front)}" alt="${escapeHtml(coin?.name || 'coin')}" />${layers}</div>`,
    `<div class="coin-face coin-backc"><img src="${COIN_BACK_URL}" alt="back" />${layers}</div>`,
    `</div>`,
    `</span>`,
    `<div class="turn-order-coin-flip-result"></div>`,
    `<div class="turn-order-coin-flip-tally"></div>`,
  ].join('');
};

/**
 * Play the ceremony. Resolves once the overlay has faded and been removed, so
 * callers can await it or ignore it (the opening uses a fixed timer instead).
 *
 * `results` flips the coin once per face, in order, in one overlay; `result`
 * is the single-flip shorthand. `revealMs` overrides the toss length (tests).
 * `passive` lets clicks through to the board: an in-game flip is cosmetic, the
 * board state it reports is already applied. `reducedMotion` overrides the
 * `prefers-reduced-motion` query (the app has its own setting).
 *
 * @param {{
 *   coin?: object|null,
 *   result?: 'heads'|'tails',
 *   results?: Array<'heads'|'tails'>,
 *   ownerLabel?: string,
 *   winnerLabel?: string,
 *   label?: string,
 *   passive?: boolean,
 *   reducedMotion?: boolean,
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
  results = null,
  ownerLabel = '',
  winnerLabel = '',
  label = '',
  passive = false,
  reducedMotion: reducedMotionOverride,
  revealMs,
  holdMs,
  fadeMs,
  doc = typeof document !== 'undefined' ? document : null,
} = {}) => {
  return new Promise((resolve) => {
    if (!doc?.body) {
      resolve();
      return;
    }

    const faces = Array.isArray(results) && results.length > 0 ? results : [result];
    const reducedMotion = reducedMotionOverride ?? preferReducedMotion(doc);
    const timeline = coinCeremonyTimeline(faces.length, {
      reducedMotion,
      tossMs: revealMs,
      holdMs,
      fadeMs,
    });

    doc.getElementById(COIN_FLIP_OVERLAY_ID)?.remove();

    const overlay = doc.createElement('div');
    overlay.id = COIN_FLIP_OVERLAY_ID;
    if (passive) overlay.classList.add('passive');
    overlay.style.setProperty('--coin-toss-ms', `${timeline.tossMs}ms`);
    overlay.innerHTML = coinFlipCeremonyMarkup({
      coin,
      ownerLabel,
      label,
      turnOrder: Boolean(winnerLabel),
    });
    doc.body.appendChild(overlay);

    const coinEl = overlay.querySelector('[data-coin-flip-el]');
    const wrap = overlay.querySelector('[data-coin-toss]');
    const resultEl = overlay.querySelector('.turn-order-coin-flip-result');
    const tallyEl = overlay.querySelector('.turn-order-coin-flip-tally');

    applyCoinEffect(coinEl, { ...(coin || {}), thumb: coinArtUrl(coin?.thumb || coin?.url) });

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      overlay.classList.add('fading');
      setTimeout(() => {
        overlay.remove();
        resolve();
      }, timeline.fadeMs);
    };

    const showResult = (text) => {
      if (!resultEl) return;
      resultEl.textContent = text;
      resultEl.classList.add('visible');
    };

    const land = (index) => {
      const face = faces[index];
      const isLast = index === faces.length - 1;
      if (tallyEl) tallyEl.textContent = coinTallyText(faces, index + 1);
      showResult(isLast && winnerLabel ? `${faceName(face)}! ${winnerLabel} first.` : `${faceName(face)}!`);
      if (isLast) {
        setTimeout(finish, timeline.holdMs);
        return;
      }
      setTimeout(() => toss(index + 1), timeline.gapMs);
    };

    const toss = (index) => {
      resultEl?.classList.remove('visible');
      if (reducedMotion) {
        coinEl?.style.setProperty('--coin-flip', faces[index] === 'tails' ? '180deg' : '0deg');
        land(index);
        return;
      }
      const angle = `${coinFlipAngle(index, faces[index])}deg`;
      // Restart the arc keyframes and give the spin a committed start angle.
      wrap?.classList.remove('tossing');
      flushStyle(coinEl);
      wrap?.classList.add('tossing');
      coinEl?.style.setProperty('--coin-flip', angle);
      setTimeout(() => land(index), timeline.tossMs);
    };

    if (tallyEl) tallyEl.textContent = coinTallyText(faces, 0);
    scheduleFrame(doc, () => toss(0));
  });
};
