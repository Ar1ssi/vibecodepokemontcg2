import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dependencyFieldsChanged, planGates } from './gate-plan.mjs';

function assertNeeds(verdict, expectedFile) {
  assert.equal(verdict.needed, true);
  assert.ok(
    verdict.reasons.includes(expectedFile),
    `reasons should name ${expectedFile}`
  );
}

function manifest(fields) {
  return JSON.stringify(
    { name: 'ptcg-sim', version: '1.5.1', ...fields },
    null,
    2
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

test('a lockfile change needs the full suite but not the oracle', () => {
  for (const file of ['pnpm-lock.yaml', 'server/package-lock.json']) {
    const plan = planGates([file]);
    assertNeeds(plan.fullTests, file);
    assert.equal(plan.oracle.needed, false, file);
  }
});

test('a manifest edit that changed no dependency field needs neither gate', () => {
  const plan = planGates(['package.json']);
  assert.equal(plan.fullTests.needed, false);
  assert.equal(plan.oracle.needed, false);
});

test('a manifest whose dependency fields changed needs the full suite only', () => {
  const plan = planGates(['package.json'], {
    manifestsWithDependencyChanges: ['package.json'],
  });
  assertNeeds(plan.fullTests, 'package.json');
  assert.equal(plan.oracle.needed, false);
});

test('a dependency change listed for a file not in the diff is ignored', () => {
  const plan = planGates(['client/src/x.mjs'], {
    manifestsWithDependencyChanges: ['package.json'],
  });
  assert.equal(plan.fullTests.needed, false);
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

test('landing on main needs the full suite when its tree is not verified', () => {
  const plan = planGates(['client/src/setup/rules/card-focus.mjs'], {
    landing: true,
  });
  assert.deepEqual(plan.fullTests.reasons, ['landing on main']);
  assert.equal(plan.oracle.needed, false);
});

test('landing a tree that already passed the full suite skips it', () => {
  const plan = planGates(['client/src/setup/rules/card-focus.mjs'], {
    landing: true,
    headTreeVerified: true,
  });
  assert.equal(plan.fullTests.needed, false);
});

test('a verified tree skips the full suite even for an engine change, but not the oracle', () => {
  const plan = planGates(['shared/engine/reduce.mjs'], {
    landing: true,
    headTreeVerified: true,
  });
  assert.equal(plan.fullTests.needed, false);
  assertNeeds(plan.oracle, 'shared/engine/reduce.mjs');
});

test('landing an unverified engine change needs both gates', () => {
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

test('a script-only manifest edit is not a dependency change', () => {
  const before = manifest({ scripts: { test: 'node --test' } });
  const after = manifest({
    scripts: { test: 'node --test', gates: 'node scripts/gates.mjs' },
  });
  assert.equal(dependencyFieldsChanged(before, after), false);
});

test('identical manifests and name or version edits are not dependency changes', () => {
  const before = manifest({ dependencies: { a: '1.0.0' } });
  assert.equal(dependencyFieldsChanged(before, before), false);
  assert.equal(
    dependencyFieldsChanged(
      before,
      manifest({
        name: 'renamed',
        version: '2.0.0',
        dependencies: { a: '1.0.0' },
      })
    ),
    false
  );
});

test('adding or bumping a dependency is a dependency change', () => {
  const before = manifest({ dependencies: { a: '1.0.0' } });
  assert.equal(
    dependencyFieldsChanged(
      before,
      manifest({ dependencies: { a: '1.0.0', b: '2.0.0' } })
    ),
    true
  );
  assert.equal(
    dependencyFieldsChanged(before, manifest({ dependencies: { a: '1.1.0' } })),
    true
  );
  assert.equal(
    dependencyFieldsChanged(
      manifest({ devDependencies: { c: '1' } }),
      manifest({ devDependencies: { c: '2' } })
    ),
    true
  );
});

test('a pnpm config change is a dependency change', () => {
  const before = manifest({ pnpm: { onlyBuiltDependencies: ['sqlite3'] } });
  const after = manifest({
    pnpm: { onlyBuiltDependencies: ['sqlite3', 'esbuild'] },
  });
  assert.equal(dependencyFieldsChanged(before, after), true);
});

test('a manifest that is deleted or unparseable counts as a dependency change', () => {
  assert.equal(
    dependencyFieldsChanged(manifest({ dependencies: { a: '1' } }), null),
    true
  );
  assert.equal(dependencyFieldsChanged(manifest({}), '{ not json'), true);
});

test('a manifest added without dependencies is not a dependency change', () => {
  assert.equal(dependencyFieldsChanged(null, manifest({ scripts: {} })), false);
});
