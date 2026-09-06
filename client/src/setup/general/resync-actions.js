import { socket, systemState } from '../../state.js';
import { logSync } from './sync-logger-bridge.js';

export const resyncActions = (opts = {}) => {
  const fullReplay = !!opts.fullReplay;
  logSync(
    'resync.emit',
    { actionCount: systemState.selfActionData.length, fullReplay },
    'out'
  );
  const data = {
    roomId: systemState.roomId,
    actionData: systemState.selfActionData,
    fullReplay,
  };
  socket.emit('catchUpActions', data);
};
