import { test } from 'node:test';
import assert from 'node:assert/strict';
import { movePicksInOrder } from '../card-picker-moves.mjs';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('movePicksInOrder settles only after every move finished, one at a time', async () => {
  const events = [];
  const moveOne = async (pick) => {
    events.push(`start ${pick}`);
    await tick();
    events.push(`done ${pick}`);
  };

  await movePicksInOrder(['Dratini', 'Tynamo'], moveOne);
  events.push('shuffle');

  assert.deepEqual(events, [
    'start Dratini',
    'done Dratini',
    'start Tynamo',
    'done Tynamo',
    'shuffle',
  ]);
});

test('movePicksInOrder keeps moving after one move throws', async () => {
  const moved = [];
  const originalError = console.error;
  console.error = () => {};
  try {
    await movePicksInOrder(['a', 'b', 'c'], async (pick) => {
      if (pick === 'b') throw new Error('boom');
      moved.push(pick);
    });
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(moved, ['a', 'c']);
});

test('movePicksInOrder accepts synchronous moves and an empty pick list', async () => {
  const moved = [];
  await movePicksInOrder([], () => moved.push('never'));
  await movePicksInOrder(['x'], (pick) => {
    moved.push(pick);
    return undefined;
  });
  assert.deepEqual(moved, ['x']);
});
