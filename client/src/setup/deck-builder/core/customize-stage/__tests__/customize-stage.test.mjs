import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

// Design 071: the stage's DOM contract. Node has no WebGL, so this covers what runs without it: the
// toggle, the arrows, and the degrade path (edge rows 4 and 5). Rendering is the user's localhost check.
const dom = new JSDOM('<div id="stage"></div>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;

const read = (path) => fs.readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');
globalThis.fetch = async (url) => {
  const files = {
    '/src/assets/deckbox/scene.json': 'assets/deckbox/scene.json',
    '/src/assets/coins/tcgl/coin-mesh.json': 'assets/coins/tcgl/coin-mesh.json',
  };
  const file = files[String(url)];
  if (!file) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => JSON.parse(read(file)) };
};
const warns = [];
console.warn = (...args) => warns.push(args);

const { initializeCustomizeStage } = await import('../customize-stage.js');

const selection = () => ({
  boxAtlasUrl: null,
  boxName: 'Default',
  sleeveUrl: null,
  sleeveName: 'Classic Pokémon card back',
  coin: null,
  coinName: 'Default',
});

const mount = () => {
  const panelEl = document.getElementById('stage');
  panelEl.innerHTML = '';
  panelEl.className = '';
  return panelEl;
};

test('a missing panel yields no stage', () => {
  assert.equal(initializeCustomizeStage({ panelEl: null, getSelection: selection, onStep: () => {} }), null);
});

test('starts hidden on Preview All', () => {
  const panelEl = mount();
  initializeCustomizeStage({ panelEl, getSelection: selection, onStep: () => {} });
  assert.equal(panelEl.hidden, true);
  assert.equal(panelEl.querySelector('[data-mode="all"]').classList.contains('active'), true);
  assert.equal(panelEl.querySelector('[data-mode="focused"]').classList.contains('active'), false);
});

test('the toggle and setView flip the mode and the caption names the focused item', () => {
  const panelEl = mount();
  const stage = initializeCustomizeStage({
    panelEl,
    getSelection: () => ({ ...selection(), boxName: 'Arceus Elite Trainer Box' }),
    onStep: () => {},
  });
  stage.show();
  panelEl.querySelector('[data-mode="focused"]').click();
  assert.equal(panelEl.querySelector('[data-mode="focused"]').getAttribute('aria-pressed'), 'true');
  stage.setView('sleeve');
  assert.equal(panelEl.querySelector('[data-mode="focused"]').classList.contains('active'), true);
  panelEl.querySelector('[data-mode="all"]').click();
  assert.equal(panelEl.querySelector('[data-mode="all"]').classList.contains('active'), true);
  stage.hide();
});

test('the arrows report the category and direction', () => {
  const panelEl = mount();
  const steps = [];
  const stage = initializeCustomizeStage({ panelEl, getSelection: selection, onStep: (slot, dir) => steps.push([slot, dir]) });
  stage.setView('coin');
  panelEl.querySelector('[data-dir="-1"]').click();
  panelEl.querySelector('[data-dir="1"]').click();
  assert.deepEqual(steps, [['coin', -1], ['coin', 1]]);
});

test('an unknown view is ignored', () => {
  const panelEl = mount();
  const steps = [];
  const stage = initializeCustomizeStage({ panelEl, getSelection: selection, onStep: (slot) => steps.push(slot) });
  stage.setView('mat');
  panelEl.querySelector('[data-dir="1"]').click();
  assert.deepEqual(steps, ['box'], 'the view stays on its default');
});

test('without WebGL the stage marks itself unavailable and the controls keep working', async () => {
  const panelEl = mount();
  const stage = initializeCustomizeStage({ panelEl, getSelection: selection, onStep: () => {} });
  stage.show();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(panelEl.classList.contains('is-unavailable'), true);
  assert.ok(warns.length >= 1, 'the failure is logged');
  assert.doesNotThrow(() => stage.refresh());
  assert.doesNotThrow(() => stage.hide());
  assert.equal(panelEl.hidden, true);
});
