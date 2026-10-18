// The set browser's Reverse Holo copies carry `<tcgdex id>-reverse`, which TCGdex 404s.
// Enrichment must read the base print and keep the copy's own id and rarity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureCardData } from '../rules-state.mjs';

const withStubbedFetch = async (details, fn) => {
  const previous = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    const id = String(url).split('/cards/')[1];
    requested.push(id);
    return details[id]
      ? { ok: true, json: async () => details[id] }
      : { ok: false, status: 404, json: async () => ({}) };
  };
  try {
    return await fn(requested);
  } finally {
    globalThis.fetch = previous;
  }
};

// Card text: out/pkmn-special-energy-cards.json, Prism Energy, Next Destinies 93.
const PRISM_TEXT =
  'This card provides {C} Energy. If the Pokémon this card is attached to is a Basic Pokémon, this card provides every type of Energy but provides only 1 Energy at a time.';
const prismDetail = {
  id: 'bw4-93',
  localId: '93',
  name: 'Prism Energy',
  category: 'Energy',
  energyType: 'Special',
  rarity: 'Uncommon',
  effect: PRISM_TEXT,
  set: { id: 'bw4', name: 'Next Destinies' },
};

test('a Reverse Holo special energy enriches from its base print and stays Reverse Holo', async () => {
  await withStubbedFetch({ 'bw4-93': prismDetail }, async (requested) => {
    const card = await ensureCardData({ id: 'bw4-93-reverse', name: 'Prism Energy' });
    assert.equal(card.id, 'bw4-93-reverse');
    assert.equal(card.effect, PRISM_TEXT);
    assert.equal(card.rarity, 'Reverse Holo');
    assert.deepEqual(requested, ['bw4-93']);
  });
});

test('the base print keeps its printed rarity', async () => {
  await withStubbedFetch({ 'bw4-93': prismDetail }, async () => {
    const card = await ensureCardData({ id: 'bw4-93', name: 'Prism Energy' });
    assert.equal(card.effect, PRISM_TEXT);
    assert.equal(card.rarity, 'Uncommon');
  });
});
