// Huge Power (printed text from the user's card scan): "This Pokémon's attacks do 10 more damage
// for each unique type of Energy attached to it." A special Energy counts apart from the basic of
// its type (Water Energy and Bubbly Energy are two).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

const HUGE_POWER = {
  name: 'Huge Power',
  type: 'Ability',
  text: "This Pokémon's attacks do 10 more damage for each unique type of Energy attached to it.",
};

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 300, ...extra });
const filler = () => createCard({ instanceId: nextId++, name: 'Card', supertype: 'Trainer', type: 'Item' });

function damageWith(energyNames) {
  nextId = 1;
  const state = createGameState({ gameId: 'huge-power', seed: 5, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) {
      state.players[id].zones.prizes.push(filler());
      state.players[id].zones.deck.push(filler());
    }
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const attacker = mon('Attacker', {
    abilities: [HUGE_POWER],
    attacks: [{ name: 'Hit', cost: [], damage: '50', text: '' }],
  });
  state.players.p1.zones.active.push(attacker);
  for (const name of energyNames) {
    state.players.p1.zones.active.push(
      createCard({ instanceId: nextId++, name, supertype: 'Energy', attachedTo: attacker.instanceId })
    );
  }
  state.players.p2.zones.active.push(mon('Foe'));
  state.players.p2.zones.bench.push(mon('Bench'));
  const res = applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(5));
  assert.equal(res.error, null);
  return res.state.players.p2.zones.active[0].damage;
}

test('Huge Power: no Energy adds nothing', () => assert.equal(damageWith([]), 50));
test('Huge Power: repeated basic Energy counts once', () =>
  assert.equal(damageWith(['Water Energy', 'Water Energy']), 60));
test('Huge Power: a special Energy counts apart from the basic of its type', () =>
  assert.equal(damageWith(['Water Energy', 'Water Energy', 'Bubbly Energy']), 70));
test('Huge Power: "Basic" in the printed name does not split a type', () =>
  assert.equal(damageWith(['Basic Water Energy', 'Water Energy']), 60));
