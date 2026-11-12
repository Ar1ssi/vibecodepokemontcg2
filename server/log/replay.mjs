// Pure journal replay (design 087 §4): re-applies recorded commands to a rebase snapshot and
// compares outcomes and state hashes. Engine functions are injected so a CLI can reuse it.
export function replayJournal(records, { applyCommand, createRng, hashState, to = Infinity }) {
  let state = null;
  let seed = null;
  let rng = null;
  let commands = 0;
  let divergence = null;

  for (const record of records) {
    if (record.k === 'rebase') {
      if (!record.state) {
        divergence = { n: null, game: record.game, kind: 'truncated' };
        break;
      }
      state = structuredClone(record.state);
      seed = record.seed;
      rng = createRng(seed, record.cursor);
      continue;
    }
    if (record.k === 'rng') {
      if (state) rng = createRng(seed, record.cursor);
      continue;
    }
    if (record.k !== 'cmd' || !state) continue;

    const { n, game } = record;
    if (record.cmd?._truncated) {
      divergence = { n, game, kind: 'truncated' };
      break;
    }
    if (rng.cursor !== record.before.cursor) rng = createRng(seed, record.before.cursor);
    const result = applyCommand(state, record.cmd, rng);
    if (Boolean(result.error) === record.ok) {
      divergence = { n, game, kind: 'error', expected: record.error, actual: result.error ?? null };
      break;
    }
    if (record.ok) {
      state = result.state;
      const actual = hashState(state);
      if (actual !== record.after.hash) {
        divergence = { n, game, kind: 'hash', expected: record.after.hash, actual };
        break;
      }
    }
    // The hash covers the zones; the rng cursor catches a draw that went differently without
    // moving a card yet.
    if (Number.isInteger(record.after.cursor) && rng.cursor !== record.after.cursor) {
      divergence = { n, game, kind: 'cursor', expected: record.after.cursor, actual: rng.cursor };
      break;
    }
    commands += 1;
    if (record.after.sv >= to) break;
  }

  return { ok: divergence === null, commands, divergence, state };
}
