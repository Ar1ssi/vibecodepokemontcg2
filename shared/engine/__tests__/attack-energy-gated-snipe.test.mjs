// Homebrew HB Burning Icicles (customhb set.json; text confirmed against the user's card scan,
// which prints "Fire Energy"): the 20 damage to 2 Benched Pokémon needs a Fire Energy attached.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

const TEXT =
  "If this Pokémon has any {R} Energy attached to it, this attack does 20 damage to 2 of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)";

let nextId = 1;
const mon = (name, hp = 200) => createCard({ instanceId: nextId++, name, supertype: 'Pokémon', hp });

function icicles(energyNames) {
  nextId = 1;
  const state = createGameState({ gameId: 'icicles', seed: 5, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const attacker = createCard({
    instanceId: nextId++,
    name: 'Icicle Mon',
    supertype: 'Pokémon',
    hp: 200,
    attacks: [{ name: 'Burning Icicles', cost: [], damage: '40', text: TEXT }],
  });
  state.players.p1.zones.active.push(attacker);
  for (const name of energyNames) {
    state.players.p1.zones.active.push(
      createCard({
        instanceId: nextId++,
        name,
        supertype: 'Energy',
        subtypes: ['Basic'],
        energyType: name.replace(/ Energy$/, ''),
        attachedTo: attacker.instanceId,
      })
    );
  }
  state.players.p2.zones.active.push(mon('Defender', 400));
  state.players.p2.zones.bench.push(mon('Opp Bench A'), mon('Opp Bench B'));
  const res = applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(5));
  assert.equal(res.error, null);
  return res;
}

const benchDamage = (res) => res.state.players.p2.zones.bench.map((c) => c.damage || 0);

test('Burning Icicles: no Fire Energy attached means no Bench damage and no target prompt', () => {
  const res = icicles(['Water Energy']);
  assert.deepEqual(benchDamage(res), [0, 0]);
  assert.equal(res.state.pending ?? null, null);
});

test('Burning Icicles: a Fire Energy attached still snipes 2 Benched Pokémon', () => {
  const res = icicles(['Water Energy', 'Fire Energy']);
  const hit = benchDamage(res).filter((d) => d === 20).length;
  const prompted = Boolean(res.state.pending);
  assert.ok(hit === 2 || prompted, 'either 20 to both Benched Pokémon or a target prompt');
});
