import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { renderSearchResults } from '../../../initialization/document-event-listeners/sidebox/native-deck-builder-renderers.js';

const CARDS = [
  {
    id: 'sv03-125',
    name: 'Charizard ex',
    set: { name: 'Obsidian Flames' },
    images: { small: 'https://img/small.png', large: 'https://img/large.png' },
  },
  {
    id: 'sv03-126',
    name: 'Pikachu',
    set: { name: 'Obsidian Flames' },
    images: { small: 'https://img/pika.png' },
  },
];

function render({ quantities = {}, onSelect = () => {} } = {}) {
  const dom = new JSDOM('<div id="results"></div>');
  const el = dom.window.document.getElementById('results');
  renderSearchResults({
    searchResultsEl: el,
    results: CARDS,
    quantities,
    onSelect,
  });
  return { dom, el };
}

test('each result is an image-first tile wrapped in a hover frame', () => {
  const { el } = render();
  const tiles = el.querySelectorAll('.native-deck-builder-result');
  assert.equal(tiles.length, 2);

  for (const tile of tiles) {
    // The frame is what the Live stylesheet scales and clips; without it the
    // hover zoom and the caption's gradient have nothing to sit inside.
    const frame = tile.querySelector('.native-deck-builder-result-frame');
    assert.ok(frame, 'tile is missing its frame wrapper');
    assert.ok(frame.querySelector('img.native-deck-builder-result-image'));
    assert.ok(frame.querySelector('.native-deck-builder-result-text'));
  }
});

test('the card name and set stay in the DOM for screen readers', () => {
  const { el } = render();
  const first = el.querySelector('.native-deck-builder-result');
  assert.equal(
    first.querySelector('.native-deck-builder-result-text strong').textContent,
    'Charizard ex'
  );
  assert.equal(
    first.querySelector('.native-deck-builder-result-text span').textContent,
    'Obsidian Flames'
  );
  assert.equal(first.querySelector('img').getAttribute('alt'), 'Charizard ex');
});

test('the thumbnail is the small scan while the preview points at the large one', () => {
  const { el } = render();
  const first = el.querySelector('.native-deck-builder-result');
  assert.equal(
    first.querySelector('img').getAttribute('src'),
    'https://img/small.png'
  );
  assert.equal(first.dataset.previewImage, 'https://img/large.png');
});

test('a card already in the deck gets a copy-count badge and an in-deck marker', () => {
  const { el } = render({ quantities: { 'sv03-125': 3 } });
  const [withCopies, without] = el.querySelectorAll(
    '.native-deck-builder-result'
  );

  const badge = withCopies.querySelector('.native-deck-builder-result-qty');
  assert.ok(badge);
  assert.equal(badge.textContent, '3');
  assert.equal(withCopies.dataset.inDeck, '3');

  assert.equal(without.querySelector('.native-deck-builder-result-qty'), null);
  assert.equal(without.dataset.inDeck, undefined);
});

test('the badge sits inside the frame so it clips and scales with the art', () => {
  const { el } = render({ quantities: { 'sv03-125': 2 } });
  const badge = el.querySelector('.native-deck-builder-result-qty');
  assert.ok(badge.closest('.native-deck-builder-result-frame'));
});

test('clicking a tile selects the card it was built from', () => {
  const picked = [];
  const { el } = render({ onSelect: (card) => picked.push(card) });
  el.querySelectorAll('.native-deck-builder-result')[1].click();
  assert.deepEqual(picked, [CARDS[1]]);
});

test('card names are escaped, not injected', () => {
  const dom = new JSDOM('<div id="results"></div>');
  const el = dom.window.document.getElementById('results');
  renderSearchResults({
    searchResultsEl: el,
    results: [
      {
        id: 'x',
        name: '<img src=x onerror=alert(1)>',
        set: { name: 'Set' },
        images: { small: 's.png' },
      },
    ],
    onSelect: () => {},
  });

  // One <img> only: the card's own thumbnail. The injected tag stayed text.
  assert.equal(el.querySelectorAll('img').length, 1);
  assert.equal(
    el.querySelector('.native-deck-builder-result-text strong').textContent,
    '<img src=x onerror=alert(1)>'
  );
});

test('an empty result set clears the grid', () => {
  const dom = new JSDOM('<div id="results">stale</div>');
  const el = dom.window.document.getElementById('results');
  renderSearchResults({ searchResultsEl: el, results: [], onSelect: () => {} });
  assert.equal(el.innerHTML, '');
});

test('a missing container is a no-op rather than a crash', () => {
  assert.doesNotThrow(() =>
    renderSearchResults({
      searchResultsEl: null,
      results: CARDS,
      onSelect: () => {},
    })
  );
});
