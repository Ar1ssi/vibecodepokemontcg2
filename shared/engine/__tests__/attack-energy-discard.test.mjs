// Self Energy-discard costs printed with type symbols (I99): "Discard 2 {R} Energy from this
// Pokémon" must actually discard, from the right type, through the server attack phase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAttackEnergyDiscard } from '../rules/attack-effects.mjs';

let nextId = 1;
const mk = (props) => createCard({ instanceId: nextId++, ...props });
const energy = (type, attachedTo) =>
  mk({ name: `Basic ${type} Energy`, supertype: 'Energy', subtypes: ['Basic'], energyType: type, type: 'Energy', attachedTo });

const special = (name, attachedTo) =>
  mk({ name, supertype: 'Energy', subtypes: ['Special'], energyType: 'Colorless', type: 'Energy', attachedTo });

function attackWith(text, energyTypes, specialNames = []) {
  nextId = 1;
  const state = createGameState({ gameId: 'discard', seed: 3, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const attacker = mk({
    name: 'Attacker',
    supertype: 'Pokémon',
    hp: 200,
    attacks: [{ name: 'Blast', cost: [], damage: '10', text }],
  });
  state.players.p1.zones.active.push(attacker, ...energyTypes.map((t) => energy(t, attacker.instanceId)),
    ...specialNames.map((name) => special(name, attacker.instanceId)));
  state.players.p2.zones.active.push(mk({ name: 'Defender', supertype: 'Pokémon', hp: 300 }));
  const res = applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(3));
  assert.equal(res.error, null);
  const p1 = res.state.players.p1;
  return {
    attached: p1.zones.active.filter((c) => c.attachedTo === attacker.instanceId).map((c) => c.energyType).sort(),
    discarded: p1.zones.discard.map((c) => c.energyType).sort(),
    attachedNames: p1.zones.active.filter((c) => c.attachedTo === attacker.instanceId).map((c) => c.name).sort(),
    discardedNames: p1.zones.discard.map((c) => c.name).sort(),
  };
}

test('attack: "Discard 2 {R} Energy from this Pokémon" discards two Fire Energy (I99)', () => {
  const out = attackWith('Discard 2 {R} Energy from this Pokémon.', ['Fire', 'Water', 'Fire', 'Fire']);
  assert.deepEqual(out.discarded, ['Fire', 'Fire']);
  assert.deepEqual(out.attached, ['Fire', 'Water']);
});

test('attack: "Discard all {P} Energy" discards only that type (I99)', () => {
  const out = attackWith('Discard all {P} Energy from this Pokémon.', ['Psychic', 'Psychic', 'Metal']);
  assert.deepEqual(out.discarded, ['Psychic', 'Psychic']);
  assert.deepEqual(out.attached, ['Metal']);
});

test('attack: "Discard all basic {R} Energy attached to" reads the basic qualifier (I99)', () => {
  const out = attackWith('Discard all basic {R} Energy attached to this Pokémon.', ['Fire', 'Lightning']);
  assert.deepEqual(out.discarded, ['Fire']);
});

test('attack: "Discard a {W} and a {L} Energy" discards one of each (I99)', () => {
  const out = attackWith('Discard a {W} and a {L} Energy attached to this Pokémon.', ['Water', 'Water', 'Lightning']);
  assert.deepEqual(out.discarded, ['Lightning', 'Water']);
  assert.deepEqual(out.attached, ['Water']);
});

test('parseAttackEnergyDiscard: player-choice and coin-gated costs stay unparsed (I99)', () => {
  for (const text of [
    'Discard all basic {R} Energy or all basic {L} Energy attached to this Pokémon.',
    'Discard as many {M} Energy attached to this Pokémon as you like.',
    'You may discard up to 2 basic {R} Energy or up to 2 basic {L} Energy from this Pokémon.',
    'Flip a coin. If tails, discard 2 {W} Energy attached to this Pokémon.',
  ]) {
    assert.equal(parseAttackEnergyDiscard({ text }), null, text);
  }
});

// Magearna ex (Silver Tempest 128) Fleur Cannon: out/pkmn-pokemon-cards.json text of Magearna V's twin move.
test('attack: "discard all Special Energy from this Pokémon" keeps basic Energy attached', () => {
  const text = 'If this Pokémon has any Special Energy attached, this attack does 60 more damage. Then, discard all Special Energy from this Pokémon.';
  const out = attackWith(text, ['Metal', 'Psychic'], ['Double Turbo Energy', 'Jet Energy']);
  assert.deepEqual(out.discardedNames, ['Double Turbo Energy', 'Jet Energy']);
  assert.deepEqual(out.attached, ['Metal', 'Psychic']);
});

test('parseAttackEnergyDiscard: "discard all Special Energy" is a special-only discard', () => {
  assert.deepEqual(parseAttackEnergyDiscard({ text: 'Then, discard all Special Energy from this Pokémon.' }), {
    all: false,
    count: Infinity,
    energyType: null,
    special: true,
  });
});
