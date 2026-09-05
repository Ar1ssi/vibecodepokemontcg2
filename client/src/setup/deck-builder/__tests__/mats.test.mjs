import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MATS,
  classifyMatLayoutFromTitle,
  getMatById,
  listMats,
  searchMats,
} from '../core/mats.mjs';

test('mat catalog: every mat has a unique id, title and image', () => {
  assert.ok(MATS.length > 0);

  const ids = new Set();
  const titles = new Set();
  const images = new Set();

  for (const mat of MATS) {
    assert.ok(mat.id, `missing id: ${mat.title}`);
    assert.ok(mat.title, `missing title: ${mat.id}`);
    assert.ok(mat.image, `missing image: ${mat.id}`);
    assert.ok(mat.thumb, `missing thumb: ${mat.id}`);
    assert.ok(
      mat.image.startsWith('src/assets/playmats/'),
      `image is not a client-relative asset path: ${mat.image}`
    );
    assert.ok(
      mat.layout === 'one-player' || mat.layout === 'two-player',
      `unexpected layout: ${mat.layout}`
    );

    assert.ok(!ids.has(mat.id), `duplicate id: ${mat.id}`);
    assert.ok(!titles.has(mat.title), `duplicate title: ${mat.title}`);
    assert.ok(!images.has(mat.image), `duplicate image: ${mat.image}`);
    ids.add(mat.id);
    titles.add(mat.title);
    images.add(mat.image);
  }
});

test('listMats returns clones, not catalog references', () => {
  const mats = listMats();
  assert.equal(mats.length, MATS.length);
  mats[0].title = 'mutated';
  assert.notEqual(MATS[0].title, 'mutated');
});

test('getMatById round-trips and is undefined for unknown ids', () => {
  const first = MATS[0];
  const found = getMatById(first.id);
  assert.equal(found?.title, first.title);
  assert.equal(found?.image, first.image);
  assert.equal(getMatById('no-such-mat'), undefined);
  assert.equal(getMatById(undefined), undefined);
});

test('searchMats is case-insensitive and empty for no match', () => {
  const term = MATS[0].title.slice(0, 6);
  const lower = searchMats(term.toLowerCase());
  const upper = searchMats(term.toUpperCase());

  assert.ok(lower.length > 0);
  assert.deepEqual(
    lower.map((m) => m.id),
    upper.map((m) => m.id)
  );
  assert.ok(
    lower.every((m) => m.title.toLowerCase().includes(term.toLowerCase()))
  );
  assert.deepEqual(searchMats('zzz-not-a-playmat-zzz'), []);
  assert.equal(searchMats('').length, MATS.length);
  assert.equal(searchMats().length, MATS.length);
});

test('layout classification: full-size mats cover both players', () => {
  assert.equal(
    classifyMatLayoutFromTitle('Rubber Playmat Full size Showdown! Mega Rayquaza'),
    'two-player'
  );
  assert.equal(
    classifyMatLayoutFromTitle('Rubber Playmat full-size Pikachu'),
    'two-player'
  );
  assert.equal(
    classifyMatLayoutFromTitle('Official Playmat Charizard'),
    'two-player'
  );
  assert.equal(
    classifyMatLayoutFromTitle('Rubber Playmat Gengar de-Chilling'),
    'one-player'
  );
  assert.equal(classifyMatLayoutFromTitle(''), 'one-player');
});

test('catalog layouts agree with their titles', () => {
  for (const mat of MATS) {
    assert.equal(
      mat.layout,
      classifyMatLayoutFromTitle(mat.title),
      `layout mismatch for ${mat.id}`
    );
  }
});
