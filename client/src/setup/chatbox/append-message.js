import { socket, systemState } from '../../state.js';

export const appendMessage = (user, message, type, emit = true) => {
  if (!systemState.isUndoInProgress && !systemState.syncReplaying && !systemState.isCatchingUp) {
    const chatbox = document.getElementById('chatbox');
    const p2Chatbox = document.getElementById('p2Chatbox');

    const p = document.createElement('p');
    if (type === 'player') {
      p.className = user === 'self' ? 'self-text' : 'opp-text';
    } else if (type === 'message') {
      p.className = user === 'self' ? 'self-message' : 'opp-message';
    } else {
      p.className = type;
    }
    p.textContent = message;
    // Design 074 D7: a solo room keeps the Solo tab's chat and has no peer to tell.
    const roomChat = systemState.isTwoPlayer && !systemState.solo;
    const chat = roomChat ? p2Chatbox : chatbox;
    chat.appendChild(p);
    chat.scrollTop = chat.scrollHeight;
    if (roomChat && emit) {
      user = user === 'self' ? 'opp' : 'self';
      const data = {
        roomId: systemState.roomId,
        user: user,
        message: message,
        type: type,
        emit: false,
        socketId: socket.id,
      };
      socket.emit('appendMessage', data);
    }
  }
};
