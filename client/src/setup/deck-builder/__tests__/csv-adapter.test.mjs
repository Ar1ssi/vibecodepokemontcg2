import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatImageUrl,
  formatCardType,
  serializeDeckToSimCsv,
  parseSimCsv,
} from '../core/csv-adapter.mjs';

test('formatImageUrl uses images.large for database cards', () => {
  const card = {
    id: 'sv1-1',
    images: { large: 'https://example.com/card.png' },
    supertype: 'Pokémon',
  };

  assert.equal(formatImageUrl(card), 'https://example.com/card.png');
});

test('formatImageUrl falls back to images.small when large is missing', () => {
  const card = {
    id: 'sv1-2',
    images: { small: 'https://example.com/small.png' },
    supertype: 'Pokémon',
  };

  assert.equal(formatImageUrl(card), 'https://example.com/small.png');
});

test('formatImageUrl falls back to image when database card has no images object urls', () => {
  const card = {
    id: 'sv1-3',
    images: {},
    image: 'https://example.com/legacy.png',
    supertype: 'Trainer',
  };

  assert.equal(formatImageUrl(card), 'https://example.com/legacy.png');
});

test('formatImageUrl preserves direct image for formatted deck cards', () => {
  const card = {
    image: 'https://example.com/direct.png',
    supertype: 'Trainer',
  };

  assert.equal(formatImageUrl(card), 'https://example.com/direct.png');
});

test('serializeDeckToSimCsv emits the simulator header and rows', () => {
  const deck = {
    Pikachu: {
      totalCount: 2,
      cards: [
        {
          count: 2,
          data: {
            id: 'sv1-25',
            name: 'Pikachu',
            supertype: 'Pokémon',
            number: '25',
            set: { id: 'sv01' },
            images: { large: 'https://example.com/pikachu.png' },
          },
        },
      ],
    },
  };

  const csv = serializeDeckToSimCsv(deck);

  assert.equal(
    csv,
    'QTY,Name,Type,URL,Number,Set,TcgId\n2,Pikachu,Pokémon,https://example.com/pikachu.png,25,sv01,sv1-25'
  );
});

test('serializeDeckToSimCsv emits one row per card variation', () => {
  const deck = {
    Pikachu: {
      totalCount: 3,
      cards: [
        {
          count: 2,
          data: {
            id: 'sv1-25',
            name: 'Pikachu',
            supertype: 'Pokémon',
            number: '25',
            set: { id: 'sv01' },
            images: { large: 'https://example.com/pikachu-a.png' },
          },
        },
        {
          count: 1,
          data: {
            image: 'https://example.com/pikachu-b.png',
            supertype: 'Pokémon',
          },
        },
      ],
    },
  };

  const csv = serializeDeckToSimCsv(deck);
  const lines = csv.split('\n');

  assert.equal(lines[0], 'QTY,Name,Type,URL,Number,Set,TcgId');
  assert.equal(
    lines[1],
    '2,Pikachu,Pokémon,https://example.com/pikachu-a.png,25,sv01,sv1-25'
  );
  assert.equal(lines[2], '1,Pikachu,Pokémon,https://example.com/pikachu-b.png,,,');
});

test('parseSimCsv parses simulator CSV into grouped deck structure', () => {
  const csv = [
    'QTY,Name,Type,URL',
    '2,Pikachu,Pokémon,https://example.com/pikachu.png',
    '1,Switch,Trainer,https://example.com/switch.png',
  ].join('\n');

  const deck = parseSimCsv(csv);

  assert.equal(deck.Pikachu.totalCount, 2);
  assert.equal(deck.Pikachu.cards[0].count, 2);
  assert.equal(deck.Pikachu.cards[0].data.name, 'Pikachu');
  assert.equal(deck.Switch.totalCount, 1);
  assert.equal(deck.Switch.cards[0].data.supertype, 'Trainer');
});

test('parseSimCsv reads extended identity columns', () => {
  const csv = [
    'QTY,Name,Type,URL,Number,Set,TcgId',
    '4,Piloswine,Pokémon,https://example.com/piloswine.png,24,PFL,me02-024',
  ].join('\n');

  const deck = parseSimCsv(csv);
  const data = deck.Piloswine.cards[0].data;

  assert.equal(data.number, '24');
  assert.equal(data.localId, '24');
  assert.equal(data.id, 'me02-024');
  assert.equal(data.set.id, 'PFL');
});

test('parseSimCsv still accepts legacy 4-column CSV', () => {
  const csv = 'QTY,Name,Type,URL\n1,Pikachu,Pokémon,https://example.com/p.png';
  const deck = parseSimCsv(csv);
  assert.equal(deck.Pikachu.cards[0].data.number, null);
});

test('parseDeckDataRows preserves deckData identity tuple fields', async () => {
  const { parseDeckDataRows } = await import('../core/csv-adapter.mjs');
  const deck = parseDeckDataRows([
    ['4', 'Piloswine', 'Pokémon', 'https://example.com/p.png', '24', 'PFL', 'me02-024'],
  ]);
  const data = deck.Piloswine.cards[0].data;
  assert.equal(data.number, '24');
  assert.equal(data.id, 'me02-024');
  assert.equal(data.set.id, 'PFL');
});

test('parseDeckDataRows accepts starter-deck localId cards via deckToSimRows shape', async () => {
  const { parseDeckDataRows } = await import('../core/csv-adapter.mjs');
  const deck = parseDeckDataRows([
    [
      '2',
      'Mega Lucario ex',
      'Pokémon',
      'https://assets.tcgdex.net/en/me/me01/077/high.webp',
      '077',
      'me01',
      'me01-077',
    ],
  ]);
  const data = deck['Mega Lucario ex'].cards[0].data;
  assert.equal(data.number, '077');
  assert.equal(data.id, 'me01-077');
});

test('formatCardType returns supertype', () => {
  assert.equal(formatCardType({ supertype: 'Energy' }), 'Energy');
});
