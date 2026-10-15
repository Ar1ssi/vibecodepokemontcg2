import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  indexDataset,
  loadMetaDataset,
  nameKey,
  placementWeight,
  recencyWeight,
  resetMetaDatasetCache,
  validateDataset,
} from '../dataset.mjs';
import { fixtureDataset } from './fixture-dataset.mjs';

test('placementWeight tiers and recencyWeight half-life', () => {
  assert.deepEqual([1, 8, 9, 16, 17, 32, 33, 64, 65, null].map(placementWeight), [
    1, 1, 0.85, 0.85, 0.7, 0.7, 0.55, 0.55, 0.4, 0.4,
  ]);
  assert.equal(recencyWeight('2026-10-10', '2026-10-10'), 1);
  assert.equal(recencyWeight('2026-09-12', '2026-10-10'), 0.5);
  assert.equal(recencyWeight('garbage', '2026-10-10'), 1);
});

test('validateDataset accepts the fixture and names what is wrong otherwise', () => {
  assert.deepEqual(validateDataset(fixtureDataset()), { ok: true });
  assert.match(validateDataset(null).reason, /not a JSON object/);
  assert.match(validateDataset({ ...fixtureDataset(), version: 2 }).reason, /version 2/);
  assert.match(validateDataset({ ...fixtureDataset(), lists: [] }).reason, /no decklists/);
  const badIndex = fixtureDataset();
  badIndex.lists[0].c.push(99, 1);
  assert.match(validateDataset(badIndex).reason, /list 0 has a bad card entry/);
  const oddPairs = fixtureDataset();
  oddPairs.lists[1].c.push(3);
  assert.match(validateDataset(oddPairs).reason, /list 1 is malformed/);
  const badArchetype = fixtureDataset();
  badArchetype.lists[2].a = 7;
  assert.match(validateDataset(badArchetype).reason, /no archetype 7/);
});

test('the committed dataset is valid and covers the current rotation', () => {
  const url = new URL('../../../../../assets/meta/limitless-standard.json', import.meta.url);
  const dataset = JSON.parse(readFileSync(url, 'utf8'));
  assert.deepEqual(validateDataset(dataset), { ok: true });
  assert.equal(dataset.format, 'standard');
  assert.ok(dataset.lists.length > 1000, `${dataset.lists.length} lists`);
  assert.ok(dataset.cards.every((card) => card.tags.every((tag) => typeof tag === 'string')));
});

test('indexDataset: global inclusion and name lookup', () => {
  const index = indexDataset(fixtureDataset());
  // Ultra Ball is in all six lists, Rare Candy in one.
  assert.equal(index.globalInclusion[2], 1);
  assert.equal(index.globalInclusion[10], 1 / 6);
  assert.deepEqual(index.byName.get('darkness energy'), [5]);
  assert.equal(index.keyIndex.get('t:iono'), 3);
});

test('nameKey folds accents, curly quotes and the "Basic … Energy" prefix', () => {
  assert.equal(nameKey('Basic Fire Energy'), 'fire energy');
  assert.equal(nameKey('Boss’s Orders'), "boss's orders");
  assert.equal(nameKey('Poké Pad'), 'poke pad');
  assert.equal(nameKey('Basic Box'), 'basic box');
});

test('loadMetaDataset memoizes success and retries after a failure', async () => {
  resetMetaDatasetCache();
  let calls = 0;
  const failing = async () => {
    calls += 1;
    throw new Error('offline');
  };
  assert.deepEqual(await loadMetaDataset(failing), { ok: false, reason: 'could not load tournament data (offline)' });
  const invalid = await loadMetaDataset(async () => ({ version: 9 }));
  assert.match(invalid.reason, /invalid: dataset version 9/);
  const good = async () => {
    calls += 1;
    return fixtureDataset();
  };
  const first = await loadMetaDataset(good);
  const second = await loadMetaDataset(good);
  assert.ok(first.ok);
  assert.equal(first, second);
  assert.equal(calls, 2);
  resetMetaDatasetCache();
});
