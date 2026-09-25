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

export const isDoubleClickZoomZone = (zoneId) =>
  DOUBLE_CLICK_ZOOM_ZONES.includes(zoneId);
