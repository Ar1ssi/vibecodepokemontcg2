// Delphox Energized Storm (customhb): "This attack does 30 damage for each {R} Energy attached
// to all Pokémon." — every Pokémon in play, both sides, Active and Benched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

const TEXT = 'This attack does 30 damage for each {R} Energy attached to all Pokémon.';

let nextId = 1000;
const filler = () => createCard({ instanceId: nextId++, name: 'Card', supertype: 'Trainer', type: 'Item' });
const mon = (id, name) => createCard({ instanceId: id, name, supertype: 'Pokémon', stage: 'Basic', hp: 500 });
const energy = (name, attachedTo) =>
  createCard({ instanceId: nextId++, name, supertype: 'Energy', type: 'Energy', subtypes: ['Basic'], attachedTo });

function damageDealt(attach) {
  nextId = 1000;
  const state = createGameState({ gameId: 'energized-storm', seed: 5, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) {
      state.players[id].zones.prizes.push(filler());
      state.players[id].zones.deck.push(filler());
    }
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const delphox = createCard({
    instanceId: 1, name: 'Delphox', supertype: 'Pokémon', stage: 'Stage 2', hp: 150,
    attacks: [{ name: 'Energized Storm', cost: [], damage: '30×', text: TEXT }],
  });
  const zones = {
    p1: { active: state.players.p1.zones.active, bench: state.players.p1.zones.bench },
    p2: { active: state.players.p2.zones.active, bench: state.players.p2.zones.bench },
  };
  zones.p1.active.push(delphox);
  zones.p1.bench.push(mon(2, 'Ally'));
  zones.p2.active.push(mon(3, 'Foe'));
  zones.p2.bench.push(mon(4, 'FoeBench'));
  const hosts = { 1: zones.p1.active, 2: zones.p1.bench, 3: zones.p2.active, 4: zones.p2.bench };
  for (const [host, name] of attach) hosts[host].push(energy(name, host));
  const res = applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(5));
  assert.equal(res.error, null);
  return res.state.players.p2.zones.active.find((c) => c.instanceId === 3).damage;
}

test('Energized Storm counts {R} Energy on every Pokémon of both sides', () => {
  const damage = damageDealt([
    [1, 'Fire Energy'], [1, 'Fire Energy'], // Delphox
    [2, 'Fire Energy'], // own Bench
    [3, 'Fire Energy'], // Defending Pokémon
    [4, 'Fire Energy'], // opposing Bench
    [2, 'Water Energy'], [4, 'Water Energy'], // other types do not count
  ]);
  assert.equal(damage, 150);
});

test('Energized Storm counts Energy that is not on the attacker', () => {
  assert.equal(damageDealt([[2, 'Fire Energy'], [4, 'Fire Energy']]), 60);
});

test('Energized Storm with no {R} Energy anywhere does no damage', () => {
  assert.equal(damageDealt([[1, 'Water Energy']]) || 0, 0);
});
