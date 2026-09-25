import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOUBLE_CLICK_ZOOM_ZONES,
  isDoubleClickZoomZone,
} from '../double-click-zoom.mjs';

// The reported defect: a card played to the free-play board (#board) double-clicked
// used the legacy #fullImage overlay (top document, no z-index, not wired into
// closePopups) instead of the dismissible preview every other mat zone gets, so it
// covered the board permanently. Board must stay on the zoom path.
test('a #board card double-click opens the zoom path', () => {
  assert.equal(isDoubleClickZoomZone('board'), true);
});

test('every mat zone that can hold a card keeps the zoom path', () => {
  for (const zoneId of ['active', 'bench', 'hand', 'board', 'stadium']) {
    assert.equal(isDoubleClickZoomZone(zoneId), true, zoneId);
  }
});

test('zones with their own double-click host are not on the zoom path', () => {
  // Prizes routes to the carousel viewer before the zoom list is consulted.
  assert.equal(isDoubleClickZoomZone('prizes'), false);
});

test('the zone list is not accidentally re-ordered or emptied', () => {
  assert.deepEqual([...DOUBLE_CLICK_ZOOM_ZONES].sort(), [
    'active',
    'bench',
    'board',
    'hand',
    'stadium',
  ]);
});
