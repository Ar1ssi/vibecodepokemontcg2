// The card picker's VALID / ALL tabs: a deck search and a discard pick carry their whole pile;
// a top-N look does not, and the opponent never gets it.
// Card text: out/pkmn-trainer-cards.json rows Nest Ball (Paldean Fates 084),
// Pokégear 3.0 (Black Bolt 084), Night Stretcher (Ascended Heroes 196).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { viewFor, viewForSolo } from '../view.mjs';
import { choiceZoneView, isDeckSearchToken } from '../choice-zone-view.mjs';

const TEXT = {
  'Nest Ball': 'Search your deck for a Basic Pokémon and put it onto your Bench. Then, shuffle your deck.',
  'Pokégear 3.0':
    'Look at the top 7 cards of your deck. You may reveal a Supporter card you find there and put it into your hand. Shuffle the other cards back into your deck.',
  'Night Stretcher': 'Put a Pokémon or a Basic Energy card from your discard pile into your hand.',
};

const item = (instanceId, name) =>
  createCard({ instanceId, name, supertype: 'Trainer', type: 'Item', text: TEXT[name], src: `${name}.png` });
const basic = (instanceId, name) =>
  createCard({ instanceId, name, supertype: 'Pokémon', subtypes: ['Basic'], stage: 'Basic', hp: 60, src: `${name}.png` });
const supporter = (instanceId, name) =>
  createCard({ instanceId, name, supertype: 'Trainer', type: 'Supporter', subtypes: ['Supporter'], src: `${name}.png` });

function game() {
  const state = createGameState({ gameId: 'zone-view', seed: 7, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  state.players.p1.zones.active.push(basic(1, 'Pikachu'));
  state.players.p2.zones.active.push(basic(2, 'Eevee'));
  return state;
}

const play = (state, instanceId) =>
  applyCommand(state, { type: 'playTrainer', payload: { instanceId }, playerId: 'p1' });

test('Nest Ball: the searcher sees the whole deck under ALL; the opponent sees none of it', () => {
  const state = game();
  state.players.p1.zones.hand.push(item(10, 'Nest Ball'));
  state.players.p1.zones.deck.push(basic(20, 'Bulbasaur'), supporter(21, 'Iono'), basic(22, 'Charmander'), supporter(23, 'Arven'));

  const res = play(state, 10);
  assert.equal(res.error, null);
  const choice = viewFor(res.state, 'p1').pendingChoice;
  assert.deepEqual(choice.options.map((o) => o.instanceId).sort(), [20, 22]);
  assert.equal(choice.zoneView.zone, 'deck');
  assert.deepEqual(choice.zoneView.cards.map((c) => c.instanceId).sort(), [20, 21, 22, 23]);
  assert.deepEqual(Object.keys(choice.zoneView.cards[0]).sort(), ['instanceId', 'name', 'src', 'type']);

  const forOpponent = viewFor(res.state, 'p2').pendingChoice;
  assert.equal(forOpponent.zoneView, undefined);
  assert.equal(JSON.stringify(viewFor(res.state, 'p2')).includes('Iono'), false);
});

test('Pokégear 3.0: a top-7 look never shows the rest of the deck', () => {
  const state = game();
  state.players.p1.zones.hand.push(item(10, 'Pokégear 3.0'));
  const deck = state.players.p1.zones.deck;
  deck.push(supporter(30, 'Iono'));
  for (let i = 0; i < 10; i += 1) deck.push(basic(40 + i, 'Bulbasaur'));

  const res = play(state, 10);
  assert.equal(res.error, null);
  const choice = viewFor(res.state, 'p1').pendingChoice;
  assert.ok(choice, 'Pokégear asks which Supporter to take');
  assert.equal(choice.zoneView, undefined);
});

test('Night Stretcher: a discard pick carries the whole discard pile', () => {
  const state = game();
  state.players.p1.zones.hand.push(item(10, 'Night Stretcher'));
  state.players.p1.zones.discard.push(basic(50, 'Bulbasaur'), supporter(51, 'Iono'), basic(52, 'Squirtle'));

  const res = play(state, 10);
  assert.equal(res.error, null);
  const choice = viewFor(res.state, 'p1').pendingChoice;
  assert.equal(choice.zoneView.zone, 'discard');
  assert.deepEqual(choice.zoneView.cards.map((c) => c.instanceId), [50, 51, 52]);
  assert.deepEqual(choice.options.map((o) => o.instanceId).sort(), [50, 52]);
});

test('solo view: the seat that chooses gets the pile too', () => {
  const state = game();
  state.players.p1.zones.hand.push(item(10, 'Nest Ball'));
  state.players.p1.zones.deck.push(basic(20, 'Bulbasaur'), supporter(21, 'Iono'));
  const res = play(state, 10);
  assert.equal(viewForSolo(res.state, 'p2').pendingChoice.zoneView.zone, 'deck');
});

test('no pile when the options are the whole pile, face down, or span piles', () => {
  const state = game();
  const p1 = state.players.p1;
  p1.zones.deck.push(basic(20, 'Bulbasaur'));
  p1.zones.discard.push(basic(50, 'Squirtle'), basic(51, 'Oddish'));
  const search = { resumeToken: { searchStages: [] }, player: 'p1' };
  assert.equal(choiceZoneView(state, { ...search, options: [{ instanceId: 20 }] }), null);
  assert.equal(choiceZoneView(state, { ...search, options: [{ instanceId: 50, faceDown: true }] }), null);
  assert.equal(choiceZoneView(state, { ...search, options: [{ instanceId: 20 }, { instanceId: 50 }] }), null);
  assert.equal(choiceZoneView(state, { player: 'p1', options: [{ instanceId: 50 }] }).zone, 'discard');
});

test('isDeckSearchToken: search steps, attack search stages and Special Energy searches only', () => {
  assert.equal(isDeckSearchToken({ steps: [{ type: 'searchDeck' }], stepIndex: 0 }), true);
  assert.equal(isDeckSearchToken({ steps: [{ type: 'lookAtTop' }], stepIndex: 0 }), false);
  assert.equal(isDeckSearchToken({ steps: [{ type: 'searchLookTop' }], stepIndex: 0 }), false);
  assert.equal(isDeckSearchToken({ searchStages: [{}] }), true);
  assert.equal(isDeckSearchToken({ queue: [{ plan: { action: 'search' } }], index: 0 }), true);
  assert.equal(isDeckSearchToken({ effectType: 'attackMillPick' }), false);
  assert.equal(isDeckSearchToken(null), false);
});
