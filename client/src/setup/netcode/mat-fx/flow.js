// Design 022 slice 6: flow effects — turn banner (+ screen-edge glow), ability
// banner, and the game-over celebration (confetti on a win, dim on a loss).
// The game-over modal itself is apply-view's `reconcileGameEnded`; these play
// on top of it and never take pointer events.
import { runPose, spawnOverlay } from '../../image-logic/mat-fx.mjs';
import {
  BANNER_MS,
  CONFETTI_MS,
  DIM_MS,
  EDGE_GLOW_MS,
  abilityBannerText,
  bannerPose,
  confettiPiecePose,
  confettiPieces,
  dimPose,
  edgeGlowPose,
  turnBannerText,
} from './flow-pose.mjs';

const viewportRect = () => ({
  left: 0,
  top: 0,
  width: globalThis.innerWidth || 0,
  height: globalThis.innerHeight || 0,
});

const playBanner = ({ title, sub }, side) => {
  const rect = viewportRect();
  if (rect.width < 2) return;
  const strip = { left: 0, top: rect.height * 0.4, width: rect.width, height: rect.height * 0.16 };
  const host = spawnOverlay({
    rect: strip,
    className: `fx-overlay fx-banner fx-banner--${side || 'neutral'}`,
  });
  const titleEl = document.createElement('div');
  titleEl.className = 'fx-banner__title';
  titleEl.textContent = title;
  host.appendChild(titleEl);
  if (sub) {
    const subEl = document.createElement('div');
    subEl.className = 'fx-banner__sub';
    subEl.textContent = sub;
    host.appendChild(subEl);
  }
  runPose(host, BANNER_MS, (t) => {
    const pose = bannerPose(t);
    host.style.transform = `translate3d(${pose.x * 100}%, 0, 0)`;
    host.style.opacity = String(pose.opacity);
  });
};

const playEdgeGlow = (side) => {
  const host = spawnOverlay({
    rect: viewportRect(),
    className: `fx-overlay fx-edge-glow fx-edge-glow--${side}`,
  });
  runPose(host, EDGE_GLOW_MS, (t) => {
    host.style.opacity = String(edgeGlowPose(t).opacity);
  });
};

export const turnBanner = (plan) => {
  const text = turnBannerText(plan.user, plan.number);
  if (!text) return;
  playBanner(text, plan.user);
  playEdgeGlow(plan.user);
};

export const abilityBanner = (plan) => {
  const text = abilityBannerText(plan.name);
  if (!text) return;
  playBanner(text, plan.user);
};

const playConfetti = () => {
  const rect = viewportRect();
  if (rect.width < 2) return;
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
