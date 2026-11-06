// Rayquaza Air Lock (custom set customhb, set.json): "As long as this Pokémon is in play, Pokémon
// with the Drizzle or Drought Ability have no Abilities." Only those named Abilities are switched off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAbilitySuppressed } from '../rules/ability-combat.mjs';

const AIR_LOCK = 'As long as this Pokémon is in play, Pokémon with the Drizzle or Drought Ability have no Abilities.';
const withAbility = (instanceId, name, abilityName, text) => ({
  instanceId,
  name,
  supertype: 'Pokémon',
  abilities: [{ name: abilityName, type: 'Ability', text }],
});
const rayquaza = withAbility(1, 'Rayquaza', 'Air Lock', AIR_LOCK);
const drizzle = withAbility(2, 'Drizzle holder', 'Drizzle', 'As long as this Pokémon is in play, Pokémon that have {W} or {L} Energy attached do 20 more damage.');
const drought = withAbility(3, 'Drought holder', 'Drought', 'As long as this Pokémon is in play, Fire Pokémon do 20 more damage.');
const other = withAbility(4, 'Other', 'Draw', 'Once during your turn, you may draw a card.');

const ctx = (bench) => ({
  sideActive: [other],
  sideBench: bench,
  sideCards: [other, ...bench],
  opponentActive: [drizzle],
  opponentBench: [drought],
  opponentSideCards: [drizzle, drought],
});

test('Air Lock switches off Drizzle and Drought on both sides, from the Bench too', () => {
  const c = ctx([rayquaza]);
  assert.equal(isAbilitySuppressed(drizzle, c), true);
  assert.equal(isAbilitySuppressed(drought, c), true);
});

test('Air Lock leaves every other Ability alone, including its own', () => {
  const c = ctx([rayquaza]);
  assert.equal(isAbilitySuppressed(other, c), false);
  assert.equal(isAbilitySuppressed(rayquaza, c), false);
});

test('Without Air Lock in play Drizzle works', () => {
  assert.equal(isAbilitySuppressed(drizzle, ctx([])), false);
});

test('A Drizzle holder on your own side is switched off as well', () => {
  const own = { ...ctx([rayquaza]), sideBench: [rayquaza, drizzle], sideCards: [other, rayquaza, drizzle] };
  assert.equal(isAbilitySuppressed(drizzle, own), true);
});
