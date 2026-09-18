import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_STACK_STEP_OFFSET_PX,
  isStackableCard,
  getCardStackOffset,
  computeHandStacks,
} from '../hand-stack.mjs';

test('isStackableCard: validates stackable criteria', () => {
  assert.equal(isStackableCard(null), false);
  assert.equal(isStackableCard(undefined), false);
  assert.equal(isStackableCard('not-an-object'), false);
  assert.equal(isStackableCard({ name: '' }), false);
  assert.equal(isStackableCard({ name: '   ' }), false);
  assert.equal(
    isStackableCard({ name: 'Rare Candy', isRedacted: true }),
    false
  );
  assert.equal(isStackableCard({ name: 'Rare Candy', hidden: true }), false);
  assert.equal(
    isStackableCard({ name: 'Rare Candy' }, { isHidden: () => true }),
    false
  );
  assert.equal(isStackableCard({ name: 'Rare Candy' }), true);
});

test('getCardStackOffset: calculates vertical offset per layer', () => {
  assert.equal(getCardStackOffset(0), 0);
  assert.equal(getCardStackOffset(-1), 0);
  assert.equal(getCardStackOffset(1), DEFAULT_STACK_STEP_OFFSET_PX);
  assert.equal(getCardStackOffset(2), 28);
  assert.equal(getCardStackOffset(3), 42);
  assert.equal(getCardStackOffset(2, 10), 20);
});

test('computeHandStacks: empty or null input', () => {
  assert.deepEqual(computeHandStacks([]), []);
  assert.deepEqual(computeHandStacks(null), []);
  assert.deepEqual(computeHandStacks(undefined), []);
});

test('computeHandStacks: hand with all unique cards', () => {
  const cards = [
    { id: 1, name: 'Rare Candy' },
    { id: 2, name: 'Ultra Ball' },
    { id: 3, name: 'Nest Ball' },
  ];

  const stacks = computeHandStacks(cards);
  assert.equal(stacks.length, 3);

  assert.equal(stacks[0].name, 'Rare Candy');
  assert.equal(stacks[0].count, 1);
  assert.equal(stacks[0].isStack, false);
  assert.equal(stacks[0].cards[0].isFront, true);
  assert.equal(stacks[0].cards[0].offsetPx, 0);

  assert.equal(stacks[1].name, 'Ultra Ball');
  assert.equal(stacks[1].count, 1);
  assert.equal(stacks[1].isStack, false);

  assert.equal(stacks[2].name, 'Nest Ball');
  assert.equal(stacks[2].count, 1);
  assert.equal(stacks[2].isStack, false);
});

test('computeHandStacks: 2 duplicate cards (just like screenshot)', () => {
  const cardA = { id: 101, name: 'Rare Candy' };
  const cardB = { id: 102, name: 'Rare Candy' };
  const cards = [cardA, cardB];

  const stacks = computeHandStacks(cards);
  assert.equal(stacks.length, 1);

  const stack = stacks[0];
  assert.equal(stack.name, 'Rare Candy');
  assert.equal(stack.count, 2);
  assert.equal(stack.isStack, true);
  assert.equal(stack.cards.length, 2);

  // Front card (layer 0)
  assert.equal(stack.cards[0].card, cardA);
  assert.equal(stack.cards[0].layerIndex, 0);
  assert.equal(stack.cards[0].isFront, true);
  assert.equal(stack.cards[0].offsetPx, 0);
  assert.equal(stack.cards[0].zIndex, 3);

  // Back card (layer 1)
  assert.equal(stack.cards[1].card, cardB);
  assert.equal(stack.cards[1].layerIndex, 1);
  assert.equal(stack.cards[1].isFront, false);
  assert.equal(stack.cards[1].offsetPx, DEFAULT_STACK_STEP_OFFSET_PX);
  assert.equal(stack.cards[1].zIndex, 2);
});

test('computeHandStacks: 3 and 4 duplicate copies step upwards', () => {
  const c1 = { id: 1, name: 'Water Energy' };
  const c2 = { id: 2, name: 'Water Energy' };
  const c3 = { id: 3, name: 'Water Energy' };
  const c4 = { id: 4, name: 'Water Energy' };

  const stacks = computeHandStacks([c1, c2, c3, c4]);
  assert.equal(stacks.length, 1);

  const stack = stacks[0];
  assert.equal(stack.count, 4);
  assert.equal(stack.isStack, true);

  assert.equal(stack.cards[0].offsetPx, 0);
  assert.equal(stack.cards[0].zIndex, 5);

  assert.equal(stack.cards[1].offsetPx, 14);
  assert.equal(stack.cards[1].zIndex, 4);

  assert.equal(stack.cards[2].offsetPx, 28);
  assert.equal(stack.cards[2].zIndex, 3);

  assert.equal(stack.cards[3].offsetPx, 42);
  assert.equal(stack.cards[3].zIndex, 2);
});

test('computeHandStacks: multiple duplicate groups preserve first-seen ordering', () => {
  const cards = [
    { id: 1, name: 'Rare Candy' },
    { id: 2, name: 'Ultra Ball' },
    { id: 3, name: 'Rare Candy' },
    { id: 4, name: "Professor's Research" },
    { id: 5, name: 'Ultra Ball' },
    { id: 6, name: 'Rare Candy' },
  ];

  const stacks = computeHandStacks(cards);
  assert.equal(stacks.length, 3);

  // 1st group: Rare Candy (count 3)
  assert.equal(stacks[0].name, 'Rare Candy');
  assert.equal(stacks[0].count, 3);
  assert.equal(stacks[0].isStack, true);
  assert.deepEqual(
    stacks[0].cards.map((c) => c.card.id),
    [1, 3, 6]
  );

  // 2nd group: Ultra Ball (count 2)
  assert.equal(stacks[1].name, 'Ultra Ball');
  assert.equal(stacks[1].count, 2);
  assert.equal(stacks[1].isStack, true);
  assert.deepEqual(
    stacks[1].cards.map((c) => c.card.id),
    [2, 5]
  );

  // 3rd group: Professor's Research (count 1)
  assert.equal(stacks[2].name, "Professor's Research");
  assert.equal(stacks[2].count, 1);
  assert.equal(stacks[2].isStack, false);
  assert.deepEqual(
    stacks[2].cards.map((c) => c.card.id),
    [4]
  );
});

test('computeHandStacks: hidden or redacted cards are never stacked', () => {
  const cards = [
    { id: 1, name: 'Rare Candy', isRedacted: true },
    { id: 2, name: 'Rare Candy', isRedacted: true },
    { id: 3, name: 'Rare Candy' }, // only one face up
    { id: 4, name: 'Rare Candy' }, // second face up
  ];

  const stacks = computeHandStacks(cards);
  // Two unstackable redacted cards + one stack of 2 face-up cards
  assert.equal(stacks.length, 3);
  assert.equal(stacks[0].isStack, false);
  assert.equal(stacks[1].isStack, false);
  assert.equal(stacks[2].isStack, true);
  assert.equal(stacks[2].count, 2);
  assert.deepEqual(
    stacks[2].cards.map((c) => c.card.id),
    [3, 4]
  );
});
