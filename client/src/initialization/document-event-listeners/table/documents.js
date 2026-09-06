import { closePopups } from '../../../actions/general/close-popups.js';
import { keyDown, keyUp } from '../../../actions/keybinds/keybinds.js';
import {
  oppContainerDocument,
  selfContainerDocument,
} from '../../../state.js';

const addDocumentEventListeners = (document) => {
  document.addEventListener('click', (event) => closePopups(event));
  document.addEventListener('contextmenu', (event) => closePopups(event));
  document.addEventListener('keydown', (event) => keyDown(event));
  document.addEventListener('keyup', (event) => keyUp(event));
};

export const initializeDocuments = () => {
  const documentTypes = [document, selfContainerDocument, oppContainerDocument];

  documentTypes.forEach((documentType) => {
    addDocumentEventListeners(documentType);
  });
};
