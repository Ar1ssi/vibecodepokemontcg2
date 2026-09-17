import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeckPeekPickerRequest } from '../deck-peek-request.mjs';

const cards = [
  { instanceId: 4, name: 'Potion', src: '/potion.png', type: 'Trainer' },
  { instanceId: 5, name: 'Pikachu', src: '/pikachu.png', type: 'Pokémon' },
];

test('own deck: any number of the shown cards can be taken, and picks report instanceIds', () => {
  const taken = [];
  const request = buildDeckPeekPickerRequest({
    cards,
    side: 'you',
    fromTop: true,
    onTake: (ids) => taken.push(ids),
  });
  assert.match(request.title, /^Top 2 cards of your deck/);
  assert.deepEqual(request.candidates.map((c) => c.instanceId), [4, 5]);
  assert.deepEqual(request.candidates[0].image, { src: '/potion.png' });
  assert.equal(request.pickOnly, true);
  assert.equal(request.minCount, 0);
  assert.equal(request.maxCount, 2);
  assert.equal(request.upTo, true);

  request.onConfirm([cards[1]]);
  request.onConfirm([]);
  request.onPick(cards[0]);
  request.onPick(null);
  assert.deepEqual(taken, [[5], [], [4], []]);
});

test('a bottom-of-deck look says so, and one card reads as singular', () => {
  const request = buildDeckPeekPickerRequest({
    cards: [cards[0]],
    side: 'you',
    fromTop: false,
    onTake: () => {},
  });
  assert.match(request.title, /^Bottom 1 card of your deck/);
});

test("the opponent's deck is view-only", () => {
  const request = buildDeckPeekPickerRequest({ cards, side: 'them', fromTop: true, onTake: () => {} });
  assert.equal(request.mode, 'browse');
  assert.equal(request.maxCount, 0);
  assert.equal(request.onConfirm, undefined);
  assert.match(request.title, /opponent's deck/);
});

test('nothing to show plans no picker', () => {
  for (const shown of [[], null, [{ name: 'ghost' }]]) {
    assert.equal(
      buildDeckPeekPickerRequest({ cards: shown, side: 'you', fromTop: true, onTake: () => {} }),
      null
    );
  }
});
