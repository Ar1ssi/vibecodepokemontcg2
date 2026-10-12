import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Each case imports a fresh module instance: the store memoizes its one fetch.
const freshStore = () => import(`../tcgl-foil-store.js?case=${Math.random()}`);

const quietWarn = async (fn) => {
  const warn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);
  try {
    return { value: await fn(), warnings };
  } finally {
    console.warn = warn;
  }
};

describe('loadFoilManifest', () => {
  it('parses the manifest once and exposes it', async () => {
    const store = await freshStore();
    let calls = 0;
    const fetchImpl = async (url) => {
      calls += 1;
      assert.equal(url, '/src/assets/tcgl-foil/manifest.json');
      return { ok: true, json: async () => ({ v: 1, shaders: [], materials: [], cards: {}, flat: ['sv01-1'] }) };
    };
    assert.equal(store.foilManifestNow(), null);
    const parsed = await store.loadFoilManifest(fetchImpl);
    await store.loadFoilManifest(fetchImpl);
    assert.equal(calls, 1);
    assert.ok(parsed.flat.has('sv01-1'));
    assert.equal(store.foilManifestNow(), parsed);
  });

  it('resolves null and warns once on a missing manifest', async () => {
    const store = await freshStore();
    const { value, warnings } = await quietWarn(() =>
      store.loadFoilManifest(async () => ({ ok: false, status: 404 }))
    );
    assert.equal(value, null);
    assert.equal(store.foilManifestNow(), null);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /HTTP 404/);
  });

  it('resolves null on a manifest of another version', async () => {
    const store = await freshStore();
    const { value } = await quietWarn(() =>
      store.loadFoilManifest(async () => ({ ok: true, json: async () => ({ v: 2 }) }))
    );
    assert.equal(value, null);
  });

  it('resolves null when fetch rejects or is unavailable', async () => {
    const store = await freshStore();
    const { value } = await quietWarn(() =>
      store.loadFoilManifest(async () => {
        throw new Error('offline');
      })
    );
    assert.equal(value, null);
    assert.equal(await (await freshStore()).loadFoilManifest(null), null);
  });
});
