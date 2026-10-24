import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchSetCards, filterCardsBySupertype } from '../set-browser.mjs';

let originalFetch;
beforeEach(() => {
  originalFetch = global.fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
});

const reply = (body) => ({ ok: true, status: 200, json: async () => body });

describe('fetchSetCards on a custom set', () => {
  it('takes each card\'s supertype from the set record, not the category lists cached before the set existed', async () => {
    const image = '/src/assets/custom-sets/customsupertype';
    global.fetch = async (url) => {
      // the cached-list stand-in: a Trainer list that predates customsupertype-002
      if (url.includes('category=Trainer')) return reply([{ id: 'sv1-196' }]);
      if (url.includes('category=Energy')) return reply([]);
      if (url.includes('/sets/customsupertype')) {
        return reply({
          id: 'customsupertype',
          name: 'Super',
          cards: [
            { id: 'customsupertype-001', localId: '001', name: 'Weedle', image: `${image}/001`, category: 'Pokemon' },
            { id: 'customsupertype-002', localId: '002', name: 'Bill', image: `${image}/002`, category: 'Trainer' },
            { id: 'customsupertype-003', localId: '003', name: 'Old', image: `${image}/003` },
          ],
        });
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };
    const cards = await fetchSetCards('customsupertype');
    assert.deepEqual(
      cards.map((card) => [card.id, card.supertype]),
      [
        ['customsupertype-001', 'Pokémon'],
        ['customsupertype-002', 'Trainer'],
        ['customsupertype-003', 'Pokémon'],
      ]
    );
    assert.deepEqual(filterCardsBySupertype(cards, 'trainer').map((card) => card.id), ['customsupertype-002']);
  });
});
