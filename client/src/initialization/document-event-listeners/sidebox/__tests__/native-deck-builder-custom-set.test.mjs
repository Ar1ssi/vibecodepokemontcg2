import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  CUSTOM_SET_STORAGE_KEY,
  addCardToCustomSet,
  createEmptyCustomSet,
  serializeCustomSet,
} from '../../../../setup/deck-builder/core/custom-set.mjs';
import { initializeNativeDeckBuilderCustomSet } from '../native-deck-builder-custom-set.js';

const card = (id, name = id) => ({ id, name, set: { id: 'cust', name: 'Custom Set' }, images: { small: `https://img/${id}.webp` } });

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    raw: data,
  };
}

function mountPanel(storage = memoryStorage(), onAddToDeck = () => {}) {
  const dom = new JSDOM('<div id="panel" hidden></div>');
  const panelEl = dom.window.document.getElementById('panel');
  const controller = initializeNativeDeckBuilderCustomSet({ panelEl, storage, onAddToDeck });
  const tileButtons = (action) => [...panelEl.querySelectorAll(`[data-custom-set-${action}]`)];
  const status = () => panelEl.querySelector('[data-custom-set-status]').textContent;
  return { dom, panelEl, controller, storage, tileButtons, status };
}

const savedSet = (storage) => JSON.parse(storage.raw.get(CUSTOM_SET_STORAGE_KEY));

test('an empty set shows the empty hint and no cards', () => {
  const { panelEl, tileButtons } = mountPanel();
  assert.match(panelEl.textContent, /This set is empty/);
  assert.equal(tileButtons('add').length, 0);
});

test('a card picked from search is added, shown, and saved', () => {
  const storage = memoryStorage();
  const { controller, tileButtons, panelEl } = mountPanel(storage);
  controller.addFromSearch(card('a', 'Pikachu'));
  assert.equal(tileButtons('add').length, 1);
  assert.match(panelEl.querySelector('.db-custom-set-count').textContent, /1 card$/);
  assert.deepEqual(savedSet(storage).cards.map((c) => c.id), ['a']);
});

test('picking the same card twice keeps one copy and says so', () => {
  const storage = memoryStorage();
  const { controller, status } = mountPanel(storage);
  controller.addFromSearch(card('a', 'Pikachu'));
  controller.addFromSearch(card('a', 'Pikachu'));
  assert.equal(savedSet(storage).cards.length, 1);
  assert.equal(status(), 'Pikachu is already in this set.');
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('a single click sends the card to the deck after the double-click window', async () => {
  const sent = [];
  const { controller, tileButtons } = mountPanel(memoryStorage(), (picked) => sent.push(picked.id));
  controller.addFromSearch(card('a'));
  controller.addFromSearch(card('b'));
  tileButtons('add')[1].click();
  assert.deepEqual(sent, []);
  await wait(400);
  assert.deepEqual(sent, ['b']);
});

test('double-clicking a card removes it from the set and does not add it to the deck', async () => {
  const storage = memoryStorage();
  const sent = [];
  const { controller, tileButtons, dom } = mountPanel(storage, (picked) => sent.push(picked.id));
  controller.addFromSearch(card('a'));
  controller.addFromSearch(card('b'));
  const tile = tileButtons('add')[0];
  tile.click();
  tile.click();
  tile.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
  await wait(400);
  assert.deepEqual(sent, []);
  assert.deepEqual(savedSet(storage).cards.map((c) => c.id), ['b']);
});

test('double-clicking the remove button removes exactly one card', async () => {
  const storage = memoryStorage();
  const { controller, panelEl, dom } = mountPanel(storage);
  controller.addFromSearch(card('a'));
  controller.addFromSearch(card('b'));
  controller.addFromSearch(card('c'));
  // Mirrors a real double-click on the first ×: click 1 (detail 1) removes, click 2 (detail 2) lands on the next ×.
  const removeButtons = () => [...panelEl.querySelectorAll('[data-custom-set-remove]')];
  removeButtons()[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, detail: 1 }));
  removeButtons()[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, detail: 2 }));
  removeButtons()[0].dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
  await wait(400);
  assert.deepEqual(savedSet(storage).cards.map((c) => c.id), ['b', 'c']);
});

test('removing a card drops it from the set and from storage', () => {
  const storage = memoryStorage();
  const { controller, tileButtons } = mountPanel(storage);
  controller.addFromSearch(card('a'));
  controller.addFromSearch(card('b'));
  tileButtons('remove')[0].click();
  assert.deepEqual(savedSet(storage).cards.map((c) => c.id), ['b']);
});

test('renaming the set saves the new name', () => {
  const storage = memoryStorage();
  const { panelEl, dom } = mountPanel(storage);
  const input = panelEl.querySelector('.db-custom-set-name');
  input.value = '  Dragon Pack ';
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(savedSet(storage).name, 'Dragon Pack');
});

test('a saved set is restored when the tab opens again', () => {
  const storage = memoryStorage();
  mountPanel(storage).controller.addFromSearch(card('a', 'Pikachu'));
  const reopened = mountPanel(storage);
  assert.equal(reopened.tileButtons('add').length, 1);
  assert.match(reopened.panelEl.textContent, /Pikachu/);
});

test('card names are escaped, never built as markup', () => {
  const { controller, panelEl } = mountPanel();
  controller.addFromSearch(card('x', '<img src=x onerror="alert(1)">'));
  assert.equal(panelEl.querySelectorAll('img[onerror]').length, 0);
  assert.match(panelEl.textContent, /<img src=x onerror="alert\(1\)">/);
});

test('a failed save tells the player to export', () => {
  const failing = {
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  const { controller, status } = mountPanel(failing);
  controller.addFromSearch(card('a'));
  assert.match(status(), /Could not save this set/);
});

test('importing a set file merges its cards and takes its name into an empty set', async () => {
  const storage = memoryStorage();
  const { panelEl, dom, status } = mountPanel(storage);
  const incoming = addCardToCustomSet(addCardToCustomSet(createEmptyCustomSet(), card('a')), card('b'));
  const file = { text: async () => serializeCustomSet({ ...incoming, name: 'Shared Pack' }) };
  const fileInput = panelEl.querySelector('[data-custom-set-file]');
  Object.defineProperty(fileInput, 'files', { value: [file] });
  fileInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(savedSet(storage).name, 'Shared Pack');
  assert.deepEqual(savedSet(storage).cards.map((c) => c.id), ['a', 'b']);
  assert.match(status(), /Imported 2 new card\(s\) from “Shared Pack”\./);
});

test('importing a file that is not a set export shows the reason and changes nothing', async () => {
  const storage = memoryStorage();
  const { panelEl, dom, status } = mountPanel(storage);
  const fileInput = panelEl.querySelector('[data-custom-set-file]');
  Object.defineProperty(fileInput, 'files', { value: [{ text: async () => '{"hello":1}' }] });
  fileInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(status(), 'This file is not a custom set export.');
  assert.equal(storage.raw.has(CUSTOM_SET_STORAGE_KEY), false);
});
