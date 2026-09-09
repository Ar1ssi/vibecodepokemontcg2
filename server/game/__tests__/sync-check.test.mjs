import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findFirstDivergentZone,
  excludeOwnerSecretZones,
} from '../sync-check.mjs';

test('findFirstDivergentZone returns null when every zone hash matches', () => {
  const server = { active: 'a1', bench: 'b1', hand: 'h1' };
  const client = { active: 'a1', bench: 'b1', hand: 'h1' };
  assert.equal(findFirstDivergentZone(server, client), null);
});

test('findFirstDivergentZone names the one zone that disagrees', () => {
  const server = { active: 'a1', bench: 'b1', hand: 'h1' };
  const client = { active: 'a1', bench: 'WRONG', hand: 'h1' };
  assert.equal(findFirstDivergentZone(server, client), 'bench');
});

test('findFirstDivergentZone returns the alphabetically-first mismatch when several zones disagree', () => {
  const server = { active: 'a1', bench: 'b1', hand: 'h1' };
  const client = { active: 'WRONG', bench: 'WRONG', hand: 'h1' };
  assert.equal(findFirstDivergentZone(server, client), 'active');
});

test('findFirstDivergentZone treats a missing client zones object as fully divergent', () => {
  const server = { active: 'a1' };
  assert.equal(findFirstDivergentZone(server, undefined), 'active');
  assert.equal(findFirstDivergentZone(server, null), 'active');
});

test('findFirstDivergentZone returns null when there is no server-side state to compare against', () => {
  assert.equal(findFirstDivergentZone(null, { active: 'a1' }), null);
});

// I24: deck is owner-secret even from its own owner (O4-A / I5), so the
// server must not compare it — the client can never legitimately report it.
test('excludeOwnerSecretZones drops deck but keeps every other zone', () => {
  const zones = { active: 'a1', deck: 'd1', hand: 'h1' };
  assert.deepEqual(excludeOwnerSecretZones(zones), {
    active: 'a1',
    hand: 'h1',
  });
});

test('excludeOwnerSecretZones passes through null unchanged', () => {
  assert.equal(excludeOwnerSecretZones(null), null);
});

test('findFirstDivergentZone never reports deck once excludeOwnerSecretZones is applied', () => {
  const server = excludeOwnerSecretZones({ active: 'a1', deck: 'd1' });
  const client = { active: 'a1' }; // client never sends deck at all
  assert.equal(findFirstDivergentZone(server, client), null);
});
