// Design 004 slice 5 acceptance: the never-crash scaffold never throws and
// always returns a legal option, whatever the scorer does.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decide, legalFallback } from '../bot.mjs';

test('legalFallback prefers the first non-pass/end option', () => {
  const options = [{ kind: 'pass' }, { kind: 'attack', attackIndex: 0 }, { kind: 'retreat', benchIndex: 0 }];
  assert.deepEqual(legalFallback(options), { kind: 'attack', attackIndex: 0 });
});

test('legalFallback falls back to pass/end when nothing else is legal', () => {
  assert.deepEqual(legalFallback([{ kind: 'pass' }]), { kind: 'pass' });
  assert.deepEqual(legalFallback([{ kind: 'end' }]), { kind: 'end' });
});

test('decide returns pass with no thrown error when there are no options', () => {
  assert.deepEqual(decide({ options: [] }, { choose: () => ({ kind: 'attack' }) }), { kind: 'pass' });
  assert.deepEqual(decide({}, null), { kind: 'pass' });
});

test('decide returns the scorer choice when it is a legal option', () => {
  const attack = { kind: 'attack', attackIndex: 0 };
  const observation = { options: [{ kind: 'pass' }, attack] };
  const scorer = { choose: () => attack };
  assert.equal(decide(observation, scorer), attack);
});

test('decide falls back when the scorer throws', () => {
  const observation = { options: [{ kind: 'pass' }, { kind: 'attack', attackIndex: 0 }] };
  const scorer = {
    choose() {
      throw new Error('boom');
    },
  };
  let fallbackReason;
  const result = decide(observation, scorer, { onFallback: (reason) => (fallbackReason = reason) });
  assert.deepEqual(result, { kind: 'attack', attackIndex: 0 });
  assert.equal(fallbackReason, 'scorer-threw');
});

test('decide falls back when the scorer returns null', () => {
  const observation = { options: [{ kind: 'pass' }] };
  const scorer = { choose: () => null };
  assert.deepEqual(decide(observation, scorer), { kind: 'pass' });
});

test('decide falls back when the scorer returns an option not in the list', () => {
  const observation = { options: [{ kind: 'pass' }, { kind: 'attack', attackIndex: 0 }] };
  const scorer = { choose: () => ({ kind: 'attack', attackIndex: 99 }) };
  assert.deepEqual(decide(observation, scorer), { kind: 'attack', attackIndex: 0 });
});

test('decide never throws even when observation is malformed', () => {
  assert.doesNotThrow(() => decide(null, { choose: () => null }));
  assert.doesNotThrow(() => decide(undefined, undefined));
});
