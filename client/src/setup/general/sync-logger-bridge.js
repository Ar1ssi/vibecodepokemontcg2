import { socket, systemState } from '../../state.js';
import {
  buildCombinedSyncLogExport,
  buildSyncLogExport,
  clearSyncLog,
  isSyncLogEnabled,
  setSyncLogEnabled,
  summarizeMoveCardParams,
  syncLog,
} from './sync-logger.mjs';

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
    initiator: systemState.initiator,
    selfCounter: systemState.selfCounter,
    oppCounter: systemState.oppCounter,
  };
}

function downloadSyncLogJson(payload, filenameStem) {
  const slug = String(filenameStem || 'room')
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 32);
  const name = payload.meta?.combined
    ? `ptcg-sync-log_combined_${slug}_${Date.now()}.json`
    : `ptcg-sync-log_${slug}_${Date.now()}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  logSync('export.download', {
    filename: name,
    combined: !!payload.meta?.combined,
    clientCount: payload.clients?.length ?? 1,
  });
  return name;
}

function requestRemoteSyncLogBundle() {
  const requestId = `${socket.id}-${Date.now()}`;
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

    socket.emit('requestSyncLogBundle', {
      roomId: systemState.roomId,
      requestId,
      username: systemState.p2SelfUsername,
    });
  });
}

export function initializeSyncLogSocketListeners() {
  socket.on('requestSyncLogBundle', (data) => {
    if (!isActivePlayer() || !data?.roomId || data.roomId !== systemState.roomId) {
      return;
    }
    const bundle = buildSyncLogExport(exportMeta());
    socket.emit('syncLogBundle', {
      roomId: data.roomId,
      requestId: data.requestId,
      username: systemState.p2SelfUsername,
      bundle,
    });
    logSync('export.respond', { requestId: data.requestId, to: data.username }, 'out');
  });

  socket.on('syncLogBundle', (data) => {
    if (!pendingRemoteLog || data.requestId !== pendingRemoteLog.requestId) {
      return;
    }
    logSync('export.received', {
      requestId: data.requestId,
      from: data.username,
      entries: data.bundle?.entries?.length ?? 0,
    });
    pendingRemoteLog.resolve(data.bundle ?? null);
  });
}

export function initSyncLogger() {
  try {
    const params = new URLSearchParams(globalThis.location?.search || '');
    if (params.get('syncLog') === '1') {
      setSyncLogEnabled(true);
    }
  } catch {
    /* non-browser */
  }

  initializeSyncLogSocketListeners();

  globalThis.ptcgSyncLog = {
    enabled: isSyncLogEnabled,
    enable: () => setSyncLogEnabled(true),
    disable: () => setSyncLogEnabled(false),
    clear: clearSyncLog,
    export: exportSyncLog,
    copyCompare: copySyncCompareLog,
    entries: () => buildSyncLogExport(exportMeta()).entries,
  };
}

export function enableSyncLogForMultiplayer() {
  setSyncLogEnabled(true);
  logSync('session.2p.start', {
    roomId: systemState.roomId,
    username: systemState.p2SelfUsername,
  });
}

export function logSync(event, detail = {}, dir = 'local') {
  syncLog({ event, detail, dir, counters: counters() });
}

export function logSyncAction(action, parameters, dir, extra = {}) {
  const detail = { action, ...extra };
  if (action === 'moveCardBundle') {
    Object.assign(detail, summarizeMoveCardParams(parameters));
    detail.summary = summarizeMoveParamsLine(parameters);
  } else if (parameters?.length <= 4) {
    detail.parameters = parameters;
  } else {
    detail.paramCount = parameters.length;
  }
  logSync(`action.${dir === 'out' ? 'emit' : dir === 'in' ? 'recv' : 'apply'}`, detail, dir);
}

function summarizeMoveParamsLine(parameters) {
  const s = summarizeMoveCardParams(parameters);
  const tgt =
    typeof s.targetIndex === 'number'
      ? `→target:${s.target}`
      : `→${s.to}`;
  return `${s.from}[${s.index}] ${s.moving} ${tgt}`;
}

export async function exportSyncLog() {
  const local = buildSyncLogExport(exportMeta());

  if (!isActivePlayer()) {
    downloadSyncLogJson(local, local.meta.username);
    return local;
  }

  logSync('export.request', { roomId: systemState.roomId }, 'out');
  const remote = await requestRemoteSyncLogBundle();

  const payload = remote
    ? buildCombinedSyncLogExport(local, [remote])
    : {
        ...buildCombinedSyncLogExport(local, []),
        meta: {
          ...buildCombinedSyncLogExport(local, []).meta,
          remoteMissing: true,
        },
      };

  downloadSyncLogJson(payload, systemState.roomId || local.meta.username);
  return payload;
}

export async function copySyncCompareLog() {
  const local = buildSyncLogExport(exportMeta());
  let payload = local;

  if (isActivePlayer()) {
    const remote = await requestRemoteSyncLogBundle();
    payload = remote
      ? buildCombinedSyncLogExport(local, [remote])
      : buildCombinedSyncLogExport(local, []);
  }

  const text = [payload.compareHeader, ...payload.compareLines].join('\n');
  await navigator.clipboard.writeText(text);
  logSync('export.clipboard', {
    lines: payload.compareLines.length,
    combined: !!payload.meta?.combined,
  });
  return text;
}
