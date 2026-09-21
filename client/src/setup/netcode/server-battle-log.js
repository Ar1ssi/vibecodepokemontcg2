// Design 021: thin DOM caller for `serverBattleLogLines` (pure plan in
// server-battle-log.mjs). Wired as part of the `onAdvisoryEvent` hook on `applyView`
// in socket-event-listeners.js, so both players read the same lines off the same server
// event — one source, no double-announcing.
import { appendMessage } from '../chatbox/append-message.js';
import { serverBattleLogLines } from './server-battle-log.mjs';
import { getCardRegistry } from './apply-view.js';

const resolveCardName = (instanceId) => {
  if (instanceId == null) return null;
  const record = getCardRegistry().get(instanceId);
  return record?.card?.name || null;
};

/**
 * Appends this client's battle-log lines for one server advisory event, if it has any.
 *
 * @param {object} event
 * @param {string|null} selfPlayerId This client's absolute player id
 */
export function handleServerBattleLog(event, selfPlayerId) {
  const lines = serverBattleLogLines(event, selfPlayerId, resolveCardName);
  for (const line of lines) {
    appendMessage('', line, 'announcement', false);
  }
}
