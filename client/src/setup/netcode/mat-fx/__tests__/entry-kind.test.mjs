import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signatureEntryKind } from '../entry-kind.mjs';

test('signatureEntryKind: missing or hidden cards have no signature entry', () => {
  assert.equal(signatureEntryKind(null), null);
  assert.equal(signatureEntryKind(undefined), null);
  assert.equal(signatureEntryKind('Mega Gengar ex'), null);
  assert.equal(signatureEntryKind({}), null);
  assert.equal(signatureEntryKind({ instanceId: 7, faceDown: true }), null);
});

test('signatureEntryKind: plain Pokémon, ex and V get no signature entry', () => {
  assert.equal(
    signatureEntryKind({ supertype: 'Pokémon', name: 'Pikachu', hp: 60 }),
    null
  );
  assert.equal(
    signatureEntryKind({
      supertype: 'Pokémon',
      name: 'Charizard ex',
      subtypes: ['Stage 2', 'ex'],
    }),
    null
  );
  assert.equal(
    signatureEntryKind({
      supertype: 'Pokémon',
      name: 'Lugia V',
      subtypes: ['Basic', 'V'],
    }),
    null
  );
});

test('signatureEntryKind: modern and legacy Mega Pokémon are mega', () => {
  assert.equal(
    signatureEntryKind({
      supertype: 'Pokémon',
      name: 'Mega Kangaskhan ex',
      hp: 300,
    }),
    'mega'
  );
  assert.equal(
    signatureEntryKind({ supertype: 'Pokémon', name: 'M Lucario-EX', hp: 210 }),
    'mega'
  );
  assert.equal(
    signatureEntryKind({
      supertype: 'Pokémon',
      name: 'Primal Kyogre-EX',
      hp: 240,
    }),
    'mega'
  );
});

test('signatureEntryKind: Tera by subtype or by rule text is tera', () => {
  assert.equal(
    signatureEntryKind({
      supertype: 'Pokémon',
      name: 'Greninja ex',
      subtypes: ['Stage 2', 'ex', 'Tera'],
    }),
    'tera'
  );
  assert.equal(
    signatureEntryKind({
      supertype: 'Pokémon',
      name: 'Terapagos ex',
      hp: 230,
      text: 'Tera: As long as this Pokémon is on your Bench, prevent all damage done to it by attacks.',
    }),
    'tera'
  );
});

test('signatureEntryKind: a Trainer named like a Mega is not a Pokémon entry', () => {
  assert.equal(
    signatureEntryKind({ supertype: 'Trainer', name: 'Mega Signal' }),
    null
  );
});

test('a homebrew Tera stage card gets the Tera entry without the printed rule', () => {
  assert.equal(signatureEntryKind({ name: 'Dragonite ex', supertype: 'Pokémon', stage: 'TERAHB' }), 'tera');
});

// Pikachu VMAX, SWSH Promos SWSH286 (out/pkmn-pokemon-cards.json): "G-Max Thunder"; Mew VMAX,
// 30th Celebration: "Max Miracle". Gigantamax and Dynamax VMAX alike get the Gigantamax entry.
test('signatureEntryKind: every Pokémon VMAX is gmax, by subtype, name or stage', () => {
  assert.equal(signatureEntryKind({ supertype: 'Pokémon', name: 'Pikachu VMAX', subtypes: ['VMAX'] }), 'gmax');
  assert.equal(signatureEntryKind({ supertype: 'Pokémon', name: 'Mew VMAX', hp: 310 }), 'gmax');
  assert.equal(signatureEntryKind({ supertype: 'Pokémon', name: 'Snorlax', stage: 'VMAX', hp: 340 }), 'gmax');
});

test('signatureEntryKind: V and VSTAR are not gmax', () => {
  assert.equal(signatureEntryKind({ supertype: 'Pokémon', name: 'Pikachu V', subtypes: ['Basic', 'V'] }), null);
  assert.equal(signatureEntryKind({ supertype: 'Pokémon', name: 'Arceus VSTAR', subtypes: ['VSTAR'] }), null);
});
