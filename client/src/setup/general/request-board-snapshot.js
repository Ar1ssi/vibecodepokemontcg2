import { socket, systemState } from '../../state.js';
import { shouldRequestBoardSnapshot } from './sync-replay.mjs';
import { logSync } from './sync-logger-bridge.js';

export function requestBoardSnapshot() {
  const { request, skipped } = shouldRequestBoardSnapshot({
    selfCounter: systemState.selfCounter,
    oppCounter: systemState.oppCounter,
    syncReplaying: systemState.syncReplaying,
    isCatchingUp: systemState.isCatchingUp,
  });
  if (!request) {
    logSync('snapshot.request.skip', { skipped }, 'local');
    return false;
  }
  logSync(
    'snapshot.request.emit',
    {
      selfCounter: systemState.selfCounter,
      oppCounter: systemState.oppCounter,
    },
    'out'
  );
  socket.emit('requestBoardSnapshot', {
    roomId: systemState.roomId,
    selfCounter: systemState.selfCounter,
    oppCounter: systemState.oppCounter,
  });
  return true;
}

export async function emitSelfBoardSnapshot() {
  const { buildSelfBoardSnapshot } = await import('./apply-board-snapshot.js');
  const zones = buildSelfBoardSnapshot();
  logSync(
    'snapshot.emit',
    {
      counter: systemState.selfCounter,
      hand: zones.hand?.length ?? 0,
      active: zones.active?.length ?? 0,
    },
    'out'
  );
  socket.emit('applyBoardSnapshot', {
    roomId: systemState.roomId,
    counter: systemState.selfCounter,
    zones,
  });
}
