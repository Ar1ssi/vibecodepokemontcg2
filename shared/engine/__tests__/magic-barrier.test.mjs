// Gardevoir SIT 069 Magic Barrier (printed text from the user's card scan): at the start of the opponent's
// turn flip a coin; on heads the Active Pokémon is protected from the effects of the opponent's
// Active Pokémon's attacks. Damage is not an effect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';

const BARRIER = {
  name: 'Magic Barrier',
  type: 'Ability',
  text: "At the start of your opponent's turn (before they attack), flip a coin. If heads, your Active Pokémon is protected from the effects of attacks used by your opponent's Active Pokémon. (Damage is not an effect.)",
};

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 300, ...extra });
const filler = () => createCard({ instanceId: nextId++, name: 'Card', supertype: 'Trainer', type: 'Item' });

function board() {
  nextId = 1;
  const state = createGameState({ gameId: 'magic-barrier', seed: 5, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) {
      state.players[id].zones.prizes.push(filler());
      state.players[id].zones.deck.push(filler());
    }
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  state.players.p1.zones.active.push(mon('Gardevoir', { stage: 'Stage 2', abilities: [BARRIER] }));
  state.players.p2.zones.active.push(
    mon('Foe', {
      attacks: [{ name: 'Sting', cost: [], damage: '30', text: "Your opponent's Active Pokémon is now Poisoned." }],
    })
  );
  state.players.p2.zones.bench.push(mon('Bench'));
  state.players.p1.zones.bench.push(mon('Bench1'));
  return state;
}

const rngFace = (face) => ({ next: () => (face === 'heads' ? 0 : 0.9) });

function passThenAttack(face) {
  const passed = applyCommand(board(), { type: 'pass', payload: {}, playerId: 'p1' }, rngFace(face));
  assert.equal(passed.error, null);
  const res = applyCommand(passed.state, { type: 'attack', playerId: 'p2', payload: { attackIndex: 0 } }, rngFace(face));
  assert.equal(res.error, null);
  return { passed, res };
}

test('Magic Barrier heads: the attack still damages but its Poison is prevented', () => {
  const { passed, res } = passThenAttack('heads');
  assert.ok(passed.events.some((e) => e.type === 'coinFlipped' && e.source === 'Gardevoir' && e.face === 'heads'));
  const gardevoir = res.state.players.p1.zones.active[0];
  // The Poison is stopped, so Checkup adds nothing to the 30 attack damage.
  assert.equal(gardevoir.damage, 30);
  assert.ok(!gardevoir.poisoned && gardevoir.specialCondition !== 'Poisoned');
});

test('Magic Barrier tails: the Poison lands', () => {
  const { res } = passThenAttack('tails');
  const gardevoir = res.state.players.p1.zones.active[0];
  // 30 attack damage + 10 Checkup Poison.
  assert.equal(gardevoir.damage, 40);
  assert.equal(gardevoir.poisoned, true);
});
