// Fairy Garden (printed text from the user's card scan, FCO 100/124): "Each Pokémon that has any
// {Y} Energy attached to it (both yours and your opponent's) is immune to Special Conditions."
// The pkmncards corpus row for FCO 100 prints a no-Retreat-Cost wording instead; this follows the scan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { stadiumEnergyStatusImmunity } from '../rules/stadium-effects.mjs';

const TEXT =
  "Each Pokémon that has any {Y} Energy attached to it (both yours and your opponent’s) is immune to Special Conditions.";
const stadiumCard = { name: 'Fairy Garden', supertype: 'Trainer', trainerType: 'Stadium', text: TEXT };

let nextId = 100;
const mon = (id, extra = {}) => createCard({ instanceId: id, supertype: 'Pokémon', stage: 'Basic', hp: 100, name: `Mon ${id}`, ...extra });
const energy = (name, attachedTo) =>
  createCard({ instanceId: nextId++, name, supertype: 'Energy', type: 'Energy', attachedTo });

function game() {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  state.players.p1.zones.deck.push(createCard({ instanceId: 900, name: 'Deck Card' }));
  state.players.p2.zones.deck.push(createCard({ instanceId: 901, name: 'Deck Card' }));
  state.players.p1.zones.active.push(mon(1));
  state.stadium = { card: stadiumCard, user: 'p1' };
  return state;
}

test('stadiumEnergyStatusImmunity: needs the named type attached to that Pokémon', () => {
  const host = mon(1);
  assert.equal(stadiumEnergyStatusImmunity(stadiumCard, host, [host, energy('Fairy Energy', 1)]), true);
  assert.equal(stadiumEnergyStatusImmunity(stadiumCard, host, [host, energy('Water Energy', 1)]), false);
  assert.equal(stadiumEnergyStatusImmunity(stadiumCard, host, [host, energy('Fairy Energy', 2)]), false);
  assert.equal(stadiumEnergyStatusImmunity({ text: 'Nothing.' }, host, [host, energy('Fairy Energy', 1)]), false);
});

test('Fairy Garden: the opponent’s Poisoned Pokémon with {Y} Energy loses the Poison before Checkup', () => {
  const state = game();
  state.players.p2.zones.active.push(mon(20, { poisoned: true }), energy('Fairy Energy', 20));
  const res = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' });
  assert.equal(res.error, null);
  const defender = res.state.players.p2.zones.active.find((c) => c.instanceId === 20);
  assert.equal(defender.damage || 0, 0);
  assert.ok(!defender.poisoned);
  assert.ok(res.events.some((e) => e.type === 'statusCleared' && e.reason === 'stadium'));
});

test('Fairy Garden: a Pokémon without {Y} Energy still takes its Poison', () => {
  const state = game();
  state.players.p2.zones.active.push(mon(20, { poisoned: true }), energy('Water Energy', 20));
  const res = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' });
  const defender = res.state.players.p2.zones.active.find((c) => c.instanceId === 20);
  assert.equal(defender.damage, 10);
});
