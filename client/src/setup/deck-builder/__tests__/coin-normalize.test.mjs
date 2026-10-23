import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CATALOG_PATH,
  cleanRelease,
  compactDateStamp,
  inferMaterial,
  normalizeCoins,
  renderCatalog,
} from '../../../../../scripts/normalize-coin-catalog.mjs';

test('cleanRelease strips the scraper date label and collapses whitespace', () => {
  assert.equal(cleanRelease('date\tOctober 20, 1996'), 'October 20, 1996');
  assert.equal(cleanRelease('  date:   May 3, 2006 '), 'May 3, 2006');
  assert.equal(cleanRelease('Golden Energy'), 'Golden Energy');
  assert.equal(cleanRelease(undefined), '');
});

test('compactDateStamp parses month/day/year and month/year', () => {
  assert.equal(compactDateStamp('July 20, 2001'), '20010720');
  assert.equal(compactDateStamp('May 2010'), '201005');
  assert.equal(compactDateStamp(''), '');
  assert.equal(compactDateStamp('sometime'), '');
});

test('inferMaterial trusts explicit material words in the coin text', () => {
  assert.equal(inferMaterial({ name: 'Metal Coin featuring Charizard', material: 'enamel' }), 'metal');
  assert.equal(inferMaterial({ name: 'Cardboard Coin', material: 'silver' }), 'cardboard');
  assert.equal(inferMaterial({ name: 'Silver Holofoil', material: 'silver' }), 'silver');
  assert.equal(inferMaterial({ name: 'Regular', description: 'Metal Coin', material: 'enamel' }), 'metal');
});

test('normalizeCoins dedupes, cleans, reclassifies and makes ids unique', () => {
  const raw = [
    { id: 'A', name: 'One', material: 'enamel', release: 'date\tJuly 20, 2001', releaseDate: 'July 20, 2001' },
    { id: 'A', name: 'Two', material: 'enamel', release: 'date\tJuly 20, 2001', releaseDate: 'July 20, 2001' },
    { id: 'A', name: 'Three', material: 'enamel', release: 'date\tJuly 20, 2001', releaseDate: 'July 20, 2001' },
    { id: 'M', name: 'Metal Coin', material: 'enamel' },
    { id: 'A', name: 'Three', material: 'enamel', release: 'date\tJuly 20, 2001', releaseDate: 'July 20, 2001' },
  ];
  const { coins, report } = normalizeCoins(raw);

  assert.equal(report.dropped, 1, 'the byte-identical copy is dropped');
  assert.equal(coins.length, 4);
  assert.deepEqual([...new Set(coins.map((c) => c.id))].length, 4);
  assert.ok(coins.every((c) => c.material === 'metal' || !c.release || !/^date\b/i.test(c.release)));
  assert.equal(coins.find((c) => c.name === 'Metal Coin').material, 'metal');
  assert.equal(coins[0].release, 'July 20, 2001');
});

test('normalizeCoins is idempotent', () => {
  const raw = [
    { id: 'A', name: 'One', material: 'enamel' },
    { id: 'A', name: 'Two', material: 'enamel' },
  ];
  const first = normalizeCoins(raw).coins;
  const second = normalizeCoins(first).coins;
  assert.deepEqual(second, first);
});

// Design 073: the catalog is a JSON file, so rendering is the whole file, not a block inside a module.
test('renderCatalog writes the catalog file: indent 1, LF-terminated', () => {
  assert.equal(renderCatalog([{ id: 'new', name: 'n' }]), '[\n {\n  "id": "new",\n  "name": "n"\n }\n]\n');
});

test('the committed coin catalog is already normalized and rendered', () => {
  // A core.autocrlf checkout reads the LF file back as CRLF; the committed bytes are LF.
  const source = readFileSync(CATALOG_PATH, 'utf8').replace(/\r\n/g, '\n');
  const { coins, report } = normalizeCoins(JSON.parse(source));
  assert.equal(report.total, 939);
  assert.equal(renderCatalog(coins), source);
});
