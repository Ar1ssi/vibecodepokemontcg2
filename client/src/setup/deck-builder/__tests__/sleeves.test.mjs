import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getSleeves,
  getSleeveById,
  filterSleevesByName,
  loadSleeveCatalog,
  ownedFirst,
} from '../core/sleeves.mjs';
import {
  createDeckInLibrary,
  createEmptyLibrary,
  setDeckSleeve,
} from '../core/deck-library.mjs';

await loadSleeveCatalog();

// Sleeve urls are site-rooted (`/src/assets/...`); `client/` is the site root.
const CLIENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

// Width and height of a WebP file: a lossy `VP8 ` image, or a `VP8X` one (alpha) with the canvas size.
const webpSize = (url) => {
  const bytes = fs.readFileSync(path.join(CLIENT_ROOT, url));
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
  assert.equal(chunk, 'VP8X');
  return [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1];
};

test('sleeve catalog: the database dump, with TCG Live scans where TCG Live has the same sleeve', () => {
  const sleeves = getSleeves();
  assert.equal(sleeves.length, 451);

  const ids = new Set();
  for (const sleeve of sleeves) {
    assert.ok(!ids.has(sleeve.id), `duplicate id: ${sleeve.id}`);
    ids.add(sleeve.id);
    assert.ok(sleeve.name && !/[<>�]/.test(sleeve.name), `bad name: ${sleeve.id}`);
    assert.ok(sleeve.category, `missing category: ${sleeve.id}`);
    if (!sleeve.id.startsWith('cs_')) continue;
    assert.equal(sleeve.image, `/src/assets/sleeves/tcgl/full/${sleeve.id}.webp`);
    assert.equal(sleeve.thumb, `/src/assets/sleeves/tcgl/thumb/${sleeve.id}.webp`);
    for (const url of [sleeve.image, sleeve.thumb]) {
      assert.ok(fs.existsSync(path.join(CLIENT_ROOT, url)), `missing file: ${url}`);
    }
  }
  assert.equal(sleeves.filter((sleeve) => sleeve.id.startsWith('cs_')).length, 106);
});

test('every TCG Live sleeve on disk is in the catalog', () => {
  const inCatalog = new Set(getSleeves().map((sleeve) => sleeve.id));
  for (const dir of ['full', 'thumb']) {
    const dirPath = path.join(CLIENT_ROOT, 'src', 'assets', 'sleeves', 'tcgl', dir);
    for (const file of fs.readdirSync(dirPath)) {
      assert.ok(inCatalog.has(file.replace(/\.webp$/, '')), `orphan file: ${dir}/${file}`);
    }
  }
});

test('a database id resolves to the TCG Live sleeve that replaced it', () => {
  assert.equal(getSleeveById('08266b9d-1d37-4ddb-a458-9adc302edb62')?.id, 'cs_charizardxmega_me2_etb');
  assert.equal(getSleeveById('legacy-sleeve')?.id, 'legacy-sleeve');
});

test('sleeve art is the card mesh face: 366x512 full, 183x256 thumb', () => {
  for (const { image, thumb } of getSleeves().filter((sleeve) => sleeve.id.startsWith('cs_')).slice(0, 3)) {
    assert.deepEqual(webpSize(image), [366, 512]);
    assert.deepEqual(webpSize(thumb), [183, 256]);
  }
});

test('coin catalog: all 939 Pokemon coins with data', async () => {
  const {
    COIN_MATERIALS,
    getCoins,
    loadCoinCatalog,
  } = await import('../core/coins.mjs');
  await loadCoinCatalog();
  const coins = getCoins();
  assert.equal(coins.length, 939);

  const ids = new Set();
  for (const coin of coins) {
    assert.ok(coin.id, `missing id: ${coin.name}`);
    assert.ok(coin.name, `missing name: ${coin.id}`);
    assert.ok(coin.url, `bad url: ${coin.id}`);
    assert.ok(coin.thumb, `missing thumb: ${coin.id}`);
    assert.ok(coin.material, `missing material: ${coin.id}`);
    assert.ok(
      COIN_MATERIALS.includes(coin.material),
      `unknown material "${coin.material}": ${coin.id}`
    );
    assert.ok(!/\bdate\b/i.test(coin.release || ''), `unclean release: ${coin.id}`);
    assert.ok(!ids.has(coin.id), `duplicate id: ${coin.id}`);
    ids.add(coin.id);
  }

  assert.equal(ids.size, coins.length);
});

test('sleeve catalog entries are clones', () => {
  const sleeves = getSleeves();
  sleeves[0].name = 'tampered';
  assert.notEqual(getSleeves()[0].name, 'tampered');
});

test('getSleeveById finds and misses', () => {
  const sleeves = getSleeves();
  const found = getSleeveById(sleeves[0].id);
  assert.equal(found?.name, sleeves[0].name);
  assert.equal(getSleeveById('nonexistent'), null);
});

test('filterSleevesByName does substring matching', () => {
  const sleeves = getSleeves();
  const mega = filterSleevesByName(sleeves, 'mega');
  assert.ok(mega.length > 0 && mega.length < sleeves.length);
  assert.ok(mega.every((s) => s.name.toLowerCase().includes('mega')));
  assert.equal(filterSleevesByName(sleeves, '').length, sleeves.length);
});

test('setDeckSleeve persists sleeveId on a deck', () => {
  const { library, deckId } = createDeckInLibrary(createEmptyLibrary(), 'Test Deck');
  const sleeveId = getSleeves()[0].id;

  const updated = setDeckSleeve(library, deckId, sleeveId);
  assert.equal(updated.decks[deckId].sleeveId, sleeveId);
  // original untouched (still null from creation, not the new sleeve)
  assert.equal(library.decks[deckId].sleeveId, null);

  // clear
  const cleared = setDeckSleeve(updated, deckId, null);
  assert.equal(cleared.decks[deckId].sleeveId, null);
});

test('setDeckSleeve ignores unknown decks', () => {
  const { library } = createDeckInLibrary(createEmptyLibrary(), 'A');
  const same = setDeckSleeve(library, 'nope', 'x');
  assert.deepEqual(same, library);
});

test('default card back resolves to the local asset', async () => {
  const {
    DEFAULT_CARD_BACK_PATH,
    resolveDefaultCardBackSrc,
  } = await import('../../deck-constructor/default-card-back.mjs');
  assert.equal(DEFAULT_CARD_BACK_PATH, '/src/assets/cardback.png');
  assert.equal(resolveDefaultCardBackSrc(undefined), '/src/assets/cardback.png');
  assert.equal(
    resolveDefaultCardBackSrc('http://localhost:4000'),
    'http://localhost:4000/src/assets/cardback.png'
  );
});

test('design 057: ownedFirst puts owned sleeves first and keeps each group in catalog order', () => {
  const [a, b, c] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(ownedFirst([a, b, c], ['c']), [c, a, b]);
  assert.deepEqual(ownedFirst([a, b, c], ['c', 'a']), [a, c, b], 'owned keep catalog order');
  assert.deepEqual(ownedFirst([a, b, c], []), [a, b, c]);
  assert.deepEqual(ownedFirst([a, b, c], null), [a, b, c]);
  assert.deepEqual(ownedFirst([a, b, c], ['zz']), [a, b, c], 'unknown ids change nothing');
  const sleeves = getSleeves();
  const etbSleeve = 'cs_charizardxmega_me2_etb';
  const sorted = ownedFirst(sleeves, [etbSleeve]);
  assert.equal(sorted[0].id, etbSleeve);
  assert.equal(sorted.length, sleeves.length);
});
