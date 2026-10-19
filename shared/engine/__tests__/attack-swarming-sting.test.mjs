// Beedrill V Swarming Sting (ASR 160/161): "This attack does 50 damage to 1 of your opponent's
// Pokémon for each of your Beedrill V in play." Count = own Beedrill V in play (attacker included),
// target picked by the player among the opponent's Active and Benched Pokémon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';

const pokemon = (props) => createCard({ supertype: 'Pokémon', type: 'Pokémon', ...props });
const grassEnergy = (instanceId, attachedTo) =>
  createCard({
    instanceId,
    name: 'Basic Grass Energy',
    supertype: 'Energy',
    type: 'Energy',
    subtypes: ['Basic'],
    types: ['Grass'],
    attachedTo,
  });

const TWINEEDLE = {
  name: 'Twineedle',
  cost: ['Grass'],
  damage: 40,
  text: 'Flip 2 coins. This attack does 40 damage for each heads.',
};
const SWARMING_STING = {
  name: 'Swarming Sting',
  cost: ['Grass', 'Grass', 'Colorless'],
  damage: 0,
  text: "This attack does 50 damage to 1 of your opponent's Pokémon for each of your Beedrill V in play. (Don't apply Weakness and Resistance for Benched Pokémon.)",
};
// Printed wording on the 7/108 Beedrill (in-game screenshot): counts Beedrill by name, targets 1 Pokémon.
const SWARMING_STING_40 = {
  name: 'Swarming Sting',
  cost: ['Grass', 'Colorless'],
  damage: 0,
  text: "This attack does 40 damage times the number of Beedrill you have in play to 1 of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
};
// Beedrill V (ASR 160/161) prints Twineedle first, so Swarming Sting is attack index 1.
const SWARMING_STING_INDEX = 1;

function board({ bench = [], sting = SWARMING_STING, attackerName = 'Beedrill V' } = {}) {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  state.players.p1.zones.active.push(
    pokemon({ instanceId: 1, name: attackerName, hp: 180, types: ['Grass'], attacks: [TWINEEDLE, sting] }),
    grassEnergy(2, 1),
    grassEnergy(3, 1),
    grassEnergy(4, 1)
  );
  state.players.p1.zones.bench.push(...bench);
  state.players.p2.zones.active.push(pokemon({ instanceId: 20, name: 'Defender', hp: 400 }));
  state.players.p2.zones.bench.push(pokemon({ instanceId: 21, name: 'Opp Bench', hp: 300 }));
  for (const playerId of ['p1', 'p2']) {
    for (let i = 0; i < 6; i += 1) {
      state.players[playerId].zones.prizes.push(
        createCard({ instanceId: 1000 + (playerId === 'p1' ? 0 : 50) + i, name: 'Prize' })
      );
      state.players[playerId].zones.deck.push(
        createCard({ instanceId: 2000 + (playerId === 'p1' ? 0 : 50) + i, name: 'Deck Card' })
      );
    }
  }
  return state;
}

const attack = (state) =>
  applyCommand(state, { type: 'attack', payload: { attackIndex: SWARMING_STING_INDEX }, playerId: 'p1' });
const choose = (state, selection) =>
  applyCommand(state, {
    type: 'resolveChoice',
    payload: { choiceId: state.pendingChoice.choiceId, selection },
    playerId: 'p1',
  });
const damageOn = (state, instanceId) => {
  const all = [...state.players.p2.zones.active, ...state.players.p2.zones.bench];
  return all.find((c) => c.instanceId === instanceId)?.damage || 0;
};

test('Swarming Sting with one Beedrill V in play: opens the target picker and deals 50', () => {
  const res = attack(board());
  assert.ok(!res.error, res.error);
  const choice = res.state.pendingChoice;
  assert.ok(choice, 'expected a target choice for 1 of your opponent\'s Pokémon');
  assert.deepEqual(choice.options.map((o) => o.instanceId).sort((a, b) => a - b), [20, 21]);
  const done = choose(res.state, [21]);
  assert.ok(!done.error, done.error);
  assert.equal(damageOn(done.state, 21), 50);
});

test('Swarming Sting with a blank printed damage still opens the picker', () => {
  const state = board();
  state.players.p1.zones.active[0].attacks[SWARMING_STING_INDEX] = { ...SWARMING_STING, damage: '' };
  const res = attack(state);
  assert.ok(!res.error, res.error);
  assert.ok(res.state.pendingChoice, 'expected a target choice');
});

test('7/108 Beedrill Swarming Sting: one Beedrill in play opens the picker and deals 40', () => {
  const res = attack(board({ sting: SWARMING_STING_40, attackerName: 'Beedrill' }));
  assert.ok(!res.error, res.error);
  assert.ok(res.state.pendingChoice, 'expected a target choice');
  const done = choose(res.state, [20]);
  assert.ok(!done.error, done.error);
  assert.equal(damageOn(done.state, 20), 40);
});

test('7/108 Beedrill Swarming Sting: two Beedrill in play deals 80 to the chosen Pokémon', () => {
  const state = board({
    sting: SWARMING_STING_40,
    attackerName: 'Beedrill',
    bench: [pokemon({ instanceId: 10, name: 'Beedrill', hp: 90, types: ['Grass'] })],
  });
  const res = attack(state);
  assert.ok(!res.error, res.error);
  const done = choose(res.state, [21]);
  assert.ok(!done.error, done.error);
  assert.equal(damageOn(done.state, 21), 80);
});

test('Swarming Sting with two Beedrill V in play: 100 damage to the chosen Pokémon', () => {
  const state = board({
    bench: [pokemon({ instanceId: 10, name: 'Beedrill V', hp: 180, types: ['Grass'] })],
  });
  const res = attack(state);
  assert.ok(!res.error, res.error);
  const done = choose(res.state, [20]);
  assert.ok(!done.error, done.error);
  assert.equal(damageOn(done.state, 20), 100);
});
