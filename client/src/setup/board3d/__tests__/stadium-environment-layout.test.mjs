import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import {
  ENVIRONMENT_OVERRIDE_KEY,
  environmentFootprints,
  environmentKeyFor,
  environmentOverride,
} from '../stadium-environment-layout.mjs';

// The board width board3d.js lays out beside the sidebox (0.755 of 1920).
const HALF = { w: 1449.6, h: 540 };
const simLayout = (half) => flatLayout(getMatLayout('sim'), half);

// customhb-299 is Scorched Earth in client/src/assets/custom-sets/customhb/set.json.
test('environmentKeyFor maps Scorched Earth by id, or by set and number when the id is missing', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-299' }), 'scorched-earth');
  assert.equal(environmentKeyFor({ set: 'customhb', number: '299' }), 'scorched-earth');
  assert.equal(environmentKeyFor({ id: '', set: 'customhb', number: 299 }), 'scorched-earth');
  assert.equal(environmentKeyFor({ id: 'customhb-209' }), null);
  assert.equal(environmentKeyFor({ set: 'customhb', number: 'abc' }), null);
  assert.equal(environmentKeyFor({ set: 'sv1', number: '299' }), null);
  assert.equal(environmentKeyFor(null), null);
});

test('environmentOverride reads the URL first, then storage, and ignores unknown or unreadable values', () => {
  const storage = (value) => ({ getItem: (key) => (key === ENVIRONMENT_OVERRIDE_KEY ? value : null) });
  assert.equal(environmentOverride(storage('scorched-earth')), 'scorched-earth');
  assert.equal(environmentOverride(storage(null), '?stadiumEnv=scorched-earth'), 'scorched-earth');
  assert.equal(environmentOverride(storage('beach')), null);
  assert.equal(environmentOverride(null), null);
  assert.equal(environmentOverride({ getItem: () => { throw new Error('blocked'); } }), null);
});

test('environmentFootprints puts a slab under every place the board draws a card', () => {
  const layout = simLayout(HALF);
  const { slabs, flats } = environmentFootprints(layout);
  // Per side: Active, 5 Bench, Prize block, deck, discard, Lost Zone; plus the Stadium.
  assert.equal(slabs.length, 21);
  assert.equal(flats.length, 2);
  const active = layout.self.active;
  const box = layout.self.cardBox.active;
  assert.deepEqual(slabs[0], { x: active.x + (active.w - box.w) / 2, y: active.y + (active.h - box.h) / 2, w: box.w, h: box.h });
  assert.deepEqual(slabs.at(-1), layout.stadium);
  assert.deepEqual(flats, [layout.self.board, layout.opp.board]);
});

test('environmentFootprints of a missing layout is empty', () => {
  assert.deepEqual(environmentFootprints(null), { slabs: [], flats: [] });
});
