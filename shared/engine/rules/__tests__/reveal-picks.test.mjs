// Design 059: the printed-reveal rule and the art stamp on public reveals. Wordings are corpus
// rows (out/pkmn-trainer-cards.json, out/pkmn-pokemon-cards.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  effectTextFor,
  stampRevealedArt,
  stepRevealsPicks,
  textRevealsPicks,
} from '../reveal-picks.mjs';

// Ultra Ball (30th Celebration 128).
const ULTRA_BALL =
  'You can use this card only if you discard 2 other cards from your hand. Search your deck for a Pokémon, reveal it, and put it into your hand. Then, shuffle your deck.';
// Cassiopeia (Shrouded Fable 094).
const CASSIOPEIA =
  'You can use this card only when it is the last card in your hand. Search your deck for up to 2 cards and put them into your hand. Then, shuffle your deck.';
// Pokémon Collector (HeartGold & SoulSilver 97).
const POKEMON_COLLECTOR =
  'Search your deck for up to 3 Basic Pokémon, show them to your opponent, and put them into your hand. Shuffle your deck afterward.';
// Pidgeot ex Quick Search (Paldean Fates 221).
const QUICK_SEARCH =
  "Once during your turn, you may search your deck for a card and put it into your hand. Then, shuffle your deck. You can't use more than 1 Quick Search Ability each turn.";
// Aromatisse Scent Collection (Perfect Order 036).
const SCENT_COLLECTION =
  'Once during your turn, you may use this Ability. Search your deck for up to 2 Basic {P} Energy cards, reveal them, and put them into your hand. Then, shuffle your deck.';

test('textRevealsPicks: "reveal" and older "show … to your opponent" reveal; a plain search does not', () => {
  assert.equal(textRevealsPicks(ULTRA_BALL), true);
  assert.equal(textRevealsPicks(POKEMON_COLLECTOR), true);
  assert.equal(textRevealsPicks('Show both cards to his or her opponent.'), true);
  assert.equal(textRevealsPicks(CASSIOPEIA), false);
  assert.equal(textRevealsPicks(QUICK_SEARCH), false);
});

test('textRevealsPicks: missing or non-string text reveals nothing', () => {
  assert.equal(textRevealsPicks(''), false);
  assert.equal(textRevealsPicks(undefined), false);
  assert.equal(textRevealsPicks(null), false);
  assert.equal(textRevealsPicks({ text: ULTRA_BALL }), false);
});

test('effectTextFor: a Trainer or Stadium reads its own card text', () => {
  assert.equal(effectTextFor({ effectType: 'trainer', sourceCard: { text: ULTRA_BALL } }), ULTRA_BALL);
  assert.equal(effectTextFor({ effectType: 'stadium', sourceCard: { effect: 'Stadium text' } }), 'Stadium text');
  assert.equal(effectTextFor({ effectType: 'trainer', sourceCard: { cardText: 'Card text' } }), 'Card text');
  assert.equal(effectTextFor({ effectType: 'trainer', sourceCard: null }), '');
  assert.equal(effectTextFor(), '');
});

test('effectTextFor: an Ability reads the threaded text first, else the Pokémon\'s Ability texts', () => {
  const pidgeot = {
    text: 'Blustery Wind: reveal nothing here',
    abilities: [{ name: 'Quick Search', text: QUICK_SEARCH }],
  };
  assert.equal(effectTextFor({ effectType: 'ability', sourceCard: pidgeot }), QUICK_SEARCH);
  assert.equal(
    effectTextFor({ effectType: 'ability', sourceCard: pidgeot, context: { effectText: SCENT_COLLECTION } }),
    SCENT_COLLECTION
  );
  assert.equal(effectTextFor({ effectType: 'ability', sourceCard: { abilities: ['Ability text'] } }), 'Ability text');
  assert.equal(effectTextFor({ effectType: 'ability', sourceCard: { text: 'Only card text' } }), 'Only card text');
});

test('stepRevealsPicks: the parser\'s own boolean wins over the effect text', () => {
  assert.equal(stepRevealsPicks({ type: 'searchAbility', reveal: false }, ULTRA_BALL), false);
  assert.equal(stepRevealsPicks({ type: 'searchAbility', reveal: true }, CASSIOPEIA), true);
  assert.equal(stepRevealsPicks({ type: 'searchDeck' }, ULTRA_BALL), true);
  assert.equal(stepRevealsPicks({ type: 'searchDeck' }, CASSIOPEIA), false);
  assert.equal(stepRevealsPicks(null, ULTRA_BALL), true);
});

test('stampRevealedArt: public reveals get each card\'s art; peeks and one-player reveals do not', () => {
  const art = { 31: 'https://img/31.png', 32: 'https://img/32.png' };
  const events = [
    { type: 'cardsRevealed', playerId: 'p1', cards: [{ instanceId: 31, name: 'Raichu' }] },
    { type: 'cardsRevealed', playerId: 'p1', peek: true, cards: [{ instanceId: 32, name: 'Peeked' }] },
    { type: 'cardsRevealed', playerId: 'p2', revealedTo: 'p1', cards: [{ instanceId: 32, name: 'Seen' }] },
    { type: 'cardMoved', instanceId: 31, from: 'deck', to: 'hand', playerId: 'p1' },
  ];
  stampRevealedArt(events, (id) => art[id]);
  assert.deepEqual(events[0].cards, [{ instanceId: 31, name: 'Raichu', src: 'https://img/31.png' }]);
  assert.deepEqual(events[1].cards, [{ instanceId: 32, name: 'Peeked' }]);
  assert.deepEqual(events[2].cards, [{ instanceId: 32, name: 'Seen' }]);
  assert.equal(events[3].src, undefined);
});

test('stampRevealedArt: unknown cards, existing art and malformed entries are left alone', () => {
  const events = [
    {
      type: 'cardsRevealed',
      playerId: 'p1',
      cards: [{ instanceId: 99, name: 'Gone' }, { instanceId: 31, src: 'kept.png' }, null, 7, { name: 'No id' }],
    },
    { type: 'cardsRevealed', playerId: 'p1', cards: 'not-a-list' },
  ];
  stampRevealedArt(events, (id) => (id === 31 ? 'other.png' : null));
  assert.deepEqual(events[0].cards, [{ instanceId: 99, name: 'Gone' }, { instanceId: 31, src: 'kept.png' }, null, 7, { name: 'No id' }]);
  assert.equal(events[1].cards, 'not-a-list');
  assert.doesNotThrow(() => stampRevealedArt(null, () => 'x'));
  assert.doesNotThrow(() => stampRevealedArt(events, null));
});
