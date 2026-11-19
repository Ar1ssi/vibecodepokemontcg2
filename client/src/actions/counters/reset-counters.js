import {
  oppContainerDocument,
  selfContainerDocument,
} from '../../state.js';

// Overlays drawn by the server-view renderer (apply-view.js) carry no handleRemove: it owns them.
const removeOverlays = (root, selector) => {
  root.querySelectorAll(selector).forEach((element) => {
    if (typeof element.handleRemove === 'function') element.handleRemove(false);
  });
};

export const resetAbilityCounters = () => {
  removeOverlays(selfContainerDocument, '.self-tab, .opp-tab');
  removeOverlays(oppContainerDocument, '.self-tab, .opp-tab');
  removeOverlays(document, '.tab');
};
