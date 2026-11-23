// Homebrew set customhb HB 301 Dusk Ball (set.json record customhb-301, from cardback; the user's
// edit of sv08-175): "Search your deck for a {D} Pokémon, reveal it, and put it into your hand.
// Shuffle your deck afterward." The text is the set.json effect, verbatim. The card is built the
// way cardStats hands it to the engine: `text` from the record's effect, its trainerType.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

const DUSK_BALL_RECORD = {
  id: 'customhb-301',
  localId: '301',
  name: 'Dusk Ball',
  category: 'Trainer',
  trainerType: 'Item',
  effect: 'Search your deck for a {D} Pokémon, reveal it, and put it into your hand. Shuffle your deck afterward.',
};

let nextId = 1;
const mon = (name, types, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 100, types, ...extra });
const duskBall = () =>
  createCard({
    instanceId: nextId++,
    id: DUSK_BALL_RECORD.id,
    name: DUSK_BALL_RECORD.name,
    supertype: 'Trainer',
    subtypes: [DUSK_BALL_RECORD.trainerType],
    type: DUSK_BALL_RECORD.trainerType,
    trainerType: DUSK_BALL_RECORD.trainerType,
    text: DUSK_BALL_RECORD.effect,
  });

function game() {
  nextId = 1;
  const state = createGameState({ gameId: 'customhb-dusk-ball', seed: 3, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`, ['Colorless']));
    state.players[id].zones.active.push(mon(`${id} active`, ['Colorless']));
  }
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  return state;
}

const run = (state, type, payload, seed = 3) => applyCommand(state, { type, playerId: 'p1', payload }, createRng(seed));

test('Dusk Ball offers only the {D} Pokémon in the deck and puts the chosen one into the hand', () => {
  const state = game();
  const darkBasic = mon('Umbreon', ['Darkness'], { stage: 'Stage 1', evolvesFrom: 'Eevee' });
  const darkEx = mon('Darkrai ex', ['Darkness']);
  const psychic = mon('Mew', ['Psychic']);
  const darkEnergy = createCard({
    instanceId: nextId++, name: 'Basic Darkness Energy', supertype: 'Energy', subtypes: ['Basic'], energyType: 'Darkness',
  });
  const item = createCard({ instanceId: nextId++, name: 'Potion', supertype: 'Trainer', subtypes: ['Item'], trainerType: 'Item', text: 'x' });
  state.players.p1.zones.deck.push(psychic, darkBasic, darkEnergy, item, darkEx);
  const ball = duskBall();
  state.players.p1.zones.hand.push(ball);

  let res = run(state, 'playTrainer', { instanceId: ball.instanceId });
  assert.equal(res.error ?? null, null, res.reason);
  const choice = res.state.pendingChoice;
  assert.ok(choice, 'Dusk Ball asks which {D} Pokémon to take');
  assert.deepEqual(
    choice.options.map((o) => o.instanceId).sort((a, b) => a - b),
    [darkBasic.instanceId, darkEx.instanceId].sort((a, b) => a - b)
  );

  res = run(res.state, 'resolveChoice', { choiceId: choice.choiceId, selection: [darkEx.instanceId] }, 4);
  assert.equal(res.error ?? null, null, res.reason);
  const p1 = res.state.players.p1.zones;
  assert.deepEqual(p1.hand.map((c) => c.instanceId), [darkEx.instanceId]);
  assert.equal(p1.deck.length, 4);
  assert.ok(!p1.deck.some((c) => c.instanceId === darkEx.instanceId));
  assert.ok(p1.discard.some((c) => c.instanceId === ball.instanceId), 'Dusk Ball goes to the discard pile');
  const eventTypes = res.events.map((e) => e.type);
  assert.deepEqual(
    res.events.find((e) => e.type === 'cardsRevealed')?.cards.map((c) => c.instanceId),
    [darkEx.instanceId],
    'the chosen Pokémon is revealed'
  );
  assert.ok(eventTypes.indexOf('deckShuffled') > eventTypes.indexOf('cardMoved'), 'the deck is shuffled afterward');
});

test('Dusk Ball takes only one {D} Pokémon', () => {
  const state = game();
  const a = mon('Darkrai', ['Darkness']);
  const b = mon('Zorua', ['Darkness']);
  state.players.p1.zones.deck.push(a, b);
  const ball = duskBall();
  state.players.p1.zones.hand.push(ball);

  const res = run(state, 'playTrainer', { instanceId: ball.instanceId });
  const choice = res.state.pendingChoice;
  assert.ok(choice);
  assert.equal(choice.max, 1);
  const both = run(res.state, 'resolveChoice', { choiceId: choice.choiceId, selection: [a.instanceId, b.instanceId] }, 4);
  assert.equal(both.error, 'invalid_selection', 'two picks are refused');
});

test('Dusk Ball with no {D} Pokémon in the deck takes nothing and still shuffles', () => {
  const state = game();
  const psychic = mon('Mew', ['Psychic']);
  state.players.p1.zones.deck.push(psychic, mon('Pikachu', ['Lightning']));
  const ball = duskBall();
  state.players.p1.zones.hand.push(ball);

  const res = run(state, 'playTrainer', { instanceId: ball.instanceId });
  assert.equal(res.error ?? null, null, res.reason);
  assert.equal(res.state.pendingChoice ?? null, null, 'nothing to choose');
  assert.ok(res.events.some((e) => e.type === 'deckShuffled'));
  assert.equal(res.state.players.p1.zones.hand.length, 0);
  assert.equal(res.state.players.p1.zones.deck.length, 2);
});
