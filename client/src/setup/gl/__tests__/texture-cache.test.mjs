import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTextureCacheCore } from '../texture-cache.mjs';

function harness(loadImpl = async (url) => ({ url })) {
  const loads = [];
  const disposed = [];
  const cache = createTextureCacheCore({
    load: (url, options) => {
      loads.push({ url, options });
      return loadImpl(url, options, loads.length);
    },
    dispose: (texture) => disposed.push(texture),
  });
  return { cache, loads, disposed };
}

test('acquiring the same url twice loads it once and shares the texture', async () => {
  const { cache, loads } = harness();
  const [a, b] = await Promise.all([cache.acquire('/a.png'), cache.acquire('/a.png')]);
  assert.equal(loads.length, 1);
  assert.equal(a, b);
  assert.deepEqual(loads[0].options, { colorSpace: 'srgb' });
  assert.equal(cache.size(), 1);
});

test('the texture is disposed once, on the last release', async () => {
  const { cache, disposed } = harness();
  const texture = await cache.acquire('/a.png');
  await cache.acquire('/a.png');
  cache.release('/a.png');
  assert.deepEqual(disposed, []);
  cache.release('/a.png');
  assert.deepEqual(disposed, [texture]);
  assert.equal(cache.size(), 0);
  cache.release('/a.png');
  assert.equal(disposed.length, 1);
});

test('a failed load rejects, evicts the entry, and the next acquire retries', async () => {
  const { cache, loads } = harness(async (url, _options, attempt) => {
    if (attempt === 1) throw new Error('404');
    return { url };
  });
  await assert.rejects(cache.acquire('/a.png'), /404/);
  assert.equal(cache.size(), 0);
  const texture = await cache.acquire('/a.png');
  assert.deepEqual(texture, { url: '/a.png' });
  assert.equal(loads.length, 2);
});

test('a texture released before its load finishes is disposed when it arrives', async () => {
  let finish;
  const { cache, disposed } = harness(() => new Promise((resolve) => (finish = resolve)));
  const pending = cache.acquire('/a.png');
  cache.release('/a.png');
  await Promise.resolve();
  finish({ id: 1 });
  await pending;
  assert.deepEqual(disposed, [{ id: 1 }]);
  assert.equal(cache.size(), 0);
});

test('colour spaces are cached apart and an empty url rejects', async () => {
  const { cache, loads } = harness();
  await cache.acquire('/a.png');
  await cache.acquire('/a.png', { colorSpace: 'linear' });
  assert.equal(loads.length, 2);
  await assert.rejects(cache.acquire(''), TypeError);
});
