import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cacheControlFor,
  IMMUTABLE_CACHE_CONTROL,
  REVALIDATE_CACHE_CONTROL,
  SFX_CACHE_CONTROL,
  staticFileCacheControl,
  UNCACHED_CACHE_CONTROL,
} from '../cache-policy.mjs';

test('every page and file starts as revalidate-on-use', () => {
  assert.equal(REVALIDATE_CACHE_CONTROL, 'no-cache');
  for (const path of [
    '/',
    '/deck-builder',
    '/import',
    '/src/front-end.js',
    '/shared/engine/commands.mjs',
    '/src/assets/energy/tokens/fire.png',
    '/src/assets/sfx/manifest.json',
    '/dist/manifest.json',
  ]) {
    assert.equal(cacheControlFor(path), REVALIDATE_CACHE_CONTROL, path);
  }
});

test('a hashed name gets no long-lived header from its path alone, so a 404 for it is never kept', () => {
  assert.equal(cacheControlFor('/dist/app-T74SLMDR.js'), REVALIDATE_CACHE_CONTROL);
  assert.equal(cacheControlFor('/dist/app-4Q5GXMFH.css'), REVALIDATE_CACHE_CONTROL);
  assert.equal(cacheControlFor('/src/assets/sfx/your-turn.0a1b2c3d.ogg'), REVALIDATE_CACHE_CONTROL);
});

test('api answers are never stored', () => {
  assert.equal(UNCACHED_CACHE_CONTROL, 'no-store');
  assert.equal(cacheControlFor('/api/tcgl-foil/config'), UNCACHED_CACHE_CONTROL);
  assert.equal(cacheControlFor('/api/custom-sets'), UNCACHED_CACHE_CONTROL);
});

test('a missing path falls back to revalidation', () => {
  assert.equal(cacheControlFor(undefined), REVALIDATE_CACHE_CONTROL);
  assert.equal(cacheControlFor(null), REVALIDATE_CACHE_CONTROL);
  assert.equal(staticFileCacheControl(undefined), null);
});

test('a hashed bundle file being sent is kept for a year without revalidation', () => {
  assert.equal(IMMUTABLE_CACHE_CONTROL, 'public, max-age=31536000, immutable');
  assert.equal(staticFileCacheControl('/dist/app-T74SLMDR.js'), IMMUTABLE_CACHE_CONTROL);
  assert.equal(staticFileCacheControl('/dist/app-4Q5GXMFH.css'), IMMUTABLE_CACHE_CONTROL);
  assert.equal(staticFileCacheControl('/dist/app-T74SLMDR.js.map'), IMMUTABLE_CACHE_CONTROL);
});

test('a hashed sfx file being sent is kept for a day', () => {
  assert.equal(staticFileCacheControl('/src/assets/sfx/your-turn.0a1b2c3d.ogg'), SFX_CACHE_CONTROL);
  assert.equal(staticFileCacheControl('/src/assets/sfx/coin-toss-metal-2.ffffffff.ogg'), SFX_CACHE_CONTROL);
});

test('unhashed names and hashed names in other folders keep the default', () => {
  for (const path of [
    // The manifest names the current hashed files, so it must never be served stale.
    '/dist/manifest.json',
    '/dist/app.js',
    '/other/app-T74SLMDR.js',
    '/src/assets/sfx/manifest.json',
    '/src/assets/sfx/your-turn.ogg',
    '/other/x.0a1b2c3d.ogg',
    '/src/front-end.js',
    '/shared/engine/commands.mjs',
  ]) {
    assert.equal(staticFileCacheControl(path), null, path);
  }
});
