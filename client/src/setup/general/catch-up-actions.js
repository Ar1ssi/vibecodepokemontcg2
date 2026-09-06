import { systemState } from '../../state.js';
import { acceptAction } from './accept-action.js';

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
      const applied = await acceptAction('opp', entry.action, parameters);
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
