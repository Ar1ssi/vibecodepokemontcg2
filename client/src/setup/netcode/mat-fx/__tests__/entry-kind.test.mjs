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
  assert.equal(signatureEntryKind({ supertype: 'Pokémon', name: 'Pikachu', hp: 60 }), null);
  assert.equal(signatureEntryKind({ supertype: 'Pokémon', name: 'Charizard ex', subtypes: ['Stage 2', 'ex'] }), null);
  assert.equal(signatureEntryKind({ supertype: 'Pokémon', name: 'Lugia V', subtypes: ['Basic', 'V'] }), null);
});

test('signatureEntryKind: modern and legacy Mega Pokémon are mega', () => {
  assert.equal(signatureEntryKind({ supertype: 'Pokémon', name: 'Mega Kangaskhan ex', hp: 300 }), 'mega');
  assert.equal(signatureEntryKind({ supertype: 'Pokémon', name: 'M Lucario-EX', hp: 210 }), 'mega');
  assert.equal(signatureEntryKind({ supertype: 'Pokémon', name: 'Primal Kyogre-EX', hp: 240 }), 'mega');
});

test('signatureEntryKind: Tera by subtype or by rule text is tera', () => {
  assert.equal(
    signatureEntryKind({ supertype: 'Pokémon', name: 'Greninja ex', subtypes: ['Stage 2', 'ex', 'Tera'] }),
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
  assert.equal(signatureEntryKind({ supertype: 'Trainer', name: 'Mega Signal' }), null);
});
