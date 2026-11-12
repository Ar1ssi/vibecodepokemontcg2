// Command journal (design 088 §4): one JSON line per rebase / rng jump / command, enough to
// replay a room's game and prove each step by state hash. Plain JSON.stringify on purpose:
// safeStringify's string/array limits would cut deck lists and break replay.
import { LIMITS } from '../../shared/log/log-schema.mjs';
import { hashState } from '../../shared/engine/state.mjs';

const EMPTY_STATS = Object.freeze({ games: 0, records: 0, bytes: 0, complete: true });

export const NO_JOURNAL = Object.freeze({
  rebase() {},
  command() {},
  refused() {},
  states: () => [],
  games: () => [],
  stats: () => ({ ...EMPTY_STATS }),
});

const clientSeqOf = (cmd) => (Number.isInteger(cmd?.clientSeq) ? cmd.clientSeq : undefined);

function choiceSummary(pending) {
  if (!pending) return null;
  return {
    choiceId: pending.choiceId ?? null,
    player: pending.player ?? null,
    options: Array.isArray(pending.options) ? pending.options.length : null,
  };
}

export function createJournal({
  roomId,
  log,
  limits = LIMITS,
  now = Date.now,
  hash = hashState,
  onRecord = null,
}) {
  const games = [];
  let game = 0;
  let n = 0;
  let last = { state: null, sv: null, cursor: null };
  let ring = [];
  let failureReported = false;

  const current = () => games[games.length - 1];

  function append(line) {
    const entry = current();
    entry.records.push(line);
    entry.bytes += line.length;
    if (!onRecord) return;
    try {
      onRecord(line);
    } catch {
      // a failing mirror (disk) must not disturb the in-memory journal
    }
  }

  const overBudget = (line) => current().bytes + line.length > limits.journalGameBytes;

  // `sv` repeats (an undo rewinds it), so each ring entry also says which game and command made it.
  function pushRing(sv, state) {
    ring.push({ sv, state, game, n });
    if (ring.length > limits.stateRing) ring = ring.slice(ring.length - limits.stateRing);
  }

  function guarded(fn) {
    try {
      fn();
    } catch (error) {
      if (failureReported) return;
      failureReported = true;
      log.error('journal', 'failed', { error: String(error?.stack ?? error) });
    }
  }

  function rebase(state, rng, why) {
    guarded(() => doRebase(state, rng, why));
  }

  function doRebase(state, rng, why) {
    const cursor = rng?.cursor ?? state?.rngCursor ?? 0;
    if (games.length === 0 || why === 'created' || why === 'reset') {
      game += 1;
      n = 0;
      games.push({ game, records: [], bytes: 0, complete: true });
      if (games.length > limits.journalGames) games.splice(0, games.length - limits.journalGames);
    }
    // Before anything that can throw: a failed record must not make every later command look
    // like an unjournaled change (which would snapshot the whole state each time).
    last = { state, sv: state.stateVersion, cursor };
    const head = { k: 'rebase', game, why, t: now(), seed: state.seed, cursor, sv: state.stateVersion };
    let line = JSON.stringify({ ...head, state });
    if (overBudget(line)) {
      line = JSON.stringify({ ...head, state: null, _truncated: true });
      current().complete = false;
    }
    append(line);
    pushRing(state.stateVersion, state);
    log.info('engine', 'rebase', { why, game, seed: state.seed, cursor }, { room: roomId, sv: state.stateVersion });
  }

  function command(args) {
    guarded(() => doCommand(args));
  }

  function doCommand({ cmd, playerId, stateBefore, cursorBefore, result, cursorAfter, ms }) {
    if (stateBefore !== last.state || stateBefore.stateVersion !== last.sv) {
      doRebase(stateBefore, { cursor: cursorBefore }, 'unjournaled-change');
    } else if (cursorBefore !== last.cursor) {
      append(JSON.stringify({ k: 'rng', game, t: now(), cursor: cursorBefore }));
      last.cursor = cursorBefore;
    }

    const ok = !result.error;
    const stateAfter = ok ? result.state : stateBefore;
    n += 1;
    last = { state: stateAfter, sv: stateAfter.stateVersion, cursor: cursorAfter };
    const record = {
      k: 'cmd',
      game,
      n,
      t: now(),
      playerId,
      cmd,
      before: { sv: stateBefore.stateVersion, cursor: cursorBefore },
      ok,
      error: result.error ?? null,
      reason: result.reason ?? null,
      after: { sv: stateAfter.stateVersion, cursor: cursorAfter, hash: hash(stateAfter) },
      events: ok ? (result.events ?? []) : [],
      choice: choiceSummary(result.pendingChoice),
      ms: Math.round(ms * 100) / 100,
    };
    let line = JSON.stringify(record);
    if (overBudget(line)) {
      line = JSON.stringify({ ...record, cmd: { type: cmd?.type, _truncated: true }, events: [] });
      current().complete = false;
    }
    append(line);

    if (ok) pushRing(stateAfter.stateVersion, stateAfter);

    log[ok ? 'debug' : 'info'](
      'engine',
      ok ? 'applied' : 'rejected',
      {
        type: cmd?.type ?? null,
        playerId,
        n,
        game,
        ms: record.ms,
        events: (result.events ?? []).map((e) => e?.type),
        error: result.error ?? null,
        reason: result.reason ?? null,
      },
      { room: roomId, seat: playerId, sv: stateAfter.stateVersion, cs: clientSeqOf(cmd) }
    );
  }

  function refused({ cmd, playerId = null, error, reason = null }) {
    guarded(() => {
      const dedupe = error === 'dedupe';
      log[dedupe ? 'debug' : 'info'](
        'cmd',
        dedupe ? 'dedupe' : 'refused',
        { type: cmd?.type ?? null, playerId, error, reason },
        { room: roomId, seat: playerId ?? undefined, cs: clientSeqOf(cmd) }
      );
    });
  }

  function stats() {
    const records = games.reduce((sum, g) => sum + g.records.length, 0);
    const bytes = games.reduce((sum, g) => sum + g.bytes, 0);
    return { games: games.length, records, bytes, complete: games.every((g) => g.complete) };
  }

  return {
    rebase,
    command,
    refused,
    states: () => [...ring],
    games: () => games.map((g) => ({ game: g.game, records: [...g.records] })),
    stats,
  };
}
