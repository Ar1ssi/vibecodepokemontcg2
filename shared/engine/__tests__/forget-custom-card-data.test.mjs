// Live custom sets (design 075): when the server reloads a set, the page forgets its memoized copies of that set's
// cards, so card details and the next game read the new text. TCGdex cards and other custom sets stay cached.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cardDataCache, fetchCardDetail, forgetCustomCardData } from '../rules/rules-state.mjs';

test('forgetCustomCardData drops only the changed custom sets from the detail and enrichment caches', async (t) => {
  const names = { 'customhb-001': 'Tyranitar', 'customhbw-001': 'Larvitar', 'sv01-001': 'Sprigatito' };
  const fetched = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    const id = decodeURIComponent(String(url).split('/cards/')[1]);
    fetched.push(id);
    return { ok: true, status: 200, json: async () => ({ id, name: names[id] }) };
  });

  for (const id of Object.keys(names)) await fetchCardDetail(id);
  for (const id of Object.keys(names)) cardDataCache.set(id, { hp: 100 });
  assert.equal((await fetchCardDetail('customhb-001')).name, 'Tyranitar');
  assert.equal(fetched.length, 3, 'memoized');

  names['customhb-001'] = 'Tyranitar Prime';
  assert.equal(forgetCustomCardData(['customhb', 'sv01', 7, null]), 2, 'one detail and one enrichment entry');
  assert.equal((await fetchCardDetail('customhb-001')).name, 'Tyranitar Prime');
  await fetchCardDetail('customhbw-001');
  await fetchCardDetail('sv01-001');
  assert.deepEqual(fetched.slice(3), ['customhb-001']);
  assert.equal(cardDataCache.has('customhb-001'), false);
  assert.equal(cardDataCache.has('customhbw-001'), true);
  assert.equal(cardDataCache.has('sv01-001'), true);

  assert.equal(forgetCustomCardData(undefined), 0);
  assert.equal(forgetCustomCardData([]), 0);
});
