import test from 'node:test';
import assert from 'node:assert/strict';

import { trackPress } from '../native-deck-builder-press-gesture.js';

const pointer = (type, { id = 1, x = 0, y = 0, button = 0 } = {}) =>
  Object.assign(new Event(type), { pointerId: id, clientX: x, clientY: y, button });

function mount(overrides = {}) {
  const node = new EventTarget();
  const captured = [];
  node.setPointerCapture = (id) => captured.push(id);
  const log = [];
  trackPress(node, {
    onPress: () => true,
    onMove: ({ dx, moved }) => log.push(['move', dx, Math.round(moved)]),
    onRelease: ({ dx, moved }, cancelled) => log.push(['release', dx, Math.round(moved), cancelled]),
    onKeyboard: () => log.push(['keyboard']),
    ...overrides,
  });
  return { node, log, captured };
}

test('a drag reports the signed travel and the furthest distance, then releases', () => {
  const { node, log, captured } = mount();
  node.dispatchEvent(pointer('pointerdown', { x: 100, y: 50 }));
  node.dispatchEvent(pointer('pointermove', { x: 60, y: 50 }));
  node.dispatchEvent(pointer('pointermove', { x: 90, y: 50 }));
  node.dispatchEvent(pointer('pointerup', { x: 90, y: 50 }));
  assert.deepEqual(captured, [1]);
  assert.deepEqual(log, [
    ['move', -40, 40],
    ['move', -10, 40],
    ['release', -10, 40, false],
  ]);
});

test('a pointercancel releases as cancelled, and a finished press ignores later moves', () => {
  const { node, log } = mount();
  node.dispatchEvent(pointer('pointerdown'));
  node.dispatchEvent(pointer('pointercancel'));
  node.dispatchEvent(pointer('pointermove', { x: 30 }));
  node.dispatchEvent(pointer('pointerup'));
  assert.deepEqual(log, [['release', 0, 0, true]]);
});

test('only the primary button of the first pointer starts and ends a press', () => {
  const { node, log } = mount();
  node.dispatchEvent(pointer('pointerdown', { button: 2 }));
  node.dispatchEvent(pointer('pointerup', { button: 2 }));
  assert.deepEqual(log, []);
  node.dispatchEvent(pointer('pointerdown', { id: 7 }));
  node.dispatchEvent(pointer('pointermove', { id: 8, x: 50 }));
  node.dispatchEvent(pointer('pointerup', { id: 8 }));
  assert.deepEqual(log, []);
  node.dispatchEvent(pointer('pointerup', { id: 7 }));
  assert.deepEqual(log, [['release', 0, 0, false]]);
});

test('onPress returning false refuses the press: nothing is captured or reported', () => {
  const { node, log, captured } = mount({ onPress: () => false });
  node.dispatchEvent(pointer('pointerdown'));
  node.dispatchEvent(pointer('pointermove', { x: 20 }));
  node.dispatchEvent(pointer('pointerup'));
  assert.deepEqual(captured, []);
  assert.deepEqual(log, []);
});

test('a click with detail 0 is the keyboard path; a pointer click is not', () => {
  const { node, log } = mount();
  node.dispatchEvent(Object.assign(new Event('click'), { detail: 1 }));
  node.dispatchEvent(Object.assign(new Event('click'), { detail: 0 }));
  assert.deepEqual(log, [['keyboard']]);
});
