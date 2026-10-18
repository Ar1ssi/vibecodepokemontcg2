import { closePopups } from '../../../actions/general/close-popups.js';
import { keyDown, keyUp } from '../../../actions/keybinds/keybinds.js';
import {
  oppContainer,
  oppContainerDocument,
  selfContainer,
  selfContainerDocument,
} from '../../../state.js';

// Design 074 D4: a click inside a board-mirror shadow root reaches the page too, retargeted to
// the root's host. The root's own listener already ran closePopups with the real target, so the
// page's copy (which would see a click "outside" every zone) stands down.
const fromMirrorRoot = (event) =>
  (event.target === selfContainer || event.target === oppContainer) &&
  (event.composedPath?.()[0] ?? event.target) !== event.target;

const addDocumentEventListeners = (document, { isPage = false } = {}) => {
  const onPopupEvent = (event) => {
    if (isPage && fromMirrorRoot(event)) return;
    closePopups(event);
  };
  document.addEventListener('click', onPopupEvent);
  document.addEventListener('contextmenu', onPopupEvent);
  document.addEventListener('keydown', (event) => keyDown(event));
  document.addEventListener('keyup', (event) => keyUp(event));
};

export const initializeDocuments = () => {
  addDocumentEventListeners(document, { isPage: true });
  [selfContainerDocument, oppContainerDocument].forEach((documentType) => {
    addDocumentEventListeners(documentType);
  });
};
