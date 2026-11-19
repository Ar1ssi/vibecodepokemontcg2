import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { fetchSetCards } from '../set-browser.mjs';
import { compareReleaseDateNewestFirst } from '../release-date-order.mjs';

const previousFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = previousFetch;
});

function stubFetch(handlers, requested) {
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    for (const [match, body] of handlers) {
      if (String(url).includes(match)) {
        if (body instanceof Error) return { ok: false, status: 500, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => body };
      }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

const SET_RECORD = {
  id: 'dsl1',
  name: 'Deslop Set',
  releaseDate: '2024-01-01',
  cards: [{ id: 'dsl1-001', name: 'Basic Grass Energy', localId: '001', image: 'https://x/dsl1/001' }],
};

describe('set browser category lists', () => {
  it('requests /cards?category=Energy once however many callers read it, and retries after a failure', async () => {
    const requested = [];
    const countEnergy = () => requested.filter((url) => url.includes('category=Energy')).length;

    stubFetch(
      [
        ['category=Energy', new Error('down')],
        ['category=Trainer', []],
        ['/sets/dsl1', SET_RECORD],
      ],
      requested
    );
    const untagged = await fetchSetCards('dsl1');
    assert.equal(untagged[0].supertype, undefined, 'a failed index leaves the set browsable but untagged');
    assert.equal(countEnergy(), 1);

    stubFetch(
      [
        ['category=Energy', [{ id: 'dsl1-001' }]],
        ['category=Trainer', []],
        ['/sets/dsl1', SET_RECORD],
      ],
      requested
    );
    const tagged = await fetchSetCards('dsl1');
    assert.equal(tagged[0].supertype, 'Energy', 'the rejected request is not cached');
    assert.equal(countEnergy(), 2);

    await fetchSetCards('dsl1');
    assert.equal(countEnergy(), 2, 'the settled list is reused');
  });
});

describe('compareReleaseDateNewestFirst', () => {
  it('orders newer dates first and a missing date last', () => {
    const dates = ['2020-01-01', '', '2024-05-05', undefined, '2022-02-02'];
    assert.deepEqual(
      [...dates].sort(compareReleaseDateNewestFirst),
      ['2024-05-05', '2022-02-02', '2020-01-01', '', undefined]
    );
  });
});
