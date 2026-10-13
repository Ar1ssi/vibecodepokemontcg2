import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planGates } from './gate-plan.mjs';

function assertNeeds(verdict, expectedFile) {
  assert.equal(verdict.needed, true);
  assert.ok(
    verdict.reasons.includes(expectedFile),
    `reasons should name ${expectedFile}`
  );
}

test('an empty diff needs neither gate', () => {
  const plan = planGates([]);
  assert.equal(plan.fullTests.needed, false);
  assert.equal(plan.oracle.needed, false);
});

test('client UI, CSS and docs changes need neither gate', () => {
  const plan = planGates([
    'client/src/setup/rules/card-focus.mjs',
    'client/src/setup/rules/css/card-focus.css',
    'docs/guide.md',
  ]);
  assert.equal(plan.fullTests.needed, false);
  assert.equal(plan.oracle.needed, false);
});

test('engine rules change needs the full suite and the oracle', () => {
  const plan = planGates(['shared/engine/rules/attack-engine.mjs']);
  assertNeeds(plan.fullTests, 'shared/engine/rules/attack-engine.mjs');
  assertNeeds(plan.oracle, 'shared/engine/rules/attack-engine.mjs');
});

test('engine test files and __tests__ helpers alone need neither gate', () => {
  const plan = planGates([
    'shared/engine/__tests__/attack-copy.test.mjs',
    'shared/engine/__tests__/helpers.mjs',
  ]);
  assert.equal(plan.fullTests.needed, false);
  assert.equal(plan.oracle.needed, false);
});

test('room and netcode change needs the full suite but not the oracle', () => {
  const plan = planGates(['server/game/room.mjs']);
  assertNeeds(plan.fullTests, 'server/game/room.mjs');
  assert.equal(plan.oracle.needed, false);
});

test('dependency changes need the full suite but not the oracle', () => {
  for (const file of [
    'package.json',
    'pnpm-lock.yaml',
    'server/package-lock.json',
  ]) {
    const plan = planGates([file]);
    assertNeeds(plan.fullTests, file);
    assert.equal(plan.oracle.needed, false, file);
  }
});

test('oracle tooling change needs only the oracle', () => {
  for (const file of [
    'scripts/lib/oracle-gate.mjs',
    'scripts/lib/oracle-harness.mjs',
    'scripts/audit-oracle.mjs',
    'scripts/oracle-baseline.json',
    'scripts/lib/executed-families.mjs',
  ]) {
    const plan = planGates([file]);
    assertNeeds(plan.oracle, file);
    assert.equal(plan.fullTests.needed, false, file);
  }
});

test('an oracle test file does not trigger the oracle', () => {
  const plan = planGates(['scripts/lib/oracle-gate.test.mjs']);
  assert.equal(plan.oracle.needed, false);
});

test('other audit gates are not decided here', () => {
  const plan = planGates(['scripts/lib/attack-behaviour.mjs']);
  assert.equal(plan.fullTests.needed, false);
  assert.equal(plan.oracle.needed, false);
});

test('landing on main always needs the full suite, even for a UI-only diff', () => {
  const plan = planGates(['client/src/setup/rules/card-focus.mjs'], {
    landing: true,
  });
  assert.equal(plan.fullTests.needed, true);
  assert.deepEqual(plan.fullTests.reasons, ['landing on main']);
  assert.equal(plan.oracle.needed, false);
});

test('landing with an engine change needs both gates', () => {
  const plan = planGates(['shared/engine/reduce.mjs'], { landing: true });
  assert.ok(plan.fullTests.reasons.includes('landing on main'));
  assertNeeds(plan.oracle, 'shared/engine/reduce.mjs');
});

test('a mixed diff reports each trigger once, sorted', () => {
  const plan = planGates([
    'server/game/room.mjs',
    'shared/engine/rules/attack-engine.mjs',
    'shared/engine/rules/attack-engine.mjs',
    'client/src/setup/rules/card-focus.mjs',
  ]);
  assert.deepEqual(plan.fullTests.reasons, [
    'server/game/room.mjs',
    'shared/engine/rules/attack-engine.mjs',
  ]);
  assert.deepEqual(plan.oracle.reasons, [
    'shared/engine/rules/attack-engine.mjs',
  ]);
});

test('Windows-style separators are treated as repo paths', () => {
  const plan = planGates(['shared\\engine\\rules\\attack-engine.mjs']);
  assertNeeds(plan.fullTests, 'shared/engine/rules/attack-engine.mjs');
  assertNeeds(plan.oracle, 'shared/engine/rules/attack-engine.mjs');
});
