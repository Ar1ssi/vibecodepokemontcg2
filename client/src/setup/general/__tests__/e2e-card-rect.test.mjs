import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardRectOf, usableRect } from '../e2e-card-rect.mjs';

const rect = { left: 10, top: 20, width: 70, height: 100 };

test('usableRect copies the four box fields and drops the rest', () => {
  assert.deepEqual(usableRect({ ...rect, right: 80, x: 10, toJSON() {} }), rect);
});

test('usableRect refuses missing, empty and non-finite rects', () => {
  assert.equal(usableRect(null), null);
  assert.equal(usableRect(undefined), null);
  assert.equal(usableRect({ ...rect, width: 0 }), null);
  assert.equal(usableRect({ ...rect, height: -1 }), null);
  assert.equal(usableRect({ ...rect, left: NaN }), null);
  assert.equal(usableRect({ left: 1, top: 2, width: 3 }), null);
});

test('on the 3D board the scene rect answers and the element is never measured', () => {
  const elementRect = () => assert.fail('the <img> must not be measured on the 3D board');
  assert.deepEqual(cardRectOf({ mode: '3d', sceneRect: rect, elementRect }), rect);
});

test('on the 3D board a card the scene does not hold is null, whatever the <img> says', () => {
  assert.equal(cardRectOf({ mode: '3d', sceneRect: undefined, elementRect: () => rect }), null);
});

test('on the iframe board the mapped element rect answers', () => {
  assert.deepEqual(cardRectOf({ mode: 'iframe', sceneRect: { ...rect, left: 0 }, elementRect: () => rect }), rect);
});

test('on the iframe board a card with no element or a collapsed box is null', () => {
  assert.equal(cardRectOf({ mode: 'iframe', elementRect: undefined }), null);
  assert.equal(cardRectOf({ mode: 'iframe', elementRect: () => ({ ...rect, width: 0, height: 0 }) }), null);
});
