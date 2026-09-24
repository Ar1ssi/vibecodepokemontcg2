// Map an element inside a playmat iframe onto the parent viewport.
// The opponent iframe is CSS-flipped (`scaleX(-1) scaleY(-1)`), so adding
// local.left + frame.left puts overlays on the wrong corner. Apply the
// iframe's own transform around its transform-origin instead.

export const IDENTITY_MATRIX = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
export const FLIP_180_MATRIX = { a: -1, b: 0, c: 0, d: -1, e: 0, f: 0 };

export const parseCssMatrix = (transform) => {
  if (!transform || transform === 'none') return { ...IDENTITY_MATRIX };
  const match = String(transform).match(/matrix(3d)?\(([^)]+)\)/);
  if (!match) return { ...IDENTITY_MATRIX };
  const nums = match[2].split(',').map((v) => Number(v.trim()));
  if (match[1] === '3d' && nums.length === 16) {
    return { a: nums[0], b: nums[1], c: nums[4], d: nums[5], e: nums[12], f: nums[13] };
  }
  if (nums.length >= 6) {
    return { a: nums[0], b: nums[1], c: nums[2], d: nums[3], e: nums[4], f: nums[5] };
  }
  return { ...IDENTITY_MATRIX };
};

export const parseTransformOrigin = (origin, fallback) => {
  const parts = String(origin || '').split(/\s+/);
  const x = parseFloat(parts[0]);
  const y = parseFloat(parts[1]);
  if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  return fallback;
};

/**
 * Project an iframe-local client point (e.g. a dragover's clientX/Y) onto the
 * parent viewport. Same frame description as mapIframeLocalToViewport.
 */
export const mapIframePointToViewport = (
  point,
  frameRect,
  matrix = IDENTITY_MATRIX,
  origin = { x: frameRect.width / 2, y: frameRect.height / 2 }
) => {
  const px = point.x - origin.x;
  const py = point.y - origin.y;
  return {
    x: frameRect.left + matrix.a * px + matrix.c * py + matrix.e + origin.x,
    y: frameRect.top + matrix.b * px + matrix.d * py + matrix.f + origin.y,
  };
};

/**
 * Project an iframe-local getBoundingClientRect onto the parent viewport.
 * `frameRect` is the iframe element's parent-viewport AABB.
 * `matrix` / `origin` describe the iframe's CSS transform (default: identity
 * around the iframe center — the opp board uses a 180° flip).
 */
export const mapIframeLocalToViewport = (
  local,
  frameRect,
  matrix = IDENTITY_MATRIX,
  origin = { x: frameRect.width / 2, y: frameRect.height / 2 }
) => {
  const map = (x, y) =>
    mapIframePointToViewport({ x, y }, frameRect, matrix, origin);
  const corners = [
    map(local.left, local.top),
    map(local.left + local.width, local.top),
    map(local.left, local.top + local.height),
    map(local.left + local.width, local.top + local.height),
  ];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return {
    left,
    top,
    width: Math.max(...xs) - left,
    height: Math.max(...ys) - top,
  };
};

/**
 * Parent-viewport rect for a same-document or iframe-nested element,
 * projected through the iframe's CSS transform when it lives inside one
 * (shared by shuffle-flight.js and knockout-flight.js — both fly a card
 * overlay from a rect captured inside `#selfContainer`/`#oppContainer`).
 */
export const visualRectOf = (el) => {
  const local = el.getBoundingClientRect();
  const frame = el.ownerDocument?.defaultView?.frameElement;
  if (!frame) {
    return {
      left: local.left,
      top: local.top,
      width: local.width,
      height: local.height,
    };
  }
  const { frameRect, matrix, origin } = readFrameTransform(frame);
  return mapIframeLocalToViewport(local, frameRect, matrix, origin);
};

export const readFrameTransform = (frame) => {
  const frameRect = frame.getBoundingClientRect();
  const fallbackOrigin = { x: frameRect.width / 2, y: frameRect.height / 2 };
  try {
    const style = frame.ownerDocument.defaultView.getComputedStyle(frame);
    return {
      frameRect,
      matrix: parseCssMatrix(style.transform),
      origin: parseTransformOrigin(style.transformOrigin, fallbackOrigin),
    };
  } catch {
    return { frameRect, matrix: IDENTITY_MATRIX, origin: fallbackOrigin };
  }
};
