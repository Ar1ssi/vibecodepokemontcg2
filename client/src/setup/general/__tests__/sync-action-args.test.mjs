import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deckDataEquals,
  flipCoin,
  parseAttackArgs,
  rngFromCoin,
  splitEmitAndTail,
} from '../sync-action-args.mjs';
import { hashBoardSnapshot, hashCardList } from '../../zones/zone-hash.mjs';
import {
  hashResyncKey,
  shouldAnimateDrawFlight,
  shouldRequestHashResync,
} from '../sync-replay.mjs';

test('splitEmitAndTail: local emit boolean stays emit', () => {
  assert.deepEqual(splitEmitAndTail(true), { emit: true, tail: null });
  assert.deepEqual(splitEmitAndTail(false), { emit: false, tail: null });
  assert.deepEqual(splitEmitAndTail(undefined), { emit: true, tail: null });
});

test('splitEmitAndTail: acceptAction (hints, false) does not treat hints as emit', () => {
  const hints = { moving: { name: 'Popplio', syncInstance: 1 } };
  const parsed = splitEmitAndTail(hints, false);
  assert.equal(parsed.emit, false);
  assert.equal(parsed.tail, hints);
});

test('parseAttackArgs: local (emit, index) and acceptAction (index, rng, emit)', () => {
  assert.deepEqual(parseAttackArgs(true, 2), {
    attackIndex: 2,
    rngBundle: {},
    emit: true,
  });
  assert.deepEqual(parseAttackArgs(false), {
    attackIndex: 0,
    rngBundle: {},
    emit: false,
  });
  const rng = { wake: 'heads' };
  assert.deepEqual(parseAttackArgs(1, rng, false), {
    attackIndex: 1,
    rngBundle: rng,
    emit: false,
  });
});

test('rngFromCoin is deterministic for heads and tails', () => {
  assert.equal(rngFromCoin('heads')() < 0.5, true);
  assert.equal(rngFromCoin('tails')() < 0.5, false);
});

test('flipCoin stores and replays the same face', () => {
  const bundle = {};
  const first = flipCoin(bundle, 'attack');
  assert.match(first, /^(heads|tails)$/);
  assert.equal(flipCoin(bundle, 'attack'), first);
});

test('deckDataEquals compares by value not reference', () => {
  const a = [[1, 'Pikachu', 'Pokémon']];
  const b = [[1, 'Pikachu', 'Pokémon']];
  assert.equal(deckDataEquals(a, b), true);
  assert.equal(deckDataEquals(a, [[1, 'Raichu', 'Pokémon']]), false);
  assert.equal(deckDataEquals(null, null), true);
});

test('zone hash is order-sensitive and identity-based', () => {
  const a = hashCardList([
    { name: 'Popplio', syncInstance: 1, number: '37' },
    { name: "Professor's Research", syncInstance: 2 },
  ]);
  const b = hashCardList([
    { name: "Professor's Research", syncInstance: 2 },
    { name: 'Popplio', syncInstance: 1, number: '37' },
  ]);
  assert.notEqual(a, b);
  assert.equal(
    hashBoardSnapshot({
      hand: [{ name: 'Popplio', syncInstance: 1 }],
      active: [],
    }),
    hashBoardSnapshot({
      active: { array: [] },
      hand: { array: [{ name: 'Popplio', syncInstance: 1 }] },
    })
  );
});

test('shouldAnimateDrawFlight: live draw animates, catch-up / syncReplay do not', () => {
  assert.equal(shouldAnimateDrawFlight({}), true);
  assert.equal(shouldAnimateDrawFlight({ syncReplay: false, syncReplaying: false }), true);
  assert.equal(shouldAnimateDrawFlight({ syncReplay: true }), false);
  assert.equal(shouldAnimateDrawFlight({ syncReplaying: true }), false);
  assert.equal(shouldAnimateDrawFlight({ syncReplay: true, syncReplaying: true }), false);
});

test('shouldRequestHashResync: one fullReplay per matching counter pair', () => {
  const first = shouldRequestHashResync(null, 11, 11);
  assert.equal(first.request, true);
  assert.equal(first.key, hashResyncKey(11, 11));
  assert.equal(shouldRequestHashResync(first.key, 11, 11).request, false);
  // A new action advances the pair — allow one more recovery attempt.
  const next = shouldRequestHashResync(first.key, 13, 13);
  assert.equal(next.request, true);
  assert.equal(next.key, '13:13');
  assert.equal(shouldRequestHashResync(next.key, 13, 13).request, false);
});
