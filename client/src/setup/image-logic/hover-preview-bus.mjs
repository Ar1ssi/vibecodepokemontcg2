// Design 069: the one seam modal previews (full-view.js, card-focus.mjs, card-inspector.mjs) use to
// hide the hover preview as they open. Import-free so those modules take no dependency on the
// hover layer, and the hover layer can import their `is*Open` flags without a cycle.
let suppressor = null;

/** hover-preview.js registers the live preview's suppress once it boots. */
export const registerHoverPreviewSuppressor = (fn) => {
  suppressor = typeof fn === 'function' ? fn : null;
};

/** A no-op until the hover preview is installed (tests, the deck-builder tab). */
export const suppressHoverPreview = (reason) => {
  suppressor?.(reason);
};
