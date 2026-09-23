// Bench spread per side (I100): self-recoil "to each of your Benched Pokémon" hits the
// attacker's own Bench, never the opponent's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

let nextId = 1;
const mon = (name, hp = 200) => createCard({ instanceId: nextId++, name, supertype: 'Pokémon', hp });

function attackWith(text, { ownBenchHp = 200 } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'spread', seed: 5, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const attacker = createCard({
    instanceId: nextId++,
    name: 'Copperajah ex',
    supertype: 'Pokémon',
    hp: 260,
    attacks: [{ name: 'Nosequake', cost: [], damage: '270', text }],
  });
  state.players.p1.zones.active.push(attacker);
  state.players.p1.zones.bench.push(mon('Own Bench A', ownBenchHp), mon('Own Bench B'));
  state.players.p2.zones.active.push(mon('Defender', 400));
  state.players.p2.zones.bench.push(mon('Opp Bench A'), mon('Opp Bench B'));
  const res = applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(5));
  assert.equal(res.error, null);
  return res;
}

const damages = (res, pid) => res.state.players[pid].zones.bench.map((c) => c.damage || 0);

test('attack: "30 damage to each of your Benched Pokémon" damages the attacker\'s Bench only (I100)', () => {
  const res = attackWith('This attack also does 30 damage to each of your Benched Pokémon. (Don\'t apply Weakness and Resistance for Benched Pokémon.)');
  assert.deepEqual(damages(res, 'p1'), [30, 30]);
  assert.deepEqual(damages(res, 'p2'), [0, 0]);
});

test("attack: opponent's-Bench spread still hits only the opponent's Bench (I100)", () => {
  const res = attackWith("This attack also does 20 damage to each of your opponent's Benched Pokémon.");
  assert.deepEqual(damages(res, 'p1'), [0, 0]);
  assert.deepEqual(damages(res, 'p2'), [20, 20]);
});

test('attack: "(both yours and your opponent\'s)" spread hits both Benches (I100)', () => {
  const res = attackWith("This attack does 10 damage to each Benched Pokémon (both yours and your opponent's).");
  assert.deepEqual(damages(res, 'p1'), [10, 10]);
  assert.deepEqual(damages(res, 'p2'), [10, 10]);
});

test('attack: self-recoil that Knocks Out an own Benched Pokémon discards it (I100)', () => {
  const res = attackWith('This attack also does 30 damage to each of your Benched Pokémon.', { ownBenchHp: 30 });
  const p1 = res.state.players.p1;
  assert.deepEqual(p1.zones.bench.map((c) => c.name), ['Own Bench B']);
  assert.ok(p1.zones.discard.some((c) => c.name === 'Own Bench A'));
});
