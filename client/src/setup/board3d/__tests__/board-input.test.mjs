import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createBoardInput } from '../board-input.js';

// A page with the canvas, the two mirror roots (a hand card each side, a deck cover) and the
// page-level Stadium. The scene is a stub whose hit test answers from a table of points.
const setup = ({ hits = {} } = {}) => {
  const dom = new JSDOM('<body><div id="stadium"><img id="stadiumImg"></div><canvas></canvas></body>');
  const doc = dom.window.document;
  const roots = {};
  for (const side of ['self', 'opp']) {
    const host = doc.createElement('div');
    doc.body.appendChild(host);
    roots[side] = host.attachShadow({ mode: 'open' });
    roots[side].innerHTML = `<div id="hand"><img data-instance-id="${side === 'self' ? 1 : 2}"></div><div id="deckCover"></div>`;
  }
  const hovered = [];
  const scene = {
    hitTest: (x, y) => hits[`${x},${y}`] ?? null,
    setHover: (id) => hovered.push(id),
  };
  const targets = [];
  const hover = { setTarget: (el, pointer) => targets.push({ el, pointer }) };
  let time = 0;
  const canvas = doc.querySelector('canvas');
  const input = createBoardInput({ canvas, scene, mirror: { roots }, hover, doc, now: () => time });
  const fire = (type, { x = 0, y = 0, button = 0, buttons = 0, pointerType = 'mouse', ctrlKey = false } = {}) => {
    const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button, buttons, ctrlKey });
    Object.defineProperty(event, 'pointerType', { value: pointerType });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    canvas.dispatchEvent(event);
    return event;
  };
  const click = (at, { ms = 50, ...rest } = {}) => {
    fire('pointerdown', { ...at, ...rest });
    time += ms;
    fire('pointerup', { ...at, ...rest });
    fire('click', { ...at, ...rest });
  };
  const advance = (ms) => {
    time += ms;
  };
  const record = (el, types) => {
    const seen = [];
    for (const type of types) el.addEventListener(type, (event) => seen.push({ type, event }));
    return seen;
  };
  return { dom, doc, roots, input, fire, click, advance, record, hovered, targets, canvas };
};

const SELF_HAND = { instanceId: 1, side: 'self', zone: 'hand', index: 0 };
const OPP_HAND = { instanceId: 2, side: 'opp', zone: 'hand', index: 0 };
const hits = {
  '100,100': SELF_HAND,
  '300,100': OPP_HAND,
  '500,500': { zone: 'deck', side: 'self', instanceId: null, pile: true },
  '700,500': { zone: 'stadium', side: null, instanceId: 9 },
};

test('a click on a card dispatches a composed click on its mirror img and swallows the native one', () => {
  const env = setup({ hits });
  const img = env.roots.self.querySelector('img');
  const onImg = env.record(img, ['click']);
  const onPage = env.record(env.doc, ['click']);
  env.click({ x: 100, y: 100 }, { ctrlKey: true });
  assert.equal(onImg.length, 1);
  const { event } = onImg[0];
  assert.equal(event.composed, true);
  assert.equal(event.bubbles, true);
  assert.equal(event.clientX, 100);
  assert.equal(event.ctrlKey, true);
  assert.equal(onPage.length, 1, 'only the synthetic click reaches the page (retargeted to the host)');
  assert.notEqual(onPage[0].event.target, env.canvas);
  assert.equal(env.input.lastHit(), SELF_HAND);
});

test('a click on empty table dispatches nothing on a card and lets the native click reach the page', () => {
  const env = setup({ hits });
  const onPage = env.record(env.doc, ['click']);
  env.click({ x: 1, y: 1 });
  assert.equal(onPage.length, 1);
  assert.equal(onPage[0].event.target, env.canvas);
});

test('a slow or sloppy press dispatches no click, and the native click is still swallowed', () => {
  const env = setup({ hits: { ...hits, '104,105': SELF_HAND } });
  const img = env.roots.self.querySelector('img');
  const onImg = env.record(img, ['click']);
  const onPage = env.record(env.doc, ['click']);
  env.click({ x: 100, y: 100 }, { ms: 500 });
  env.fire('pointerdown', { x: 100, y: 100 });
  env.fire('pointerup', { x: 104, y: 105 });
  env.fire('click', { x: 104, y: 105 });
  assert.equal(onImg.length, 0);
  assert.equal(onPage.length, 0);
});

test('two quick clicks on one card also dispatch a dblclick; the native dblclick is stopped', () => {
  const env = setup({ hits });
  const img = env.roots.self.querySelector('img');
  const onImg = env.record(img, ['click', 'dblclick']);
  const onPage = env.record(env.doc, ['dblclick']);
  env.click({ x: 100, y: 100 });
  env.advance(100);
  env.click({ x: 100, y: 100 });
  env.fire('dblclick', { x: 100, y: 100 });
  assert.deepEqual(onImg.map((entry) => entry.type), ['click', 'click', 'dblclick']);
  assert.equal(onPage.length, 1, 'the synthetic dblclick only');
  assert.notEqual(onPage[0].event.target, env.canvas);
});

test('quick clicks on two different cards are no dblclick', () => {
  const env = setup({ hits });
  const onSelf = env.record(env.roots.self.querySelector('img'), ['dblclick']);
  const onOpp = env.record(env.roots.opp.querySelector('img'), ['dblclick']);
  env.click({ x: 100, y: 100 });
  env.click({ x: 300, y: 100 });
  assert.equal(onSelf.length + onOpp.length, 0);
});

test('the right button dispatches no click; the contextmenu goes to the card, default prevented', () => {
  const env = setup({ hits });
  const img = env.roots.self.querySelector('img');
  const onImg = env.record(img, ['click', 'contextmenu']);
  env.fire('pointerdown', { x: 100, y: 100, button: 2 });
  env.fire('pointerup', { x: 100, y: 100, button: 2 });
  const native = env.fire('contextmenu', { x: 100, y: 100, button: 2 });
  assert.deepEqual(onImg.map((entry) => entry.type), ['contextmenu']);
  assert.equal(onImg[0].event.button, 2);
  assert.equal(native.defaultPrevented, true);
});

test('a contextmenu on empty table is prevented but still reaches the page (closePopups)', () => {
  const env = setup({ hits });
  const onPage = env.record(env.doc, ['contextmenu']);
  const native = env.fire('contextmenu', { x: 1, y: 1, button: 2 });
  assert.equal(native.defaultPrevented, true);
  assert.equal(onPage.length, 1);
});

test('piles address their cover in that root; the Stadium addresses the page img', () => {
  const env = setup({ hits });
  const onCover = env.record(env.roots.self.getElementById('deckCover'), ['click']);
  const onStadium = env.record(env.doc.getElementById('stadiumImg'), ['click']);
  env.click({ x: 500, y: 500 });
  env.click({ x: 700, y: 500 });
  assert.equal(onCover.length, 1);
  assert.equal(onStadium.length, 1);
});

test('mouse hover lifts the card and names its img to the preview; leave clears both', () => {
  const env = setup({ hits });
  const img = env.roots.self.querySelector('img');
  env.fire('pointermove', { x: 100, y: 100 });
  env.fire('pointermove', { x: 100, y: 100 });
  assert.deepEqual(env.hovered, [1, 1]);
  assert.equal(env.targets.length, 1, 'the preview hears changes only');
  assert.equal(env.targets[0].el, img);
  assert.deepEqual(env.targets[0].pointer, { pointerType: 'mouse', buttons: 0 });
  env.fire('pointermove', { x: 500, y: 500 });
  assert.equal(env.hovered.at(-1), null, 'a pile lifts nothing');
  env.fire('pointerleave');
  assert.equal(env.hovered.at(-1), null);
  assert.equal(env.targets.at(-1).el, null);
});

test('touch and pen moves never hover, but their clicks work', () => {
  const env = setup({ hits });
  const onImg = env.record(env.roots.self.querySelector('img'), ['click']);
  env.fire('pointermove', { x: 100, y: 100, pointerType: 'touch' });
  assert.equal(env.targets.length, 0);
  assert.equal(env.hovered.length, 0);
  env.click({ x: 100, y: 100 }, { pointerType: 'pen' });
  assert.equal(onImg.length, 1);
});

test('pointercancel drops the press; dispose removes every listener', () => {
  const env = setup({ hits });
  const onImg = env.record(env.roots.self.querySelector('img'), ['click']);
  env.fire('pointerdown', { x: 100, y: 100 });
  env.fire('pointercancel', { x: 100, y: 100 });
  env.fire('pointerup', { x: 100, y: 100 });
  assert.equal(onImg.length, 0);
  env.fire('pointermove', { x: 100, y: 100 });
  env.input.dispose();
  assert.equal(env.targets.at(-1).el, null, 'dispose clears the preview target');
  env.click({ x: 100, y: 100 });
  assert.equal(onImg.length, 0);
});

test('a throwing hit test counts as no hit', () => {
  const dom = new JSDOM('<body><canvas></canvas></body>');
  const canvas = dom.window.document.querySelector('canvas');
  const scene = {
    hitTest: () => {
      throw new Error('boom');
    },
    setHover: () => {},
  };
  const warn = console.warn;
  console.warn = () => {};
  try {
    const input = createBoardInput({ canvas, scene, mirror: null, doc: dom.window.document, now: () => 0 });
    canvas.dispatchEvent(new dom.window.MouseEvent('pointerdown', { clientX: 1, clientY: 1 }));
    assert.equal(input.lastHit(), null);
  } finally {
    console.warn = warn;
  }
});
