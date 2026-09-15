// Design 009 slice 6: pure pose function for the knockout ghost overlay.
// Phase 1 (0 - KNOCKOUT_FLASH_END): flash + desaturate in place, over the
// victim's own rect. Phase 2: drift toward that player's discard pile with a
// fade-out. DOM-free so it can be unit-tested without a browser; the paired
// knockout-flight.js drives an overlay element with it.

export const KNOCKOUT_DURATION_MS = 900;
export const KNOCKOUT_FLASH_END = 0.35;

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

const rectCenter = (rect) => ({
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2,
});

/**
 * @param {number} t - progress in [0, 1]
 * @param {{fromRect: {left,top,width,height}, toRect: {left,top,width,height}}} rects
 * @returns {{x, y, scale, rotate, opacity, brightness, saturate}}
 */
export function knockoutPose(t, { fromRect, toRect }) {
  const clamped = Math.max(0, Math.min(1, t));

  if (clamped <= KNOCKOUT_FLASH_END) {
    const flashT = clamped / KNOCKOUT_FLASH_END;
    return {
      x: 0,
      y: 0,
      scale: 1 + 0.08 * Math.sin(flashT * Math.PI),
      rotate: 0,
      opacity: 1,
      brightness: 1 + 1.6 * Math.sin(flashT * Math.PI),
      saturate: 1 - flashT,
    };
  }

  const driftT = (clamped - KNOCKOUT_FLASH_END) / (1 - KNOCKOUT_FLASH_END);
  const eased = easeInOutCubic(driftT);
  const from = rectCenter(fromRect);
  const to = rectCenter(toRect);
  return {
    x: (to.x - from.x) * eased,
    y: (to.y - from.y) * eased,
    scale: 1 - 0.55 * eased,
    rotate: 18 * eased,
    opacity: 1 - eased,
    brightness: 1,
    saturate: 0,
  };
}
