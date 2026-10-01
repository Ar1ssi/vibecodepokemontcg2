// I226 / I231: WotC Trainers that did nothing, and Reset Stamp's per-Prize draw. Reducer-level:
// each card is played through applyCommand as TCGdex delivers it (untyped `effect` text).
// Card text: out/tcgdex-wotc-trainers.json (TCGdex id per test); modern rows: out/pkmn-trainer-cards.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, createPlayerZones, findCard } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseTrainerEffect } from '../rules/trainer-effects.mjs';

const WOTC = JSON.parse(fs.readFileSync(new URL('../../../out/tcgdex-wotc-trainers.json', import.meta.url), 'utf8'));
const MODERN = JSON.parse(fs.readFileSync(new URL('../../../out/pkmn-trainer-cards.json', import.meta.url), 'utf8'));
const tcgdex = (id) => WOTC.find((row) => row.id === id);
const modern = (name, set, number) => MODERN.find((row) => row.name === name && row.set === set && row.number === number).text;

// Coins: next() < 0.5 is heads. Shuffles keep the order so decks stay predictable.
const rngOf = (...values) => {
  let i = 0;
  return { next: () => values[Math.min(i++, values.length - 1)] ?? 0.9, shuffle: (a) => [...a] };
};
const HEADS = 0.1;
const TAILS = 0.9;

let nextId = 7000;
const card = (props) => createCard({ instanceId: nextId++, ...props });
const pokemon = (name, props = {}) => card({ name, supertype: 'Pokémon', hp: 100, stage: 'Basic', ...props });
const energy = (name = 'Water Energy', type = 'Water') => card({ name, type: 'Energy', subtypes: ['Basic'], types: [type] });
const item = (name, text = 'Draw 2 cards.') => card({ name, type: 'Trainer', trainerType: 'Item', text });
const wotcTrainer = (id) => card({ name: tcgdex(id).name, type: 'Trainer', text: tcgdex(id).effect });

function setup({ deck = 20 } = {}) {
  const state = createGameState({ gameId: 'wotc-i226', seed: 7, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: { abilitiesUsed: {}, supporterPlayed: false } };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(card({ name: `${id} Prize ${i}` }));
    for (let i = 0; i < deck; i++) state.players[id].zones.deck.push(item(`${id} Deck ${i}`));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  state.players.p1.zones.active.push(pokemon('Squirtle'));
  state.players.p2.zones.active.push(pokemon('Charmander'));
  return { state, p1: state.players.p1, p2: state.players.p2 };
}

function play(game, trainer, rng = rngOf(TAILS)) {
  game.p1.zones.hand.push(trainer);
  return applyCommand(game.state, { type: 'playTrainer', payload: { instanceId: trainer.instanceId }, playerId: 'p1' }, rng);
}

function resolve(res, selection, rng = rngOf(TAILS)) {
  assert.ok(res.pendingChoice, 'expected a pending choice');
  return applyCommand(res.state, {
    type: 'resolveChoice',
    payload: { choiceId: res.pendingChoice.choiceId, selection },
    playerId: res.pendingChoice.player,
  }, rng);
}

const zone = (res, player, zoneId) => res.state.players[player].zones[zoneId];
const ids = (cards) => cards.map((c) => c.instanceId);
const YES = -1;
const NO = -2;

test('I231 Reset Stamp (Unified Minds 206): the opponent draws a card per remaining Prize', () => {
  const text = modern('Reset Stamp', 'Unified Minds', '206');
  assert.deepEqual(parseTrainerEffect(text).steps, [
    { type: 'opponentShuffleHandDraw', count: 0, prizeCondition: null, shuffle: true, perPrize: true },
  ]);
  const game = setup();
  game.p2.zones.prizes.splice(3);
  for (let i = 0; i < 5; i++) game.p2.zones.hand.push(item(`p2 hand ${i}`));
  const res = play(game, card({ name: 'Reset Stamp', type: 'Trainer', trainerType: 'Item', text }));
  assert.equal(res.error, null);
  assert.equal(zone(res, 'p2', 'hand').length, 3);
  assert.equal(zone(res, 'p2', 'deck').length, 22);
});

test('Lass base1-75: both hands are revealed, their Trainer cards shuffle into the decks', () => {
  const game = setup();
  const potion = item('Potion');
  const pikachu = pokemon('Pikachu');
  const bill = item('Bill');
  const water = energy();
  game.p1.zones.hand.push(potion, pikachu);
  game.p2.zones.hand.push(bill, water);
  const res = play(game, wotcTrainer('base1-75'));
  assert.equal(res.error, null);
  assert.deepEqual(ids(zone(res, 'p1', 'hand')), [pikachu.instanceId]);
  assert.deepEqual(ids(zone(res, 'p2', 'hand')), [water.instanceId]);
  assert.ok(ids(zone(res, 'p1', 'deck')).includes(potion.instanceId));
  assert.ok(ids(zone(res, 'p2', 'deck')).includes(bill.instanceId));
  const reveals = res.events.filter((e) => e.type === 'cardsRevealed');
  assert.deepEqual(reveals.map((e) => e.playerId).sort(), ['p1', 'p2']);
  assert.ok(reveals.every((e) => e.revealedTo == null), 'Lass shows each hand to both players');
});

test('Pokémon Trader base1-77 ≡ Pokémon Communication (Team Up 152b): Pokémon into the deck, then search', () => {
  const communication = modern('Pokémon Communication', 'Team Up', '152b');
  assert.deepEqual(parseTrainerEffect(tcgdex('base1-77').effect), parseTrainerEffect(communication));
  assert.deepEqual(parseTrainerEffect(communication).steps[0], { type: 'handCardToDeck', what: 'Pokémon', cost: true });

  const game = setup();
  const pidgey = pokemon('Pidgey');
  const dratini = pokemon('Dratini');
  game.p1.zones.deck.push(dratini);
  game.p1.zones.hand.push(pidgey, item('Potion'));
  const first = play(game, wotcTrainer('base1-77'));
  assert.equal(first.error, null);
  assert.deepEqual(ids(first.pendingChoice.options), [pidgey.instanceId]);
  const second = resolve(first, [pidgey.instanceId]);
  assert.ok(ids(zone(second, 'p1', 'deck')).includes(pidgey.instanceId));
  assert.ok(second.events.some((e) => e.type === 'cardsRevealed' && e.cards.some((c) => c.name === 'Pidgey')));
  const third = resolve(second, [dratini.instanceId]);
  assert.equal(third.error, null);
  assert.ok(ids(zone(third, 'p1', 'hand')).includes(dratini.instanceId));

  const empty = setup();
  empty.p1.zones.hand.push(item('Potion'));
  const refused = play(empty, wotcTrainer('base1-77'));
  assert.match(refused.error || '', /Pokémon in your hand/);
});

test("Erika's Maids gym1-109: discard 2 other cards, then up to 2 Pokémon with Erika in their names", () => {
  assert.deepEqual(parseTrainerEffect(tcgdex('gym1-109').effect).steps, [
    { type: 'discardCost', count: 2 },
    { type: 'searchDeck', what: 'Pokémon', count: 2, destination: 'hand', upTo: true, nameFilter: 'Erika', reveal: true },
  ]);
  const game = setup();
  const oddish = pokemon("Erika's Oddish");
  const plain = pokemon('Oddish');
  game.p1.zones.deck.push(oddish, plain);
  const a = item('A');
  const b = item('B');
  game.p1.zones.hand.push(a, b);
  const first = play(game, wotcTrainer('gym1-109'));
  assert.equal(first.error, null);
  const second = resolve(first, [a.instanceId, b.instanceId]);
  assert.deepEqual(ids(second.pendingChoice.options), [oddish.instanceId]);
  const third = resolve(second, [oddish.instanceId]);
  assert.ok(ids(zone(third, 'p1', 'hand')).includes(oddish.instanceId));
  assert.ok(ids(zone(third, 'p1', 'discard')).includes(a.instanceId));
});

test("Lt. Surge's Treaty gym1-112 ≡ Lt. Surge's Bargain drawing 1: the opponent chooses", () => {
  assert.deepEqual(parseTrainerEffect(tcgdex('gym1-112').effect).steps, [{ type: 'prizeBargain', drawCount: 1 }]);
  const declined = setup();
  const ask = play(declined, wotcTrainer('gym1-112'));
  assert.equal(ask.pendingChoice.player, 'p2');
  const no = resolve(ask, [NO]);
  assert.equal(zone(no, 'p1', 'hand').length, 1);
  assert.equal(zone(no, 'p1', 'prizes').length, 6);

  const accepted = setup();
  const yes = resolve(play(accepted, wotcTrainer('gym1-112')), [YES]);
  assert.equal(zone(yes, 'p1', 'prizes').length, 5);
  assert.equal(zone(yes, 'p2', 'prizes').length, 5);
});

test('Arcade Game neo1-83: cards sharing a name among the top 3 go to the hand', () => {
  const game = setup();
  const [pika1, pika2, bill] = [pokemon('Pikachu'), pokemon('Pikachu'), item('Bill')];
  game.p1.zones.deck.unshift(pika1, pika2, bill);
  const res = play(game, wotcTrainer('neo1-83'));
  assert.equal(res.error, null);
  assert.deepEqual(ids(zone(res, 'p1', 'hand')).sort(), [pika1.instanceId, pika2.instanceId].sort());
  assert.ok(ids(zone(res, 'p1', 'deck')).includes(bill.instanceId));
  assert.ok(res.events.some((e) => e.type === 'cardsRevealed' && e.cards.length === 3));

  const distinct = setup();
  const miss = play(distinct, wotcTrainer('neo1-83'));
  assert.equal(zone(miss, 'p1', 'hand').length, 0);
  assert.equal(zone(miss, 'p1', 'deck').length, 20);
});

test("Blaine's Gamble gym1-121: discard any number, heads draws twice that many", () => {
  const run = (coin) => {
    const game = setup();
    const [x, y, z] = [item('X'), item('Y'), item('Z')];
    game.p1.zones.hand.push(x, y, z);
    const ask = play(game, wotcTrainer('gym1-121'));
    return resolve(ask, [x.instanceId, y.instanceId], rngOf(coin));
  };
  const heads = run(HEADS);
  assert.equal(zone(heads, 'p1', 'hand').length, 1 + 4);
  const tails = run(TAILS);
  assert.equal(zone(tails, 'p1', 'hand').length, 1);
  assert.equal(zone(tails, 'p1', 'discard').length, 3);
});

test('Digger base5-75: the first player to flip tails damages their own Active', () => {
  const ownTails = setup();
  const mine = play(ownTails, wotcTrainer('base5-75'), rngOf(TAILS));
  assert.equal(findCard(mine.state, ownTails.p1.zones.active[0].instanceId).card.damage, 10);

  const theirTails = setup();
  const theirs = play(theirTails, wotcTrainer('base5-75'), rngOf(HEADS, TAILS));
  assert.equal(findCard(theirs.state, theirTails.p2.zones.active[0].instanceId).card.damage, 10);
  assert.equal(findCard(theirs.state, theirTails.p1.zones.active[0].instanceId).card.damage ?? 0, 0);

  const knockOut = setup();
  knockOut.p2.zones.active[0].hp = 10;
  knockOut.p2.zones.bench.push(pokemon('Vulpix'));
  const ko = play(knockOut, wotcTrainer('base5-75'), rngOf(HEADS, TAILS));
  assert.ok(ko.events.some((e) => e.type === 'pokemonKnockedOut'));
});

test("Impostor Professor Oak's Invention neo4-94: look at the opponent's Prizes, optionally reset them", () => {
  const game = setup();
  const before = ids(game.p2.zones.prizes);
  const ask = play(game, wotcTrainer('neo4-94'));
  assert.equal(ask.pendingChoice.player, 'p1');
  assert.deepEqual(ids(ask.pendingChoice.options), before);
  const looked = ask.events.find((e) => e.type === 'cardsLookedAt');
  assert.equal(looked.cards, undefined, 'the public event names no Prize');
  const keep = resolve(ask, []);
  assert.deepEqual(ids(zone(keep, 'p2', 'prizes')), before);

  const again = setup();
  const res = resolve(play(again, wotcTrainer('neo4-94')), [again.p2.zones.prizes[0].instanceId]);
  assert.equal(zone(res, 'p2', 'prizes').length, 6);
  assert.equal(zone(res, 'p2', 'deck').length, 20);
  assert.ok(res.events.some((e) => e.type === 'prizesReset' && e.playerId === 'p2'));
});

test("Misty's Duel gym1-123: the coin picks the winner, who shuffles in and draws 5", () => {
  const win = setup();
  win.p1.zones.hand.push(item('Mine'));
  const heads = play(win, wotcTrainer('gym1-123'), rngOf(HEADS));
  assert.equal(zone(heads, 'p1', 'hand').length, 5);
  assert.equal(zone(heads, 'p2', 'hand').length, 0);

  const lose = setup();
  const tails = play(lose, wotcTrainer('gym1-123'), rngOf(TAILS));
  assert.equal(zone(tails, 'p2', 'hand').length, 5);
});

test("Misty's Wish gym2-108: look at a Prize; the opponent allows a swap or the player draws", () => {
  const flow = () => {
    const game = setup();
    const keep = item('Hand card');
    game.p1.zones.hand.push(keep);
    const pick = play(game, wotcTrainer('gym2-108'));
    assert.ok(pick.pendingChoice.options.every((o) => o.faceDown), 'the Prize pick is blind');
    const prize = game.p1.zones.prizes[2];
    const seen = resolve(pick, [prize.instanceId]);
    assert.equal(seen.pendingChoice.player, 'p1');
    assert.equal(seen.pendingChoice.options[0].name, prize.name, 'only the chooser sees the Prize');
    const asked = resolve(seen, [prize.instanceId]);
    assert.equal(asked.pendingChoice.player, 'p2');
    return { asked, keep, prize };
  };
  const accepted = flow();
  const swap = resolve(accepted.asked, [YES]);
  const done = resolve(swap, [accepted.keep.instanceId]);
  assert.ok(ids(zone(done, 'p1', 'hand')).includes(accepted.prize.instanceId));
  assert.equal(ids(zone(done, 'p1', 'prizes'))[2], accepted.keep.instanceId);

  const declined = flow();
  const draw = resolve(declined.asked, [NO]);
  assert.equal(zone(draw, 'p1', 'hand').length, 2);
  assert.ok(ids(zone(draw, 'p1', 'prizes')).includes(declined.prize.instanceId));
});

test("Sabrina's Psychic Control gym2-121: heads uses a Trainer from the opponent's discard that isn't put in play", () => {
  const game = setup();
  const bill = card({ name: 'Bill', type: 'Trainer', text: 'Draw 2 cards.' });
  const plusPower = wotcTrainer('base1-84');
  const doll = card({ name: 'Clefairy Doll', type: 'Trainer', text: tcgdex('base1-70').effect });
  game.p2.zones.discard.push(plusPower, doll, bill);
  const ask = play(game, wotcTrainer('gym2-121'), rngOf(HEADS));
  assert.deepEqual(ids(ask.pendingChoice.options), [bill.instanceId]);
  const used = resolve(ask, [bill.instanceId]);
  assert.equal(zone(used, 'p1', 'hand').length, 2);
  assert.ok(ids(zone(used, 'p2', 'discard')).includes(bill.instanceId), 'the card stays in the opponent’s discard');

  const tails = play(setup(), wotcTrainer('gym2-121'), rngOf(TAILS));
  assert.equal(tails.pendingChoice, null);
});

test('Thought Wave Machine neo4-96: each heads returns an Energy from the Active, then the turn ends', () => {
  const game = setup();
  const active = game.p2.zones.active[0];
  const energies = [energy(), energy(), energy()];
  for (const e of energies) {
    e.attachedTo = active.instanceId;
    game.p2.zones.active.push(e);
  }
  const ask = play(game, wotcTrainer('neo4-96'), rngOf(HEADS, HEADS, TAILS));
  assert.equal(ask.pendingChoice.min, 2);
  const res = resolve(ask, ids(energies.slice(0, 2)));
  assert.deepEqual(ids(zone(res, 'p2', 'hand')).filter((id) => ids(energies).includes(id)).length, 2);
  assert.equal(res.state.turn.player, 'p2', 'Your turn is over now');

  const few = setup();
  const lone = energy();
  lone.attachedTo = few.p2.zones.active[0].instanceId;
  few.p2.zones.active.push(lone);
  const auto = play(few, wotcTrainer('neo4-96'), rngOf(HEADS, HEADS, TAILS));
  assert.equal(auto.pendingChoice, null);
  assert.ok(ids(zone(auto, 'p2', 'hand')).includes(lone.instanceId));
});

test('Time Capsule neo1-90: opponent then player may shuffle 5 (all or none if fewer) in; no more Trainers', () => {
  const game = setup();
  const theirs = Array.from({ length: 6 }, (_, i) => pokemon(`p2 mon ${i}`));
  game.p2.zones.discard.push(...theirs, item('p2 trainer'));
  const mine = [pokemon('p1 mon'), energy()];
  game.p1.zones.discard.push(...mine);
  const askOpp = play(game, wotcTrainer('neo1-90'));
  assert.equal(askOpp.pendingChoice.player, 'p2');
  const pickOpp = resolve(askOpp, [YES]);
  assert.equal(pickOpp.pendingChoice.min, 5);
  const askMe = resolve(pickOpp, ids(theirs.slice(0, 5)));
  assert.equal(zone(askMe, 'p2', 'deck').length, 25);
  assert.equal(askMe.pendingChoice.player, 'p1');
  const done = resolve(askMe, [YES]);
  assert.equal(zone(done, 'p1', 'deck').length, 22);
  assert.equal(zone(done, 'p1', 'discard').length, 1, 'only Time Capsule itself');

  const potion = item('Potion', 'Heal 30 damage from 1 of your Pokémon.');
  done.state.players.p1.zones.hand.push(potion);
  const blocked = applyCommand(done.state, { type: 'playTrainer', payload: { instanceId: potion.instanceId }, playerId: 'p1' }, rngOf(TAILS));
  assert.match(blocked.error || '', /Time Capsule/);
});

test('Tickling Machine gym1-119: heads sets the opponent’s hand aside until the end of their next turn', () => {
  const game = setup();
  const hand = [item('A'), item('B')];
  game.p2.zones.hand.push(...hand);
  const res = play(game, wotcTrainer('gym1-119'), rngOf(HEADS));
  assert.equal(res.error, null);
  assert.equal(zone(res, 'p2', 'hand').length, 0);
  assert.equal(findCard(res.state, hand[0].instanceId), null, 'no zone holds the set-aside cards');
  const theirTurn = applyCommand(res.state, { type: 'pass', payload: {}, playerId: 'p1' }, rngOf(TAILS));
  assert.equal(zone(theirTurn, 'p2', 'hand').length, 1, 'only the turn draw');
  const back = applyCommand(theirTurn.state, { type: 'pass', payload: {}, playerId: 'p2' }, rngOf(TAILS));
  assert.ok(ids(zone(back, 'p2', 'hand')).includes(hand[0].instanceId));
  assert.equal(zone(back, 'p2', 'hand').length, 3);
});
