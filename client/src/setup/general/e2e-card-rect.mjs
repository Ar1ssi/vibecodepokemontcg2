const KEYS = ['left', 'top', 'width', 'height'];

/** The rect as a plain `{ left, top, width, height }`, or null when it is missing, non-finite or empty. */
export function usableRect(rect) {
  if (!rect || !KEYS.every((key) => Number.isFinite(rect[key]))) return null;
  if (rect.width <= 0 || rect.height <= 0) return null;
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/**
 * A card's viewport rect for `__ptcg.cardRect`: the 3D scene's projected rect on the 3D board,
 * else the registry <img>'s rect already mapped into top-page coordinates (viewportRectOf).
 * `elementRect` is a thunk so the iframe board's layout is only read when it is the answer.
 */
export function cardRectOf({ mode, sceneRect, elementRect }) {
  return usableRect(mode === '3d' ? sceneRect : elementRect?.());
}
