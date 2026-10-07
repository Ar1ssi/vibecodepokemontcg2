import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheControlFor, SFX_CACHE_CONTROL } from '../sfx-cache.mjs';

test('hashed sfx files are cacheable', () => {
  assert.equal(cacheControlFor('/src/assets/sfx/your-turn.0a1b2c3d.ogg'), SFX_CACHE_CONTROL);
  assert.equal(cacheControlFor('/src/assets/sfx/coin-toss-metal-2.ffffffff.ogg'), SFX_CACHE_CONTROL);
});

test('the manifest, unhashed names and other assets stay no-store', () => {
  assert.equal(cacheControlFor('/src/assets/sfx/manifest.json'), 'no-store');
  assert.equal(cacheControlFor('/src/assets/sfx/your-turn.ogg'), 'no-store');
  assert.equal(cacheControlFor('/src/assets/energy/tokens/fire.png'), 'no-store');
  assert.equal(cacheControlFor('/other/x.0a1b2c3d.ogg'), 'no-store');
  assert.equal(cacheControlFor(undefined), 'no-store');
});
