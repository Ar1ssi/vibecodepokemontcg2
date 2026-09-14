import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advisoryAnimationPlan } from '../advisory-animations.mjs';

test('advisoryAnimationPlan: zoneShuffled -> shuffle plan for the shuffling side', () => {
  const event = { type: 'zoneShuffled', zoneId: 'deck', playerId: 'p1' };
  assert.deepEqual(advisoryAnimationPlan(event, 'p1'), {
    kind: 'shuffle',
    user: 'self',
    zoneId: 'deck',
  });
  assert.deepEqual(advisoryAnimationPlan(event, 'p2'), {
    kind: 'shuffle',
    user: 'opp',
    zoneId: 'deck',
  });
});

test('advisoryAnimationPlan: zoneShuffledIntoDeck also plans a shuffle', () => {
  const event = { type: 'zoneShuffledIntoDeck', zoneId: 'hand', playerId: 'p1' };
  assert.deepEqual(advisoryAnimationPlan(event, 'p1'), {
    kind: 'shuffle',
    user: 'self',
    zoneId: 'hand',
  });
});

test('advisoryAnimationPlan: zoneShuffled with no zoneId returns null', () => {
  assert.equal(advisoryAnimationPlan({ type: 'zoneShuffled', playerId: 'p1' }, 'p1'), null);
});

test('advisoryAnimationPlan: cardsDrawn -> draw plan carrying instanceIds', () => {
  const event = {
    type: 'cardsDrawn',
    playerId: 'p2',
    count: 2,
    cards: [{ instanceId: 10 }, { instanceId: 11 }],
  };
  assert.deepEqual(advisoryAnimationPlan(event, 'p1'), {
    kind: 'draw',
    user: 'opp',
    cards: [{ instanceId: 10 }, { instanceId: 11 }],
    count: 2,
  });
});

test('advisoryAnimationPlan: cardsDrawn with empty/malformed cards returns null', () => {
  assert.equal(
    advisoryAnimationPlan({ type: 'cardsDrawn', playerId: 'p1', cards: [] }, 'p1'),
    null
  );
  assert.equal(
    advisoryAnimationPlan({ type: 'cardsDrawn', playerId: 'p1' }, 'p1'),
    null
  );
  assert.equal(
    advisoryAnimationPlan(
      { type: 'cardsDrawn', playerId: 'p1', cards: [{ instanceId: null }] },
      'p1'
    ),
    null
  );
});

test('advisoryAnimationPlan: unrelated event types return null (edge case 7)', () => {
  assert.equal(advisoryAnimationPlan({ type: 'cardMoved', playerId: 'p1' }, 'p1'), null);
  assert.equal(advisoryAnimationPlan({ type: 'unknownEventType', playerId: 'p1' }, 'p1'), null);
});

test('advisoryAnimationPlan: pokemonKnockedOut -> knockout plan carrying instanceId', () => {
  const event = {
    type: 'pokemonKnockedOut',
    instanceId: 42,
    playerId: 'p1',
    attackerPlayerId: 'p2',
    prizeCount: 1,
  };
  assert.deepEqual(advisoryAnimationPlan(event, 'p1'), {
    kind: 'knockout',
    user: 'self',
    instanceId: 42,
  });
  assert.deepEqual(advisoryAnimationPlan(event, 'p2'), {
    kind: 'knockout',
    user: 'opp',
    instanceId: 42,
  });
});

test('advisoryAnimationPlan: pokemonKnockedOut with no instanceId returns null', () => {
  assert.equal(advisoryAnimationPlan({ type: 'pokemonKnockedOut', playerId: 'p1' }, 'p1'), null);
});

test('advisoryAnimationPlan: malformed input returns null without throwing', () => {
  assert.equal(advisoryAnimationPlan(null, 'p1'), null);
  assert.equal(advisoryAnimationPlan(undefined, 'p1'), null);
  assert.equal(advisoryAnimationPlan({ type: 'zoneShuffled', zoneId: 'deck' }, null), null);
  assert.equal(
    advisoryAnimationPlan({ type: 'zoneShuffled', zoneId: 'deck', playerId: null }, 'p1'),
    null
  );
});
