import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rule = (css, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{[^}]*\\}`))?.[0] ?? '';
};

// Zone rules size the wrapper by one axis only; without an aspect ratio the
// other axis collapses (it has no intrinsic size of its own).
test('base.css: .mat-holo keeps the card aspect ratio', () => {
  const css = read('../../../css/holo/base.css');
  assert.match(rule(css, '.mat-holo'), /aspect-ratio:\s*var\(--card-aspect/);
});

// Inline px sizes outrank every zone rule and are measured in the hand's 1x
// space, then carried into the zoom:2 #playfield (cards doubled in size).
test('hydrate-holo.js: never writes an inline px size on the wrapper', () => {
  const source = read('../../deck-constructor/hydrate-holo.js');
  assert.doesNotMatch(source, /wrapper\.style\.(width|height)\s*=/);
});
