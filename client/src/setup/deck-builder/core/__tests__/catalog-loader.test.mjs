import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

import { deferredPicker, loadCatalog, loadedCatalog, whenLoaded } from '../catalog-loader.mjs';
import { DEFAULT_COIN, coinCatalogLoaded, getCoins, loadCoinCatalog } from '../coins.mjs';
import { getStarterDecks, getStarterDeckCatalog, loadStarterDecks } from '../starter-decks.mjs';

// Design 073 § D: the deck-builder catalogs are JSON in client/src/assets/catalogs/, loaded on demand.
const catalogFile = (name) =>
  JSON.parse(readFileSync(new URL(`../../../../assets/catalogs/${name}.json`, import.meta.url), 'utf8'));

test('a catalog loads once: the same promise, then the parsed file in memory', async () => {
  const first = loadCatalog('tcgl-sleeves');
  assert.equal(loadCatalog('tcgl-sleeves'), first);
  const data = await first;
  assert.deepEqual(data, catalogFile('tcgl-sleeves'));
  assert.equal(loadedCatalog('tcgl-sleeves'), data);
});

test('a catalog that fails to load is not cached: the next call tries again', async () => {
  await assert.rejects(loadCatalog('no-such-catalog'));
  assert.equal(loadedCatalog('no-such-catalog'), undefined);
  const again = loadCatalog('no-such-catalog');
  await assert.rejects(again);
});

test('whenLoaded runs at once when the catalog is in, else after it loads, and after a failed load too', async () => {
  const order = [];
  whenLoaded(() => true, () => Promise.reject(new Error('unused')), () => order.push('now'), 'test');
  order.push('after call');
  assert.deepEqual(order, ['now', 'after call']);

  let resolveLoad;
  whenLoaded(() => false, () => new Promise((resolve) => (resolveLoad = resolve)), () => order.push('later'), 'test');
  order.push('waiting');
  resolveLoad();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order.slice(2), ['waiting', 'later']);

  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    whenLoaded(() => false, () => Promise.reject(new Error('offline')), () => order.push('over empty catalogs'), 'test');
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    console.warn = warn;
  }
  assert.equal(order.at(-1), 'over empty catalogs');
  assert.equal(warnings.length, 1);
});

test('a deferred picker answers before its catalog lands and hands the last selection over', async () => {
  let resolveLoad;
  const built = [];
  const real = {
    selected: null,
    setSelected(id) {
      this.selected = id;
      built.push(`set ${id}`);
    },
    getSelected() {
      return this.selected ? { id: this.selected } : null;
    },
    refreshOwned: () => built.push('refresh'),
  };
  const picker = deferredPicker({
    panelEl: new JSDOM('<div></div>').window.document.querySelector('div'),
    load: () => new Promise((resolve) => (resolveLoad = resolve)),
    build: () => {
      built.push('build');
      return real;
    },
    label: 'test',
  });
  picker.setSelected('a');
  picker.setSelected('b');
  picker.refreshOwned();
  assert.equal(picker.getSelected(), null);
  assert.deepEqual(built, []);

  resolveLoad();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(built, ['build', 'set b']);
  assert.deepEqual(picker.getSelected(), { id: 'b' });
  picker.refreshOwned();
  assert.deepEqual(built, ['build', 'set b', 'refresh']);
});

test('a deferred picker whose catalog fails shows a Retry that loads again and builds on success', async () => {
  const panelEl = new JSDOM('<div></div>').window.document.querySelector('div');
  const attempts = [];
  let built = 0;
  const warn = console.warn;
  console.warn = () => {};
  try {
    const picker = deferredPicker({
      panelEl,
      load: () => {
        attempts.push(attempts.length);
        return attempts.length === 1 ? Promise.reject(new Error('offline')) : Promise.resolve();
      },
      build: () => {
        built += 1;
        panelEl.replaceChildren();
        return { setSelected: () => {}, getSelected: () => ({ id: 'x' }), refreshOwned: () => {} };
      },
      label: 'test',
      failureText: 'Sleeves could not be loaded.',
      noteClass: 'native-deck-builder-sleeve-empty',
    });
    await new Promise((resolve) => setImmediate(resolve));
    const note = panelEl.querySelector('[data-catalog-retry]');
    assert.equal(note?.textContent, 'Sleeves could not be loaded. Retry');
    assert.equal(note.className, 'native-deck-builder-sleeve-empty');
    assert.equal(built, 0);
    assert.equal(picker.getSelected(), null);

    note.querySelector('button').click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(attempts.length, 2);
    assert.equal(built, 1);
    assert.equal(panelEl.querySelector('[data-catalog-retry]'), null);
    assert.deepEqual(picker.getSelected(), { id: 'x' });
  } finally {
    console.warn = warn;
  }
});

test('the default flip coin is the coin catalog\'s first entry, without loading it', async () => {
  assert.deepEqual({ ...DEFAULT_COIN }, catalogFile('coins')[0]);
  await loadCoinCatalog();
  assert.equal(coinCatalogLoaded(), true);
  assert.deepEqual(getCoins()[0], { ...DEFAULT_COIN });
});

test('starter decks: the hand-kept lists and the generated ones, keyed by the catalog', async () => {
  await loadStarterDecks();
  const decks = getStarterDecks();
  assert.deepEqual(Object.keys(decks), ['gengar', 'diancie', 'lucario', 'charizard', 'darkrai', 'dragonite', 'greninja']);
  assert.deepEqual(getStarterDeckCatalog().map((entry) => entry.key), Object.keys(decks));
});
