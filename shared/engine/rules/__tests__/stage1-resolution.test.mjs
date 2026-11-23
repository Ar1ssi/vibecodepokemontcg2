// Rare Candy needs the Basic a Stage 2 descends from, which a Stage 2 only names through its
// Stage 1. Live TCGdex 2026-11-23: GET /cards?name=corvisquire lists sv09-134 "Hop's Corvisquire"
// (evolveFrom "Hop's Rookidee") before swsh1-151 "Corvisquire" (evolveFrom "Rookidee"), because
// the search is a substring match. A game log showed Corviknight stamped with "hop's rookidee",
// so Rare Candy found no target for a plain Rookidee in play.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCard } from '../../cards.mjs';
import { STAGE1_EVOLVES_FROM, resolveStage1EvolvesFrom, stampEvolvesFromBase } from '../evolution.mjs';
import { rareCandyOptions } from '../evolved-pokemon.mjs';

const withStubbedTcgdex = async (routes, fn) => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const route = Object.keys(routes).find((key) => String(url).includes(key));
    return route
      ? { ok: true, json: async () => routes[route] }
      : { ok: false, status: 404, json: async () => ({}) };
  };
  try {
    return await fn();
  } finally {
    globalThis.fetch = previous;
  }
};

const CORVISQUIRE_ROUTES = {
  '/cards?name=corvisquire': [
    { id: 'sv09-134', localId: '134', name: "Hop's Corvisquire" },
    { id: 'swsh1-151', localId: '151', name: 'Corvisquire' },
    { id: 'sv02-165', localId: '165', name: 'Corvisquire' },
  ],
  '/cards/sv09-134': { id: 'sv09-134', name: "Hop's Corvisquire", stage: 'Stage1', evolveFrom: "Hop's Rookidee" },
  '/cards/swsh1-151': { id: 'swsh1-151', name: 'Corvisquire', stage: 'Stage1', evolveFrom: 'Rookidee' },
  '/cards/sv02-165': { id: 'sv02-165', name: 'Corvisquire', stage: 'Stage1', evolveFrom: 'Rookidee' },
};

test('Stage 1 lookup skips a same-substring card of another name (Hop\'s Corvisquire)', async () => {
  STAGE1_EVOLVES_FROM.delete('corvisquire');
  await withStubbedTcgdex(CORVISQUIRE_ROUTES, async () => {
    assert.equal(await resolveStage1EvolvesFrom('Corvisquire'), 'rookidee');
  });
});

test('Stage 1 lookup with no exact-name card resolves nothing instead of guessing', async () => {
  const routes = {
    '/cards?name=zzzling': [{ id: 'x-1', name: "Hop's Zzzling" }],
    '/cards/x-1': { id: 'x-1', name: "Hop's Zzzling", stage: 'Stage1', evolveFrom: "Hop's Zzzbit" },
  };
  await withStubbedTcgdex(routes, async () => {
    assert.equal(await resolveStage1EvolvesFrom('Zzzling'), null);
  });
  assert.equal(STAGE1_EVOLVES_FROM.has('zzzling'), false, 'a miss is not cached');
});

test('Stage 1 lookup finds a multi-word name (the search cannot find "darkdragonair")', async () => {
  // Live TCGdex 2026-11-23: ?name=darkdragonair is [], ?name=dark%20dragonair lists ex7-31
  // "Dark Dragonair" (evolveFrom "Dratini").
  const routes = {
    '/cards?name=darkdragonair': [],
    '/cards?name=dark%20dragonair': [{ id: 'ex7-31', localId: '31', name: 'Dark Dragonair' }],
    '/cards/ex7-31': { id: 'ex7-31', name: 'Dark Dragonair', stage: 'Stage1', evolveFrom: 'Dratini' },
  };
  await withStubbedTcgdex(routes, async () => {
    assert.equal(await resolveStage1EvolvesFrom('Dark Dragonair'), 'dratini');
  });
});

test('Rare Candy offers Corviknight for a plain Rookidee in play', async () => {
  STAGE1_EVOLVES_FROM.delete('corvisquire');
  const corviknight = createCard({
    instanceId: 181,
    name: 'Corviknight',
    supertype: 'Pokémon',
    stage: 'Stage 2',
    evolvesFrom: 'Corvisquire',
  });
  await withStubbedTcgdex(CORVISQUIRE_ROUTES, () => stampEvolvesFromBase(corviknight));
  assert.equal(corviknight.evolvesFromBase, 'rookidee');

  const rookidee = createCard({
    instanceId: 189,
    name: 'Rookidee',
    supertype: 'Pokémon',
    stage: 'Basic',
    enteredPlayTurn: 1,
  });
  const player = { zones: { active: [rookidee], bench: [], hand: [corviknight] } };
  const options = rareCandyOptions(player, [], 9);
  assert.equal(options.length, 1);
  assert.equal(options[0].stage2, corviknight);
  assert.deepEqual(options[0].basics, [rookidee]);
});
