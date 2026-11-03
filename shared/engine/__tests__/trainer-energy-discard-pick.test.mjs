// Trainer Energy discards let the player pick which Energy go when a Pokémon holds different ones.
// Giacomo (Paldea Evolved 267): "Discard a Special Energy from each of your opponent's Pokémon."
// Ruffian (Journey Together 157): "Discard a Pokémon Tool and a Special Energy from 1 of your
// opponent's Pokémon."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';

const pokemon = (props) => createCard({ supertype: 'Pokémon', type: 'Pokémon', stage: 'Basic', hp: 200, ...props });
const special = (instanceId, name, attachedTo) =>
  createCard({ instanceId, name, supertype: 'Energy', type: 'Energy', subtypes: ['Special'], attachedTo });
const tool = (instanceId, attachedTo) =>
  createCard({ instanceId, name: 'Bravery Charm', supertype: 'Trainer', type: 'Pokémon Tool', trainerType: 'Pokémon Tool', subtypes: ['Pokémon Tool'], attachedTo });
const supporter = (instanceId, name, text) =>
  createCard({ instanceId, name, supertype: 'Trainer', type: 'Trainer', trainerType: 'Supporter', subtypes: ['Supporter'], text });

const GIACOMO = "Discard a Special Energy from each of your opponent's Pokémon.";
const RUFFIAN = "Discard a Pokémon Tool and a Special Energy from 1 of your opponent's Pokémon.";

function board() {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  state.players.p1.zones.active.push(pokemon({ instanceId: 1, name: 'Attacker' }));
  state.players.p2.zones.active.push(
    pokemon({ instanceId: 20, name: 'Defender' }),
    special(21, 'Double Turbo Energy', 20),
    special(22, 'Jet Energy', 20),
    tool(23, 20)
  );
  state.players.p2.zones.bench.push(
    pokemon({ instanceId: 30, name: 'Benched' }),
    special(31, 'Mist Energy', 30),
    special(32, 'Mist Energy', 30)
  );
  for (const playerId of ['p1', 'p2']) {
    const offset = playerId === 'p1' ? 0 : 50;
    for (let i = 0; i < 6; i += 1) {
      state.players[playerId].zones.prizes.push(createCard({ instanceId: 1000 + offset + i, name: 'Prize' }));
      state.players[playerId].zones.deck.push(createCard({ instanceId: 2000 + offset + i, name: 'Deck Card' }));
    }
  }
  return state;
}

const play = (state, card) => {
  state.players.p1.zones.hand.push(card);
  return applyCommand(state, { type: 'playTrainer', payload: { instanceId: card.instanceId }, playerId: 'p1' });
};
const choose = (res, selection) =>
  applyCommand(res.state, {
    type: 'resolveChoice',
    payload: { choiceId: res.state.pendingChoice.choiceId, selection },
    playerId: 'p1',
  });
const discardIds = (state) => state.players.p2.zones.discard.map((c) => c.instanceId).sort((a, b) => a - b);

test('Giacomo asks which Special Energy to take from a Pokémon with different ones, and takes 1 from the other', () => {
  let res = play(board(), supporter(90, 'Giacomo', GIACOMO));
  assert.ok(!res.error, res.error);
  const choice = res.state.pendingChoice;
  assert.ok(choice, 'expected a picker for the Active');
  assert.deepEqual(choice.options.map((o) => o.instanceId).sort((a, b) => a - b), [21, 22]);
  res = choose(res, [22]);
  assert.ok(!res.error, res.error);
  assert.equal(res.state.pendingChoice, null, 'two identical Mist Energy need no pick');
  const discarded = discardIds(res.state);
  assert.ok(discarded.includes(22));
  assert.ok(!discarded.includes(21));
  assert.equal(discarded.filter((id) => id === 31 || id === 32).length, 1);
});

test('Ruffian asks which Special Energy to discard alongside the Tool', () => {
  const state = board();
  state.players.p2.zones.bench.splice(1); // only the Active holds Tools/Special Energy
  let res = play(state, supporter(91, 'Ruffian', RUFFIAN));
  assert.ok(!res.error, res.error);
  const choice = res.state.pendingChoice;
  assert.ok(choice, 'expected a Special Energy picker');
  assert.deepEqual(choice.options.map((o) => o.instanceId).sort((a, b) => a - b), [21, 22]);
  res = choose(res, [21]);
  assert.ok(!res.error, res.error);
  const discarded = discardIds(res.state);
  assert.ok(discarded.includes(21) && discarded.includes(23));
  assert.ok(!discarded.includes(22));
});
