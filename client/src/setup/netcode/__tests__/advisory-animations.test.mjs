import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advisoryAnimationPlan, EVENT_FX } from '../advisory-animations.mjs';

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

test('advisoryAnimationPlan: zoneShuffledIntoDeck animates the deck, not the source zone', () => {
  for (const zoneId of ['hand', 'discard', 'board']) {
    const event = { type: 'zoneShuffledIntoDeck', zoneId, playerId: 'p1' };
    assert.deepEqual(advisoryAnimationPlan(event, 'p1'), {
      kind: 'shuffle',
      user: 'self',
      zoneId: 'deck',
    });
  }
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

test('advisoryAnimationPlan: EVENT_FX maps every fx event type to a named effect', () => {
  for (const [type, effect] of Object.entries(EVENT_FX)) {
    const plan = advisoryAnimationPlan({ type, playerId: 'p1', instanceId: 'c1' }, 'p1');
    assert.equal(plan.kind, 'fx');
    assert.equal(plan.effect, effect);
    assert.equal(plan.user, 'self');
    assert.equal(plan.instanceId, 'c1');
  }
});

test('advisoryAnimationPlan: fx plan passes payload through and resolves the opp side', () => {
  const plan = advisoryAnimationPlan(
    { type: 'damageUpdated', instanceId: 'c9', damage: 60, delta: 30, weakness: true, playerId: 'p2' },
    'p1'
  );
  assert.deepEqual(plan, {
    kind: 'fx',
    effect: 'damage',
    user: 'opp',
    instanceId: 'c9',
    damage: 60,
    delta: 30,
    weakness: true,
  });
});

test('advisoryAnimationPlan: fx event without playerId still plans, with user null', () => {
  const plan = advisoryAnimationPlan({ type: 'damageUpdated', instanceId: 'c9', damage: 30 }, 'p1');
  assert.deepEqual(plan, { kind: 'fx', effect: 'damage', user: null, instanceId: 'c9', damage: 30 });
  assert.equal(advisoryAnimationPlan({ type: 'turnStarted' }, null).user, null);
});

test('advisoryAnimationPlan: inherited object keys are not fx event types', () => {
  assert.equal(advisoryAnimationPlan({ type: 'toString', playerId: 'p1' }, 'p1'), null);
});

test('advisoryAnimationPlan: pokemonKnockedOut stays a knockout plan, not fx', () => {
  const plan = advisoryAnimationPlan({ type: 'pokemonKnockedOut', playerId: 'p1', instanceId: 'c1' }, 'p1');
  assert.equal(plan.kind, 'knockout');
});

test('advisoryAnimationPlan: attackExecuted -> attack fx carrying attacker and defender ids', () => {
  const plan = advisoryAnimationPlan(
    { type: 'attackExecuted', playerId: 'p1', attackerId: 1, defenderId: 20, damage: 30 },
    'p1'
  );
  assert.deepEqual(plan, {
    kind: 'fx',
    effect: 'attack',
    user: 'self',
    attackerId: 1,
    defenderId: 20,
    damage: 30,
  });
});
