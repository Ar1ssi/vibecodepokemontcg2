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
