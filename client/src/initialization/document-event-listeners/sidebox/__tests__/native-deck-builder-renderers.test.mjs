import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  BUILDER_FILTER_GROUPS,
  createEmptyFilters,
  toggleFilter,
} from '../../../../setup/deck-builder/core/card-filters.mjs';
import { renderFilterDrawer, renderSearchResults } from '../native-deck-builder-renderers.js';

const dom = new JSDOM('<div id="drawer"></div><div id="results"></div>');
const drawerEl = dom.window.document.getElementById('drawer');

const findControl = (group, value) =>
  [...drawerEl.querySelectorAll('[data-filter-value]')].find(
    (control) => control.dataset.filterGroup === group && control.dataset.filterValue === value
  );

// Design 050's drawer redraws itself on every toggle, as the deck builder's renderDrawer does.
function mountDrawer() {
  let filters = createEmptyFilters();
  const draw = () =>
    renderFilterDrawer({
      drawerEl,
      groups: BUILDER_FILTER_GROUPS,
      filters,
      onToggle: (group, value) => {
        filters = toggleFilter(filters, group, value);
        draw();
      },
    });
  draw();
  return () => filters;
}

test('toggling a pill below the fold keeps the drawer scrolled and the pill focused', () => {
  const currentFilters = mountDrawer();
  drawerEl.querySelector('.native-deck-builder-fdrawer-body').scrollTop = 640;
  findControl('rarities', 'Holo Rare V').focus();

  findControl('rarities', 'Holo Rare V').click();

  assert.deepEqual(currentFilters().rarities, ['Holo Rare V']);
  assert.equal(drawerEl.querySelector('.native-deck-builder-fdrawer-body').scrollTop, 640);
  const focused = dom.window.document.activeElement;
  assert.equal(focused, findControl('rarities', 'Holo Rare V'));
  assert.equal(focused.getAttribute('aria-pressed'), 'true');
});

test('a redraw while focus is outside the drawer leaves focus alone', () => {
  mountDrawer();
  dom.window.document.activeElement?.blur();
  findControl('supertypes', 'Trainer').click();
  assert.equal(dom.window.document.activeElement, dom.window.document.body);
});

test('search tiles load the low TCGdex scan; the preview keeps the high one', () => {
  const searchResultsEl = dom.window.document.getElementById('results');
  // TCGdex sv08-057 Pikachu ex, normalized as card-search.mjs does (high.webp for both sizes).
  const high = 'https://assets.tcgdex.net/en/sv/sv08/057/high.webp';
  const custom = 'https://example.test/cards/custom.png';
  renderSearchResults({
    searchResultsEl,
    results: [
      { id: 'sv08-057', name: 'Pikachu ex', images: { small: high, large: high }, image: high },
      { id: 'custom-1', name: 'Custom', images: { small: custom, large: custom }, image: custom },
    ],
    onSelect: () => {},
  });
  const [tcgdexTile, customTile] = searchResultsEl.querySelectorAll('.native-deck-builder-result');
  assert.equal(tcgdexTile.querySelector('img').getAttribute('src'), 'https://assets.tcgdex.net/en/sv/sv08/057/low.webp');
  assert.equal(tcgdexTile.dataset.previewImage, high);
  assert.equal(customTile.querySelector('img').getAttribute('src'), custom);
});

// Two TCGdex results as card-search.mjs normalizes them (high.webp for both sizes).
const gridCardA = {
  id: 'sv08-057',
  name: 'Pikachu ex',
  images: { small: 'https://assets.tcgdex.net/en/sv/sv08/057/high.webp', large: 'https://assets.tcgdex.net/en/sv/sv08/057/high.webp' },
  set: { name: 'Surging Sparks' },
};
const gridCardB = {
  id: 'sv05-051',
  name: 'Pikachu',
  images: { small: 'https://assets.tcgdex.net/en/sv/sv05/051/high.webp', large: 'https://assets.tcgdex.net/en/sv/sv05/051/high.webp' },
  set: { name: 'Temporal Forces' },
};

const newGrid = () => dom.window.document.createElement('div');

test('a same-id re-render patches the quantity badge in place and keeps the scans loaded', () => {
  const searchResultsEl = newGrid();
  const results = [gridCardA, gridCardB];
  renderSearchResults({ searchResultsEl, results, onSelect: () => {} });
  const [imgA, imgB] = [...searchResultsEl.querySelectorAll('img')];

  renderSearchResults({ searchResultsEl, results, onSelect: () => {}, quantities: { 'sv08-057': 2 } });
  const [tileA, tileB] = searchResultsEl.querySelectorAll('.native-deck-builder-result');
  assert.equal(searchResultsEl.querySelectorAll('img')[0], imgA);
  assert.equal(searchResultsEl.querySelectorAll('img')[1], imgB);
  assert.equal(tileA.dataset.inDeck, '2');
  assert.equal(tileA.querySelector('.native-deck-builder-result-qty').textContent, '2');
  assert.equal(tileB.hasAttribute('data-in-deck'), false);
  assert.equal(tileB.querySelector('.native-deck-builder-result-qty'), null);

  renderSearchResults({ searchResultsEl, results, onSelect: () => {} });
  assert.equal(tileA.hasAttribute('data-in-deck'), false);
  assert.equal(tileA.querySelector('.native-deck-builder-result-qty'), null);
});

test('a patched grid matches a fresh render of the same inputs', () => {
  const patched = newGrid();
  const fresh = newGrid();
  const results = [gridCardA, gridCardB];
  const normalized = (el) => el.innerHTML.replace(/\s+/g, ' ');

  renderSearchResults({ searchResultsEl: patched, results, onSelect: () => {} });
  renderSearchResults({
    searchResultsEl: patched,
    results,
    onSelect: () => {},
    quantities: { 'sv08-057': 3 },
    owned: { 'sv05-051': 1 },
  });
  renderSearchResults({
    searchResultsEl: fresh,
    results,
    onSelect: () => {},
    quantities: { 'sv08-057': 3 },
    owned: { 'sv05-051': 1 },
  });
  assert.equal(normalized(patched), normalized(fresh));

  renderSearchResults({ searchResultsEl: patched, results, onSelect: () => {} });
  renderSearchResults({ searchResultsEl: fresh, results, onSelect: () => {} });
  assert.equal(normalized(patched), normalized(fresh));
});

test('a different id list redraws the tiles and a click selects from the new list', () => {
  const searchResultsEl = newGrid();
  const selected = [];
  renderSearchResults({ searchResultsEl, results: [gridCardA], onSelect: (card) => selected.push(card.id) });
  const oldImg = searchResultsEl.querySelector('img');

  renderSearchResults({ searchResultsEl, results: [gridCardB], onSelect: (card) => selected.push(card.id) });
  assert.notEqual(searchResultsEl.querySelector('img'), oldImg);

  searchResultsEl.querySelector('.native-deck-builder-result').click();
  assert.deepEqual(selected, ['sv05-051']);
});

test('after three renders of one grid, a click calls the latest onSelect once and adds one grid listener', () => {
  const searchResultsEl = newGrid();
  const calls = [];
  const addListener = searchResultsEl.addEventListener.bind(searchResultsEl);
  let gridListeners = 0;
  searchResultsEl.addEventListener = (type, listener, options) => {
    gridListeners += 1;
    addListener(type, listener, options);
  };
  const results = [gridCardA, gridCardB];
  renderSearchResults({ searchResultsEl, results, onSelect: () => calls.push('first') });
  renderSearchResults({ searchResultsEl, results, onSelect: () => calls.push('second'), quantities: { 'sv08-057': 1 } });
  renderSearchResults({ searchResultsEl, results, onSelect: () => calls.push('third') });

  searchResultsEl.querySelectorAll('.native-deck-builder-result')[1].click();
  assert.deepEqual(calls, ['third']);
  assert.equal(gridListeners, 1);
});
