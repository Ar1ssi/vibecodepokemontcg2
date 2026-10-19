import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The `/unboxing` test bench (design 073, A4) is a static page the server sends as is: everything it
// names must exist under client/, and three's import map must come before any module script.
const clientDir = fileURLToPath(new URL('../../client/', import.meta.url));
const html = readFileSync(`${clientDir}unboxing.html`, 'utf8');

test('the bench page names files that exist: its styles, its module and vendored three', () => {
  const refs = [...html.matchAll(/(?:href|src)="(\.\/)?(src\/[^"]+)"/g)].map((match) => match[2]);
  const importMap = JSON.parse(html.match(/<script type="importmap">([^<]+)<\/script>/)[1]);
  const three = importMap.imports.three.replace(/^\.\//, '');
  assert.ok(refs.includes('src/unboxing-site/main.js'), 'the bench module');
  for (const path of [...refs, three]) assert.ok(existsSync(`${clientDir}${path}`), path);
});

test('the import map precedes the module script, so `three` resolves', () => {
  const map = html.indexOf('type="importmap"');
  const module = html.indexOf('type="module"');
  assert.ok(map > 0 && module > map);
});

test('the server routes /unboxing to the bench page', () => {
  const server = readFileSync(fileURLToPath(new URL('../server.js', import.meta.url)), 'utf8');
  assert.match(server, /app\.get\('\/unboxing',[\s\S]{0,400}unboxing\.html/);
});
