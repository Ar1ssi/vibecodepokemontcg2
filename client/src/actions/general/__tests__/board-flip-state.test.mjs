import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyBoardFlip } from '../board-flip-state.mjs';

test('a flip swaps initiator as a plain field, and back', () => {
  const systemState = { solo: false, nearSeat: 'p1', initiator: 'self' };
  assert.deepEqual(applyBoardFlip(systemState), { swapSides: true });
  assert.equal(systemState.initiator, 'opp');
  assert.equal(Object.getOwnPropertyDescriptor(systemState, 'initiator').get, undefined);
  applyBoardFlip(systemState);
  assert.equal(systemState.initiator, 'self');
  assert.equal(systemState.nearSeat, 'p1', 'the near seat is a solo-room notion');
});

test('solo room: a flip swaps the near seat and keeps the sides and initiator', () => {
  const systemState = {
    solo: true,
    nearSeat: 'p1',
    initiator: 'self',
    p2SelfUsername: 'Ash',
    p2OppUsername: 'Ash (far)',
  };
  assert.deepEqual(applyBoardFlip(systemState), { swapSides: false, requestNearSeat: 'p2' });
  assert.equal(systemState.nearSeat, 'p2');
  assert.equal(systemState.initiator, 'self');
  assert.equal(systemState.p2SelfUsername, 'Ash (far)', 'names follow their seats');
  assert.equal(systemState.p2OppUsername, 'Ash');
  assert.deepEqual(applyBoardFlip(systemState), { swapSides: false, requestNearSeat: 'p1' });
  assert.equal(systemState.nearSeat, 'p1');
});

test('the shipped systemState holds initiator as a field, not a CSS-class getter', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(
    new URL('../../../initialization/global-variables/global-variables.js', import.meta.url),
    'utf8'
  );
  assert.equal(source.includes("classList.contains('self')"), false);
  assert.match(source, /initiator: 'self',/);
  assert.match(source, /solo: false,/);
  assert.match(source, /nearSeat: 'p1',/);
});
