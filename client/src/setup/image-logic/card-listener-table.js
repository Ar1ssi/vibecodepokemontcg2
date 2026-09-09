/**
 * @file The one interaction-listener table card images are built with
 * (design 002 slice 3.6). Legacy `Card` uses it directly; the authoritative
 * renderer receives it by injection (`setDefaultNetcodeContext({ cardListeners })`
 * in `socket-event-listeners.js`) so `apply-view.js` itself never statically
 * imports these browser-only modules (they pull in `state.js`, which has
 * module-scope `io()`/`document` side effects and is unimportable outside a
 * browser — see design 002's process-action.js finding, row 12).
 */
import {
  doubleClick,
  imageClick,
  openCardContextMenu,
} from './click-events.js';
import { dragEnd, dragLeave, dragOver, dragStart } from './drag.js';

export const CARD_IMAGE_LISTENERS = {
  click: imageClick,
  dblclick: doubleClick,
  dragstart: dragStart,
  dragover: dragOver,
  dragleave: dragLeave,
  dragend: dragEnd,
  contextmenu: openCardContextMenu,
};
