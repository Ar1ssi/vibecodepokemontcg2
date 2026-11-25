import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { loadStarterDecks } from '../../../../setup/deck-builder/core/starter-decks.mjs';
import { initializeNativeDeckBuilderLibrary } from '../native-deck-builder-library.js';
import { escapeHtml } from '../native-deck-builder-shared-logic.js';

const MARKUP = `
  <div id="nativeDeckBuilderLibraryBar">
    <button id="nativeDeckBuilderLibraryToggle"><span data-deck-picker-label></span></button>
    <div id="nativeDeckBuilderLibraryPopover" hidden><div id="nativeDeckBuilderLibraryList"></div></div>
    <button id="nativeDeckBuilderNewDeck"></button>
    <span id="nativeDeckBuilderLibraryStatus"></span>
  </div>`;

function bootWith(defineStorage) {
  const dom = new JSDOM(`<!doctype html><body>${MARKUP}</body>`, { url: 'http://localhost/' });
  defineStorage(dom.window);
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.CSS = { escape: (value) => String(value) };
  const controller = initializeNativeDeckBuilderLibrary({
    onOpenDeck: () => {},
    onSaveCurrentDeck: () => {},
    allowDeckWrites: true,
  });
  const status = () => dom.window.document.getElementById('nativeDeckBuilderLibraryStatus').textContent;
  return { controller, status };
}

test('the library bar boots when reading window.localStorage throws', () => {
  assert.doesNotThrow(() =>
    bootWith((win) =>
      Object.defineProperty(win, 'localStorage', {
        get() {
          throw new Error('SecurityError');
        },
        configurable: true,
      })
    )
  );
});

test('seeding starter decks into storage that refuses writes says so', async () => {
  await loadStarterDecks();
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {},
  };
  const { status } = bootWith((win) =>
    Object.defineProperty(win, 'localStorage', { value: storage, configurable: true })
  );
  assert.match(status(), /Could not save/);
});

test('escapeHtml escapes markup and both quote kinds', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(escapeHtml(), '');
  assert.equal(escapeHtml(7), '7');
});
