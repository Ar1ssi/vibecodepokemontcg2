// Design 069: boots the TCG Live hover preview on the live page — the main document (Stadium) and
// both playmat iframes — and hands it the browser-only collaborators hover-preview-dom.mjs injects.
import {
  MAT_HOLO_OPTIONS,
  buildHoloCard,
  startHoloAnimation,
  stopHoloAnimation,
} from '../deck-builder/core/holo.mjs';
import { cardBackSrcForUser } from '../deck-constructor/hydrate-holo.js';
import { isCardFocusOpen } from '../rules/card-focus.mjs';
import { isCardInspectorOpen } from '../rules/card-inspector.mjs';
import { onFxSettingsChanged } from './fx-settings.js';
import { readSettings } from './fx-settings.mjs';
import { isCardPreviewOpen } from './full-view.js';
import { registerHoverPreviewSuppressor } from './hover-preview-bus.mjs';
import { createHoverPreview } from './hover-preview-dom.mjs';
import { boardMirror } from '../../initialization/global-variables/containers.js';

const FRAME_IDS = ['selfContainer', 'oppContainer'];

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

const installOnFrame = (frame) => {
  const attach = () => {
    const frameDoc = frame.contentDocument;
    if (frameDoc?.getElementById('playfield')) preview.install(frameDoc);
  };
  // A reloaded iframe is a new document, so every load installs again (install is per document).
  frame.addEventListener('load', attach);
  if (frame.contentDocument?.readyState === 'complete') attach();
};

export function initializeHoverPreview() {
  if (preview || typeof document === 'undefined') return;
  preview = createHoverPreview({
    doc: document,
    isModalOpen: () => isCardPreviewOpen() || isCardFocusOpen() || isCardInspectorOpen(),
    isEnabled: () => !readSettings(storage()).hoverPreviewOff,
    cardBackSrc: cardBackSrcForUser,
    holo: {
      build: buildHoloCard,
      start: (wrapper) => startHoloAnimation(wrapper, MAT_HOLO_OPTIONS),
      stop: stopHoloAnimation,
    },
  });
  preview.install(document, { within: '#stadium' });
  // The board mirror's roots live inside this document (design 074 D4); the iframes hold no cards.
  if (!boardMirror) {
    for (const id of FRAME_IDS) {
      const frame = document.getElementById(id);
      if (frame) installOnFrame(frame);
    }
  }
  registerHoverPreviewSuppressor(preview.suppress);
  onFxSettingsChanged((settings) => {
    if (settings.hoverPreviewOff) preview.suppress('setting');
  });
}
