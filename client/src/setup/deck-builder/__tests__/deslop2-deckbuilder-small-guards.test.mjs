import test from 'node:test';
import assert from 'node:assert/strict';

import { LAST_SESSION_STORAGE_KEY, saveLastSession } from '../core/last-session.mjs';
import { matThumbFallbackChain } from '../core/mat-image-urls.mjs';

test('matThumbFallbackChain gives empty urls for a missing mat instead of throwing', () => {
  assert.deepEqual(matThumbFallbackChain(null), { primary: '', fallback: '' });
  assert.deepEqual(matThumbFallbackChain(undefined, 'https://x'), { primary: '', fallback: '' });
});

test('matThumbFallbackChain falls back to the proxied CDN, then the local PNG', () => {
  const mat = { thumb: 'a/thumb.webp', imageUrl: 'https://cdn.artofpkm.com/x.png', image: 'a/x.png' };
  const { primary, fallback } = matThumbFallbackChain(mat);
  assert.match(primary, /thumb\.webp$/);
  assert.match(fallback, /\/api\/mat-image\?url=/);
  const local = matThumbFallbackChain({ thumb: 'a/thumb.webp', image: 'a/x.png' });
  assert.match(local.fallback, /a\/x\.png$/);
});

test('saveLastSession says whether the session was stored', () => {
  const stored = new Map();
  const storage = { setItem: (key, value) => stored.set(key, value) };
  assert.equal(saveLastSession(storage, { deckId: 'd1' }), true);
  assert.ok(stored.has(LAST_SESSION_STORAGE_KEY));
  assert.equal(saveLastSession(storage, {}), false);
  assert.equal(saveLastSession(null, { deckId: 'd1' }), false);
  const full = {
    setItem: () => {
      throw new Error('quota');
    },
  };
  assert.equal(saveLastSession(full, { deckId: 'd1' }), false);
});
