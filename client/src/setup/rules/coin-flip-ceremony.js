// Full-screen, TCG Live-style coin flip ceremony: dim the board, toss the
// chosen coin at centre screen, reveal the result, fade out.
//
// Shared by the opening turn-order call and every in-game coin flip so there is
// one presentation. Several flips from one effect toss one after another in the
// same overlay, with a running tally. The overlay styling lives in index.css
// (#turnOrderCoinFlipOverlay + .turn-order-coin-flip-*); the coin's material
// and fixed-light layers come from css/coin/* via coin-effects.mjs. The schedule
// (toss length, landings, hold) is coinCeremonyTimeline in mat-fx/coin-pose.mjs.
//
// Two renderers share the schedule. The CSS coin (below) is the fallback, and it
// is the only one when motion is reduced or WebGL2 is missing. Otherwise the TCG
// Live coin stage (mat-fx/coin-stage.js, design 069) draws the disc with the game's
// own shaders. A stage that fails to load or loses its context hands over to the
// CSS coin, logged once. While the CSS coin is up its fixed light drifts and
// follows the spin, so the foil moves like the mat token's does.

import {
  applyCoinEffect,
  coinArtUrl,
  coinEffectLayerMarkup,
  COIN_BACK_URL,
  startCoinDrift,
  stopCoinDrift,
} from '../deck-builder/core/coin-effects.mjs';
import { motionReduced } from '../image-logic/mat-fx.mjs';
import { coinPoseAt } from '../netcode/mat-fx/coin-flip-anim.mjs';
import {
  coinCeremonyTimeline,
  coinFlipAngle,
  coinTallyText,
} from '../netcode/mat-fx/coin-pose.mjs';

export const COIN_FLIP_OVERLAY_ID = 'turnOrderCoinFlipOverlay';

const COIN_VFX_DIR = '/src/assets/coins/vfx/';
const COIN_SHADOW_URL = `${COIN_VFX_DIR}coin-shadow.png`;
const COIN_RING_URL = `${COIN_VFX_DIR}coin-flip-ring.png`;
const COIN_IMPACT_URLS = {
  heads: `${COIN_VFX_DIR}coin-impact-neutral.png`,
  tails: `${COIN_VFX_DIR}coin-impact-tails.png`,
};
const LANDING_RING_MS = 650;
const LANDING_IMPACT_MS = 450;

const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

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

let webgl2Supported = null;
/** Whether this browser can draw the coin stage. Probed once with a throwaway canvas. */
const canDrawCoinStage = (doc) => {
  webgl2Supported ??= (() => {
    try {
      return Boolean(doc.createElement('canvas').getContext('webgl2'));
    } catch {
      return false;
    }
  })();
  return webgl2Supported;
};

let stageFallbackWarned = false;
const warnStageFallbackOnce = (error) => {
  if (stageFallbackWarned) return;
  stageFallbackWarned = true;
  console.warn('coin stage unavailable; using the CSS coin', error);
};

/**
 * The markup for the ceremony overlay. Exported so tests can assert the coin
 * faces and material hooks without a full DOM. `stage` adds the TCG Live stage's
 * host (shadow, ring and impact sprites); the CSS coin stays for the fallback.
 *
 * @param {{ coin?: object, ownerLabel?: string, label?: string, turnOrder?: boolean, stage?: boolean }} args
 * @returns {string}
 */
export const coinFlipCeremonyMarkup = ({
  coin = null,
  ownerLabel = '',
  label = '',
  turnOrder = true,
  stage = false,
} = {}) => {
  const heading = label || defaultLabel({ ownerLabel, turnOrder });
  const front = coinArtUrl(coin?.thumb || coin?.url);
  const layers = coinEffectLayerMarkup();
  const stageHost = stage
    ? [
        `<div class="coin-stage-host" data-coin-stage>`,
        `<img class="coin-stage-shadow" data-coin-shadow src="${COIN_SHADOW_URL}" alt="" />`,
        `<img class="coin-stage-ring" data-coin-ring src="${COIN_RING_URL}" alt="" />`,
        `<img class="coin-stage-impact" data-coin-impact alt="" />`,
        `</div>`,
      ]
    : [];
  return [
    `<div class="turn-order-coin-flip-label">${escapeHtml(heading)}</div>`,
    ...stageHost,
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
 * board state it reports is already applied. `reducedMotion` defaults to the
 * app's own reduce-motion setting, never the OS `prefers-reduced-motion` flag:
 * Windows raises that whenever system animations are off, which froze every
 * coin (see motionReduced in image-logic/mat-fx.mjs).
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
    const reducedMotion = reducedMotionOverride ?? motionReduced();
    const timeline = coinCeremonyTimeline(faces.length, {
      reducedMotion,
      tossMs: revealMs,
      holdMs,
      fadeMs,
    });
    const useStage = !reducedMotion && canDrawCoinStage(doc);

    doc.getElementById(COIN_FLIP_OVERLAY_ID)?.remove();

    const overlay = doc.createElement('div');
    overlay.id = COIN_FLIP_OVERLAY_ID;
    if (passive) overlay.classList.add('passive');
    if (useStage) overlay.classList.add('stage-mode');
    overlay.style.setProperty('--coin-toss-ms', `${timeline.tossMs}ms`);
    overlay.innerHTML = coinFlipCeremonyMarkup({
      coin,
      ownerLabel,
      label,
      turnOrder: Boolean(winnerLabel),
      stage: useStage,
    });
    doc.body.appendChild(overlay);

    const coinEl = overlay.querySelector('[data-coin-flip-el]');
    const wrap = overlay.querySelector('[data-coin-toss]');
    const resultEl = overlay.querySelector('.turn-order-coin-flip-result');
    const tallyEl = overlay.querySelector('.turn-order-coin-flip-tally');
    const stageHost = overlay.querySelector('[data-coin-stage]');
    const shadowEl = overlay.querySelector('[data-coin-shadow]');

    applyCoinEffect(coinEl, { ...(coin || {}), thumb: coinArtUrl(coin?.thumb || coin?.url) });

    let finished = false;
    let fellBack = false;
    // Set once the stage is drawing: stops its frame loop and frees its context.
    let stopStage = null;

    const finish = () => {
      if (finished) return;
      finished = true;
      stopStage?.();
      overlay.classList.add('fading');
      setTimeout(() => {
        stopCoinDrift(coinEl);
        overlay.remove();
        resolve();
      }, timeline.fadeMs);
    };

    const showResult = (text) => {
      if (!resultEl) return;
      resultEl.textContent = text;
      resultEl.classList.add('visible');
    };

    const showLanding = (index) => {
      const face = faces[index];
      const isLast = index === faces.length - 1;
      if (tallyEl) tallyEl.textContent = coinTallyText(faces, index + 1);
      showResult(isLast && winnerLabel ? `${faceName(face)}! ${winnerLabel} first.` : `${faceName(face)}!`);
    };

    // CSS coin: each toss is a timer, the next one starts after its gap.
    const land = (index) => {
      showLanding(index);
      if (index === faces.length - 1) {
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
      overlay.style.setProperty('--coin-toss-ms', `${timeline.tossesMs[index]}ms`);
      wrap?.classList.add('tossing');
      coinEl?.style.setProperty('--coin-flip', angle);
      setTimeout(() => land(index), timeline.tossesMs[index]);
    };

    const fallBackToCss = () => {
      if (finished || fellBack) return;
      fellBack = true;
      stopStage?.();
      stageHost?.remove();
      overlay.classList.remove('stage-mode');
      scheduleFrame(doc, () => toss(0));
      startCoinDrift(coinEl, { followSpin: true });
    };

    // Stage: the same schedule, read off the clock each frame. The coin pose comes from coinPoseAt,
    // the landings fire as their times pass, and the overlay finishes holdMs after the last one.
    const updateShadow = (lift) => {
      if (!shadowEl) return;
      shadowEl.style.transform = `translate(-50%, 0) scale(${1 - 0.3 * lift})`;
      shadowEl.style.opacity = String(0.6 - 0.35 * lift);
    };

    const playLandingFx = (index) => {
      stageHost?.querySelector('[data-coin-ring]')?.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.35)', opacity: 0.9 },
          { transform: 'translate(-50%, -50%) scale(1.25)', opacity: 0 },
        ],
        { duration: LANDING_RING_MS, easing: 'ease-out' }
      );
      const impact = stageHost?.querySelector('[data-coin-impact]');
      if (!impact) return;
      impact.src = COIN_IMPACT_URLS[faces[index]];
      impact.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.5)', opacity: 1 },
          { transform: 'translate(-50%, -50%) scale(1.2)', opacity: 0 },
        ],
        { duration: LANDING_IMPACT_MS, easing: 'ease-out' }
      );
    };

    const runStage = (stage) => {
      let active = true;
      stopStage = () => {
        active = false;
        stage.dispose();
      };
      const started = performance.now();
      const lastLandingMs = timeline.landsAt[faces.length - 1];
      let landed = 0;
      const frame = () => {
        if (!active) return;
        const elapsedMs = performance.now() - started;
        const pose = coinPoseAt(faces, elapsedMs);
        stage.draw(pose, elapsedMs);
        updateShadow(pose.lift);
        while (landed < faces.length && elapsedMs >= timeline.landsAt[landed]) {
          showLanding(landed);
          playLandingFx(landed);
          landed += 1;
        }
        if (elapsedMs >= lastLandingMs + timeline.holdMs) {
          finish();
          return;
        }
        scheduleFrame(doc, frame);
      };
      frame();
    };

    const playOnStage = async () => {
      let stage = null;
      try {
        const { createCoinStage } = await import('../netcode/mat-fx/coin-stage.js');
        stage = await createCoinStage({ host: stageHost, onLost: fallBackToCss });
        await stage.setCoin(coin ? { id: coin.id, artUrl: coinArtUrl(coin.thumb || coin.url) } : null);
      } catch (error) {
        stage?.dispose();
        warnStageFallbackOnce(error);
        fallBackToCss();
        return;
      }
      if (finished || fellBack) {
        stage.dispose();
        return;
      }
      runStage(stage);
    };

    if (tallyEl) tallyEl.textContent = coinTallyText(faces, 0);
    if (useStage) {
      void playOnStage();
      return;
    }
    scheduleFrame(doc, () => toss(0));
    // After the toss is queued, so the first frame starts the spin before it samples it.
    startCoinDrift(coinEl, { followSpin: !reducedMotion });
  });
};
