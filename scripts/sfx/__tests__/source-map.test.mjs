import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { EXCLUDED, SOURCE_MAP, isExcluded, keyForFile } from '../source-map.mjs';
import { classifyFiles } from '../import-tcgl-sfx.mjs';

// ls of E:\TCGLive_Extract\FMOD_Audio\SFX_Battle, taken 2026-10-07 (S337): 276 names.
const EXTRACT_NAMES = readFileSync(new URL('./tcgl-sfx-files.txt', import.meta.url), 'utf8')
  .split(/\r?\n/)
  .filter(Boolean);

test('the fixture is the full 276-file extract', () => {
  assert.equal(EXTRACT_NAMES.length, 276);
});

test('every extract file is mapped or deliberately excluded, never both', () => {
  for (const name of EXTRACT_NAMES) {
    const mapped = Object.hasOwn(SOURCE_MAP, name);
    assert.notEqual(mapped, isExcluded(name), `${name} must be exactly one of mapped / excluded`);
  }
  assert.deepEqual(classifyFiles(EXTRACT_NAMES).unknown, []);
});

test('no SOURCE_MAP entry points at a file the extract lacks', () => {
  const names = new Set(EXTRACT_NAMES);
  for (const name of Object.keys(SOURCE_MAP)) assert.ok(names.has(name), `${name} is not in the extract`);
});

test('the long-form jumbotron parts and four unbound files are excluded (Addendum A)', () => {
  const excluded = EXTRACT_NAMES.filter(isExcluded);
  assert.equal(excluded.filter((n) => /_jumbotron_(intro|loop|outro|flash_\d+)\.wav$/.test(n)).length, 63);
  assert.equal(excluded.length, 63 + 4);
  assert.equal(EXCLUDED.length, 5);
  assert.equal(EXTRACT_NAMES.filter((n) => /_attack_(small|medium|large)\.wav$/.test(n) && isExcluded(n)).length, 0);
});

test('attack hits map per type and size; every reduced jumbotron maps to a sting', () => {
  const keys = new Set(Object.values(SOURCE_MAP).map((e) => e.key));
  for (const type of ['colorless', 'dark', 'dragon', 'electric', 'fairy', 'fighting', 'fire', 'grass', 'metal', 'psychic', 'water']) {
    for (const size of ['small', 'medium', 'large']) assert.ok(keys.has(`attack-${type}-${size}`), `attack-${type}-${size}`);
    assert.ok(keys.has(`sting-${type}`), `sting-${type}`);
  }
  assert.deepEqual(keyForFile('sfx_rain_lightning_jumbotron_reduced.wav'), { key: 'sting-electric' });
  assert.deepEqual(keyForFile('sfx_rain_electric_attack_large.wav'), { key: 'attack-electric-large' });
});

test('209 files map; same-key files are numbered variants, single-file keys have none', () => {
  assert.equal(Object.keys(SOURCE_MAP).length, 209);
  const byKey = new Map();
  for (const { key, variant } of Object.values(SOURCE_MAP)) byKey.set(key, [...(byKey.get(key) ?? []), variant]);
  for (const [key, variants] of byKey) {
    if (variants.length === 1) assert.equal(variants[0], undefined, `${key} has one file, so no variant number`);
    else {
      assert.ok(variants.every(Number.isInteger), `${key} variants must be numbered`);
      assert.equal(new Set(variants).size, variants.length, `${key} repeats a variant number`);
    }
  }
});

test('keyForFile resolves variants and returns null for excluded or unknown files', () => {
  assert.deepEqual(keyForFile('sfx_rainier_shuffle_02.wav'), { key: 'shuffle', variant: 2 });
  assert.deepEqual(keyForFile('sfx_rain_lightning_jumbotron_intro.wav'), null);
  assert.deepEqual(keyForFile('sfx_rain_electric_pokemon_active.wav'), { key: 'active-electric' });
  assert.equal(keyForFile('sfx_rain_victory.wav').key, 'victory');
  assert.equal(keyForFile('sfx_rain_marne_special.wav'), null);
  assert.equal(keyForFile('not_in_the_extract.wav'), null);
  assert.equal(keyForFile('constructor'), null);
});

test('every Pokémon type has an active cue and every status has intro, loop and outro', () => {
  const keys = new Set(Object.values(SOURCE_MAP).map((e) => e.key));
  for (const type of ['colorless', 'dark', 'dragon', 'electric', 'fairy', 'fighting', 'fire', 'grass', 'metal', 'psychic', 'water'])
    assert.ok(keys.has(`active-${type}`), `active-${type}`);
  for (const status of ['burn', 'poison', 'sleep', 'paralyze', 'confusion'])
    for (const phase of ['intro', 'loop', 'outro']) assert.ok(keys.has(`${status}-${phase}`), `${status}-${phase}`);
});
