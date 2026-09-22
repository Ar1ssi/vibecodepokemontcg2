import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  renderDeckCards,
  renderDeckSprites,
} from '../../../initialization/document-event-listeners/sidebox/native-deck-builder-renderers.js';
import { deckSpriteImageUrl, deckSpriteLabel } from '../core/deck-sprites.mjs';

function deckList(sortedCards) {
  const dom = new JSDOM('<div id="cards"></div>');
  const el = dom.window.document.getElementById('cards');
  renderDeckCards({ cardsEl: el, sortedCards, onAdd() {}, onRemove() {} });
  return el;
}

test('each deck row carries the sprite for its card', () => {
  const el = deckList([
    { name: 'Mega Charizard X ex', supertype: 'Pokémon', count: 2 },
    { name: 'Great Ball', supertype: 'Trainer', trainerType: 'Item', count: 4 },
  ]);
  const sprites = [...el.querySelectorAll('.native-deck-builder-deck-row-sprite')];
  assert.equal(sprites.length, 2);
  assert.equal(sprites[0].getAttribute('src'), '/src/assets/pokemon/gen8/regular/charizard-mega-x.png');
  assert.ok(sprites[0].classList.contains('pokemon'));
  assert.equal(sprites[1].getAttribute('src'), '/src/assets/items/ball/great.png');
  assert.ok(sprites[1].classList.contains('item'));
  assert.equal(sprites[1].getAttribute('onerror'), 'this.remove()');
});

test('rows without a sprite keep an empty slot so names stay aligned', () => {
  const el = deckList([
    { name: "Boss's Orders", supertype: 'Trainer', trainerType: 'Supporter', count: 2 },
    { name: 'Fire Energy', supertype: 'Energy', count: 8 },
  ]);
  const slots = [...el.querySelectorAll('.native-deck-builder-deck-row-sprite-slot')];
  assert.equal(slots.length, 2);
  assert.ok(slots.every((slot) => slot.children.length === 0));
});

test('auto-filled header sprites are marked so the theme can tell them apart', () => {
  const dom = new JSDOM('<div id="strip"></div>');
  const el = dom.window.document.getElementById('strip');
  renderDeckSprites({
    stripEl: el,
    sprites: [{ slug: 'pikachu', shiny: false }, { slug: 'eevee', shiny: false, auto: true }],
    spriteUrl: deckSpriteImageUrl,
    spriteLabel: deckSpriteLabel,
  });
  const images = [...el.querySelectorAll('img')];
  assert.ok(!images[0].classList.contains('auto'));
  assert.ok(images[1].classList.contains('auto'));
});
