// Design 022 slice 6: flow effects — turn banner (+ screen-edge glow), ability
// banner, and the game-over celebration (confetti on a win, dim on a loss).
// Design 024: the banner/edge-glow overlays moved to banner.js, shared with
// the attack-name banner.
// The game-over modal itself is apply-view's `reconcileGameEnded`; these play
// on top of it and never take pointer events.
import { runPose, spawnOverlay } from '../../image-logic/mat-fx.mjs';
import { playBanner, playEdgeGlow, viewportRect } from './banner.js';
import {
  CONFETTI_MS,
  DIM_MS,
  abilityBannerText,
  confettiPiecePose,
  confettiPieces,
  dimPose,
  turnBannerText,
} from './flow-pose.mjs';

export const turnBanner = (plan) => {
  const text = turnBannerText(plan.user, plan.number);
  if (!text) return 0;
  playBanner(text, plan.user);
  playEdgeGlow(plan.user);
};

export const abilityBanner = (plan) => {
  const text = abilityBannerText(plan.name);
  if (!text) return 0;
  playBanner(text, plan.user);
};

const playConfetti = () => {
  const rect = viewportRect();
  if (rect.width < 2) return 0;
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-confetti' });
  const pieces = confettiPieces(undefined, Date.now() % 100000);
  const nodes = pieces.map((piece) => {
    const node = document.createElement('i');
    node.style.width = `${piece.size}px`;
    node.style.height = `${piece.size * 0.55}px`;
    node.style.background = `hsl(${piece.hue} 85% 58%)`;
    host.appendChild(node);
    return node;
  });
  runPose(host, CONFETTI_MS, (t) => {
    pieces.forEach((piece, i) => {
      const pose = confettiPiecePose(piece, t);
      const node = nodes[i];
      node.style.transform = `translate3d(${pose.x * rect.width}px, ${pose.y * rect.height}px, 0) rotate(${pose.rotate}deg)`;
      node.style.opacity = String(pose.opacity);
    });
  });
};

const playDim = () => {
  const host = spawnOverlay({ rect: viewportRect(), className: 'fx-overlay fx-dim' });
  runPose(host, DIM_MS, (t) => {
    host.style.opacity = String(dimPose(t).opacity);
  });
};

// user is the winner's side: self = you won, opp = you lost, null = no winner.
export const gameOver = (plan) => {
  if (plan.user === 'self') playConfetti();
  else if (plan.user === 'opp') playDim();
};
