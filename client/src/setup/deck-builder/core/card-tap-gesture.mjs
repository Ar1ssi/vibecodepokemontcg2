/** Same breakpoint as css/deck-builder-phone.css. */
export const PHONE_LAYOUT_QUERY = '(max-width: 760px)';

export const isPhoneLayout = (win = globalThis.window) =>
  Boolean(win?.matchMedia?.(PHONE_LAYOUT_QUERY).matches);

/**
 * Single tap vs double tap on card tiles (phone layout). A tap waits out `delayMs`
 * for a second tap on the same tile: a second tap fires `onDouble(key)`, otherwise
 * `onSingle(key)` fires when the wait ends. Tapping a different tile settles the
 * pending one first, so no tap is lost.
 */
export const createTapGesture = ({
  onSingle,
  onDouble,
  delayMs = 280,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) => {
  let pending = null;

  const settle = () => {
    if (!pending) return;
    const { key, timer } = pending;
    pending = null;
    clearTimer(timer);
    onSingle(key);
  };

  return (key) => {
    if (pending && pending.key === key) {
      clearTimer(pending.timer);
      pending = null;
      onDouble(key);
      return;
    }
    settle();
    pending = { key, timer: setTimer(settle, delayMs) };
  };
};

/** Opens the card preview the way a right-click does: the grids listen for `contextmenu`. */
export const previewTile = (tile) => {
  if (!tile?.isConnected) return;
  tile.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
};
