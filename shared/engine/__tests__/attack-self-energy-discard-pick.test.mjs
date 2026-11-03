// Printed self-discards let the attacking player pick which Energy go. Kartana Paper Cut
// (customhb set.json): 150 damage, "Discard 2 Energy from this Pokémon."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';

const PAPER_CUT = { name: 'Paper Cut', cost: [], damage: 150, text: 'Discard 2 Energy from this Pokémon.' };

const pokemon = (props) => createCard({ supertype: 'Pokémon', type: 'Pokémon', stage: 'Basic', ...props });
const energy = (instanceId, name, energyType, special = false) =>
  createCard({
    instanceId,
    name,
    supertype: 'Energy',
    type: 'Energy',
    subtypes: [special ? 'Special' : 'Basic'],
    energyType,
    attachedTo: 1,
  });

function board(energies) {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  state.players.p1.zones.active.push(
    pokemon({ instanceId: 1, name: 'Kartana', hp: 60, types: ['Metal'], attacks: [PAPER_CUT] }),
    ...energies
  );
  state.players.p2.zones.active.push(pokemon({ instanceId: 20, name: 'Defender', hp: 400 }));
  for (const playerId of ['p1', 'p2']) {
    const offset = playerId === 'p1' ? 0 : 50;
    for (let i = 0; i < 6; i += 1) {
      state.players[playerId].zones.prizes.push(createCard({ instanceId: 1000 + offset + i, name: 'Prize' }));
      state.players[playerId].zones.deck.push(createCard({ instanceId: 2000 + offset + i, name: 'Deck Card' }));
    }
  }
  return state;
}

const attack = (state) => applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
const attachedIds = (state) =>
  state.players.p1.zones.active.filter((c) => c.attachedTo === 1).map((c) => c.instanceId).sort((a, b) => a - b);
const defenderDamage = (state) => state.players.p2.zones.active.find((c) => c.instanceId === 20).damage || 0;

test('Paper Cut with mixed Energy asks which 2 to discard and discards exactly those', () => {
  const res = attack(
    board([
      energy(2, 'Basic Metal Energy', 'Metal'),
      energy(3, 'Basic Metal Energy', 'Metal'),
      energy(4, 'Basic Grass Energy', 'Grass'),
      energy(5, 'Double Turbo Energy', 'Colorless', true),
    ])
  );
  assert.ok(!res.error, res.error);
  const choice = res.state.pendingChoice;
  assert.ok(choice, 'expected an Energy picker');
  assert.equal(choice.min, 2);
  assert.equal(choice.max, 2);
  assert.deepEqual(choice.options.map((o) => o.instanceId).sort((a, b) => a - b), [2, 3, 4, 5]);
  assert.equal(defenderDamage(res.state), 0, 'damage waits for the pick');

  const done = applyCommand(res.state, {
    type: 'resolveChoice',
    payload: { choiceId: choice.choiceId, selection: [4, 5] },
    playerId: 'p1',
  });
  assert.ok(!done.error, done.error);
  assert.deepEqual(attachedIds(done.state), [2, 3]);
  assert.equal(defenderDamage(done.state), 150);
});

test('Paper Cut with only identical Energy discards 2 without asking', () => {
  const res = attack(
    board([
      energy(2, 'Basic Metal Energy', 'Metal'),
      energy(3, 'Basic Metal Energy', 'Metal'),
      energy(4, 'Basic Metal Energy', 'Metal'),
    ])
  );
  assert.ok(!res.error, res.error);
  assert.equal(res.state.pendingChoice?.resumeToken?.effectType === 'attackSelfEnergyDiscard', false);
  assert.equal(attachedIds(res.state).length, 1);
  assert.equal(defenderDamage(res.state), 150);
});

test('Paper Cut with exactly 2 Energy discards both without asking', () => {
  const res = attack(board([energy(2, 'Basic Metal Energy', 'Metal'), energy(3, 'Basic Grass Energy', 'Grass')]));
  assert.ok(!res.error, res.error);
  assert.equal(res.state.pendingChoice?.resumeToken?.effectType === 'attackSelfEnergyDiscard', false);
  assert.deepEqual(attachedIds(res.state), []);
  assert.equal(defenderDamage(res.state), 150);
});
