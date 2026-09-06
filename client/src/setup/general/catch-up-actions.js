import { systemState } from '../../state.js';
import { acceptAction } from './accept-action.js';
import { reset } from '../../actions/general/reset.js';

/**
 * Replay missing opponent actions. parameters[0] is already the inverted
 * initiator stored by processAction — do not flip it again (live pushAction
 * does not).
 */
export const catchUpActions = async (actionData, fullReplay = false) => {
  const wasReplaying = systemState.syncReplaying;
  systemState.isCatchingUp = true;
  systemState.syncReplaying = true;
  try {
    if (fullReplay) {
      systemState.oppCounter = 0;
      // Force a clean board reset before replaying the full action history.
      // Without this, exchangeData may skip reset() because the opponent data
      // hasn't changed, causing actions to replay on top of existing state
      // (doubled cards, corrupted zones).
      reset('opp', true, true, false, false);
      reset('self', true, true, false, false);
    }
    const missingData = (actionData || []).slice(systemState.oppCounter);

    let ok = true;
    for (const entry of missingData) {
      const parameters = entry.parameters ? [...entry.parameters] : entry.parameters;
      if (entry.action !== 'exchangeData' && entry.action !== 'loadDeckData') {
        systemState.exportActionData.push({
          user: 'opp',
          emit: true,
          action: entry.action,
          parameters,
        });
      }
      const actionType = entry.type || entry.action;
      const applied = await acceptAction('opp', actionType, parameters, false, true);
      if (applied === false) {
        ok = false;
        break;
      }
      systemState.oppCounter++;
    }
    return ok;
  } finally {
    systemState.isCatchingUp = false;
    systemState.syncReplaying = wasReplaying;
  }
};
