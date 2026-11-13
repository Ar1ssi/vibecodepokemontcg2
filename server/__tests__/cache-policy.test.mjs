import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cacheControlFor,
  IMMUTABLE_CACHE_CONTROL,
  REVALIDATE_CACHE_CONTROL,
  SFX_CACHE_CONTROL,
  UNCACHED_CACHE_CONTROL,
} from '../cache-policy.mjs';

test('hashed sfx files are cacheable', () => {
  assert.equal(cacheControlFor('/src/assets/sfx/your-turn.0a1b2c3d.ogg'), SFX_CACHE_CONTROL);
  assert.equal(cacheControlFor('/src/assets/sfx/coin-toss-metal-2.ffffffff.ogg'), SFX_CACHE_CONTROL);
});

test('hashed bundle files are kept for a year without revalidation', () => {
  assert.equal(IMMUTABLE_CACHE_CONTROL, 'public, max-age=31536000, immutable');
  assert.equal(cacheControlFor('/dist/app-T74SLMDR.js'), IMMUTABLE_CACHE_CONTROL);
  assert.equal(cacheControlFor('/dist/app-4Q5GXMFH.css'), IMMUTABLE_CACHE_CONTROL);
  assert.equal(cacheControlFor('/dist/app-T74SLMDR.js.map'), IMMUTABLE_CACHE_CONTROL);
});

test('unhashed names are revalidated on every use, never kept blindly', () => {
  assert.equal(REVALIDATE_CACHE_CONTROL, 'no-cache');
  // The manifest names the current hashed files, so it must never be served stale.
  assert.equal(cacheControlFor('/dist/manifest.json'), REVALIDATE_CACHE_CONTROL);
  assert.equal(cacheControlFor('/dist/app.js'), REVALIDATE_CACHE_CONTROL);
  assert.equal(cacheControlFor('/other/app-T74SLMDR.js'), REVALIDATE_CACHE_CONTROL);
  assert.equal(cacheControlFor('/src/assets/sfx/manifest.json'), REVALIDATE_CACHE_CONTROL);
  assert.equal(cacheControlFor('/src/assets/sfx/your-turn.ogg'), REVALIDATE_CACHE_CONTROL);
  assert.equal(cacheControlFor('/other/x.0a1b2c3d.ogg'), REVALIDATE_CACHE_CONTROL);
  assert.equal(cacheControlFor('/src/assets/energy/tokens/fire.png'), REVALIDATE_CACHE_CONTROL);
  assert.equal(cacheControlFor('/src/front-end.js'), REVALIDATE_CACHE_CONTROL);
  assert.equal(cacheControlFor('/shared/engine/commands.mjs'), REVALIDATE_CACHE_CONTROL);
  assert.equal(cacheControlFor('/'), REVALIDATE_CACHE_CONTROL);
  assert.equal(cacheControlFor('/deck-builder'), REVALIDATE_CACHE_CONTROL);
});

test('api answers are never stored', () => {
  assert.equal(UNCACHED_CACHE_CONTROL, 'no-store');
  assert.equal(cacheControlFor('/api/tcgl-foil/config'), UNCACHED_CACHE_CONTROL);
  assert.equal(cacheControlFor('/api/custom-sets'), UNCACHED_CACHE_CONTROL);
});

test('a missing path falls back to revalidation', () => {
  assert.equal(cacheControlFor(undefined), REVALIDATE_CACHE_CONTROL);
  assert.equal(cacheControlFor(null), REVALIDATE_CACHE_CONTROL);
});
