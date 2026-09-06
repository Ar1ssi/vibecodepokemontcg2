import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cardMatchesDeckEntry,
  sortCardsByDeckList,
} from '../hand-sort.mjs';
import {
  buildCardHint,
  resolveCardIndex,
  hintMatchesAtIndex,
} from '../resolve-card-index.mjs';

const deckData = [
  [4, 'Nest Ball', 'Trainer', 'url1', '123', 'SVI', 'sv1-123'],
  [1, 'Popplio', 'Pokémon', 'url2', '37', 'SUM', 'sm1-37'],
  [2, 'Professor\'s Research', 'Trainer', 'url3', '178', 'SSH', 'ssh-178'],
];

test('sortCardsByDeckList orders by deck row and quantity', () => {
  const cards = [
    { name: "Professor's Research", number: '178', set: 'SSH' },
    { name: 'Popplio', number: '37', set: 'SUM' },
    { name: 'Nest Ball', number: '123', set: 'SVI' },
    { name: 'Nest Ball', number: '123', set: 'SVI' },
  ];
  const sorted = sortCardsByDeckList(cards, deckData);
  assert.deepEqual(
    sorted.map((c) => c.name),
    ['Nest Ball', 'Nest Ball', 'Popplio', "Professor's Research"]
  );
});

test('sortCardsByDeckList is stable for duplicate names via deck quantity rows', () => {
  const fourNest = Array.from({ length: 4 }, (_, i) => ({
    name: 'Nest Ball',
    number: '123',
    set: 'SVI',
    syncInstance: i,
  }));
  const hand = [fourNest[3], fourNest[1], fourNest[0], fourNest[2]];
  const sorted = sortCardsByDeckList(hand, deckData);
  assert.deepEqual(sorted.map((c) => c.syncInstance), [0, 1, 2, 3]);
});

test('cardMatchesDeckEntry respects number and set', () => {
  const card = { name: 'Popplio', number: '37', set: 'SUM' };
  assert.equal(cardMatchesDeckEntry(card, deckData[1]), true);
  assert.equal(
    cardMatchesDeckEntry({ name: 'Popplio', number: '99', set: 'SUM' }, deckData[1]),
    false
  );
});

test('resolveCardIndex prefers syncInstance over stale index', () => {
  const zone = {
    array: [
      { name: "Professor's Research", syncInstance: 5 },
      { name: 'Popplio', syncInstance: 6 },
    ],
  };
  const hint = buildCardHint(zone.array[1]);
  assert.equal(resolveCardIndex(zone, hint, 0), 1);
});

test('hintMatchesAtIndex rejects wrong card at resolved index', () => {
  const zone = {
    array: [
      { name: "Professor's Research", syncInstance: 5 },
      { name: 'Popplio', syncInstance: 6 },
    ],
  };
  const popplioHint = buildCardHint({ name: 'Popplio', syncInstance: 6 });
  assert.equal(hintMatchesAtIndex(zone, 0, popplioHint), false);
  assert.equal(hintMatchesAtIndex(zone, 1, popplioHint), true);
});
