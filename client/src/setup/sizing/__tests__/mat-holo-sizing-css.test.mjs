import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rule = (css, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{[^}]*\\}`))?.[0] ?? '';
};

for (const file of ['self-containers.css', 'opp-containers.css']) {
  const css = read(`../../../css/${file}`);

  // A `1fr` row is minmax(auto, 1fr): it grows to the card image's natural
  // height, so prize cards at height:100% overflow the prize zone.
  test(`${file}: #prizes rows cannot grow past the prize zone`, () => {
    assert.match(rule(css, '#prizes'), /grid-template-rows:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  });

  // Holo and plain board cards must resolve to the same height; a height:auto
  // <img> takes its natural size while the holo wrapper has none.
  test(`${file}: #board sizes plain and holo cards by the same height`, () => {
    const imgHeight = rule(css, '#board img').match(/\n\s*height:\s*([^;]+);/)?.[1];
    const holoHeight = rule(css, '#board .mat-holo').match(/\n\s*height:\s*([^;]+);/)?.[1];
    assert.equal(imgHeight, 'calc(100% - 1.5vh)');
    assert.equal(holoHeight, imgHeight);
  });
}

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
