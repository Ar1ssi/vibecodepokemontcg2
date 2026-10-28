// Gardevoir ASR TG05 Shining Arcana (pkmncards corpus, out/pkmn-pokemon-cards.json): "Once during
// your turn, you may look at the top 2 cards of your deck and attach any number of basic Energy
// cards you find there to your Pokémon in any way you like. Put the other cards into your hand."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAbility } from '../rules/abilities.mjs';

const TEXT =
  'Once during your turn, you may look at the top 2 cards of your deck and attach any number of basic Energy cards you find there to your Pokémon in any way you like. Put the other cards into your hand.';

function game(deckCards) {
  const rng = createRng(42);
  const state = createGameState({ gameId: 'shining-arcana', seed: 42, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
  }
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  const p1 = state.players.p1.zones;
  p1.active.push(createCard({ instanceId: 1, name: 'Active', supertype: 'Pokémon', stage: 'Basic', hp: 100 }));
  p1.bench.push(
    createCard({
      instanceId: 10, name: 'Gardevoir', supertype: 'Pokémon', stage: 'Stage 2', hp: 150,
      abilities: [{ name: 'Shining Arcana', type: 'Ability', text: TEXT }],
    }),
    createCard({ instanceId: 11, name: 'Other', supertype: 'Pokémon', stage: 'Basic', hp: 60 })
  );
  p1.deck.push(...deckCards, createCard({ instanceId: 190, name: 'Deep Card', supertype: 'Trainer', type: 'Item' }));
  return { state, rng };
}
const basic = (id, name) => createCard({ instanceId: id, name, supertype: 'Energy', type: 'Energy', subtypes: ['Basic'] });
const item = (id) => createCard({ instanceId: id, name: `Item ${id}`, supertype: 'Trainer', type: 'Item' });
const choose = (state, rng, res, selection) =>
  applyCommand(state, { type: 'resolveChoice', payload: { choiceId: res.pendingChoice.choiceId, selection }, playerId: 'p1' }, rng);
const attachedTo = (state, id) =>
  [...state.players.p1.zones.active, ...state.players.p1.zones.bench].filter((c) => c.attachedTo === id).map((c) => c.instanceId);

test('parseAbility reads one look-and-attach step', () => {
  const steps = parseAbility(TEXT);
  assert.deepEqual(steps.map((s) => s.type), ['lookAttachEnergyAbility']);
  assert.equal(steps[0].count, 2);
});

test('Shining Arcana: each chosen Energy goes to the Pokémon the player names; the rest go to hand', () => {
  const { state, rng } = game([basic(100, 'Psychic Energy'), basic(101, 'Fire Energy')]);
  let res = applyCommand(state, { type: 'useAbility', payload: { instanceId: 10 }, playerId: 'p1' }, rng);
  assert.equal(res.error, null);
  assert.deepEqual(res.pendingChoice.options.map((o) => o.instanceId).sort(), [100, 101]);
  assert.equal(res.pendingChoice.min, 0);

  res = choose(res.state, rng, res, [100, 101]);
  assert.equal(res.error, null);
  assert.ok(res.pendingChoice, 'asks where the first Energy goes');
  res = choose(res.state, rng, res, [11]);
  assert.ok(res.pendingChoice, 'asks where the second Energy goes');
  res = choose(res.state, rng, res, [1]);
  assert.equal(res.pendingChoice, null);

  assert.deepEqual(attachedTo(res.state, 11), [100]);
  assert.deepEqual(attachedTo(res.state, 1), [101]);
  assert.equal(res.state.players.p1.zones.hand.length, 0);
  assert.equal(res.state.players.p1.zones.deck[0].instanceId, 190);
});

test('Shining Arcana: unchosen Energy and non-Energy cards go to the hand', () => {
  const { state, rng } = game([basic(100, 'Psychic Energy'), item(101)]);
  let res = applyCommand(state, { type: 'useAbility', payload: { instanceId: 10 }, playerId: 'p1' }, rng);
  assert.deepEqual(res.pendingChoice.options.map((o) => o.instanceId), [100]);
  res = choose(res.state, rng, res, []);
  assert.equal(res.pendingChoice, null);
  assert.deepEqual(res.state.players.p1.zones.hand.map((c) => c.instanceId).sort(), [100, 101]);
});

test('Shining Arcana: with no basic Energy found, the looked-at cards go to the hand', () => {
  const { state, rng } = game([item(100), item(101)]);
  const res = applyCommand(state, { type: 'useAbility', payload: { instanceId: 10 }, playerId: 'p1' }, rng);
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null);
  assert.deepEqual(res.state.players.p1.zones.hand.map((c) => c.instanceId).sort(), [100, 101]);
});
