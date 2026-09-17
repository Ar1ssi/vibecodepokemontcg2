import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveViewerIndex, toViewerCards } from '../discard-pile-source.mjs';

const viewCards = [
  { instanceId: 11, name: 'Potion', src: '/potion.png', type: 'Trainer' },
  { instanceId: 12, name: 'Pikachu', src: '/pikachu.png', type: 'Pokémon', rarity: 'Rare Holo' },
];

test('view cards become picker candidates the carousel can render', () => {
  const cards = toViewerCards(viewCards);
  assert.deepEqual(cards[0], {
    instanceId: 11,
    name: 'Potion',
    type: 'Trainer',
    rarity: undefined,
    image: { src: '/potion.png' },
  });
  assert.equal(cards[1].rarity, 'Rare Holo');
  assert.deepEqual(toViewerCards(undefined), []);
  // A card with no art still gets a usable shape rather than throwing.
  assert.deepEqual(toViewerCards([{ instanceId: 3 }])[0].image, { src: '' });
});

// I57: the discard pile of a server-drawn board is empty in the legacy zone array, so the
// viewer used to bail out; the clicked card now has to be found by instanceId.
test('the clicked card is located by instanceId, whatever the legacy index says', () => {
  const cards = toViewerCards(viewCards);
  assert.equal(resolveViewerIndex(cards, { startIndex: -1, instanceId: 11 }), 0);
  assert.equal(resolveViewerIndex(cards, { startIndex: 0, instanceId: 12 }), 1);
});

test('without an instanceId the viewer falls back to the index, then to the top of the pile', () => {
  const cards = toViewerCards(viewCards);
  assert.equal(resolveViewerIndex(cards, { startIndex: 0 }), 0);
  assert.equal(resolveViewerIndex(cards, {}), 1);
  assert.equal(resolveViewerIndex(cards, { startIndex: null, instanceId: 999 }), 1);
  assert.equal(resolveViewerIndex(cards, { startIndex: 9 }), 1);
  assert.equal(resolveViewerIndex(cards, { startIndex: -4 }), 0);
});

test('an empty pile reports nothing to show', () => {
  assert.equal(resolveViewerIndex([], { startIndex: 0 }), -1);
  assert.equal(resolveViewerIndex(undefined, {}), -1);
});
