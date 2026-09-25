/**
 * @file Browser-side `choicePicker` for apply-view.js: shows a server
 * PendingChoice in the same card picker single-player rules mode uses.
 * Injected through setDefaultNetcodeContext because card-picker.js pulls in
 * browser-only modules apply-view.js cannot import under `node --test`.
 */

import { openCardPicker, closeCardPicker } from '../image-logic/card-picker.js';
import { buildChoicePickerRequest } from './choice-picker-request.mjs';
import { systemState } from '../../state.js';

export const CHOICE_PICKER = {
  open({ choice, onResolve }) {
    const request = buildChoicePickerRequest(choice, onResolve, {
      cardBackSrc: systemState.cardBackSrc,
    });
    if (!request) throw new Error('pendingChoice has no card options');
    openCardPicker(request).catch((err) => {
      console.error('[choice-picker] failed to open:', err);
    });
  },
  close() {
    closeCardPicker(null, true);
  },
};
