// Beedrill Fell Stinger (custom set customhb, set.json): "If this attack knocks out the Defending
// Pokémon, take an additional Prize card" — a Knock Out pays 2 Prize cards, a survivor pays none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parsePrizeOnKo } from '../rules/damage-parser.mjs';

const TEXT = 'If this attack knocks out the Defending Pokémon, take an additional Prize card';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 100, ...extra });

function attackWith({ text, defenderHp }) {
  nextId = 1;
  const state = createGameState({ gameId: 'fell-stinger', seed: 5, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  state.players.p1.zones.active.push(
    mon('Beedrill', { attacks: [{ name: 'Fell Stinger', cost: [], damage: '50', text }] })
  );
  state.players.p2.zones.active.push(mon('Defender', { hp: defenderHp }));
  state.players.p2.zones.bench.push(mon('Bench', { hp: 300 }));
  const res = applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(5));
  assert.equal(res.error, null);
  return res;
}

test('Fell Stinger parses as one extra Prize card on a Knock Out', () => {
  assert.deepEqual(parsePrizeOnKo(TEXT), { count: 1 });
});

test('Fell Stinger: Knocking Out the Defending Pokémon takes 2 Prize cards in all', () => {
  const res = attackWith({ text: TEXT, defenderHp: 50 });
  assert.equal(res.state.players.p1.flags.prizesOwed, 2);
});

test('Fell Stinger: without the clause the same Knock Out takes 1 Prize card', () => {
  const res = attackWith({ text: '', defenderHp: 50 });
  assert.equal(res.state.players.p1.flags.prizesOwed, 1);
});

test('Fell Stinger: a Defending Pokémon that survives pays no extra Prize card', () => {
  const res = attackWith({ text: TEXT, defenderHp: 300 });
  assert.equal(res.state.players.p1.flags.prizesOwed, undefined);
});
