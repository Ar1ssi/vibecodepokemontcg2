/**
 * @file The one interaction-listener table Cover images (deck/discard/lostZone
 * top-card previews) are built with, mirroring `card-listener-table.js`'s role
 * for card images (design 002 slice 3.8). Legacy `Cover` uses it directly; the
 * authoritative renderer receives it by injection
 * (`setDefaultNetcodeContext({ coverListeners })` in `socket-event-listeners.js`)
 * so `apply-view.js` never statically imports these browser-only modules.
 */
import { coverClick, openCardContextMenu } from './click-events.js';
import { dragEnd, dragLeave, dragOver, dragStart, drop } from './drag.js';

export const COVER_IMAGE_LISTENERS = {
  click: coverClick,
  dragstart: dragStart,
  dragover: dragOver,
  dragleave: dragLeave,
  dragend: dragEnd,
  drop: drop,
  contextmenu: openCardContextMenu,
};
