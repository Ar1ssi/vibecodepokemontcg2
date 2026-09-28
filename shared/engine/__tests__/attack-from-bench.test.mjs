// I196: Alakazam ex Dimensional Hand ("This attack can be used even if this Pokémon is on the
// Bench"). The attack command names a Benched attacker by `attackerInstanceId`; only an attack
// printing that clause may be used from the Bench.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

const BENCH_TEXT = 'This attack can be used even if this Pokémon is on the Bench.';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 300, ...extra });
const psychic = (attachedTo) =>
  createCard({
    instanceId: nextId++,
    name: 'Basic Psychic Energy',
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType: 'Psychic',
    type: 'Energy',
    attachedTo,
  });

function board({ rulesEnabled = true, energyCount = 2 } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'bench-attack', seed: 3, rulesEnabled });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const active = mon('Pikachu', { attacks: [{ name: 'Gnaw', cost: [], damage: '10', text: '' }] });
  state.players.p1.zones.active.push(active);
  const alakazam = mon('Alakazam ex', {
    hp: 310,
    attacks: [
      {
        name: 'Mind Jack',
        cost: ['Colorless', 'Colorless'],
        damage: '90+',
        text: "This attack does 30 more damage for each of your opponent's Benched Pokémon.",
      },
      { name: 'Dimensional Hand', cost: ['Psychic', 'Psychic'], damage: '120', text: BENCH_TEXT },
    ],
  });
  state.players.p1.zones.bench.push(alakazam);
  for (let i = 0; i < energyCount; i++) state.players.p1.zones.bench.push(psychic(alakazam.instanceId));
  const defender = mon('Defender', { hp: 400 });
  state.players.p2.zones.active.push(defender);
  return { state, active, alakazam, rng: createRng(3) };
}

const attackCmd = (payload) => ({ type: 'attack', playerId: 'p1', payload });

test('Dimensional Hand from the Bench hits the Active for 120 and ends the turn', () => {
  const b = board();
  const res = applyCommand(b.state, attackCmd({ attackIndex: 1, attackerInstanceId: b.alakazam.instanceId }), b.rng);
  assert.equal(res.error, null);
  assert.equal(res.state.players.p2.zones.active[0].damage, 120);
  assert.equal(res.state.players.p1.zones.active[0].instanceId, b.active.instanceId, 'Active unchanged');
  assert.equal(res.state.turn.player, 'p2', 'the turn ends');
});

test('a Bench attack without the clause (Mind Jack) is rejected', () => {
  const b = board();
  const res = applyCommand(b.state, attackCmd({ attackIndex: 0, attackerInstanceId: b.alakazam.instanceId }), b.rng);
  assert.notEqual(res.error, null);
  assert.equal(b.state.players.p2.zones.active[0].damage || 0, 0);
});

test('Dimensional Hand from the Bench still needs its Energy', () => {
  const b = board({ energyCount: 1 });
  const res = applyCommand(b.state, attackCmd({ attackIndex: 1, attackerInstanceId: b.alakazam.instanceId }), b.rng);
  assert.notEqual(res.error, null);
});

test('an unknown attackerInstanceId is rejected; omitting it keeps the Active attacking', () => {
  const b = board();
  const bad = applyCommand(b.state, attackCmd({ attackIndex: 0, attackerInstanceId: 9999 }), b.rng);
  assert.notEqual(bad.error, null);
  const ok = applyCommand(b.state, attackCmd({ attackIndex: 0 }), b.rng);
  assert.equal(ok.error, null);
  assert.equal(ok.state.players.p2.zones.active[0].damage, 10);
});
