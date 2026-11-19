import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deckDataRowsToSimCsv,
  parseDeckDataRows,
  parseSimCsv,
  serializeDeckToSimCsv,
} from '../core/csv-adapter.mjs';

const commaDeck = {
  'Pikachu, the "Spark" Mouse': {
    cards: [
      {
        count: 2,
        data: {
          id: 'x-1',
          name: 'Pikachu, the "Spark" Mouse',
          supertype: 'Pokémon',
          image: 'https://example.com/a,b.png',
          number: '1',
          set: { id: 'x' },
        },
      },
    ],
    totalCount: 2,
  },
};

test('a card name or url holding commas and quotes survives an export and import round trip', () => {
  const csv = serializeDeckToSimCsv(commaDeck);
  assert.match(csv, /^2,"Pikachu, the ""Spark"" Mouse",Pokémon,"https:\/\/example.com\/a,b.png",1,x,x-1$/m);
  const back = parseSimCsv(csv);
  const [variant] = back['Pikachu, the "Spark" Mouse'].cards;
  assert.equal(variant.count, 2);
  assert.equal(variant.data.image, 'https://example.com/a,b.png');
  assert.equal(variant.data.id, 'x-1');
  assert.equal(variant.data.set.id, 'x');
});

test('the deck-rows exporter quotes the same way and the rows reader gives the same deck', () => {
  const rows = [[3, 'Boss, the Orders', 'Trainer', 'https://example.com/b.png', '7', 'x', 'x-7']];
  const csv = deckDataRowsToSimCsv(rows);
  assert.equal(csv.split('\n')[1], '3,"Boss, the Orders",Trainer,https://example.com/b.png,7,x,x-7');
  assert.deepEqual(parseSimCsv(csv), parseDeckDataRows(rows));
});

test('unquoted legacy files and CRLF line endings still read', () => {
  const deck = parseSimCsv('QTY,Name,Type,URL\r\n1,Pikachu,Pokémon,https://example.com/p.png\r\n');
  assert.equal(deck.Pikachu.cards[0].data.image, 'https://example.com/p.png');
  assert.equal(deck.Pikachu.totalCount, 1);
});

test('both readers merge copies by image and id', () => {
  const rows = [
    [1, 'Pikachu', 'Pokémon', 'u', '1', 'x', 'x-1'],
    [1, 'Pikachu', 'Pokémon', 'u', '1', 'x', 'x-1'],
    [1, 'Pikachu', 'Pokémon', 'u', '2', 'x', 'x-2'],
  ];
  const csv = `QTY,Name,Type,URL,Number,Set,TcgId\n${rows.map((row) => row.join(',')).join('\n')}`;
  for (const deck of [parseSimCsv(csv), parseDeckDataRows(rows)]) {
    assert.deepEqual(
      deck.Pikachu.cards.map(({ count }) => count),
      [2, 1]
    );
    assert.equal(deck.Pikachu.totalCount, 3);
  }
});

test('an import row that cannot be read is reported with its line, not dropped', () => {
  assert.throws(() => parseSimCsv('QTY,Name,Type,URL\n1,Pikachu,Pokémon,u\nPikachu,Pokémon'), /line 3/);
  assert.throws(() => parseSimCsv('QTY,Name,Type,URL\nmany,Pikachu,Pokémon,u'), /line 2/);
  assert.throws(() => parseSimCsv('QTY,Name,Type,URL\n0,Pikachu,Pokémon,u'), /line 2/);
});
