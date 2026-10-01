import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchLegalStandardSets, fetchSetCards, BLACK_BOLT_WHITE_FLARE_SET_ID } from '../set-browser.mjs';
import { BLACK_BOLT_WHITE_FLARE_ORDER } from '../black-bolt-white-flare-order.generated.mjs';

let originalFetch;
beforeEach(() => {
  originalFetch = global.fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
});

const card = (setId, localId, name) => ({
  id: `${setId}-${localId}`,
  localId,
  name,
  image: `https://assets.tcgdex.net/en/sv/${setId}/${localId}`,
});

// Ids per TCGdex (2026-10-01): Victini is dex 494, Snivy 495, Tepig 498.
const SETS = {
  'sv10.5b': { id: 'sv10.5b', name: 'Black Bolt', releaseDate: '2025-07-18', cards: [card('sv10.5b', '001', 'Snivy'), card('sv10.5b', '012', 'Victini'), card('sv10.5b', '090', 'Tepig')] },
  'sv10.5w': { id: 'sv10.5w', name: 'White Flare', releaseDate: '2025-07-18', cards: [card('sv10.5w', '001', 'Snivy'), card('sv10.5w', '011', 'Tepig')] },
};

function stubSets() {
  global.fetch = async (url) => {
    const match = /\/sets\/([^/?]+)$/.exec(url);
    const record = match && SETS[match[1]];
    if (!record) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => record };
  };
}

describe('Black Bolt & White Flare (Other tab)', () => {
  it('holds both sets, ordered by the baked Unova dex order', async () => {
    stubSets();
    const ids = (await fetchSetCards(BLACK_BOLT_WHITE_FLARE_SET_ID)).map((c) => c.id);
    const rank = (id) => BLACK_BOLT_WHITE_FLARE_ORDER.indexOf(id);
    assert.equal(ids.length, 5);
    assert.deepEqual(ids, [...ids].sort((a, b) => rank(a) - rank(b)));
    assert.equal(ids[0], 'sv10.5b-012', 'Victini (#494) leads');
  });

  it('bakes every card of both sets, Pokémon by dex first', () => {
    assert.equal(BLACK_BOLT_WHITE_FLARE_ORDER.length, 345);
    assert.equal(new Set(BLACK_BOLT_WHITE_FLARE_ORDER).size, 345);
  });

  it('lists one Other-tab entry with the combined count and local logo', async () => {
    stubSets();
    const sets = await fetchLegalStandardSets();
    const entry = sets.find((s) => s.setId === BLACK_BOLT_WHITE_FLARE_SET_ID);
    assert.equal(entry.category, 'other');
    assert.equal(entry.cardCount, 5);
    assert.match(entry.logo, /black-bolt-white-flare\.jpg$/);
  });
});
