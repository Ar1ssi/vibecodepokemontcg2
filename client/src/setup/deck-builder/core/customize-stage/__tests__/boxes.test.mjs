import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { boxAtlasUrl, boxById, boxThumbUrl, defaultBox, filterBoxes, stepBoxId } from '../boxes.mjs';

const catalog = {
  default: 'db_default',
  boxes: [
    { id: 'db_a', name: 'Arceus Elite Trainer Box', atlas: 'atlases/db_a.webp', thumb: 'thumbs/db_a.webp' },
    { id: 'db_default', name: 'Poké Ball', atlas: 'atlases/db_default.webp', thumb: 'thumbs/db_default.webp' },
    { id: 'db_z', name: 'Zacian', atlas: 'atlases/db_z.webp', thumb: 'thumbs/db_z.webp' },
  ],
};

test('boxById returns the box, and the default for null, undefined or an unknown id', () => {
  assert.equal(boxById(catalog, 'db_z').name, 'Zacian');
  assert.equal(boxById(catalog, null).id, 'db_default');
  assert.equal(boxById(catalog, undefined).id, 'db_default');
  assert.equal(boxById(catalog, 'db_gone').id, 'db_default');
});

test('defaultBox falls back to the first box when the catalog names no default', () => {
  assert.equal(defaultBox({ default: 'nope', boxes: catalog.boxes }).id, 'db_a');
});

test('urls point under the deckbox asset directory', () => {
  assert.equal(boxAtlasUrl(catalog.boxes[0]), '/src/assets/deckbox/atlases/db_a.webp');
  assert.equal(boxThumbUrl(catalog.boxes[0]), '/src/assets/deckbox/thumbs/db_a.webp');
});

test('filterBoxes needs every word, ignores case, matches ids, and keeps all for an empty term', () => {
  assert.deepEqual(filterBoxes(catalog.boxes, 'elite arceus').map((box) => box.id), ['db_a']);
  assert.deepEqual(filterBoxes(catalog.boxes, 'DB_Z').map((box) => box.id), ['db_z']);
  assert.equal(filterBoxes(catalog.boxes, '   ').length, 3);
  assert.equal(filterBoxes(catalog.boxes).length, 3);
  assert.deepEqual(filterBoxes(catalog.boxes, 'pikachu'), []);
});

test('stepBoxId walks default → boxes → default and wraps; the default is stored as null', () => {
  assert.equal(stepBoxId(catalog, null, 1), 'db_a');
  assert.equal(stepBoxId(catalog, 'db_a', 1), 'db_z');
  assert.equal(stepBoxId(catalog, 'db_z', 1), null);
  assert.equal(stepBoxId(catalog, null, -1), 'db_z');
  assert.equal(stepBoxId(catalog, 'db_a', -1), null);
  assert.equal(stepBoxId(catalog, 'db_gone', 1), 'db_a');
});

test('the committed catalog resolves its own default and steps through every box once', () => {
  const real = JSON.parse(
    fs.readFileSync(new URL('../../../../../assets/deckbox/boxes.json', import.meta.url), 'utf8')
  );
  assert.equal(boxById(real, null).id, real.default);
  const seen = new Set();
  let id = null;
  for (let step = 0; step < real.boxes.length; step += 1) {
    id = stepBoxId(real, id, 1);
    seen.add(id);
  }
  assert.equal(id, null);
  assert.equal(seen.size, real.boxes.length);
});
