// Design 069: boots the TCG Live hover preview on the live page — the main document (Stadium); the
// 3D board feeds it the mirror's hovers — and hands it the browser-only collaborators
// hover-preview-dom.mjs injects.
import {
  MAT_HOLO_OPTIONS,
  buildHoloCard,
  startHoloAnimation,
  stopHoloAnimation,
} from '../deck-builder/core/holo.mjs';
import { cardBackSrcForUser } from '../deck-constructor/hydrate-holo.js';
import { isCardFocusOpen } from '../rules/card-focus.mjs';
import { isStackViewOpen } from '../rules/stack-view.mjs';
import { isStatusPopupOpen } from '../rules/status-popup.mjs';
import { isCardInspectorOpen } from '../rules/card-inspector.mjs';
import { onFxSettingsChanged } from './fx-settings.js';
import { readSettings } from './fx-settings.mjs';
import { isCardPreviewOpen } from './full-view.js';
import { registerHoverPreviewSuppressor } from './hover-preview-bus.mjs';
import { createHoverPreview } from './hover-preview-dom.mjs';

const storage = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

let preview = null;

/** The page's hover preview (null before `initializeHoverPreview`): the 3D board feeds it hovers. */
export const getHoverPreview = () => preview;

export function initializeHoverPreview() {
  if (preview || typeof document === 'undefined') return;
  preview = createHoverPreview({
    doc: document,
    isModalOpen: () =>
      isCardPreviewOpen() ||
      isCardFocusOpen() ||
      isCardInspectorOpen() ||
      isStackViewOpen() ||
      isStatusPopupOpen(),
    isEnabled: () => !readSettings(storage()).hoverPreviewOff,
    cardBackSrc: cardBackSrcForUser,
    holo: {
      build: buildHoloCard,
      start: (wrapper) => startHoloAnimation(wrapper, MAT_HOLO_OPTIONS),
      stop: stopHoloAnimation,
    },
  });
  preview.install(document, { within: '#stadium' });
  registerHoverPreviewSuppressor(preview.suppress);
  onFxSettingsChanged((settings) => {
    if (settings.hoverPreviewOff) preview.suppress('setting');
  });
}
