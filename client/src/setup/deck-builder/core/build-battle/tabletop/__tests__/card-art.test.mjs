import test from 'node:test';
import assert from 'node:assert/strict';

import { CARD_ART_PROXY_PATH, artSources } from '../card-art.mjs';

test('TCGdex art goes through the same-origin proxy first, then straight to the CDN', () => {
  const url = 'https://assets.tcgdex.net/en/me/me02/088/high.webp';
  assert.deepEqual(artSources(url), [`${CARD_ART_PROXY_PATH}?url=${encodeURIComponent(url)}`, url]);
});

test('other hosts, local assets and data URLs load as they are; nothing loads nothing', () => {
  for (const url of [
    'https://limitlesstcg.nyc3.digitaloceanspaces.com/tpci/MEP/MEP_074_R_EN_LG.png',
    'https://images.pokemontcg.io/smp/SM218_hires.png',
    'http://assets.tcgdex.net/en/me/me02/088/high.webp',
    'http://localhost:4100/src/assets/cardback.png',
    'data:image/png;base64,AAAA',
    'src/assets/cardback.png',
  ]) {
    assert.deepEqual(artSources(url), [url], url);
  }
  assert.deepEqual(artSources(''), []);
  assert.deepEqual(artSources(null), []);
});
