// Server-side execution of every trainer-effect step kind executor.mjs delegates to
// effects/trainer-steps.mjs (I35), driven through applyCommand the way a live game drives it:
// a hand -> board moveCard, then one resolveChoice per PendingChoice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { viewFor } from '../view.mjs';
import { parseTrainerEffect } from '../rules/trainer-effects.mjs';
import { BARGAIN_NO, BARGAIN_YES } from '../effects/trainer-steps.mjs';

let nextId = 100;
const card = (props) => createCard({ instanceId: nextId++, ...props });
const pokemon = (name, props = {}) => card({ name, supertype: 'Pokémon', hp: 100, stage: 'Basic', ...props });
const energy = (name = 'Basic Psychic Energy', props = {}) =>
  card({ name, type: 'Energy', subtypes: ['Basic'], types: ['Psychic'], ...props });
const special = (name = 'Jet Energy') => card({ name, type: 'Energy', subtypes: ['Special'] });
const tool = (name = 'Air Balloon') => card({ name, type: 'Trainer', trainerType: 'Tool' });

function setup() {
  const state = createGameState({ gameId: 'steps', seed: 7, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = {
      playerId: id,
      username: id,
      zones: createPlayerZones(),
      flags: { abilitiesUsed: {}, supporterPlayed: false },
    };
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const p1 = state.players.p1;
  const p2 = state.players.p2;
  p1.zones.active.push(pokemon('Ralts'));
  p2.zones.active.push(pokemon('Riolu'));
  for (let i = 0; i < 6; i++) {
    p1.zones.prizes.push(card({ name: `P1 Prize ${i}` }));
    p2.zones.prizes.push(card({ name: `P2 Prize ${i}` }));
  }
  return { state, rng: createRng(7), p1, p2 };
}

function play(game, text, props = {}) {
  const trainer = card({ name: props.name || 'Test Trainer', type: 'Trainer', trainerType: 'Item', text, ...props });
  game.state.players.p1.zones.hand.push(trainer);
  const res = applyCommand(game.state, {
    type: 'moveCard',
    payload: { instanceId: trainer.instanceId, from: 'hand', to: 'board' },
    playerId: 'p1',
  }, game.rng);
  return { res, trainer };
}

function resolve(game, res, selection) {
  assert.ok(res.pendingChoice, 'expected a pending choice');
  return applyCommand(res.state, {
    type: 'resolveChoice',
    payload: { choiceId: res.pendingChoice.choiceId, selection },
    playerId: res.pendingChoice.player,
  }, game.rng);
}

const ids = (cards) => cards.map((c) => c.instanceId);
const zone = (res, player, zoneId) => res.state.players[player].zones[zoneId];

test('Escape Rope: the initiator switches first, then the opponent picks their own new Active', () => {
  const game = setup();
  game.p1.zones.bench.push(pokemon('P1 Bench A'), pokemon('P1 Bench B'));
  game.p2.zones.bench.push(pokemon('P2 Bench A'), pokemon('P2 Bench B'));
  const p1Active = game.p1.zones.active[0].instanceId;
  const p2Active = game.p2.zones.active[0].instanceId;

  const { res } = play(
    game,
    'Each player switches their Active Pokémon with 1 of their Benched Pokémon. (The player who plays this card switches first.)'
  );
  assert.equal(res.error, null);

  // Step 1: the player who played the card chooses their own new Active.
  const first = res.pendingChoice;
  assert.ok(first, 'initiator choice expected');
  assert.equal(first.player, 'p1');
  assert.equal(first.min, 1);
  assert.equal(first.max, 1);
  assert.deepEqual(ids(first.options), ids(game.p1.zones.bench));
  const p1Pick = first.options[1].instanceId;
  const afterFirst = resolve(game, res, [p1Pick]);
  assert.equal(afterFirst.error, null);
  assert.equal(afterFirst.state.players.p1.zones.active[0].instanceId, p1Pick);
  assert.ok(
    afterFirst.state.players.p1.zones.bench.some((c) => c.instanceId === p1Active),
    'the old p1 Active is benched'
  );

  // Step 2: the opponent then chooses THEIR own new Active.
  const second = afterFirst.pendingChoice;
  assert.ok(second, 'opponent choice expected');
  assert.equal(second.player, 'p2');
  assert.deepEqual(ids(second.options), ids(game.p2.zones.bench));
  const p2Pick = second.options[1].instanceId;
  const afterSecond = resolve(game, afterFirst, [p2Pick]);
  assert.equal(afterSecond.error, null);
  assert.equal(afterSecond.pendingChoice, null);
  assert.equal(afterSecond.state.players.p2.zones.active[0].instanceId, p2Pick);
  assert.ok(
    afterSecond.state.players.p2.zones.bench.some((c) => c.instanceId === p2Active),
    'the old p2 Active is benched'
  );
});

test('opponentDraw (Archer): you draw 5, your opponent draws 3', () => {
  const game = setup();
  for (const p of [game.p1, game.p2]) {
    for (let i = 0; i < 8; i++) p.zones.deck.push(card({ name: `d${i}` }));
  }
  const { res } = play(game, 'Each player shuffles their hand into their deck. Then, you draw 5 cards, and your opponent draws 3 cards.', { trainerType: 'Supporter' });
  assert.equal(res.error, null);
  assert.equal(zone(res, 'p1', 'hand').length, 5);
  assert.equal(zone(res, 'p2', 'hand').length, 3);
});

test('putHandOnBottom (Kofu): chosen cards go to the deck bottom, then draw', () => {
  const game = setup();
  const [a, b, c] = [card({ name: 'a' }), card({ name: 'b' }), card({ name: 'c' })];
  game.p1.zones.hand.push(a, b, c);
  const deckCards = [card({ name: 'd1' }), card({ name: 'd2' }), card({ name: 'd3' }), card({ name: 'd4' })];
  game.p1.zones.deck.push(...deckCards);
  const { res } = play(game, 'Put 2 cards from your hand on the bottom of your deck in any order. If you put 2 cards on the bottom of your deck in this way, draw 4 cards.');
  assert.equal(res.pendingChoice.min, 2);
  const done = resolve(game, res, [a.instanceId, b.instanceId]);
  assert.deepEqual(ids(zone(done, 'p1', 'hand')).sort(), [c.instanceId, ...ids(deckCards)].sort());
  assert.deepEqual(ids(zone(done, 'p1', 'deck')), [a.instanceId, b.instanceId]);
});

test('opponentShuffleHandDraw (Special Red Card): blocked above 3 opponent prizes, works at 3', () => {
  const text = 'You can use this card only if your opponent has 3 or fewer Prize cards remaining.\n\nYour opponent shuffles their hand and puts it on the bottom of their deck. If they put any cards on the bottom of their deck in this way, they draw 3 cards.';
  const blocked = setup();
  assert.match(play(blocked, text).res.error, /3 or fewer Prize cards/);

  const game = setup();
  game.p2.zones.prizes.splice(3);
  const hand = [card({ name: 'h1' }), card({ name: 'h2' })];
  game.p2.zones.hand.push(...hand);
  game.p2.zones.deck.push(card({ name: 'd1' }), card({ name: 'd2' }), card({ name: 'd3' }));
  const { res } = play(game, text);
  assert.equal(res.error, null);
  assert.equal(zone(res, 'p2', 'hand').length, 3);
  assert.deepEqual(ids(zone(res, 'p2', 'deck')).sort(), ids(hand).sort());
});

test('opponentCountShuffleDraw (Meddling Memo) and countShuffleDrawPlus (Brassius)', () => {
  const game = setup();
  game.p2.zones.hand.push(card({ name: 'h1' }), card({ name: 'h2' }));
  game.p2.zones.deck.push(card({ name: 'd1' }), card({ name: 'd2' }));
  const memo = play(game, 'Your opponent counts the cards in their hand, shuffles those cards, and puts them on the bottom of their deck. Then, they draw that many cards.').res;
  assert.equal(zone(memo, 'p2', 'hand').length, 2);
  assert.equal(zone(memo, 'p2', 'deck').length, 2);

  const game2 = setup();
  game2.p1.zones.hand.push(card({ name: 'h1' }), card({ name: 'h2' }));
  for (let i = 0; i < 5; i++) game2.p1.zones.deck.push(card({ name: `d${i}` }));
  const brassius = play(game2, 'Count the cards in your hand, shuffle those cards into your deck, and draw that many cards plus 1.').res;
  assert.equal(zone(brassius, 'p1', 'hand').length, 3);
});

test('millSelf (Hole-Digging Shovel) and reshufflePrizes (Redeemable Ticket)', () => {
  const game = setup();
  const top = [card({ name: 't1' }), card({ name: 't2' })];
  game.p1.zones.deck.push(...top, card({ name: 't3' }));
  const shovel = play(game, 'Discard the top 2 cards of your deck.').res;
  assert.deepEqual(ids(zone(shovel, 'p1', 'discard')).slice(0, 2), ids(top));

  const game2 = setup();
  for (let i = 0; i < 10; i++) game2.p1.zones.deck.push(card({ name: `d${i}` }));
  const ticket = play(game2, 'Count your Prize cards and shuffle them into your deck. Then, put that many cards from the top of your deck face down as your Prize cards.').res;
  assert.equal(zone(ticket, 'p1', 'prizes').length, 6);
  assert.equal(zone(ticket, 'p1', 'deck').length, 10);
});

test('variableDraw (Jett): one card per opponent Benched Pokémon', () => {
  const game = setup();
  game.p2.zones.bench.push(pokemon('a'), pokemon('b'));
  for (let i = 0; i < 5; i++) game.p1.zones.deck.push(card({ name: `d${i}` }));
  const res = play(game, "Draw a card for each of your opponent's Benched Pokémon.").res;
  assert.equal(zone(res, 'p1', 'hand').length, 2);
});

test('lookAtTop (Pokégear 3.0): only Supporters in the top 7 are offered; rest shuffled back', () => {
  const game = setup();
  const supporter = card({ name: 'Iono', type: 'Trainer', trainerType: 'Supporter' });
  game.p1.zones.deck.push(card({ name: 'x' }), supporter, card({ name: 'y' }));
  const { res } = play(game, 'Look at the top 7 cards of your deck. You may reveal a Supporter card you find there and put it into your hand. Shuffle the other cards back into your deck.');
  assert.deepEqual(ids(res.pendingChoice.options), [supporter.instanceId]);
  const done = resolve(game, res, [supporter.instanceId]);
  assert.deepEqual(ids(zone(done, 'p1', 'hand')), [supporter.instanceId]);
  assert.equal(zone(done, 'p1', 'deck').length, 2);
});

test('lookAtTop (Raifort): discard any number of the top 5', () => {
  const game = setup();
  const top = [card({ name: 'a' }), card({ name: 'b' }), card({ name: 'c' })];
  game.p1.zones.deck.push(...top);
  const { res } = play(game, 'Look at the top 5 cards of your deck and discard any number of them. Put the other cards back in any order.');
  assert.equal(res.pendingChoice.min, 0);
  const done = resolve(game, res, [top[1].instanceId]);
  assert.ok(zone(done, 'p1', 'discard').some((c) => c.instanceId === top[1].instanceId));
  assert.deepEqual(ids(zone(done, 'p1', 'deck')), [top[0].instanceId, top[2].instanceId]);
});

test("lookAtTop (Grimsley's Move): Darkness Basic to Bench, rest to the bottom", () => {
  const game = setup();
  const dark = pokemon('Zorua', { types: ['Darkness'] });
  const other = card({ name: 'x' });
  const below = card({ name: 'below-window' });
  game.p1.zones.deck.push(other, dark);
  for (let i = 0; i < 5; i++) game.p1.zones.deck.push(card({ name: `w${i}` }));
  game.p1.zones.deck.push(below);
  const { res } = play(game, "Look at the top 7 cards of your deck and put a {D} Pokémon you find there onto your Bench. Shuffle the other cards and put them on the bottom of your deck. You can't use this card during your first turn.", { trainerType: 'Supporter' });
  assert.deepEqual(ids(res.pendingChoice.options), [dark.instanceId]);
  const done = resolve(game, res, [dark.instanceId]);
  assert.ok(zone(done, 'p1', 'bench').some((c) => c.instanceId === dark.instanceId));
  assert.equal(zone(done, 'p1', 'deck')[0].instanceId, below.instanceId);
});

test("notFirstTurn play condition blocks Grimsley's Move on turn 2", () => {
  const game = setup();
  game.state.turn.number = 2;
  const { res } = play(game, "Look at the top 7 cards of your deck and put a {D} Pokémon you find there onto your Bench. Shuffle the other cards and put them on the bottom of your deck. You can't use this card during your first turn.");
  assert.equal(res.error, "You can't use this card during your first turn.");
});

test('lookAtBottom (Dusk Ball): Pokémon from the bottom 7', () => {
  const game = setup();
  const mon = pokemon('Zubat');
  game.p1.zones.deck.push(card({ name: 'x' }), mon);
  const { res } = play(game, 'Look at the bottom 7 cards of your deck. You may reveal a Pokémon you find there and put it into your hand. Shuffle the other cards back into your deck.');
  const done = resolve(game, res, [mon.instanceId]);
  assert.deepEqual(ids(zone(done, 'p1', 'hand')), [mon.instanceId]);
});

test('searchDeckSequence (Dawn): one Basic, Stage 1 and Stage 2 in turn', () => {
  const game = setup();
  const basic = pokemon('Ralts');
  const s1 = pokemon('Kirlia', { stage: 'Stage 1' });
  const s2 = pokemon('Gardevoir', { stage: 'Stage 2' });
  game.p1.zones.deck.push(basic, s1, s2);
  const { res } = play(game, 'Search your deck for a Basic Pokémon, a Stage 1 Pokémon, and a Stage 2 Pokémon, reveal them, and put them into your hand. Then, shuffle your deck.', { trainerType: 'Supporter' });
  assert.deepEqual(ids(res.pendingChoice.options), [basic.instanceId]);
  const r2 = resolve(game, res, [basic.instanceId]);
  assert.deepEqual(ids(r2.pendingChoice.options), [s1.instanceId]);
  const r3 = resolve(game, r2, [s1.instanceId]);
  assert.deepEqual(ids(r3.pendingChoice.options), [s2.instanceId]);
  const done = resolve(game, r3, [s2.instanceId]);
  assert.equal(done.pendingChoice, null);
  assert.deepEqual(ids(zone(done, 'p1', 'hand')).sort(), ids([basic, s1, s2]).sort());
});

test('evolveStage2 (Rare Candy): Stage 2 from hand goes onto the chosen Basic', () => {
  const game = setup();
  const gardevoir = pokemon('Gardevoir ex', { stage: 'Stage 2' });
  game.p1.zones.hand.push(gardevoir);
  const ralts = game.p1.zones.active[0];
  const { res } = play(game, "Choose 1 of your Basic Pokémon in play. If you have a Stage 2 card in your hand that evolves from that Pokémon, put that card onto the Basic Pokémon to evolve it, skipping the Stage 1. You can't use this card during your first turn or on a Basic Pokémon that was put into play this turn.", { name: 'Rare Candy' });
  const r2 = resolve(game, res, [gardevoir.instanceId]);
  const done = resolve(game, r2, [ralts.instanceId]);
  const evolved = zone(done, 'p1', 'active').find((c) => c.instanceId === gardevoir.instanceId);
  assert.equal(evolved.attachedTo, ralts.instanceId);
});

test('evolveStage2 (Rare Candy): only Basics on the Stage 2 line are offered', () => {
  const game = setup();
  const gardevoir = pokemon('Gardevoir ex', { stage: 'Stage 2', evolvesFrom: 'Kirlia' });
  const riolu = pokemon('Riolu');
  game.p1.zones.hand.push(gardevoir);
  game.p1.zones.bench.push(riolu);
  game.p1.zones.discard.push(pokemon('Kirlia', { stage: 'Stage 1', evolvesFrom: 'Ralts' }));
  const ralts = game.p1.zones.active[0];
  const { res } = play(game, "Choose 1 of your Basic Pokémon in play. If you have a Stage 2 card in your hand that evolves from that Pokémon, put that card onto the Basic Pokémon to evolve it, skipping the Stage 1. You can't use this card during your first turn or on a Basic Pokémon that was put into play this turn.", { name: 'Rare Candy' });
  const r2 = resolve(game, res, [gardevoir.instanceId]);
  assert.deepEqual(ids(r2.pendingChoice.options), [ralts.instanceId]);
});

test('searchEvolve (Salvatore): Evolution from deck onto the Pokémon it evolves from; Ability cards excluded', () => {
  const game = setup();
  const kirlia = pokemon('Kirlia', { stage: 'Stage 1', evolvesFrom: 'Ralts' });
  const abilityKirlia = pokemon('Kirlia', { stage: 'Stage 1', evolvesFrom: 'Ralts', abilities: [{ name: 'Refinement', text: 'Draw.' }] });
  const unrelated = pokemon('Lucario', { stage: 'Stage 1', evolvesFrom: 'Riolu' });
  game.p1.zones.deck.push(kirlia, abilityKirlia, unrelated);
  const { res } = play(game, 'Search your deck for a card that has no Abilities and evolves from 1 of your Pokémon, and put it onto that Pokémon to evolve it. Then, shuffle your deck.', { trainerType: 'Supporter' });
  assert.deepEqual(ids(res.pendingChoice.options), [kirlia.instanceId]);
  const done = resolve(game, res, [kirlia.instanceId]);
  assert.equal(zone(done, 'p1', 'active').find((c) => c.instanceId === kirlia.instanceId).attachedTo, game.p1.zones.active[0].instanceId);
});

test('moveEnergy (Energy Switch) and moveEnergyToActive', () => {
  const game = setup();
  const ralts = game.p1.zones.active[0];
  const benched = pokemon('Kirlia');
  const e = energy();
  e.attachedTo = benched.instanceId;
  game.p1.zones.bench.push(benched, e);
  const { res } = play(game, 'Move a Basic Energy from 1 of your Pokémon to another of your Pokémon.');
  const r2 = resolve(game, res, [e.instanceId]);
  assert.deepEqual(ids(r2.pendingChoice.options), [ralts.instanceId]);
  const done = resolve(game, r2, [ralts.instanceId]);
  assert.equal(zone(done, 'p1', 'active').find((c) => c.instanceId === e.instanceId).attachedTo, ralts.instanceId);

  const game2 = setup();
  const b2 = pokemon('Kirlia');
  const e2 = energy();
  e2.attachedTo = b2.instanceId;
  game2.p1.zones.bench.push(b2, e2);
  const plan = play(game2, 'Move up to 2 Energy from your Benched Pokémon to your Active Pokémon.').res;
  const moved = resolve(game2, plan, [e2.instanceId]);
  assert.ok(zone(moved, 'p1', 'active').some((c) => c.instanceId === e2.instanceId));
});

test('devolve (Strange Timepiece): top Evolution card returns to hand', () => {
  const game = setup();
  const ralts = game.p1.zones.active[0];
  const kirlia = pokemon('Kirlia', { stage: 'Stage 1', attachedTo: ralts.instanceId });
  game.p1.zones.active.push(kirlia);
  const { res } = play(game, "Devolve 1 of your evolved Pokémon in play by putting the highest Stage Evolution card on it into your hand.");
  const done = resolve(game, res, [ralts.instanceId]);
  assert.deepEqual(ids(zone(done, 'p1', 'hand')), [kirlia.instanceId]);
});

test('discardTools, discardFromOpponent (Blowtorch incl. Stadium), massDiscardAttached, discardToolAndSpecialEnergy', () => {
  const game = setup();
  const oppActive = game.p2.zones.active[0];
  const t = tool();
  t.attachedTo = oppActive.instanceId;
  game.p2.zones.active.push(t);
  const scrapper = play(game, 'Choose up to 2 Pokémon Tools attached to Pokémon (yours or your opponent\'s) and discard them.').res;
  assert.ok(zone(resolve(game, scrapper, [t.instanceId]), 'p2', 'discard').some((c) => c.instanceId === t.instanceId));

  const game2 = setup();
  game2.state.stadium = card({ name: 'Battle Cage', type: 'Trainer', trainerType: 'Stadium', ownerId: 'p2' });
  const torch = play(game2, "Discard a Pokémon Tool or Special Energy from 1 of your opponent's Pokémon, or discard a Stadium in play.").res;
  const noStadium = resolve(game2, torch, [game2.state.stadium.instanceId]);
  assert.equal(noStadium.state.stadium, null);

  const game3 = setup();
  const a3 = game3.p2.zones.active[0];
  const t3 = tool();
  const s3 = special();
  const b3 = energy();
  for (const c of [t3, s3, b3]) c.attachedTo = a3.instanceId;
  game3.p2.zones.active.push(t3, s3, b3);
  const blower = play(game3, "Discard all Pokémon Tools and Special Energy from all of your opponent's Pokémon, and discard a Stadium in play.").res;
  assert.deepEqual(ids(zone(blower, 'p2', 'discard')).sort(), ids([t3, s3]).sort());

  const game4 = setup();
  const a4 = game4.p2.zones.active[0];
  const t4 = tool();
  const s4 = special();
  t4.attachedTo = a4.instanceId;
  s4.attachedTo = a4.instanceId;
  game4.p2.zones.active.push(t4, s4);
  const ruffian = play(game4, "Discard a Pokémon Tool and a Special Energy from 1 of your opponent's Pokémon.").res;
  assert.equal(zone(ruffian, 'p2', 'discard').length, 2);
});

test('discardEnergyFromOpponent: 1 Pokémon, each Pokémon, and return to hand', () => {
  const game = setup();
  const a = game.p2.zones.active[0];
  const e = energy();
  e.attachedTo = a.instanceId;
  game.p2.zones.active.push(e);
  const grunt = play(game, "Discard an Energy from 1 of your opponent's Pokémon.").res;
  assert.ok(zone(resolve(game, grunt, [e.instanceId]), 'p2', 'discard').some((c) => c.instanceId === e.instanceId));

  const game2 = setup();
  const a2 = game2.p2.zones.active[0];
  const bench2 = pokemon('b');
  const s1 = special();
  const s2 = special();
  s1.attachedTo = a2.instanceId;
  s2.attachedTo = bench2.instanceId;
  game2.p2.zones.active.push(s1);
  game2.p2.zones.bench.push(bench2, s2);
  const giacomo = play(game2, "Discard a Special Energy from each of your opponent's Pokémon.").res;
  assert.equal(zone(giacomo, 'p2', 'discard').length, 2);

  const game3 = setup();
  const a3 = game3.p2.zones.active[0];
  const e3 = energy();
  e3.attachedTo = a3.instanceId;
  game3.p2.zones.active.push(e3);
  const toy = play(game3, "Put an Energy attached to 1 of your opponent's Pokémon into their hand.").res;
  assert.deepEqual(ids(zone(resolve(game3, toy, [e3.instanceId]), 'p2', 'hand')), [e3.instanceId]);
});

test('damageCounters via coin flip branch lands 10 per counter', () => {
  const game = setup();
  const steps = parseTrainerEffect("Flip a coin. If heads, put 2 damage counters on 1 of your opponent's Pokémon. If tails, put 2 damage counters on your Active Pokémon.").steps;
  assert.equal(steps[0].type, 'coinFlip');
  const { res } = play(game, "Flip a coin. If heads, put 2 damage counters on 1 of your opponent's Pokémon. If tails, put 2 damage counters on your Active Pokémon.");
  const damaged = [...zone(res, 'p1', 'active'), ...zone(res, 'p2', 'active')].find((c) => c.damage === 20);
  assert.ok(damaged, 'one Active Pokémon takes 20 damage');
});

test('fossilItem: played as a Basic Pokémon onto the Bench', () => {
  const game = setup();
  const { res, trainer } = play(game, 'Play this card as if it were a 60-HP Basic {C} Pokémon. At any time during your turn, you may discard this card from play. This card can\'t retreat.');
  const benched = zone(res, 'p1', 'bench').find((c) => c.instanceId === trainer.instanceId);
  assert.equal(benched.hp, 60);
  assert.equal(benched.supertype, 'Pokémon');
});

test('returnPokemonToHand: Active returned with attached cards, then a new Active is promoted', () => {
  const game = setup();
  const ralts = game.p1.zones.active[0];
  const e = energy();
  e.attachedTo = ralts.instanceId;
  game.p1.zones.active.push(e);
  const b1 = pokemon('b1');
  const b2 = pokemon('b2');
  game.p1.zones.bench.push(b1, b2);
  const { res } = play(game, 'Put 1 of your Pokémon and all attached cards into your hand.');
  const r2 = resolve(game, res, [ralts.instanceId]);
  assert.deepEqual(ids(zone(r2, 'p1', 'hand')).sort(), ids([ralts, e]).sort());
  const done = resolve(game, r2, [b2.instanceId]);
  assert.equal(zone(done, 'p1', 'active')[0].instanceId, b2.instanceId);

  const turo = setup();
  const tRalts = turo.p1.zones.active[0];
  const tE = energy();
  tE.attachedTo = tRalts.instanceId;
  turo.p1.zones.active.push(tE);
  turo.p1.zones.bench.push(pokemon('only'));
  const t = play(turo, 'Put 1 of your Pokémon into your hand. (Discard all cards attached to that Pokémon.)').res;
  const tDone = resolve(turo, t, [tRalts.instanceId]);
  assert.deepEqual(ids(zone(tDone, 'p1', 'discard')).slice(0, 1), [tE.instanceId]);
  assert.equal(zone(tDone, 'p1', 'active').length, 1);
});

test('swapWithDiscard: discard Pokémon takes over damage and attachments', () => {
  const game = setup();
  const ralts = game.p1.zones.active[0];
  ralts.damage = 30;
  const e = energy();
  e.attachedTo = ralts.instanceId;
  game.p1.zones.active.push(e);
  const replacement = pokemon('Mimikyu');
  game.p1.zones.discard.push(replacement);
  const { res } = play(game, 'Choose a Basic Pokémon in your discard pile and switch it with 1 of your Basic Pokémon in play. Any attached cards, damage counters, Special Conditions, turns in play, and any other effects remain on the new Pokémon.');
  const r2 = resolve(game, res, [replacement.instanceId]);
  const done = resolve(game, r2, [ralts.instanceId]);
  const active = zone(done, 'p1', 'active');
  assert.equal(active[0].instanceId, replacement.instanceId);
  assert.equal(active[0].damage, 30);
  assert.equal(active.find((c) => c.instanceId === e.instanceId).attachedTo, replacement.instanceId);
});

test('revealOpponentDeckBench (Accompanying Flute)', () => {
  const game = setup();
  const basic = pokemon('Pidgey');
  game.p2.zones.deck.push(basic, card({ name: 'x' }));
  const { res } = play(game, "Reveal the top 5 cards of your opponent's deck. You may put any number of Basic Pokémon you find there onto your opponent's Bench. Your opponent shuffles the other cards back into their deck.");
  const done = resolve(game, res, [basic.instanceId]);
  assert.ok(zone(done, 'p2', 'bench').some((c) => c.instanceId === basic.instanceId));
});

test("attachMultipleFromDiscard (Rosa's Encouragement): Stage 2 target and prize condition", () => {
  const text = "You can use this card only if you have more Prize cards remaining than your opponent.\n\nAttach up to 2 Basic Energy cards from your discard pile to 1 of your Stage 2 Pokémon.";
  const blocked = setup();
  assert.match(play(blocked, text, { trainerType: 'Supporter' }).res.error, /more Prize cards/);

  const game = setup();
  game.p2.zones.prizes.splice(4);
  const stage2 = pokemon('Gardevoir', { stage: 'Stage 2' });
  game.p1.zones.bench.push(stage2);
  const e1 = energy();
  const e2 = energy();
  game.p1.zones.discard.push(e1, e2);
  const { res } = play(game, text, { trainerType: 'Supporter' });
  const done = resolve(game, res, [e1.instanceId, e2.instanceId]);
  assert.equal(zone(done, 'p1', 'bench').filter((c) => c.attachedTo === stage2.instanceId).length, 2);
});

test('opponentPrizeHandSwap (Bother-Bot) trades a hand card with a revealed Prize', () => {
  const game = setup();
  const handCard = card({ name: 'h' });
  game.p2.zones.hand.push(handCard);
  const { res } = play(game, "Choose a random card from your opponent's hand. Your opponent reveals that card and turns 1 of their face-down Prize cards face up. You may have your opponent switch those cards. Then, they turn that Prize card face down.");
  assert.ok(zone(res, 'p2', 'prizes').some((c) => c.instanceId === handCard.instanceId && c.revealed));
  assert.equal(zone(res, 'p2', 'hand').length, 1);
});

test('revealOpponentHandDiscard (Eri) and opponentHandBottom (Ortega)', () => {
  const game = setup();
  const item = card({ name: 'Potion', type: 'Trainer', trainerType: 'Item' });
  game.p2.zones.hand.push(item, pokemon('x'));
  const { res } = play(game, 'Your opponent reveals their hand. Discard up to 2 Item cards you find there.', { trainerType: 'Supporter' });
  assert.deepEqual(ids(res.pendingChoice.options), [item.instanceId]);
  assert.ok(zone(resolve(game, res, [item.instanceId]), 'p2', 'discard').some((c) => c.instanceId === item.instanceId));

  const game2 = setup();
  const target = card({ name: 'Target' });
  game2.p2.zones.hand.push(target);
  const ortega = play(game2, 'Your opponent reveals their hand, and you put a card you find there on the bottom of their deck. If you do, your opponent may draw a card.').res;
  const done = resolve(game2, ortega, [target.instanceId]);
  assert.deepEqual(ids(zone(done, 'p2', 'deck')), []);
  assert.deepEqual(ids(zone(done, 'p2', 'hand')), [target.instanceId]);
});

test('opponentDiscardUntil and eachPlayerDiscardUntil ask the right player', () => {
  const game = setup();
  const oppHand = [card({ name: 'o1' }), card({ name: 'o2' }), card({ name: 'o3' }), card({ name: 'o4' })];
  game.p2.zones.hand.push(...oppHand);
  const { res } = play(game, 'Your opponent discards cards from their hand until they have 3 cards in their hand.', { trainerType: 'Supporter' });
  assert.equal(res.pendingChoice.player, 'p2');
  assert.equal(res.pendingChoice.min, 1);
  assert.equal(viewFor(res.state, 'p1').pendingChoice.options, undefined);
  const done = resolve(game, res, [oppHand[0].instanceId]);
  assert.equal(zone(done, 'p2', 'hand').length, 3);

  const game2 = setup();
  game2.p2.zones.hand.push(card({ name: 'a' }), card({ name: 'b' }));
  const mine = [card({ name: 'm1' }), card({ name: 'm2' }), card({ name: 'm3' })];
  game2.p1.zones.hand.push(...mine);
  const trimmer = play(game2, 'Each player discards cards from their hand until they have 1 card in their hand. Your opponent discards first.').res;
  assert.equal(trimmer.pendingChoice.player, 'p2');
  const r2 = resolve(game2, trimmer, [zone(trimmer, 'p2', 'hand')[0].instanceId]);
  assert.equal(r2.pendingChoice.player, 'p1');
  const done2 = resolve(game2, r2, [mine[0].instanceId, mine[1].instanceId]);
  assert.equal(zone(done2, 'p1', 'hand').length, 1);
  assert.equal(done2.pendingChoice, null);
});

test("prizeBargain (Lt. Surge's Bargain): opponent chooses", () => {
  const text = "Ask your opponent if each player may take a Prize card. If yes, each player takes a Prize card. If no, you draw 4 cards.";
  const game = setup();
  const { res } = play(game, text, { trainerType: 'Supporter' });
  assert.equal(res.pendingChoice.player, 'p2');
  const yes = resolve(game, res, [BARGAIN_YES]);
  assert.equal(zone(yes, 'p1', 'prizes').length, 5);
  assert.equal(zone(yes, 'p2', 'prizes').length, 5);

  const game2 = setup();
  for (let i = 0; i < 5; i++) game2.p1.zones.deck.push(card({ name: `d${i}` }));
  const no = resolve(game2, play(game2, text, { trainerType: 'Supporter' }).res, [BARGAIN_NO]);
  assert.equal(zone(no, 'p1', 'hand').length, 4);
});

test("searchAttachEach (Janine's Secret Art): energy per chosen Darkness Pokémon, Active poisoned", () => {
  const game = setup();
  const active = game.p1.zones.active[0];
  active.types = ['Darkness'];
  const benched = pokemon('Zorua', { types: ['Darkness'] });
  game.p1.zones.bench.push(benched, pokemon('NotDark', { types: ['Grass'] }));
  game.p1.zones.deck.push(energy('Basic Darkness Energy', { types: ['Darkness'] }), energy('Basic Darkness Energy', { types: ['Darkness'] }));
  const { res } = play(game, "Choose up to 2 of your {D} Pokémon. For each of those Pokémon, search your deck for a Basic {D} Energy card and attach it to that Pokémon. Then, shuffle your deck. If you attached Energy to your Active Pokémon in this way, it is now Poisoned.", { trainerType: 'Supporter' });
  assert.deepEqual(ids(res.pendingChoice.options).sort(), [active.instanceId, benched.instanceId].sort());
  const done = resolve(game, res, [active.instanceId, benched.instanceId]);
  assert.equal(zone(done, 'p1', 'active')[0].poisoned, true);
  assert.equal(zone(done, 'p1', 'deck').length, 0);
});

test('Judge draws 4 each; Fennel heals each Pokémon; Lisia confuses a Basic', () => {
  const game = setup();
  for (const p of [game.p1, game.p2]) {
    p.zones.hand.push(card({ name: 'h' }));
    for (let i = 0; i < 6; i++) p.zones.deck.push(card({ name: `d${i}` }));
  }
  const judge = play(game, 'Each player shuffles their hand into their deck and draws 4 cards.', { trainerType: 'Supporter' }).res;
  assert.equal(zone(judge, 'p1', 'hand').length, 4);
  assert.equal(zone(judge, 'p2', 'hand').length, 4);

  const game2 = setup();
  const b = pokemon('b', { damage: 50 });
  game2.p1.zones.active[0].damage = 30;
  game2.p1.zones.bench.push(b);
  const fennel = play(game2, 'Heal 40 damage from each of your Pokémon.', { trainerType: 'Supporter' }).res;
  assert.equal(zone(fennel, 'p1', 'active')[0].damage, 0);
  assert.equal(zone(fennel, 'p1', 'bench')[0].damage, 10);

  const game3 = setup();
  const basic = pokemon('Pichu');
  game3.p2.zones.bench.push(basic);
  const lisia = play(game3, "Switch in 1 of your opponent's Benched Basic Pokémon to the Active Spot. If you do, the new Active Pokémon is now Confused.", { trainerType: 'Supporter' }).res;
  const newActive = zone(lisia, 'p2', 'active').find((c) => !c.attachedTo);
  assert.equal(newActive.instanceId, basic.instanceId);
  assert.equal(newActive.specialCondition, 'Confused');
});

test('heal all damage, search-to-attach, attachFromDiscard target choice, Energy Recycler "choose 1 or both"', () => {
  const game = setup();
  game.p1.zones.active[0].damage = 120;
  const wally = play(game, 'Heal all damage from 1 of your Pokémon.').res;
  assert.equal(zone(wally, 'p1', 'active')[0].damage, 0);

  const game2 = setup();
  const bench = pokemon('b');
  game2.p1.zones.bench.push(bench);
  const e = energy();
  game2.p1.zones.deck.push(e);
  const search = play(game2, 'Search your deck for a Basic Energy card and attach it to 1 of your Pokémon. Then, shuffle your deck.').res;
  const r2 = resolve(game2, search, [e.instanceId]);
  const attached = resolve(game2, r2, [bench.instanceId]);
  assert.equal(zone(attached, 'p1', 'bench').find((c) => c.instanceId === e.instanceId).attachedTo, bench.instanceId);

  const game3 = setup();
  const b3 = pokemon('b3', { types: ['Psychic'] });
  game3.p1.zones.bench.push(b3, pokemon('b4', { types: ['Psychic'] }));
  const e3 = energy();
  game3.p1.zones.discard.push(e3);
  const patch = play(game3, 'Attach a Basic {P} Energy card from your discard pile to 1 of your Benched {P} Pokémon.').res;
  const target = resolve(game3, patch, [e3.instanceId]);
  assert.equal(target.pendingChoice.options.length, 2);
  const done3 = resolve(game3, target, [b3.instanceId]);
  assert.equal(zone(done3, 'p1', 'bench').find((c) => c.instanceId === e3.instanceId)?.attachedTo, b3.instanceId);
});

test('Tool dropped on the board asks for a target; Stadium dropped on the board is placed', () => {
  const game = setup();
  const balloon = card({ name: 'Air Balloon', type: 'Trainer', trainerType: 'Tool' });
  const bench = pokemon('b');
  game.p1.zones.bench.push(bench);
  game.p1.zones.hand.push(balloon);
  const res = applyCommand(game.state, {
    type: 'moveCard', payload: { instanceId: balloon.instanceId, from: 'hand', to: 'board' }, playerId: 'p1',
  }, game.rng);
  const done = resolve(game, res, [bench.instanceId]);
  assert.equal(zone(done, 'p1', 'bench').find((c) => c.instanceId === balloon.instanceId).attachedTo, bench.instanceId);
  assert.equal(zone(done, 'p1', 'discard').length, 0);

  const game2 = setup();
  const cage = card({ name: 'Battle Cage', type: 'Trainer', trainerType: 'Stadium', text: 'Prevent all damage counters from being placed on Benched Pokémon by effects of attacks.' });
  game2.p1.zones.hand.push(cage);
  const placed = applyCommand(game2.state, {
    type: 'moveCard', payload: { instanceId: cage.instanceId, from: 'hand', to: 'board' }, playerId: 'p1',
  }, game2.rng);
  assert.equal(placed.state.stadium.instanceId, cage.instanceId);
  assert.equal(zone(placed, 'p1', 'discard').length, 0);
});

test('Tool played onto a stacked evolution attaches to the Basic', () => {
  // The client names the card the player dropped on — the visible Evolution — while
  // `attachedTools`/tool-combat read `attachedTo === <stack root>` (D40).
  const game = setup();
  const balloon = tool();
  const basic = pokemon('Froakie');
  const stage1 = pokemon('Frogadier', {
    stage: 'Stage 1',
    evolvesFrom: 'Froakie',
    attachedTo: basic.instanceId,
  });
  game.p1.zones.bench.push(basic, stage1);
  game.p1.zones.hand.push(balloon);

  const res = applyCommand(
    game.state,
    {
      type: 'playTrainer',
      payload: {
        instanceId: balloon.instanceId,
        targetInstanceId: stage1.instanceId,
      },
      playerId: 'p1',
    },
    game.rng
  );

  assert.equal(res.error, null);
  const attached = zone(res, 'p1', 'bench').find(
    (c) => c.instanceId === balloon.instanceId
  );
  assert.equal(attached.attachedTo, basic.instanceId);
});

test("turn 1: the player going first can't play a Supporter", () => {
  const game = setup();
  game.state.turn.number = 1;
  const { res } = play(game, 'Draw 2 cards.', { trainerType: 'Supporter' });
  assert.equal(res.error, "The player going first can't play a Supporter on turn 1.");
});

test('cardStats applies evolvesFrom and abilities to server cards', () => {
  const game = setup();
  const kirlia = pokemon('Kirlia', { syncInstance: 9 });
  game.p1.zones.deck.push(kirlia);
  const res = applyCommand(game.state, {
    type: 'cardStats',
    payload: { stats: [{ syncInstance: 9, evolvesFrom: 'Ralts', abilities: [{ name: 'Refinement', text: 'Draw 2 cards.' }, { bad: true }] }] },
    playerId: 'p1',
  }, game.rng);
  const synced = zone(res, 'p1', 'deck')[0];
  assert.equal(synced.evolvesFrom, 'Ralts');
  assert.deepEqual(synced.abilities, [{ name: 'Refinement', text: 'Draw 2 cards.' }]);
});
