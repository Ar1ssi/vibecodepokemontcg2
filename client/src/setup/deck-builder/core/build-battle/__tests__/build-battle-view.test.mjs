import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../../../../../../../shared/engine/rng.mjs';
import { loadBoxData } from '../box-data.mjs';
import { openBox, poolFromBox, startingDeckRows } from '../pack-opening.mjs';
import { deckCardCounts, validatePoolDeck } from '../build-battle-session.mjs';
import { validateDeck } from '../../deck-validation.mjs';
import { addCard } from '../../deck-state.mjs';
import {
  boxContentsLine,
  boxHeadline,
  buildBattleDeckName,
  deckFromCardCounts,
  deckFromRows,
  deckLoadFormat,
  parseBoxKey,
  poolRefusalMessage,
  poolRemaining,
  withPoolErrors,
} from '../build-battle-view.mjs';

const { box, cards: setCards, setInfo, data } = await loadBoxData('phantasmal-flames');
const decks = data.decks;
const opened = {
  deckKey: 'ceruledge',
  packs: openBox({ box, data, cards: setCards, setInfo, rng: createRng(42) }).packs,
};
const pool = poolFromBox({ box, data, cards: setCards, opened });
const byId = (id) => pool.find((entry) => entry.card.id === id);

test('deckFromRows turns the Ceruledge box deck into a legal 40-card editor deck', () => {
  const deck = deckFromRows(decks.ceruledge);
  const result = validateDeck(deck, 'build-battle');
  assert.equal(result.totalCards, 40);
  assert.equal(result.isValid, true, result.errors.join('; '));
  // Promo and set print share the name group: 1 mep-014 + 3 me02-020 (design 051 row 11).
  assert.deepEqual(
    deck.Ceruledge.cards.map((variant) => [variant.data.id, variant.count]),
    [['mep-014', 1], ['me02-020', 3]]
  );
  assert.equal(deck.Ceruledge.totalCount, 4);
  assert.equal('qty' in deck.Ceruledge.cards[0].data, false);
  assert.deepEqual(validatePoolDeck(deck, pool), []);
});

test('deckFromRows skips rows without a name or a positive qty', () => {
  assert.deepEqual(deckFromRows([{ id: 'x', qty: 2 }, { id: 'y', name: 'Y', qty: 0 }, null]), {});
});

test('the library name and headline name the box, the deck and the seed', () => {
  assert.equal(buildBattleDeckName(box, 'Ceruledge', 42), 'B&B Phantasmal Flames Ceruledge #42');
  assert.equal(
    boxHeadline(box, box.decks[0], 42),
    'Phantasmal Flames Build & Battle Box · Ceruledge deck · Box #42'
  );
  const evolution = { ...box, name: 'Team Up Build & Battle Box', shortName: 'Team Up', kind: 'evolution-pack' };
  assert.equal(buildBattleDeckName(evolution, 'Charizard', 7), 'B&B Team Up Charizard #7');
  assert.equal(
    boxHeadline(evolution, { name: 'Charizard' }, 7),
    'Team Up Build & Battle Box · Charizard promo · Box #7'
  );
});

test('the sealed box says what is inside per kind', () => {
  assert.equal(
    boxContentsLine(box, setInfo.name),
    '4 Phantasmal Flames packs and one of 4 40-card decks. Build a 40-card deck from them; games use 4 Prizes.'
  );
  assert.equal(
    boxContentsLine({ ...box, shortName: 'Team Up', kind: 'evolution-pack' }),
    '4 Team Up packs and a 23-card Evolution pack (1 of 4 promos). Build a 40-card deck from them; games use 4 Prizes.'
  );
  assert.equal(
    boxContentsLine({ ...box, kind: 'evolution-deck' }, 'Temporal Forces'),
    '4 Temporal Forces packs and a 40-card Evolution deck (1 of 4 promos). Build a 40-card deck from them; games use 4 Prizes.'
  );
});

test('row 1: ?box= takes only a catalog box key', () => {
  assert.equal(parseBoxKey('phantasmal-flames'), 'phantasmal-flames');
  for (const value of ['', 'nope', 'me02', 'Phantasmal-Flames', null, undefined, 42]) {
    assert.equal(parseBoxKey(value), null, String(value));
  }
});

test('rows 14 + 15: the starting deck fills the editor counter (fixed: 40 / 40)', () => {
  const rows = startingDeckRows({ box, data, opened: { deckKey: 'zacian', packs: [] } });
  const result = validateDeck(deckFromRows(rows), 'build-battle');
  assert.equal(result.totalCards, 40);
  assert.equal(result.requiredCards, 40);
  assert.equal(result.isValid, true, result.errors.join('; '));
});

test('poolRemaining counts down as copies go into the deck and never goes below 0', () => {
  let deck = {};
  const charcadet = byId('me02-019');
  assert.equal(poolRemaining(deck, pool).get('me02-019'), charcadet.count);
  deck = addCard(deck, charcadet.card);
  assert.equal(poolRemaining(deck, pool).get('me02-019'), charcadet.count - 1);
  for (let index = 0; index < charcadet.count + 2; index += 1) deck = addCard(deck, charcadet.card);
  assert.equal(poolRemaining(deck, pool).get('me02-019'), 0);
});

test('poolRefusalMessage names the card and its pool count (design 051 row 10)', () => {
  const moltres = byId('me02-014');
  assert.equal(poolRefusalMessage(moltres.card, pool), `Only ${moltres.count} Moltres in your pool`);
  assert.equal(
    poolRefusalMessage({ id: 'sv03.5-006', name: 'Charizard ex' }, pool),
    'Charizard ex is not in your pool'
  );
});

test('withPoolErrors appends pool errors and makes the deck invalid', () => {
  const valid = { isValid: true, errors: [], totalCards: 40 };
  assert.equal(withPoolErrors(valid, []), valid);
  assert.deepEqual(withPoolErrors(valid, ['Sandile: 4 in deck, 3 in your pool']), {
    isValid: false,
    errors: ['Sandile: 4 in deck, 3 in your pool'],
    totalCards: 40,
  });
});

test('deckFromCardCounts rebuilds an edited box deck and drops unknown ids (I207)', () => {
  const boxDeck = deckFromRows(decks.ceruledge);
  const counts = deckCardCounts(boxDeck);
  // Basic Energy is not a pool entry; the box deck's own rows name it.
  const cards = [...pool.map((entry) => entry.card), ...decks.ceruledge];
  const rebuilt = deckFromCardCounts([...counts, ['not-a-card', 3]], cards);
  assert.deepEqual(deckCardCounts(rebuilt), counts);
  assert.equal(validateDeck(rebuilt, 'build-battle').totalCards, 40);
  assert.deepEqual(deckFromCardCounts([], cards), {});
});

test('deckLoadFormat: an unsaved Build & Battle tab deck plays and first saves as Build & Battle (I205)', () => {
  assert.equal(deckLoadFormat({ isBuildBattle: true, recordedFormat: null, isUnsaved: true }), 'build-battle');
  assert.equal(deckLoadFormat({ isBuildBattle: true, recordedFormat: null, isUnsaved: false }), 'tcg', 'a Standard record keeps 6 Prizes');
  assert.equal(deckLoadFormat({ isBuildBattle: false, recordedFormat: 'build-battle', isUnsaved: false }), 'build-battle');
  assert.equal(deckLoadFormat({ isBuildBattle: false, recordedFormat: null, isUnsaved: true }), 'tcg');
  assert.equal(deckLoadFormat(), 'tcg');
});
