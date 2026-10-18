import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClickTracker, mirrorSelectorFor } from '../input-gestures.mjs';

const tap = (tracker, id, { x = 100, y = 100, t = 0, dx = 0, dy = 0, ms = 50, button = 0, upButton = button, upId = id } = {}) => {
  tracker.down(id, x, y, t, button);
  return tracker.up(upId, x + dx, y + dy, t + ms, upButton);
};

test('a quick press and release in place is a click', () => {
  assert.deepEqual(tap(createClickTracker(), 7), { click: true, dblclick: false });
});

test('movement past the slop is not a click; within it is', () => {
  assert.equal(tap(createClickTracker(), 7, { dx: 5, dy: 4 }).click, false);
  assert.equal(tap(createClickTracker(), 7, { dx: 4, dy: 4 }).click, true);
  assert.equal(tap(createClickTracker({ slopPx: 10 }), 7, { dx: 8 }).click, true);
});

test('a press held longer than clickMs is not a click', () => {
  assert.equal(tap(createClickTracker(), 7, { ms: 401 }).click, false);
  assert.equal(tap(createClickTracker(), 7, { ms: 400 }).click, true);
});

test('two quick clicks on one element are a double-click; a third starts over', () => {
  const tracker = createClickTracker();
  assert.deepEqual(tap(tracker, 7, { t: 0 }), { click: true, dblclick: false });
  assert.deepEqual(tap(tracker, 7, { t: 200 }), { click: true, dblclick: true });
  assert.deepEqual(tap(tracker, 7, { t: 400 }), { click: true, dblclick: false });
});

test('clicks too far apart are not a double-click', () => {
  const tracker = createClickTracker();
  tap(tracker, 7, { t: 0 });
  assert.deepEqual(tap(tracker, 7, { t: 351 }), { click: true, dblclick: false });
});

test('a second click on a different element is not a double-click', () => {
  const tracker = createClickTracker();
  tap(tracker, 7, { t: 0 });
  assert.deepEqual(tap(tracker, 8, { t: 150 }), { click: true, dblclick: false });
});

test('release over another element, or nothing, is not a click', () => {
  assert.equal(tap(createClickTracker(), 7, { upId: 8 }).click, false);
  assert.equal(tap(createClickTracker(), null).click, false);
});

test('a button mismatch between press and release is not a click', () => {
  assert.equal(tap(createClickTracker(), 7, { button: 0, upButton: 2 }).click, false);
  const tracker = createClickTracker();
  tap(tracker, 7, { t: 0, button: 2 });
  assert.deepEqual(tap(tracker, 7, { t: 100, button: 0 }), { click: true, dblclick: false });
});

test('a release with no press, and reset, give nothing', () => {
  const tracker = createClickTracker();
  assert.equal(tracker.up(7, 0, 0, 10, 0).click, false);
  tap(tracker, 7, { t: 0 });
  tracker.reset();
  assert.deepEqual(tap(tracker, 7, { t: 100 }), { click: true, dblclick: false });
});

test('mirrorSelectorFor: a card hit addresses its img in that side\'s root', () => {
  assert.deepEqual(mirrorSelectorFor({ instanceId: 42, side: 'opp', zone: 'bench', index: 1 }), {
    side: 'opp',
    selector: 'img[data-instance-id="42"]',
  });
});

test('mirrorSelectorFor: pile hits address that side\'s cover', () => {
  assert.deepEqual(mirrorSelectorFor({ zone: 'deck', side: 'self', instanceId: null, pile: true }), {
    side: 'self',
    selector: '#deckCover',
  });
  assert.equal(mirrorSelectorFor({ zone: 'discard', side: 'opp', pile: true }).selector, '#discardCover');
  assert.equal(mirrorSelectorFor({ zone: 'lostZone', side: 'self', pile: true }).selector, '#lostZoneCover');
  assert.equal(mirrorSelectorFor({ zone: 'hand', side: 'self', pile: true }), null);
});

test('mirrorSelectorFor: the Stadium is the page\'s #stadium img', () => {
  assert.deepEqual(mirrorSelectorFor({ zone: 'stadium', side: null, instanceId: 3 }), {
    side: null,
    selector: '#stadium img',
  });
});

test('mirrorSelectorFor: no hit, an unknown side, or no id gives null', () => {
  assert.equal(mirrorSelectorFor(null), null);
  assert.equal(mirrorSelectorFor({ instanceId: 1, side: 'north', zone: 'hand' }), null);
  assert.equal(mirrorSelectorFor({ instanceId: null, side: 'self', zone: 'hand' }), null);
});
