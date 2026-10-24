import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  customCardImageBase,
  isCustomCardId,
  isCustomSetId,
  setCodeForId,
  validateCustomSet,
} from '../custom-set-schema.mjs';

import { sampleSet } from './fixtures.mjs';

const withCard = (patch, index = 0) => {
  const set = sampleSet();
  set.cards[index] = { ...set.cards[index], ...patch };
  return set;
};

test('id helpers', () => {
  assert.equal(isCustomSetId('customhbw'), true);
  assert.equal(isCustomSetId('custom'), false);
  assert.equal(isCustomSetId('sv03.5'), false);
  assert.equal(isCustomSetId('customtoolong'), false);
  assert.equal(isCustomCardId('customhbw-001'), true);
  assert.equal(isCustomCardId('customhbw-1'), false);
  assert.equal(isCustomCardId('sv03.5-065'), false);
  assert.equal(setCodeForId('customhbw'), 'HBW');
  assert.equal(customCardImageBase('customhbw', '001'), '/src/assets/custom-sets/customhbw/001');
});

test('the sample set is valid', () => {
  const result = validateCustomSet(sampleSet(), { setDirName: 'customhbw' });
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.equal(result.set.id, 'customhbw');
});

test('rejects non-objects and the wrong format or version', () => {
  assert.equal(validateCustomSet(null).ok, false);
  assert.equal(validateCustomSet([]).ok, false);
  assert.match(validateCustomSet(sampleSet({ format: 'ptcg-sim.custom-set' })).errors.join(), /format/);
  assert.match(validateCustomSet(sampleSet({ version: 2 })).errors.join(), /version/);
});

test('set id, folder, code and name rules', () => {
  assert.match(validateCustomSet(sampleSet({ id: 'hbw' })).errors.join(), /^id:/m);
  assert.match(validateCustomSet(sampleSet(), { setDirName: 'customabc' }).errors.join(), /folder is customabc/);
  assert.match(validateCustomSet(sampleSet({ code: 'ABC' })).errors.join(), /code: expected HBW/);
  assert.match(validateCustomSet(sampleSet({ code: 'hbw' })).errors.join(), /code: 2–5 capital/);
  assert.match(validateCustomSet(sampleSet({ name: '' })).errors.join(), /name/);
  assert.match(validateCustomSet(sampleSet({ releaseDate: 'yesterday' })).errors.join(), /releaseDate/);
  assert.match(validateCustomSet(sampleSet({ cards: [] })).errors.join(), /cards: at least one/);
});

test('card identity: localId, id, image, duplicates', () => {
  assert.match(validateCustomSet(withCard({ localId: '1' })).errors.join(), /localId: three digits/);
  assert.match(validateCustomSet(withCard({ id: 'customhbw-009' })).errors.join(), /id: expected "customhbw-001"/);
  assert.match(validateCustomSet(withCard({ image: 'https://x/y' })).errors.join(), /image: expected/);
  const dup = sampleSet();
  dup.cards[1] = { ...dup.cards[0] };
  assert.match(validateCustomSet(dup).errors.join(), /used twice/);
  assert.match(validateCustomSet(withCard({ category: 'Thing' })).errors.join(), /category/);
});

test('Pokémon rules: hp, types, stage, attacks, abilities, sides, retreat', () => {
  const errorsOf = (patch) => validateCustomSet(withCard(patch)).errors.join('\n');
  assert.match(errorsOf({ hp: 185 }), /hp: a multiple of 10/);
  assert.match(errorsOf({ hp: '180' }), /hp/);
  assert.match(errorsOf({ types: ['Fairy'] }), /unknown Energy type "Fairy"/);
  assert.match(errorsOf({ types: [] }), /at least one type/);
  assert.match(errorsOf({ stage: 'Mega' }), /stage: one of/);
  assert.match(errorsOf({ evolveFrom: '' }), /evolveFrom: required/);
  const five = Array.from({ length: 5 }, (_, i) => ({ cost: [], name: `A${i}`, damage: '', effect: '' }));
  assert.match(errorsOf({ attacks: five }), /at most 4 attacks/);
  assert.match(errorsOf({ attacks: [{ cost: ['Fairy'], name: 'A', damage: '10' }] }), /cost: unknown Energy type/);
  assert.match(errorsOf({ attacks: [{ cost: [], name: 'A', damage: 'ten' }] }), /damage/);
  assert.match(errorsOf({ attacks: [{ cost: [], name: '', damage: '10' }] }), /name: required/);
  const three = Array.from({ length: 3 }, (_, i) => ({ type: 'Ability', name: `B${i}`, effect: 'x' }));
  assert.match(errorsOf({ abilities: three }), /at most 2 abilities/);
  assert.match(errorsOf({ abilities: [{ type: 'Ability', name: 'B', effect: '' }] }), /effect: required/);
  assert.match(errorsOf({ weaknesses: [{ type: 'Grass' }] }), /weaknesses\[0\]/);
  assert.match(errorsOf({ retreat: 6 }), /retreat/);
  assert.equal(validateCustomSet(withCard({ attacks: [{ cost: [], name: 'A', damage: 120 }] })).ok, true);
  assert.equal(validateCustomSet(withCard({ attacks: [{ cost: [], name: 'A', damage: '90+' }] })).ok, true);
});

test('Trainer rules: kind, effect, hp', () => {
  const errorsOf = (patch) => validateCustomSet(withCard(patch, 1)).errors.join('\n');
  assert.match(errorsOf({ trainerType: 'Energy' }), /trainerType/);
  assert.match(errorsOf({ effect: undefined }), /effect: expected text/);
  assert.match(errorsOf({ hp: 55 }), /hp: a multiple of 10/);
  assert.equal(validateCustomSet(withCard({ hp: 50, abilities: [{ type: 'Ability', name: 'Fossil', effect: 'x' }] }, 1)).ok, true);
});

test('extra keys (cardback round-trip block) are allowed', () => {
  const set = withCard({ custom: { source: 'swsh3-88', edits: { hp: '180' } } });
  assert.equal(validateCustomSet(set).ok, true);
});

test('array- or null-typed fields are errors, not coerced strings (review of design 075)', () => {
  const errorsOf = (patch, index = 0) => validateCustomSet(withCard(patch, index)).errors.join('\n');
  assert.match(errorsOf({ localId: ['001'], id: 'customhbw-001' }), /localId: three digits/);
  assert.match(errorsOf({ weaknesses: [null] }), /weaknesses\[0\]/);
  assert.match(errorsOf({ resistances: [['Fire']] }), /resistances\[0\]/);
  assert.match(errorsOf({ attacks: [{ cost: [], name: 'A', damage: ['90'] }] }), /damage/);
  assert.match(validateCustomSet(sampleSet({ releaseDate: ['2026-10-23'] })).errors.join(), /releaseDate/);
  assert.match(validateCustomSet(sampleSet({ code: ['HBW'] })).errors.join(), /code: 2–5 capital/);
  assert.match(validateCustomSet(sampleSet({ group: 'other' })).errors.join(), /group: one of custom, homebrew/);
  assert.equal(validateCustomSet(sampleSet({ group: 'homebrew' })).ok, true);
  const twins = sampleSet();
  twins.cards[1] = { ...twins.cards[0] };
  assert.match(validateCustomSet(twins).errors.join(), /001 is used twice/);
});

test('Energy cards, too many cards and printed decklist codes are refused', () => {
  assert.match(validateCustomSet(withCard({ category: 'Energy' })).errors.join(), /category: one of Pokemon, Trainer/);
  const big = sampleSet();
  big.cards = Array.from({ length: 1000 }, () => big.cards[0]);
  assert.match(validateCustomSet(big).errors.join(), /cards: at most 999/);
  assert.match(
    validateCustomSet(sampleSet({ id: 'customsvi', code: 'SVI', cards: [] }), { reservedCodes: ['SVI'] }).errors.join(),
    /code: SVI is a printed set's decklist code/
  );
  assert.equal(validateCustomSet(sampleSet(), { reservedCodes: ['SVI'] }).ok, true);
});
