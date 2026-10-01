// Design 062 § B: WotC "Discard … in order to …" Trainer costs, Super Potion's heal on the
// cost's host, Super Energy Removal's 2 Energy, and Impostor Oak's shuffle-in.
// Card text: TCGdex `effect` strings (out/tcgdex-wotc-trainers.json), id cited per constant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseTrainerEffect } from '../rules/trainer-effects.mjs';

// TCGdex base1-71
const COMPUTER_SEARCH =
  'Discard 2 of the other cards from your hand in order to search your deck for any card and put it into your hand. Shuffle your deck afterward.';
// TCGdex base1-73
const IMPOSTOR_OAK = 'Your opponent shuffles his or her hand into his or her deck, then draws 7 cards.';
// TCGdex base1-74
const ITEM_FINDER = 'Discard 2 of the other cards from your hand in order to put a Trainer card from your discard pile into your hand.';
// TCGdex base1-79
const SUPER_ENERGY_REMOVAL =
  "Discard 1 Energy card attached to 1 of your Pokémon in order to choose 1 of your opponent's Pokémon and up to 2 Energy cards attached to it. Discard those Energy cards.";
// TCGdex base1-90
const SUPER_POTION =
  'Discard 1 Energy card attached to your own Pokémon in order to remove up to 4 damage counters from that Pokémon.';
// TCGdex base5-76
const IMPOSTER_OAKS_REVENGE =
  'Discard a card from your hand in order to play this card. Your opponent shuffles his or her hand into his or her deck, then draws 4 cards.';
// TCGdex gym2-117
const MAX_REVIVE =
  "Discard 2 Energy cards from your hand in order to put 1 Basic Pokémon from your discard pile onto your Bench. (You can't play Max Revive if your Bench is full.)";
// TCGdex gym2-118
const MISTYS_TEARS =
  'Discard 1 of the other cards in your hand in order to search your deck for up to 2 Water Energy cards. Show those cards to your opponent, then put them into your hand. Shuffle your deck afterward.';
// Special Red Card (modern "bottom of their deck" wording) must keep its unshuffled path.
const SPECIAL_RED_CARD =
  'You can use this card only if your opponent has 3 or fewer Prize cards remaining. Your opponent shuffles their hand and puts it on the bottom of their deck. If they put any cards on the bottom of their deck in this way, they draw 3 cards.';

const steps = (text) => parseTrainerEffect(text).steps;

test('parse: WotC hand-discard costs come first', () => {
  const cs = steps(COMPUTER_SEARCH);
  assert.deepEqual(cs[0], { type: 'discardCost', count: 2 });
  assert.equal(cs[1].type, 'searchDeck');
  assert.deepEqual(steps(ITEM_FINDER)[0], { type: 'discardCost', count: 2 });
  assert.deepEqual(steps(MAX_REVIVE)[0], { type: 'discardCost', count: 2, energyOnly: true });
  assert.deepEqual(steps(MISTYS_TEARS)[0], { type: 'discardCost', count: 1 });
  assert.deepEqual(steps(IMPOSTER_OAKS_REVENGE), [
    { type: 'discardCost', count: 1 },
    { type: 'opponentShuffleHandDraw', count: 4, prizeCondition: null, shuffle: true },
  ]);
});

test('parse: own-Energy costs, Super Potion 40 HP on the cost host, Impostor Oak shuffles', () => {
  assert.deepEqual(steps(SUPER_ENERGY_REMOVAL), [
    { type: 'discardOwnAttachedEnergy', cost: true },
    { type: 'discardEnergyFromOpponent', energy: 'any Energy', count: 2, upTo: true, scope: '1 Pokémon' },
  ]);
  assert.deepEqual(steps(SUPER_POTION), [
    { type: 'discardOwnAttachedEnergy', cost: true },
    { type: 'healAmount', amount: 40, target: 'costHost' },
  ]);
  assert.deepEqual(steps(IMPOSTOR_OAK), [{ type: 'opponentShuffleHandDraw', count: 7, prizeCondition: null, shuffle: true }]);
  const red = steps(SPECIAL_RED_CARD);
  assert.equal(red[0].type, 'opponentShuffleHandDraw');
  assert.equal(red[0].shuffle, undefined);
});

let nextId = 500;
const card = (props) => createCard({ instanceId: nextId++, ...props });
const pokemon = (name, props = {}) => card({ name, supertype: 'Pokémon', hp: 100, stage: 'Basic', ...props });
const energy = (name = 'Water Energy') => card({ name, type: 'Energy', subtypes: ['Basic'], types: ['Water'] });
const filler = (name) => card({ name, type: 'Trainer', trainerType: 'Item' });

function setup() {
  const state = createGameState({ gameId: 'wotc-costs', seed: 7, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: { abilitiesUsed: {}, supporterPlayed: false } };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(card({ name: `${id} Prize ${i}` }));
    for (let i = 0; i < 20; i++) state.players[id].zones.deck.push(filler(`${id} Deck ${i}`));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  state.players.p1.zones.active.push(pokemon('Squirtle'));
  state.players.p2.zones.active.push(pokemon('Charmander'));
  return { state, rng: createRng(7), p1: state.players.p1, p2: state.players.p2 };
}

function play(game, name, text) {
  const trainer = card({ name, type: 'Trainer', trainerType: 'Item', text });
  game.p1.zones.hand.push(trainer);
  return applyCommand(game.state, { type: 'moveCard', payload: { instanceId: trainer.instanceId, from: 'hand', to: 'board' }, playerId: 'p1' }, game.rng);
}

function resolve(game, res, selection) {
  assert.ok(res.pendingChoice, 'expected a pending choice');
  return applyCommand(res.state, {
    type: 'resolveChoice',
    payload: { choiceId: res.pendingChoice.choiceId, selection },
    playerId: res.pendingChoice.player,
  }, game.rng);
}

const zone = (res, player, zoneId) => res.state.players[player].zones[zoneId];
const ids = (cards) => cards.map((c) => c.instanceId);

test('Super Potion: discards the own Energy, heals 40 from that Pokémon', () => {
  const game = setup();
  const squirtle = game.p1.zones.active[0];
  squirtle.damage = 50;
  const other = pokemon('Staryu', { damage: 30 });
  const e = energy();
  e.attachedTo = squirtle.instanceId;
  game.p1.zones.active.push(e);
  game.p1.zones.bench.push(other);
  const res = play(game, 'Super Potion', SUPER_POTION);
  assert.equal(res.error, null);
  assert.deepEqual(ids(res.pendingChoice.options), [e.instanceId]);
  const done = resolve(game, res, [e.instanceId]);
  assert.ok(zone(done, 'p1', 'discard').some((c) => c.instanceId === e.instanceId));
  assert.equal(zone(done, 'p1', 'active').find((c) => c.instanceId === squirtle.instanceId).damage, 10);
  assert.equal(zone(done, 'p1', 'bench').find((c) => c.instanceId === other.instanceId).damage, 30);
  assert.equal(done.pendingChoice, null);
});

test('Super Potion on an undamaged host: Energy discarded, heal skipped', () => {
  const game = setup();
  const squirtle = game.p1.zones.active[0];
  const e = energy();
  e.attachedTo = squirtle.instanceId;
  game.p1.zones.active.push(e);
  game.p1.zones.bench.push(pokemon('Staryu', { damage: 30 }));
  const done = resolve(game, play(game, 'Super Potion', SUPER_POTION), [e.instanceId]);
  assert.ok(zone(done, 'p1', 'discard').some((c) => c.instanceId === e.instanceId));
  assert.ok(done.events.some((ev) => ev.type === 'effectStepSkipped' && ev.reason === 'no_damaged_pokemon'));
  assert.equal(zone(done, 'p1', 'bench')[0].damage, 30);
});

test('Super Energy Removal: own Energy cost, then 2 of 3 Energy on one opponent Pokémon', () => {
  const game = setup();
  const own = energy();
  own.attachedTo = game.p1.zones.active[0].instanceId;
  game.p1.zones.active.push(own);
  const host = game.p2.zones.active[0];
  const opp = [energy('Fire Energy'), energy('Fire Energy'), energy('Fire Energy')];
  for (const e of opp) e.attachedTo = host.instanceId;
  game.p2.zones.active.push(...opp);
  const r1 = play(game, 'Super Energy Removal', SUPER_ENERGY_REMOVAL);
  const r2 = resolve(game, r1, [own.instanceId]);
  assert.deepEqual(ids(r2.pendingChoice.options), [host.instanceId]);
  const r3 = resolve(game, r2, [host.instanceId]);
  assert.equal(r3.pendingChoice.max, 2);
  assert.equal(r3.pendingChoice.min, 1);
  const done = resolve(game, r3, [opp[0].instanceId, opp[1].instanceId]);
  const discard = ids(zone(done, 'p2', 'discard'));
  assert.ok(discard.includes(opp[0].instanceId) && discard.includes(opp[1].instanceId));
  assert.ok(!discard.includes(opp[2].instanceId));
});

test('Super Energy Removal: host with 1 Energy offers max 1; no own Energy refuses the play', () => {
  const game = setup();
  const own = energy();
  own.attachedTo = game.p1.zones.active[0].instanceId;
  game.p1.zones.active.push(own);
  const lone = energy('Fire Energy');
  lone.attachedTo = game.p2.zones.active[0].instanceId;
  game.p2.zones.active.push(lone);
  const r2 = resolve(game, play(game, 'Super Energy Removal', SUPER_ENERGY_REMOVAL), [own.instanceId]);
  const r3 = resolve(game, r2, [game.p2.zones.active[0].instanceId]);
  assert.equal(r3.pendingChoice.max, 1);

  const broke = setup();
  const target = energy('Fire Energy');
  target.attachedTo = broke.p2.zones.active[0].instanceId;
  broke.p2.zones.active.push(target);
  const res = play(broke, 'Super Energy Removal', SUPER_ENERGY_REMOVAL);
  assert.match(String(res.error), /No Energy attached to your Pokémon/);
  assert.equal(res.pendingChoice, null);
  assert.ok(zone(res, 'p2', 'active').some((c) => c.instanceId === target.instanceId));
});

test('Impostor Professor Oak vs an empty hand: opponent still draws 7', () => {
  const game = setup();
  const res = play(game, 'Impostor Professor Oak', IMPOSTOR_OAK);
  assert.equal(res.error, null);
  assert.equal(zone(res, 'p2', 'hand').length, 7);
  assert.equal(zone(res, 'p2', 'deck').length, 13);
});

test('Impostor Professor Oak vs a hand of 3: shuffled in, then 7 drawn', () => {
  const game = setup();
  game.p2.zones.hand.push(filler('A'), filler('B'), filler('C'));
  const res = play(game, 'Impostor Professor Oak', IMPOSTOR_OAK);
  const moved = res.events.find((e) => e.type === 'cardsShuffledIntoDeck');
  assert.equal(moved?.count, 3);
  assert.ok(res.events.some((e) => e.type === 'deckShuffled' && e.playerId === 'p2'));
  assert.ok(!res.events.some((e) => e.type === 'cardsMovedToDeckBottom'));
  assert.equal(zone(res, 'p2', 'hand').length, 7);
  assert.equal(zone(res, 'p2', 'deck').length, 16);
});

test('Computer Search with only 1 other card: the cost is unpayable, no search happens', () => {
  const game = setup();
  game.p1.zones.hand.push(filler('Lonely'));
  const deckBefore = game.p1.zones.deck.length;
  const res = play(game, 'Computer Search', COMPUTER_SEARCH);
  // The play gate (trainer-play-conditions.mjs) sees the leading discardCost and refuses the play.
  assert.match(String(res.error), /discard cost/);
  assert.equal(res.pendingChoice ?? null, null);
  assert.equal(game.p1.zones.deck.length, deckBefore);
  assert.ok(game.p1.zones.hand.some((c) => c.name === 'Lonely'));
});

test('Computer Search with 2 other cards: the cost is payable, then the search opens', () => {
  const game = setup();
  const a = filler('A');
  const b = filler('B');
  game.p1.zones.hand.push(a, b);
  const res = play(game, 'Computer Search', COMPUTER_SEARCH);
  assert.deepEqual(ids(res.pendingChoice.options).sort(), [a.instanceId, b.instanceId].sort());
  const r2 = resolve(game, res, [a.instanceId, b.instanceId]);
  assert.ok(r2.pendingChoice, 'search choice opens after the cost');
  assert.ok(zone(r2, 'p1', 'discard').some((c) => c.instanceId === a.instanceId));
});
