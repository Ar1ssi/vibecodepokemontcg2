// Audit SE2/SE3: what attached special Energy pays, read from its printed provisions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serverEnergyDescriptor } from '../server-energy.mjs';
import { canPayAttackCost, expandEnergyEntries } from '../attack-engine.mjs';

const BASIC = { instanceId: 1, name: 'Pikachu', stage: 'Basic', types: ['Lightning'] };
const STAGE1 = { instanceId: 1, name: 'Raichu', stage: 'Stage 1', types: ['Lightning'] };

const TEXT = {
  jet: 'As long as this card is attached to a Pokémon, it provides {C} Energy. When you attach this card from your hand to 1 of your Benched Pokémon, switch that Pokémon with your Active Pokémon.',
  teamRocket:
    "This card can only be attached to a Team Rocket's Pokémon. If this card is attached to anything other than a Team Rocket's Pokémon, discard this card. As long as this card is attached to a Pokémon, it provides 2 in any combination of {P} Energy and {D} Energy.",
  reversal:
    'As long as this card is attached to a Pokémon, it provides {C} Energy. If you have more Prize cards remaining than your opponent, and if this card is attached to an Evolution Pokémon that doesn’t have a Rule Box (Pokémon ex, Pokémon V, etc. have Rule Boxes), this card provides every type of Energy but provides only 3 Energy at a time.',
  luminous:
    'As long as this card is attached to a Pokémon, it provides every type of Energy but provides only 1 Energy at a time. If the Pokémon this card is attached to has any other Special Energy attached, this card provides {C} Energy instead.',
  ignition:
    'If this card is attached to 1 of your Pokémon, discard it at the end of your turn. As long as this card is attached to a Pokémon, it provides {C} Energy. If this card is attached to an Evolution Pokémon, it provides {C}{C}{C} Energy instead.',
  shield:
    'This card can only be attached to {M} Pokémon. This card provides {M} Energy only while this card is attached to a {M} Pokémon. The attacks of your opponent’s Pokémon do 10 less damage to the {M} Pokémon this card is attached to (before applying Weakness and Resistance). (If this card is attached to anything other than a {M} Pokémon, discard this card.)',
};

const energy = (name, text, extra = {}) => ({
  instanceId: extra.instanceId ?? 50,
  name,
  type: 'Energy',
  attachedTo: 1,
  ...(text ? { text } : {}),
  ...extra,
});

const pool = (card, options) => expandEnergyEntries([serverEnergyDescriptor(card, options)]);
const pays = (card, cost, options) => canPayAttackCost([serverEnergyDescriptor(card, options)], cost);

test('SE2: a {C}-providing special pays only Colorless, with or without its text', () => {
  assert.deepEqual(pool(energy('Jet Energy', TEXT.jet), { hostPokemon: BASIC }), ['Colorless']);
  assert.equal(pays(energy('Jet Energy', TEXT.jet), ['Fire'], { hostPokemon: BASIC }), false);
  assert.equal(pays(energy('Jet Energy'), ['Fire'], { hostPokemon: BASIC }), false);
  assert.equal(pays(energy('Jet Energy'), ['Colorless'], { hostPokemon: BASIC }), true);
});

test('SE2: Prism Energy is any type only on a Basic Pokémon', () => {
  assert.equal(pays(energy('Prism Energy'), ['Fire'], { hostPokemon: BASIC }), true);
  assert.equal(pays(energy('Prism Energy'), ['Fire'], { hostPokemon: STAGE1 }), false);
  assert.equal(pays(energy('Prism Energy'), ['Colorless'], { hostPokemon: STAGE1 }), true);
});

test("SE3: Team Rocket's Energy provides 2 units, each {P} or {D}", () => {
  const card = energy("Team Rocket's Energy", TEXT.teamRocket);
  const host = { ...BASIC, name: "Team Rocket's Mewtwo ex", types: ['Psychic'] };
  assert.equal(pays(card, ['Psychic', 'Darkness'], { hostPokemon: host }), true);
  assert.equal(pays(card, ['Psychic', 'Psychic'], { hostPokemon: host }), true);
  assert.equal(pays(card, ['Fire'], { hostPokemon: host }), false);
  assert.equal(pays(card, ['Psychic', 'Darkness', 'Colorless'], { hostPokemon: host }), false);
});

test('SE3: Twin Energy gives 2 on a non-V/GX Pokémon, 1 on a Pokémon V', () => {
  assert.deepEqual(pool(energy('Twin Energy'), { hostPokemon: BASIC }), ['Colorless', 'Colorless']);
  assert.deepEqual(pool(energy('Twin Energy'), { hostPokemon: { ...BASIC, name: 'Pikachu V' } }), [
    'Colorless',
  ]);
});

test('SE3: Double Rainbow Energy pays two different colors', () => {
  assert.equal(pays(energy('Double Rainbow Energy'), ['Fire', 'Water'], { hostPokemon: STAGE1 }), true);
});

test('SE3: Reversal Energy provides 3 of any type only while trailing on a non-Rule-Box Evolution', () => {
  const card = energy('Reversal Energy', TEXT.reversal);
  const trailing = { ownPrizes: 5, opponentPrizes: 2 };
  const cost = ['Fire', 'Water', 'Grass'];
  assert.equal(pays(card, cost, { hostPokemon: STAGE1, board: trailing }), true);
  assert.equal(pays(card, cost, { hostPokemon: STAGE1, board: { ownPrizes: 2, opponentPrizes: 5 } }), false);
  assert.equal(pays(card, cost, { hostPokemon: BASIC, board: trailing }), false);
  assert.equal(pays(card, cost, { hostPokemon: { ...STAGE1, name: 'Raichu ex' }, board: trailing }), false);
  assert.deepEqual(pool(card, { hostPokemon: STAGE1 }), ['Colorless'], 'no board facts: not trailing');
});

test('SE3: Luminous Energy drops to {C} beside another special Energy', () => {
  const card = energy('Luminous Energy', TEXT.luminous);
  const other = energy('Jet Energy', TEXT.jet, { instanceId: 51 });
  assert.deepEqual(pool(card, { hostPokemon: BASIC, attachedCards: [card] }), ['Wildcard']);
  assert.deepEqual(pool(card, { hostPokemon: BASIC, attachedCards: [card, other] }), ['Colorless']);
});

test('SE3: Ignition Energy provides {C}{C}{C} on an Evolution Pokémon', () => {
  const card = energy('Ignition Energy', TEXT.ignition);
  assert.deepEqual(pool(card, { hostPokemon: BASIC }), ['Colorless']);
  assert.deepEqual(pool(card, { hostPokemon: STAGE1 }), ['Colorless', 'Colorless', 'Colorless']);
});

test('SE3: Shield Energy provides nothing off a {M} Pokémon', () => {
  const card = energy('Shield Energy', TEXT.shield);
  assert.deepEqual(pool(card, { hostPokemon: BASIC }), []);
  assert.deepEqual(pool(card, { hostPokemon: { ...BASIC, types: ['Metal'] } }), ['Metal']);
});
