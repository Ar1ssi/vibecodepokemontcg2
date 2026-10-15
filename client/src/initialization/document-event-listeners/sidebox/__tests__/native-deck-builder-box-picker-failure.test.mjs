import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Design 071 edge row 4: the catalog fetch fails, so the picker says so instead of staying on "Loading".
const dom = new JSDOM('<div id="boxes"></div>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
const warn = console.warn;
console.warn = () => {};

const { initializeDeckBuilderBoxPicker } = await import('../native-deck-builder-box-picker.js');

test('a catalog that will not load leaves a message and a picker that does not throw', async () => {
  const panelEl = document.getElementById('boxes');
  const picker = initializeDeckBuilderBoxPicker({ panelEl, onChange: () => {} });
  await new Promise((resolve) => setTimeout(resolve, 0));
  console.warn = warn;

  assert.match(panelEl.textContent, /Deck boxes are unavailable/);
  assert.equal(picker.catalog(), null);
  assert.equal(picker.getSelected(), null);
  assert.doesNotThrow(() => picker.setSelected('db_x'));
});
