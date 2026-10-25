// Attack damage that "isn't affected by Weakness, Resistance, or any other effects" (Greninja's Mist
// Slash) through the whole attack command. Card text: out/pkmn-pokemon-cards.json — Greninja XY 41,
// Greninja Star SWSH144 — and customhb-204 in client/src/assets/custom-sets/customhb/set.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 300, types: ['Colorless'], ...extra });
const trainer = (name) =>
  createCard({ instanceId: nextId++, name, supertype: 'Trainer', subtypes: ['Item'], type: 'Item' });

const MIST_SLASH_XY =
  "This attack's damage isn't affected by Weakness, Resistance, or any other effects on your opponent's Active Pokémon.";
const MIST_SLASH_HB = MIST_SLASH_XY.replace(/'/g, '’');
const MIST_SLASH_STAR =
  "This attack's damage isn't affected by Weakness or Resistance, or by any effects on your opponent's Active Pokémon.";

const WEAK_TO_WATER = { weakness: { type: 'Water', value: 2 } };
const RESISTS_WATER = { resistance: { type: 'Water', value: -30 } };

/** p1's Water attacker hits p2's Active with a single `damage` attack carrying `text`. */
function hit({ damage, text, defender }) {
  nextId = 1;
  const state = createGameState({ gameId: 'immunity', seed: 3, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(trainer(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  state.players.p1.zones.active.push(
    mon('Greninja', { types: ['Water'], attacks: [{ name: 'Mist Slash', cost: [], damage, text }] })
  );
  state.players.p2.zones.active.push(mon('Defender', { hp: 400, ...defender }));
  const res = applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(3));
  assert.equal(res.error, null);
  return res.state.players.p2.zones.active.find((c) => !c.attachedTo).damage ?? 0;
}

test('control: a plain 50 damage attack is doubled by Weakness and cut by Resistance', () => {
  assert.equal(hit({ damage: '50', text: '', defender: WEAK_TO_WATER }), 100);
  assert.equal(hit({ damage: '50', text: '', defender: RESISTS_WATER }), 20);
});

for (const [label, text, damage] of [
  ['Greninja (XY 41)', MIST_SLASH_XY, '50'],
  ['Greninja Star (SWSH144)', MIST_SLASH_STAR, '100'],
  ['customhb-204 Greninja (curly apostrophes)', MIST_SLASH_HB, '70'],
]) {
  test(`${label} Mist Slash ignores the defender's Weakness`, () => {
    assert.equal(hit({ damage, text, defender: WEAK_TO_WATER }), Number(damage));
  });

  test(`${label} Mist Slash ignores the defender's Resistance`, () => {
    assert.equal(hit({ damage, text, defender: RESISTS_WATER }), Number(damage));
  });
}
