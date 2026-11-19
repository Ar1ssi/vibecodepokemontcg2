/**
 * The pointer lifecycle the unboxing scene's drag gestures share: a primary-button press captures
 * the pointer, moves accumulate the signed horizontal travel and the furthest distance from the
 * press, and the release (a cancel counts as a release) hands both to the caller. What a press
 * means (swipe a card, tear a pack) stays with the caller.
 *
 * `press` is `{ id, x0, y0, dx, moved }` plus anything `onPress` adds; `dx` is signed.
 *
 * @param {EventTarget & { setPointerCapture?: (id: number) => void }} node
 * @param {object} handlers
 * @param {(event: PointerEvent) => boolean} handlers.onPress false ignores this press
 * @param {(press: object, event: PointerEvent) => void} handlers.onMove after `dx` and `moved` update
 * @param {(press: object, cancelled: boolean) => void} handlers.onRelease
 * @param {() => void} handlers.onKeyboard a click with `detail === 0`: Enter/Space or a scripted click
 */
export function trackPress(node, { onPress, onMove, onRelease, onKeyboard }) {
  let press = null;
  node.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !onPress(event)) return;
    press = { id: event.pointerId, x0: event.clientX, y0: event.clientY, dx: 0, moved: 0 };
    node.setPointerCapture?.(event.pointerId);
  });
  node.addEventListener('pointermove', (event) => {
    if (!press || event.pointerId !== press.id) return;
    press.dx = event.clientX - press.x0;
    press.moved = Math.max(press.moved, Math.hypot(press.dx, event.clientY - press.y0));
    onMove(press, event);
  });
  const release = (event) => {
    if (!press || event.pointerId !== press.id) return;
    const finished = press;
    press = null;
    onRelease(finished, event.type === 'pointercancel');
  };
  node.addEventListener('pointerup', release);
  node.addEventListener('pointercancel', release);
  // Pointer presses are handled on release; `detail === 0` is Enter/Space or a scripted click.
  node.addEventListener('click', (event) => {
    if (event.detail === 0) onKeyboard();
  });
}
