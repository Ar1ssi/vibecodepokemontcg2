import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../../../../../../../shared/engine/rng.mjs';
import { getBuildBattleBox } from '../box-catalog.mjs';
import { BUILD_BATTLE_DECKS, BUILD_BATTLE_SET_CARDS } from '../build-battle.generated.mjs';
import { openBox, poolFromBox } from '../pack-opening.mjs';
import { validatePoolDeck } from '../build-battle-session.mjs';
import { validateDeck } from '../../deck-validation.mjs';
import { addCard } from '../../deck-state.mjs';
import {
  boxHeadline,
  buildBattleDeckName,
  deckFromRows,
  poolRefusalMessage,
  poolRemaining,
  withPoolErrors,
} from '../build-battle-view.mjs';

const box = getBuildBattleBox('phantasmal-flames');
const decks = BUILD_BATTLE_DECKS['phantasmal-flames'];
const setCards = BUILD_BATTLE_SET_CARDS.me02;
const opened = { deckKey: 'ceruledge', packs: openBox({ box, cards: setCards, rng: createRng(42) }).packs };
const pool = poolFromBox({ box, decks, cards: setCards, opened });
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

test('the library name and headline name the deck and the seed', () => {
  assert.equal(buildBattleDeckName('Ceruledge', 42), 'B&B Ceruledge #42');
  assert.equal(
    boxHeadline(box, box.decks[0], 42),
    'Phantasmal Flames Build & Battle Box · Ceruledge deck · Box #42'
  );
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
