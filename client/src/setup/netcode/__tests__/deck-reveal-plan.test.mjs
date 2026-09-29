// Design 059: a batch's deck → hand reveals become one `reveal` plan per player,
// for the revealer and the opponent alike. The last test runs the real engine so
// the planner is checked against the events a server actually sends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advisoryAnimationPlan, deckRevealRuns } from '../advisory-animations.mjs';
import { createGameState, createPlayerZones } from '../../../../../shared/engine/state.mjs';
import { createCard } from '../../../../../shared/engine/cards.mjs';
import { createRng } from '../../../../../shared/engine/rng.mjs';
import { applyCommand } from '../../../../../shared/engine/reduce.mjs';

const moved = (instanceId, playerId = 'p1', from = 'deck', to = 'hand') => ({
  type: 'cardMoved',
  instanceId,
  from,
  to,
  playerId,
});
const revealed = (cards, playerId = 'p1', extra = {}) => ({
  type: 'cardsRevealed',
  playerId,
  cards: cards.map((id) => (typeof id === 'object' ? id : { instanceId: id, name: `Card ${id}`, src: `/img/${id}.png` })),
  ...extra,
});

const planFor = (events, selfPlayerId) => {
  const runs = deckRevealRuns(events);
  return events
    .map((event) => advisoryAnimationPlan(event, selfPlayerId, undefined, { revealRun: runs.get(event) }))
    .filter((plan) => plan?.kind === 'reveal');
};

test('deckRevealRuns: a search that moves two cards and reveals them is one group', () => {
  const reveal = revealed([31, 32]);
  const events = [moved(31), moved(32), reveal, { type: 'deckShuffled', playerId: 'p1' }];
  const runs = deckRevealRuns(events);
  assert.deepEqual(
    runs.get(reveal).map((c) => c.instanceId),
    [31, 32]
  );
  assert.equal(runs.size, 1);
});

test('deckRevealRuns: one reveal per card (Drayton) plays once, with every card, no duplicates', () => {
  const first = revealed([31]);
  const second = revealed([32]);
  const again = revealed([31]);
  const runs = deckRevealRuns([moved(31), first, moved(32), second, again]);
  assert.deepEqual(runs.get(first).map((c) => c.instanceId), [31, 32]);
  assert.deepEqual(runs.get(second), []);
  assert.deepEqual(runs.get(again), []);
});

test('deckRevealRuns: the reveal may come before the move (Random Receiver); only the card taken flies', () => {
  const reveal = revealed([40, 41, 31]);
  const runs = deckRevealRuns([reveal, moved(31)]);
  assert.deepEqual(runs.get(reveal).map((c) => c.instanceId), [31]);
});

test('deckRevealRuns: hand reveals, peeks, one-player reveals, bench picks and other players do not fly', () => {
  const handReveal = revealed([31], 'p1', { hand: true });
  const peek = revealed([31], 'p1', { peek: true });
  const privateLook = revealed([31], 'p1', { revealedTo: 'p2' });
  const bench = revealed([33]);
  const otherPlayer = revealed([31], 'p2');
  const runs = deckRevealRuns([
    moved(31),
    moved(33, 'p1', 'deck', 'bench'),
    handReveal,
    peek,
    privateLook,
    bench,
    otherPlayer,
  ]);
  assert.equal(runs.size, 0);
});

test('deckRevealRuns: each player gets their own group', () => {
  const mine = revealed([31]);
  const theirs = revealed([51], 'p2');
  const runs = deckRevealRuns([moved(31), mine, moved(51, 'p2'), theirs]);
  assert.deepEqual(runs.get(mine).map((c) => c.instanceId), [31]);
  assert.deepEqual(runs.get(theirs).map((c) => c.instanceId), [51]);
});

test('deckRevealRuns: malformed batches plan nothing and never throw', () => {
  assert.equal(deckRevealRuns(null).size, 0);
  assert.equal(deckRevealRuns([null, 7, { type: 'cardsRevealed' }]).size, 0);
  const bare = { type: 'cardsRevealed', playerId: 'p1', cards: [31, null, { name: 'no id' }] };
  const notAList = { type: 'cardsRevealed', playerId: 'p1', cards: 'x' };
  const runs = deckRevealRuns([moved(31), bare, notAList]);
  assert.deepEqual(runs.get(bare), [{ instanceId: 31 }]);
  assert.equal(runs.has(notAList), false);
});

test('advisoryAnimationPlan: the group leader plans the reveal for its side; followers plan nothing', () => {
  const first = revealed([31]);
  const second = revealed([32]);
  const events = [moved(31), first, moved(32), second];
  const runs = deckRevealRuns(events);
  const mine = advisoryAnimationPlan(first, 'p1', undefined, { revealRun: runs.get(first) });
  assert.deepEqual(mine, {
    kind: 'reveal',
    user: 'self',
    cards: [
      { instanceId: 31, name: 'Card 31', src: '/img/31.png' },
      { instanceId: 32, name: 'Card 32', src: '/img/32.png' },
    ],
  });
  assert.equal(advisoryAnimationPlan(second, 'p1', undefined, { revealRun: runs.get(second) }), null);
  assert.equal(advisoryAnimationPlan(first, 'p2', undefined, { revealRun: runs.get(first) }).user, 'opp');
});

test('advisoryAnimationPlan: a reveal outside a group, or without a known seat, plans nothing', () => {
  const reveal = revealed([31]);
  assert.equal(advisoryAnimationPlan(reveal, 'p1'), null);
  assert.equal(advisoryAnimationPlan(reveal, null, undefined, { revealRun: [{ instanceId: 31 }] }), null);
  assert.equal(advisoryAnimationPlan({ ...reveal, playerId: undefined }, 'p1', undefined, { revealRun: [{ instanceId: 31 }] }), null);
});

// Ultra Ball (30th Celebration 128), through the real engine.
const ULTRA_BALL =
  'You can use this card only if you discard 2 other cards from your hand. Search your deck for a Pokémon, reveal it, and put it into your hand. Then, shuffle your deck.';

function ultraBallSearchEvents() {
  const rng = createRng(7);
  const state = createGameState({ gameId: 'reveal-plan', seed: 7, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
    state.players[id].zones.active.push(
      createCard({ instanceId: id === 'p1' ? 1 : 2, name: 'Active', hp: 90, supertype: 'Pokémon', stage: 'Basic' })
    );
  }
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  state.players.p1.zones.hand.push(
    createCard({ instanceId: 7, name: 'Ultra Ball', supertype: 'Trainer', trainerType: 'Item', type: 'Trainer', text: ULTRA_BALL }),
    createCard({ instanceId: 15, name: 'Fodder A', supertype: 'Trainer', trainerType: 'Item', type: 'Trainer' }),
    createCard({ instanceId: 16, name: 'Fodder B', supertype: 'Trainer', trainerType: 'Item', type: 'Trainer' })
  );
  state.players.p1.zones.deck.push(
    createCard({ instanceId: 31, name: 'Raichu', hp: 120, supertype: 'Pokémon', stage: 'Stage 1', src: '/img/raichu.png' })
  );
  const step = (s, type, payload) => {
    const res = applyCommand(s, { type, payload, playerId: 'p1' }, rng);
    assert.equal(res.error, null);
    return res;
  };
  const played = step(state, 'playTrainer', { instanceId: 7 });
  const paid = step(played.state, 'resolveChoice', { choiceId: played.pendingChoice.choiceId, selection: [15, 16] });
  return step(paid.state, 'resolveChoice', { choiceId: paid.pendingChoice.choiceId, selection: [31] }).events;
}

test('engine → planner: Ultra Ball\'s search plays the reveal for the revealer and for the opponent', () => {
  const events = ultraBallSearchEvents();
  const card = { instanceId: 31, name: 'Raichu', src: '/img/raichu.png' };
  assert.deepEqual(planFor(events, 'p1'), [{ kind: 'reveal', user: 'self', cards: [card] }]);
  assert.deepEqual(planFor(events, 'p2'), [{ kind: 'reveal', user: 'opp', cards: [card] }]);
});
