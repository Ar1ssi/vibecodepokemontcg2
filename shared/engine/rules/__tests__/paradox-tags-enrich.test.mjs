// Design 058: TCGdex detail never names the Ancient/Future tag; enrichment appends it by printing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureCardData } from '../rules-state.mjs';

const withStubbedFetch = async (details, fn) => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const id = Object.keys(details).find((key) => String(url).includes(`/cards/${key}`));
    return id
      ? { ok: true, json: async () => details[id] }
      : { ok: false, status: 404, json: async () => ({}) };
  };
  try {
    return await fn();
  } finally {
    globalThis.fetch = previous;
  }
};

// TCGdex detail shapes (sv04-070 Iron Hands ex, sv01-123 Great Tusk ex): suffix "ex", no tag.
const detail = (id, name) => ({
  id,
  name,
  category: 'Pokemon',
  hp: 230,
  stage: 'Basic',
  suffix: 'ex',
  types: ['Lightning'],
  attacks: [{ name: 'Arm Press', damage: '160', cost: ['Lightning', 'Lightning', 'Colorless'] }],
  weaknesses: [{ type: 'Fighting', value: '×2' }],
  retreat: 3,
});

test('ensureCardData appends Future to a tagged printing', async () => {
  await withStubbedFetch({ 'sv04-070': detail('sv04-070', 'Iron Hands ex') }, async () => {
    const card = { id: 'sv04-070', name: 'Iron Hands ex', type: 'Pokémon' };
    await ensureCardData(card);
    assert.deepEqual(card.subtypes, ['ex', 'Future']);
  });
});

test('ensureCardData appends the tag even when the card already holds a subtypes array', async () => {
  await withStubbedFetch({ 'sv04-070': detail('sv04-070', 'Iron Hands ex') }, async () => {
    const card = { id: 'sv04-070', name: 'Iron Hands ex', type: 'Pokémon', subtypes: [] };
    await ensureCardData(card);
    assert.deepEqual(card.subtypes, ['Future']);
  });
});

test('ensureCardData leaves an untagged printing of a Paradox species alone', async () => {
  await withStubbedFetch({ 'sv01-123': detail('sv01-123', 'Great Tusk ex') }, async () => {
    const card = { id: 'sv01-123', name: 'Great Tusk ex', type: 'Pokémon' };
    await ensureCardData(card);
    assert.deepEqual(card.subtypes, ['ex']);
  });
});
