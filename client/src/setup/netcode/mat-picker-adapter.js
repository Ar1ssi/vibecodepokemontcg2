/**
 * @file Browser-side `matPicker` for apply-view.js: shows a server PendingChoice
 * whose options are all in-play Pokémon by outlining the real cards on the mat
 * (the legacy openMatPick UI, D19) instead of a modal carousel.
 *
 * Injected through setDefaultNetcodeContext because mat-picker.js pulls in
 * browser-only modules apply-view.js cannot import under `node --test`.
 */

import { openMatPick, dismissMatPick } from '../rules/mat-picker.js';

export const MAT_PICKER = {
  open({ choice, candidates, cancellable, min, max, onResolve, onCancel }) {
    openMatPick({
      title: choice.prompt || 'Choose a Pokémon',
      candidates,
      min,
      max,
      cancellable: cancellable !== false,
      onPick: (card) => onResolve([card.instanceId]),
      onConfirm: (cards) => onResolve(cards.map((card) => card.instanceId)),
      onCancel,
    });
  },
  // Teardown when a choice clears/passes/supersedes: silent, never reports a
  // decline. A real user decline goes through onCancel above.
  close() {
    dismissMatPick();
  },
};
