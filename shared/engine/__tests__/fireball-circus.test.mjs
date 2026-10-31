// Blacephalon (UNB 32) Fireball Circus: "This attack does 50 damage for each {R} Energy attached
// to all your Pokémon." — only {R}, only your side. Corpus: TCGdex sm10-32.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

const TEXT = 'This attack does 50 damage for each {R} Energy attached to all your Pokémon. Then discard all Energy attached to this Pokémon.';

let nextId = 1000;
const filler = () => createCard({ instanceId: nextId++, name: 'Card', supertype: 'Trainer', type: 'Item' });
const mon = (id, name) => createCard({ instanceId: id, name, supertype: 'Pokémon', stage: 'Basic', hp: 500 });
const energy = (name, attachedTo) =>
  createCard({ instanceId: nextId++, name, supertype: 'Energy', type: 'Energy', subtypes: ['Basic'], attachedTo });

function damageDealt(attach) {
  nextId = 1000;
  const state = createGameState({ gameId: 'fireball-circus', seed: 5, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) {
      state.players[id].zones.prizes.push(filler());
      state.players[id].zones.deck.push(filler());
    }
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const blace = createCard({
    instanceId: 1, name: 'Blacephalon', supertype: 'Pokémon', stage: 'Basic', hp: 120,
    attacks: [{ name: 'Fireball Circus', cost: [], damage: '50×', text: TEXT }],
  });
  const zones = {
    p1: { active: state.players.p1.zones.active, bench: state.players.p1.zones.bench },
    p2: { active: state.players.p2.zones.active, bench: state.players.p2.zones.bench },
  };
  zones.p1.active.push(blace);
  zones.p1.bench.push(mon(2, 'Ally'));
  zones.p2.active.push(mon(3, 'Foe'));
  zones.p2.bench.push(mon(4, 'FoeBench'));
  const hosts = { 1: zones.p1.active, 2: zones.p1.bench, 3: zones.p2.active, 4: zones.p2.bench };
  for (const [host, name] of attach) hosts[host].push(energy(name, host));
  const res = applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(5));
  assert.equal(res.error, null);
  return res.state.players.p2.zones.active.find((c) => c.instanceId === 3).damage;
}

test('Fireball Circus counts only {R} Energy on your own Pokémon', () => {
  const damage = damageDealt([
    [1, 'Fire Energy'], [1, 'Fire Energy'], [1, 'Water Energy'], // attacker: 2 Fire, Water ignored
    [2, 'Fire Energy'], [2, 'Water Energy'], // own Bench
    [3, 'Fire Energy'], [4, 'Fire Energy'], // opposing Fire Energy ignored
  ]);
  assert.equal(damage, 150);
});

test('Fireball Circus: 6 Fire Energy across your Pokémon does 300', () => {
  const fire = 'Fire Energy';
  assert.equal(damageDealt([[1, fire], [1, fire], [1, fire], [2, fire], [2, fire], [2, fire]]), 300);
});
