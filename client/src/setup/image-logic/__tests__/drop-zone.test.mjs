import test from 'node:test';
import assert from 'node:assert/strict';

import { DROP_ZONE_SELECTOR, zoneOf } from '../drop-zone.mjs';

// Minimal element stand-in: `closest` walks up the parent chain and matches
// the comma-separated `#id` list the real selector is built from.
const element = (id, parent = null) => ({
  id,
  parentElement: parent,
  closest(selector) {
    const ids = selector.split(',').map((part) => part.trim());
    for (let node = this; node; node = node.parentElement) {
      if (node.id && ids.includes(`#${node.id}`)) return node;
    }
    return null;
  },
});

test('a card already on the trainer board resolves to the board zone', () => {
  const board = element('board');
  const card = element('', board);
  assert.equal(zoneOf(card), board);
});

test('a holo-wrapped card on the board resolves to the board zone', () => {
  const board = element('board');
  const holoWrapper = element('', board);
  const card = element('', holoWrapper);
  assert.equal(zoneOf(card), board);
});

test('the empty board zone resolves to itself', () => {
  const board = element('board');
  assert.equal(zoneOf(board), board);
});

test('cards in the stadium and on the pile covers resolve to their zone', () => {
  for (const id of ['stadium', 'deckCover', 'discardCover', 'lostZoneCover']) {
    const zone = element(id);
    assert.equal(zoneOf(element('', zone)), zone, `${id} card lost its zone`);
  }
});

test('a benched card inside its play container resolves to the bench', () => {
  const bench = element('bench');
  const playContainer = element('', bench);
  assert.equal(zoneOf(element('', playContainer)), bench);
});

test('targets outside every zone, and missing targets, resolve to null', () => {
  assert.equal(zoneOf(element('', element('playfield'))), null);
  assert.equal(zoneOf(null), null);
  assert.equal(zoneOf(undefined), null);
});

test('the selector lists every card-holding zone', () => {
  for (const id of ['board', 'stadium', 'active', 'bench', 'hand', 'deckCover']) {
    assert.ok(DROP_ZONE_SELECTOR.includes(`#${id}`), `missing #${id}`);
  }
});
