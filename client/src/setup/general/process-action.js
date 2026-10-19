import { socket, systemState } from '../../state.js';
import { logSyncAction, logSync } from './sync-logger-bridge.js';
import { logDecision } from './decision-logger-bridge.js';
import { createAction } from './action-event.mjs';
import { translateActionToCmd } from '../netcode/dual-run-bridge.js';
import { emitCmd } from '../netcode/cmd-emitter.js';
import { appendMessage } from '../chatbox/append-message.js';
import { soloCommandSeat } from '../netcode/solo-seat.mjs';
import { getCardRegistry } from '../netcode/apply-view.js';

// The server-drawn card a command acts on wears `.cmd-pending` until the next view (cmd-emitter.js).
const pendingElementFor = (payload) =>
  payload && Number.isFinite(payload.instanceId)
    ? (getCardRegistry().get(payload.instanceId)?.element ?? null)
    : null;

export const processAction = (user, emit, action, parameters) => {
  const notSpectator = !(
    document.getElementById('spectatorModeCheckbox').checked &&
    systemState.isTwoPlayer
  );
  if (!systemState.isUndoInProgress && emit && notSpectator) {
    // Design 074 D7: a solo room's player owns both sides, so neither side's action is
    // requested from a peer; each names its seat for the server instead.
    const ownsAction = user === 'self' || systemState.solo;
    const seat = soloCommandSeat({ ...systemState, user });
    if (!systemState.isTwoPlayer || ownsAction) {
      const data = createAction(action, user, parameters, { emit });
      if (user === 'self') {
        systemState.selfCounter++;
        systemState.selfActionData.push(data);
      } else {
        // in 1p, we want to log oppAction data and counter so undo button works. in 2p, we do not need to do this because we directly request the undo action, and then
        // their action data takes care of it (and they push the action back to us if our request is successful)
        systemState.oppCounter++;
        systemState.oppActionData.push(data);
      }
    }
    if (ownsAction && systemState.isTwoPlayer) {
      //log the move if it's 1 player, or if it's yourself
      const data = {
        action: action,
        counter: user === 'self' ? systemState.selfCounter : systemState.oppCounter,
        roomId: systemState.roomId,
        parameters: parameters,
        ...(seat ? { seat } : {}),
      };
      socket.emit('pushAction', data);
      logSyncAction(action, parameters, 'out', {
        counter: systemState.selfCounter,
        transport: 'pushAction',
      });
      logDecision(user, action, parameters);
      if (systemState.serverAuthoritative) {
        const cmdSpec = translateActionToCmd(action, parameters, { seat });
        if (cmdSpec) {
          emitCmd({
            socket,
            roomId: systemState.roomId,
            type: cmdSpec.type,
            payload: cmdSpec.payload,
            element: pendingElementFor(cmdSpec.payload),
            seat,
          }).then((result) => {
            if (!result.success) {
              logSync('emitCmd.rejected', { action, error: result.error, reason: result.reason }, 'local');
              appendMessage(
                '',
                `Command failed to send: ${result.reason || result.error}`,
                'announcement',
                false
              );
            }
          });
        }
      }
    } else if (systemState.isTwoPlayer) {
      //if it's two player and you're moving an opponent's card, request the action before implementing
      const data = {
        action: action,
        counter: systemState.oppCounter,
        roomId: systemState.roomId,
        parameters: parameters,
      };
      socket.emit('requestAction', data);
    }

    if (!systemState.isTwoPlayer || ownsAction) {
      //for storing spectator/export data (use a copy to avoid mutating selfActionData)
      const exportParameters = [...parameters];
      if (exportParameters[0]) {
        if (exportParameters[0] === 'self') {
          exportParameters[0] = 'opp';
        } else if (exportParameters[0] === 'opp') {
          exportParameters[0] = 'self';
        }
      }
      const data = createAction(action, user, exportParameters, { emit });
      // systemState.spectatorActionData.push(data);
      if (action !== 'exchangeData' && action !== 'loadDeckData') {
        systemState.exportActionData.push(data);
      }
    }

    if (typeof document !== 'undefined' && typeof document.dispatchEvent === 'function') {
      document.dispatchEvent(
        new CustomEvent('action-processed', { detail: { action, user } })
      );
    }
  }
};
