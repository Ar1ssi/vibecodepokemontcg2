// Talonflame (customhb 458, source xy6-15) Gale Wings: "{C} Energy attached to this Pokémon is
// treated as {R} Energy." Text from client/src/assets/custom-sets/customhb/set.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import { serverEnergyDescriptor } from '../server-energy.mjs';
import { canPayAttackCost, expandEnergyEntries } from '../attack-engine.mjs';
import { parseEnergyMultiplier } from '../ability-executors.mjs';
import { abilityEnergyMultiplier } from '../ability-combat.mjs';

const talonflame = {
  name: 'Talonflame',
  abilities: [
    { type: 'Ability', name: 'Gale Wings', effect: '{C} Energy attached to this Pokémon is treated as {R} Energy.' },
  ],
};
const bystander = { name: 'Pidgey', abilities: [] };
const dce = { name: 'Double Colorless Energy', supertype: 'Energy', subtypes: ['Special'] };
const colorless = { name: 'Colorless Energy', supertype: 'Energy', subtypes: ['Basic'] };
const flareBlitz = ['Fire', 'Colorless'];

const pool = (energy, hostPokemon) => expandEnergyEntries([serverEnergyDescriptor(energy, { hostPokemon })]);

test('Double Colorless on Talonflame pays {R}{C}', () => {
  assert.deepEqual(pool(dce, talonflame), ['Fire', 'Fire']);
  assert.equal(canPayAttackCost([serverEnergyDescriptor(dce, { hostPokemon: talonflame })], flareBlitz), true);
});

test('Double Colorless on another Pokémon cannot pay {R}', () => {
  assert.equal(canPayAttackCost([serverEnergyDescriptor(dce, { hostPokemon: bystander })], flareBlitz), false);
});

test('basic Colorless Energy on Talonflame provides {R}', () => {
  assert.deepEqual(pool(colorless, talonflame), ['Fire']);
});

test('Gale Wings is a type change, not an Energy multiplier', () => {
  assert.deepEqual(parseEnergyMultiplier(talonflame), { multiplier: 0, energyType: null });
  assert.equal(abilityEnergyMultiplier([talonflame]), null);
});
