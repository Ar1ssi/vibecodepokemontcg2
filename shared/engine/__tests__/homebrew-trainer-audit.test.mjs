// Item and Supporter Trainers of the homebrew set (customhb, R2 bucket set.json, 2026-10-31)
// that resolved without part of their printed text. Texts are the bucket's `effect` strings;
// all but Moomoo-style homebrew lines are word-for-word pkmncards rows (out/pkmn-trainer-cards.json:
// the set named beside each card). Each test plays the card through applyCommand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseTrainerEffect } from '../rules/trainer-effects.mjs';

let nextId = 1;
const mon = (name, type, extra = {}) =>
  createCard({ instanceId: nextId++, name, type: 'Pokémon', stage: 'Basic', types: [type], hp: 100, ...extra });
const energy = (type, extra = {}) => createCard({ instanceId: nextId++, name: `${type} Energy`, type: 'Energy', ...extra });
const special = (name) => createCard({ instanceId: nextId++, name, type: 'Energy', subtypes: ['Special'], energyType: 'Special' });
const trainer = (name, kind, text) => createCard({ instanceId: nextId++, name, type: 'Trainer', trainerType: kind, text });
const filler = (n) => Array.from({ length: n }, (_, i) => trainer(`Filler ${i}`, 'Item', 'Draw a card.'));
const attach = (host, ...cards) => cards.map((c) => Object.assign(c, { attachedTo: host.instanceId }));

/** Coin stub: every flip lands on `face`; other draws (shuffles) take the same value. */
const coins = (face) => ({ next: () => (face === 'heads' ? 0.1 : 0.9) });

function board({ p1 = {}, p2 = {}, turn = 3 } = {}) {
  const state = createGameState({ gameId: 'hb-audit', seed: 1, rulesEnabled: true });
  for (const [id, zones] of [['p1', p1], ['p2', p2]]) {
    const z = createPlayerZones();
    for (const [k, v] of Object.entries(zones)) z[k].push(...v);
    if (!z.active.length) z.active.push(mon(`${id} Active`, 'Colorless'));
    while (z.prizes.length < 6) z.prizes.push(mon(`${id} Prize`, 'Colorless'));
    if (!z.deck.length) z.deck.push(...filler(10));
    state.players[id] = { playerId: id, username: id, zones: z, flags: { abilitiesUsed: {}, supporterPlayed: false } };
  }
  state.turn = { player: 'p1', number: turn, phase: 'main' };
  return state;
}

/**
 * Plays `card` for p1, answering each prompt with `answer(choice)` (default: the first `max`
 * options). Returns the final result plus every prompt seen.
 */
function play(state, card, { answer, rng = coins('heads') } = {}) {
  state.players.p1.zones.hand.push(card);
  let res = applyCommand(state, { type: 'playTrainer', payload: { instanceId: card.instanceId }, playerId: 'p1' }, rng);
  const prompts = [];
  for (let guard = 0; res.pendingChoice && guard < 10; guard++) {
    const choice = res.pendingChoice;
    prompts.push(choice);
    const selection = answer ? answer(choice) : choice.options.slice(0, Math.max(1, choice.max)).map((o) => o.instanceId);
    res = applyCommand(
      res.state,
      { type: 'resolveChoice', payload: { choiceId: choice.choiceId, selection }, playerId: choice.player },
      rng
    );
  }
  return { ...res, prompts };
}

const optionNames = (choice) => choice.options.map((o) => o.name);
const findIn = (state, id) =>
  Object.values(state.players.p1.zones).flat().find((c) => c.instanceId === id);

// ── Healing ─────────────────────────────────────────────────────────────────────────────

test('Super Potion (Journey Together) discards an Energy from the healed Pokémon', () => {
  const card = trainer('Super Potion', 'Item', 'Heal 60 damage from 1 of your Pokémon. If you healed any damage in this way, discard an Energy from that Pokémon.');
  const hurt = mon('Hurt', 'Fire', { damage: 80 });
  const res = play(board({ p1: { active: [hurt, ...attach(hurt, energy('Fire'), energy('Fire'))] } }), card);
  assert.equal(findIn(res.state, hurt.instanceId).damage, 20);
  assert.equal(res.state.players.p1.zones.discard.filter((c) => c.name === 'Fire Energy').length, 1);
});

test('Hyper Potion (Sword & Shield) needs 2 Energy on the target and discards 2', () => {
  const card = trainer('Hyper Potion', 'Item', 'Heal 120 damage from 1 of your Pokémon that has at least 2 Energy attached. If you healed any damage in this way, discard 2 Energy from it.');
  const one = mon('One', 'Fire', { damage: 130 });
  const two = mon('Two', 'Water', { damage: 130 });
  const state = board({ p1: { active: [one, ...attach(one, energy('Fire'))], bench: [two, ...attach(two, energy('Water'), energy('Water'))] } });
  const res = play(state, card);
  assert.equal(findIn(res.state, one.instanceId).damage, 130, 'a 1-Energy Pokémon is not a legal target');
  assert.equal(findIn(res.state, two.instanceId).damage, 10);
  assert.equal(res.state.players.p1.zones.discard.filter((c) => c.name === 'Water Energy').length, 2);
});

test('Dragon Elixir (Surging Sparks) heals only the Active {N} Pokémon', () => {
  const text = 'Heal 60 damage from your Active {N} Pokémon.';
  const benchDragon = mon('Bench Dragon', 'Dragon', { damage: 80 });
  const fireActive = mon('Fire Active', 'Fire', { damage: 80 });
  let res = play(board({ p1: { active: [fireActive], bench: [benchDragon] } }), trainer('Dragon Elixir', 'Item', text));
  assert.equal(findIn(res.state, fireActive.instanceId).damage, 80);
  assert.equal(findIn(res.state, benchDragon.instanceId).damage, 80);
  const dragonActive = mon('Dragon Active', 'Dragon', { damage: 80 });
  res = play(board({ p1: { active: [dragonActive] } }), trainer('Dragon Elixir', 'Item', text));
  assert.equal(findIn(res.state, dragonActive.instanceId).damage, 20);
});

test('Fairy Drop (Fates Collide) needs {Y} Energy attached', () => {
  const text = 'Heal 50 damage from 1 of your Pokémon that has any {Y} Energy attached to it.';
  const plain = mon('Plain', 'Fire', { damage: 80 });
  const fairy = mon('Fairy', 'Fairy', { damage: 80 });
  const state = board({ p1: { active: [plain, ...attach(plain, energy('Fire'))], bench: [fairy, ...attach(fairy, energy('Fairy'))] } });
  const res = play(state, trainer('Fairy Drop', 'Item', text));
  assert.equal(findIn(res.state, plain.instanceId).damage, 80);
  assert.equal(findIn(res.state, fairy.instanceId).damage, 30);
});

test('Last Chance Potion (Celestial Storm) needs 30 HP or less remaining', () => {
  const text = 'Heal 120 damage from 1 of your Pokémon that has 30 HP or less remaining.';
  const healthy = mon('Healthy', 'Fire', { damage: 20 });
  const low = mon('Low', 'Fire', { damage: 70 });
  const res = play(board({ p1: { active: [healthy], bench: [low] } }), trainer('Last Chance Potion', 'Item', text));
  assert.equal(findIn(res.state, healthy.instanceId).damage, 20);
  assert.equal(findIn(res.state, low.instanceId).damage, 0);
});

test('Jacinthe (Perfect Order) offers only {P} Pokémon', () => {
  const fire = mon('Fire', 'Fire', { damage: 80 });
  const psychic = mon('Psychic', 'Psychic', { damage: 80 });
  const res = play(board({ p1: { active: [fire], bench: [psychic] } }), trainer('Jacinthe', 'Supporter', 'Heal 150 damage from 1 of your {P} Pokémon.'));
  assert.equal(findIn(res.state, fire.instanceId).damage, 80);
  assert.equal(findIn(res.state, psychic.instanceId).damage, 0);
});

test('Great Potion (Unified Minds) heals only an Active Pokémon-GX', () => {
  const text = 'Heal 50 damage from your Active Pokémon-GX.';
  const plain = mon('Plain', 'Fire', { damage: 80 });
  let res = play(board({ p1: { active: [plain] } }), trainer('Great Potion', 'Item', text));
  assert.equal(findIn(res.state, plain.instanceId).damage, 80);
  const gx = mon('Lycanroc-GX', 'Fighting', { damage: 80, subtypes: ['GX'] });
  res = play(board({ p1: { active: [gx] } }), trainer('Great Potion', 'Item', text));
  assert.equal(findIn(res.state, gx.instanceId).damage, 30);
});

// ── Searches and recovery ───────────────────────────────────────────────────────────────

const typedDeck = () => [
  mon('Grass Basic', 'Grass'),
  mon('Fighting Basic', 'Fighting'),
  mon('Psychic Basic', 'Psychic'),
  energy('Grass'),
  energy('Fighting'),
  energy('Psychic'),
  ...filler(4),
];

for (const [name, set, text, want] of [
  ['Fighting Gong', 'Mega Evolution', 'Search your deck for a Basic {F} Energy card or a Basic {F} Pokémon, reveal it, and put it into your hand. Then, shuffle your deck.', ['Fighting Basic', 'Fighting Energy']],
  ['Fog Crystal', 'Chilling Reign', 'Search your deck for a {P} Energy card or a Basic {P} Pokémon, reveal it, and put it into your hand. Then, shuffle your deck.', ['Psychic Basic', 'Psychic Energy']],
  ['Net Ball', 'Lost Thunder', 'Search your deck for a Basic {G} Pokémon or a {G} Energy card, reveal it, and put it into your hand. Then, shuffle your deck.', ['Grass Basic', 'Grass Energy']],
]) {
  test(`${name} (${set}) searches only its printed type`, () => {
    const res = play(board({ p1: { deck: typedDeck() } }), trainer(name, 'Item', text));
    assert.deepEqual(optionNames(res.prompts[0]).sort(), [...want].sort());
  });
}

test('Feather Ball (Astral Radiance) finds only a Pokémon with no Retreat Cost', () => {
  const deck = [mon('Free', 'Colorless', { retreatCost: [] }), mon('Heavy', 'Colorless', { retreatCost: ['Colorless', 'Colorless'] }), ...filler(3)];
  const res = play(board({ p1: { deck } }), trainer('Feather Ball', 'Item', 'Search your deck for a Pokémon that has no Retreat Cost, reveal it, and put it into your hand. Then, shuffle your deck.'));
  assert.deepEqual(optionNames(res.prompts[0]), ['Free']);
});

const retreatMon = (name, cost) => mon(name, 'Colorless', { retreatCost: Array(cost).fill('Colorless') });

test('Heavy Ball (BREAKthrough 140) finds only a Pokémon with a Retreat Cost of 3 or more', () => {
  const deck = [retreatMon('Free', 0), retreatMon('Two', 2), retreatMon('Three', 3), retreatMon('Four', 4), ...filler(3)];
  const res = play(board({ p1: { deck } }), trainer('Heavy Ball', 'Item', 'Search your deck for a Pokémon with a Retreat Cost of 3 or more, reveal it, and put it into your hand. Shuffle your deck afterward.'));
  assert.deepEqual(optionNames(res.prompts[0]), ['Three', 'Four']);
  assert.equal(res.prompts[0].max, 1);
});

test('Poké Maniac (Unified Minds 204) finds up to 3 Pokémon with a Retreat Cost of exactly 4', () => {
  const deck = [retreatMon('Three', 3), ...['A', 'B', 'C', 'D'].map((n) => retreatMon(`Four ${n}`, 4)), retreatMon('Five', 5), ...filler(3)];
  const res = play(board({ p1: { deck } }), trainer('Poké Maniac', 'Supporter', 'Search your deck for up to 3 Pokémon that have a Retreat Cost of exactly 4, reveal them, and put them into your hand. Then, shuffle your deck.'));
  assert.deepEqual(optionNames(res.prompts[0]), ['Four A', 'Four B', 'Four C', 'Four D']);
  assert.equal(res.prompts[0].max, 3);
  assert.deepEqual(res.state.players.p1.zones.hand.map((c) => c.name), ['Four A', 'Four B', 'Four C']);
});

test("Love Ball (Twilight Masquerade) finds only a Pokémon named like an opponent's in play", () => {
  const deck = [mon('Pikachu', 'Lightning'), mon('Eevee', 'Colorless'), ...filler(3)];
  const res = play(
    board({ p1: { deck }, p2: { active: [mon('Pikachu', 'Lightning')] } }),
    trainer('Love Ball', 'Item', "Search your deck for a Pokémon with the same name as 1 of your opponent's Pokémon in play, reveal it, and put it into your hand. Then, shuffle your deck.")
  );
  assert.deepEqual(optionNames(res.prompts[0]), ['Pikachu']);
});

test('Energy Search Pro (Surging Sparks) takes one Basic Energy of each type', () => {
  const deck = [energy('Fire'), energy('Fire'), energy('Water'), energy('Grass'), ...filler(3)];
  const res = play(board({ p1: { deck } }), trainer('Energy Search Pro', 'Item', 'Search your deck for any number of Basic Energy cards of different types, reveal them, and put them into your hand. Then, shuffle your deck.'));
  const hand = res.state.players.p1.zones.hand.map((c) => c.name).sort();
  assert.deepEqual(hand, ['Fire Energy', 'Grass Energy', 'Water Energy']);
});

test('Energy Loto (Guardians Rising) offers only Energy from the top 7', () => {
  const deck = [mon('Top Pokémon', 'Fire'), energy('Water'), trainer('Top Item', 'Item', 'x'), ...filler(5)];
  const res = play(board({ p1: { deck } }), trainer('Energy Loto', 'Item', 'Look at the top 7 cards of your deck. You may reveal an Energy card you find there and put it into your hand. Shuffle the other cards back into your deck.'));
  assert.deepEqual(optionNames(res.prompts[0]), ['Water Energy']);
});

test('Electric Generator (Scarlet & Violet) attaches up to 2 Basic {L} to Benched {L}', () => {
  const pika = mon('Pikachu', 'Lightning');
  const deck = [energy('Lightning'), energy('Lightning'), energy('Lightning'), energy('Fire'), mon('X', 'Fire'), ...filler(5)];
  const state = board({ p1: { active: [mon('Active L', 'Lightning')], bench: [pika, mon('Fire Bench', 'Fire')], deck } });
  const res = play(state, trainer('Electric Generator', 'Item', 'Look at the top 5 cards of your deck and attach up to 2 Basic {L} Energy cards you find there to your Benched {L} Pokémon in any way you like. Shuffle the other cards back into your deck.'));
  assert.equal(res.prompts[0].max, 2);
  const onPika = res.state.players.p1.zones.bench.filter((c) => c.attachedTo === pika.instanceId);
  assert.equal(onPika.length, 2);
  assert.equal(res.state.players.p1.zones.hand.length, 0, 'nothing goes to the hand');
});

test('Electrocharger (Team Up) flips 2 coins and returns only Electropower', () => {
  const text = 'Flip 2 coins. For each heads, shuffle an Electropower card from your discard pile into your deck.';
  const discard = () => [trainer('Electropower', 'Item', 'x'), trainer('Electropower', 'Item', 'x'), trainer('Potion', 'Item', 'x')];
  let res = play(board({ p1: { discard: discard() } }), trainer('Electrocharger', 'Item', text), { rng: coins('heads') });
  assert.deepEqual(optionNames(res.prompts[0]), ['Electropower', 'Electropower']);
  assert.equal(res.prompts[0].max, 2);
  res = play(board({ p1: { discard: discard() } }), trainer('Electrocharger', 'Item', text), { rng: coins('tails') });
  assert.equal(res.prompts.length, 0, 'two tails return nothing');
});

// HB 634 Steven's Resolve — set.json customhb-634, the user's cardback edit of sm7-145 (printed:
// "Search your deck for up to 3 cards …"); text as on its screenshot.
const STEVENS_RESOLVE = 'Flip 2 coins. For each heads, shuffle a card from your discard pile back into your deck.';
/** Coin stub: the flips land on `faces` in order; every later draw (shuffles) reads tails. */
const coinSequence = (...faces) => ({ next: () => (faces.shift() === 'heads' ? 0.1 : 0.9) });
const stevensDiscard = () => [mon('Beldum', 'Metal'), energy('Metal'), trainer('Potion', 'Item', 'x'), special('Double Turbo Energy')];
const playStevens = (discard, rng) =>
  play(board({ p1: { discard } }), trainer("Steven's Resolve", 'Supporter', STEVENS_RESOLVE), { rng });

test("HB 634 Steven's Resolve parses as 2 coins and one card of any kind per heads", () => {
  const { steps, recognizable } = parseTrainerEffect(STEVENS_RESOLVE);
  assert.equal(recognizable, true);
  assert.deepEqual(steps, [{ type: 'shuffleFromDiscard', what: 'card', coins: 2, perHeads: 1 }]);
});

test("HB 634 Steven's Resolve: 2 heads shuffle up to 2 cards of any kind from the discard pile into the deck", () => {
  const discard = stevensDiscard();
  const res = playStevens(discard, coinSequence('heads', 'heads'));
  assert.equal(res.prompts.length, 1);
  assert.equal(res.prompts[0].max, 2);
  assert.deepEqual(optionNames(res.prompts[0]), discard.map((c) => c.name), 'Pokémon, Trainer and Energy are all offered');
  const { deck, hand } = res.state.players.p1.zones;
  const [first, second] = res.prompts[0].options;
  assert.ok(deck.some((c) => c.instanceId === first.instanceId) && deck.some((c) => c.instanceId === second.instanceId));
  assert.equal(deck.length, 12);
  assert.equal(hand.some((c) => c.name === 'Beldum'), false, 'the cards go to the deck, not the hand');
});

test("HB 634 Steven's Resolve: 1 heads shuffles 1 card, 2 tails shuffle none", () => {
  const oneHead = playStevens(stevensDiscard(), coinSequence('tails', 'heads'));
  assert.equal(oneHead.prompts[0].max, 1);
  assert.equal(oneHead.state.players.p1.zones.deck.length, 11);
  const noHeads = playStevens(stevensDiscard(), coinSequence('tails', 'tails'));
  assert.equal(noHeads.prompts.length, 0, 'no prompt without a heads');
  assert.equal(noHeads.state.players.p1.zones.deck.length, 10);
  assert.equal(noHeads.state.players.p1.zones.discard.filter((c) => c.name !== "Steven's Resolve").length, 4);
});

test("HB 634 Steven's Resolve: a short discard pile caps the pick, an empty one skips it without an error", () => {
  const single = playStevens([mon('Beldum', 'Metal')], coinSequence('heads', 'heads'));
  assert.equal(single.prompts[0].max, 1);
  const empty = playStevens([], coinSequence('heads', 'heads'));
  assert.equal(empty.error ?? null, null);
  assert.equal(empty.prompts.length, 0);
  assert.equal(empty.state.players.p1.zones.deck.length, 10);
});

test('Special Charge (Steam Siege) returns only Special Energy', () => {
  const res = play(
    board({ p1: { discard: [special('Double Turbo Energy'), energy('Fire'), mon('Dead', 'Fire')] } }),
    trainer('Special Charge', 'Item', 'Shuffle 2 Special Energy cards from your discard pile into your deck.')
  );
  assert.deepEqual(optionNames(res.prompts[0]), ['Double Turbo Energy']);
});

test("Lana's Fishing Rod (Cosmic Eclipse) returns 1 Pokémon and 1 Pokémon Tool", () => {
  const tool = trainer('Choice Belt', 'Tool', 'x');
  const pokemon = [mon('D1', 'Fire'), mon('D2', 'Fire')];
  const res = play(
    board({ p1: { discard: [...pokemon, tool, energy('Fire')] } }),
    trainer("Lana's Fishing Rod", 'Item', 'Shuffle a Pokémon and a Pokémon Tool card from your discard pile into your deck.'),
    { answer: () => [pokemon[0].instanceId, tool.instanceId] }
  );
  const left = res.state.players.p1.zones.discard.map((c) => c.name).sort();
  assert.deepEqual(left, ['D2', 'Fire Energy', "Lana's Fishing Rod"]);
});

test('Energy Coin (Black Bolt) searches only on two heads', () => {
  const text = 'Flip 2 coins. If both of them are heads, search your deck for a Basic Energy card and attach it to 1 of your Pokémon. Then, shuffle your deck.';
  let res = play(board({ p1: { deck: [energy('Fire'), ...filler(4)] } }), trainer('Energy Coin', 'Item', text), { rng: coins('tails') });
  assert.equal(res.prompts.length, 0);
  assert.equal(res.events.filter((e) => e.type === 'coinFlipped').length, 2);
  res = play(board({ p1: { deck: [energy('Fire'), ...filler(4)] } }), trainer('Energy Coin', 'Item', text), { rng: coins('heads') });
  assert.equal(res.state.players.p1.zones.active.filter((c) => c.name === 'Fire Energy').length, 1);
});

test('Energy Sticker (151) attaches only on heads', () => {
  const text = 'Flip a coin. If heads, attach a Basic Energy card from your discard pile to 1 of your Benched Pokémon.';
  const run = (face) => {
    const bench = mon('Bench', 'Fire');
    const res = play(board({ p1: { bench: [bench], discard: [energy('Fire')] } }), trainer('Energy Sticker', 'Item', text), { rng: coins(face) });
    return res.state.players.p1.zones.bench.filter((c) => c.attachedTo === bench.instanceId).length;
  };
  assert.equal(run('tails'), 0);
  assert.equal(run('heads'), 1);
});

// ── Supporters and other Items ──────────────────────────────────────────────────────────

test("N's Resolve (Cosmic Eclipse) attaches the milled Basic Energy to a Benched {N}", () => {
  const dragon = mon('Dragon', 'Dragon');
  const deck = [energy('Fire'), mon('Milled', 'Fire'), energy('Water'), special('Double Turbo Energy'), ...filler(6)];
  const res = play(
    board({ p1: { bench: [dragon, mon('Fire Bench', 'Fire')], deck } }),
    trainer("N's Resolve", 'Supporter', "Discard the top 6 cards of your deck. If any of those cards are Basic Energy cards, attach them to 1 of your Benched {N} Pokémon.")
  );
  const attached = res.state.players.p1.zones.bench.filter((c) => c.attachedTo === dragon.instanceId).map((c) => c.name).sort();
  assert.deepEqual(attached, ['Fire Energy', 'Water Energy']);
});

test('Zinnia (Dragon Majesty) attaches only to a {N} Pokémon', () => {
  const dragon = mon('Dragon', 'Dragon');
  const state = board({ p1: { active: [mon('Fire Active', 'Fire')], bench: [dragon], hand: [energy('Fire')] } });
  state.players.p1.flags.koedLastOppTurn = true;
  const res = play(state, trainer('Zinnia', 'Supporter', "You can play this card only if 1 of your Pokémon was Knocked Out during your opponent's last turn.\n\nAttach up to 2 Basic Energy cards from your hand to 1 of your {N} Pokémon."));
  assert.equal(res.state.players.p1.zones.bench.filter((c) => c.attachedTo === dragon.instanceId).length, 1);
  assert.ok(res.prompts.every((p) => !optionNames(p).includes('Fire Active')));
});

test('Scramble Switch (Surging Sparks) may move the Energy to the new Active', () => {
  const old = mon('Old Active', 'Fire');
  const next = mon('New Active', 'Water');
  const res = play(
    board({ p1: { active: [old, ...attach(old, energy('Fire'), energy('Fire'))], bench: [next] } }),
    trainer('Scramble Switch', 'Item', 'Switch your Active Pokémon with 1 of your Benched Pokémon. If you do, you may move any amount of Energy from the Pokémon you moved to your Bench to the new Active Pokémon.')
  );
  const onNew = res.state.players.p1.zones.active.filter((c) => c.attachedTo === next.instanceId);
  assert.equal(onNew.length, 2);
});

test('Full Heal (Rebel Clash) cures the Active Pokémon', () => {
  const sick = mon('Sick', 'Fire', { specialCondition: 'Poisoned' });
  const res = play(board({ p1: { active: [sick] } }), trainer('Full Heal', 'Item', 'Your Active Pokémon recovers from all Special Conditions.'));
  assert.equal(findIn(res.state, sick.instanceId).specialCondition, null);
});

test('Prime Catcher (Temporal Forces) and Escape Rope (Battle Styles) switch the opponent first', () => {
  assert.deepEqual(
    parseTrainerEffect("Switch in 1 of your opponent's Benched Pokémon to the Active Spot. If you do, switch your Active Pokémon with 1 of your Benched Pokémon.").steps.map((s) => s.type),
    ['switchOpponent', 'switchOwn']
  );
  assert.deepEqual(
    parseTrainerEffect("Each player switches their Active Pokémon with 1 of their Benched Pokémon. Your opponent switches first. (If a player does not have a Benched Pokémon, they don't switch Pokémon.)").steps.map((s) => s.type),
    ['switchOpponentOut', 'switchOwn']
  );
});

const GREEDY_DICE = 'You can play this card only if you took it as a face-down Prize card, before you put it into your hand.\n\nFlip a coin. If heads, take 1 more Prize card.';

test('Greedy Dice (Steam Siege) cannot be played from the hand', () => {
  const res = play(board(), trainer('Greedy Dice', 'Item', GREEDY_DICE));
  assert.match(res.error, /face-down Prize card/);
});

test('Greedy Dice taken as a Prize may be played: heads owes 1 more Prize', () => {
  const dice = trainer('Greedy Dice', 'Item', GREEDY_DICE);
  const attacker = mon('Attacker', 'Fire', { hp: 200, attacks: [{ name: 'Big', cost: [], damage: '200', text: '' }] });
  const state = board({
    p1: { active: [attacker], prizes: [dice] },
    p2: { active: [mon('Victim', 'Fire', { hp: 50 })], bench: [mon('Next', 'Fire')] },
  });
  const rng = coins('heads');
  let res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' }, rng);
  const prompts = [];
  for (let guard = 0; res.pendingChoice && guard < 6 && !/play it now/.test(res.pendingChoice.prompt); guard++) {
    const choice = res.pendingChoice;
    const selection = /Prize/.test(choice.prompt) ? [dice.instanceId] : [choice.options[0].instanceId];
    res = applyCommand(res.state, { type: 'resolveChoice', payload: { choiceId: choice.choiceId, selection }, playerId: choice.player }, rng);
  }
  assert.match(res.pendingChoice?.prompt || '', /Greedy Dice: play it now/);
  prompts.push(res.pendingChoice);
  res = applyCommand(res.state, { type: 'resolveChoice', payload: { choiceId: res.pendingChoice.choiceId, selection: [1] }, playerId: 'p1' }, rng);
  assert.equal(res.state.players.p1.flags.prizesOwed, 1);
  assert.ok(res.state.players.p1.zones.discard.some((c) => c.instanceId === dice.instanceId));
});

// ── HB 286 Welder (customhb-286, edit of sm10-189) ──────────────────────────────────────────
// Text: the cardback edit in customhb set.json, matching the user's scan.

const WELDER = 'Attach a {R} Energy card from your hand to 1 of your Pokémon. If you do, draw 2 cards.';
const fire = () => createCard({ instanceId: nextId++, name: 'Basic Fire Energy', type: 'Energy', supertype: 'Energy', subtypes: ['Basic'], energyType: 'Fire' });
const water = () => createCard({ instanceId: nextId++, name: 'Basic Water Energy', type: 'Energy', supertype: 'Energy', subtypes: ['Basic'], energyType: 'Water' });

test('HB 286 Welder attaches one Fire Energy from hand, then draws 2; only Fire is offered', () => {
  const f = fire();
  const w = water();
  const state = board({ p1: { hand: [f, w] } });
  const res = play(state, trainer('Welder', 'Supporter', WELDER));
  assert.equal(res.error ?? null, null);
  assert.deepEqual(optionNames(res.prompts[0]), ['Basic Fire Energy']);
  const zones = res.state.players.p1.zones;
  assert.ok(zones.active.some((c) => c.instanceId === f.instanceId && c.attachedTo), 'Fire Energy is attached');
  assert.equal(zones.hand.length, 1 + 2, 'the Water Energy plus 2 drawn cards');
});

test('HB 286 Welder with no Fire Energy in hand attaches nothing and draws nothing', () => {
  const state = board({ p1: { hand: [water()] } });
  const res = play(state, trainer('Welder', 'Supporter', WELDER));
  assert.equal(res.error ?? null, null);
  assert.equal(res.state.players.p1.zones.hand.length, 1, 'no attach, so no draw');
});

test('Welder as printed (up to 2 {R}, draw 3) also draws only after an attach', () => {
  const printed = 'Attach up to 2 {R} Energy cards from your hand to 1 of your Pokémon. If you do, draw 3 cards.';
  const none = play(board({ p1: { hand: [water()] } }), trainer('Welder', 'Supporter', printed));
  assert.equal(none.state.players.p1.zones.hand.length, 1);
  const two = play(board({ p1: { hand: [fire(), fire()] } }), trainer('Welder', 'Supporter', printed));
  assert.equal(two.state.players.p1.zones.hand.length, 3, 'two attached, 3 drawn');
});
