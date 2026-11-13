// Design 089 D5: board moments the engine reported and nothing showed now plan an effect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_FX,
  SOUND_ONLY_FX,
  advisoryAnimationPlan,
  attackLeads,
  attackPowers,
  conditionChanges,
  deckRevealRuns,
  pileToHandRuns,
  transitCardIds,
} from '../advisory-animations.mjs';
import { HOLD_MS } from '../mat-fx/fx-holds.mjs';
import { deckSweepSource, pileTransitOf } from '../mat-fx/lifecycle-pose.mjs';
import { cuesFor } from '../mat-fx/sfx-cues.mjs';

test('prevented damage and a survived Knock Out plan the shield on their card', () => {
  const prevented = advisoryAnimationPlan({ type: 'damagePrevented', instanceId: 20, attackName: 'Hit', reason: 'special-energy-effect' }, 'p1');
  assert.deepEqual(prevented, { kind: 'fx', effect: 'block', user: null, instanceId: 20, attackName: 'Hit', reason: 'special-energy-effect' });
  const survived = advisoryAnimationPlan({ type: 'koPrevented', instanceId: 20, tool: 'Focus Sash', surviveHp: 10 }, 'p1');
  assert.equal(survived.effect, 'block');
  assert.equal(survived.survived, true);
});

test('an attack that does not happen plans its failure, with why', () => {
  const causes = {
    attackPrevented: 'prevented',
    attackConditionFailed: 'condition',
    attackConfusedFizzle: 'confused',
    attackCopyNothing: 'nothing-to-copy',
  };
  for (const [type, cause] of Object.entries(causes)) {
    const plan = advisoryAnimationPlan({ type, playerId: 'p2', attackerId: 5, attackName: 'Hit' }, 'p1');
    assert.equal(plan.effect, 'attack-fail', type);
    assert.equal(plan.cause, cause, type);
    assert.equal(plan.user, 'opp', type);
    assert.equal(plan.attackerId, 5, type);
  }
  // The Bench part of an attack fizzling is not the attack failing: it still executes.
  assert.equal(advisoryAnimationPlan({ type: 'attackBenchFizzled', playerId: 'p1', attackName: 'Hit' }, 'p1'), null);
});

test('a fully prevented attack still plays before its shield', () => {
  const started = { type: 'attackStarted', playerId: 'p1', attackerId: 1, defenderId: 20, attackName: 'Hit' };
  const prevented = { type: 'damagePrevented', instanceId: 20, attackName: 'Hit', reason: 'ability' };
  const attack = { type: 'attackExecuted', playerId: 'p1', attackerId: 1, defenderId: 20, attackName: 'Hit', damage: 0 };
  assert.equal(attackLeads([started, prevented, attack]).get(prevented), attack);
});

test('everything that touches the Prize cards pulses them for their player', () => {
  for (const type of ['prizesRevealed', 'prizeSwapped', 'prizesReset', 'prizesRedrawn', 'prizeHandSwapped', 'prizesShuffledToDeckBottom']) {
    const plan = advisoryAnimationPlan({ type, playerId: 'p1', count: 1 }, 'p1');
    assert.equal(plan.effect, 'prize-pulse', type);
    assert.equal(plan.user, 'self', type);
  }
});

test('every new effect has a hold and a voice, and none is sound-only', () => {
  for (const effect of ['block', 'retreat-blocked', 'attack-fail', 'prize-pulse', 'prizes-set', 'transit', 'pile-catch']) {
    assert.ok(Object.hasOwn(HOLD_MS, effect), `${effect} has no hold`);
    assert.ok(!SOUND_ONLY_FX.has(effect), `${effect} is listed as sound-only`);
    assert.ok(cuesFor(effect, { user: 'self' }).length > 0, `${effect} has no cue`);
  }
  for (const effect of ['block', 'attack-fail', 'prize-pulse']) assert.ok(Object.values(EVENT_FX).includes(effect));
});

test('a card moved into the deck or the Lost Zone flies there; a named group leaves those cards to their own moves', () => {
  const toDeck = { type: 'cardMoved', playerId: 'p1', instanceId: 7, from: 'hand', to: 'deck' };
  assert.deepEqual(advisoryAnimationPlan(toDeck, 'p1'), { kind: 'fx', effect: 'transit', user: 'self', instanceId: 7, from: 'hand', to: 'deck', cards: [7] });
  assert.deepEqual(pileTransitOf(toDeck), { to: 'deck', ids: [7] });
  assert.equal(pileTransitOf({ type: 'cardMoved', playerId: 'p1', instanceId: 7, from: 'hand', to: 'discard' }), null);

  const lost = { type: 'cardsLostZoned', playerId: 'p2', count: 2, cards: [{ instanceId: 8, name: 'A' }, { instanceId: 9, name: 'B' }] };
  assert.deepEqual(pileTransitOf(lost), { to: 'lostZone', ids: [8, 9] });
  assert.deepEqual(advisoryAnimationPlan(lost, 'p1'), { kind: 'fx', effect: 'transit', user: 'opp', to: 'lostZone', cards: [8, 9] });
  const moved = { type: 'cardMoved', playerId: 'p2', instanceId: 8, from: 'active', to: 'lostZone' };
  const taken = transitCardIds([moved, lost]);
  assert.deepEqual([...taken], [8]);
  assert.deepEqual(advisoryAnimationPlan(lost, 'p1', undefined, { transitTaken: taken }).cards, [9]);
  assert.equal(advisoryAnimationPlan(lost, 'p1', undefined, { transitTaken: new Set([8, 9]) }), null);
  // No cards named: the pile only lights.
  assert.deepEqual(advisoryAnimationPlan({ type: 'cardsPutInDeck', playerId: 'p1' }, 'p1'), { kind: 'fx', effect: 'pile-catch', user: 'self', zoneId: 'deck' });
});

test('a hand put into the deck sweeps there, then shuffles, then its draw flies in', () => {
  const judge = { type: 'cardsShuffledIntoDeck', count: 5, playerId: 'p1', from: 'hand' };
  assert.equal(deckSweepSource(judge), 'hand');
  assert.deepEqual(advisoryAnimationPlan(judge, 'p1', undefined, { shuffleSound: 'search-shuffle' }), [
    { kind: 'fx', effect: 'transit', user: 'self', to: 'deck', sweep: 'hand' },
    { kind: 'shuffle', user: 'self', zoneId: 'deck', sound: 'search-shuffle' },
  ]);
  const manual = { type: 'handShuffledIntoDeckAndDrawn', returned: 4, drawn: [{ instanceId: 31 }, { instanceId: 32 }], playerId: 'p2' };
  assert.deepEqual(advisoryAnimationPlan(manual, 'p1', undefined, { shuffleSound: 'search-shuffle' }), [
    { kind: 'fx', effect: 'transit', user: 'opp', to: 'deck', sweep: 'hand' },
    { kind: 'shuffle', user: 'opp', zoneId: 'deck', sound: 'search-shuffle' },
    { kind: 'draw', user: 'opp', cards: [{ instanceId: 31 }, { instanceId: 32 }], count: 2 },
  ]);
  // From the discard pile nothing is on screen to fly; an event of another kind is no sweep.
  assert.equal(deckSweepSource({ type: 'cardsShuffledIntoDeck', count: 2, playerId: 'p1', from: 'discard' }), null);
  assert.equal(deckSweepSource({ type: 'cardsMovedToDeck', count: 1, playerId: 'p1', from: 'bench' }), 'bench');
  assert.equal(deckSweepSource({ type: 'cardsDrawn', playerId: 'p1' }), undefined);
  // An event without a player plans nothing.
  assert.equal(advisoryAnimationPlan({ type: 'cardsMovedToDeckTop', count: 1, from: 'hand' }, 'p1'), null);
});

test('cards taken out of a pile into the hand fly in as one draw per player and pile', () => {
  const events = [
    { type: 'cardMoved', playerId: 'p1', instanceId: 40, from: 'deck', to: 'hand' },
    { type: 'cardMoved', playerId: 'p1', instanceId: 41, from: 'deck', to: 'hand' },
    { type: 'cardMoved', playerId: 'p1', instanceId: 42, from: 'discard', to: 'hand' },
    { type: 'cardMoved', playerId: 'p2', instanceId: 43, from: 'deck', to: 'hand' },
    { type: 'cardMoved', playerId: 'p1', instanceId: 44, from: 'bench', to: 'hand' },
  ];
  const runs = pileToHandRuns(events);
  assert.deepEqual(runs.get(events[0]), { source: 'deck', cards: [{ instanceId: 40 }, { instanceId: 41 }] });
  assert.deepEqual(runs.get(events[1]), { source: 'deck', cards: [] });
  assert.equal(runs.has(events[4]), false);
  const plan = (event, self = 'p1') => advisoryAnimationPlan(event, self, undefined, { handRun: runs.get(event) ?? null });
  assert.deepEqual(plan(events[0]), { kind: 'draw', user: 'self', cards: [{ instanceId: 40 }, { instanceId: 41 }], count: 2 });
  assert.equal(plan(events[1]), null);
  assert.deepEqual(plan(events[2]), { kind: 'draw', user: 'self', cards: [{ instanceId: 42 }], count: 1, source: 'discard' });
  assert.equal(plan(events[3]).user, 'opp');
  assert.equal(plan(events[4]), null);
});

test('a card a draw or a deck reveal already flies is not flown twice', () => {
  const moved = { type: 'cardMoved', playerId: 'p1', instanceId: 50, from: 'deck', to: 'hand' };
  const revealed = { type: 'cardsRevealed', playerId: 'p1', cards: [{ instanceId: 50, name: 'Raichu' }] };
  assert.equal(pileToHandRuns([moved, revealed], deckRevealRuns([moved, revealed])).size, 0);
  const drawn = { type: 'cardsDrawn', playerId: 'p1', cards: [{ instanceId: 51 }] };
  const alsoMoved = { type: 'cardMoved', playerId: 'p1', instanceId: 51, from: 'deck', to: 'hand' };
  assert.equal(pileToHandRuns([alsoMoved, drawn]).size, 0);
  assert.equal(pileToHandRuns(null).size, 0);
});

test('a Special Condition update pops what it added and clears what it removed, once', () => {
  const poison = { type: 'specialConditionUpdated', instanceId: 20, condition: 'Poisoned', conditions: ['Poisoned', 'Asleep'] };
  const cure = { type: 'specialConditionUpdated', instanceId: 20, condition: null, conditions: [] };
  const changes = conditionChanges([poison, cure], new Map([[20, ['Asleep']]]));
  assert.deepEqual(changes.get(poison), [{ kind: 'fx', effect: 'status', user: null, instanceId: 20, condition: 'Poisoned' }]);
  assert.deepEqual(
    changes.get(cure).map((plan) => [plan.effect, plan.condition]),
    [
      ['status-clear', 'Poisoned'],
      ['status-clear', 'Asleep'],
    ]
  );
  assert.deepEqual(advisoryAnimationPlan(poison, 'p1', undefined, { conditionPlans: changes.get(poison) }), changes.get(poison));
  assert.equal(advisoryAnimationPlan(poison, 'p1'), null);
});

test('a condition the batch already announced is not announced twice; a bare condition adds to what the card had', () => {
  const applied = { type: 'statusApplied', instanceId: 21, condition: 'Burned', playerId: 'p2' };
  const updated = { type: 'specialConditionUpdated', instanceId: 21, condition: 'Burned', conditions: ['Burned'] };
  assert.equal(conditionChanges([applied, updated]).size, 0);
  const bare = { type: 'specialConditionUpdated', instanceId: 22, condition: 'Poisoned' };
  const changes = conditionChanges([bare], new Map([[22, ['Burned']]]));
  assert.deepEqual(changes.get(bare).map((plan) => [plan.effect, plan.condition]), [['status', 'Poisoned']]);
  assert.equal(conditionChanges(null).size, 0);
});

test('an attack that spent the GX attack or the VSTAR Power carries it on its plans', () => {
  const attack = { type: 'attackExecuted', playerId: 'p1', attackerId: 1, defenderId: 20, attackName: 'Burst GX', damage: 200 };
  const gx = { type: 'gxAttackUsed', playerId: 'p1', instanceId: 1, attackName: 'Burst GX' };
  const powers = attackPowers([attack, gx]);
  assert.equal(powers.get(attack), 'gx');
  const plans = advisoryAnimationPlan(attack, 'p1', undefined, { power: powers.get(attack) });
  assert.deepEqual(plans.map((plan) => [plan.effect, plan.power]), [['attack-banner', 'gx'], ['attack', 'gx']]);

  const vstarAttack = { ...attack, attackName: 'Star Requiem' };
  const vstar = { type: 'vstarUsed', playerId: 'p1', instanceId: 1, kind: 'vstar', attackName: 'Star Requiem' };
  assert.equal(attackPowers([vstarAttack, vstar]).get(vstarAttack), 'vstar');
  // A VSTAR Power that is an Ability names no attack; another player's spend is not this attack's.
  assert.equal(attackPowers([attack, { type: 'vstarUsed', playerId: 'p1', instanceId: 1, kind: 'vstar' }]).size, 0);
  assert.equal(attackPowers([attack, { ...gx, playerId: 'p2' }]).size, 0);
  assert.equal(attackPowers([attack, { type: 'turnStarted', player: 'p2' }, gx]).size, 0);
});
