import test from 'node:test';
import assert from 'node:assert/strict';

import { indexDataset, loadMetaDataset, resetMetaDatasetCache, validateDataset } from '../dataset.mjs';
import { describeList } from '../suggest.mjs';
import { fixtureDataset } from './fixture-dataset.mjs';

test('validateDataset refuses an event that is null, unnamed or has no usable date', () => {
  for (const event of [null, { date: '2026-10-10' }, { name: 'X' }, { name: 'X', date: 'soon' }]) {
    const dataset = fixtureDataset();
    dataset.events[0] = event;
    assert.match(validateDataset(dataset).reason, /event 0 is malformed/);
  }
});

test('loadMetaDataset returns a failure, not a throw, for a dataset the indexer cannot read, and retries', async () => {
  resetMetaDatasetCache();
  const broken = fixtureDataset();
  broken.events.push(null);
  const result = await loadMetaDataset(async () => broken);
  assert.equal(result.ok, false);
  const retried = await loadMetaDataset(async () => fixtureDataset());
  assert.equal(retried.ok, true);
  resetMetaDatasetCache();
});

test('loadMetaDataset keeps one memoized load per url', async () => {
  resetMetaDatasetCache();
  const seen = [];
  const fetchJson = async (url) => {
    seen.push(url);
    return fixtureDataset();
  };
  const a = await loadMetaDataset(fetchJson, '/a.json');
  const b = await loadMetaDataset(fetchJson, '/b.json');
  assert.deepEqual(seen, ['/a.json', '/b.json']);
  assert.notEqual(a.index, b.index);
  assert.equal(await loadMetaDataset(fetchJson, '/a.json'), a);
  resetMetaDatasetCache();
});

test('describeList names only the event for a list without a placing', () => {
  const dataset = fixtureDataset();
  delete dataset.lists[0].p;
  const index = indexDataset(dataset);
  assert.equal(describeList(index, 0), 'Regional Louisville, KY · 2026-10-10');
});
