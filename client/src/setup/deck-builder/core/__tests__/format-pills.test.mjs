import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  FORMAT_PILLS,
  FORMAT_PILL_IDS,
  fetchFormatSets,
  fetchSetCards,
  formatLimitedSetId,
} from '../set-browser.mjs';

let originalFetch;
beforeEach(() => {
  originalFetch = global.fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
});

const setIdsOf = (id) => FORMAT_PILLS.find((pill) => pill.id === id).sets.map(([setId]) => setId);

function stubSets(releaseDateOf, missing = []) {
  global.fetch = async (url) => {
    const setId = /\/sets\/([^/?]+)$/.exec(url)?.[1];
    if (!setId || missing.includes(setId)) return { ok: false, status: 404, json: async () => ({}) };
    const cards = setId === 'smp'
      ? ['SM01', 'SM156', 'SM157', 'SM158', 'SM248'].map((localId) => ({ id: `smp-${localId}`, name: localId, localId, image: 'x' }))
      : [{ image: 'x' }];
    const body = { id: setId, name: `Set ${setId}`, releaseDate: releaseDateOf(setId), cards };
    return { ok: true, status: 200, json: async () => body };
  };
}

describe('format pills', () => {
  it('SM-LOT is Sun & Moon through Lost Thunder, minis, SM kits and promos SM01-SM157', () => {
    assert.deepEqual(setIdsOf('sm-lot'), [
      'sm1', 'sm2', 'sm3', 'sm3.5', 'sm4', 'sm5', 'sm6', 'sm7', 'sm7.5', 'sm8', 'smp', 'tk-sm-l', 'tk-sm-r',
    ]);
    assert.equal(FORMAT_PILLS[0].sets.find(([id]) => id === 'smp')[2], 157);
  });

  it('2010 Worlds is Diamond & Pearl through Unleashed, without Undaunted', () => {
    const ids = setIdsOf('2010-worlds');
    assert.equal(ids[0], 'dp1');
    assert.ok(ids.includes('hgss2') && ids.includes('dpp') && ids.includes('pop9') && ids.includes('tk-hs-g'));
    assert.equal(ids.length, 22);
    assert.ok(!ids.includes('hgss3'));
    assert.ok(!ids.includes('hgssp'));
  });

  it('has unique pill ids that cannot collide with the built-in pills', () => {
    assert.equal(new Set(FORMAT_PILL_IDS).size, FORMAT_PILL_IDS.length);
    for (const id of FORMAT_PILL_IDS) {
      assert.ok(!['standard', 'other', 'homebrew', 'custom', 'homebrew-sets'].includes(id));
      assert.ok(!/^gen\d+$/.test(id));
    }
  });

  it('fetchFormatSets lists a format newest first', async () => {
    const order = setIdsOf('sm-lot');
    stubSets((setId) => `2017-01-${String(order.indexOf(setId) + 10)}`);
    const sets = await fetchFormatSets('sm-lot');
    const limitedPromos = formatLimitedSetId('sm-lot', 'smp');
    assert.deepEqual(sets.map((s) => s.setId), [...order].reverse().map((id) => (id === 'smp' ? limitedPromos : id)));
  });

  it('skips a set TCGdex cannot answer and keeps the rest', async () => {
    stubSets(() => '2009-01-01', ['dp3']);
    const sets = await fetchFormatSets('2010-worlds');
    assert.equal(sets.length, 21);
    assert.ok(!sets.some((s) => s.setId === 'dp3'));
  });

  it('cuts the SM promos off at SM157, in the set list and in its cards', async () => {
    stubSets(() => '2017-02-03');
    const promos = (await fetchFormatSets('sm-lot')).find((s) => s.setId === formatLimitedSetId('sm-lot', 'smp'));
    assert.equal(promos.cardCount, 3);
    const cards = await fetchSetCards(promos.setId);
    assert.deepEqual(cards.map((c) => c.localId), ['SM01', 'SM156', 'SM157']);
  });

  it('returns no sets for an unknown format', async () => {
    assert.deepEqual(await fetchFormatSets('nope'), []);
  });
});
