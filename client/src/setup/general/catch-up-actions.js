import { systemState } from '../../state.js';
import { acceptAction } from './accept-action.js';

/**
 * Replay missing opponent actions. parameters[0] is already the inverted
 * initiator stored by processAction — do not flip it again (live pushAction
 * does not).
 */
export const catchUpActions = async (actionData, fullReplay = false) => {
  const wasReplaying = systemState.syncReplaying;
  systemState.syncReplaying = true;
  try {
    if (fullReplay) {
      systemState.oppCounter = 0;
    }
    const missingData = (actionData || []).slice(systemState.oppCounter);

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
      const ok = await acceptAction('opp', entry.action, parameters);
      if (ok === false) {
        break;
      }
      systemState.oppCounter++;
    }
  } finally {
    systemState.syncReplaying = wasReplaying;
  }
};
