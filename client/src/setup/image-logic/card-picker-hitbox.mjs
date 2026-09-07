/**
 * Pure helper module to calculate generous, non-overlapping drop slot hitboxes.
 */

/**
 * Compute generous, non-overlapping hitboxes for drop slots.
 *
 * @param {Array<{ left: number, right: number, top: number, bottom: number, width?: number, height?: number }>} slotRects
 * @param {object} [bounds]
 * @param {number | null} [bounds.topLimit] Minimum Y allowed (to prevent overlapping top row / carousel)
 * @param {number | null} [bounds.bottomLimit] Maximum Y allowed (to prevent overlapping bottom bar / Done button)
 * @param {number | null} [bounds.leftLimit] Minimum X allowed (playmat / workspace left)
 * @param {number | null} [bounds.rightLimit] Maximum X allowed (playmat / workspace right)
 * @param {number} [bounds.padYTop=60] Desired vertical expansion above slots
 * @param {number} [bounds.padYBottom=60] Desired vertical expansion below slots
 * @returns {Array<{ origIndex: number, left: number, right: number, top: number, bottom: number }>}
 */
export const computeDropSlotHitboxes = (slotRects, bounds = {}) => {
  if (!slotRects || !slotRects.length) return [];

  const items = slotRects.map((rect, origIndex) => ({
    origIndex,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
    width: rect.width ?? Math.max(0, rect.right - rect.left),
    height: rect.height ?? Math.max(0, rect.bottom - rect.top),
  }));

  // Sort by left edge to ensure predictable horizontal ordering
  items.sort((a, b) => a.left - b.left);

  const minTop = Math.min(...items.map((it) => it.top));
  const maxBottom = Math.max(...items.map((it) => it.bottom));

  const padYTop = bounds.padYTop ?? 60;
  const padYBottom = bounds.padYBottom ?? 60;

  let hitTop = minTop - padYTop;
  let hitBottom = maxBottom + padYBottom;

  if (bounds.topLimit != null && Number.isFinite(bounds.topLimit)) {
    hitTop = Math.max(bounds.topLimit, hitTop);
  }
  if (bounds.bottomLimit != null && Number.isFinite(bounds.bottomLimit)) {
    hitBottom = Math.min(bounds.bottomLimit, hitBottom);
  }

  // Ensure top doesn't cross below bottom
  if (hitTop > hitBottom) {
    hitTop = minTop;
    hitBottom = maxBottom;
  }

  const hitboxes = [];

  if (items.length === 1) {
    const it = items[0];
    const padX = Math.max(48, Math.min(90, (it.width || 60) * 0.75));
    let hitLeft = it.left - padX;
    let hitRight = it.right + padX;

    if (bounds.leftLimit != null && Number.isFinite(bounds.leftLimit)) {
      hitLeft = Math.max(bounds.leftLimit, hitLeft);
    }
    if (bounds.rightLimit != null && Number.isFinite(bounds.rightLimit)) {
      hitRight = Math.min(bounds.rightLimit, hitRight);
    }

    hitboxes.push({
      origIndex: it.origIndex,
      left: hitLeft,
      right: hitRight,
      top: hitTop,
      bottom: hitBottom,
    });
    return hitboxes;
  }

  for (let k = 0; k < items.length; k += 1) {
    const cur = items[k];
    let hitLeft;
    let hitRight;

    if (k === 0) {
      const padLeft = Math.max(36, Math.min(70, (cur.width || 60) * 0.65));
      hitLeft = cur.left - padLeft;
      if (bounds.leftLimit != null && Number.isFinite(bounds.leftLimit)) {
        hitLeft = Math.max(bounds.leftLimit, hitLeft);
      }
    } else {
      const prev = items[k - 1];
      hitLeft = (prev.right + cur.left) / 2;
    }

    if (k === items.length - 1) {
      const padRight = Math.max(36, Math.min(70, (cur.width || 60) * 0.65));
      hitRight = cur.right + padRight;
      if (bounds.rightLimit != null && Number.isFinite(bounds.rightLimit)) {
        hitRight = Math.min(bounds.rightLimit, hitRight);
      }
    } else {
      const next = items[k + 1];
      hitRight = (cur.right + next.left) / 2;
    }

    hitboxes.push({
      origIndex: cur.origIndex,
      left: hitLeft,
      right: hitRight,
      top: hitTop,
      bottom: hitBottom,
    });
  }

  return hitboxes;
};

/**
 * Test whether (x, y) falls inside any slot hitbox without overlapping.
 *
 * @param {Array<{ left: number, right: number, top: number, bottom: number, width?: number, height?: number }>} slotRects
 * @param {{ x: number, y: number }} point
 * @param {object} [bounds]
 * @returns {number} The original index of the matched slot, or -1 if no match.
 */
export const findDropSlotIndex = (slotRects, { x, y }, bounds = {}) => {
  if (!slotRects || !slotRects.length) return -1;
  const hitboxes = computeDropSlotHitboxes(slotRects, bounds);
  if (!hitboxes.length) return -1;

  for (let k = 0; k < hitboxes.length; k += 1) {
    const hb = hitboxes[k];
    const isLast = k === hitboxes.length - 1;
    // For non-last hitboxes, [left, right) partitions the space cleanly.
    // For the last hitbox, [left, right] is inclusive of the right edge.
    const inX = isLast
      ? x >= hb.left && x <= hb.right
      : x >= hb.left && x < hb.right;
    const inY = y >= hb.top && y <= hb.bottom;

    if (inX && inY) {
      return hb.origIndex;
    }
  }

  return -1;
};

/**
 * Check if a click event should be suppressed because a drag/swipe interaction
 * completed recently (e.g. mouse release over overlay or slot).
 *
 * @param {number | null | undefined} lastDragEndTime Timestamp of drag end
 * @param {number} [now] Current timestamp (defaults to Date.now())
 * @param {number} [thresholdMs=400] Suppression window in milliseconds
 * @returns {boolean}
 */
export const shouldSuppressClickAfterDrag = (lastDragEndTime, now = Date.now(), thresholdMs = 400) => {
  if (!lastDragEndTime) return false;
  return now - lastDragEndTime < thresholdMs;
};
