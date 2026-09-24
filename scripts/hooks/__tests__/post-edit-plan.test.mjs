import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { planPostEditChecks } from '../post-edit-plan.mjs';

const root = path.resolve('/repo');
const at = (...parts) => path.join(root, ...parts);
const existsOnly = (...files) => (candidate) => files.includes(candidate);

test('source file with a sibling __tests__ file lints and runs that test', () => {
  const source = at('shared', 'engine', 'rules', 'retreat.mjs');
  const sibling = at('shared', 'engine', 'rules', '__tests__', 'retreat.test.mjs');
  assert.deepEqual(planPostEditChecks(source, root, existsOnly(sibling)), {
    lint: source,
    tests: [sibling],
  });
});

test('source file without a sibling test only lints', () => {
  const source = at('client', 'src', 'setup', 'netcode', 'apply-view.js');
  assert.deepEqual(planPostEditChecks(source, root, existsOnly()), { lint: source, tests: [] });
});

test('an edited test file runs itself', () => {
  const testFile = at('shared', 'engine', '__tests__', 'reduce.test.mjs');
  assert.deepEqual(planPostEditChecks(testFile, root, existsOnly()), {
    lint: testFile,
    tests: [testFile],
  });
});

test('non-JS files, harness files and paths outside the repo are skipped', () => {
  const none = { lint: null, tests: [] };
  assert.deepEqual(planPostEditChecks(at('client', 'src', 'css', 'index.css'), root, existsOnly()), none);
  assert.deepEqual(planPostEditChecks(at('.agent', 'STATE.md'), root, existsOnly()), none);
  assert.deepEqual(planPostEditChecks(at('.claude', 'hooks', 'x.mjs'), root, existsOnly()), none);
  assert.deepEqual(planPostEditChecks(at('node_modules', 'a', 'b.js'), root, existsOnly()), none);
  assert.deepEqual(planPostEditChecks(path.resolve('/elsewhere/a.mjs'), root, existsOnly()), none);
});

test('missing inputs are skipped', () => {
  const none = { lint: null, tests: [] };
  assert.deepEqual(planPostEditChecks('', root, existsOnly()), none);
  assert.deepEqual(planPostEditChecks(at('a.mjs'), '', existsOnly()), none);
  assert.deepEqual(planPostEditChecks(undefined, root, existsOnly()), none);
});
