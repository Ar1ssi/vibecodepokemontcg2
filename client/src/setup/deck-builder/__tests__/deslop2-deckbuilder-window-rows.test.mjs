import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBuilderMessage, parseBuilderMessage } from '../core/builder-window.mjs';

const load = (rows) =>
  parseBuilderMessage(buildBuilderMessage('load-deck', { target: 'self', deckId: null, rows }));
const row = (qty, name = 'Pikachu') => [qty, name, 'Pokémon', 'https://x/y.png'];

test('a load-deck row needs a whole positive quantity, as a number or as digits', () => {
  assert.ok(load([row(4)]));
  assert.ok(load([row('4')]));
  for (const bad of [0, -1, 1.5, '0', '2.5', '', 'many', null]) {
    assert.equal(load([row(bad)]), null, `quantity ${JSON.stringify(bad)}`);
  }
});

test('a load-deck row needs a name, type and url as text', () => {
  assert.equal(load([[1, null, 'Pokémon', 'u']]), null);
  assert.equal(load([[1, 'Pikachu', 7, 'u']]), null);
  assert.equal(load([[1, 'Pikachu', 'Pokémon', '']]), null);
});
