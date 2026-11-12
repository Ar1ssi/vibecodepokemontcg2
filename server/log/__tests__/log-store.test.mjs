import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogStore } from '../log-store.mjs';
import { LIMITS } from '../../../shared/log/log-schema.mjs';

const MIN = 60000;
const entry = (seq, line = 'x'.repeat(100)) => ({ seq, t: seq, lvl: 'info', line });

test('room stream stays within 8 MB and counts dropped', () => {
  const store = createLogStore();
  const line = 'x'.repeat(10000);
  for (let i = 1; i <= 900; i++) store.append('room:r', entry(i, line)); // 9 MB
  const s = store.stream('room:r');
  assert.ok(s.bytes <= 8388608);
  assert.ok(s.dropped > 0);
  assert.equal(s.firstSeq, s.entries()[0].seq);
});

test('stream caps follow the id prefix and ts defaults to t', () => {
  const store = createLogStore({ limits: { ...LIMITS, serverStreamBytes: 250, clientStreamBytes: 450 } });
  for (let i = 1; i <= 10; i++) {
    store.append('server', entry(i));
    store.append('client:c', entry(i));
    store.append('other', entry(i));
  }
  assert.equal(store.stream('server').size, 2);
  assert.equal(store.stream('other').size, 2);
  assert.equal(store.stream('client:c').size, 4);
  assert.equal(store.stream('server').entries()[0].ts, store.stream('server').entries()[0].t);
});

test('missing stream is null', () => {
  assert.equal(createLogStore().stream('nope'), null);
});

test('closed stream is gone after 31 minutes, kept before', () => {
  let t = 1000;
  const store = createLogStore({ now: () => t });
  store.append('room:a', entry(1));
  store.link('c1', 'a', { name: 'x' });
  store.close('room:a');
  t += 29 * MIN;
  assert.deepEqual(store.sweep().expired, []);
  assert.ok(store.stream('room:a'));
  t += 2 * MIN;
  assert.deepEqual(store.sweep().expired, ['room:a']);
  assert.equal(store.stream('room:a'), null);
  assert.deepEqual(store.participants('a'), []);
});

test('close then append reopens the stream', () => {
  const store = createLogStore();
  store.append('room:a', entry(1));
  store.close('room:a');
  assert.notEqual(store.stream('room:a').closedAt, null);
  store.append('room:a', entry(2));
  assert.equal(store.stream('room:a').closedAt, null);
  store.close('room:missing');
});

test('over the total cap the oldest closed stream goes first, before any trim', () => {
  let t = 0;
  const store = createLogStore({ now: () => t, totalBytes: 450 });
  for (const id of ['room:old', 'room:new', 'room:open']) store.append(id, entry(1));
  t = 10;
  store.close('room:old');
  t = 20;
  store.close('room:new');
  store.append('room:open', entry(2));
  store.append('room:open', entry(3)); // 400 bytes total
  const result = store.sweep();
  assert.deepEqual(result.evicted, ['room:old']);
  assert.deepEqual(result.trimmed, []);
  assert.ok(store.stream('room:new'));
  assert.equal(store.stream('room:old'), null);
});

test('still over with no closed stream trims the largest open ring by a quarter', () => {
  const store = createLogStore({ totalBytes: 500 });
  for (let i = 1; i <= 8; i++) store.append('room:big', entry(i));
  store.append('room:small', entry(1));
  const result = store.sweep();
  assert.deepEqual(result.trimmed, ['room:big']);
  const big = store.stream('room:big');
  assert.equal(big.size, 4); // two rounds: 8 -> 6 -> 4, then within the cap
  assert.equal(big.dropped, 4);
  assert.ok(store.stats().bytes <= 500);
});

test('trim stops after 64 rounds and never empties a one-entry stream', () => {
  const store = createLogStore({ totalBytes: 1 });
  store.append('server', entry(1));
  store.append('room:r', entry(1));
  store.sweep();
  assert.equal(store.stream('server').size, 1);
  assert.equal(store.stream('room:r').size, 1);
});

test('setMeta creates and shallow-merges', () => {
  const store = createLogStore();
  store.setMeta('client:a', { x: 1, y: 2 });
  store.setMeta('client:a', { y: 3 });
  assert.deepEqual(store.stream('client:a').meta, { x: 1, y: 3 });
});

test('link, unlink and relink keep one row per client', () => {
  let t = 5;
  const store = createLogStore({ now: () => t });
  store.link('c1', 'r', { seat: 'p1' });
  t = 9;
  store.unlink('c1', 'r');
  assert.deepEqual(store.participants('r'), [{ clientId: 'c1', seat: 'p1', joinedAt: 5, leftAt: 9 }]);
  t = 12;
  store.link('c1', 'r', { name: 'a' });
  assert.deepEqual(store.participants('r'), [{ clientId: 'c1', seat: 'p1', name: 'a', joinedAt: 5, leftAt: null }]);
  store.unlink('ghost', 'r');
  assert.equal(store.participants('none').length, 0);
});

test('stats lists every stream', () => {
  const store = createLogStore();
  store.append('server', entry(1));
  const stats = store.stats();
  assert.equal(stats.streams, 1);
  assert.equal(stats.bytes, 100);
  assert.equal(stats.byStream[0].id, 'server');
});

test('sink receives lines and a throwing sink does not break append', () => {
  const lines = [];
  const store = createLogStore({ sink: { write: (id, line) => lines.push([id, line]) } });
  store.append('server', entry(1, 'a'));
  assert.deepEqual(lines, [['server', 'a']]);
  const bad = createLogStore({ sink: { write: () => { throw new Error('x'); } } });
  bad.append('server', entry(1));
  assert.equal(bad.stream('server').size, 1);
});
