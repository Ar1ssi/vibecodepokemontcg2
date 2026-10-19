import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zonePopupDisplay } from '../zone-popup-display.mjs';

test('a pile viewer with rendered cards but an empty legacy array stays open on its own click', () => {
  // Server authority: the Lost Zone renders its cards, the legacy array stays empty (I24).
  assert.equal(zonePopupDisplay({ zoneId: 'lostZone', arrayCount: 0, renderedCount: 2, outsideClick: false }), null);
});

test('a pile viewer closes on an outside click or when it holds nothing', () => {
  assert.equal(zonePopupDisplay({ zoneId: 'discard', arrayCount: 0, renderedCount: 3, outsideClick: true }), 'none');
  assert.equal(zonePopupDisplay({ zoneId: 'deck', arrayCount: 0, renderedCount: 0, outsideClick: false }), 'none');
  assert.equal(zonePopupDisplay({ zoneId: 'deck', arrayCount: 5, renderedCount: 5, outsideClick: false }), null);
});

test('the look and move panels follow their legacy array only', () => {
  assert.equal(zonePopupDisplay({ zoneId: 'viewCards', arrayCount: 2, renderedCount: 2, outsideClick: true }), 'block');
  assert.equal(zonePopupDisplay({ zoneId: 'attachedCards', arrayCount: 0, renderedCount: 1, outsideClick: false }), 'none');
});
