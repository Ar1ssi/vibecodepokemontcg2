import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Without an explicit row, the bench grid's auto row sizes to content: a
// non-holo <img> at height:100% has no definite height to resolve against,
// so the row (and the card) grows to the image's natural size.
for (const file of ['self-containers.css', 'opp-containers.css']) {
  test(`${file}: #bench pins its grid row to the bench height`, () => {
    const css = readFileSync(new URL(`../../../css/${file}`, import.meta.url), 'utf8');
    const benchRule = css.match(/#bench\s*\{[^}]*\}/)?.[0] ?? '';
    assert.match(benchRule, /grid-template-rows:\s*minmax\(0,\s*100%\)/);
  });
}
