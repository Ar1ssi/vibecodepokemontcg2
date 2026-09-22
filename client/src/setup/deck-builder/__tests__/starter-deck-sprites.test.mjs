import test from 'node:test';
import assert from 'node:assert/strict';

import { STARTER_DECK_CATALOG } from '../core/set-browser.mjs';
import { normalizeDeckSprites } from '../core/deck-sprites.mjs';

test('every starter deck pins two known default sprites', () => {
  for (const entry of STARTER_DECK_CATALOG) {
    const sprites = normalizeDeckSprites(entry.sprites);
    assert.deepEqual(sprites.map((sprite) => sprite.slug), entry.sprites, entry.key);
    assert.equal(sprites.length, 2, entry.key);
  }
});

test('the Mega starters show their requested Mega partners', () => {
  const byKey = Object.fromEntries(STARTER_DECK_CATALOG.map((e) => [e.key, e.sprites]));
  assert.deepEqual(byKey.greninja, ['greninja-mega', 'starmie-mega']);
  assert.deepEqual(byKey.dragonite, ['dragonite-mega', 'eelektross-mega']);
  assert.deepEqual(byKey.darkrai, ['darkrai-mega', 'gengar-mega']);
});

test('starter deck mats exist in the mat catalog', async () => {
  const { MATS_CATALOG } = await import('../core/mats-catalog.mjs');
  const ids = new Set(MATS_CATALOG.map((mat) => mat.id));
  const withMats = STARTER_DECK_CATALOG.filter((entry) => entry.matId);
  assert.equal(withMats.length, 5);
  for (const entry of withMats) assert.ok(ids.has(entry.matId), entry.key);
});
