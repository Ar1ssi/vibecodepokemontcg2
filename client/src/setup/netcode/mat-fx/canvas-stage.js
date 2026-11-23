// D119[mat-fx]: every canvas effect (Mega orb and vortex, Tera crystal, the
// evolution scene) draws through this one stage, so all of them keep D118's
// single clock: the redraw reads a WAAPI animation's `currentTime`.
import { createStagePost } from './stage-post.js';

/** Size and centre `el` on (cx, cy) in its host's pixels. */
export const placeCentered = (el, cx, cy, width, height = width) => {
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  el.style.left = `${cx - width / 2}px`;
  el.style.top = `${cy - height / 2}px`;
  return el;
};

/**
 * A square canvas of `size` px centred on (cx, cy) in `host`, cleared and
 * redrawn every frame by `draw(ctx, t, elapsedMs)` in CSS pixels. Its clock
 * is the canvas's own WAAPI animation, read on every frame, so the drawing
 * stays in step with the other layers and stops with them.
 *
 * With `post(t)` (the post pass's settings at t: bloom, threshold, knee,
 * fringe), each frame is drawn offscreen and put on the canvas through the
 * post pass (stage-post.js); where WebGL is missing or lost it shows as drawn.
 */
export function playCanvasStage(host, { className, cx, cy, size, duration, draw, before = null, post = null }) {
  const canvas = placeCentered(document.createElement('canvas'), cx, cy, size);
  canvas.className = className;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  host.insertBefore(canvas, before);
  const screen = canvas.getContext('2d');
  if (!screen || typeof canvas.animate !== 'function') return Promise.resolve();
  const pass = post ? createStagePost(canvas.width, canvas.height) : null;
  const offscreen = pass ? Object.assign(document.createElement('canvas'), { width: canvas.width, height: canvas.height }) : canvas;
  const ctx = pass ? offscreen.getContext('2d') : screen;
  const clock = canvas.animate([{ opacity: 1 }, { opacity: 1 }], { duration, fill: 'both' });
  const frame = () => {
    if (!canvas.isConnected) {
      pass?.dispose();
      return;
    }
    const elapsed = Number(clock.currentTime) || 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    draw(ctx, elapsed / duration, elapsed);
    if (pass) {
      const out = pass.render(offscreen, post(elapsed / duration));
      screen.setTransform(1, 0, 0, 1, 0, 0);
      screen.clearRect(0, 0, canvas.width, canvas.height);
      screen.drawImage(out ?? offscreen, 0, 0);
    }
    if (clock.playState !== 'finished') requestAnimationFrame(frame);
    else pass?.dispose();
  };
  requestAnimationFrame(frame);
  return clock.finished.then(
    () => undefined,
    () => undefined
  );
}
