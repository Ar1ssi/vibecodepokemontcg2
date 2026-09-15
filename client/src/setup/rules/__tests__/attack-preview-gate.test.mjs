import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldOpenAttackPreview } from '../attack-preview-gate.js';

test('selectHighlight present -> null (move-to-active flow owns the click, R1)', () => {
  assert.equal(
    shouldOpenAttackPreview({
      zoneId: 'active',
      cardUser: 'self',
      hasSelectHighlight: true,
      hasAbility: false,
      gate: { allowed: true },
    }),
    null
  );
});

test("opponent's active -> null (R2)", () => {
  assert.equal(
    shouldOpenAttackPreview({
      zoneId: 'active',
      cardUser: 'opp',
      hasSelectHighlight: false,
      hasAbility: false,
      gate: { allowed: true },
    }),
    null
  );
});

test('not your turn -> null', () => {
  assert.equal(
    shouldOpenAttackPreview({
      zoneId: 'active',
      cardUser: 'self',
      hasSelectHighlight: false,
      hasAbility: false,
      gate: { allowed: false, reason: "It's not your turn." },
    }),
    null
  );
});

test('own active in main phase -> attack', () => {
  assert.equal(
    shouldOpenAttackPreview({
      zoneId: 'active',
      cardUser: 'self',
      hasSelectHighlight: false,
      hasAbility: false,
      gate: { allowed: true },
    }),
    'attack'
  );
});

test('own bench with an ability -> ability (D6)', () => {
  assert.equal(
    shouldOpenAttackPreview({
      zoneId: 'bench',
      cardUser: 'self',
      hasSelectHighlight: false,
      hasAbility: true,
      gate: { allowed: false },
    }),
    'ability'
  );
});

test('own bench without an ability -> null (E10)', () => {
  assert.equal(
    shouldOpenAttackPreview({
      zoneId: 'bench',
      cardUser: 'self',
      hasSelectHighlight: false,
      hasAbility: false,
      gate: { allowed: true },
    }),
    null
  );
});

test('other zones (hand, discard, etc.) -> null', () => {
  assert.equal(
    shouldOpenAttackPreview({
      zoneId: 'hand',
      cardUser: 'self',
      hasSelectHighlight: false,
      hasAbility: true,
      gate: { allowed: true },
    }),
    null
  );
});
