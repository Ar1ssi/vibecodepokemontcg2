import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../../rng.mjs';
import {
  COIN_FACES,
  flipCoinFace,
  isCoinFace,
  pickCoinCaller,
  resolveStarterPlayerId,
} from '../turn-order-flip.mjs';

/** Rng stub that yields the supplied draws in order, then repeats the last one. */
const rngOf = (...draws) => {
  let i = 0;
  return {
    next() {
      const value = draws[Math.min(i, draws.length - 1)];
      i += 1;
      return value;
    },
  };
};

test('COIN_FACES lists exactly the two legal faces', () => {
  assert.deepEqual(COIN_FACES, ['heads', 'tails']);
});

test('isCoinFace accepts only heads and tails', () => {
  assert.equal(isCoinFace('heads'), true);
  assert.equal(isCoinFace('tails'), true);
  for (const bad of ['HEADS', '', null, undefined, 0, 1, {}, ['heads']]) {
    assert.equal(isCoinFace(bad), false, `expected ${String(bad)} to be rejected`);
  }
});

test('flipCoinFace maps a draw below 0.5 to heads and the rest to tails', () => {
  assert.equal(flipCoinFace(rngOf(0)), 'heads');
  assert.equal(flipCoinFace(rngOf(0.4999)), 'heads');
  assert.equal(flipCoinFace(rngOf(0.5)), 'tails');
  assert.equal(flipCoinFace(rngOf(0.9999)), 'tails');
});

test('flipCoinFace consumes exactly one draw per call', () => {
  const rng = rngOf(0.1, 0.9);
  assert.equal(flipCoinFace(rng), 'heads');
  assert.equal(flipCoinFace(rng), 'tails');
});

test('flipCoinFace survives a missing or malformed rng', () => {
  assert.equal(flipCoinFace(null), 'heads');
  assert.equal(flipCoinFace({}), 'heads');
});

test('flipCoinFace over a seeded rng is deterministic and produces both faces', () => {
  const draw = (seed, count) => {
    const rng = createRng(seed);
    return Array.from({ length: count }, () => flipCoinFace(rng));
  };
  const first = draw('turn-order', 40);
  assert.deepEqual(draw('turn-order', 40), first);
  assert.ok(first.includes('heads') && first.includes('tails'));
});

test('pickCoinCaller picks the low id on a draw below 0.5 and the high id above', () => {
  assert.equal(pickCoinCaller(['p1', 'p2'], rngOf(0.2)), 'p1');
  assert.equal(pickCoinCaller(['p1', 'p2'], rngOf(0.8)), 'p2');
});

test('pickCoinCaller ignores join order — the ids are sorted first', () => {
  assert.equal(pickCoinCaller(['p2', 'p1'], rngOf(0.2)), 'p1');
  assert.equal(pickCoinCaller(['p2', 'p1'], rngOf(0.8)), 'p2');
});

test('pickCoinCaller returns null when fewer than two distinct players', () => {
  assert.equal(pickCoinCaller([], rngOf(0.2)), null);
  assert.equal(pickCoinCaller(['p1'], rngOf(0.2)), null);
  assert.equal(pickCoinCaller(['p1', 'p1'], rngOf(0.2)), null);
  assert.equal(pickCoinCaller(['p1', null, undefined, ''], rngOf(0.2)), null);
  assert.equal(pickCoinCaller(null, rngOf(0.2)), null);
});

test('pickCoinCaller falls back to the low id without a usable rng', () => {
  assert.equal(pickCoinCaller(['p2', 'p1'], null), 'p1');
  assert.equal(pickCoinCaller(['p2', 'p1'], {}), 'p1');
});

test('resolveStarterPlayerId gives the caller the first turn only on a matching face', () => {
  const base = { playerIds: ['p1', 'p2'], callerPlayerId: 'p2' };
  assert.equal(
    resolveStarterPlayerId({ ...base, call: 'heads', result: 'heads' }),
    'p2'
  );
  assert.equal(
    resolveStarterPlayerId({ ...base, call: 'tails', result: 'tails' }),
    'p2'
  );
  assert.equal(
    resolveStarterPlayerId({ ...base, call: 'heads', result: 'tails' }),
    'p1'
  );
  assert.equal(
    resolveStarterPlayerId({ ...base, call: 'tails', result: 'heads' }),
    'p1'
  );
});

test('resolveStarterPlayerId treats an invalid call or result as a caller loss', () => {
  const base = { playerIds: ['p1', 'p2'], callerPlayerId: 'p1' };
  for (const bad of [null, undefined, '', 'HEADS', 0, {}]) {
    assert.equal(
      resolveStarterPlayerId({ ...base, call: bad, result: 'heads' }),
      'p2',
      `expected call ${String(bad)} to lose`
    );
    assert.equal(
      resolveStarterPlayerId({ ...base, call: 'heads', result: bad }),
      'p2',
      `expected result ${String(bad)} to lose`
    );
  }
});

test('resolveStarterPlayerId returns null when it cannot name both players', () => {
  const call = { call: 'heads', result: 'heads' };
  assert.equal(
    resolveStarterPlayerId({ playerIds: ['p1'], callerPlayerId: 'p1', ...call }),
    null
  );
  assert.equal(
    resolveStarterPlayerId({ playerIds: ['p1', 'p2'], callerPlayerId: 'p3', ...call }),
    null
  );
  assert.equal(resolveStarterPlayerId(), null);
});
