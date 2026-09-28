import { systemState } from '../../state.js';
import { DECK_FORMAT_TCG } from '../../../../shared/engine/formats.mjs';

export const cleanActionData = (user) => {
  if (user === 'self') {
    systemState.selfCounter = 0;
    systemState.selfActionData = [];
    // systemState.spectatorActionData = [];
    systemState.exportActionData = [];
    systemState.spectatorCounter = 0;
  } else {
    systemState.oppCounter = 0;
    systemState.oppActionData = [];
    systemState.p2OppDeckData = '';
    systemState.deckFormat.p2Opp = DECK_FORMAT_TCG;
  }
};
