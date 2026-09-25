import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advisoryAnimationPlan, EVENT_FX, supersededDeals } from '../advisory-animations.mjs';
import { HOLD_MS } from '../mat-fx/fx-holds.mjs';

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
    const planned = advisoryAnimationPlan({ type, playerId: 'p1', instanceId: 'c1' }, 'p1');
    // A fanned-out event (attackExecuted) yields several plans; the mapped
    // effect is the LAST beat, after whatever announces it.
    const plans = Array.isArray(planned) ? planned : [planned];
    const plan = plans.at(-1);
    assert.equal(plan.kind, 'fx');
    assert.equal(plan.effect, effect);
    // turnStarted/gameEnded name their side via `player`/`winner`; own tests below.
    if (type !== 'turnStarted' && type !== 'gameEnded') assert.equal(plan.user, 'self');
    for (const p of plans) assert.equal(p.instanceId, 'c1');
  }
});

test('advisoryAnimationPlan: every mapped effect exists in the client registry', () => {
  // EVENT_FX naming an effect the registry does not implement is a silent
  // no-op in production, so the two tables are checked against each other.
  const registered = new Set(Object.keys(HOLD_MS));
  for (const effect of Object.values(EVENT_FX)) {
    assert.ok(registered.has(effect), `${effect} has no hold/registry entry`);
  }
  assert.ok(registered.has('attack-banner'), 'the fanned-out banner is registered too');
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

test('advisoryAnimationPlan: attackExecuted fans into the banner then the lunge', () => {
  const plans = advisoryAnimationPlan(
    {
      type: 'attackExecuted',
      playerId: 'p1',
      attackerId: 1,
      defenderId: 20,
      attackName: 'Thunderbolt',
      damage: 30,
    },
    'p1'
  );
  const shared = {
    kind: 'fx',
    user: 'self',
    attackerId: 1,
    defenderId: 20,
    attackName: 'Thunderbolt',
    damage: 30,
  };
  assert.deepEqual(plans, [
    { ...shared, effect: 'attack-banner' },
    { ...shared, effect: 'attack' },
  ]);
});

test('advisoryAnimationPlan: a bench-only attack still fans, with no defender', () => {
  // Edge 9: nothing to ring or lunge at, but the name must still announce.
  const plans = advisoryAnimationPlan(
    { type: 'attackExecuted', playerId: 'p1', attackerId: 1, attackName: 'Spread', benchDealt: 20 },
    'p1'
  );
  assert.equal(plans.length, 2);
  assert.equal(plans[0].effect, 'attack-banner');
  assert.equal(plans[0].defenderId, undefined);
});

test('advisoryAnimationPlan: the design-024 events each map to their own effect', () => {
  const cases = [
    [{ type: 'prizesTaken', playerId: 'p1', count: 2 }, 'prize-claim'],
    [{ type: 'prizeTaken', playerId: 'p1', count: 1 }, 'prize-claim'],
    [{ type: 'pokemonPromoted', playerId: 'p1', instanceId: 'c1' }, 'promote'],
    [{ type: 'pokemonDevolved', playerId: 'p1', instanceId: 'c1' }, 'devolve'],
    [{ type: 'statusCleared', playerId: 'p1', instanceId: 'c1', condition: 'Asleep' }, 'status-clear'],
    [{ type: 'cardsDiscarded', playerId: 'p1' }, 'discard'],
    [{ type: 'coinFlipped', playerId: 'p1', face: 'heads' }, 'coin-flip'],
  ];
  for (const [event, effect] of cases) {
    const plan = advisoryAnimationPlan(event, 'p1');
    assert.equal(plan.kind, 'fx', `${event.type} is not an fx plan`);
    assert.equal(plan.effect, effect);
    assert.equal(plan.user, 'self');
  }
});

test('advisoryAnimationPlan: payload fields survive the fan-out and the new events', () => {
  assert.equal(advisoryAnimationPlan({ type: 'coinFlipped', playerId: 'p2', face: 'tails' }, 'p1').face, 'tails');
  assert.equal(
    advisoryAnimationPlan({ type: 'statusCleared', playerId: 'p1', condition: 'Poisoned' }, 'p1').condition,
    'Poisoned'
  );
  assert.equal(advisoryAnimationPlan({ type: 'prizesTaken', playerId: 'p1', count: 3 }, 'p1').count, 3);
});

test('advisoryAnimationPlan: turnStarted resolves the acting side from `player`', () => {
  const plan = advisoryAnimationPlan({ type: 'turnStarted', player: 'p2', number: 3 }, 'p1');
  assert.deepEqual(plan, { kind: 'fx', effect: 'turn-banner', user: 'opp', player: 'p2', number: 3 });
});

test('advisoryAnimationPlan: gameEnded user is the winner side; no winner -> null', () => {
  assert.equal(advisoryAnimationPlan({ type: 'gameEnded', winner: 'p1' }, 'p1').user, 'self');
  assert.equal(advisoryAnimationPlan({ type: 'gameEnded', winner: 'p2' }, 'p1').user, 'opp');
  assert.equal(advisoryAnimationPlan({ type: 'gameEnded', winner: null }, 'p1').user, null);
});

test('advisoryAnimationPlan: cardMoved into play from hand -> enter fx plan (design 027)', () => {
  const event = { type: 'cardMoved', playerId: 'p1', instanceId: 9, from: 'hand', to: 'bench' };
  assert.deepEqual(advisoryAnimationPlan(event, 'p1'), {
    kind: 'fx',
    effect: 'enter',
    user: 'self',
    instanceId: 9,
    from: 'hand',
    to: 'bench',
  });
  const active = advisoryAnimationPlan({ ...event, to: 'active' }, 'p2');
  assert.equal(active.effect, 'enter');
  assert.equal(active.user, 'opp');
});

test('advisoryAnimationPlan: cardMoved from deck or discard into play is an entry', () => {
  for (const from of ['deck', 'discard']) {
    const plan = advisoryAnimationPlan({ type: 'cardMoved', playerId: 'p1', instanceId: 3, from, to: 'bench' }, 'p1');
    assert.equal(plan?.effect, 'enter', from);
  }
});

test('advisoryAnimationPlan: board-to-board and out-of-play moves are not an entry', () => {
  const moves = [
    ['bench', 'active'],
    ['active', 'bench'],
    ['active', 'hand'],
    ['deck', 'hand'],
    ['active', 'lostZone'],
  ];
  for (const [from, to] of moves) {
    const event = { type: 'cardMoved', playerId: 'p1', instanceId: 3, from, to };
    assert.equal(advisoryAnimationPlan(event, 'p1'), null, `${from} -> ${to}`);
  }
  assert.equal(advisoryAnimationPlan({ type: 'cardMoved', playerId: 'p1', from: 'hand', to: 'bench' }, 'p1'), null);
});

test('advisoryAnimationPlan: a card moved into the discard pile flies there as a discard', () => {
  for (const from of ['active', 'hand', 'stadium']) {
    const plan = advisoryAnimationPlan({ type: 'cardMoved', playerId: 'p2', instanceId: 8, from, to: 'discard' }, 'p1');
    assert.equal(plan.effect, 'discard', from);
    assert.equal(plan.user, 'opp');
    assert.deepEqual(plan.cards, [8]);
  }
  assert.equal(advisoryAnimationPlan({ type: 'cardMoved', playerId: 'p1', from: 'hand', to: 'discard' }, 'p1'), null);
});

test('advisoryAnimationPlan: a zone swept into the discard pile flies that zone', () => {
  const plan = advisoryAnimationPlan({ type: 'zoneMoved', playerId: 'p1', from: 'board', to: 'discard', count: 2 }, 'p1');
  assert.equal(plan.effect, 'discard');
  assert.equal(plan.user, 'self');
  assert.equal(plan.sweep, 'board');
  assert.equal(advisoryAnimationPlan({ type: 'zoneMoved', playerId: 'p1', from: 'board', to: 'lostZone', count: 1 }, 'p1'), null);
  assert.equal(advisoryAnimationPlan({ type: 'zoneMoved', playerId: 'p1', to: 'discard', count: 1 }, 'p1'), null);
});

test('advisoryAnimationPlan: opening deal, mulligan redeal and bonus draw -> draw plans (design 044)', () => {
  for (const type of ['openingHandDealt', 'mulliganTaken', 'bonusDrawAwarded']) {
    assert.deepEqual(
      advisoryAnimationPlan({ type, playerId: 'p1', cards: [{ instanceId: 4 }, { instanceId: 5 }] }, 'p1'),
      { kind: 'draw', user: 'self', cards: [{ instanceId: 4 }, { instanceId: 5 }], count: 2 },
      type
    );
  }
  assert.equal(advisoryAnimationPlan({ type: 'openingHandDealt', playerId: 'p1', count: 7 }, 'p1'), null);
});

test('advisoryAnimationPlan: bare-id draw cards parse like {instanceId}', () => {
  assert.deepEqual(advisoryAnimationPlan({ type: 'cardsDrawn', playerId: 'p2', cards: [7, null, 8] }, 'p1'), {
    kind: 'draw',
    user: 'opp',
    cards: [{ instanceId: 7 }, { instanceId: 8 }],
    count: 2,
  });
});

test('supersededDeals: only each player\'s last deal survives a mulligan', () => {
  const firstDeal = { type: 'openingHandDealt', playerId: 'p1' };
  const oppDeal = { type: 'openingHandDealt', playerId: 'p2' };
  const redeal1 = { type: 'mulliganTaken', playerId: 'p1' };
  const redeal2 = { type: 'mulliganTaken', playerId: 'p1' };
  const bonus = { type: 'bonusDrawAwarded', playerId: 'p2' };
  const superseded = supersededDeals([firstDeal, oppDeal, redeal1, redeal2, bonus]);
  assert.deepEqual([...superseded], [firstDeal, redeal1]);
  assert.equal(supersededDeals(null).size, 0);
});
