import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  customCardIdFromImageUrl,
  customSetCodes,
  fetchCustomSetManifest,
} from '../custom-sets.mjs';
import { ttlForUrl } from '../tcgdex-cache.mjs';
import { extractTcgdexIdFromImageUrl } from '../../engine/rules/legacy-set-ids.mjs';

test('custom image paths map back to card ids; other URLs do not', () => {
  assert.equal(customCardIdFromImageUrl('/src/assets/custom-sets/customhbw/001/high.webp'), 'customhbw-001');
  assert.equal(customCardIdFromImageUrl('http://localhost:4000/src/assets/custom-sets/customhbw/002/low.webp', 'http://localhost:4000'), 'customhbw-002');
  assert.equal(customCardIdFromImageUrl('/src/assets/custom-sets/customhbw/1/high.webp'), null);
  assert.equal(customCardIdFromImageUrl('/src/assets/card-art/sv/sve/001/high.webp'), null);
  assert.equal(customCardIdFromImageUrl('https://assets.tcgdex.net/en/sv/sv01/001/high.webp'), null);
  assert.equal(customCardIdFromImageUrl(''), null);
  assert.equal(customCardIdFromImageUrl(null), null);
});

test('extractTcgdexIdFromImageUrl understands custom set art', () => {
  assert.equal(extractTcgdexIdFromImageUrl('/src/assets/custom-sets/customhbw/001/high.webp'), 'customhbw-001');
  assert.equal(extractTcgdexIdFromImageUrl('https://assets.tcgdex.net/en/me/me02/024/high.webp'), 'me02-024');
});

test('custom records barely cache in IndexedDB', () => {
  const custom = ttlForUrl('http://localhost:4000/api/tcgdex/v2/en/cards/customhbw-001');
  assert.equal(custom, 60 * 1000);
  assert.equal(ttlForUrl('http://localhost:4000/api/tcgdex/v2/en/sets/customhbw'), custom);
  assert.ok(ttlForUrl('http://localhost:4000/api/tcgdex/v2/en/cards/sv01-001') > custom);
  assert.ok(ttlForUrl('http://localhost:4000/api/tcgdex/v2/en/cards?name=x') > custom);
});

test('customSetCodes keeps only well-formed manifest entries', () => {
  const codes = customSetCodes({
    sets: [
      { id: 'customhbw', code: 'HBW', name: 'Wave 1', cardCount: 2 },
      { id: 'sv01', code: 'SVI', name: 'nope' },
      { id: 'customx2', name: 'no code' },
    ],
  });
  assert.deepEqual(codes, { HBW: 'customhbw' });
  assert.deepEqual(customSetCodes(null), {});
});

test('fetchCustomSetManifest outside a browser resolves to no sets without fetching', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ sets: [{ id: 'customhbw', code: 'HBW', name: 'x', cardCount: 1 }] }) };
  };
  assert.deepEqual(await fetchCustomSetManifest({ fetchImpl, force: true }), { sets: [] });
  assert.equal(calls, 0);
});

test('a fetch that throws synchronously is not remembered as the manifest', async () => {
  const saved = globalThis.location;
  globalThis.location = { origin: 'http://localhost:4000' };
  try {
    const throwing = () => {
      throw new TypeError('fetch is broken');
    };
    assert.deepEqual(await fetchCustomSetManifest({ fetchImpl: throwing, force: true }), { sets: [] });
    const good = async () => ({ ok: true, json: async () => ({ sets: [{ id: 'customhbw', code: 'HBW', name: 'x', cardCount: 1 }] }) });
    assert.deepEqual((await fetchCustomSetManifest({ fetchImpl: good })).sets.map((s) => s.code), ['HBW']);
  } finally {
    if (saved === undefined) delete globalThis.location;
    else globalThis.location = saved;
  }
});

test('custom image URLs on another origin are not our cards', () => {
  assert.equal(customCardIdFromImageUrl('https://evil.example/src/assets/custom-sets/customhbw/001/high.webp', 'http://localhost:4000'), null);
  assert.equal(customCardIdFromImageUrl('http://localhost:4000/src/assets/custom-sets/customhbw/001/high.webp', 'http://localhost:4000'), 'customhbw-001');
  assert.equal(customCardIdFromImageUrl('/src/assets/custom-sets/customhbw/001/high.webp', undefined), 'customhbw-001');
});

test('fetchCustomSetManifest fetches once per page and forgets failures', async () => {
  const origin = 'http://localhost:4000';
  const saved = globalThis.location;
  globalThis.location = { origin };
  try {
    let calls = 0;
    const failing = async () => {
      calls += 1;
      return { ok: false, status: 500 };
    };
    assert.deepEqual(await fetchCustomSetManifest({ fetchImpl: failing, force: true }), { sets: [] });
    const good = async (url) => {
      calls += 1;
      assert.equal(url, `${origin}/api/custom-sets`);
      return { ok: true, json: async () => ({ sets: [{ id: 'customhbw', code: 'HBW', name: 'Wave 1', cardCount: 2, releaseDate: '' }] }) };
    };
    const first = await fetchCustomSetManifest({ fetchImpl: good });
    const second = await fetchCustomSetManifest({ fetchImpl: good });
    assert.deepEqual(first.sets.map((s) => s.code), ['HBW']);
    assert.equal(second, first);
    assert.equal(calls, 2);
  } finally {
    if (saved === undefined) delete globalThis.location;
    else globalThis.location = saved;
  }
});
