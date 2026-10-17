import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Design 073: the coin catalog is JSON loaded after boot. A flip that names a coin must never wait
// for it (the ceremony's timers, FX holds and the deal start at the call): withCatalogCoin answers
// synchronously, with the catalog coin or with null for the caller's own fallback.
const dom = new JSDOM('<!doctype html>', { url: 'http://localhost/', pretendToBeVisual: true });
// mat-coin.js reaches the page's globals (Image, …) through global-variables.js.
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in globalThis) continue;
  try {
    globalThis[key] = dom.window[key];
  } catch {
    // a read-only global stays Node's own
  }
}
after(() => dom.window.close());
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.io = () => ({ on() {}, off() {}, emit() {} });

const { withCatalogCoin } = await import('../mat-coin.js');
const { coinCatalogLoaded, getCoinById, loadCoinCatalog } = await import('../../deck-builder/core/coins.mjs');

const GENGAR = 'MBG_Purple_Mega_Gengar_Coin';

const playedSync = (coinId, catalog) => {
  let played;
  const returned = withCatalogCoin(coinId, (coin) => {
    played = coin;
    return 'played';
  }, catalog);
  assert.equal(returned, 'played', 'play ran before withCatalogCoin returned');
  return played;
};

test('no coin id plays at once with no named coin', () => {
  assert.equal(playedSync(null), null);
});

test('a loaded catalog: plays at once with the named coin, null for an unknown id', async () => {
  await loadCoinCatalog();
  assert.equal(coinCatalogLoaded(), true);
  assert.deepEqual(playedSync(GENGAR), getCoinById(GENGAR));
  assert.equal(playedSync('cn_absolmega_slvi').name, 'Mega Absol: Silver Ice');
  assert.equal(playedSync('no-such-coin'), null);
});

test('a catalog not loaded yet: plays at once with no named coin and starts the load', async () => {
  let loads = 0;
  const catalog = {
    isLoaded: () => false,
    load: () => {
      loads += 1;
      return new Promise(() => {});
    },
    lookup: () => assert.fail('nothing to look up yet'),
  };
  assert.equal(playedSync(GENGAR, catalog), null);
  assert.equal(loads, 1);
});

test('a failed load: the flip plays with no named coin; after a later load succeeds the coin resolves', async () => {
  let loaded = false;
  let attempt = 0;
  const catalog = {
    isLoaded: () => loaded,
    load: () => {
      attempt += 1;
      if (attempt === 1) return Promise.reject(new Error('offline'));
      loaded = true;
      return Promise.resolve();
    },
    lookup: (id) => (id === GENGAR ? { id, name: 'Mega Gengar' } : null),
  };
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    assert.equal(playedSync(GENGAR, catalog), null, 'first flip: load rejected');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(warnings.length, 1);
    assert.equal(playedSync(GENGAR, catalog), null, 'second flip starts the retry, still unloaded');
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(playedSync(GENGAR, catalog), { id: GENGAR, name: 'Mega Gengar' });
    assert.equal(attempt, 2);
  } finally {
    console.warn = warn;
  }
});
