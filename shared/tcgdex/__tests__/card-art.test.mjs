import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARD_ART_ROOT, cardArtImageBase, cardArtImageParts, withCardArt } from '../card-art.mjs';
import { extractTcgdexIdFromImageUrl } from '../../engine/rules/legacy-set-ids.mjs';

const CLIENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client');
const OWN_ART_IDS = [
  'bw1-107', 'bw1-108', 'bw1-109', 'bw1-110', 'bw1-111', 'sm3.5-69', 'sm3.5-70',
  ...Array.from({ length: 24 }, (_, i) => `sve-${String(i + 1).padStart(3, '0')}`),
];

test('League-stamped and imageless cards map to a TCGdex-style base under our own art', () => {
  assert.equal(cardArtImageBase('bw1-107'), `${CARD_ART_ROOT}/bw/bw1/107`);
  assert.equal(cardArtImageBase('sm3.5-69'), `${CARD_ART_ROOT}/sm/sm3.5/69`);
  assert.equal(cardArtImageBase('sve-024'), `${CARD_ART_ROOT}/sv/sve/024`);
  assert.equal(cardArtImageBase('bw1-105'), null, 'Grass Energy has no stamp; TCGdex art stays');
  assert.equal(cardArtImageBase(undefined), null);
});

test('every listed card ships its high and low webp', () => {
  for (const id of OWN_ART_IDS) {
    const base = cardArtImageBase(id);
    assert.ok(base, id);
    for (const size of ['high', 'low']) {
      assert.ok(fs.existsSync(path.join(CLIENT_DIR, `${base}/${size}.webp`)), `${id} ${size}.webp`);
    }
  }
});

test('withCardArt swaps only the image of a raw TCGdex record', () => {
  const record = { id: 'bw1-110', name: 'Fighting Energy', image: 'https://assets.tcgdex.net/en/bw/bw1/110' };
  assert.deepEqual(withCardArt(record), { ...record, image: `${CARD_ART_ROOT}/bw/bw1/110` });
  const other = { id: 'bw1-105', image: 'https://assets.tcgdex.net/en/bw/bw1/105' };
  assert.equal(withCardArt(other), other);
});

test('our art URLs still resolve to the TCGdex id, relative or absolute', () => {
  assert.equal(extractTcgdexIdFromImageUrl(`${CARD_ART_ROOT}/sv/sve/001/high.webp`), 'sve-001');
  assert.equal(extractTcgdexIdFromImageUrl(`http://localhost:4000${CARD_ART_ROOT}/sm/sm3.5/70/low.webp`), 'sm3.5-70');
  assert.deepEqual(cardArtImageParts(`${CARD_ART_ROOT}/bw/bw1/111/high.webp`), { series: 'bw', set: 'bw1', number: '111' });
  assert.equal(cardArtImageParts('https://assets.tcgdex.net/en/bw/bw1/111/high.webp'), null);
});
