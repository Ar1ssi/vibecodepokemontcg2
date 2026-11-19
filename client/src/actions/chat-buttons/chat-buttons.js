/**
 * @file The four chat-button actions: attack, retreat, pass and the Stadium effect.
 *
 * Design 090: the server engine owns the rules, so each entry point only resolves what its
 * command needs, hands the command to `dispatchAuthoritativeAction`, and returns. With no room
 * the dispatcher itself refuses and says so. In a room, a call that cannot be dispatched (an
 * untranslatable action, an opponent seat this client does not drive) refuses here with one
 * chat line and changes nothing locally.
 */
import { systemState } from '../../state.js';
import { appendMessage } from '../../setup/chatbox/append-message.js';
import { logSync } from '../../log/sync-log.js';
import { rulesState } from '/shared/engine/rules/rules-state.mjs';
import {
  parseAttackArgs,
  parseRetreatArgs,
  splitEmitAndTail,
} from '../../setup/general/sync-action-args.mjs';
import {
  dispatchAuthoritativeAction,
  readCardInstanceId,
} from '../../setup/netcode/authoritative-dispatch.js';

/**
 * Refuses an action that could not be sent: one chat line, one log line, no mutation.
 *
 * @param {string} user 'self' | 'opp'
 * @param {string} action Legacy action name, for the log and the message.
 * @returns {false}
 */
const refuse = (user, action) => {
  logSync('dispatch.refused', { action, user });
  appendMessage(user, `⛔ The ${action} could not be sent to the server.`, 'announcement', false);
  return false;
};

/**
 * Sends one command for a locally-initiated action. A relayed mirror call (`emit` false)
 * runs nothing: the server's own view already draws what the acting player did.
 *
 * @returns {boolean} True when the dispatcher took the call (sent it, or refused it for want of
 *   a room); false when nothing was sent and this module refused.
 */
const sendCommand = (action, user, emit, commandArgs) => {
  if (!emit) return false;
  if (dispatchAuthoritativeAction(action, { user, emit, commandArgs })) return true;
  return refuse(user, action);
};

export const attack = (user, emitOrIndex = true, attackIndexOrRng = 0, maybeEmit) => {
  // A solo room has one player at both seats: the attack belongs to whoever's turn it is.
  const actingUser =
    rulesState.enabled && !systemState.isTwoPlayer && rulesState.turnPlayer
      ? rulesState.turnPlayer
      : user;
  const { attackIndex, rngBundle, emit } = parseAttackArgs(
    emitOrIndex,
    attackIndexOrRng,
    maybeEmit
  );
  return sendCommand('attack', actingUser, emit, [attackIndex, rngBundle]);
};

// targetBenchImage: optional bench <img> the player dragged the active Pokémon onto
// (drag-to-retreat). A relayed call carries a bench index instead (see parseRetreatArgs);
// only the live element can name a server card, and the server picks otherwise.
export const retreat = (user, emitOrTarget = true, targetOrEmit = null) => {
  const { target, emit } = parseRetreatArgs(emitOrTarget, targetOrEmit);
  const targetBenchImage = target && typeof target === 'object' ? target : null;
  const targetBenchInstanceId = targetBenchImage ? readCardInstanceId(targetBenchImage) : null;
  return sendCommand(
    'retreat',
    user,
    emit,
    targetBenchInstanceId != null ? [targetBenchInstanceId] : []
  );
};

export const pass = (user, rngOrEmit = true, maybeEmit) => {
  const { emit, tail: rngBundle } = splitEmitAndTail(rngOrEmit, maybeEmit);
  return sendCommand('pass', user, emit, [rngBundle || {}]);
};

export const stadiumEffect = (user, payloadOrEmit = true, maybeEmit) => {
  const { emit, tail: payload } = splitEmitAndTail(payloadOrEmit, maybeEmit);
  return sendCommand('stadium-effect', user, emit, [payload]);
};
