// Design 024 slice 2: the shared banner overlay. Design 022 kept this private
// to flow.js (turn + ability banners); the attack-name banner is the third
// caller, so it moves here rather than being copied a third time.
import { animateFrames, removeWhen, sampleKeyframes, spawnOverlay } from '../../image-logic/mat-fx.mjs';
import { BANNER_MS, EDGE_GLOW_MS, bannerPose, edgeGlowPose, sweepPose } from './flow-pose.mjs';

const BACKSTOP_PAD_MS = 400;

export const viewportRect = () => ({
  left: 0,
  top: 0,
  width: globalThis.innerWidth || 0,
  height: globalThis.innerHeight || 0,
});

const textNode = (className, text) => {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  return el;
};

/**
 * Sweeping centre-screen banner: a striped band, a light sweep across it, and
 * the text trailing the band in and leading it out.
 * @param {{title:string, sub?:string}} text
 * @param {'self'|'opp'|null} side - tints the banner; 'neutral' when unknown.
 * @param {string} [variant] - extra `fx-banner--<variant>` modifier class.
 */
export const playBanner = ({ title, sub }, side, variant) => {
  const rect = viewportRect();
  if (rect.width < 2) return;
  const strip = { left: 0, top: rect.height * 0.39, width: rect.width, height: rect.height * 0.18 };
  const className = [
    'fx-overlay',
    'fx-banner',
    `fx-banner--${side || 'neutral'}`,
    variant ? `fx-banner--${variant}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const host = spawnOverlay({ rect: strip, className });
  const band = document.createElement('div');
  band.className = 'fx-banner__band';
  const sweep = document.createElement('div');
  sweep.className = 'fx-banner__sweep';
  band.appendChild(sweep);
  const content = document.createElement('div');
  content.className = 'fx-banner__content';
  content.appendChild(textNode('fx-banner__title', title));
  if (sub) content.appendChild(textNode('fx-banner__sub', sub));
  host.append(band, content);

  const bandFrames = sampleKeyframes(
    bannerPose,
    (p) => ({ transform: `translate3d(${p.x * 100}%, 0, 0) skewY(-3deg)`, opacity: p.opacity }),
    24
  );
  const contentFrames = sampleKeyframes(
    (t) => bannerPose(Math.max(0, t - 0.04)),
    (p) => ({ transform: `translate3d(${p.x * 60}%, 0, 0)`, opacity: p.opacity }),
    24
  );
  const sweepFrames = sampleKeyframes(
    (t) => sweepPose(t, { start: 0.18, end: 0.6 }),
    (p) => ({ transform: `translateX(${p.x * 120}%) skewX(-24deg)`, opacity: p.opacity }),
    20
  );
  removeWhen(
    host,
    [
      animateFrames(band, bandFrames, { duration: BANNER_MS }),
      animateFrames(content, contentFrames, { duration: BANNER_MS }),
      animateFrames(sweep, sweepFrames, { duration: BANNER_MS }),
    ],
    BANNER_MS + BACKSTOP_PAD_MS
  );
};

/** Brief glow around the screen edge, tinted by side. */
export const playEdgeGlow = (side) => {
  const host = spawnOverlay({
    rect: viewportRect(),
    className: `fx-overlay fx-edge-glow fx-edge-glow--${side}`,
  });
  const frames = sampleKeyframes(edgeGlowPose, (p) => ({ opacity: p.opacity }), 16);
  removeWhen(host, [animateFrames(host, frames, { duration: EDGE_GLOW_MS })], EDGE_GLOW_MS + BACKSTOP_PAD_MS);
};
