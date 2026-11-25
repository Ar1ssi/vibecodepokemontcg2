// One owner for a coin's face art: the mat slot and the flip ceremony both read thumb, then url,
// then fall back to the coin back (a catalog coin that carries only `url` used to get art on the
// ceremony and the coin back on the mat).
import test from 'node:test';
import assert from 'node:assert/strict';

const { coinFaceArtUrl, escapeHtml } = await import('../coin-flip-ceremony.js');
const { COIN_BACK_URL } = await import('../../deck-builder/core/coin-effects.mjs');

test('coinFaceArtUrl prefers thumb, then url, then the coin back', () => {
  assert.equal(coinFaceArtUrl({ thumb: 'src/assets/coins/a.png', url: 'src/assets/coins/b.png' }), '/src/assets/coins/a.png');
  assert.equal(coinFaceArtUrl({ url: 'src/assets/coins/b.png' }), '/src/assets/coins/b.png');
  assert.equal(coinFaceArtUrl({}), COIN_BACK_URL);
  assert.equal(coinFaceArtUrl(null), COIN_BACK_URL);
});

test('escapeHtml escapes the five markup characters', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});
