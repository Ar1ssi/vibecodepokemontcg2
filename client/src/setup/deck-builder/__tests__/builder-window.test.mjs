import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BUILDER_MESSAGE_SOURCE,
  BUILDER_WINDOW_PATH,
  buildBuilderMessage,
  parseBuilderMessage,
  resolveBuilderRole,
} from '../core/builder-window.mjs';

const ROW = ['4', 'Charizard ex', 'Pokémon', 'https://assets.tcgdex.net/en/sv/sv03.5/006/high.webp', '006', 'sv03.5', 'sv03.5-006'];

test('the builder path is the editor; every other path is the host', () => {
  assert.equal(resolveBuilderRole(BUILDER_WINDOW_PATH), 'editor');
  assert.equal(resolveBuilderRole('/deck-builder/'), 'editor');
  assert.equal(resolveBuilderRole('/'), 'host');
  assert.equal(resolveBuilderRole('/import'), 'host');
  assert.equal(resolveBuilderRole(undefined), 'host');
});

test('a built message round-trips through the parser', () => {
  const message = buildBuilderMessage('load-deck', { target: 'self', deckId: 'deck-1', rows: [ROW] });
  assert.equal(message.source, BUILDER_MESSAGE_SOURCE);
  assert.deepEqual(parseBuilderMessage(message), {
    type: 'load-deck',
    payload: { target: 'self', deckId: 'deck-1', rows: [ROW] },
  });
});

test('every message type parses in its valid shape', () => {
  const valid = [
    ['ready', {}],
    ['host-state', { isTwoPlayer: false }],
    ['load-deck', { target: 'opp', deckId: null, rows: [ROW.slice(0, 4)] }],
    ['card-back', { target: 'self', image: '/src/assets/cardback.png', emit: true }],
    ['sleeve', { target: 'self', image: null }],
    ['mat', { target: 'opp', matId: 'mat-7', emit: false }],
    ['coin', { target: 'self', coinId: null }],
    ['play', { target: 'self' }],
  ];
  for (const [type, payload] of valid) {
    assert.ok(parseBuilderMessage(buildBuilderMessage(type, payload)), `${type} should parse`);
  }
});

test('foreign or malformed envelopes are ignored', () => {
  assert.equal(parseBuilderMessage(null), null);
  assert.equal(parseBuilderMessage('ready'), null);
  assert.equal(parseBuilderMessage({ source: 'other', version: 1, type: 'ready', payload: {} }), null);
  assert.equal(
    parseBuilderMessage({ source: BUILDER_MESSAGE_SOURCE, version: 2, type: 'ready', payload: {} }),
    null
  );
  assert.equal(parseBuilderMessage(buildBuilderMessage('delete-everything', {})), null);
  assert.equal(parseBuilderMessage({ ...buildBuilderMessage('ready'), payload: [] }), null);
});

test('bad targets, ids and flags are rejected', () => {
  const reject = (type, payload) =>
    assert.equal(parseBuilderMessage(buildBuilderMessage(type, payload)), null, JSON.stringify(payload));
  reject('play', { target: 'both' });
  reject('coin', { target: 'self', coinId: 42 });
  reject('mat', { target: 'self', matId: 'x'.repeat(129), emit: true });
  reject('mat', { target: 'self', matId: 'mat-1' });
  reject('host-state', { isTwoPlayer: 'yes' });
  reject('load-deck', { target: 'self', rows: [ROW] });
});

test('only http(s) and site-rooted images are accepted as card backs', () => {
  const back = (image) =>
    parseBuilderMessage(buildBuilderMessage('card-back', { target: 'self', image, emit: false }));
  assert.ok(back('https://example.com/sleeve.png'));
  assert.ok(back('/src/assets/sleeves/red.png'));
  assert.equal(back('javascript:alert(1)'), null);
  assert.equal(back('data:image/png;base64,AAAA'), null);
  assert.equal(back('//evil.example/x.png'), null);
  assert.equal(back(`https://example.com/${'a'.repeat(2048)}`), null);
});

test('deck rows must be short arrays of plain cells', () => {
  const load = (rows) =>
    parseBuilderMessage(buildBuilderMessage('load-deck', { target: 'self', deckId: null, rows }));
  assert.ok(load([]));
  assert.ok(load([[4, 'Pikachu', 'Pokémon', 'https://x/y.png', null, null, null]]));
  assert.equal(load('rows'), null);
  assert.equal(load([['4', 'Pikachu', 'Pokémon']]), null);
  assert.equal(load([[...ROW, 'extra']]), null);
  assert.equal(load([['4', { name: 'x' }, 'Pokémon', 'u']]), null);
  assert.equal(load(Array.from({ length: 501 }, () => ROW)), null);
});
