import { systemState } from '../../state.js';
import { acceptAction } from './accept-action.js';

export const catchUpActions = (actionData) => {
  const missingData = actionData.slice(systemState.oppCounter);

  missingData.forEach((entry) => {
    systemState.oppCounter++;
    entry.parameters = [...entry.parameters];
    if (entry.parameters[0] === 'self') {
      entry.parameters[0] = 'opp';
    } else if (entry.parameters[0] === 'opp') {
      entry.parameters[0] = 'self';
    }
    if (entry.action !== 'exchangeData' && entry.action !== 'loadDeckData') {
      systemState.exportActionData.push({
        user: 'opp',
        emit: true,
        action: entry.action,
        parameters: entry.parameters,
      });
    }
    acceptAction('opp', entry.action, entry.parameters);
  });
};
