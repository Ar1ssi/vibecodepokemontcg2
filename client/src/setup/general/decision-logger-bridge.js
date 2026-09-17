import { socket, systemState } from '../../state.js';
import {
  buildCombinedDecisionLogExport,
  buildDecisionLogExport,
  clearDecisionLog,
  isDecisionLogEnabled,
  logDecisionEntry,
  setDecisionLogEnabled,
} from './decision-logger.mjs';

const REMOTE_LOG_TIMEOUT_MS = 5000;
/** @type {{ requestId: string, resolve: (bundle: object|null) => void } | null} */
let pendingRemoteLog = null;

function counters() {
  return {
    self: systemState.selfCounter,
    opp: systemState.oppCounter,
  };
}

function isActivePlayer() {
  const notSpectator = !(
    document.getElementById('spectatorModeCheckbox')?.checked &&
    systemState.isTwoPlayer
  );
  return systemState.isTwoPlayer && notSpectator;
}

function exportMeta() {
  return {
    username: systemState.p2SelfUsername,
    roomId: systemState.roomId,
    socketId: socket?.id || '',
  };
}

function downloadDecisionLogJson(payload, filenameStem) {
  const slug = String(filenameStem || 'room')
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 32);
  const name = payload.meta?.combined
    ? `ptcg-decision-log_combined_${slug}_${Date.now()}.json`
    : `ptcg-decision-log_${slug}_${Date.now()}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return name;
}

function requestRemoteDecisionLogBundle() {
  const requestId = `${socket.id}-dl-${Date.now()}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (pendingRemoteLog?.requestId === requestId) {
        pendingRemoteLog = null;
      }
      resolve(null);
    }, REMOTE_LOG_TIMEOUT_MS);

    pendingRemoteLog = {
      requestId,
      resolve: (bundle) => {
        clearTimeout(timer);
        pendingRemoteLog = null;
        resolve(bundle);
      },
    };

    socket.emit('requestDecisionLogBundle', {
      roomId: systemState.roomId,
      requestId,
      username: systemState.p2SelfUsername,
    });
  });
}

export function initializeDecisionLogSocketListeners() {
  socket.on('requestDecisionLogBundle', (data) => {
    if (!isActivePlayer() || !data?.roomId || data.roomId !== systemState.roomId) {
      return;
    }
    const bundle = buildDecisionLogExport(exportMeta());
    socket.emit('decisionLogBundle', {
      roomId: data.roomId,
      requestId: data.requestId,
      username: systemState.p2SelfUsername,
      bundle,
    });
  });

  socket.on('decisionLogBundle', (data) => {
    if (!pendingRemoteLog || data.requestId !== pendingRemoteLog.requestId) {
      return;
    }
    pendingRemoteLog.resolve(data.bundle ?? null);
  });
}

export function initDecisionLogger() {
  try {
    const params = new URLSearchParams(globalThis.location?.search || '');
    if (params.get('decisionLog') === '1') {
      setDecisionLogEnabled(true);
    }
  } catch {
    /* non-browser */
  }

  initializeDecisionLogSocketListeners();

  globalThis.ptcgDecisionLog = {
    enabled: isDecisionLogEnabled,
    enable: () => setDecisionLogEnabled(true),
    disable: () => setDecisionLogEnabled(false),
    clear: clearDecisionLog,
    export: exportDecisionLog,
    entries: () => buildDecisionLogExport(exportMeta()).entries,
  };
}

export function enableDecisionLogForMultiplayer() {
  setDecisionLogEnabled(true);
  logDecisionEntry({
    player: 'self',
    action: 'session.start',
    counters: counters(),
    turn: systemState.turn,
    extra: { roomId: systemState.roomId, username: systemState.p2SelfUsername },
  });
}

/**
 * Log a client-side decision.
 * @param {'self'|'opp'} player
 * @param {string} action
 * @param {any[]} [parameters]
 */
export function logDecision(player, action, parameters = []) {
  logDecisionEntry({
    player,
    action,
    parameters,
    counters: counters(),
    turn: systemState.turn,
  });
}

export async function exportDecisionLog() {
  const local = buildDecisionLogExport(exportMeta());

  if (!isActivePlayer()) {
    downloadDecisionLogJson(local, local.meta.username);
    return local;
  }

  const remote = await requestRemoteDecisionLogBundle();

  const payload = remote
    ? buildCombinedDecisionLogExport(local, [remote])
    : {
        ...buildCombinedDecisionLogExport(local, []),
        meta: {
          ...buildCombinedDecisionLogExport(local, []).meta,
          remoteMissing: true,
        },
      };

  downloadDecisionLogJson(payload, systemState.roomId || local.meta.username);
  return payload;
}

export async function copyDecisionCompareLog() {
  const local = buildDecisionLogExport(exportMeta());
  let payload = local;

  if (isActivePlayer()) {
    const remote = await requestRemoteDecisionLogBundle();
    payload = remote
      ? buildCombinedDecisionLogExport(local, [remote])
      : buildCombinedDecisionLogExport(local, []);
  }

  const text = [payload.compareHeader, ...payload.compareLines].join('\n');
  await navigator.clipboard.writeText(text);
  return text;
}
