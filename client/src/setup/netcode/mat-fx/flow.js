// Design 022 slice 6 / design 026: flow effects — turn banner (+ screen-edge
// glow), the ability tag over the Pokémon that used it, and the game-over
// celebration (confetti cannons on a win, dim on a loss). Design 024: the
// banner/edge-glow overlays live in banner.js, shared with the attack-name
// banner. The game-over modal itself is apply-view's `reconcileGameEnded`;
// these play on top of it and never take pointer events.
import { getCardRegistry } from '../apply-view.js';
import {
  animateFrames,
  rectForInstance,
  removeWhen,
  sampleKeyframes,
  spawnOverlay,
} from '../../image-logic/mat-fx.mjs';
import { playBanner, playEdgeGlow, viewportRect } from './banner.js';
import {
  ABILITY_TAG_MS,
  CONFETTI_MS,
  DIM_MS,
  abilityBannerText,
  abilityTagPose,
  abilityTagRect,
  abilityTagText,
  confettiPiecePose,
  confettiPieces,
  dimPose,
  sweepPose,
  turnBannerText,
} from './flow-pose.mjs';

const BACKSTOP_PAD_MS = 400;

const textNode = (className, text) => {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  return el;
};

export const turnBanner = (plan) => {
  const text = turnBannerText(plan.user, plan.number);
  if (!text) return 0;
  playBanner(text, plan.user);
  playEdgeGlow(plan.user);
};

const playAbilityTag = (text, cardRect, side) => {
  const rect = abilityTagRect(cardRect, viewportRect());
  const host = spawnOverlay({
    rect,
    className: `fx-overlay fx-ability-tag fx-ability-tag--${side || 'neutral'}`,
  });
  const pill = document.createElement('div');
  pill.className = 'fx-ability-tag__pill';
  pill.append(textNode('fx-ability-tag__sub', text.sub), textNode('fx-ability-tag__title', text.title));
  const sweep = document.createElement('div');
  sweep.className = 'fx-ability-tag__sweep';
  pill.appendChild(sweep);
  host.appendChild(pill);
  const pillFrames = sampleKeyframes(
    abilityTagPose,
    (p) => ({ transform: `translateY(${p.y}px) scale(${p.scale})`, opacity: p.opacity }),
    24
  );
  const sweepFrames = sampleKeyframes(
    (t) => sweepPose(t, { start: 0.14, end: 0.45 }),
    (p) => ({ transform: `translateX(${p.x * 130}%) skewX(-24deg)`, opacity: p.opacity }),
    16
  );
  removeWhen(
    host,
    [
      animateFrames(pill, pillFrames, { duration: ABILITY_TAG_MS }),
      animateFrames(sweep, sweepFrames, { duration: ABILITY_TAG_MS }),
    ],
    ABILITY_TAG_MS + BACKSTOP_PAD_MS
  );
};

// Anchored over the Pokémon when it is on the board; the full-width banner is
// the fallback when its card cannot be found.
export const abilityBanner = (plan) => {
  const registry = getCardRegistry();
  const cardRect = rectForInstance(plan.instanceId, registry);
  if (!cardRect) {
    const text = abilityBannerText(plan.name);
    if (!text) return 0;
    playBanner(text, plan.user);
    return;
  }
  const text = abilityTagText(registry.get(plan.instanceId)?.card, plan.name);
  if (!text) return 0;
  playAbilityTag(text, cardRect, plan.user);
};

const playConfetti = () => {
  const rect = viewportRect();
  if (rect.width < 2) return 0;
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-confetti' });
  const pieces = confettiPieces(undefined, Date.now() % 100000);
  const done = pieces.map((piece) => {
    const node = document.createElement('i');
    node.style.width = `${piece.size}px`;
    node.style.height = `${piece.size * 0.55}px`;
    node.style.background = `linear-gradient(135deg, hsl(${piece.hue} 90% 68%), hsl(${piece.hue} 85% 46%))`;
    host.appendChild(node);
    const frames = sampleKeyframes(
      (t) => confettiPiecePose(piece, t),
      (p) => ({
        transform: `translate3d(${p.x * rect.width}px, ${p.y * rect.height}px, 0) rotate(${p.rotate}deg) rotateX(${p.flip}deg)`,
        opacity: p.opacity,
      }),
      40
    );
    return animateFrames(node, frames, { duration: CONFETTI_MS });
  });
  removeWhen(host, done, CONFETTI_MS + BACKSTOP_PAD_MS);
};

const playDim = () => {
  const host = spawnOverlay({ rect: viewportRect(), className: 'fx-overlay fx-dim' });
  const frames = sampleKeyframes(dimPose, (p) => ({ opacity: p.opacity }), 16);
  removeWhen(host, [animateFrames(host, frames, { duration: DIM_MS })], DIM_MS + BACKSTOP_PAD_MS);
};

// user is the winner's side: self = you won, opp = you lost, null = no winner.
export const gameOver = (plan) => {
  if (plan.user === 'self') playConfetti();
  else if (plan.user === 'opp') playDim();
};
