import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const engineDir = path.resolve(__dirname, '..');

/**
 * Recursively find all source (.mjs, .js) files in shared/engine, skipping test folders.
 */
function findSourceFiles(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      results = results.concat(findSourceFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.mjs') || entry.name.endsWith('.js'))) {
      results.push(fullPath);
    }
  }
  return results;
}

test('Invariant 6: Math.random is completely banned in shared/engine/', () => {
  const files = findSourceFiles(engineDir);
  assert.ok(files.length > 0, 'Should find engine source files');

  const violations = [];
  const mathRandomRegex = /\bMath\.random\b/;
  for (const file of files) {
    const rawContent = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
    const cleanContent = rawContent.replace(/\/\*[\s\S]*?\*\//g, '');
    const lines = cleanContent.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const stripped = lines[i].replace(/\/\/.*$/, '').trim();
      if (mathRandomRegex.test(stripped)) {
        violations.push({
          file: path.relative(engineDir, file),
          lineNum: i + 1,
          line: stripped,
        });
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Invariant 6 violated: Math.random found in: ${JSON.stringify(violations)}`
  );
});

test('Invariant 8: shared/engine/ imports nothing from client/ or server/', () => {
  const files = findSourceFiles(engineDir);
  const violations = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
    const importLines = content
      .split('\n')
      .filter((line) => line.includes('import') || line.includes('export ... from'));

    for (const line of importLines) {
      if (
        line.includes('/client/') ||
        line.includes('../../client') ||
        line.includes('../client') ||
        line.includes('/server/') ||
        line.includes('../../server') ||
        line.includes('../server')
      ) {
        violations.push({ file: path.relative(engineDir, file), line: line.trim() });
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Invariant 8 violated: client/server imports found in: ${JSON.stringify(violations)}`
  );
});

test('Invariant 8: shared/engine/ has no references to DOM globals (document., window.)', () => {
  const files = findSourceFiles(engineDir);
  const violations = [];
  const domGlobalRegex = /(?<![a-zA-Z0-9_-])(?:window|document)\.[a-zA-Z_$]/;

  for (const file of files) {
    const rawContent = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
    const cleanContent = rawContent.replace(/\/\*[\s\S]*?\*\//g, '');
    const lines = cleanContent.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const stripped = lines[i].replace(/\/\/.*$/, '').trim();
      if (domGlobalRegex.test(stripped)) {
        violations.push({
          file: path.relative(engineDir, file),
          lineNum: i + 1,
          line: stripped,
        });
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Invariant 8 violated: DOM global references found in: ${JSON.stringify(violations)}`
  );
});

test('Invariant 8: localStorage is guarded by typeof check if present', () => {
  const files = findSourceFiles(engineDir);
  const violations = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('localStorage')) {
      // Must include typeof localStorage !== 'undefined'
      if (!content.includes("typeof localStorage !== 'undefined'")) {
        violations.push(path.relative(engineDir, file));
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Unguarded localStorage access found in: ${violations.join(', ')}`
  );
});
