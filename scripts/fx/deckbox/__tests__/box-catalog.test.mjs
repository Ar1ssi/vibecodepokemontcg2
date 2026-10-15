import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { importDeckBoxes } from '../import-tcgl-deckbox.mjs';
import {
  DEFAULT_BOX_ID,
  buildBoxCatalog,
  cleanBoxName,
  extractScene,
  humanizeId,
  mirrorMeshZ,
  sceneTextureKeys,
  toThreePose,
} from '../lib/box-catalog.mjs';

const pose = (name, lp, lq, ls) => ({ n: name, lp, lq, ls });

const mat = (key) => ({ c: { mr: { mats: [{ main: key }, { main: key }] } } });

/** The slice of level4 the importer reads: the camera, six slot poses and the three slot objects. */
const level4 = () => ({
  roots: [
    {
      n: 'RendertoTextureCamera',
      c: { cam: { fov: 15 } },
      ch: [
        {
          n: 'CustomizationObjects',
          lp: [0, 0, 5200],
          lq: [-0.1305, 0, 0, 0.9914],
          ch: [
            { n: 'Deck_Box', ch: [{ n: 'Sleeve_Deck_Box', lq: [0, 0.7071, 0.7071, 0], ls: [35, 35, 35], ...mat('t:interior') }, { n: 'Shadow', ...{ c: { mr: { mats: [{ main: 't:sb', cols: { _Color: [0.1, 0.2, 0.3, 0.9] } }] } } } }] },
            { n: 'CardSleeve', ch: [{ n: 'cardModel', lp: [0, 5, 349], ...mat('t:card') }, { n: 'Shadow', c: { mr: { mats: [{ main: 't:sc', cols: { _Color: [0.1, 0.2, 0.3, 0.9] } }] } } }] },
            { n: 'SM_Coin', ch: [{ n: 'Shadow', c: { mr: { mats: [{ main: 't:sn', cols: { _Color: [0.1, 0.2, 0.3, 0.9] } }] } } }] },
          ],
        },
        pose('Deckbox_Grouped', [-200, -500, 130], [0, -0.2588, 0, 0.9659], [2.5, 2.5, 2.5]),
        pose('CardSleeve_Grouped', [290, -500, -240], [-0.588, 0.2053, 0.1576, 0.7663], null),
        pose('Coin_Grouped', [-358, -500, -364], null, [0.9, 0.9, 0.9]),
        pose('Deckbox_Focused', [0, 0, -1640], [0, 0.2164, 0, 0.9763], [1.9, 1.9, 1.9]),
        pose('CardSleeve_Focused', [0, -50, -1640], [-0.6088, 0, 0, 0.7934], null),
        pose('Coin_Focused', [0, 280, -2400], [0, -0.2588, 0, 0.9659], [0.9, 0.9, 0.9]),
      ],
    },
  ],
});

test('cleanBoxName strips rich text, restores the lost dash and collapses spaces', () => {
  assert.equal(
    cleanBoxName('<i>Scarlet & Violet�151</i>  Elite Trainer Box'),
    'Scarlet & Violet—151 Elite Trainer Box'
  );
  assert.equal(cleanBoxName(undefined), '');
});

test('humanizeId drops the db_ prefix and underscores', () => {
  assert.equal(humanizeId('db_151_sv3-5_etb'), '151 sv3-5 etb');
});

test('buildBoxCatalog sorts by name, lowercases ids and names unnamed boxes from the id', () => {
  const catalog = buildBoxCatalog({
    ids: ['DB_Zed_Box', DEFAULT_BOX_ID, 'db_alpha'],
    names: { db_zed_box: 'Zed', db_alpha: '<b>Alpha</b>' },
  });
  assert.equal(catalog.default, DEFAULT_BOX_ID);
  assert.deepEqual(
    catalog.boxes.map((box) => [box.id, box.name]),
    [
      ['db_alpha', 'Alpha'],
      [DEFAULT_BOX_ID, 'pokeball tcgl-default'],
      ['db_zed_box', 'Zed'],
    ]
  );
  assert.equal(catalog.boxes[0].atlas, 'atlases/db_alpha.webp');
  assert.equal(catalog.boxes[0].thumb, 'thumbs/db_alpha.webp');
});

test('buildBoxCatalog refuses an empty list and a list without the default box', () => {
  assert.throws(() => buildBoxCatalog({ ids: [], names: {} }), /no boxes/);
  assert.throws(() => buildBoxCatalog({ ids: ['db_alpha'], names: {} }), /default box/);
});

test('toThreePose mirrors z and fills identity rotation and unit scale', () => {
  assert.deepEqual(toThreePose({ lp: [1, 2, 3], lq: [0.1, 0.2, 0.3, 0.9], ls: [2, 2, 2] }), {
    p: [1, 2, -3],
    q: [-0.1, -0.2, 0.3, 0.9],
    s: [2, 2, 2],
  });
  assert.deepEqual(toThreePose({}), { p: [0, 0, -0], q: [-0, -0, 0, 1], s: [1, 1, 1] });
});

test('extractScene returns grouped and focused poses for every slot in three space', () => {
  const scene = extractScene(level4());
  assert.equal(scene.fov, 15);
  assert.equal(scene.distance, 5200);
  assert.deepEqual(scene.holder.q, [0.1305, -0, 0, 0.9914]);
  assert.deepEqual(scene.slots.box.grouped.p, [-200, -500, -130]);
  assert.deepEqual(scene.slots.coin.focused.p, [0, 280, 2400]);
  assert.deepEqual(scene.slots.coin.grouped.q, [-0, -0, 0, 1]);
  assert.deepEqual(scene.slots.box.shadow.tint, [0.1, 0.2, 0.3, 0.9]);
  assert.deepEqual(scene.slots.sleeve.mesh.p, [0, 5, -349]);
});

test('extractScene names the missing node', () => {
  const broken = level4();
  broken.roots[0].ch = broken.roots[0].ch.filter((node) => node.n !== 'Coin_Focused');
  assert.throws(() => extractScene(broken), /Coin_Focused/);
});

test('sceneTextureKeys reads the interior and the three shadows', () => {
  assert.deepEqual(sceneTextureKeys(level4()), {
    interior: 't:interior',
    'shadow-box': 't:sb',
    'shadow-card': 't:sc',
    'shadow-coin': 't:sn',
  });
});

test('mirrorMeshZ negates every z of positions and normals only', () => {
  const mesh = mirrorMeshZ({ p: [1, 2, 3, 4, 5, 6], n: [0, 0, 1, 0, 1, 0], uv: [0.1, 0.2], i: [0, 1, 0], submeshes: [] });
  assert.deepEqual(mesh.p, [1, 2, -3, 4, 5, -6]);
  assert.deepEqual(mesh.n, [0, 0, -1, 0, 1, -0]);
  assert.deepEqual(mesh.uv, [0.1, 0.2]);
  assert.deepEqual(mesh.i, [0, 1, 0]);
});

test('the importer names the missing file and leaves the output directory alone', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deckbox-import-'));
  try {
    const out = path.join(dir, 'out');
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out, 'keep.txt'), 'x');
    assert.throws(() => importDeckBoxes({ src: path.join(dir, 'no-extract'), out }), /missing source file: .*index\.json/);
    assert.equal(fs.readFileSync(path.join(out, 'keep.txt'), 'utf8'), 'x');
    assert.deepEqual(fs.readdirSync(dir), ['out']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
