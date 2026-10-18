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

// ── drag (design 074 D5 "Drag") ────────────────────────────────────────────

const STATE = { initiator: 'self', isSpectator: false, rulesEnabled: true, solo: false };

const dragSetup = ({ hits: table = {}, state = STATE, perform = () => true } = {}) => {
  const dom = new JSDOM('<body><canvas></canvas></body>');
  const doc = dom.window.document;
  const roots = {};
  for (const side of ['self', 'opp']) {
    const host = doc.createElement('div');
    doc.body.appendChild(host);
    roots[side] = host.attachShadow({ mode: 'open' });
    roots[side].innerHTML =
      `<div id="hand"><img data-instance-id="${side === 'self' ? 1 : 2}"></div>` +
      `<div id="bench"><img data-instance-id="${side === 'self' ? 5 : 6}"></div><div id="board"></div>`;
  }
  const calls = [];
  const scene = {
    hitTest: (x, y, options) => {
      calls.push(['hitTest', x, y, options?.ignore ?? null]);
      return table[`${x},${y}`] ?? null;
    },
    setHover: () => {},
    liftCard: (id, options) => {
      calls.push(['liftCard', id, options]);
      return true;
    },
    moveLifted: (x, y) => calls.push(['moveLifted', x, y]),
    dropCard: (id, options) => calls.push(['dropCard', id, options]),
    setZoneHighlight: (side, zone, on) => calls.push(['zone', side, zone, on]),
    setCardHighlight: (id) => calls.push(['card', id]),
  };
  const performed = [];
  const dragActions = {
    state: () => state,
    begin: (el) => {
      calls.push(['begin', el]);
      const side = el.getRootNode() === roots.self ? 'self' : 'opp';
      return { instanceId: Number(el.dataset.instanceId), side, zone: el.parentElement.id, index: 0, attached: false };
    },
    targetIndexOf: () => -1,
    perform: (route) => {
      performed.push(route);
      return perform(route);
    },
    end: () => calls.push(['end']),
  };
  const mirror = { roots, zoneElement: (side, zone) => roots[side].getElementById(zone) };
  const canvas = doc.querySelector('canvas');
  const input = createBoardInput({ canvas, scene, mirror, dragActions, doc, now: () => 0 });
  const fire = (type, { x = 0, y = 0, button = 0, buttons = 0, pointerType = 'mouse' } = {}) => {
    const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button, buttons });
    Object.defineProperty(event, 'pointerType', { value: pointerType });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    canvas.dispatchEvent(event);
    return event;
  };
  const press = (x, y) => fire('pointerdown', { x, y, buttons: 1 });
  const move = (x, y, buttons = 1) => fire('pointermove', { x, y, buttons });
  const release = (x, y, button = 0) => fire('pointerup', { x, y, button });
  const of = (name) => calls.filter((call) => call[0] === name);
  return { dom, doc, roots, input, fire, press, move, release, of, calls, performed, canvas };
};

const OWN_HAND = { instanceId: 1, side: 'self', zone: 'hand', index: 0 };
const FAR_HAND = { instanceId: 2, side: 'opp', zone: 'hand', index: 0 };
const OWN_ACTIVE_PLANE = { zone: 'active', side: 'self', instanceId: null, plane: true };
const dragHits = {
  '100,100': OWN_HAND,
  '300,100': FAR_HAND,
  '100,300': OWN_ACTIVE_PLANE,
  '120,300': { instanceId: 5, side: 'self', zone: 'bench', index: 0 },
  '400,300': { zone: 'active', side: 'opp', instanceId: null, plane: true },
};

test('drag: a press that moves 6 px picks the card up and a release on a zone routes the move', () => {
  const env = dragSetup({ hits: dragHits });
  const onImg = [];
  env.roots.self.querySelector('img').addEventListener('click', () => onImg.push('click'));
  const onPage = [];
  env.doc.addEventListener('click', () => onPage.push('click'));
  env.press(100, 100);
  env.move(103, 102);
  assert.equal(env.of('begin').length, 0, 'under the slop it is still a press');
  env.move(106, 100);
  assert.equal(env.input.activeDrag(), 1);
  assert.deepEqual(env.of('liftCard')[0].slice(1), [1, { z: 24, clientX: 106, clientY: 100 }]);
  env.move(100, 300);
  assert.deepEqual(env.of('moveLifted').at(-1), ['moveLifted', 100, 300]);
  assert.equal(env.of('hitTest').at(-1)[3], 1, 'the held card is ignored by the hit test');
  assert.deepEqual(env.of('zone').at(-1), ['zone', 'self', 'active', true]);
  env.release(100, 300);
  env.fire('click', { x: 100, y: 300 });
  assert.equal(env.performed.length, 1);
  assert.deepEqual(env.performed[0].args.slice(0, 4), ['self', 'self', 'hand', 'active']);
  assert.deepEqual(env.of('dropCard').at(-1), ['dropCard', 1, { holdMs: 800 }]);
  assert.deepEqual(env.of('zone').at(-1), ['zone', 'self', 'active', false]);
  assert.equal(env.of('end').length, 1);
  assert.equal(env.input.activeDrag(), null);
  assert.deepEqual(onImg, [], 'a drag is never a click');
  assert.deepEqual(onPage, [], 'the native click after a drag is swallowed');
});

test('drag: a card target is ringed, and active → bench card retreats onto its mirror img', () => {
  const hits = { ...dragHits, '100,100': { instanceId: 1, side: 'self', zone: 'active', index: 0 } };
  const env = dragSetup({ hits });
  const active = env.doc.createElement('div');
  active.id = 'active';
  active.appendChild(env.roots.self.querySelector('img[data-instance-id="1"]'));
  env.roots.self.appendChild(active);
  env.press(100, 100);
  env.move(110, 100);
  env.move(120, 300);
  assert.deepEqual(env.of('card').at(-1), ['card', 5]);
  env.release(120, 300);
  const [route] = env.performed;
  assert.equal(route.kind, 'retreat');
  assert.equal(route.args[2], env.roots.self.querySelector('img[data-instance-id="5"]'));
  assert.deepEqual(env.of('card').at(-1), ['card', null]);
});

test('drag: released over nothing, a refused call, Escape, pointercancel and a right button all fly back', () => {
  const cases = {
    nothing: (env) => env.release(700, 700),
    refused: (env) => env.release(100, 300),
    escape: (env) => env.doc.dispatchEvent(new env.dom.window.KeyboardEvent('keydown', { key: 'Escape' })),
    cancel: (env) => env.fire('pointercancel', { x: 100, y: 300 }),
    secondButton: (env) => env.move(100, 300, 3),
    contextmenu: (env) => env.fire('contextmenu', { x: 100, y: 300, button: 2 }),
  };
  for (const [name, end] of Object.entries(cases)) {
    const env = dragSetup({ hits: dragHits, perform: () => false });
    env.press(100, 100);
    env.move(110, 100);
    env.move(100, 300);
    end(env);
    assert.deepEqual(env.of('dropCard').at(-1), ['dropCard', 1, {}], name);
    assert.equal(env.input.activeDrag(), null, name);
    assert.equal(env.performed.length, name === 'refused' ? 1 : 0, name);
  }
});

test('drag: a spectator, or the far seat outside solo, never picks a card up; solo may', () => {
  const watcher = dragSetup({ hits: dragHits, state: { ...STATE, isSpectator: true } });
  watcher.press(100, 100);
  watcher.move(120, 100);
  assert.equal(watcher.of('begin').length + watcher.of('liftCard').length, 0);

  const duo = dragSetup({ hits: dragHits });
  duo.press(300, 100);
  duo.move(320, 100);
  assert.equal(duo.of('liftCard').length, 0);

  const solo = dragSetup({ hits: dragHits, state: { ...STATE, solo: true } });
  solo.press(300, 100);
  solo.move(320, 100);
  solo.move(400, 300);
  solo.release(400, 300);
  assert.deepEqual(solo.performed[0].args.slice(0, 4), ['opp', 'self', 'hand', 'active']);
});

test('drag: the opponent\'s zone is no target outside solo', () => {
  const env = dragSetup({ hits: dragHits });
  env.press(100, 100);
  env.move(110, 100);
  env.move(400, 300);
  env.release(400, 300);
  assert.equal(env.performed.length, 0);
  assert.deepEqual(env.of('dropCard').at(-1), ['dropCard', 1, {}]);
});

test('drag: the Lost Zone rail over the canvas is found by elementFromPoint and lit', () => {
  const env = dragSetup({ hits: dragHits });
  const rail = env.doc.createElement('div');
  rail.dataset.dropZone = 'lostZone';
  rail.dataset.dropUser = 'self';
  const label = env.doc.createElement('span');
  rail.appendChild(label);
  env.doc.body.appendChild(rail);
  env.doc.elementFromPoint = (x) => (x === 900 ? label : env.canvas);
  env.press(100, 100);
  env.move(110, 100);
  env.move(900, 50);
  assert.equal(rail.classList.contains('lost-zone-rail-drop'), true);
  env.release(900, 50);
  assert.deepEqual(env.performed[0].args.slice(2, 4), ['hand', 'lostZone']);
  assert.equal(rail.classList.contains('lost-zone-rail-drop'), false);
});

test('drag: an Item lights its Trainer board for the whole drag (board-drop-ready)', () => {
  const env = dragSetup({ hits: dragHits });
  env.roots.self.getElementById('board').classList.add('board-drop-ready');
  env.press(100, 100);
  env.move(110, 100);
  assert.deepEqual(env.of('zone')[0], ['zone', 'self', 'board', true]);
  env.move(100, 300);
  env.move(700, 700);
  assert.equal(env.of('zone').some((call) => call[2] === 'board' && call[3] === false), false);
  env.release(700, 700);
  assert.deepEqual(env.of('zone').at(-1), ['zone', 'self', 'board', false]);
});

test('drag: dispose mid-drag drops the card back', () => {
  const env = dragSetup({ hits: dragHits });
  env.press(100, 100);
  env.move(110, 100);
  env.input.dispose();
  assert.deepEqual(env.of('dropCard').at(-1), ['dropCard', 1, {}]);
});

test('drag: the release after an Escape is neither a click nor a drop', () => {
  const env = dragSetup({ hits: dragHits });
  const clicks = [];
  env.roots.self.querySelector('img').addEventListener('click', () => clicks.push('click'));
  env.press(100, 100);
  env.move(110, 100);
  env.doc.dispatchEvent(new env.dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
  env.move(100, 100);
  env.release(100, 100);
  env.fire('click', { x: 100, y: 100 });
  assert.deepEqual(clicks, []);
  assert.equal(env.performed.length, 0);
  assert.equal(env.of('dropCard').length, 1);
});
