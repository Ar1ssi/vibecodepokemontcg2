import { flipBoard } from '../../actions/general/flip-board.js';
import { reset } from '../../actions/general/reset.js';
import {
  hideCards,
  hideShortcut,
  lookAtCards,
  lookShortcut,
  revealCards,
  revealShortcut,
  stopLookingAtCards,
  stopLookingShortcut,
} from '../../actions/general/reveal-and-hide.js';
import { socket, systemState } from '../../state.js';
import { appendMessage } from '../../setup/chatbox/append-message.js';
import { exchangeData } from '../../setup/deck-constructor/exchange-data.js';
import { acceptAction } from '../../setup/general/accept-action.js';
import { cleanActionData } from '../../setup/general/clean-action-data.js';
import { spectatorJoin } from '../../setup/spectator/spectator-join.js';
import { startKeybindsSleep } from '../../actions/keybinds/keybindSleep.js';
import { forceRulesEnabledForMultiplayer } from '../../setup/rules/rules-bridge.js';
import { getStoredMatId } from '../../setup/sizing/apply-mat-layout.js';
import { restoreLastUsedDeckToPlaymat } from '../document-event-listeners/sidebox/native-deck-builder.js';
import {
  enableSyncLogForMultiplayer,
  logSync,
} from '../../setup/general/sync-logger-bridge.js';
import { applyView } from '../../setup/netcode/apply-view.js';
import {
  handleCmdRejected,
  emitRequestView,
} from '../../setup/netcode/cmd-emitter.js';

let isImporting = false;
let syncCheckInterval;
let spectatorDebounceTimer = null;
let syncCheckDebounceTimer = null;
let pushActionQueue = Promise.resolve();

export const sendSpectatorData = () => {
  if (systemState.isTwoPlayer && systemState.roomId) {
    const data = {
      selfUsername: systemState.p2SelfUsername,
      selfDeckData: systemState.selfDeckData,
      oppDeckData: systemState.p2OppDeckData,
      oppUsername: systemState.p2OppUsername,
      roomId: systemState.roomId,
      spectatorActionData: systemState.exportActionData,
      socketId: socket.id,
    };
    socket.emit('spectatorActionData', data);
  }
};

export const emitSpectatorDataDebounced = (delay = 200) => {
  if (spectatorDebounceTimer) clearTimeout(spectatorDebounceTimer);
  spectatorDebounceTimer = setTimeout(() => {
    spectatorDebounceTimer = null;
    sendSpectatorData();
  }, delay);
};

export const emitSyncCheck = () => {};

export const triggerSyncCheck = () => {};

export const removeSyncIntervals = () => {
  clearInterval(syncCheckInterval);
  if (spectatorDebounceTimer) clearTimeout(spectatorDebounceTimer);
  if (syncCheckDebounceTimer) clearTimeout(syncCheckDebounceTimer);
};
export const initializeSocketEventListeners = () => {
  socket.on('joinGame', (data) => {
    systemState.serverAuthoritative = Boolean(data?.serverAuthoritative);
    if (systemState.serverAuthoritative && data?.protocolVersion && data.protocolVersion !== '2.0.0') {
      appendMessage(
        '',
        'A new version of the game is available. Please reload the page.',
        'announcement',
        false
      );
      return;
    }
    const connectedRoom = document.getElementById('connectedRoom');
    const lobby = document.getElementById('lobby');
    const roomHeaderText = document.getElementById('roomHeaderText');
    const chatbox = document.getElementById('chatbox');
    const p2ExplanationBox = document.getElementById('p2ExplanationBox');
    const flipBoardButton = document.getElementById('flipBoardButton');
    roomHeaderText.textContent = 'id: ' + systemState.roomId;
    chatbox.innerHTML = '';
    connectedRoom.style.display = 'flex';
    lobby.style.display = 'none';
    p2ExplanationBox.style.display = 'none';
    flipBoardButton.style.display = 'none';
    if (systemState.initiator === 'opp') {
      flipBoard();
    }
    systemState.isTwoPlayer = true;
    forceRulesEnabledForMultiplayer();
    enableSyncLogForMultiplayer();
    cleanActionData('self');
    cleanActionData('opp');
    reset('opp', true, false, false, false);
    restoreLastUsedDeckToPlaymat();
    exchangeData(
      'self',
      systemState.p2SelfUsername,
      systemState.selfDeckData,
      systemState.cardBackSrc,
      document.getElementById('coachingModeCheckbox').checked,
      false,
      getStoredMatId('self'),
      true
    );
    socket.emit('rulesEvent', {
      type: 'peerSocketId',
      data: { socketId: socket.id },
    });

    if (!systemState.serverAuthoritative) {
      // Heartbeat backstop: 30s check during legacy 2P games
      syncCheckInterval = setInterval(() => {
        if (
          systemState.isTwoPlayer &&
          systemState.roomId &&
          !systemState.syncReplaying &&
          !systemState.isCatchingUp
        ) {
          emitSyncCheck();
        }
      }, 30000);
    }
  });
  socket.on('requestSpectatorData', () => {
    sendSpectatorData();
  });
  socket.on('spectatorJoin', () => {
    spectatorJoin();
    if (systemState.roomId) {
      socket.emit('requestSpectatorData', { roomId: systemState.roomId });
    }
  });
  socket.on('roomReject', () => {
    let overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';

    let container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.top = '50%';
    container.style.left = '50%';
    container.style.transform = 'translate(-50%, -50%)';
    container.style.textAlign = 'center';
    container.style.color = '#fff';

    let message = document.createElement('p');
    message.innerHTML =
      'Room is full.<br>Enable spectator mode to watch the game.';
    message.style.fontSize = '24px';

    container.appendChild(message);
    overlay.appendChild(container);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', () => {
      document.body.removeChild(overlay);
    });
  });
  socket.on('connect', () => {
    const notSpectator = !(
      document.getElementById('spectatorModeCheckbox').checked &&
      systemState.isTwoPlayer
    );
    if (systemState.isTwoPlayer) {
      const data = {
        roomId: systemState.roomId,
        username: systemState.p2SelfUsername,
        notSpectator: notSpectator,
      };
      socket.emit('userReconnected', data);
      if (!notSpectator) {
        appendMessage(
          '',
          systemState.spectatorUsername + ' reconnected!',
          'announcement',
          false
        );
      }
      // Trigger immediate resync to recover any actions missed during disconnect
      if (notSpectator) {
        logSync('resync.request.emit', { reason: 'connect' }, 'out');
        if (systemState.serverAuthoritative) {
          emitRequestView({ socket, roomId: systemState.roomId });
        } else {
          socket.emit('resyncActions', {
            roomId: systemState.roomId,
            reason: 'reconnect',
          });
        }
      }
    }
  });
  socket.on('userReconnected', (data) => {
    appendMessage('', data.username + ' reconnected!', 'announcement', false);
  });
  socket.on('userDisconnected', (username) => {
    appendMessage('', username + ' disconnected', 'announcement', false);
  });
  socket.on('disconnect', () => {
    if (systemState.isTwoPlayer) {
      const isSpectator =
        systemState.isTwoPlayer &&
        document.getElementById('spectatorModeCheckbox').checked;
      const username = isSpectator
        ? systemState.spectatorUsername
        : systemState.p2SelfUsername;
      appendMessage('', username + ' disconnected', 'announcement', false);
    }
  });
  socket.on('leaveRoom', (data) => {
    if (!data.isSpectator) {
      cleanActionData('opp');
    }
    appendMessage('', data.username + ' left the room', 'announcement', false);
  });
  socket.on('appendMessage', (data) => {
    if (data.socketId === systemState.spectatorId) {
      data.user = data.user === 'self' ? 'opp' : 'self';
    }
    appendMessage(data.user, data.message, data.type, data.emit);
  });

  socket.on('view', (data) => {
    if (data?.view) {
      applyView(data.view, data.events || []);
    }
  });

  socket.on('cmdRejected', (data) => {
    handleCmdRejected(data, {
      onRejected: ({ reason, details }) => {
        appendMessage(
          '',
          `Command rejected: ${reason}${details ? ` (${details})` : ''}`,
          'announcement',
          false
        );
      },
    });
  });
  socket.on('gameEnded', (data) => {
    const reason = data?.reason;
    const msg =
      data?.message ||
      (reason === 'server_restart'
        ? 'Game session terminated due to server restart.'
        : 'The game has ended.');
    appendMessage('', msg, 'announcement', false);
    if (reason === 'server_restart') {
      const connectedRoom = document.getElementById('connectedRoom');
      const lobby = document.getElementById('lobby');
      if (connectedRoom) connectedRoom.style.display = 'none';
      if (lobby) lobby.style.display = 'flex';
      systemState.isTwoPlayer = false;
      systemState.roomId = null;
      removeSyncIntervals();
    }
  });

  socket.on('requestAction', (data) => {
    if (systemState.serverAuthoritative) return;
    const notSpectator = !(
      document.getElementById('spectatorModeCheckbox').checked &&
      systemState.isTwoPlayer
    );
    if (!notSpectator) return;
    const counterMatches = data.counter === systemState.selfCounter;
    const isCounterOrStatusAction =
      data.action === 'updateDamageCounter' ||
      data.action === 'addDamageCounter' ||
      data.action === 'removeDamageCounter' ||
      data.action === 'addSpecialCondition' ||
      data.action === 'updateSpecialCondition' ||
      data.action === 'removeSpecialCondition';
    const canAttempt =
      isImporting ||
      counterMatches ||
      data.action === 'moveCardBundle' ||
      isCounterOrStatusAction;
    if (!canAttempt) {
      logSync(
        'requestAction.drop',
        { action: data.action, expected: systemState.selfCounter, received: data.counter },
        'in'
      );
      return;
    }
    if (!counterMatches && !isImporting) {
      logSync(
        'requestAction.stale_counter',
        { action: data.action, expected: systemState.selfCounter, received: data.counter },
        'in'
      );
    }
    startKeybindsSleep();
    pushActionQueue = pushActionQueue.then(() =>
      acceptAction('self', data.action, data.parameters)
    );
  });

  // reset counter when importing game state
  socket.on('initiateImport', () => {
    systemState.spectatorCounter = 0; //reset spectator counter to make sure it catches all of the actions
    isImporting = true;
    cleanActionData('self');
    cleanActionData('opp');
  });

  socket.on('endImport', () => {
    isImporting = false;
  });

  socket.on('resetCounter', () => {
    cleanActionData('opp');
  });

  socket.on('pushAction', (data) => {
    if (systemState.serverAuthoritative) return;
    const notSpectator = !(
      document.getElementById('spectatorModeCheckbox').checked &&
      systemState.isTwoPlayer
    );
    if (!notSpectator) return;
    pushActionQueue = pushActionQueue.then(async () => {
      startKeybindsSleep();
      await acceptAction('opp', data.action, data.parameters);
      systemState.oppCounter++;
      if (data.action !== 'exchangeData' && data.action !== 'loadDeckData') {
        systemState.exportActionData.push({
          user: 'opp',
          emit: true,
          action: data.action,
          parameters: data.parameters,
        });
      }
      emitSpectatorDataDebounced();
    });
  });
  socket.on('lookAtCards', (data) => {
    if (data.socketId === systemState.spectatorId) {
      data.user = data.user === 'self' ? 'opp' : 'self';
      data.initiator = data.initiator === 'self' ? 'opp' : 'self';
    }
    lookAtCards(
      data.user,
      data.initiator,
      data.zoneId,
      data.message,
      data.emit
    );
  });
  socket.on('stopLookingAtCards', (data) => {
    if (data.socketId === systemState.spectatorId) {
      data.user = data.user === 'self' ? 'opp' : 'self';
      data.initiator = data.initiator === 'self' ? 'opp' : 'self';
    }
    stopLookingAtCards(
      data.user,
      data.initiator,
      data.zoneId,
      data.message,
      data.emit
    );
  });
  socket.on('revealCards', (data) => {
    if (data.socketId === systemState.spectatorId) {
      data.user = data.user === 'self' ? 'opp' : 'self';
      data.initiator = data.initiator === 'self' ? 'opp' : 'self';
    }
    revealCards(data.user, data.initiator, data.zoneId, data.emit);
  });
  socket.on('hideCards', (data) => {
    if (data.socketId === systemState.spectatorId) {
      data.user = data.user === 'self' ? 'opp' : 'self';
      data.initiator = data.initiator === 'self' ? 'opp' : 'self';
    }
    hideCards(data.user, data.initiator, data.zoneId, data.emit);
  });
  socket.on('revealShortcut', (data) => {
    if (data.socketId === systemState.spectatorId) {
      data.user = data.user === 'self' ? 'opp' : 'self';
      data.initiator = data.initiator === 'self' ? 'opp' : 'self';
    }
    revealShortcut(
      data.user,
      data.initiator,
      data.zoneId,
      data.index,
      data.message,
      data.emit
    );
  });
  socket.on('hideShortcut', (data) => {
    if (data.socketId === systemState.spectatorId) {
      data.user = data.user === 'self' ? 'opp' : 'self';
      data.initiator = data.initiator === 'self' ? 'opp' : 'self';
    }
    hideShortcut(
      data.user,
      data.initiator,
      data.zoneId,
      data.index,
      data.message,
      data.emit
    );
  });
  socket.on('lookShortcut', (data) => {
    if (data.socketId === systemState.spectatorId) {
      data.user = data.user === 'self' ? 'opp' : 'self';
      data.initiator = data.initiator === 'self' ? 'opp' : 'self';
    }
    lookShortcut(data.user, data.initiator, data.zoneId, data.index, data.emit);
  });
  socket.on('stopLookingShortcut', (data) => {
    if (data.socketId === systemState.spectatorId) {
      data.user = data.user === 'self' ? 'opp' : 'self';
      data.initiator = data.initiator === 'self' ? 'opp' : 'self';
    }
    stopLookingShortcut(
      data.user,
      data.initiator,
      data.zoneId,
      data.index,
      data.emit
    );
  });
  // socket.on('playRandomCardFaceDown', (data) => {
  //     playRandomCardFaceDown(data.user, data.initiator, data.randomIndex, data.emit);
  // });
  // socket.on('rotateCard', (data) => {
  //     rotateCard(data.user, data.zoneId, data.index, data.single, data.emit);
  // });
  // socket.on('changeType', (data) => {
  //     changeType(data.user, data.initiator, data.zoneId, data.index, data.type, data.emit);
  // });
  // socket.on('attack', (data) => {
  //     attack(data.user, data.emit);
  // });
  // socket.on('pass', (data) => {
  //     pass(data.user, data.emit);
  // });
  // socket.on('VSTARGXFunction', (data) => {
  //     VSTARGXFunction(data.user, data.type, data.emit)
  // });
  socket.on('exportGameStateSuccessful', (key) => {
    const url = `https://ptcgsim.online/import?key=${key}`;
    appendMessage('self', url, 'announcement', false);
  });
  socket.on('exportGameStateFailed', (message) => {
    appendMessage('self', message, 'announcement', false);
  });

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('action-processed', () => {
      if (systemState.isTwoPlayer) {
        triggerSyncCheck();
        emitSpectatorDataDebounced();
      }
    });
    document.addEventListener('rules-turn-began', () => {
      if (systemState.isTwoPlayer) {
        triggerSyncCheck(100);
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (
        document.visibilityState === 'visible' &&
        systemState.isTwoPlayer &&
        systemState.roomId
      ) {
        if (!socket.connected) {
          logSync('visibility.reconnect', {}, 'local');
          socket.connect();
        } else if (systemState.serverAuthoritative) {
          emitRequestView({ socket, roomId: systemState.roomId });
        }
      }
    });
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('focus', () => {
      if (
        systemState.isTwoPlayer &&
        systemState.roomId
      ) {
        if (!socket.connected) {
          logSync('focus.reconnect', {}, 'local');
          socket.connect();
        } else if (systemState.serverAuthoritative) {
          emitRequestView({ socket, roomId: systemState.roomId });
        }
      }
    });
  }
};
