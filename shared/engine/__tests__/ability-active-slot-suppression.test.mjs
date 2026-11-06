// Galarian Weezing (custom set customhb, set.json) Neutralizing Gas: "As long as this Pokémon is
// in your Active slot, your opponent's Pokémon have no Abilities." "slot" is the custom set's
// wording for the Active Spot; the holder must be Active for the suppression to apply.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAbilitySuppressed } from '../rules/ability-combat.mjs';

const GAS = "As long as this Pokémon is in your Active slot, your opponent's Pokémon have no Abilities.";
const weezing = { instanceId: 1, name: 'Galarian Weezing', supertype: 'Pokémon', abilities: [{ name: 'Neutralizing Gas', text: GAS }] };
const target = {
  instanceId: 2,
  name: 'Target',
  supertype: 'Pokémon',
  abilities: [{ name: 'Draw', type: 'Ability', text: 'Once during your turn, you may draw a card.' }],
};
const filler = { instanceId: 3, name: 'Filler', supertype: 'Pokémon' };

test('Neutralizing Gas on the Bench suppresses nothing', () => {
  const ctx = {
    sideActive: [filler],
    sideBench: [weezing],
    sideCards: [filler, weezing],
    opponentActive: [target],
    opponentBench: [],
    opponentSideCards: [target],
  };
  assert.equal(isAbilitySuppressed(target, ctx), false);
});

test('Neutralizing Gas in the Active slot suppresses the opponent’s Pokémon only', () => {
  const ctx = {
    sideActive: [weezing],
    sideBench: [filler],
    sideCards: [weezing, filler],
    opponentActive: [target],
    opponentBench: [],
    opponentSideCards: [target],
  };
  assert.equal(isAbilitySuppressed(target, ctx), true);
  assert.equal(isAbilitySuppressed(filler, ctx), false, 'own Pokémon keep their Abilities');
});
