// Design 066: plays TCG Live's evolution (evolve-scene.mjs) and devolution
// (devolve-scene.mjs) prefabs over one card. One overlay on the card holds one
// canvas stage, EVOLVE_STAGE card heights square, redrawn from its own WAAPI
// clock (D118/D119) and screened onto the board; the host removes itself when
// the clock finishes, with a backstop.
import { readFrameTransform } from '../../image-logic/iframe-rect.mjs';
import { removeWhen, spawnOverlay } from '../../image-logic/mat-fx.mjs';
import { playCanvasStage } from './canvas-stage.js';
import { DEVOLVE_SCENE_MS, buildDevolveScene, devolveOps } from './devolve-scene.mjs';
import { EVOLVE_SCENE_MS, EVOLVE_STAGE, buildEvolveScene, evolveOps, turnOfMatrix } from './evolve-scene.mjs';
import { createDrawState, drawTcglOps, preloadTcglTextures } from './tcgl-canvas.js';
import { CARD_UNITS } from './tcgl-fx.mjs';

const BACKSTOP_PAD_MS = 400;

/** Degrees the card's board is turned on screen (the opponent's is 180°). */
export const frameTurnOf = (element) => {
  const frame = element?.ownerDocument?.defaultView?.frameElement;
  if (!frame) return 0;
  return turnOfMatrix(readFrameTransform(frame).matrix);
};

const validRect = (rect) => Boolean(rect) && rect.width > 1 && rect.height > 1;

function playScene(rect, turn, { className, durationMs, build, opsAt }) {
  if (!validRect(rect)) return false;
  preloadTcglTextures();
  const host = spawnOverlay({ rect, className: `fx-overlay fx-tcgl-scene ${className}` });
  // The opponent's board is turned 180°; the effect turns with its card.
  if (turn) host.style.transform = `rotate(${turn}deg)`;
  const scene = build(Math.floor(Math.random() * 1e6));
  const state = createDrawState();
  const size = rect.height * EVOLVE_STAGE;
  const view = { cx: size / 2, cy: size / 2, unit: rect.height / CARD_UNITS, size, cardW: rect.width, cardH: rect.height };
  const clock = playCanvasStage(host, {
    className: 'fx-tcgl-scene__stage',
    cx: rect.width / 2,
    cy: rect.height / 2,
    size,
    duration: durationMs,
    draw: (ctx, _t, elapsedMs) => drawTcglOps(ctx, opsAt(scene, elapsedMs / 1000), view, state),
  });
  removeWhen(host, [clock], durationMs + BACKSTOP_PAD_MS);
  return true;
}

/**
 * Play the evolution over the evolved card at `rect` (parent-viewport px);
 * `turn` is its board's rotation in degrees (`frameTurnOf`). False when there
 * is no card to play on.
 */
export const playEvolveScene = ({ rect, turn = 0 }) =>
  playScene(rect, turn, { className: 'fx-tcgl-scene--evolve', durationMs: EVOLVE_SCENE_MS, build: buildEvolveScene, opsAt: evolveOps });

/** Play the devolution over the card left in the slot (same contract as `playEvolveScene`). */
export const playDevolveScene = ({ rect, turn = 0 }) =>
  playScene(rect, turn, { className: 'fx-tcgl-scene--devolve', durationMs: DEVOLVE_SCENE_MS, build: buildDevolveScene, opsAt: devolveOps });

// Warm the texture cache once the page is idle so the first evolution draws every layer.
if (typeof window !== 'undefined') (window.requestIdleCallback || ((fn) => setTimeout(fn, 1500)))(() => preloadTcglTextures());
