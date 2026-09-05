import { socket, systemState } from '../../state.js';
import { logSync } from './sync-logger-bridge.js';

export const resyncActions = () => {
  logSync('resync.emit', { actionCount: systemState.selfActionData.length }, 'out');
  const data = {
    roomId: systemState.roomId,
    actionData: systemState.selfActionData,
  };
  socket.emit('catchUpActions', data);
};
