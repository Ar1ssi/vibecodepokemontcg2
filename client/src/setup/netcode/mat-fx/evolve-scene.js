// Design 041: plays the evolution scene (evolve-scene.mjs) over one card.
// Back canvas, the old and new card images, front canvas — in that order in one
// overlay on the card — over a screen dim. Every layer runs on WAAPI (D103) and
// removes itself.
import { readFrameTransform } from '../../image-logic/iframe-rect.mjs';
import { animateFrames, removeWhen, sampleKeyframes, spawnOverlay } from '../../image-logic/mat-fx.mjs';
import { viewportRect } from './banner.js';
import { playCanvasStage } from './canvas-stage.js';
import {
  EVOLVE_SCENE_MS,
  EVOLVE_STAGE,
  buildEvolveScene,
  drawEvolveBack,
  drawEvolveFront,
  newCardPose,
  oldCardPose,
  stageDimPose,
  turnOfMatrix,
} from './evolve-scene.mjs';

const BACKSTOP_PAD_MS = 400;
const LAYER_SAMPLES = 64;

const layer = (className) => {
  const el = document.createElement('div');
  el.className = className;
  return el;
};

const buildImage = (src) => {
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.draggable = false;
  return img;
};

const run = (el, pose, toFrame, samples = LAYER_SAMPLES) =>
  animateFrames(el, sampleKeyframes(pose, toFrame, samples), { duration: EVOLVE_SCENE_MS });

const settle = (host, done) => removeWhen(host, done, EVOLVE_SCENE_MS + BACKSTOP_PAD_MS);

/** Degrees the card's board is turned on screen (the opponent's is 180°). */
export const frameTurnOf = (element) => {
  const frame = element?.ownerDocument?.defaultView?.frameElement;
  if (!frame) return 0;
  return turnOfMatrix(readFrameTransform(frame).matrix);
};

/** The screen-wide dim, centred on the card. */
function playScreenDim(centre) {
  const viewport = viewportRect();
  if (viewport.width < 2 || viewport.height < 2) return;
  const host = spawnOverlay({ rect: viewport, className: 'fx-overlay fx-evolve-scene__dim' });
  host.style.setProperty('--fx-cx', `${centre.x}px`);
  host.style.setProperty('--fx-cy', `${centre.y}px`);
  settle(host, [run(host, stageDimPose, (opacity) => ({ opacity }), 48)]);
}

function cardLayer(className, src) {
  const wrap = layer(`fx-evolve-scene__card ${className}`);
  if (src) wrap.appendChild(buildImage(src));
  const white = layer('fx-evolve-scene__white');
  const shade = layer('fx-evolve-scene__shade');
  const sheen = layer('fx-evolve-scene__sheen');
  wrap.append(white, shade, sheen);
  return { wrap, white, shade, sheen };
}

const cardFrame = (turn, W, H) => (p) => ({
  transform:
    `translate(${p.x * W}px, ${p.y * H}px) perspective(${H * 4}px) rotate(${turn}deg) ` +
    `rotateX(${p.tiltX}deg) rotateY(${p.tiltY}deg) scale(${p.scale})`,
  opacity: p.opacity,
});

// The shade darkens the edge turned away; the sheen is a light band crossing the face.
const shadeFrame = (p) => ({
  opacity: 0.55 * p.shade,
  transform: `scaleX(${Math.sin((p.tiltY * Math.PI) / 180) < 0 ? -1 : 1})`,
});
const sheenFrame = (W) => (p) => ({ opacity: p.sheen, transform: `translateX(${p.sheenX * W}px)` });

/** The card-local part: both canvases and the two card images between them. */
function playStage(rect, turn, fromSrc, toSrc) {
  const W = rect.width;
  const H = rect.height;
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-evolve-scene' });
  const oldCard = cardLayer('fx-evolve-scene__card--old', fromSrc);
  const newCard = cardLayer('fx-evolve-scene__card--new', toSrc);
  host.append(oldCard.wrap, newCard.wrap);

  const scene = buildEvolveScene(Math.floor(Math.random() * 1e6));
  const size = H * EVOLVE_STAGE;
  const stage = (draw, before) =>
    playCanvasStage(host, {
      className: 'fx-evolve-scene__stage',
      cx: W / 2,
      cy: H / 2,
      size,
      duration: EVOLVE_SCENE_MS,
      before,
      draw: (ctx, t, elapsed) =>
        draw(ctx, t, {
          cx: size / 2,
          cy: size / 2,
          unit: H,
          card: { width: W, height: H },
          scene,
          time: elapsed / 1000,
        }),
    });
  const oldPose = (t) => oldCardPose(t, { hasArt: Boolean(fromSrc) });
  settle(host, [
    stage(drawEvolveBack, oldCard.wrap),
    stage(drawEvolveFront, null),
    run(oldCard.wrap, oldPose, cardFrame(turn, W, H)),
    run(oldCard.white, oldPose, (p) => ({ opacity: p.white })),
    run(oldCard.shade, oldPose, shadeFrame),
    run(oldCard.sheen, oldPose, sheenFrame(W)),
    run(newCard.wrap, newCardPose, cardFrame(turn, W, H)),
    run(newCard.white, newCardPose, (p) => ({ opacity: p.white })),
    run(newCard.shade, newCardPose, shadeFrame),
    run(newCard.sheen, newCardPose, sheenFrame(W)),
  ]);
}

/**
 * Play the evolution scene over the card at `rect` (parent-viewport pixels).
 * `turn` is the board's rotation in degrees (see `frameTurnOf`); `fromSrc` is
 * the pre-evolution card's art and `toSrc` the evolved card's — a missing
 * `fromSrc` starts the card as pearl white.
 */
export function playEvolveScene({ rect, turn = 0, fromSrc = null, toSrc = null }) {
  if (!rect || !(rect.width > 1) || !(rect.height > 1)) return false;
  playScreenDim({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  playStage(rect, turn, fromSrc, toSrc);
  return true;
}
