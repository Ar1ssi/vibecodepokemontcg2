// Card-focus popup geometry, derived from the TCG Live scene
// (TCG Live level6: AttackMover 15043, AttackOverlay 12165, Card.obj).
// Pure and DOM-free so the numbers are unit-testable.

export const FOV_DEG = 20;
export const FLIGHT_MS = 250; // ZeroMover.durationInSeconds
export const FLIGHT_EASE = 'cubic-bezier(0.32, 0, 0.67, 0)'; // DOTween index 8, InCubic
export const EXPAND_MS = 300; // AttackOverlay.maxOpenDuration
export const EXPAND_EASE = 'cubic-bezier(0.11, 0, 0.5, 0)'; // openCurve = t^2
export const COLLAPSE_MS = 150; // maxCloseDuration
export const COLLAPSE_EASE = 'cubic-bezier(0.5, 1, 0.89, 1)'; // closeCurve = 1-(1-t)^2
export const COLLAPSED_FRACTION = 0.3 / 4.25; // closedWindowHeight / maxWindowHeight

const CAMERA_Y = 183;
const FOCUS_PLANE_Y = 100;
const FOCUS_DISTANCE = CAMERA_Y - FOCUS_PLANE_Y;
const OBJECT_SCALE = 2;
const CARD_MESH_WIDTH = 6.397;
const CARD_MESH_HEIGHT = 8.9;
const CARD_ANCHOR_X = -8;
const MAX_WIDTH_FRACTION = 0.9;
const EDGE_MARGIN_PX = 16;

const ZERO_RECT = Object.freeze({ left: 0, top: 0, width: 0, height: 0 });
const isPositive = (n) => Number.isFinite(n) && n > 0;
const halfFovTan = () => Math.tan((FOV_DEG * Math.PI) / 360);

export const perspectiveFor = (viewportHeight) => {
  if (!isPositive(viewportHeight)) return 0;
  return viewportHeight / 2 / halfFovTan();
};

// Keep the card inside the edge margin by shifting only; size is already final.
const shiftIntoMargin = (start, size, viewport) => {
  const min = EDGE_MARGIN_PX;
  const max = viewport - EDGE_MARGIN_PX - size;
  if (max < min) return min;
  return Math.min(Math.max(start, min), max);
};

export const focusRect = (viewport) => {
  const { width: vw, height: vh } = viewport || {};
  if (!isPositive(vw) || !isPositive(vh)) return { ...ZERO_RECT };

  const visibleHeight = 2 * FOCUS_DISTANCE * halfFovTan();
  const visibleWidth = (visibleHeight * vw) / vh;
  let height = ((CARD_MESH_HEIGHT * OBJECT_SCALE) / visibleHeight) * vh;
  let width = (height * CARD_MESH_WIDTH) / CARD_MESH_HEIGHT;

  const maxWidth = MAX_WIDTH_FRACTION * vw;
  if (width > maxWidth) {
    height *= maxWidth / width;
    width = maxWidth;
  }

  const centreX = vw / 2 + (CARD_ANCHOR_X / visibleWidth) * vw;
  const centreY = vh / 2;
  return {
    left: shiftIntoMargin(centreX - width / 2, width, vw),
    top: shiftIntoMargin(centreY - height / 2, height, vh),
    width,
    height,
  };
};

export const flightTransform = (fromRect, toRect, { tiltDeg = 0 } = {}) => ({
  translateX: fromRect.left + fromRect.width / 2 - (toRect.left + toRect.width / 2),
  translateY: fromRect.top + fromRect.height / 2 - (toRect.top + toRect.height / 2),
  scale: fromRect.width / toRect.width,
  rotateX: tiltDeg,
});

const scaledDuration = (fromFraction, toFraction, fullMs) =>
  (Math.abs(toFraction - fromFraction) / (1 - COLLAPSED_FRACTION)) * fullMs;

export const expandDurationMs = (fromFraction, toFraction) =>
  scaledDuration(fromFraction, toFraction, EXPAND_MS);

export const collapseDurationMs = (fromFraction, toFraction) =>
  scaledDuration(fromFraction, toFraction, COLLAPSE_MS);

// Rigid pointer tilt for the whole focus card (art and chrome together). Positive rotateY turns the
// card's right edge away, positive rotateX its top edge away, so the face turns toward the cursor.
export const tiltFromPointer = (rect, clientX, clientY, maxDeg) => {
  if (!rect || !isPositive(rect.width) || !isPositive(rect.height) || !isPositive(maxDeg)) {
    return { rotateX: 0, rotateY: 0 };
  }
  const unit = (offset, half) => Math.max(-1, Math.min(1, offset / half));
  const nx = unit(clientX - (rect.left + rect.width / 2), rect.width / 2);
  const ny = unit(clientY - (rect.top + rect.height / 2), rect.height / 2);
  return { rotateX: -ny * maxDeg || 0, rotateY: nx * maxDeg || 0 };
};
