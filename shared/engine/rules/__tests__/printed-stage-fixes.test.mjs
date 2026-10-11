// TCGdex 30th-109 / 30th-156 Salamence ex: stage "Basic", no evolveFrom (live API 2026-10-11);
// the printed card is Stage 2 evolving from Shelgon.
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

const detail = (id, extra = {}) => ({
  id,
  name: 'Salamence ex',
  category: 'Pokemon',
  hp: 330,
  stage: 'Basic',
  suffix: 'EX',
  types: ['Dragon'],
  attacks: [{ name: 'Dragon Pulse', damage: '240', cost: ['Fire', 'Water'] }],
  retreat: 2,
  ...extra,
});

for (const id of ['30th-109', '30th-156']) {
  test(`${id} Salamence ex enriches as Stage 2 from Shelgon`, async () => {
    await withStubbedFetch({ [id]: detail(id) }, async () => {
      const card = { id, name: 'Salamence ex', type: 'Pokémon' };
      await ensureCardData(card);
      assert.equal(card.stage, 'Stage2');
      assert.equal(card.evolvesFrom, 'Shelgon');
    });
  });
}

test('other printings keep their TCGdex stage', async () => {
  await withStubbedFetch({ 'sv09-114': detail('sv09-114', { stage: 'Stage2', evolveFrom: 'Shelgon ex' }) }, async () => {
    const card = { id: 'sv09-114', name: 'Salamence ex', type: 'Pokémon' };
    await ensureCardData(card);
    assert.equal(card.stage, 'Stage2');
    assert.equal(card.evolvesFrom, 'Shelgon ex');
  });
});
