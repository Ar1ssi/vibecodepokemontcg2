import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardMarkersOf, hasCardMarker } from '../card-markers.mjs';
import { matchesSearch } from '../search-match.mjs';
import { isTeraCard } from '../card-classify.mjs';
import { parseTrainerEffect, describeStep } from '../trainer-effects.mjs';
import { createGameState, createPlayerZones } from '../../state.mjs';
import { createCard } from '../../cards.mjs';
import { executeTrainer } from '../../effects/trainer.mjs';

// I220: marker-filtered Trainer searches. Card texts are rows of out/pkmn-trainer-cards.json;
// the marked printings are rows of the generated table (pkmncards is:/stage: searches).
const TEXTS = {
  // Surging Sparks 189
  teraOrb: 'Search your deck for a Tera Pokémon, reveal it, and put it into your hand. Then, shuffle your deck.',
  // Celestial Storm 131
  friendBall:
    'Search your deck for a Pokémon with the same type as 1 of your opponent’s Pokémon in play, reveal it, and put it into your hand. Then, shuffle your deck.',
  // Skyridge 126
  friendBallSkyridge:
    'Choose 1 of your opponent’s Pokémon. Search your deck for a Baby Pokémon, Basic Pokémon, or Evolution card of the same type (color), show it to your opponent, and put it into your hand. Shuffle your deck afterward.',
  // Cosmic Eclipse 206
  tagCall: 'Search your deck for up to 2 TAG TEAM cards, reveal them, and put them into your hand. Then, shuffle your deck.',
  // Celestial Storm 137
  lisia: 'Search your deck for up to 2 {*} (Prism Star) cards, reveal them, and put them into your hand. Then, shuffle your deck.',
  // Aquapolis 137
  travelingSalesman:
    'Search your deck for up to 2 Technical Machine and/or Pokémon Tool cards, show them to your opponent, and then put them into your hand. Shuffle your deck afterward.',
  // Expedition 139
  dualBallExp:
    'Flip 2 coins. For each heads, search your deck for a Basic Pokémon card other than a Baby Pokémon card, show it to your opponent, and put it into your hand. Shuffle your deck afterward.',
  // Unleashed 72
  dualBall:
    'Flip 2 coins. For each heads, search your deck for a Basic Pokémon, show it to your opponent, and put it into your hand. If you do, shuffle your deck afterward.',
  // Chilling Reign 212
  brawly: 'Search your deck for up to 3 Basic Rapid Strike Pokémon and put them onto your Bench. Then, shuffle your deck.',
  // Emerald 77
  lanette:
    'Search your deck for up to 3 different types of Basic Pokémon cards (excluding Baby Pokémon), show them to your opponent, and put them into your hand. Shuffle your deck afterward.',
};

const mon = (instanceId, name, extra = {}) => ({
  instanceId, name, supertype: 'Pokémon', type: 'Pokémon', stage: 'Basic', types: ['Colorless'], ...extra,
});
// Printings from the table: sv07-128 Terapagos ex (Tera), neo1-12 Pichu (Baby), sm7-107 Jirachi ◇.
const terapagos = (id = 1) => mon(id, 'Terapagos ex', { tcgId: 'sv07-128' });
const pichu = (id = 2) => mon(id, 'Pichu', { set: 'neo1', number: '12', types: ['Lightning'] });

test('cardMarkersOf reads the table by id, image URL or set + number, and subtypes first', () => {
  assert.deepEqual(cardMarkersOf({ id: 'sv07-128' }), ['Tera']);
  assert.deepEqual(cardMarkersOf({ image: 'https://assets.tcgdex.net/en/sm/sm7/107' }), ['Prism Star']);
  assert.deepEqual(cardMarkersOf({ set: 'neo1', number: '12' }), ['Baby']);
  assert.deepEqual(cardMarkersOf({ tcgId: 'swsh9tg-TG18' }), ['Single Strike']);
  assert.deepEqual(cardMarkersOf({ subtypes: ['Rapid Strike'] }), ['Rapid Strike']);
  assert.deepEqual(cardMarkersOf({ id: 'sv07-127' }), []);
  assert.deepEqual(cardMarkersOf(null), []);
  assert.equal(hasCardMarker({ id: 'sm12-229' }, 'TAG TEAM'), true, 'Guzma & Hala is a TAG TEAM Supporter');
});

test('isTeraCard reads the table: TCGdex data carries no Tera field', () => {
  assert.equal(isTeraCard(terapagos()), true);
  assert.equal(isTeraCard(mon(3, 'Pikachu ex', { tcgId: 'sv08-057' })), true);
  assert.equal(isTeraCard(mon(4, 'Cyclizar', { tcgId: 'sv07-127' })), false);
});

test('matchesSearch narrows each marker kind to its marked cards', () => {
  const plain = mon(9, 'Pikachu', { types: ['Lightning'] });
  const cases = [
    ['Tera Pokémon', terapagos(), plain],
    ['Baby Pokémon', pichu(), plain],
    ['Prism Star card', { name: 'Jirachi ◇', supertype: 'Pokémon', tcgId: 'sm7-107' }, plain],
    ['TAG TEAM card', { name: 'Guzma & Hala', supertype: 'Trainer', trainerType: 'Supporter', tcgId: 'sm12-229' }, plain],
    ['TAG TEAM card', mon(5, 'Pikachu & Zekrom GX'), plain],
    ['Single Strike Supporter', { name: 'Single Strike Style Mustard', supertype: 'Trainer', trainerType: 'Supporter', subtypes: ['Single Strike'] }, { name: 'Marnie', supertype: 'Trainer', trainerType: 'Supporter' }],
    ['Basic Rapid Strike Pokémon', mon(6, 'Octillery', { subtypes: ['Rapid Strike'] }), plain],
    ['Team Plasma Pokémon', mon(7, 'Thundurus-EX', { subtypes: ['Team Plasma'] }), plain],
    ['Technical Machine or Pokémon Tool', { name: 'Technical Machine: Evolution', supertype: 'Trainer', trainerType: 'Tool' }, plain],
    ['Team Magma Pokémon', mon(8, 'Team Magma’s Groudon'), plain],
    ["Basic Hop's Pokémon", mon(10, 'Hop’s Wooloo'), plain],
    ["Basic Team Rocket's Pokémon", mon(11, 'Team Rocket’s Mewtwo'), mon(12, "Hop's Mewtwo")],
  ];
  for (const [what, yes, no] of cases) {
    assert.equal(matchesSearch(yes, what), true, `${what} matches ${yes.name}`);
    assert.equal(matchesSearch(no, what), false, `${what} rejects ${no.name}`);
  }
  // The marker does not waive the rest of the kind.
  assert.equal(matchesSearch({ ...terapagos(), stage: 'Stage 1' }, 'Basic Tera Pokémon'), false);
  assert.equal(matchesSearch({ name: 'Tera Orb', supertype: 'Trainer', subtypes: ['Tera'] }, 'Tera Pokémon'), false);
  assert.equal(matchesSearch(mon(13, 'Pokémon Tool'), 'Technical Machine'), false);
});

test('parser keeps the marker in each search kind', () => {
  const first = (key) => parseTrainerEffect(TEXTS[key]).steps[0];
  assert.equal(first('teraOrb').what, 'Tera Pokémon');
  assert.equal(first('tagCall').what, 'TAG TEAM card');
  assert.equal(first('lisia').what, 'Prism Star card');
  assert.equal(first('travelingSalesman').what, 'Technical Machine or Pokémon Tool');
  assert.equal(first('brawly').what, 'Basic Rapid Strike Pokémon');
  assert.equal(first('brawly').destination, 'bench');
  for (const key of ['friendBall', 'friendBallSkyridge']) {
    assert.deepEqual([first(key).what, first(key).sameTypeAsOpponent], ['Pokémon', true], key);
    assert.match(describeStep(first(key)), /same type as 1 of your opponent/);
  }
  assert.deepEqual(
    [first('lanette').what, first('lanette').exclude, first('lanette').distinctTypes],
    ['Basic Pokémon', 'Baby Pokémon', true]
  );
});

test('Dual Ball: two coins, one search per heads; EXP 139 excludes Baby Pokémon', () => {
  const flip = parseTrainerEffect(TEXTS.dualBallExp).steps[0];
  assert.equal(flip.type, 'coinFlip');
  assert.equal(flip.count, 2);
  assert.deepEqual(
    flip.outcomes.map((o) => [o.headsExactly, o.steps[0].what, o.steps[0].count, o.steps[0].exclude]),
    [
      [1, 'Basic Pokémon', 1, 'Baby Pokémon'],
      [2, 'Basic Pokémon', 2, 'Baby Pokémon'],
    ]
  );
  assert.equal(parseTrainerEffect(TEXTS.dualBall).steps[0].outcomes[1].steps[0].exclude, undefined);
});

function setup(text, { deck = [], opponentInPlay = [] } = {}) {
  const state = createGameState({ gameId: 'markers', seed: 1, rulesEnabled: true });
  state.players.p1 = { playerId: 'p1', username: 'A', zones: createPlayerZones(), flags: {} };
  state.players.p2 = { playerId: 'p2', username: 'B', zones: createPlayerZones(), flags: {} };
  state.turn = { player: 'p1', number: 4, phase: 'main' };
  const card = createCard({ instanceId: 900, name: 'Test Card', supertype: 'Trainer', type: 'Item', text });
  state.players.p1.zones.hand.push(card);
  state.players.p1.zones.deck.push(...deck.map((c) => createCard(c)));
  const [active, ...bench] = opponentInPlay.map((c) => createCard(c));
  if (active) state.players.p2.zones.active.push(active);
  state.players.p2.zones.bench.push(...bench);
  return { state, card };
}

const allHeads = { next: () => 0.1, shuffle: (cards) => cards };
const allTails = { next: () => 0.9, shuffle: (cards) => cards };

test('Dual Ball EXP 139 on two heads offers Basic Pokémon but no Baby Pokémon', () => {
  const { state, card } = setup(TEXTS.dualBallExp, { deck: [pichu(2), mon(3, 'Magnemite', { types: ['Lightning'] }), mon(4, 'Onix')] });
  const res = executeTrainer(state, { card, playerId: 'p1', activeRng: allHeads, events: [] });
  assert.ok(res.pendingChoice);
  assert.equal(res.pendingChoice.max, 2);
  assert.deepEqual(res.pendingChoice.options.map((c) => c.name).sort(), ['Magnemite', 'Onix']);
});

test('Dual Ball on two tails searches nothing', () => {
  const { state, card } = setup(TEXTS.dualBall, { deck: [mon(3, 'Magnemite')] });
  const res = executeTrainer(state, { card, playerId: 'p1', activeRng: allTails, events: [] });
  assert.equal(res.pendingChoice, null);
  assert.deepEqual(state.players.p1.zones.deck.map((c) => c.name), ['Magnemite']);
});

test('Friend Ball offers only Pokémon sharing a type with an opponent’s Pokémon in play', () => {
  for (const key of ['friendBall', 'friendBallSkyridge']) {
    const { state, card } = setup(TEXTS[key], {
      deck: [mon(3, 'Squirtle', { types: ['Water'] }), mon(4, 'Charmander', { types: ['Fire'] }), mon(5, 'Pikachu', { types: ['Lightning'] })],
      opponentInPlay: [mon(20, 'Psyduck', { types: ['Water'] }), mon(21, 'Voltorb', { types: ['Lightning'] })],
    });
    const res = executeTrainer(state, { card, playerId: 'p1', activeRng: allTails, events: [] });
    assert.deepEqual(res.pendingChoice.options.map((c) => c.name).sort(), ['Pikachu', 'Squirtle'], key);
  }
});

test('Tera Orb offers only the Tera printing', () => {
  const { state, card } = setup(TEXTS.teraOrb, { deck: [terapagos(3), mon(4, 'Cyclizar', { tcgId: 'sv07-127' })] });
  const res = executeTrainer(state, { card, playerId: 'p1', activeRng: allTails, events: [] });
  // One match: the picker still asks (reveal search), and offers Terapagos ex alone.
  const offered = res.pendingChoice ? res.pendingChoice.options.map((c) => c.name) : state.players.p1.zones.hand.map((c) => c.name);
  assert.deepEqual(offered.filter((n) => n !== 'Test Card'), ['Terapagos ex']);
});

test('owner kinds need the whole owner: Rocket’s Zapdos ex is not a Team Rocket’s Pokémon', () => {
  const kind = "Basic Team Rocket's Pokémon";
  assert.equal(matchesSearch(mon(20, 'Rocket’s Zapdos ex'), kind), false);
  assert.equal(matchesSearch(mon(21, 'Team Rocket’s Mewtwo ex'), kind), true);
  assert.equal(matchesSearch(mon(22, 'Team Rocket’s Mewtwo ex', { stage: 'Stage 1' }), kind), false, 'the Basic word still applies');
  assert.equal(matchesSearch(mon(23, 'Team Rocket’s Mewtwo ex', { stage: 'Stage 1' }), "Evolution Team Rocket's Pokémon"), true);
});
