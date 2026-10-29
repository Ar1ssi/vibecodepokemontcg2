import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CUSTOM_SETS_INDEX_FORMAT,
  MAX_PUBLISHED_SETS,
  PUBLISHED_FILE_RE,
  emptyIndex,
  referencedBlobs,
  sameSetEntry,
  validateCustomSetsIndex,
} from '../custom-sets-index.mjs';
import { MAX_SET_JSON_BYTES } from '../custom-set-schema.mjs';

const sha = (char) => char.repeat(64);

function sampleIndex() {
  return {
    format: CUSTOM_SETS_INDEX_FORMAT,
    version: 1,
    updatedAt: '2026-10-25T12:00:00.000Z',
    sets: {
      customhbw: {
        publishedAt: '2026-10-25T12:00:00.000Z',
        files: {
          'set.json': { sha256: sha('a'), size: 2000 },
          '001/high.webp': { sha256: sha('b'), size: 140000 },
          '001/low.webp': { sha256: sha('c'), size: 20000 },
        },
      },
    },
  };
}

test('a well-formed index is valid and comes back normalised', () => {
  const json = sampleIndex();
  json.extra = 'ignored';
  json.sets.customhbw.files['001/high.webp'].note = 'ignored';
  const result = validateCustomSetsIndex(json);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.equal(result.index.extra, undefined);
  assert.deepEqual(Object.keys(result.index.sets.customhbw.files), ['001/high.webp', '001/low.webp', 'set.json']);
  assert.deepEqual(result.index.sets.customhbw.files['001/high.webp'], { sha256: sha('b'), size: 140000 });
});

test('the empty index is valid', () => {
  assert.equal(validateCustomSetsIndex(emptyIndex()).ok, true);
});

test('wrong format, version or shape is refused', () => {
  assert.equal(validateCustomSetsIndex(null).ok, false);
  assert.equal(validateCustomSetsIndex([]).ok, false);
  assert.deepEqual(validateCustomSetsIndex({ ...sampleIndex(), format: 'other' }).errors, [
    `format: expected "${CUSTOM_SETS_INDEX_FORMAT}"`,
  ]);
  assert.deepEqual(validateCustomSetsIndex({ ...sampleIndex(), version: 2 }).errors, ['version: expected 1']);
  assert.deepEqual(validateCustomSetsIndex({ ...sampleIndex(), sets: [] }).errors, ['sets: expected an object of sets']);
});

test('a path outside the published layout is refused, naming the path', () => {
  const json = sampleIndex();
  json.sets.customhbw.files['../x'] = { sha256: sha('d'), size: 10 };
  json.sets.customhbw.files['001/high.png'] = { sha256: sha('d'), size: 10 };
  const { ok, errors } = validateCustomSetsIndex(json);
  assert.equal(ok, false);
  assert.deepEqual(errors, [
    'sets.customhbw.files["../x"]: not a publishable file',
    'sets.customhbw.files["001/high.png"]: not a publishable file',
  ]);
});

test('set ids, hashes and sizes are checked', () => {
  const json = sampleIndex();
  json.sets['sv03.5'] = json.sets.customhbw;
  json.sets.customhbw.files['001/low.webp'] = { sha256: 'ABC', size: 0 };
  json.sets.customhbw.files['set.json'] = { sha256: sha('a'), size: MAX_SET_JSON_BYTES + 1 };
  const { errors } = validateCustomSetsIndex(json);
  assert.deepEqual(errors, [
    'sets.customhbw.files["001/low.webp"].sha256: 64 lowercase hex digits',
    'sets.customhbw.files["001/low.webp"].size: a whole number of bytes from 1 to 16777216',
    `sets.customhbw.files["set.json"].size: a whole number of bytes from 1 to ${MAX_SET_JSON_BYTES}`,
    'sets["sv03.5"]: not a custom set id',
  ]);
});

test('a set without set.json, or with no files, is refused', () => {
  const json = sampleIndex();
  delete json.sets.customhbw.files['set.json'];
  assert.deepEqual(validateCustomSetsIndex(json).errors, ['sets.customhbw.files: set.json is missing']);
  json.sets.customhbw.files = {};
  assert.deepEqual(validateCustomSetsIndex(json).errors, ['sets.customhbw.files: 1 to 4000 files']);
});

test('more than the published-set cap is refused', () => {
  const json = sampleIndex();
  for (let i = 0; i < MAX_PUBLISHED_SETS; i += 1) json.sets[`customs${String(i).padStart(2, '0')}`] = json.sets.customhbw;
  assert.deepEqual(validateCustomSetsIndex(json).errors, [`sets: at most ${MAX_PUBLISHED_SETS}`]);
});

test('a set over the total size cap is refused', () => {
  const json = sampleIndex();
  for (let i = 1; i <= 40; i += 1) {
    json.sets.customhbw.files[`${String(i).padStart(3, '0')}/high.webp`] = { sha256: sha('e'), size: 16 << 20 };
  }
  const { errors } = validateCustomSetsIndex(json);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^sets\.customhbw\.files: \d+ bytes in all, over 536870912$/);
});

test('the publishable file pattern', () => {
  for (const rel of ['set.json', 'foil.json', 'CHANGELOG.md', '001/high.webp', '299/low.webp', 'foil/001-front.webp', 'foil/012-etch.webp']) {
    assert.equal(PUBLISHED_FILE_RE.test(rel), true, rel);
  }
  for (const rel of ['ENGINE-CHECK.md', '1/high.webp', '001/mid.webp', 'foil/001-x.webp', 'foil/../set.json', 'a/set.json']) {
    assert.equal(PUBLISHED_FILE_RE.test(rel), false, rel);
  }
});

test('sameSetEntry compares paths and hashes, not the publish time', () => {
  const a = sampleIndex().sets.customhbw;
  const b = structuredClone(a);
  b.publishedAt = '2027-01-01T00:00:00.000Z';
  assert.equal(sameSetEntry(a, b), true);
  b.files['001/low.webp'] = { sha256: sha('f'), size: 20000 };
  assert.equal(sameSetEntry(a, b), false);
  const c = structuredClone(a);
  delete c.files['001/low.webp'];
  assert.equal(sameSetEntry(a, c), false);
  assert.equal(sameSetEntry(a, undefined), false);
});

test('referencedBlobs is the union over indexes, null ones included', () => {
  const next = sampleIndex();
  next.sets.customhbw.files['001/low.webp'] = { sha256: sha('9'), size: 1 };
  assert.deepEqual([...referencedBlobs(sampleIndex(), next, null)].sort(), [sha('9'), sha('a'), sha('b'), sha('c')]);
});
