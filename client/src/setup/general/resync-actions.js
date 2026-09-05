import { socket, systemState } from '../../state.js';

export const resyncActions = () => {
  const data = {
    roomId: systemState.roomId,
    actionData: systemState.selfActionData,
  };
  socket.emit('catchUpActions', data);
};
