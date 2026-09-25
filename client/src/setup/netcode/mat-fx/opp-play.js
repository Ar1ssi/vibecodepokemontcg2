// Design 043: plays the opponent's Trainer/Stadium (opp-play.mjs) — a two-faced
// card (their sleeve behind, the card's face in front) that drops off their
// hand, grows to a preview over the mat, holds and shrinks into its spot. The
// real card stays hidden until the preview lands on it. WAAPI (D103), and the
// overlay removes itself.
import {
  animateFrames,
  hideDuring,
  rectForInstance,
  removeWhen,
  sampleKeyframes,
  spawnOverlay,
} from '../../image-logic/mat-fx.mjs';
import { resolveCardBackSrc } from '../apply-view.js';
import { viewportRect } from './banner.js';
import { pileOf } from './card-flight.js';
import { frameTurnOf } from './evolve-scene.js';
import { OPP_PLAY_MS, matCenter, oppPlayTrack, oppPreviewRect } from './opp-play.mjs';

const BACKSTOP_PAD_MS = 400;
const SAMPLES = 72;

const face = (className, src) => {
  const img = document.createElement('img');
  img.className = className;
  img.src = src;
  img.alt = '';
  img.draggable = false;
  return img;
};

const boardFrameRects = () =>
  ['oppContainer', 'selfContainer'].map((id) => document.getElementById(id)?.getBoundingClientRect() || null);

// Where the card ends up: its own element when drawn, else the discard pile
// when it already went there (a Trainer that resolved at once), else nowhere.
function landingOf(instanceId, registry, user) {
  const element = registry?.get(instanceId)?.element || null;
  const rect = rectForInstance(instanceId, registry);
  if (rect) return { rect, turn: frameTurnOf(element), element, fade: false };
  if (element?.dataset?.zone === 'discard') {
    const pile = pileOf(user, 'discard');
    if (pile) return { rect: pile.rect, turn: pile.turn, element: null, fade: true };
  }
  return { rect: null, turn: 0, element: null, fade: true };
}

/**
 * @param {{instanceId: any, user: 'opp'|'self', origin?: {rect, src, turn}|null,
 *   src: string|null, registry: Map}} opts - `origin` is the pre-diff hand
 *   card (origins.mjs), `src` the card's face
 * @returns {boolean} false when nothing could play
 */
export function playOppTrainer({ instanceId, user, origin, src, registry }) {
  const viewport = viewportRect();
  if (!src || viewport.width < 2 || viewport.height < 2) return false;
  const preview = oppPreviewRect(matCenter(boardFrameRects(), viewport), viewport);
  if (!(preview.width > 1)) return false;
  const landing = landingOf(instanceId, registry, user);
  const pose = oppPlayTrack({
    from: origin?.rect || null,
    preview,
    to: landing.rect,
    fromTurn: origin?.turn || 0,
    toTurn: landing.turn,
    toFade: landing.fade,
  });

  const host = spawnOverlay({ rect: preview, className: 'fx-overlay fx-opp-play' });
  const card = document.createElement('div');
  card.className = 'fx-opp-play__card';
  const shine = document.createElement('div');
  shine.className = 'fx-opp-play__shine';
  const band = document.createElement('i');
  shine.appendChild(band);
  card.append(
    face('fx-opp-play__back', origin?.src || resolveCardBackSrc('them')),
    face('fx-opp-play__front', src),
    shine
  );
  host.appendChild(card);

  const H = preview.height;
  const frames = sampleKeyframes(
    pose,
    (p) => ({
      transform:
        `translate(${p.x}px, ${p.y}px) perspective(${H * 4}px) rotate(${p.rotate}deg) ` +
        `rotateX(${p.tiltX}deg) rotateY(${p.flip}deg) scale(${p.scale})`,
    }),
    SAMPLES
  );
  // Opacity on the 3D card itself would flatten it and hide the sleeve side,
  // so the fade runs on the host.
  const fadeFrames = sampleKeyframes(pose, (p) => ({ opacity: p.opacity }), SAMPLES);
  // The shine crosses the face once as the preview settles.
  const shineFrames = [
    { transform: 'translateX(-120%) skewX(-18deg)', opacity: 0, offset: 0 },
    { transform: 'translateX(-120%) skewX(-18deg)', opacity: 0, offset: 0.26 },
    { transform: 'translateX(40%) skewX(-18deg)', opacity: 0.9, offset: 0.36 },
    { transform: 'translateX(200%) skewX(-18deg)', opacity: 0, offset: 0.46 },
    { transform: 'translateX(200%) skewX(-18deg)', opacity: 0, offset: 1 },
  ];
  const done = [
    animateFrames(card, frames, { duration: OPP_PLAY_MS }),
    animateFrames(host, fadeFrames, { duration: OPP_PLAY_MS }),
    animateFrames(band, shineFrames, { duration: OPP_PLAY_MS }),
  ];
  const backstop = OPP_PLAY_MS + BACKSTOP_PAD_MS;
  removeWhen(host, done, backstop);
  if (landing.element) hideDuring(landing.element, Promise.all(done), backstop);
  return true;
}
