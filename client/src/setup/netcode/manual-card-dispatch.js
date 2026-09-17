/**
 * @file Design 012: sends the manual board tools for a server-drawn card.
 *
 * Under server authority the selected card's legacy zone array is empty, so the legacy
 * keybind and context-menu bodies can neither find the card nor build a command for it, and
 * a tool aimed at the opponent's card was routed through the opponent's client. These entry
 * points read the card from the authoritative registry, plan the commands
 * (`manual-card-commands.mjs`) and send them as this player. They return false — leaving the
 * legacy handling to run — whenever authority is off, no server card is selected, or the
 * input is not a manual board tool.
 */

import { mouseClick, socket, systemState } from '../../state.js';
import { appendMessage } from '../chatbox/append-message.js';
import { getCardRegistry } from './apply-view.js';
import {
  emitAuthoritativeCommand,
  isAuthoritativeDispatchActive,
} from './authoritative-dispatch.js';
import { emitCmd } from './cmd-emitter.js';
import { planCardKeyCommands, planMenuCommands } from './manual-card-commands.mjs';

function selectedServerCard() {
  if (!isAuthoritativeDispatchActive() || !systemState.isTwoPlayer) return null;
  if (mouseClick.cardInstanceId == null) return null;
  const record = getCardRegistry().get(mouseClick.cardInstanceId);
  if (!record || record.isRedacted) return null;
  return record;
}

function reportFailure(result) {
  if (result?.success) return;
  appendMessage(
    '',
    `Command failed to send: ${result?.reason || result?.error || 'unknown error'}`,
    'announcement',
    false
  );
}

function sendPlanned(commands) {
  for (const { action, params } of commands) {
    if (action === 'moveCardToBoard') {
      const [{ instanceId, from }] = params;
      emitCmd({
        socket,
        roomId: systemState.roomId,
        type: 'moveCard',
        payload: { instanceId, from, to: 'board' },
      }).then(reportFailure);
      continue;
    }
    if (!emitAuthoritativeCommand(action, params)) {
      console.warn('manual-card-dispatch: command not sent', action, params);
      return;
    }
  }
}

function planInputFor(record) {
  return {
    zoneId: record.zone,
    isOwnCard: record.side === 'you',
    card: record.card,
  };
}

/**
 * @param {KeyboardEvent} event
 * @returns {boolean} true when the key was a manual board tool for the selected server card
 */
export function dispatchServerCardKey(event) {
  const record = selectedServerCard();
  if (!record) return false;
  const commands = planCardKeyCommands({
    key: event.key,
    code: event.code,
    alt: Boolean(event.altKey || event.getModifierState?.('Alt')),
    ...planInputFor(record),
  });
  if (!commands) return false;
  sendPlanned(commands);
  return true;
}

/**
 * @param {string} buttonId id of the clicked card context-menu button
 * @returns {boolean} true when the button acted on the selected server card
 */
export function dispatchServerCardMenu(buttonId) {
  const record = selectedServerCard();
  if (!record) return false;
  const commands = planMenuCommands({ buttonId, ...planInputFor(record) });
  if (!commands) return false;
  sendPlanned(commands);
  return true;
}

/**
 * The hand context menu's "play a random card face down" (design 012). The server picks the
 * card, so nothing about the hand is read here.
 *
 * @param {string} user whose hand the menu was opened on ('self' | 'opp')
 * @returns {boolean} true when sent to the server
 */
export function dispatchServerRandomFaceDown(user) {
  if (!isAuthoritativeDispatchActive() || !systemState.isTwoPlayer) return false;
  if (user !== 'self') {
    appendMessage('', "You can only play a random card from your own hand.", 'announcement', false);
    return true;
  }
  return emitAuthoritativeCommand('playRandomCardFaceDown', [{}]);
}
