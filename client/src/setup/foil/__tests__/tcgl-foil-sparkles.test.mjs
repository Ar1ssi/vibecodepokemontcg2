import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  SPARKLE_TEXTURES,
  foilSparklesOn,
  onFoilSparklesChanged,
  setFoilSparklesOn,
} from '../tcgl-foil-sparkles.mjs';

test('the sparkle toggle is on by default and notifies only on change', () => {
  assert.equal(foilSparklesOn(), true);
  const seen = [];
  const stop = onFoilSparklesChanged((on) => seen.push(on));
  setFoilSparklesOn(false);
  setFoilSparklesOn(false);
  setFoilSparklesOn(true);
  stop();
  setFoilSparklesOn(false);
  assert.deepEqual(seen, [false, true]);
  setFoilSparklesOn(true);
});

test('every sparkle texture name exists in the game foil materials bundle', () => {
  const materials = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../../assets/tcgl-foil/materials.json', import.meta.url)),
      'utf8'
    )
  ).materials;
  const bound = new Set(
    Object.values(materials).flatMap((m) => Object.values(m.tex ?? {}).map((t) => t?.name))
  );
  for (const name of SPARKLE_TEXTURES) {
    assert.ok(bound.has(name), `${name} is not bound by any foil material`);
  }
});
