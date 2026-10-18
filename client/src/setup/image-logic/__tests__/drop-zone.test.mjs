import test from 'node:test';
import assert from 'node:assert/strict';

import { DROP_ZONE_SELECTOR, boardRefuses, playsOntoBoard, zoneOf } from '../drop-zone.mjs';

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

test('playsOntoBoard: Items, Supporters and bare Trainers light the board (design 046)', () => {
  assert.equal(playsOntoBoard({ supertype: 'Trainer', subtypes: ['Item'] }), true);
  assert.equal(playsOntoBoard({ type: 'Supporter' }), true);
  assert.equal(playsOntoBoard({ supertype: 'Trainer', trainerType: 'Supporter' }), true);
  // A legacy card knows only its type.
  assert.equal(playsOntoBoard({ type: 'Trainer' }), true);
});

test('playsOntoBoard: Stadiums and Tools go elsewhere', () => {
  assert.equal(playsOntoBoard({ type: 'Stadium' }), false);
  assert.equal(playsOntoBoard({ supertype: 'Trainer', subtypes: ['Stadium'] }), false);
  assert.equal(playsOntoBoard({ type: 'Pokémon Tool' }), false);
  assert.equal(playsOntoBoard({ supertype: 'Trainer', trainerType: 'Tool' }), false);
});

test('playsOntoBoard: Pokémon, Energy and unknown cards do not', () => {
  assert.equal(playsOntoBoard({ supertype: 'Pokémon', type: 'Pokémon' }), false);
  assert.equal(playsOntoBoard({ type: 'Energy' }), false);
  assert.equal(playsOntoBoard({ instanceId: 7 }), false);
  assert.equal(playsOntoBoard(null), false);
  assert.equal(playsOntoBoard(undefined), false);
});

test('boardRefuses: Pokémon and Energy cards cannot be dropped on the Trainer board', () => {
  assert.equal(boardRefuses({ supertype: 'Pokémon', stage: 'Basic', hp: 70 }), true);
  assert.equal(boardRefuses({ type: 'Pokémon' }), true);
  assert.equal(boardRefuses({ supertype: 'Energy', name: 'Basic Fire Energy' }), true);
  assert.equal(boardRefuses({ type: 'Energy' }), true);
});

test('boardRefuses: every Trainer kind, a Pokémon changed to Trainer, and unknown cards pass', () => {
  assert.equal(boardRefuses({ supertype: 'Trainer', subtypes: ['Item'] }), false);
  assert.equal(boardRefuses({ type: 'Supporter' }), false);
  assert.equal(boardRefuses({ type: 'Stadium' }), false);
  assert.equal(boardRefuses({ supertype: 'Trainer', name: 'Energy Retrieval' }), false);
  // Legacy changeType rewrites `type` and keeps the old one in `type2`.
  assert.equal(boardRefuses({ supertype: 'Pokémon', hp: 60, type: 'Trainer', type2: 'Pokémon' }), false);
  assert.equal(boardRefuses({ instanceId: 7 }), false);
  assert.equal(boardRefuses(null), false);
  assert.equal(boardRefuses(undefined), false);
});
