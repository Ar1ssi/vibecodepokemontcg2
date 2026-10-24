import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Each case imports a fresh module instance: the store memoizes its one fetch.
const freshStore = () => import(`../tcgl-foil-store.js?case=${Math.random()}`);

const MANIFEST = { v: 1, shaders: [], materials: [], cards: {}, flat: ['sv01-1'] };
const reply = (json) => ({ ok: true, json: async () => json });
/** fetch double answering the config endpoint and the manifest. */
const serving =
  ({ config = { textureBase: 'https://pub-abc.r2.dev/' }, manifest = MANIFEST } = {}) =>
  async (url) => {
    if (url === '/api/tcgl-foil/config') return config ? reply(config) : { ok: false, status: 404 };
    if (url === '/src/assets/tcgl-foil/manifest.json') return manifest ? reply(manifest) : { ok: false, status: 404 };
    throw new Error(`unexpected fetch ${url}`);
  };

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
  it('parses the manifest once and exposes it with the texture base', async () => {
    const store = await freshStore();
    const fetched = [];
    const serve = serving();
    const fetchImpl = (url) => {
      fetched.push(url);
      return serve(url);
    };
    assert.equal(store.foilManifestNow(), null);
    assert.equal(store.foilTextureBase(), null);
    const parsed = await store.loadFoilManifest(fetchImpl);
    await store.loadFoilManifest(fetchImpl);
    assert.deepEqual(fetched.sort(), ['/api/tcgl-foil/config', '/src/assets/tcgl-foil/manifest.json']);
    assert.ok(parsed.flat.has('sv01-1'));
    assert.equal(store.foilManifestNow(), parsed);
    assert.equal(store.foilTextureBase(), 'https://pub-abc.r2.dev');
  });

  it('resolves null when no texture host is configured', async () => {
    for (const config of [{ textureBase: null }, {}, null]) {
      const store = await freshStore();
      const { value, warnings } = await quietWarn(() => store.loadFoilManifest(serving({ config })));
      assert.equal(value, null);
      assert.equal(store.foilManifestNow(), null);
      assert.equal(store.foilTextureBase(), null);
      assert.equal(warnings.length, 1);
    }
  });

  it('resolves null and warns once on a missing manifest', async () => {
    const store = await freshStore();
    const { value, warnings } = await quietWarn(() =>
      store.loadFoilManifest(serving({ manifest: null }))
    );
    assert.equal(value, null);
    assert.equal(store.foilManifestNow(), null);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /HTTP 404/);
  });

  it('resolves null on a manifest of another version', async () => {
    const store = await freshStore();
    const { value } = await quietWarn(() =>
      store.loadFoilManifest(serving({ manifest: { v: 2 } }))
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

describe('custom set foil', () => {
  const ROW = { shader: 'TPCi/Cards3D/HoloFoil/FlatSilver', material: 'MAT_Cards3D_FlatSilver', front: '015-front.webp' };
  const withCustom = (files) => {
    const base = serving({
      config: {
        textureBase: 'https://pub-abc.r2.dev',
        customFoil: Object.keys(files).map((setId) => ({ setId, url: `/src/assets/custom-sets/${setId}/foil.json` })),
      },
    });
    return async (url) => {
      const setId = /custom-sets\/([^/]+)\/foil\.json/.exec(url)?.[1];
      if (!setId) return base(url);
      return files[setId] ? reply(files[setId]) : { ok: false, status: 404 };
    };
  };

  it('merges each custom set named by the config into the manifest as base printings', async () => {
    const store = await freshStore();
    const parsed = await store.loadFoilManifest(withCustom({ customhb: { v: 1, cards: { '015': ROW } } }));
    assert.equal(parsed.records.get('customhb-15').dir, '/src/assets/custom-sets/customhb/foil');
    assert.ok(parsed.flat.has('sv01-1'));
  });

  it('skips a set whose foil.json is missing or malformed and keeps the rest', async () => {
    const store = await freshStore();
    const { value, warnings } = await quietWarn(() =>
      store.loadFoilManifest(
        withCustom({ missing: null, broken: { v: 9, cards: {} }, customhb: { v: 1, cards: { '015': ROW } } })
      )
    );
    assert.deepEqual([...value.records.keys()], ['customhb-15']);
    assert.equal(warnings.length, 2);
  });
});
