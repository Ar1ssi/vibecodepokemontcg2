// Design 024 slice 2: the shared banner overlay. Design 022 kept this private
// to flow.js (turn + ability banners); the attack-name banner is the third
// caller, so it moves here rather than being copied a third time.
import { runPose, spawnOverlay } from '../../image-logic/mat-fx.mjs';
import { BANNER_MS, EDGE_GLOW_MS, bannerPose, edgeGlowPose } from './flow-pose.mjs';

export const viewportRect = () => ({
  left: 0,
  top: 0,
  width: globalThis.innerWidth || 0,
  height: globalThis.innerHeight || 0,
});

/**
 * Sweeping centre-screen banner.
 * @param {{title:string, sub?:string}} text
 * @param {'self'|'opp'|null} side - tints the banner; 'neutral' when unknown.
 * @param {string} [variant] - extra `fx-banner--<variant>` modifier class.
 */
export const playBanner = ({ title, sub }, side, variant) => {
  const rect = viewportRect();
  if (rect.width < 2) return;
  const strip = { left: 0, top: rect.height * 0.4, width: rect.width, height: rect.height * 0.16 };
  const className = [
    'fx-overlay',
    'fx-banner',
    `fx-banner--${side || 'neutral'}`,
    variant ? `fx-banner--${variant}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const host = spawnOverlay({ rect: strip, className });

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

/** Brief glow around the screen edge, tinted by side. */
export const playEdgeGlow = (side) => {
  const host = spawnOverlay({
    rect: viewportRect(),
    className: `fx-overlay fx-edge-glow fx-edge-glow--${side}`,
  });
  runPose(host, EDGE_GLOW_MS, (t) => {
    host.style.opacity = String(edgeGlowPose(t).opacity);
  });
};
