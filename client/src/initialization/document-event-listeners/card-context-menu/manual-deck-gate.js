import { manualDeckActionAllowed } from '/shared/engine/rules/rules-state.mjs';
import { appendMessage } from '../../../setup/chatbox/append-message.js';

// Gate a manual (human-triggered) deck action through the rules layer.
// Parsed card-effect flows call the shared action functions directly.
export function gate(actionKey, initiator) {
  const check = manualDeckActionAllowed(actionKey);
  if (!check.allowed) {
    appendMessage(initiator, '⛔ ' + check.reason, 'announcement', false);
    return false;
  }
  return true;
}
