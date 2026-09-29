import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  THREE_VERSION,
  VENDORED_FILES,
  driftedFiles,
  packageProblem,
} from '../vendor-three.mjs';

const ROOT_MANIFEST = fileURLToPath(
  new URL('../../package.json', import.meta.url)
);

test('package.json pins three to exactly the vendored version', () => {
  const { devDependencies } = JSON.parse(readFileSync(ROOT_MANIFEST, 'utf8'));
  assert.equal(devDependencies.three, THREE_VERSION);
});

test('the installed three package is the pinned one', () => {
  assert.equal(packageProblem(), null);
});

test('the vendored three files are byte-identical to the pinned package', () => {
  assert.deepEqual(driftedFiles(), []);
});

test('a changed or missing vendored file is reported as drift', () => {
  const vendorDir = mkdtempSync(join(tmpdir(), 'vendor-three-'));
  try {
    const packageDir = fileURLToPath(
      new URL('../../node_modules/three', import.meta.url)
    );
    for (const [name, source] of Object.entries(VENDORED_FILES)) {
      writeFileSync(
        join(vendorDir, name),
        readFileSync(join(packageDir, source))
      );
    }
    assert.deepEqual(driftedFiles(packageDir, vendorDir), []);
    writeFileSync(join(vendorDir, 'LICENSE'), 'edited');
    rmSync(join(vendorDir, 'RoomEnvironment.js'));
    assert.deepEqual(driftedFiles(packageDir, vendorDir).sort(), [
      'LICENSE',
      'RoomEnvironment.js',
    ]);
  } finally {
    rmSync(vendorDir, { recursive: true, force: true });
  }
});

test('a missing or wrong-version package is refused', () => {
  const packageDir = mkdtempSync(join(tmpdir(), 'three-pkg-'));
  try {
    assert.match(packageProblem(packageDir), /not installed/);
    writeFileSync(
      join(packageDir, 'package.json'),
      JSON.stringify({ version: '0.186.1' })
    );
    assert.match(
      packageProblem(packageDir),
      /0\.186\.1 is installed; 0\.185\.0 is pinned/
    );
  } finally {
    rmSync(packageDir, { recursive: true, force: true });
  }
});
