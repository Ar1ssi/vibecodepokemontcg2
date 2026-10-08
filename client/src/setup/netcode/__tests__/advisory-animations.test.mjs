import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advisoryAnimationPlan,
  coinFlipRuns,
  dealShuffles,
  effectKnockoutIds,
  EVENT_FX,
  SOUND_ONLY_FX,
  supersededDeals,
} from '../advisory-animations.mjs';
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
    ruleBoxes: 0,
  });
  assert.deepEqual(advisoryAnimationPlan(event, 'p2'), {
    kind: 'knockout',
    user: 'opp',
    instanceId: 42,
    ruleBoxes: 0,
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
    if (SOUND_ONLY_FX.has(effect)) continue;
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
  assert.deepEqual(plan, {
    kind: 'fx',
    effect: 'turn-banner',
    user: 'opp',
    player: 'p2',
    number: 3,
    awaitScenes: true,
  });
});

test('advisoryAnimationPlan: the turn passing and the game ending wait for scenes on screen', () => {
  assert.equal(advisoryAnimationPlan({ type: 'turnStarted', player: 'p2' }, 'p1').awaitScenes, true);
  assert.equal(advisoryAnimationPlan({ type: 'gameEnded', winner: 'p1' }, 'p1').awaitScenes, true);
  const [banner, move] = advisoryAnimationPlan({ type: 'attackExecuted', playerId: 'p1' }, 'p1');
  assert.equal(banner.awaitScenes, undefined);
  assert.equal(move.awaitScenes, undefined);
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

test('advisoryAnimationPlan: taken prizes naming cards burst, then fly into the hand (design 045)', () => {
  const plans = advisoryAnimationPlan(
    { type: 'prizesTaken', playerId: 'p2', count: 2, cards: [{ instanceId: 30 }, 31] },
    'p1'
  );
  assert.equal(plans.length, 2);
  assert.equal(plans[0].effect, 'prize-claim');
  assert.equal(plans[0].user, 'opp');
  assert.deepEqual(plans[1], {
    kind: 'draw',
    user: 'opp',
    cards: [{ instanceId: 30 }, { instanceId: 31 }],
    count: 2,
    source: 'prizes',
  });
  const unknownSide = advisoryAnimationPlan({ type: 'prizesTaken', playerId: 'p2', cards: [{ instanceId: 30 }] }, null);
  assert.equal(unknownSide.kind, 'fx');
});

test('advisoryAnimationPlan: every coin event shape plays the coin ceremony with its faces', () => {
  const cases = [
    [{ type: 'coinFlipped', playerId: 'p2', face: 'tails', source: 'Burned' }, ['tails']],
    [{ type: 'coinFlipped', playerId: 'p1', face: 'tails', heads: 1 }, ['heads', 'tails']],
    [{ type: 'attackCoinFlipped', playerId: 'p1', attackName: 'Double Kick', flips: ['heads', 'heads'] }, ['heads', 'heads']],
    [{ type: 'attackMarkerCoinFlipped', playerId: 'p1', kind: 'attackFlipOrFail', coin: 'tails' }, ['tails']],
    [{ type: 'attackFlipGateCoinFlipped', playerId: 'p1', coin: 'heads' }, ['heads']],
  ];
  for (const [event, faces] of cases) {
    const plan = advisoryAnimationPlan(event, 'p1');
    assert.equal(plan.kind, 'fx', event.type);
    assert.equal(plan.effect, 'coin-flip', event.type);
    assert.deepEqual(plan.faces, faces, event.type);
  }
  const attack = advisoryAnimationPlan(cases[2][0], 'p1');
  assert.equal(attack.attackName, 'Double Kick', 'the ceremony names the attack');
  assert.equal(advisoryAnimationPlan(cases[0][0], 'p1').source, 'Burned');
  assert.equal(advisoryAnimationPlan({ type: 'attackCoinFlipped', playerId: 'p1', flips: [] }, 'p1'), null);
});

test('coinFlipRuns: back-to-back single flips by one player and source play as one ceremony', () => {
  const a = { type: 'coinFlipped', playerId: 'p1', face: 'heads', source: 'Asleep' };
  const b = { type: 'coinFlipped', playerId: 'p1', face: 'tails', source: 'Asleep' };
  const otherPlayer = { type: 'coinFlipped', playerId: 'p2', face: 'heads', source: 'Asleep' };
  const gap = { type: 'statusCleared', playerId: 'p2', condition: 'Asleep' };
  const c = { type: 'coinFlipped', playerId: 'p2', face: 'tails', source: 'Asleep' };
  const streak = { type: 'coinFlipped', playerId: 'p2', face: 'tails', heads: 2 };
  const runs = coinFlipRuns([a, b, otherPlayer, gap, c, streak]);

  assert.deepEqual(runs.get(a), ['heads', 'tails']);
  assert.deepEqual(runs.get(b), []);
  assert.deepEqual(runs.get(otherPlayer), ['heads'], 'another player starts a new ceremony');
  assert.deepEqual(runs.get(c), ['tails'], 'any other event in between splits the run');
  assert.equal(runs.has(streak), false, 'a counted streak already carries its own faces');

  assert.deepEqual(advisoryAnimationPlan(a, 'p1', runs.get(a)).faces, ['heads', 'tails']);
  assert.equal(advisoryAnimationPlan(b, 'p1', runs.get(b)), null, 'folded flips plan nothing');
  assert.equal(coinFlipRuns(null).size, 0);
});

test('the opening deal shuffles animate; a search effect deck shuffle does not', () => {
  // shared/engine/setup.mjs emits, per player: deckShuffled, openingHandDealt, prizesSet.
  const shuffleA = { type: 'deckShuffled', playerId: 'A' };
  const shuffleB = { type: 'deckShuffled', playerId: 'B' };
  const searchShuffle = { type: 'deckShuffled', playerId: 'A' };
  const events = [
    shuffleA,
    { type: 'openingHandDealt', playerId: 'A', cards: [] },
    { type: 'prizesSet', playerId: 'A' },
    shuffleB,
    { type: 'openingHandDealt', playerId: 'B', cards: [] },
    searchShuffle,
    { type: 'cardsDrawn', playerId: 'A', cards: [] },
  ];
  const shuffles = dealShuffles(events);
  assert.deepEqual([...shuffles], [shuffleA, shuffleB]);

  assert.deepEqual(advisoryAnimationPlan(shuffleA, 'A', undefined, { dealShuffle: true }), {
    kind: 'shuffle',
    user: 'self',
    zoneId: 'deck',
  });
  assert.equal(advisoryAnimationPlan(shuffleB, 'A', undefined, { dealShuffle: true }).user, 'opp');
  // Not a deal: no flight, only the shuffle sound (design 064).
  assert.deepEqual(advisoryAnimationPlan(searchShuffle, 'A'), {
    kind: 'fx',
    user: 'self',
    effect: 'search-shuffle',
  });
  assert.deepEqual([...dealShuffles(null)], []);
});

test('design 064: prizesSet and retreatBlocked plan as sound-only fx for their player', () => {
  assert.deepEqual(advisoryAnimationPlan({ type: 'prizesSet', playerId: 'p2', count: 6 }, 'p1'), {
    kind: 'fx',
    user: 'opp',
    effect: 'prizes-set',
    count: 6,
  });
  const blocked = advisoryAnimationPlan({ type: 'retreatBlocked', playerId: 'p1', instanceId: 7 }, 'p1');
  assert.equal(blocked.effect, 'retreat-blocked');
  assert.equal(blocked.user, 'self');
  for (const effect of ['search-shuffle', 'prizes-set', 'retreat-blocked']) {
    assert.ok(SOUND_ONLY_FX.has(effect), effect);
  }
});

test('design 064: a knockout plan carries how many rule boxes the victim had', () => {
  const event = { type: 'pokemonKnockedOut', instanceId: 5, playerId: 'p2', ruleBoxes: ['ex', 'tera'] };
  assert.equal(advisoryAnimationPlan(event, 'p1').ruleBoxes, 2);
  assert.equal(advisoryAnimationPlan({ ...event, ruleBoxes: undefined }, 'p1').ruleBoxes, 0);
});

test('design 064: entries during the opening placement are tagged setup', () => {
  const move = { type: 'cardMoved', instanceId: 'c1', from: 'hand', to: 'active', playerId: 'p1' };
  assert.equal(advisoryAnimationPlan(move, 'p1').setup, undefined);
  assert.equal(advisoryAnimationPlan(move, 'p1', undefined, { setup: true }).setup, true);
});

test('design 064: attack lock, deferred-KO marker and resolution plan as sound-only fx', () => {
  const lock = advisoryAnimationPlan({ type: 'playLockApplied', playerId: 'p2', kinds: ['item'], untilTurn: 4 }, 'p1');
  assert.equal(lock.effect, 'play-lock');
  assert.deepEqual(lock.kinds, ['item']);
  assert.deepEqual(
    advisoryAnimationPlan({ type: 'attackMarkerAdded', kind: 'deferredKnockOut', instanceId: 7, playerId: 'p2' }, 'p1'),
    { kind: 'fx', effect: 'attack-marker', user: 'opp', instanceId: 7, markerKind: 'deferredKnockOut' }
  );
  const resolved = advisoryAnimationPlan({ type: 'deferredKnockOut', instanceId: 7, playerId: 'p2' }, 'p1');
  assert.equal(resolved.effect, 'deferred-ko');
  for (const effect of ['play-lock', 'deferred-ko', 'attack-marker']) assert.ok(SOUND_ONLY_FX.has(effect), effect);
});

test('design 064: effectKnockoutIds keeps knockouts no damage or deferred marker caused', () => {
  assert.deepEqual([...effectKnockoutIds([{ type: 'damageUpdated', instanceId: 3 }, { type: 'pokemonKnockedOut', instanceId: 3 }])], []);
  assert.deepEqual([...effectKnockoutIds([{ type: 'pokemonKnockedOut', instanceId: 4 }])], [4]);
  assert.deepEqual(
    [...effectKnockoutIds([{ type: 'deferredKnockOut', instanceId: 5 }, { type: 'pokemonKnockedOut', instanceId: 5 }])],
    []
  );
  assert.deepEqual([...effectKnockoutIds([])], []);
  assert.deepEqual([...effectKnockoutIds(null)], []);
});

test('design 064: a knockout plan carries effectKo only for the batch ids', () => {
  const event = { type: 'pokemonKnockedOut', instanceId: 4, playerId: 'p2' };
  assert.equal(advisoryAnimationPlan(event, 'p1', undefined, { effectKo: new Set([4]) }).effectKo, true);
  assert.equal('effectKo' in advisoryAnimationPlan(event, 'p1', undefined, { effectKo: new Set([9]) }), false);
  assert.equal('effectKo' in advisoryAnimationPlan(event, 'p1'), false);
});

test('design 064: GX and VSTAR use become sound-only crowd plans that keep their plan kind', () => {
  const gx = advisoryAnimationPlan({ type: 'gxAttackUsed', playerId: 'p1', instanceId: 5, attackName: 'X-GX' }, 'p1');
  assert.deepEqual(gx, { kind: 'fx', effect: 'gx-used', user: 'self', instanceId: 5, attackName: 'X-GX' });
  const vstar = advisoryAnimationPlan(
    { type: 'vstarUsed', playerId: 'p2', instanceId: 6, kind: 'vstar', attackName: 'Star Birth' },
    'p1'
  );
  assert.equal(vstar.kind, 'fx', 'the event own kind must not replace the plan kind');
  assert.equal(vstar.effect, 'vstar-used');
  assert.equal(vstar.user, 'opp');
  for (const effect of ['gx-used', 'vstar-used']) assert.ok(SOUND_ONLY_FX.has(effect), effect);
});
