// The side menu slide and the fullscreen-playmat toggle both resize #battleMat with a 220ms CSS
// transition. Sizing handlers and the draggable board-button row (board-buttons.js) re-measure
// on 'resize', so every toggle fires one after the transition has settled.
const MAT_RESIZE_SETTLE_MS = 260;

export const notifyMatResized = () => {
  window.setTimeout(
    () => window.dispatchEvent(new Event('resize')),
    MAT_RESIZE_SETTLE_MS
  );
};
