// Call-site API for the old sync/decision loggers, now backed by the unified client log (design 087 §5).
import { log } from './client-log.js';
import { systemState } from '../state.js';
import { summarizeDecision, summarizeMoveCardParams, summarizeMoveParamsLine } from './sync-summary.mjs';

function counters() {
  return { self: systemState.selfCounter, opp: systemState.oppCounter };
}

export function logSync(event, detail = {}, dir = 'local') {
  log.debug('sync', event, { dir, ...detail, counters: counters() });
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

export function logDecision(user, action, parameters) {
  log.debug('decision', 'action', {
    user,
    action,
    summary: summarizeDecision(action, parameters),
    turn: systemState.turn,
    counters: counters(),
  });
}
