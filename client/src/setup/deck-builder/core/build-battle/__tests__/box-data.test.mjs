import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BOX_KINDS, BUILD_BATTLE_BOXES } from '../box-catalog.mjs';
import { hydrateBoxData, hydrateSetCards, loadBoxData, setIdOfCardId } from '../box-data.mjs';

const CORE = dirname(dirname(fileURLToPath(import.meta.url)));
const CLIENT_SRC = join(CORE, '../../../..');
const MAX_MODULE_BYTES = 60 * 1024;

const SET = { id: 'x1', name: 'Example', series: 'ex', official: 2 };
const setModule = {
  SET,
  default: [
    { id: 'x1-1', name: 'One', supertype: 'Pokémon', localId: '1', rarity: 'Common', category: 'Pokemon', stage: 'Basic', types: ['Fire'], hp: 60 },
    {
      id: 'x1tg-TG01',
      name: 'Gallery',
      supertype: 'Pokémon',
      localId: 'TG01',
      rarity: 'Rare',
      category: 'Pokemon',
      stage: 'Basic',
      types: ['Water'],
      hp: 70,
      subset: 'tg',
      images: { small: 'https://images.pokemontcg.io/x1tg/TG01.png', large: 'https://images.pokemontcg.io/x1tg/TG01_hires.png' },
    },
  ],
};

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : listFiles(path);
    return /\.(mjs|js)$/.test(entry.name) ? [path] : [];
  });
}

test('row 20: every catalog box has a set and a box module, each at most 60 KB', () => {
  for (const box of BUILD_BATTLE_BOXES) {
    for (const path of [join(CORE, 'sets', `${box.setId}.generated.mjs`), join(CORE, 'boxes', `${box.key}.generated.mjs`)]) {
      const { size } = statSync(path);
      assert.ok(size <= MAX_MODULE_BYTES, `${relative(CORE, path)}: ${size} bytes`);
    }
  }
});

test('row 20: only box-data.mjs names the generated modules, and only through import()', () => {
  const offenders = listFiles(CLIENT_SRC).filter((path) => {
    if (path.endsWith('box-data.mjs') || path.includes('__tests__')) return false;
    return /(?:sets|boxes)\/[\w.-]+\.generated\.mjs/.test(readFileSync(path, 'utf8'));
  });
  assert.deepEqual(offenders.map((path) => relative(CLIENT_SRC, path)), []);
  const source = readFileSync(join(CORE, 'box-data.mjs'), 'utf8');
  assert.doesNotMatch(source, /^import .*generated/m);
});

test('hydrateSetCards derives TCGdex art and the set from SET; a row with its own art keeps it', () => {
  const [plain, gallery] = hydrateSetCards({ ...SET, subsets: { x1tg: { name: 'Example Trainer Gallery' } } }, setModule.default);
  assert.deepEqual(plain, {
    id: 'x1-1',
    name: 'One',
    supertype: 'Pokémon',
    localId: '1',
    image: 'https://assets.tcgdex.net/en/ex/x1/1/high.webp',
    images: { small: 'https://assets.tcgdex.net/en/ex/x1/1/low.webp', large: 'https://assets.tcgdex.net/en/ex/x1/1/high.webp' },
    set: { id: 'x1', name: 'Example', releaseDate: '' },
    rarity: 'Common',
    category: 'Pokemon',
    stage: 'Basic',
    types: ['Fire'],
    hp: 60,
  });
  assert.equal(gallery.image, 'https://images.pokemontcg.io/x1tg/TG01_hires.png');
  assert.deepEqual(gallery.set, { id: 'x1tg', name: 'Example Trainer Gallery', releaseDate: '' });
  assert.equal(gallery.subset, 'tg');
  assert.equal(setIdOfCardId('sv10.5b-079'), 'sv10.5b');
  assert.equal(setIdOfCardId('nodash'), '');
});

test('hydrateBoxData turns fixed-deck references into full rows with qty and indexes every card', () => {
  const data = hydrateBoxData({
    kind: 'fixed-decks',
    cards: [{ id: 'a-1', name: 'A' }, { id: 'b-2', name: 'B' }],
    decks: { one: [{ id: 'a-1', qty: 3 }, { id: 'missing', qty: 1 }, { id: 'b-2', qty: 1 }] },
  });
  assert.deepEqual(data.decks.one, [
    { id: 'a-1', name: 'A', qty: 3 },
    { id: 'b-2', name: 'B', qty: 1 },
  ]);
  assert.equal(data.cardsById.get('b-2').name, 'B');
  assert.deepEqual([data.common, data.trainers, data.energySwaps, data.energyNeeds], [[], [], [], {}]);
  assert.equal(hydrateBoxData(undefined).cardsById.size, 0);
});

test('loadBoxData imports the set and box module once per key and hydrates them', async () => {
  const box = BUILD_BATTLE_BOXES[0];
  const calls = [];
  const importer = async (path) => {
    calls.push(path);
    if (path.includes('/sets/')) return { SET: { ...SET, id: box.setId }, default: setModule.default.slice(0, 1) };
    return { default: { kind: box.kind, cards: [], decks: {} } };
  };
  const first = await loadBoxData(box.key, { importer });
  const second = await loadBoxData(box.key, { importer });
  assert.equal(first, second);
  assert.deepEqual(calls, [`./sets/${box.setId}.generated.mjs`, `./boxes/${box.key}.generated.mjs`]);
  assert.equal(first.box, box);
  assert.equal(first.cards[0].image, 'https://assets.tcgdex.net/en/ex/x1/1/high.webp', 'art follows the card id');
});

test('row 5: an unknown key, a failed import or a malformed module rejects, and a retry imports again', async () => {
  await assert.rejects(loadBoxData('nope'), /unknown box/);
  const box = BUILD_BATTLE_BOXES[0];
  const otherKind = BOX_KINDS.find((kind) => kind !== box.kind);
  let attempts = 0;
  const flaky = async (path) => {
    attempts += 1;
    if (attempts <= 2) throw new TypeError(`Failed to fetch dynamically imported module: ${path}`);
    if (path.includes('/sets/')) return { SET: { ...SET, id: box.setId }, default: [] };
    return { default: { kind: box.kind, cards: [] } };
  };
  await assert.rejects(loadBoxData(box.key, { importer: flaky }), /Failed to fetch/);
  const retried = await loadBoxData(box.key, { importer: flaky });
  assert.deepEqual(retried.cards, []);
  await assert.rejects(
    loadBoxData(box.key, { importer: async () => ({ SET: { id: 'other' }, default: [] }) }),
    /malformed/
  );
  await assert.rejects(
    loadBoxData(box.key, {
      importer: async (path) =>
        path.includes('/sets/') ? { SET: { ...SET, id: box.setId }, default: [] } : { default: { kind: otherKind } },
    }),
    new RegExp(`holds ${otherKind}, not ${box.kind}`)
  );
});

test('the baked me02 box loads through the real import()', async () => {
  const { cards, setInfo, data } = await loadBoxData('phantasmal-flames');
  assert.equal(setInfo.id, 'me02');
  assert.equal(cards.length, 130);
  assert.deepEqual(Object.keys(data.decks), ['ceruledge', 'zacian', 'flygon', 'toxtricity']);
});
