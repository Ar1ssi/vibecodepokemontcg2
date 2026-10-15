import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

// Design 071: the deck box picker lists TCG Live's boxes by thumbnail, stores the default as null and
// degrades to a message when the catalog cannot load.
const dom = new JSDOM('<div id="boxes"></div>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;

const catalog = JSON.parse(
  fs.readFileSync(new URL('../../../../assets/deckbox/boxes.json', import.meta.url), 'utf8')
);
let catalogResponse = { ok: true, status: 200, json: async () => catalog };
globalThis.fetch = async (url) => {
  assert.equal(String(url), '/src/assets/deckbox/boxes.json');
  return catalogResponse;
};

const { initializeDeckBuilderBoxPicker } = await import('../native-deck-builder-box-picker.js');

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const tileIds = (panelEl) => [...panelEl.querySelectorAll('[data-box-id]')].map((button) => button.dataset.boxId);

test('lists the default box first, then every other box once, with the default selected', async () => {
  const panelEl = document.getElementById('boxes');
  const picks = [];
  const picker = initializeDeckBuilderBoxPicker({ panelEl, onChange: (box) => picks.push(box) });
  assert.match(panelEl.textContent, /Loading deck boxes/);
  await settle();

  const ids = tileIds(panelEl);
  assert.equal(ids[0], '', 'the default tile stores null');
  assert.equal(ids.length, catalog.boxes.length, 'default + every other box, each once');
  assert.ok(!ids.includes(catalog.default), 'the default box appears only as the first tile');
  assert.ok(panelEl.querySelector('[data-box-id=""]').classList.contains('selected'));
  assert.equal(picker.getSelected(), null);
  assert.equal(picks.length, 0, 'nothing is announced before a pick');
});

test('picking a box selects it and reports it; picking it again goes back to the default', async () => {
  const panelEl = document.getElementById('boxes');
  panelEl.innerHTML = '';
  const picks = [];
  const picker = initializeDeckBuilderBoxPicker({ panelEl, onChange: (box) => picks.push(box?.id ?? null) });
  await settle();
  const target = catalog.boxes.find((box) => box.id !== catalog.default);

  panelEl.querySelector(`[data-box-id="${target.id}"]`).click();
  assert.deepEqual(picks, [target.id]);
  assert.equal(picker.getSelected().id, target.id);
  assert.ok(panelEl.querySelector(`[data-box-id="${target.id}"]`).classList.contains('selected'));

  panelEl.querySelector(`[data-box-id="${target.id}"]`).click();
  assert.deepEqual(picks, [target.id, null]);
  assert.equal(picker.getSelected(), null);
});

test('setSelected shows a saved box without announcing it; an unknown id lists nothing selected', async () => {
  const panelEl = document.getElementById('boxes');
  panelEl.innerHTML = '';
  const picks = [];
  const picker = initializeDeckBuilderBoxPicker({ panelEl, onChange: () => picks.push('x') });
  await settle();
  const target = catalog.boxes.find((box) => box.id !== catalog.default);

  picker.setSelected(target.id);
  assert.equal(picker.getSelected().id, target.id);
  assert.equal(picks.length, 0);

  picker.setSelected('db_gone');
  assert.equal(picker.getSelected().id, catalog.default, 'an id the catalog lacks resolves to the default box');
  assert.equal(panelEl.querySelectorAll('.selected').length, 0);
});

test('the filter narrows the gallery and an empty result says so', async () => {
  const panelEl = document.getElementById('boxes');
  panelEl.innerHTML = '';
  initializeDeckBuilderBoxPicker({ panelEl, onChange: () => {} });
  await settle();
  const input = panelEl.querySelector('.native-deck-builder-box-filter');

  input.value = 'elite trainer';
  input.dispatchEvent(new window.Event('input'));
  const some = tileIds(panelEl).length;
  assert.ok(some > 0 && some < catalog.boxes.length);

  input.value = 'zzzz-no-such-box';
  input.dispatchEvent(new window.Event('input'));
  assert.equal(tileIds(panelEl).length, 0);
  assert.match(panelEl.textContent, /No deck boxes match/);
});

test('a missing panel yields no picker', () => {
  assert.equal(initializeDeckBuilderBoxPicker({ panelEl: null, onChange: () => {} }), null);
});
