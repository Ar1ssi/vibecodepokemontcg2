import { it } from 'node:test';
import assert from 'node:assert/strict';

const freshStore = () => import(`../tcgl-foil-store.js?case=${Math.random()}`);
const reply = (json) => ({ ok: true, json: async () => json });

it('a malformed customFoil entry is skipped without taking the TCG Live foil down', async () => {
  const store = await freshStore();
  const config = { textureBase: 'https://pub-abc.r2.dev/', customFoil: [null, 7, { setId: 'x' }] };
  const manifest = { v: 1, shaders: [], materials: [], cards: {}, flat: ['sv01-1'] };
  const fetchImpl = async (url) => {
    if (url === '/api/tcgl-foil/config') return reply(config);
    if (url === '/src/assets/tcgl-foil/manifest.json') return reply(manifest);
    throw new Error(`unexpected fetch ${url}`);
  };
  const warn = console.warn;
  console.warn = () => {};
  try {
    const parsed = await store.loadFoilManifest(fetchImpl);
    assert.ok(parsed?.flat.has('sv01-1'));
  } finally {
    console.warn = warn;
  }
});
