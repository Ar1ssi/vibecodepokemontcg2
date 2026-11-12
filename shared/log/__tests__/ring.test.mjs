import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRing } from '../ring.mjs';

const entry = (seq, len = 10) => ({ seq, t: seq, line: 'x'.repeat(len) });

test('byte cap evicts the oldest, never the entry just pushed', () => {
  const ring = createRing({ maxBytes: 100, maxEntries: 1000 });
  for (let seq = 1; seq <= 3; seq++) ring.push(entry(seq, 60));
  assert.equal(ring.size(), 1);
  assert.equal(ring.dropped(), 2);
  assert.equal(ring.firstSeq(), 3);
  assert.equal(ring.bytes(), 60);
});

test('a single oversize entry is kept', () => {
  const ring = createRing({ maxBytes: 10, maxEntries: 5 });
  ring.push(entry(1, 50));
  assert.equal(ring.size(), 1);
  assert.equal(ring.dropped(), 0);
});

test('entry cap, since, toArray, clear', () => {
  const ring = createRing({ maxBytes: 1e6, maxEntries: 3 });
  assert.equal(ring.firstSeq(), null);
  for (let seq = 1; seq <= 5; seq++) ring.push(entry(seq));
  assert.deepEqual(ring.toArray().map((e) => e.seq), [3, 4, 5]);
  assert.deepEqual(ring.since(3).map((e) => e.seq), [4, 5]);
  ring.clear();
  assert.equal(ring.size(), 0);
  assert.equal(ring.bytes(), 0);
  assert.equal(ring.dropped(), 0);
  assert.equal(ring.firstSeq(), null);
});

test('compaction keeps order and counts across many evictions', () => {
  const ring = createRing({ maxBytes: 1e9, maxEntries: 10 });
  for (let seq = 1; seq <= 5000; seq++) ring.push(entry(seq));
  assert.equal(ring.size(), 10);
  assert.equal(ring.dropped(), 4990);
  assert.equal(ring.firstSeq(), 4991);
  assert.equal(ring.bytes(), 100);
  assert.equal(ring.toArray().at(-1).seq, 5000);
});
