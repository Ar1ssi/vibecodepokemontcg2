import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createBoardInput } from '../board-input.js';

// A held card follows the pointer that lifted it; a second touch lifting or moving leaves it be.
const setup = () => {
  const dom = new JSDOM('<body><canvas></canvas></body>');
  const doc = dom.window.document;
  const roots = {};
  for (const side of ['self', 'opp']) {
    const host = doc.createElement('div');
    doc.body.appendChild(host);
    roots[side] = host.attachShadow({ mode: 'open' });
    roots[side].innerHTML = `<div id="hand"><img data-instance-id="${side === 'self' ? 1 : 2}"></div><div id="board"></div>`;
  }
  const hits = {
    '100,100': { instanceId: 1, side: 'self', zone: 'hand', index: 0 },
    '100,300': { zone: 'active', side: 'self', instanceId: null, plane: true },
  };
  const calls = [];
  const scene = {
    hitTest: (x, y) => hits[`${x},${y}`] ?? null,
    setHover: () => {},
    liftCard: () => true,
    moveLifted: (x, y) => calls.push(['moveLifted', x, y]),
    dropCard: (id) => calls.push(['dropCard', id]),
    setZoneHighlight: () => {},
    setCardHighlight: () => {},
  };
  const state = { initiator: 'self', isSpectator: false, rulesEnabled: true, solo: false };
  const performed = [];
  const dragActions = {
    state: () => state,
    begin: (el) => ({ instanceId: Number(el.dataset.instanceId), side: 'self', zone: 'hand', index: 0, attached: false }),
    held: () => null,
    targetIndexOf: () => -1,
    perform: (route) => {
      performed.push(route);
      return true;
    },
    end: () => {},
  };
  const canvas = doc.querySelector('canvas');
  const mirror = { roots, zoneElement: (side, zone) => roots[side].getElementById(zone) };
  const input = createBoardInput({ canvas, scene, mirror, dragActions, doc, now: () => 0 });
  const fire = (type, pointerId, { x = 0, y = 0, buttons = 0 } = {}) => {
    const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, buttons });
    Object.defineProperty(event, 'pointerType', { value: 'touch' });
    Object.defineProperty(event, 'pointerId', { value: pointerId });
    canvas.dispatchEvent(event);
  };
  return { input, fire, calls, performed };
};

const lift = (env) => {
  env.fire('pointerdown', 1, { x: 100, y: 100, buttons: 1 });
  env.fire('pointermove', 1, { x: 110, y: 100, buttons: 1 });
  assert.equal(env.input.activeDrag(), 1);
};

test('a second finger lifting does not drop the held card', () => {
  const env = setup();
  lift(env);
  env.fire('pointerup', 2, { x: 100, y: 300 });
  assert.equal(env.input.activeDrag(), 1, 'still held');
  assert.equal(env.performed.length, 0);
  env.fire('pointerup', 1, { x: 100, y: 300 });
  assert.equal(env.input.activeDrag(), null);
  assert.equal(env.performed.length, 1);
});

test('a second finger moving or cancelling does not move or cancel the held card', () => {
  const env = setup();
  lift(env);
  const before = env.calls.length;
  env.fire('pointermove', 2, { x: 500, y: 500, buttons: 1 });
  assert.equal(env.calls.length, before, 'the card did not follow the second finger');
  env.fire('pointercancel', 2);
  assert.equal(env.input.activeDrag(), 1);
  env.fire('pointercancel', 1);
  assert.equal(env.input.activeDrag(), null);
});
