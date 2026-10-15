import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../../../../../../../shared/engine/rng.mjs';
import { loadBoxData } from '../../build-battle/box-data.mjs';
import { openBox } from '../../build-battle/pack-opening.mjs';
import { createSession } from '../../build-battle/build-battle-session.mjs';
import { armMatch, createRun, loadRun, saveRun } from '../run-state.mjs';
import { reportMatchResult } from '../run-reporter.mjs';

const { box, cards, setInfo, data } = await loadBoxData('phantasmal-flames');
const opened = openBox({ box, data, cards, setInfo, rng: createRng(3) });
const session = createSession({ boxKey: box.key, seed: 3, ...opened, now: 1000 });

const storageWith = (run) => {
  const items = new Map();
  const storage = {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
  if (run) saveRun(storage, run);
  return storage;
};

const armedRun = () => armMatch(createRun({ session, now: 5000 }), 6000);

// A game the local player played under a Build & Battle deck, ending at `now`.
const report = (storage, detail, now = 7000, deckFormat = 'build-battle') =>
  reportMatchResult(storage, detail, { now, deckFormat });

test('a won game fills the next node of an armed run', () => {
  const storage = storageWith(armedRun());
  const run = report(storage, { winner: 'p1', isWinner: true });
  assert.deepEqual(run.results, [true]);
  assert.deepEqual(loadRun(storage).results, [true]);
  assert.equal(loadRun(storage).armedAt, null);
});

test('a lost game records a loss', () => {
  const storage = storageWith(armedRun());
  report(storage, { winner: 'p2', isWinner: false, isLoser: true });
  assert.deepEqual(loadRun(storage).results, [false]);
});

test('the same ending reported twice counts once', () => {
  const storage = storageWith(armedRun());
  report(storage, { winner: 'p1', isWinner: true });
  assert.equal(report(storage, { winner: 'p1', isWinner: true }, 7001), null);
  assert.deepEqual(loadRun(storage).results, [true]);
});

test('a game that no Play armed is not recorded', () => {
  const storage = storageWith(createRun({ session, now: 5000 }));
  assert.equal(report(storage, { winner: 'p1', isWinner: true }), null);
  assert.deepEqual(loadRun(storage).results, []);
});

test('a game played with a Standard deck never fills a node', () => {
  const storage = storageWith(armedRun());
  assert.equal(report(storage, { winner: 'p1', isWinner: true }, 7000, 'tcg'), null);
  assert.equal(reportMatchResult(storage, { winner: 'p1', isWinner: true }, { now: 7000 }), null);
  assert.deepEqual(loadRun(storage).results, []);
  assert.equal(typeof loadRun(storage).armedAt, 'number', 'the armed Play is still waiting');
});

test('events without a boolean isWinner or a winner are ignored', () => {
  const storage = storageWith(armedRun());
  assert.equal(report(storage, { reason: 'Deck empty' }), null);
  assert.equal(report(storage, { winner: null, isWinner: false }), null);
  assert.equal(report(storage, { winner: 'p1', isWinner: 'yes' }), null);
  // A spectator, or a seat not yet known: the end screen names a winner but neither side.
  assert.equal(report(storage, { winner: 'p1', isWinner: false, isLoser: false }), null);
  assert.equal(report(storage, undefined), null);
  assert.deepEqual(loadRun(storage).results, []);
});

test('no stored run means nothing to record', () => {
  assert.equal(report(storageWith(null), { winner: 'p1', isWinner: true }), null);
  assert.equal(report(null, { winner: 'p1', isWinner: true }), null);
});
