// Design 022 slice 5: subtle pointer-driven tilt on board cards. Writes
// --fx-tilt-x/y on the holo wrapper (consumed by css/mat-ambient.css) from the
// pointer position over the REAL card <img>, leaving holo.mjs's own drift
// untouched. Separate from holo.mjs because mat cards are deliberately
// `tilt: false` there (MAT_HOLO_OPTIONS); this is the guarded opt-in layer.

export const MAT_TILT_MAX_DEG = 5;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Tilt angles for a pointer at (clientX, clientY) over `rect`: the near edge
 * lifts toward the viewer. Returns zeros for a degenerate rect.
 * @returns {{x: number, y: number}} degrees for --fx-tilt-x (rotateY) / -y (rotateX)
 */
export function matTiltAngles(rect, clientX, clientY, maxDeg = MAT_TILT_MAX_DEG) {
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return { x: 0, y: 0 };
  const nx = clamp((clientX - rect.left) / rect.width - 0.5, -0.5, 0.5) * 2;
  const ny = clamp((clientY - rect.top) / rect.height - 0.5, -0.5, 0.5) * 2;
  return { x: nx * maxDeg, y: -ny * maxDeg };
}

const attached = new WeakSet();

/**
 * Listen on `image` and drive the wrapper's tilt vars. `isEnabled` is read on
 * every event (kill switch / reduced motion), and a dragging card never tilts.
 * Idempotent per image. Returns a detach function.
 */
export function attachMatTilt(wrapper, image, { isEnabled = () => true } = {}) {
  if (!wrapper || !image || attached.has(image)) return () => {};
  attached.add(image);

  const set = (x, y) => {
    wrapper.style.setProperty('--fx-tilt-x', `${x.toFixed(2)}deg`);
    wrapper.style.setProperty('--fx-tilt-y', `${y.toFixed(2)}deg`);
  };
  const reset = () => set(0, 0);
  const onMove = (event) => {
    if (!isEnabled() || image.classList?.contains('dragging')) {
      reset();
      return;
    }
    const { x, y } = matTiltAngles(image.getBoundingClientRect(), event.clientX, event.clientY);
    set(x, y);
  };

  image.addEventListener('pointermove', onMove, { passive: true });
  image.addEventListener('pointerleave', reset, { passive: true });
  image.addEventListener('dragstart', reset, { passive: true });
  return () => {
    image.removeEventListener('pointermove', onMove);
    image.removeEventListener('pointerleave', reset);
    image.removeEventListener('dragstart', reset);
    attached.delete(image);
    reset();
  };
}
