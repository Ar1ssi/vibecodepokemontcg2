/**
 * @file Browser-side `prizePicker` for apply-view.js: shows a server prize
 * PendingChoice as the TCG Live fly-up prize fan. Injected through
 * setDefaultNetcodeContext because prize-take-prompt.js pulls in browser-only
 * modules apply-view.js cannot import under `node --test`.
 */

import {
  cancelPrizeTake,
  promptServerPrizeChoice,
} from '../../actions/zones/prize-take-prompt.js';

export const PRIZE_PICKER = {
  open({ choice, cards, onResolve }) {
    promptServerPrizeChoice({ cards, needed: choice.min, onResolve });
  },
  close() {
    cancelPrizeTake();
  },
};
