import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveDeckPacketTail, sanitizeDeckBoxId } from '../deck-box-args.mjs';

test('a 073 packet carries the box id and its own emit', () => {
  assert.deepEqual(resolveDeckPacketTail('tcg', 'db_151_sv3-5_etb', false), {
    format: 'tcg',
    emit: false,
    deckBoxId: 'db_151_sv3-5_etb',
  });
  assert.deepEqual(resolveDeckPacketTail('build-battle', null, false), {
    format: 'build-battle',
    emit: false,
    deckBoxId: null,
  });
});

test('a packet from before 073 has emit in the box slot and no box', () => {
  assert.deepEqual(resolveDeckPacketTail('tcg', false), { format: 'tcg', emit: false, deckBoxId: undefined });
  assert.deepEqual(resolveDeckPacketTail('tcg', true), { format: 'tcg', emit: true, deckBoxId: undefined });
});

test('a packet from before 051 has emit in the format slot', () => {
  assert.deepEqual(resolveDeckPacketTail(false), { format: 'tcg', emit: false, deckBoxId: undefined });
  assert.deepEqual(resolveDeckPacketTail(true, undefined, undefined), {
    format: 'tcg',
    emit: true,
    deckBoxId: undefined,
  });
});

test('a local call that stops after the format emits and names no box', () => {
  assert.deepEqual(resolveDeckPacketTail('tcg'), { format: 'tcg', emit: true, deckBoxId: undefined });
});

test('a malformed box id on the wire reads as the default box', () => {
  assert.equal(resolveDeckPacketTail('tcg', 42, false).deckBoxId, null);
  assert.equal(resolveDeckPacketTail('tcg', '../../etc', false).deckBoxId, null);
  assert.equal(resolveDeckPacketTail('tcg', 'x'.repeat(129), false).deckBoxId, null);
});

test('sanitizeDeckBoxId keeps catalog-shaped ids only', () => {
  assert.equal(sanitizeDeckBoxId('db_pokeball_tcgl-default'), 'db_pokeball_tcgl-default');
  assert.equal(sanitizeDeckBoxId(''), null);
  assert.equal(sanitizeDeckBoxId('a b'), null);
  assert.equal(sanitizeDeckBoxId(undefined), null);
});
