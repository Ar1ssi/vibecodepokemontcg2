import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createCustomSetStore,
  customSetsManifestHandler,
  loadCustomSets,
  matchesTcgdexQuery,
  MAX_SET_JSON_BYTES,
  withCustomSets,
} from '../custom-sets.mjs';
import { createTcgdexProxy } from '../tcgdex-proxy.mjs';
import { sampleSet } from '../../shared/custom-sets/__tests__/fixtures.mjs';

function writeSet(root, dirName, set) {
  const dir = path.join(root, dirName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'set.json'), typeof set === 'string' ? set : JSON.stringify(set));
}

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'custom-sets-'));
}

function fakeUpstream(responses) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const next = typeof responses === 'function' ? responses(url) : responses;
    if (next instanceof Error) throw next;
    return { status: next.status, text: async () => next.body ?? '' };
  };
  return { impl, calls };
}

test('a missing root is an empty store and the proxy is passed through untouched', async () => {
  const store = loadCustomSets(path.join(tempRoot(), 'nope'));
  assert.equal(store.size(), 0);
  assert.deepEqual(store.manifest(), { sets: [] });
  const proxy = { get: async () => 'inner', size: () => 1 };
  assert.equal(withCustomSets(proxy, store), proxy);
});

test('loads valid sets, skips broken ones with one logged line each', () => {
  const root = tempRoot();
  const lines = [];
  writeSet(root, 'customhbw', sampleSet());
  writeSet(root, 'custombad', '{not json');
  writeSet(root, 'customabc', sampleSet()); // id customhbw but folder customabc
  writeSet(root, 'customdup', sampleSet({ id: 'customdup', code: 'DUP', cards: [sampleSet().cards[0], sampleSet().cards[0]] }));
  fs.mkdirSync(path.join(root, 'customempty')); // no set.json: silently ignored
  const store = loadCustomSets(root, { log: (line) => lines.push(line) });
  assert.equal(store.size(), 1);
  assert.deepEqual([...store.sets.keys()], ['customhbw']);
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^custom set customabc skipped: id: customhbw but the folder is customabc/);
  assert.match(lines[1], /^custom set custombad skipped: set.json is not valid JSON/);
  assert.match(lines[2], /^custom set customdup skipped: .*id: expected "customdup-001".*used twice/);
  assert.deepEqual(store.manifest(), {
    sets: [{ id: 'customhbw', code: 'HBW', name: 'Homebrew Wave 1', cardCount: 2, releaseDate: '2026-10-23' }],
  });
});

test('card and set records look like TCGdex records', () => {
  const root = tempRoot();
  writeSet(root, 'customhbw', sampleSet());
  const store = loadCustomSets(root);
  const card = store.card('customhbw-001');
  assert.equal(card.name, 'Tyranitar');
  assert.deepEqual(card.set, {
    id: 'customhbw',
    name: 'Homebrew Wave 1',
    cardCount: { official: 2, total: 2 },
    releaseDate: '2026-10-23',
  });
  assert.equal(card.attacks[0].effect, 'Discard a Stadium in play.');
  const set = store.setRecord('customhbw');
  assert.equal(set.serie.id, 'custom');
  assert.deepEqual(set.abbreviation, { official: 'HBW' });
  assert.deepEqual(set.legal, { standard: false, expanded: false });
  assert.deepEqual(set.cards[1], { id: 'customhbw-002', localId: '002', name: 'Bill', image: '/src/assets/custom-sets/customhbw/002' });
  assert.equal(store.card('customhbw-003'), null);
});

function storeOf(...sets) {
  const root = tempRoot();
  for (const set of sets) writeSet(root, set.id, set);
  return loadCustomSets(root);
}

test('custom ids are answered from the store and never reach TCGdex', async () => {
  const { impl, calls } = fakeUpstream({ status: 200, body: '{"id":"xy7-97"}' });
  const proxy = withCustomSets(createTcgdexProxy({ fetchImpl: impl }), storeOf(sampleSet()));
  const card = await proxy.get('/v2/en/cards/customhbw-001');
  assert.equal(card.status, 200);
  assert.equal(card.cacheControl, 'no-store');
  assert.equal(JSON.parse(card.body).name, 'Tyranitar');
  const missing = await proxy.get('/v2/en/cards/customhbw-999');
  assert.equal(missing.status, 404);
  assert.equal(missing.body, '{"error":"custom_card_not_found"}');
  const set = await proxy.get('/v2/en/sets/customhbw');
  assert.equal(JSON.parse(set.body).cards.length, 2);
  const series = await proxy.get('/v2/en/series/custom');
  assert.deepEqual(JSON.parse(series.body).sets.map((s) => s.id), ['customhbw']);
  assert.equal(calls.length, 0);
  const real = await proxy.get('/v2/en/cards/xy7-97');
  assert.equal(real.body, '{"id":"xy7-97"}');
  assert.equal(calls.length, 1);
});

test('list queries get matching custom cards appended; TCGdex down leaves custom hits alone', async () => {
  const { impl } = fakeUpstream((url) =>
    url.includes('name=') ? { status: 200, body: '[{"id":"swsh3-88","name":"Tyranitar"}]' } : { status: 503 }
  );
  const proxy = withCustomSets(createTcgdexProxy({ fetchImpl: impl, now: () => 0 }), storeOf(sampleSet()));
  const byName = await proxy.get('/v2/en/cards?name=tyran');
  assert.deepEqual(
    JSON.parse(byName.body).map((c) => c.id),
    ['swsh3-88', 'customhbw-001']
  );
  const bill = JSON.parse((await proxy.get('/v2/en/cards?name=eq:bill')).body);
  assert.deepEqual(bill.map((c) => c.id), ['swsh3-88', 'customhbw-002']);
  const down = await proxy.get('/v2/en/cards?category=Trainer');
  assert.equal(down.status, 200);
  assert.deepEqual(JSON.parse(down.body).map((c) => c.id), ['customhbw-002']);
  const downNoMatch = await proxy.get('/v2/en/cards?category=Energy');
  assert.equal(downNoMatch.status, 502);
  const sets = await proxy.get('/v2/en/sets?name=like:wave');
  assert.deepEqual(JSON.parse(sets.body).map((s) => s.id), ['customhbw']);
});

test('matchesTcgdexQuery follows TCGdex operators, dotted keys and lists', () => {
  const card = storeOf(sampleSet()).card('customhbw-001');
  const q = (...pairs) => matchesTcgdexQuery(card, pairs);
  assert.equal(q(['name', 'tyran']), true);
  assert.equal(q(['name', 'like:TYRAN']), true);
  assert.equal(q(['name', 'eq:Tyranitar']), true);
  assert.equal(q(['name', 'eq:Tyran']), false);
  assert.equal(q(['name', 'neq:Tyranitar']), false);
  assert.equal(q(['set.id', 'eq:customhbw']), true);
  assert.equal(q(['set.id', 'eq:sv01']), false);
  assert.equal(q(['types', 'eq:Fighting']), true);
  assert.equal(q(['types', 'eq:Fire']), false);
  assert.equal(q(['hp', 'gte:180']), true);
  assert.equal(q(['hp', 'lt:180']), false);
  assert.equal(q(['category', 'Pokemon'], ['stage', 'eq:Stage2']), true);
  assert.equal(q(['stage', 'eq:Basic']), false);
  assert.equal(q(['trainerType', 'Item']), false, 'a key the card lacks never matches');
  assert.equal(q(['name', 'foo:x']), false, 'unknown operator never matches');
  assert.equal(q(['pagination:page', '2'], ['sort:field', 'name']), true, 'paging keys are ignored');
  assert.equal(q(['dexId', 'null:']), true);
  assert.equal(q(['hp', 'notnull:']), true);
});

test('createCustomSetStore and the manifest handler', () => {
  const store = createCustomSetStore();
  assert.equal(store.size(), 0);
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, json(v) { this.sent = v; } };
  customSetsManifestHandler(storeOf(sampleSet()))({}, res);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.deepEqual(res.sent.sets.map((s) => s.code), ['HBW']);
});

test('query keys never read inherited properties, and oversized set.json files are skipped', () => {
  const card = storeOf(sampleSet()).card('customhbw-001');
  assert.equal(matchesTcgdexQuery(card, [['constructor', 'like:o']]), false);
  assert.equal(matchesTcgdexQuery(card, [['__proto__', 'notnull:']]), false);
  assert.equal(matchesTcgdexQuery(card, [['set.constructor', 'like:o']]), false);
  assert.equal(matchesTcgdexQuery(card, [['attacks.toString', 'notnull:']]), false);
  const root = tempRoot();
  const lines = [];
  writeSet(root, 'custombig', JSON.stringify(sampleSet({ id: 'custombig', code: 'BIG' })) + ' '.repeat(MAX_SET_JSON_BYTES));
  const store = loadCustomSets(root, { log: (line) => lines.push(line) });
  assert.equal(store.size(), 0);
  assert.match(lines[0], /^custom set custombig skipped: set.json is \d+ bytes, over/);
});

test('a merged list keeps a gzip thunk for the handler', async () => {
  const { impl } = fakeUpstream({ status: 200, body: '[]' });
  const proxy = withCustomSets(createTcgdexProxy({ fetchImpl: impl }), storeOf(sampleSet()));
  const merged = await proxy.get('/v2/en/cards?name=bill');
  assert.equal(typeof merged.gzip, 'function');
  assert.ok((await merged.gzip()).length > 0);
});
