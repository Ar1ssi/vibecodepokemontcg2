// Design 013 slice 3: thin DOM caller for attackAnnouncementLines (pure plan in
// attack-announcements.mjs). Wired as part of the `onAdvisoryEvent` hook on `applyView`
// in socket-event-listeners.js, so both players read the same lines off the same server
// event — one source, no double-announcing.
import { appendMessage } from '../chatbox/append-message.js';
import { attackAnnouncementLines } from './attack-announcements.mjs';
import { getCardRegistry } from './apply-view.js';

const resolveCardName = (instanceId) => {
  if (instanceId == null) return null;
  const record = getCardRegistry().get(instanceId);
  return record?.card?.name || null;
};

/**
 * Announces one server attack event, if it has anything to say.
 *
 * @param {object} event
 * @param {string|null} selfPlayerId
 */
export function handleAttackAnnouncement(event, selfPlayerId) {
  const lines = attackAnnouncementLines(event, selfPlayerId, resolveCardName);
  for (const line of lines) {
    appendMessage('', line, 'announcement', false);
  }
}
