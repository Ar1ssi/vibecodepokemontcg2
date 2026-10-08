import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POKEMON_SPRITE_CATALOG } from '../../../../deck-builder/core/pokemon-sprite-catalog.generated.mjs';
import { GEN9_SPRITE_CATALOG } from '../../../../deck-builder/core/pokemon-sprite-catalog-gen9.mjs';
import { moveFor, speciesFor, statClassFor } from '../move-select.mjs';
import {
  SPECIES_FALLBACKS,
  SPECIES_ID,
  SPECIES_STATS,
} from '../species-stats.generated.mjs';

test('every slug of both sprite catalogs resolves to a species with stats', () => {
  const slugs = [...POKEMON_SPRITE_CATALOG, ...GEN9_SPRITE_CATALOG].map(
    (entry) => entry.slug
  );
  const missing = slugs.filter((slug) => !SPECIES_STATS[SPECIES_ID[slug]]);
  assert.deepEqual(missing, []);
});

test('SPECIES_STATS rows are [atk, spa, lowercase type...] with one or two types', () => {
  for (const [id, [atk, spa, ...types]] of Object.entries(SPECIES_STATS)) {
    assert.ok(Number.isInteger(atk) && atk > 0, `${id} atk`);
    assert.ok(Number.isInteger(spa) && spa > 0, `${id} spa`);
    assert.ok(types.length >= 1 && types.length <= 2, `${id} types`);
    for (const type of types) assert.equal(type, type.toLowerCase(), id);
  }
});

test('SPECIES_FALLBACKS lists only slugs that resolve to a base species id', () => {
  for (const slug of SPECIES_FALLBACKS) {
    assert.ok(SPECIES_ID[slug], slug);
    assert.equal(SPECIES_ID[slug], slug.replace(/-mega(-[xyz])?$/, ''), slug);
  }
});

test('pinned forms: Mega Charizard X 130/130 is a coin, Gardevoir special, Machamp physical', () => {
  assert.deepEqual(SPECIES_STATS.charizardmegax, [130, 130, 'fire', 'dragon']);
  const megaX = speciesFor({ name: 'Mega Charizard X ex', types: ['Fire'] });
  assert.deepEqual(megaX, { atk: 130, spa: 130, types: ['fire', 'dragon'] });
  assert.equal(statClassFor(megaX, 'physical'), 'physical');
  assert.equal(statClassFor(megaX, 'special'), 'special');

  const gardevoir = speciesFor({ name: 'Gardevoir', types: ['Psychic'] });
  assert.equal(gardevoir.atk, 65);
  assert.equal(gardevoir.spa, 125);
  assert.equal(statClassFor(gardevoir, 'physical'), 'special');

  const machamp = speciesFor({ name: 'Machamp', types: ['Fighting'] });
  assert.equal(machamp.atk, 130);
  assert.equal(machamp.spa, 65);
  assert.equal(statClassFor(machamp, 'special'), 'physical');
});

test('speciesFor: unknown or missing names are null', () => {
  assert.equal(speciesFor({ name: 'Definitely Not A Pokemon' }), null);
  assert.equal(speciesFor({ name: '' }), null);
  assert.equal(speciesFor({}), null);
  assert.equal(speciesFor(null), null);
});

test('moveFor with speciesFor stats: Gardevoir plays a special move, Machamp a physical one', () => {
  const gardevoir = {
    name: 'Gardevoir ex',
    stage: 'Stage 2',
    types: ['Psychic'],
  };
  const machamp = { name: 'Machamp', stage: 'Stage 2', types: ['Fighting'] };
  // Several instance ids so a coin fallback (stats ignored) could not pass by luck.
  for (const instanceId of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const special = moveFor(gardevoir, {
      instanceId,
      attackName: 'Psychic Embrace',
      species: speciesFor(gardevoir),
      damage: 90,
    });
    assert.equal(special.statClass, 'special', `gardevoir ${instanceId}`);
    const physical = moveFor(machamp, {
      instanceId,
      attackName: 'Dynamic Punch',
      species: speciesFor(machamp),
      damage: 90,
    });
    assert.equal(physical.statClass, 'physical', `machamp ${instanceId}`);
  }
});
