// Design 074 D5 (O3-A): pointer input for the three.js board. The canvas receives every pointer
// event; a raycast (`scene.hitTest`) names the card under the pointer, and the gesture is
// re-dispatched as a synthetic `click` / `dblclick` / `contextmenu` on that card's DOM twin in
// the board mirror (board-mirror.js), so the existing listeners (click-events.js, keybinds, mat
// picker, context-menu placement) run unchanged. Hover lifts the hand card in the scene and
// feeds the hover preview the twin. A press that moves past the click slop drags the card in
// the scene and drops it through drop-router.mjs into drag.js's own calls (board-drag-actions.js);
// an HTML5 drag out of an open panel drops on the canvas through the same router.
import { dropTargetFor, routeDrop } from './drop-router.mjs';
import { clickHitFor, createClickTracker, mirrorSelectorFor } from './input-gestures.mjs';

const MOUSE_INIT_KEYS = ['clientX', 'clientY', 'screenX', 'screenY', 'ctrlKey', 'shiftKey', 'altKey', 'metaKey'];
const PRIMARY_BUTTON = 0;
const PRIMARY_BUTTONS_MASK = 1;
const SECONDARY_BUTTONS_MASK = 2;
/** Movement past which a press is a drag, not a click (the click tracker's slop). */
const DRAG_SLOP_PX = 6;
/** How high a held card rides off the cloth (design 074 D5 "Drag"). */
const DRAG_LIFT_PX = 24;
/** How long a dropped card waits where it fell for the view of the move it sent. */
const DROP_HOLD_MS = 800;
// drag.js DROP_TARGET_CLASS: the Lost Zone rail's drop light.
const RAIL_LIT_CLASS = 'lost-zone-rail-drop';
const BOARD_READY_CLASS = 'board-drop-ready';

/**
 * @param {{ canvas: HTMLCanvasElement,
 *   scene: { hitTest: Function, setHover: (id: number|null) => void, liftCard?: Function,
 *     moveLifted?: Function, dropCard?: Function, setZoneHighlight?: Function, setCardHighlight?: Function },
 *   mirror: { roots: { self: ShadowRoot, opp: ShadowRoot }, zoneElement?: Function }|null,
 *   hover?: { setTarget: (el: Element|null, pointer?: { pointerType?: string, buttons?: number }) => void }|null,
 *   dragActions?: ReturnType<typeof import('./board-drag-actions.js').createBoardDragActions>|null,
 *   doc?: Document, now?: () => number }} deps
 *   `hover` is the hover preview (hover-preview-dom.mjs); `dragActions` the page-side drag
 *   (board-drag-actions.js). Either null = that feature off.
 * @returns {{ dispose: () => void, lastHit: () => object|null, activeDrag: () => number|null }}
 */
export function createBoardInput({
  canvas,
  scene,
  mirror,
  hover = null,
  dragActions = null,
  doc = document,
  now = () => performance.now(),
}) {
  if (!canvas || !scene) throw new Error('board input needs a canvas and a scene');
  const view = doc.defaultView ?? globalThis;
  const tracker = createClickTracker({ slopPx: DRAG_SLOP_PX });
  let last = null;
  let hoverEl = null;
  // Set when a release landed on a card or ended a drag: the browser's own click on the canvas
  // that follows must not reach the page, whose closePopups would undo what was just done.
  let swallowNativeClick = false;
  /** A primary press that may still become a drag: where, and on what. */
  let press = null;
  /** The drag in progress: the held card, its `Dragging` record and what it is over. */
  let drag = null;
  // A drag cancelled while the button is still down (Escape) leaves its release to swallow: that
  // release is neither a click nor a hover over the card flying back under the pointer.
  let cancelledPress = false;
  let disposed = false;

  const hitAt = (event, options) => {
    let hit = null;
    try {
      hit = scene.hitTest(event.clientX, event.clientY, options) ?? null;
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
    const id = hit && !hit.pile && Number.isFinite(hit.instanceId) ? hit.instanceId : null;
    try {
      scene.setHover(id);
      scene.setPointerTilt?.(id, event?.clientX, event?.clientY);
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

  // ── drag ────────────────────────────────────────────────────────────────

  /**
   * A page element over the canvas that takes drops (the Lost Zone rail, the Stadium slot) as a
   * hit; `blocked` when other page UI covers the point; null when the canvas is on top there.
   */
  const pageHitAt = (x, y) => {
    const top = doc.elementFromPoint?.(x, y) ?? null;
    if (!top || top === canvas) return null;
    const rail = top.closest?.('[data-drop-zone]');
    if (rail) return { hit: { rail: true, zone: rail.dataset.dropZone, side: rail.dataset.dropUser }, rail };
    if (top.closest?.('#stadium')) return { hit: { zone: 'stadium', side: null, instanceId: null, plane: true } };
    return { hit: null };
  };

  /** The scene zone a target lights: the hit's own zone id (piles unsuffixed), or the Stadium. */
  const litZoneOf = (target, hit) =>
    target.kind === 'stadium' ? { side: null, zone: 'stadium' } : { side: target.side, zone: hit.zone };

  const sameZone = (a, b) => (a === null && b === null) || (a && b && a.side === b.side && a.zone === b.zone);

  const lightZone = (zone, on) => {
    if (!zone) return;
    // The Trainer board stays lit for the whole drag of an Item/Supporter (drag.js markBoardReady).
    if (!on && drag?.boardReady && zone.side === drag.dragging.side && zone.zone === 'board') return;
    scene.setZoneHighlight?.(zone.side, zone.zone, on);
  };

  const showTarget = (target, hit, railEl) => {
    const lit = target?.highlight ?? null;
    scene.setCardHighlight?.(lit === 'card' || lit === 'both' ? target.instanceId : null);
    const zone = lit === 'zone' || lit === 'both' ? litZoneOf(target, hit) : null;
    if (!sameZone(zone, drag.litZone)) {
      lightZone(drag.litZone, false);
      lightZone(zone, true);
      drag.litZone = zone;
    }
    if (railEl !== drag.railEl) {
      drag.railEl?.classList.remove(RAIL_LIT_CLASS);
      railEl?.classList.add(RAIL_LIT_CLASS);
      drag.railEl = railEl ?? null;
    }
  };

  /** What the held card is over now, as drop-router.mjs reads it, lit as drag.js lights it. */
  const updateTarget = (event) => {
    const page = pageHitAt(event.clientX, event.clientY);
    const hit = page ? page.hit : hitAt(event, { ignore: drag.id });
    const target = dropTargetFor(hit, drag.dragging, drag.state);
    if (target?.kind === 'card') {
      const el = elementFor(target);
      target.attached = Boolean(el?.attached);
      target.targetIndex = el ? dragActions.targetIndexOf(el, target.side, target.zone) : -1;
    }
    drag.target = target;
    showTarget(target, hit, target?.kind === 'rail' ? page?.rail : null);
  };

  const onDragKey = (event) => {
    if (event.key === 'Escape') cancelDrag();
  };

  const startDrag = (event) => {
    const { hit, el } = press;
    press = null;
    if (!dragActions || !el || hit?.pile || hit?.zone === 'stadium' || !Number.isFinite(hit?.instanceId)) return;
    const state = dragActions.state();
    if (state.isSpectator || (hit.side !== state.initiator && !state.solo)) return;
    const dragging = dragActions.begin(el);
    if (!dragging) return;
    const lifted = scene.liftCard?.(hit.instanceId, { z: DRAG_LIFT_PX, clientX: event.clientX, clientY: event.clientY });
    if (!lifted) {
      dragActions.end();
      return;
    }
    tracker.reset();
    clearHover();
    const boardReady = Boolean(mirror?.zoneElement?.(dragging.side, 'board')?.classList?.contains(BOARD_READY_CLASS));
    drag = { id: hit.instanceId, pointerId: event.pointerId, dragging, state, target: null, litZone: null, railEl: null, boardReady };
    if (boardReady) scene.setZoneHighlight?.(dragging.side, 'board', true);
    doc.addEventListener('keydown', onDragKey, true);
    updateTarget(event);
  };

  /** Ends the drag: the card drops (held for the view when a call went out), lights go out. */
  const finishDrag = (performed) => {
    const ending = drag;
    drag = null;
    doc.removeEventListener('keydown', onDragKey, true);
    // A panel's HTML5 drag lifted no mesh and holds no pointer; drag.js's dragEnd restores it.
    if (!ending.html5) scene.dropCard?.(ending.id, performed ? { holdMs: DROP_HOLD_MS } : {});
    scene.setCardHighlight?.(null);
    if (ending.litZone) scene.setZoneHighlight?.(ending.litZone.side, ending.litZone.zone, false);
    if (ending.boardReady) scene.setZoneHighlight?.(ending.dragging.side, 'board', false);
    ending.railEl?.classList.remove(RAIL_LIT_CLASS);
    dragActions.end();
    if (!ending.html5) capture(ending.pointerId, false);
  };

  function cancelDrag() {
    if (!drag) return;
    finishDrag(false);
    cancelledPress = true;
  }

  const commitDrag = (event) => {
    updateTarget(event);
    const route = routeDrop(drag.target, drag.dragging, drag.state);
    if (route?.kind === 'retreat') {
      // drag.js hands retreat() the dropped-on Bench <img> itself.
      const benchId = route.args[2];
      route.args[2] = benchId === null ? null : elementFor({ instanceId: benchId, side: drag.dragging.side });
    }
    let performed = false;
    try {
      performed = route ? dragActions.perform(route) : false;
    } catch (error) {
      console.warn('board3d: drop failed', error?.message || error);
    }
    finishDrag(performed);
  };

  // ── pointer events ──────────────────────────────────────────────────────

  const onPointerDown = (event) => {
    swallowNativeClick = false;
    cancelledPress = false;
    if (drag) {
      // While a card is held another pointer (a second touch) is ignored; another button cancels.
      if (event.button !== PRIMARY_BUTTON) cancelDrag();
      return;
    }
    const hit = hitAt(event);
    const el = elementFor(hit);
    tracker.down(el, event.clientX, event.clientY, now(), event.button);
    press = event.button === PRIMARY_BUTTON ? { hit, el, x: event.clientX, y: event.clientY } : null;
    capture(event.pointerId, true);
  };

  const onPointerUp = (event) => {
    if (drag) {
      swallowNativeClick = true;
      if (event.button === PRIMARY_BUTTON) commitDrag(event);
      else cancelDrag();
      return;
    }
    press = null;
    capture(event.pointerId, false);
    if (cancelledPress) {
      cancelledPress = false;
      swallowNativeClick = true;
      return;
    }
    const hit = hitAt(event);
    const el = elementFor(hit);
    const gesture = tracker.up(el, event.clientX, event.clientY, now(), event.button);
    if (event.pointerType === 'mouse') setHoverTarget(last, el, event);
    if (!el) return;
    swallowNativeClick = true;
    if (!gesture.click || event.button !== PRIMARY_BUTTON) return;
    const clickEl = elementFor(clickHitFor(hit)) ?? el;
    dispatchMouse(clickEl, 'click', event, { detail: 1 });
    if (gesture.dblclick) dispatchMouse(clickEl, 'dblclick', event, { detail: 2 });
  };

  const onPointerMove = (event) => {
    if (drag) {
      if (event.buttons & SECONDARY_BUTTONS_MASK) {
        cancelDrag();
        return;
      }
      scene.moveLifted?.(event.clientX, event.clientY);
      updateTarget(event);
      return;
    }
    if (press) {
      const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
      if (!(event.buttons & PRIMARY_BUTTONS_MASK)) press = null;
      else if (moved >= DRAG_SLOP_PX) {
        startDrag(event);
        if (drag) return;
      }
    }
    if (event.pointerType !== 'mouse') return;
    const hit = hitAt(event);
    setHoverTarget(hit, elementFor(hit), event);
  };

  const onPointerLeave = () => {
    // A held card keeps following the captured pointer past the canvas edge (edge case 17).
    if (!drag) clearHover();
  };

  const onPointerCancel = (event) => {
    press = null;
    cancelDrag();
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
  // A right-click while a card is held cancels the drag and opens nothing.
  const onContextMenu = (event) => {
    event.preventDefault();
    if (drag) {
      event.stopPropagation();
      cancelDrag();
      return;
    }
    const el = elementFor(hitAt(event));
    if (!el) return;
    event.stopPropagation();
    dispatchMouse(el, 'contextmenu', event, { button: 2 });
  };

  // ── HTML5 drags out of the mirror's open panels ─────────────────────────
  // A pile viewer's, Looking at cards' or the attached cards' <img> is still dragged by drag.js;
  // the board it crosses is the canvas, so the canvas takes the drop through the same router.

  /** The panel <img> drag.js is dragging (it carries `.dragging`), or null. */
  const draggedPanelImage = () =>
    mirror?.roots?.self?.querySelector?.('.dragging') ?? mirror?.roots?.opp?.querySelector?.('.dragging') ?? null;

  const onHtmlDragOver = (event) => {
    if (!dragActions || (drag && !drag.html5)) return;
    const image = draggedPanelImage();
    if (!image) return;
    if (drag?.image !== image) {
      if (drag) finishDrag(false);
      const dragging = dragActions.held(image);
      if (!dragging) return;
      drag = { html5: true, image, id: null, dragging, state: dragActions.state(), target: null, litZone: null, railEl: null, boardReady: false };
    }
    updateTarget(event);
    if (!drag.target) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  };

  const onHtmlDragLeave = () => {
    if (drag?.html5) finishDrag(false);
  };

  const onHtmlDrop = (event) => {
    if (!drag?.html5) return;
    event.preventDefault();
    event.stopPropagation();
    commitDrag(event);
  };

  // `wheel` is not listened to: it bubbles past the canvas untouched, to the page's own handlers.
  const listeners = [
    ['pointerdown', onPointerDown],
    ['pointerup', onPointerUp],
    ['pointermove', onPointerMove],
    ['pointerleave', onPointerLeave],
    ['pointercancel', onPointerCancel],
    ['click', onNativeClick],
    ['dblclick', onNativeDblClick],
    ['contextmenu', onContextMenu],
    ['dragover', onHtmlDragOver],
    ['dragleave', onHtmlDragLeave],
    ['drop', onHtmlDrop],
  ];
  for (const [type, fn] of listeners) canvas.addEventListener(type, fn);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelDrag();
    for (const [type, fn] of listeners) canvas.removeEventListener(type, fn);
    tracker.reset();
    press = null;
    if (hoverEl) hover?.setTarget(null);
    hoverEl = null;
    last = null;
  };

  return { dispose, lastHit: () => last, activeDrag: () => drag?.id ?? null };
}
