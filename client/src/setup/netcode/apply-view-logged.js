// Design 088 §5: wraps applyView/applySpectatorView with a `view/apply` log entry and
// `choice/open|closed` transitions. Logging can never change what `apply` returns or throws.
import { diffViews } from './view-diff.mjs';

const MAX_LISTED = 20;

let lastLoggedView = null;
let lastChoiceId = null;

export function resetApplyViewLog() {
  lastLoggedView = null;
  lastChoiceId = null;
}

function eventTypesOf(events) {
  return Array.isArray(events) ? events.map((event) => event?.type) : [];
}

function sideSummary(sideDiff) {
  return {
    added: sideDiff.added.length,
    removed: sideDiff.removed.length,
    moved: sideDiff.moved.length,
    updated: sideDiff.updated.length,
    deck: sideDiff.deckCount.current,
  };
}

function summarizeDiff(d) {
  const summary = {
    initial: d.isInitial,
    turnChanged: d.turnChanged,
    stadiumChanged: d.stadiumChanged,
    choiceChanged: d.choiceChanged,
  };
  const moves = [];
  const updatedIds = [];
  for (const side of ['you', 'them']) {
    const sideDiff = d.players?.[side];
    if (!sideDiff) continue;
    summary[side] = sideSummary(sideDiff);
    for (const m of sideDiff.moved) {
      moves.push({ id: m.instanceId, from: `${m.fromSide}.${m.fromZone}`, to: `${m.toSide}.${m.toZone}` });
    }
    for (const u of sideDiff.updated) updatedIds.push(u.instanceId);
  }
  summary.moves = moves.slice(0, MAX_LISTED);
  summary.updatedIds = updatedIds.slice(0, MAX_LISTED);
  return summary;
}

function isNewBaseline(previous, view) {
  if (!previous) return false;
  if (Number.isFinite(view?.stateVersion) && view.stateVersion < previous.stateVersion) return true;
  return (previous.you?.playerId ?? null) !== (view?.you?.playerId ?? null);
}

function logChoiceTransition(log, view, sv) {
  const pc = view.pendingChoice;
  const id = pc?.choiceId ?? null;
  if (id === lastChoiceId) return;
  if (lastChoiceId !== null) log.info('choice', 'closed', { choiceId: lastChoiceId }, { sv });
  if (id !== null) {
    log.info(
      'choice',
      'open',
      {
        choiceId: id,
        player: pc.player ?? null,
        type: pc.type ?? null,
        min: pc.min ?? null,
        max: pc.max ?? null,
        options: Array.isArray(pc.options) ? pc.options.length : null,
      },
      { sv }
    );
  }
  lastChoiceId = id;
}

function logApplied(log, result, view, events, ms, diff) {
  const sv = view?.stateVersion;
  const applied = Boolean(result?.applied);
  const reason = result?.reason ?? null;
  const detail = { applied, reason, ms: Math.round(ms * 10) / 10, events: eventTypesOf(events) };
  let d = null;
  if (applied) {
    // A lower stateVersion or another seat's perspective is a new game or a board flip: diffing
    // against the old view would report a whole board of bogus moves.
    if (isNewBaseline(lastLoggedView, view)) resetApplyViewLog();
    try {
      d = diff(lastLoggedView, view);
      Object.assign(detail, summarizeDiff(d));
    } catch {
      d = null;
    }
    lastLoggedView = view;
  }
  const level = applied || reason === 'out_of_order' ? 'debug' : 'warn';
  log[level]('view', 'apply', detail, { sv });
  if (d && log.enabled('trace')) log.trace('view', 'diff', d, { sv });
  if (applied) logChoiceTransition(log, view, sv);
}

export function applyViewLogged(
  apply,
  view,
  events,
  options,
  log,
  { now = () => performance.now(), diff = diffViews } = {}
) {
  let startedAt = 0;
  try {
    startedAt = now();
  } catch {
    // timing is best effort
  }
  let result;
  try {
    result = apply(view, events, options);
  } catch (error) {
    try {
      log.error('view', 'apply.threw', { error, ms: now() - startedAt, events: eventTypesOf(events) }, { sv: view?.stateVersion });
    } catch {
      // logging must not mask the original error
    }
    throw error;
  }
  try {
    logApplied(log, result, view, events, now() - startedAt, diff);
  } catch {
    // logging must never change the result
  }
  return result;
}
