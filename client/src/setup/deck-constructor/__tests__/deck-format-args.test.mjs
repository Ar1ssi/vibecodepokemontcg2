import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFormatAndEmit } from '../deck-format-args.mjs';

test('the format slot carries the deck format and emit follows it', () => {
  assert.deepEqual(resolveFormatAndEmit('build-battle', false), { format: 'build-battle', emit: false });
  assert.deepEqual(resolveFormatAndEmit('tcg', true), { format: 'tcg', emit: true });
});

test('a local call without format or emit loads Standard and emits', () => {
  assert.deepEqual(resolveFormatAndEmit(undefined, undefined), { format: 'tcg', emit: true });
  assert.deepEqual(resolveFormatAndEmit('build-battle'), { format: 'build-battle', emit: true });
});

test('a pre-format packet replays emit in the format slot; it stays emit, not a format', () => {
  assert.deepEqual(resolveFormatAndEmit(false, undefined), { format: 'tcg', emit: false });
  assert.deepEqual(resolveFormatAndEmit(true, undefined), { format: 'tcg', emit: true });
});

test('an unknown format reads as Standard', () => {
  assert.deepEqual(resolveFormatAndEmit('pocket', false), { format: 'tcg', emit: false });
  assert.deepEqual(resolveFormatAndEmit(null, false), { format: 'tcg', emit: false });
});
