/**
 * Zones whose double-click opens the zoom path in `click-events.js`: the
 * dismissible floating card preview (or the attached-card carousel, or the
 * Stadium/own-board inspector), instead of the legacy `#fullImage` overlay.
 *
 * The legacy overlay is appended to the top document while the cards live in
 * the z-index-2 playmat iframes, so it can never receive its own click-to-close
 * and is invisible to `closePopups()` — a stuck, stacking overlay. Every zone a
 * card can be double-clicked in belongs here.
 *
 * Pure and DOM-free so it runs under `node --test`.
 */

export const DOUBLE_CLICK_ZOOM_ZONES = Object.freeze([
  'active',
  'bench',
  'hand',
  'board',
  'stadium',
]);

/**
 * @param {string} zoneId
 * @param {{ board3d?: boolean }} [options] on the 3D board (design 074 D4) every zone takes the
 *   zoom path, so the legacy `#fullImage` overlay is never used there: a card in a zone list
 *   popup (the Lost Zone viewer, a looked-at card) gets the floating preview.
 */
export const isDoubleClickZoomZone = (zoneId, { board3d = false } = {}) =>
  board3d || DOUBLE_CLICK_ZOOM_ZONES.includes(zoneId);
