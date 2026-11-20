import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isViewingBoard, viewBoardTapRoute } from '../view-board-toggle.mjs';

// View Board: a click under the see-through menu only inspects.

test('the discard pile opens its viewer; in-play Pokémon their stack view', () => {
  assert.equal(viewBoardTapRoute({ zoneId: 'discard' }), 'pile');
  assert.equal(viewBoardTapRoute({ zoneId: 'active' }), 'stack');
  assert.equal(viewBoardTapRoute({ zoneId: 'bench' }), 'stack');
});

test('Stadium, attached cards and the Lost Zone zoom; hidden or private zones do nothing', () => {
  for (const zoneId of ['stadium', 'attachedCards', 'board', 'lostZone']) {
    assert.equal(viewBoardTapRoute({ zoneId }), 'preview', zoneId);
  }
  for (const zoneId of ['hand', 'deck', 'prizes', 'viewCards', undefined]) {
    assert.equal(viewBoardTapRoute({ zoneId }), 'none', String(zoneId));
  }
  assert.equal(viewBoardTapRoute(), 'none');
});

test('isViewingBoard reads the see-through class', () => {
  assert.equal(isViewingBoard({ querySelector: (s) => (s === '.is-viewing-board' ? {} : null) }), true);
  assert.equal(isViewingBoard({ querySelector: () => null }), false);
  assert.equal(isViewingBoard(null), false);
});
