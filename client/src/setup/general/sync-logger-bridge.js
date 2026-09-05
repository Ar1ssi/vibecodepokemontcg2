import { socket, systemState } from '../../state.js';
import {
  buildSyncLogExport,
  clearSyncLog,
  isSyncLogEnabled,
  setSyncLogEnabled,
  summarizeMoveCardParams,
  syncLog,
} from './sync-logger.mjs';

function counters() {
  return {
    self: systemState.selfCounter,
    opp: systemState.oppCounter,
  };
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

export function exportSyncLog() {
  const payload = buildSyncLogExport(exportMeta());
  const slug = (systemState.p2SelfUsername || 'client')
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 24);
  const name = `ptcg-sync-log_${slug}_${Date.now()}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  logSync('export.download', { filename: name });
  return payload;
}

export async function copySyncCompareLog() {
  const payload = buildSyncLogExport(exportMeta());
  const text = [payload.compareHeader, ...payload.compareLines].join('\n');
  await navigator.clipboard.writeText(text);
  logSync('export.clipboard', { lines: payload.compareLines.length });
  return text;
}
