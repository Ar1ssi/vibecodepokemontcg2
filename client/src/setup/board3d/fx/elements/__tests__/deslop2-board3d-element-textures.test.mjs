import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createElementTextures, RETRY_AFTER_MS } from '../element-textures.js';

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('a failed texture is not re-requested by every frame, only after the retry delay', async () => {
  let clock = 0;
  const urls = [];
  const textures = createElementTextures({
    three: {},
    load: (url) => {
      urls.push(url);
      return Promise.reject(new Error('HTTP 404'));
    },
    debug: () => {},
    now: () => clock,
  });
  textures.get('missing.webp');
  await settle();
  for (let frame = 0; frame < 5; frame += 1) {
    clock += 16;
    assert.equal(textures.get('missing.webp').ready, false);
  }
  assert.equal(urls.length, 1, 'frames within the delay reuse the failure');
  clock += RETRY_AFTER_MS;
  textures.get('missing.webp');
  assert.equal(urls.length, 2, 'a later ask tries again (design 079 edge 5)');
});
