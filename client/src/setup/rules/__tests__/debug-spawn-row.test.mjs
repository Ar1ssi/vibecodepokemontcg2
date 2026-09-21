import test from 'node:test';
import assert from 'node:assert/strict';

const { resultToRow, shouldAutoAttach, firstPokemonIndex, pickLegacyEnergy } = await import('../debug-spawn-row.mjs');

test('maps a full tcgdex result to the 7-field Card row shape', () => {
  const result = {
    id: 'sv1-1',
    name: 'Pikachu ex',
    supertype: 'Pokémon',
    number: '1',
    set: { id: 'sv1' },
    image: 'https://assets.tcgdex.net/en/sv/sv1/1/high.webp',
  };
  assert.deepEqual(resultToRow(result), [
    'Pikachu ex',
    'Pokémon',
    'https://assets.tcgdex.net/en/sv/sv1/1/high.webp',
    '1',
    'sv1',
    'sv1-1',
  ]);
});

test('falls back to images.large/small when image is absent', () => {
  const row = resultToRow({ name: 'N', images: { small: 's.webp', large: 'l.webp' } });
  assert.equal(row[2], 'l.webp');
});

test('missing optional fields become null, not undefined', () => {
  const row = resultToRow({ name: 'Bench Energy', supertype: 'Energy' });
  assert.deepEqual(row, ['Bench Energy', 'Energy', '', null, null, null]);
});

test('empty result yields safe defaults', () => {
  assert.deepEqual(resultToRow(), ['', '', '', null, null, null]);
});

test('shouldAutoAttach: Special Energy only', () => {
  assert.equal(shouldAutoAttach({ type: 'Energy', name: 'Double Turbo Energy', energyType: 'Special' }), true);
  assert.equal(shouldAutoAttach({ type: 'Energy', name: 'Basic Fire Energy' }), false);
  assert.equal(shouldAutoAttach({ type: 'Pokémon', name: 'Pikachu' }), false);
  assert.equal(shouldAutoAttach(null), false);
});

test('firstPokemonIndex: finds the Pokémon, -1 when none or empty', () => {
  assert.equal(firstPokemonIndex([{ type: 'Energy' }, { type: 'Pokémon' }]), 1);
  assert.equal(firstPokemonIndex([{ type: 'Energy' }]), -1);
  assert.equal(firstPokemonIndex(), -1);
});

test('pickLegacyEnergy: exact name only, first match, null otherwise', () => {
  const legacy = { name: 'legacy energy ', id: 'sm11-176' };
  assert.equal(pickLegacyEnergy([{ name: 'Legacy Energy Fake' }, legacy, { name: 'Legacy Energy' }]), legacy);
  assert.equal(pickLegacyEnergy([{ name: 'Fire Energy' }]), null);
  assert.equal(pickLegacyEnergy(), null);
});
