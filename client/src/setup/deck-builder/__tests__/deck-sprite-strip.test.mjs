import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  renderDeckSprites,
  renderSpritePicker,
} from '../../../initialization/document-event-listeners/sidebox/native-deck-builder-renderers.js';
import {
  deckSpriteImageUrl,
  deckSpriteLabel,
  normalizeDeckSprites,
  searchPokemon,
} from '../core/deck-sprites.mjs';

function strip({ sprites = [], editable = false, max = 3 } = {}) {
  const dom = new JSDOM('<div id="strip"></div>');
  const el = dom.window.document.getElementById('strip');
  renderDeckSprites({
    stripEl: el,
    sprites: normalizeDeckSprites(sprites),
    spriteUrl: deckSpriteImageUrl,
    spriteLabel: deckSpriteLabel,
    editable,
    max,
  });
  return el;
}

test('the strip draws one image per slot, pointing at the vendored art', () => {
  const el = strip({ sprites: ['pikachu', { slug: 'gengar', shiny: true }] });
  const images = [...el.querySelectorAll('img')];
  assert.equal(images.length, 2);
  assert.equal(
    images[0].getAttribute('src'),
    '/src/assets/pokemon/gen8/regular/pikachu.png'
  );
  assert.equal(
    images[1].getAttribute('src'),
    '/src/assets/pokemon/gen8/shiny/gengar.png'
  );
});

test('shiny slots are marked so the theme can halo them', () => {
  const el = strip({ sprites: [{ slug: 'gengar', shiny: true }, 'pikachu'] });
  const images = [...el.querySelectorAll('img')];
  assert.ok(images[0].classList.contains('shiny'));
  assert.ok(!images[1].classList.contains('shiny'));
});

test('slots are labelled for screen readers and tooltips', () => {
  const el = strip({ sprites: [{ slug: 'pikachu', shiny: true }] });
  const image = el.querySelector('img');
  assert.equal(image.getAttribute('alt'), 'Shiny Pikachu');
  assert.equal(image.getAttribute('title'), 'Shiny Pikachu');
});

test('an empty strip is flagged, and a filled one is not', () => {
  assert.ok(strip({ sprites: [] }).classList.contains('is-empty'));
  assert.ok(!strip({ sprites: ['pikachu'] }).classList.contains('is-empty'));
});

test('a read-only strip has no picker affordance', () => {
  const el = strip({ sprites: ['pikachu'], editable: false });
  assert.equal(el.querySelector('[data-sprite-picker-open]'), null);
});

test('an editable strip always offers the picker, full or empty', () => {
  assert.ok(strip({ sprites: [], editable: true }).querySelector('[data-sprite-picker-open]'));
  const full = strip({
    sprites: ['pikachu', 'eevee', 'gengar'],
    editable: true,
  });
  assert.ok(full.querySelector('[data-sprite-picker-open]'));
});

test('a sprite that fails to load removes itself instead of showing a broken image', () => {
  const el = strip({ sprites: ['pikachu'] });
  assert.equal(el.querySelector('img').getAttribute('onerror'), 'this.remove()');
});

test('rendering into a missing element is a no-op, not a throw', () => {
  assert.doesNotThrow(() =>
    renderDeckSprites({
      stripEl: null,
      sprites: [],
      spriteUrl: deckSpriteImageUrl,
      spriteLabel: deckSpriteLabel,
    })
  );
});

// --- picker ---

function picker({ sprites = [], query = '', max = 3 } = {}) {
  const dom = new JSDOM('<div id="picker"></div>');
  const el = dom.window.document.getElementById('picker');
  renderSpritePicker({
    pickerEl: el,
    sprites: normalizeDeckSprites(sprites),
    results: searchPokemon(query, 12),
    query,
    max,
    spriteUrl: deckSpriteImageUrl,
    spriteLabel: deckSpriteLabel,
  });
  return el;
}

test('the picker shows a slot per pinned Pokémon with shiny and remove controls', () => {
  const el = picker({ sprites: ['pikachu', { slug: 'mew', shiny: true }] });
  assert.equal(el.querySelectorAll('[data-sprite-remove]').length, 2);
  const shinyButtons = [...el.querySelectorAll('[data-sprite-shiny]')];
  assert.equal(shinyButtons[0].getAttribute('aria-pressed'), 'false');
  assert.equal(shinyButtons[1].getAttribute('aria-pressed'), 'true');
});

test('the picker says when nothing is pinned yet', () => {
  assert.match(picker({ sprites: [] }).textContent, /No Pokémon pinned yet/);
});

test('an already-pinned Pokémon is marked and cannot be added twice', () => {
  const el = picker({ sprites: ['bulbasaur'] });
  const option = el.querySelector('[data-sprite-add="bulbasaur"]');
  assert.ok(option.classList.contains('chosen'));
  assert.ok(option.hasAttribute('disabled'));
});

test('a full strip disables every option and says why', () => {
  const el = picker({ sprites: ['pikachu', 'eevee', 'gengar'] });
  const options = [...el.querySelectorAll('[data-sprite-add]')];
  assert.ok(options.length > 0);
  assert.ok(options.every((option) => option.hasAttribute('disabled')));
  assert.match(el.textContent, /Strip is full/);
});

test('a search with no matches says so rather than rendering an empty grid', () => {
  const el = picker({ query: 'zzzzzz' });
  assert.match(el.textContent, /No Pokémon match that name/);
});

test('the search box keeps what was typed so a redraw does not clear it', () => {
  const el = picker({ query: 'char' });
  assert.equal(
    el.querySelector('#nativeDeckBuilderSpriteSearch').getAttribute('value'),
    'char'
  );
});

test('a hostile query cannot break out of the search field', () => {
  const el = picker({ query: '"><img src=x onerror=alert(1)>' });
  assert.equal(el.querySelectorAll('img[src="x"]').length, 0);
  assert.equal(
    el.querySelector('#nativeDeckBuilderSpriteSearch').value,
    '"><img src=x onerror=alert(1)>'
  );
});
