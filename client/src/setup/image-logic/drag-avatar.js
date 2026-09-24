// Design 038: while a card is dragged, draw it as a full-size, opaque copy that
// floats over the whole page and swings with the pointer (drag-tilt.mjs),
// instead of the browser's static translucent drag ghost. Drag and drop stay
// native HTML5 DnD (drag.js); this module only draws.
//
// The avatar lives in the parent page so one element can cross both playmat
// iframes. The pointer is read from `dragover` in every frame's window
// (pointer events are suppressed during a native drag) and mapped into the
// parent viewport through the frame's CSS transform — the far iframe is
// flipped 180°.
import { animateFrames, fxDisabled, motionReduced } from './mat-fx.mjs';
import {
  mapIframePointToViewport,
  readFrameTransform,
  visualRectOf,
} from './iframe-rect.mjs';
import {
  DRAG_TILT,
  DRAG_TILT_STILL,
  createDragTilt,
  dragAvatarTransform,
  grabOffset,
  returnTransform,
  stepDragTilt,
} from './drag-tilt.mjs';

const FRAME_IDS = ['selfContainer', 'oppContainer'];
const AVATAR_CLASS = 'drag-avatar';
const RETURN_MS = 180;
const RETURN_BACKSTOP_MS = 1000;

// Handed to setDragImage to blank the native ghost. Built once at import so
// it has decoded long before the first drag (an undecoded image is ignored
// and the browser falls back to its default ghost).
const TRANSPARENT_PIXEL_SRC =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const ghostPixel = (() => {
  if (typeof Image !== 'function') return null;
  const pixel = new Image(1, 1);
  pixel.src = TRANSPARENT_PIXEL_SRC;
  return pixel;
})();

let session = null;

const frameOf = (view) => {
  if (!view || view === window) return null;
  try {
    return view.frameElement ?? null;
  } catch {
    return null;
  }
};

/** A drag event's pointer in parent-viewport px, or null if it has none. */
const viewportPoint = (event, frameTransforms) => {
  const x = event?.clientX;
  const y = event?.clientY;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const frame = frameOf(event.view ?? event.target?.ownerDocument?.defaultView);
  if (!frame) return { x, y };
  let transform = frameTransforms.get(frame);
  if (!transform) {
    transform = readFrameTransform(frame);
    frameTransforms.set(frame, transform);
  }
  return mapIframePointToViewport(
    { x, y },
    transform.frameRect,
    transform.matrix,
    transform.origin
  );
};

const dragWindows = () => {
  const views = [window];
  for (const id of FRAME_IDS) {
    const view = document.getElementById(id)?.contentWindow;
    if (view && !views.includes(view)) views.push(view);
  }
  return views;
};

const buildAvatar = (source, rect, grab) => {
  const avatar = document.createElement('img');
  avatar.className = AVATAR_CLASS;
  avatar.src = source.currentSrc || source.src;
  avatar.alt = '';
  avatar.draggable = false;
  avatar.setAttribute('aria-hidden', 'true');
  avatar.style.width = `${rect.width}px`;
  avatar.style.height = `${rect.height}px`;
  avatar.style.transformOrigin = `${grab.x}px ${grab.y}px`;
  return avatar;
};

const listen = (views, handlers) => {
  const attached = [];
  for (const view of views) {
    for (const [type, handler] of Object.entries(handlers)) {
      try {
        view.addEventListener(type, handler, true);
        attached.push([view, type, handler]);
      } catch {
        // A frame mid-navigation can refuse listeners; the others still work.
      }
    }
  }
  return () => {
    for (const [view, type, handler] of attached) {
      try {
        view.removeEventListener(type, handler, true);
      } catch {
        // Its document is already gone.
      }
    }
  };
};

const tick = (now) => {
  const current = session;
  if (!current) return;
  const dt = current.lastTime == null ? 0 : now - current.lastTime;
  current.lastTime = now;
  current.tilt = stepDragTilt(
    current.tilt,
    current.pointer,
    dt,
    current.params
  );
  current.avatar.style.transform = dragAvatarTransform(
    current.pointer,
    current.grab,
    current.tilt,
    current.params
  );
  current.rafId = requestAnimationFrame(tick);
};

/**
 * Take over the drag image for a card drag. Call from the dragstart handler
 * once the drag is known to proceed. Leaves the native ghost in place (and
 * does nothing) when effects are off or the drag has no usable image.
 */
export const startDragAvatar = (event) => {
  endDragAvatar();
  const source = event?.target;
  const transfer = event?.dataTransfer;
  const drawable =
    source?.tagName === 'IMG' && transfer?.setDragImage && ghostPixel;
  if (!drawable || fxDisabled()) return;
  const src = source.currentSrc || source.src;
  if (!src) return;

  const frameTransforms = new Map();
  const pointer = viewportPoint(event, frameTransforms);
  const rect = visualRectOf(source);
  if (!pointer || !(rect.width > 1 && rect.height > 1)) return;
  try {
    transfer.setDragImage(ghostPixel, 0, 0);
  } catch {
    return;
  }

  const grab = grabOffset(rect, pointer);
  const params = motionReduced() ? DRAG_TILT_STILL : DRAG_TILT;
  const avatar = buildAvatar(source, rect, grab);
  const tilt = createDragTilt(pointer);
  avatar.style.transform = dragAvatarTransform(pointer, grab, tilt, params);
  document.body.appendChild(avatar);

  const current = {
    avatar,
    source,
    grab,
    size: { width: rect.width, height: rect.height },
    pointer,
    tilt,
    params,
    frameTransforms,
    lastTime: null,
    rafId: null,
    detach: () => {},
  };
  session = current;
  current.detach = listen(dragWindows(), {
    dragover: (overEvent) => {
      const next = viewportPoint(overEvent, frameTransforms);
      if (next) current.pointer = next;
    },
    // A completed drop: the board re-renders the card where it landed.
    drop: () => endDragAvatar(),
    // Mouse events are suppressed for the whole native drag, so one arriving
    // means the drag ended without a dragend reaching us (its source node
    // was re-rendered away mid-drag).
    mousemove: () => endDragAvatar(),
    pointerdown: () => endDragAvatar(),
  });
  current.rafId = requestAnimationFrame(tick);
};

const flyBack = (current) => {
  const { avatar, source } = current;
  if (!source?.isConnected) {
    avatar.remove();
    return;
  }
  const rect = visualRectOf(source);
  if (!(rect.width > 1 && rect.height > 1)) {
    avatar.remove();
    return;
  }
  // The source is already back at full opacity (drag.js dragEnd); hide it
  // until the avatar lands on it so the card is never seen twice.
  const previousVisibility = source.style.visibility;
  source.style.visibility = 'hidden';
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    clearTimeout(backstop);
    avatar.remove();
    if (source.style.visibility === 'hidden') {
      source.style.visibility = previousVisibility;
    }
  };
  const backstop = setTimeout(settle, RETURN_BACKSTOP_MS);
  animateFrames(
    avatar,
    [
      { transform: avatar.style.transform },
      {
        transform: returnTransform(
          rect,
          current.size,
          current.grab,
          current.params
        ),
      },
    ],
    { duration: RETURN_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
  ).then(settle);
};

/**
 * Finish the drag image. Pass the `dragend` event: a cancelled drag (nothing
 * accepted the drop) flies the card back to where it came from; anything else
 * removes it at once. Safe to call when no drag is active.
 */
export const endDragAvatar = (event) => {
  const current = session;
  if (!current) return;
  session = null;
  if (current.rafId != null) cancelAnimationFrame(current.rafId);
  current.detach();
  const cancelled =
    event?.type === 'dragend' && event.dataTransfer?.dropEffect === 'none';
  if (!cancelled || current.params === DRAG_TILT_STILL) {
    current.avatar.remove();
    return;
  }
  flyBack(current);
};
