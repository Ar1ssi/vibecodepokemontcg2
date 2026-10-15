import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  decodeEntities,
  ordinalToPlacing,
  parseDecklists,
  parseEventIndex,
  parseEventPage,
} from '../parse-limitless.mjs';

// Trimmed copies of limitlesstcg.com pages fetched 2026-10-15 (Regional Louisville, KY, id 581).
const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('parseEventIndex reads id, name, date, players and format from each event row', () => {
  assert.deepEqual(parseEventIndex(fixture('event-index.html')), [
    { id: 581, name: 'Regional Louisville, KY', date: '2026-10-10', players: 2927, format: 'standard' },
    { id: 580, name: 'Regional Recife', date: '2026-10-03', players: 1074, format: 'standard' },
  ]);
});

test('parseEventIndex skips rows without an event link or format', () => {
  const html = '<tr><th>#</th></tr><tr data-format="standard"><td>no link</td></tr>';
  assert.deepEqual(parseEventIndex(html), []);
  assert.deepEqual(parseEventIndex(''), []);
});

test('parseEventPage reads the header and Masters standings', () => {
  const page = parseEventPage(fixture('event-page.html'));
  assert.equal(page.name, 'Regional Louisville, KY');
  assert.equal(page.players, 2927);
  assert.equal(page.formatCode, 'TEF-30C');
  assert.equal(page.formatLabel, 'Temporal Forces - 30th Celebration');
  assert.deepEqual(page.standings, [
    { placing: 1, player: 'Riley McKay', archetypeId: 284, archetypeName: 'Dragapult', listId: 29678 },
    { placing: 2, player: 'Austin Charles', archetypeId: 284, archetypeName: 'Dragapult Blaziken', listId: 30160 },
    { placing: 3, player: 'Evan Campbell', archetypeId: 354, archetypeName: 'Sharpedo Toxtricity', listId: 30161 },
  ]);
});

test('parseEventPage keeps a row with no list or archetype as nulls', () => {
  const html = '<tr data-rank="9" data-name="N&#039;s Fan" data-deck=""><td>9</td></tr>';
  assert.deepEqual(parseEventPage(html).standings, [
    { placing: 9, player: "N's Fan", archetypeId: null, archetypeName: '', listId: null },
  ]);
  assert.deepEqual(parseEventPage('').standings, []);
});

test('parseDecklists reads each list in placing order with counts, prints and USD prices', () => {
  const lists = parseDecklists(fixture('decklists.html'));
  assert.deepEqual(
    lists.map((list) => [list.placing, list.player, list.cards.reduce((sum, card) => sum + card.count, 0)]),
    [
      [1, 'Riley McKay', 60],
      [2, 'Austin Charles', 60],
    ]
  );
  assert.deepEqual(lists[0].cards[0], { count: 4, name: 'Dreepy', set: 'TWM', number: '128', priceUsd: 0.92 });
  assert.deepEqual(lists[0].cards.at(-1), {
    count: 3,
    name: 'Darkness Energy',
    set: 'MEE',
    number: '15',
    priceUsd: 0.54,
  });
});

test('parseDecklists ignores blocks with no placing or no cards', () => {
  const html =
    '<div class="tournament-decklist"><div class="decklist-toggle">Unranked Someone</div></div>' +
    '<div class="tournament-decklist"><div class="decklist-toggle">4th Empty</div></div>';
  assert.deepEqual(parseDecklists(html), []);
});

test('ordinalToPlacing and decodeEntities', () => {
  assert.equal(ordinalToPlacing('548th Colin Calvert'), 548);
  assert.equal(ordinalToPlacing('22nd'), 22);
  assert.equal(ordinalToPlacing('Top 8'), null);
  assert.equal(decodeEntities('N&#039;s Zoroark &amp; Pok&#xe9;mon'), "N's Zoroark & Pokémon");
});
