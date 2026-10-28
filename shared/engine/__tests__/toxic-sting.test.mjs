// Gliscor PAR 092 Toxic Sting (TCGdex sv04-092): "Flip a coin. If heads, your opponent's Active
// Pokémon is now Poisoned. During Pokémon Checkup, put 2 damage counters on that Pokémon instead of 1."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { poisonCheckupCounters } from '../rules/attack-status.mjs';
import { clearConditions, poisonCheckupDamage } from '../rules/special-conditions.mjs';

const TEXT =
  "Flip a coin. If heads, your opponent's Active Pokémon is now Poisoned. During Pokémon Checkup, put 2 damage counters on that Pokémon instead of 1.";
const ALWAYS =
  "Your opponent's Active Pokémon is now Poisoned. During Pokémon Checkup, put 2 damage counters on that Pokémon instead of 1.";

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 300, ...extra });

function board(text) {
  nextId = 1;
  const state = createGameState({ gameId: 'toxic-sting', seed: 5, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) {
      state.players[id].zones.prizes.push(createCard({ instanceId: nextId++, name: 'Prize', supertype: 'Trainer', type: 'Item' }));
      state.players[id].zones.deck.push(createCard({ instanceId: nextId++, name: 'Deck', supertype: 'Trainer', type: 'Item' }));
    }
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  state.players.p1.zones.active.push(
    mon('Gliscor', { attacks: [{ name: 'Toxic Sting', cost: [], damage: '80', text }] })
  );
  state.players.p2.zones.active.push(mon('Defender'));
  state.players.p2.zones.bench.push(mon('Bench'));
  return state;
}

test('poisonCheckupCounters reads the printed clause and nothing else', () => {
  assert.equal(poisonCheckupCounters(TEXT), 2);
  assert.equal(poisonCheckupCounters("Your opponent's Active Pokémon is now Poisoned."), null);
  assert.equal(poisonCheckupCounters(''), null);
});

test('Toxic Sting: the Poison it applies deals 20 at Checkup, then Checkup damage is 20', () => {
  const res = applyCommand(board(ALWAYS), { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(5));
  assert.equal(res.error, null);
  const defender = res.state.players.p2.zones.active[0];
  // 80 attack damage + 20 Checkup Poison.
  assert.equal(defender.damage, 100);
  assert.ok(res.events.some((e) => e.type === 'checkupDamage' && e.condition === 'Poisoned' && e.damage === 20));
});

test('poison counters are dropped when the Poison is cleared', () => {
  const card = mon('X', { poisoned: true, poisonCounters: 2 });
  assert.equal(poisonCheckupDamage(card), 20);
  clearConditions(card);
  assert.equal(poisonCheckupDamage(card), 10);
});
