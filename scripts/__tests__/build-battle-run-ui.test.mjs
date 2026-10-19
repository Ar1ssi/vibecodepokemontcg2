import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RUN_UI_ASSETS, RUN_UI_ASSET_DIR } from '../build-battle/run-ui-assets.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

test('every sprite the run flow names is vendored and non-empty', () => {
  assert.ok(RUN_UI_ASSETS.length >= 5);
  for (const asset of RUN_UI_ASSETS) {
    const path = join(ROOT, RUN_UI_ASSET_DIR, asset.name);
    assert.ok(existsSync(path), `${asset.name} is missing: run scripts/build-battle/vendor-run-ui.mjs`);
    assert.ok(statSync(path).size > 0, `${asset.name} is empty`);
  }
});

test('the controller and the stylesheet only name vendored sprites', async () => {
  const { readFileSync } = await import('node:fs');
  const vendored = new Set(RUN_UI_ASSETS.map((asset) => asset.name));
  const css = readFileSync(join(ROOT, 'client/src/css/deck-builder-bnb-run.css'), 'utf8');
  const named = [...css.matchAll(/build-battle\/run\/([\w-]+\.webp)/g)].map((match) => match[1]);
  assert.ok(named.length > 0);
  for (const name of named) assert.ok(vendored.has(name), `${name} is not in RUN_UI_ASSETS`);
  const controller = readFileSync(
    join(ROOT, 'client/src/initialization/document-event-listeners/sidebox/native-deck-builder-bnb-run.js'),
    'utf8'
  );
  for (const index of [1, 2, 3]) assert.ok(vendored.has(`carousel-${index}.webp`));
  assert.match(controller, /carousel-\$\{carouselIndex \+ 1\}\.webp/);
});
