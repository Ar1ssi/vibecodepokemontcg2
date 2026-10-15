// TCG Live's deck customization preview (design 071): the deck's box, sleeve and coin as 3D objects with
// Preview All / Focused, prev/next arrows and drag-to-rotate, shown above the Customize pickers.
//
// The box and sleeve live in one three scene (object-stage.js); the coin keeps its own stage (069) on a
// canvas laid over it, placed where the game's camera would project the disc (stage-math.mjs coinFrame).
// three and both stages load on first show() and are disposed on hide(): no idle WebGL contexts.
import { motionReduced } from '../../../image-logic/mat-fx.mjs';
import { discRadius } from '../../../netcode/mat-fx/coin-stage-math.mjs';
import {
  SLIDE_SECONDS,
  blendPose,
  coinFrame,
  coinShadowFrame,
  dragYaw,
  layoutFor,
  passiveYaw,
  yawDegrees,
} from './stage-math.mjs';

const SCENE_URL = '/src/assets/deckbox/scene.json';
const COIN_MESH_URL = '/src/assets/coins/tcgl/coin-mesh.json';
const HIDDEN_PX_SCALE = 0.01;
const VIEWS = ['box', 'sleeve', 'coin'];

let failureLogged = false;
const warnOnce = (error) => {
  if (failureLogged) return;
  failureLogged = true;
  console.warn('[customize stage] 3D preview unavailable; the pickers still work.', error);
};

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
};

const clonePose = (pose) => ({ p: [...pose.p], q: [...pose.q], s: [...pose.s] });

const MARKUP = [
  '<div class="customize-stage-viewport">',
  '  <div class="customize-stage-coin-shadow"></div>',
  '  <div class="customize-stage-objects"></div>',
  '  <div class="customize-stage-coin"></div>',
  '  <button type="button" class="customize-stage-arrow" data-dir="-1" aria-label="Previous item">&#8249;</button>',
  '  <button type="button" class="customize-stage-arrow" data-dir="1" aria-label="Next item">&#8250;</button>',
  '</div>',
  '<div class="customize-stage-bar">',
  '  <div class="customize-stage-toggle" role="group" aria-label="Preview mode">',
  '    <button type="button" data-mode="all">Preview All</button>',
  '    <button type="button" data-mode="focused">Focused</button>',
  '  </div>',
  '  <div class="customize-stage-caption" aria-live="polite"></div>',
  '</div>',
].join('');

/**
 * @param {object} options
 * @param {HTMLElement} options.panelEl
 * @param {() => { boxAtlasUrl: string|null, boxName: string, sleeveUrl: string|null, sleeveName: string,
 *   coin: { id: string, artUrl?: string }|null, coinName: string }} options.getSelection
 *   current picks; read on show(), refresh() and every step
 * @param {(slot: 'box'|'sleeve'|'coin', dir: number) => void} options.onStep an arrow was pressed
 * @returns {{ show: () => void, hide: () => void, setView: (view: string) => void, refresh: () => void } | null}
 */
export const initializeCustomizeStage = ({ panelEl, getSelection, onStep }) => {
  if (!panelEl) return null;
  panelEl.innerHTML = MARKUP;
  const viewportEl = panelEl.querySelector('.customize-stage-viewport');
  const objectsHost = panelEl.querySelector('.customize-stage-objects');
  const coinHost = panelEl.querySelector('.customize-stage-coin');
  const shadowEl = panelEl.querySelector('.customize-stage-coin-shadow');
  const captionEl = panelEl.querySelector('.customize-stage-caption');
  const modeButtons = [...panelEl.querySelectorAll('[data-mode]')];

  const state = {
    shown: false,
    view: 'box',
    mode: 'all',
    token: 0,
    scene: null,
    radius: 1,
    objects: null,
    coin: null,
    frameId: 0,
    current: null,
    tween: null,
    yaw: { box: 0, sleeve: 0, coin: 0 },
    lastFrameAt: 0,
    drag: null,
    applied: { box: undefined, sleeve: undefined, coin: undefined },
    coinSide: 0,
  };

  const focusSlot = () => (state.mode === 'focused' ? state.view : null);

  const paintToggle = () => {
    for (const button of modeButtons) {
      const active = button.dataset.mode === state.mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  };

  const paintCaption = (selection) => {
    const lines = {
      box: `Deck Box: ${selection.boxName}`,
      sleeve: `Card Sleeve: ${selection.sleeveName}`,
      coin: `Coin: ${selection.coinName}`,
    };
    captionEl.textContent = state.mode === 'focused' ? lines[state.view].replace(/^[^:]+: /, '') : VIEWS.map((view) => lines[view]).join(' · ');
  };

  /** Pushes changed picks into the three stages and the caption. */
  const applySelection = () => {
    const selection = getSelection();
    paintCaption(selection);
    const { objects, coin, applied } = state;
    if (objects && applied.box !== selection.boxAtlasUrl) {
      applied.box = selection.boxAtlasUrl;
      objects.setBoxAtlas(selection.boxAtlasUrl).catch(warnOnce);
    }
    if (objects && applied.sleeve !== selection.sleeveUrl) {
      applied.sleeve = selection.sleeveUrl;
      objects.setSleeveTexture(selection.sleeveUrl).catch(warnOnce);
    }
    const coinKey = selection.coin ? `${selection.coin.id}|${selection.coin.artUrl ?? ''}` : '';
    if (coin && applied.coin !== coinKey) {
      applied.coin = coinKey;
      coin.setCoin(selection.coin ?? null).catch(warnOnce);
    }
  };

  /** Moves every slot toward the layout for the current view and mode, sliding unless motion is reduced. */
  const retarget = (now) => {
    if (!state.scene || !state.current) return;
    const layout = layoutFor(state.scene, focusSlot());
    const to = {};
    for (const slot of VIEWS) to[slot] = layout[slot].pose;
    if (motionReduced()) {
      for (const slot of VIEWS) state.current[slot] = clonePose(to[slot]);
      state.tween = null;
      return;
    }
    const from = {};
    for (const slot of VIEWS) from[slot] = clonePose(state.current[slot]);
    state.tween = { from, to, startedAt: now };
  };

  const size = () => ({ width: viewportEl.clientWidth || 1, height: viewportEl.clientHeight || 1 });

  const placeCoin = (pose, yawExtraDeg) => {
    const { coin, scene } = state;
    const hidden = pose.s[0] < HIDDEN_PX_SCALE;
    coinHost.hidden = hidden;
    shadowEl.hidden = hidden;
    if (hidden) return;
    const stageSize = size();
    const frame = coinFrame(scene, pose, stageSize, state.radius);
    const side = Math.max(1, Math.round(frame.side));
    Object.assign(coinHost.style, {
      left: `${frame.x - side / 2}px`,
      top: `${frame.y - side / 2}px`,
      width: `${side}px`,
      height: `${side}px`,
    });
    if (side !== state.coinSide) {
      state.coinSide = side;
      coin.resize();
    }
    const shadow = coinShadowFrame(scene, pose, stageSize);
    Object.assign(shadowEl.style, {
      left: `${shadow.x - shadow.width / 2}px`,
      top: `${shadow.y - shadow.height / 2}px`,
      width: `${shadow.width}px`,
      height: `${shadow.height}px`,
    });
    coin.draw({ angle: 0, lift: 0, yaw: yawDegrees(pose.q) + yawExtraDeg }, performance.now());
  };

  const frame = (now) => {
    if (!state.shown || !state.objects || !state.coin) return;
    const dt = Math.min(0.05, Math.max(0, (now - state.lastFrameAt) / 1000));
    state.lastFrameAt = now;

    let settled = true;
    if (state.tween) {
      const progress = (now - state.tween.startedAt) / 1000 / SLIDE_SECONDS;
      settled = progress >= 1;
      for (const slot of VIEWS) {
        state.current[slot] = blendPose(state.tween.from[slot], state.tween.to[slot], progress);
      }
      if (settled) state.tween = null;
    }
    const focused = focusSlot();
    if (focused && settled && !state.drag && !motionReduced()) {
      state.yaw[focused] += passiveYaw(dt);
    }

    state.objects.setPose('box', state.current.box, state.yaw.box);
    state.objects.setPose('sleeve', state.current.sleeve, state.yaw.sleeve);
    state.objects.render();
    placeCoin(state.current.coin, (state.yaw.coin * 180) / Math.PI);
    state.frameId = requestAnimationFrame(frame);
  };

  const teardown = () => {
    if (state.frameId) cancelAnimationFrame(state.frameId);
    state.frameId = 0;
    state.objects?.dispose();
    state.coin?.dispose();
    state.objects = null;
    state.coin = null;
    state.tween = null;
    state.coinSide = 0;
    state.applied = { box: undefined, sleeve: undefined, coin: undefined };
  };

  const build = async () => {
    const token = state.token;
    try {
      const [scene, coinMesh, objectModule, coinModule] = await Promise.all([
        fetchJson(SCENE_URL),
        fetchJson(COIN_MESH_URL),
        import('./object-stage.js'),
        import('../../../netcode/mat-fx/coin-stage.js'),
      ]);
      if (token !== state.token) return;
      const objects = await objectModule.createObjectStage({ host: objectsHost, onLost: () => panelEl.classList.add('is-unavailable') });
      if (token !== state.token) {
        objects.dispose();
        return;
      }
      let coin;
      try {
        coin = await coinModule.createCoinStage({ host: coinHost, onLost: () => panelEl.classList.add('is-unavailable') });
      } catch (error) {
        objects.dispose();
        throw error;
      }
      if (token !== state.token) {
        objects.dispose();
        coin.dispose();
        return;
      }
      state.scene = scene;
      state.radius = discRadius(coinMesh.p);
      state.objects = objects;
      state.coin = coin;
      const layout = layoutFor(scene, focusSlot());
      state.current = {};
      for (const slot of VIEWS) state.current[slot] = clonePose(layout[slot].pose);
      objects.resize();
      applySelection();
      panelEl.classList.remove('is-unavailable');
      state.lastFrameAt = performance.now();
      state.frameId = requestAnimationFrame(frame);
    } catch (error) {
      if (token !== state.token) return;
      panelEl.classList.add('is-unavailable');
      warnOnce(error);
    }
  };

  const show = () => {
    if (state.shown) return;
    state.shown = true;
    panelEl.hidden = false;
    paintToggle();
    state.token += 1;
    build();
  };

  const hide = () => {
    if (!state.shown) return;
    state.shown = false;
    state.token += 1;
    teardown();
    panelEl.hidden = true;
  };

  const setMode = (mode) => {
    if (state.mode === mode) return;
    state.mode = mode;
    paintToggle();
    retarget(performance.now());
    if (state.shown) applySelection();
  };

  for (const button of modeButtons) {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  }
  for (const arrow of panelEl.querySelectorAll('[data-dir]')) {
    arrow.addEventListener('click', () => {
      onStep?.(state.view, Number(arrow.dataset.dir));
      if (state.shown) applySelection();
    });
  }

  viewportEl.addEventListener('pointerdown', (event) => {
    const focused = focusSlot();
    if (!focused || event.target.closest('button')) return;
    state.drag = { startX: event.clientX, startYaw: state.yaw[focused], slot: focused };
    viewportEl.setPointerCapture?.(event.pointerId);
  });
  viewportEl.addEventListener('pointermove', (event) => {
    if (!state.drag) return;
    state.yaw[state.drag.slot] = dragYaw(state.drag.startYaw, event.clientX - state.drag.startX);
  });
  const endDrag = () => {
    state.drag = null;
  };
  viewportEl.addEventListener('pointerup', endDrag);
  viewportEl.addEventListener('pointercancel', endDrag);

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      state.objects?.resize();
      state.coinSide = 0;
    }).observe(viewportEl);
  }

  paintToggle();
  panelEl.hidden = true;

  return {
    show,
    hide,
    /** A category was picked: focus its object (TCG Live's selectCategory). */
    setView: (view) => {
      if (!VIEWS.includes(view)) return;
      state.view = view;
      state.mode = 'focused';
      paintToggle();
      retarget(performance.now());
      if (state.shown) applySelection();
    },
    refresh: () => {
      if (state.shown) applySelection();
    },
  };
};
