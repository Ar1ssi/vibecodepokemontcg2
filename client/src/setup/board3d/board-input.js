// Design 074 D5 (O3-A): pointer input for the three.js board. The canvas receives every pointer
// event; a raycast (`scene.hitTest`) names the card under the pointer, and the gesture is
// re-dispatched as a synthetic `click` / `dblclick` / `contextmenu` on that card's DOM twin in
// the board mirror (board-mirror.js), so the existing listeners (click-events.js, keybinds, mat
// picker, context-menu placement) run unchanged. Hover lifts the hand card in the scene and
// feeds the hover preview the twin. Drag is not handled here (design 074 D5 "Drag", slice D2).
import { createClickTracker, mirrorSelectorFor } from './input-gestures.mjs';

const MOUSE_INIT_KEYS = ['clientX', 'clientY', 'screenX', 'screenY', 'ctrlKey', 'shiftKey', 'altKey', 'metaKey'];
const PRIMARY_BUTTON = 0;

/**
 * @param {{ canvas: HTMLCanvasElement,
 *   scene: { hitTest: (x: number, y: number) => object|null, setHover: (id: number|null) => void },
 *   mirror: { roots: { self: ShadowRoot, opp: ShadowRoot } }|null,
 *   hover?: { setTarget: (el: Element|null, pointer?: { pointerType?: string, buttons?: number }) => void }|null,
 *   doc?: Document, now?: () => number }} deps
 *   `hover` is the hover preview (hover-preview-dom.mjs); null = no preview.
 * @returns {{ dispose: () => void, lastHit: () => object|null }}
 */
export function createBoardInput({ canvas, scene, mirror, hover = null, doc = document, now = () => performance.now() }) {
  if (!canvas || !scene) throw new Error('board input needs a canvas and a scene');
  const view = doc.defaultView ?? globalThis;
  const tracker = createClickTracker();
  let last = null;
  let hoverEl = null;
  // Set when a release landed on a card: the browser's own click on the canvas that follows must
  // not reach the page, whose closePopups would undo what the card's click just did.
  let swallowNativeClick = false;
  let disposed = false;

  const hitAt = (event) => {
    let hit = null;
    try {
      hit = scene.hitTest(event.clientX, event.clientY) ?? null;
    } catch (error) {
      console.warn('board3d: hit test failed', error?.message || error);
    }
    last = hit;
    return hit;
  };

  /** The hit's DOM twin: its mirror img, its pile's cover, or the page's Stadium img. */
  const elementFor = (hit) => {
    const address = mirrorSelectorFor(hit);
    if (!address) return null;
    const root = address.side ? mirror?.roots?.[address.side] : doc;
    return root?.querySelector?.(address.selector) ?? null;
  };

  const dispatchMouse = (el, type, event, extra = {}) => {
    const init = { bubbles: true, cancelable: true, composed: true, button: event.button ?? 0, ...extra };
    for (const key of MOUSE_INIT_KEYS) init[key] = event[key];
    el.dispatchEvent(new view.MouseEvent(type, init));
  };

  const setHoverTarget = (hit, el, event) => {
    try {
      scene.setHover(hit && !hit.pile && Number.isFinite(hit.instanceId) ? hit.instanceId : null);
    } catch (error) {
      console.warn('board3d: hover lift failed', error?.message || error);
    }
    if (el === hoverEl) return;
    hoverEl = el;
    hover?.setTarget(el, { pointerType: event?.pointerType ?? 'mouse', buttons: event?.buttons ?? 0 });
  };

  const clearHover = () => setHoverTarget(null, null, null);

  const capture = (pointerId, on) => {
    try {
      if (on) canvas.setPointerCapture?.(pointerId);
      else if (canvas.hasPointerCapture?.(pointerId)) canvas.releasePointerCapture(pointerId);
    } catch {
      // The pointer is already gone (a cancelled touch): nothing to capture or release.
    }
  };

  const onPointerDown = (event) => {
    swallowNativeClick = false;
    const el = elementFor(hitAt(event));
    tracker.down(el, event.clientX, event.clientY, now(), event.button);
    capture(event.pointerId, true);
  };

  const onPointerUp = (event) => {
    capture(event.pointerId, false);
    const el = elementFor(hitAt(event));
    const gesture = tracker.up(el, event.clientX, event.clientY, now(), event.button);
    if (event.pointerType === 'mouse') setHoverTarget(last, el, event);
    if (!el) return;
    swallowNativeClick = true;
    if (!gesture.click || event.button !== PRIMARY_BUTTON) return;
    dispatchMouse(el, 'click', event, { detail: 1 });
    if (gesture.dblclick) dispatchMouse(el, 'dblclick', event, { detail: 2 });
  };

  const onPointerMove = (event) => {
    if (event.pointerType !== 'mouse') return;
    const hit = hitAt(event);
    setHoverTarget(hit, elementFor(hit), event);
  };

  const onPointerCancel = (event) => {
    capture(event.pointerId, false);
    tracker.reset();
    clearHover();
  };

  const onNativeClick = (event) => {
    if (!swallowNativeClick) return;
    swallowNativeClick = false;
    event.stopImmediatePropagation();
  };

  // The double-click was already dispatched from the pointer releases; the canvas's own is
  // stopped over a card so nothing on the page sees a second one.
  const onNativeDblClick = (event) => {
    if (elementFor(hitAt(event))) event.stopImmediatePropagation();
  };

  // The page's own document listeners (hover suppression, closePopups) see the canvas's
  // contextmenu; over a card it is replaced by the card's so `#cardContextMenu` opens there.
  const onContextMenu = (event) => {
    event.preventDefault();
    const el = elementFor(hitAt(event));
    if (!el) return;
    event.stopPropagation();
    dispatchMouse(el, 'contextmenu', event, { button: 2 });
  };

  // `wheel` is not listened to: it bubbles past the canvas untouched, to the page's own handlers.
  const listeners = [
    ['pointerdown', onPointerDown],
    ['pointerup', onPointerUp],
    ['pointermove', onPointerMove],
    ['pointerleave', clearHover],
    ['pointercancel', onPointerCancel],
    ['click', onNativeClick],
    ['dblclick', onNativeDblClick],
    ['contextmenu', onContextMenu],
  ];
  for (const [type, fn] of listeners) canvas.addEventListener(type, fn);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const [type, fn] of listeners) canvas.removeEventListener(type, fn);
    tracker.reset();
    if (hoverEl) hover?.setTarget(null);
    hoverEl = null;
    last = null;
  };

  return { dispose, lastHit: () => last };
}
