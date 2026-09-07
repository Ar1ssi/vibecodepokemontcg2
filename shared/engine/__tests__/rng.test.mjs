import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../rng.mjs';

test('createRng is deterministic: same seed produces identical sequences', () => {
  const rng1 = createRng(123456);
  const rng2 = createRng(123456);

  const seq1 = Array.from({ length: 10 }, () => rng1.next());
  const seq2 = Array.from({ length: 10 }, () => rng2.next());

  assert.deepEqual(seq1, seq2);
});

test('createRng: different seeds produce different sequences', () => {
  const rng1 = createRng(123456);
  const rng2 = createRng(654321);

  const val1 = rng1.next();
  const val2 = rng2.next();

  assert.notEqual(val1, val2);
});

test('createRng string seeds produce deterministic outputs', () => {
  const rngA = createRng('game-room-alpha');
  const rngB = createRng('game-room-alpha');

  assert.equal(rngA.next(), rngB.next());
  assert.equal(rngA.int(50), rngB.int(50));
});

test('rng.int(n) generates values strictly within [0, n - 1]', () => {
  const rng = createRng(999);
  for (let i = 0; i < 100; i++) {
    const val = rng.int(6);
    assert.ok(Number.isInteger(val));
    assert.ok(val >= 0 && val < 6);
  }

  assert.equal(rng.int(1), 0);
  assert.equal(rng.int(0), 0);
  assert.equal(rng.int(-5), 0);
});

test('rng.shuffle returns a new array and does not mutate the source', () => {
  const rng = createRng(42);
  const original = [1, 2, 3, 4, 5, 6, 7, 8];
  const copy = [...original];

  const shuffled = rng.shuffle(original);

  assert.deepEqual(original, copy); // Unmutated
  assert.notEqual(shuffled, original); // New array
  assert.equal(shuffled.length, original.length);
  assert.deepEqual([...shuffled].sort((a, b) => a - b), copy);
});

test('rng.cursor accurately tracks random draws', () => {
  const rng = createRng(777);
  assert.equal(rng.cursor, 0);

  rng.next();
  assert.equal(rng.cursor, 1);

  rng.int(10);
  assert.equal(rng.cursor, 2);

  const arr = [10, 20, 30, 40];
  rng.shuffle(arr); // shuffles 4 elements: 3 swaps -> 3 draws
  assert.equal(rng.cursor, 5);
});

test('rng.advance reproduces skipping to the same cursor point', () => {
  const rngDirect = createRng(888);
  for (let i = 0; i < 50; i++) {
    rngDirect.next();
  }
  const directValue = rngDirect.next();

  const rngSkipped = createRng(888, 50);
  assert.equal(rngSkipped.cursor, 50);
  const skippedValue = rngSkipped.next();

  assert.equal(skippedValue, directValue);
});
