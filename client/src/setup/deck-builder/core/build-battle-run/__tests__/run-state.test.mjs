import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../../../../../../../shared/engine/rng.mjs';
import { loadBoxData } from '../../build-battle/box-data.mjs';
import { openBox } from '../../build-battle/pack-opening.mjs';
import { createSession } from '../../build-battle/build-battle-session.mjs';
import {
  ARMED_TTL_MS,
  RUN_ENDED,
  RUN_IN_PROGRESS,
  RUN_MATCH_COUNT,
  RUN_STORAGE_KEY,
  armMatch,
  clearRun,
  consumeArmedResult,
  createRun,
  forfeitRun,
  loadRun,
  parseRun,
  recordResult,
  runProgress,
  saveRun,
  withSession,
} from '../run-state.mjs';

const { box, cards, setInfo, data } = await loadBoxData('phantasmal-flames');
const opened = openBox({ box, data, cards, setInfo, rng: createRng(7) });
const session = createSession({ boxKey: box.key, seed: 7, ...opened, now: 1000 });
const freshRun = () => createRun({ session, now: 5000 });

const memoryStorage = () => {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
};

const throwingStorage = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
  removeItem() {
    throw new Error('SecurityError');
  },
};

test('a new run is in progress with nothing played or armed', () => {
  const run = freshRun();
  assert.equal(run.status, RUN_IN_PROGRESS);
  assert.deepEqual(run.results, []);
  assert.equal(run.armedAt, null);
  assert.equal(run.endedEarly, false);
  assert.equal(RUN_MATCH_COUNT, 5);
});

test('runProgress marks played nodes, the current node and the upcoming ones', () => {
  let run = freshRun();
  run = recordResult(run, true);
  run = recordResult(run, false);
  const progress = runProgress(run);
  assert.deepEqual(
    progress.nodes.map((node) => node.state),
    ['win', 'loss', 'current', 'upcoming', 'upcoming']
  );
  assert.equal(progress.wins, 1);
  assert.equal(progress.losses, 1);
  assert.equal(progress.played, 2);
  assert.equal(progress.canPlay, true);
});

test('the fifth result ends the run, and nothing is recorded after it', () => {
  let run = freshRun();
  for (const won of [true, true, false, true, false]) run = recordResult(run, won);
  assert.equal(run.status, RUN_ENDED);
  assert.equal(run.endedEarly, false);
  assert.equal(runProgress(run).canPlay, false);
  assert.equal(runProgress(run).nodes.some((node) => node.state === 'current'), false);
  assert.equal(recordResult(run, true), run);
});

test('forfeit ends the run early and keeps the results so far', () => {
  let run = recordResult(recordResult(freshRun(), true), false);
  run = forfeitRun(armMatch(run, 6000));
  assert.equal(run.status, RUN_ENDED);
  assert.equal(run.endedEarly, true);
  assert.deepEqual(run.results, [true, false]);
  assert.equal(run.armedAt, null);
  assert.equal(runProgress(run).finished, true);
  assert.equal(recordResult(run, true), run);
  assert.equal(armMatch(run, 7000), run);
});

test('a result counts only when a Play armed the run', () => {
  const run = freshRun();
  assert.equal(consumeArmedResult(run, true, 6000), null);
  const armed = armMatch(run, 6000);
  const claimed = consumeArmedResult(armed, true, 7000);
  assert.deepEqual(claimed.results, [true]);
  assert.equal(claimed.armedAt, null);
  // The same game's result a second time finds nothing armed.
  assert.equal(consumeArmedResult(claimed, true, 7001), null);
});

test('an armed Play older than the TTL no longer claims a result', () => {
  const armed = armMatch(freshRun(), 6000);
  assert.equal(consumeArmedResult(armed, true, 6000 + ARMED_TTL_MS + 1), null);
  assert.notEqual(consumeArmedResult(armed, true, 6000 + ARMED_TTL_MS), null);
});

test('a result is not claimed after the run ended', () => {
  const armed = armMatch(freshRun(), 6000);
  assert.equal(consumeArmedResult(forfeitRun(armed), true, 6001), null);
});

test('withSession replaces only the box session', () => {
  const run = recordResult(freshRun(), true);
  const next = withSession(run, { ...session, deckId: 'deck-1' });
  assert.equal(next.session.deckId, 'deck-1');
  assert.deepEqual(next.results, [true]);
});

test('a run survives a save/load round trip', () => {
  const storage = memoryStorage();
  const run = armMatch(recordResult(freshRun(), false), 6000);
  assert.equal(saveRun(storage, run), true);
  assert.deepEqual(loadRun(storage), run);
  assert.equal(clearRun(storage), true);
  assert.equal(loadRun(storage), null);
});

test('parseRun refuses malformed or untrustworthy runs', () => {
  const good = JSON.parse(JSON.stringify(freshRun()));
  const bad = (patch) => parseRun(JSON.stringify({ ...good, ...patch }));
  assert.equal(parseRun('{'), null);
  assert.equal(parseRun('null'), null);
  assert.equal(bad({ version: 2 }), null);
  assert.equal(bad({ status: 'done' }), null);
  assert.equal(bad({ results: [true, 'x'] }), null);
  assert.equal(bad({ results: [true, true, true, true, true, true] }), null);
  assert.equal(bad({ endedEarly: 'no' }), null);
  assert.equal(bad({ armedAt: 'soon' }), null);
  assert.equal(bad({ session: null }), null);
  assert.equal(bad({ seed: 8 }), null);
  assert.notEqual(bad({}), null);
});

test('parseRun ends a run that already has every result', () => {
  const stored = { ...freshRun(), results: [true, false, true, true, false], armedAt: 9000 };
  const run = parseRun(JSON.stringify(stored));
  assert.equal(run.status, RUN_ENDED);
  assert.equal(run.armedAt, null);
});

test('a storage that throws keeps the run in memory only', () => {
  assert.equal(saveRun(throwingStorage, freshRun()), false);
  assert.equal(loadRun(throwingStorage), null);
  assert.equal(clearRun(throwingStorage), false);
  assert.equal(saveRun(null, freshRun()), false);
  assert.equal(RUN_STORAGE_KEY, 'ptcg-sim.build-battle-run.v1');
});
