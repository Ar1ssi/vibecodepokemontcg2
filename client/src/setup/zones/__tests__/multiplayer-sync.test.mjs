import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCardIndex, buildCardHint } from '../resolve-card-index.mjs';

test('multiplayer hand desync: hint resolves Dark Energy when index points at Boss\'s Orders', () => {
  const hand = {
    array: [
      { name: "Boss's Orders", type: 'Trainer', image: { src: 'boss.png' } },
      { name: 'Dark Energy', type: 'Energy', image: { src: 'dark.png' } },
      { name: 'Potion', type: 'Trainer', image: { src: 'potion.png' } },
    ],
  };

  // P1 attached index 1 (Dark Energy). P2's unsorted hand still has Boss at 0.
  const relayIndex = 1;
  const hint = buildCardHint(hand.array[1]);

  const resolvedOnDesyncedHand = resolveCardIndex(
    {
      array: [
        { name: "Boss's Orders", type: 'Trainer', image: { src: 'boss.png' } },
        { name: 'Potion', type: 'Trainer', image: { src: 'potion.png' } },
        { name: 'Dark Energy', type: 'Energy', image: { src: 'dark.png' } },
      ],
    },
    hint,
    relayIndex
  );

  assert.equal(resolvedOnDesyncedHand, 2);
  assert.equal(
    resolveCardIndex(hand, hint, relayIndex),
    1
  );
});
