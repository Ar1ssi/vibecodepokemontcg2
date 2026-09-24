// Server-side execution of the I134a auto/simple trainer-effect step kinds (design 035
// slice 5), driven through applyCommand the way a live game drives it: a hand -> board
// moveCard, then one resolveChoice per PendingChoice. Real printed texts from the S279
// audit corpus (`batches.md` §1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones, findCard } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { viewFor } from '../view.mjs';

let nextId = 500;
const card = (props) => createCard({ instanceId: nextId++, ...props });
const pokemon = (name, props = {}) => card({ name, supertype: 'Pokémon', hp: 100, stage: 'Basic', ...props });
const energy = (name = 'Basic Psychic Energy', props = {}) =>
  card({ name, type: 'Energy', subtypes: ['Basic'], types: ['Psychic'], ...props });

function setup() {
  const state = createGameState({ gameId: 'steps-missing', seed: 7, rulesEnabled: true });
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
const cardIn = (res, instanceId) => findCard(res.state, instanceId).card;

test('clearStatus: Full Heal clears the Active only; Double Full Heal clears every own Pokémon', () => {
  const game = setup();
  const active = game.p1.zones.active[0];
  const bench = pokemon('P1 Bench');
  bench.specialCondition = 'Asleep';
  game.p1.zones.bench.push(bench);
  active.specialCondition = 'Asleep';
  active.poisoned = true;

  const full = play(game, 'Remove all Special Conditions from your Active Pokémon.', { name: 'Full Heal' }).res;
  assert.equal(full.error, null);
  assert.equal(cardIn(full, active.instanceId).specialCondition, null);
  assert.equal(cardIn(full, active.instanceId).poisoned, undefined);
  assert.equal(cardIn(full, bench.instanceId).specialCondition, 'Asleep', 'the Bench is untouched');
  assert.ok(
    full.events.some((e) => e.type === 'specialConditionUpdated' && e.instanceId === active.instanceId)
  );

  const game2 = setup();
  const active2 = game2.p1.zones.active[0];
  const bench2 = pokemon('P1 Bench');
  bench2.specialCondition = 'Confused';
  game2.p1.zones.bench.push(bench2);
  active2.specialCondition = 'Paralyzed';
  const double = play(game2, 'Remove all Special Conditions from each of your Active Pokémon.', {
    name: 'Double Full Heal',
  }).res;
  assert.equal(double.error, null);
  assert.equal(cardIn(double, active2.instanceId).specialCondition, null);
  assert.equal(cardIn(double, bench2.instanceId).specialCondition, null);
});

test("healEachActive: Brock heals each damaged own Pokémon; Erika's Kindness heals both sides", () => {
  const game = setup();
  const active = game.p1.zones.active[0];
  active.damage = 30;
  const bench = pokemon('P1 Bench');
  bench.damage = 10;
  game.p1.zones.bench.push(bench);
  const opponent = game.p2.zones.active[0];
  opponent.damage = 40;

  const brock = play(game, 'Remove 1 damage counter from each of your Pokémon that has any damage counters on it.', {
    name: 'Brock',
  }).res;
  assert.equal(brock.error, null);
  assert.equal(cardIn(brock, active.instanceId).damage, 20);
  assert.equal(cardIn(brock, bench.instanceId).damage, 0);
  assert.equal(cardIn(brock, opponent.instanceId).damage, 40, 'the opponent is untouched');

  const game2 = setup();
  const active2 = game2.p1.zones.active[0];
  active2.damage = 5;
  const opponent2 = game2.p2.zones.active[0];
  opponent2.damage = 20;
  const erika = play(
    game2,
    "Remove 2 damage counters from each Pokémon (yours and your opponent's) with any damage counters on it. If a Pokémon has just 1 damage counter, remove it.",
    { name: "Erika's Kindness" }
  ).res;
  assert.equal(erika.error, null);
  assert.equal(cardIn(erika, active2.instanceId).damage, 0);
  assert.equal(cardIn(erika, opponent2.instanceId).damage, 0);
});

test('discardStadium: Paint Roller discards the Stadium; no Stadium -> effectStepSkipped', () => {
  const game = setup();
  const stadium = card({
    name: 'Artazon',
    type: 'Trainer',
    trainerType: 'Stadium',
    ownerId: 'p2',
    playerId: 'p2',
  });
  game.state.stadium = stadium;
  game.p1.zones.deck.push(card({ name: 'd1' }));

  const { res } = play(game, 'Discard any Stadium card in play. Then, draw a card.', { name: 'Paint Roller' });
  assert.equal(res.error, null);
  assert.equal(res.state.stadium, null);
  assert.ok(zone(res, 'p2', 'discard').some((c) => c.instanceId === stadium.instanceId));
  assert.equal(zone(res, 'p1', 'hand').length, 1, 'Paint Roller draws its trailing card');

  const game2 = setup();
  const none = play(game2, 'Discard any Stadium card in play.', { name: 'Paint Roller' }).res;
  assert.equal(none.error, null);
  assert.ok(none.events.some((e) => e.type === 'effectStepSkipped' && e.reason === 'no_stadium'));
});

test("shuffleDiscardIntoDeck: Karen shuffles only Pokémon in; Lysandre's Trump Card shuffles every card", () => {
  const game = setup();
  const mon = pokemon('Discarded Mon');
  const item = card({ name: 'Discarded Item', type: 'Trainer', trainerType: 'Item' });
  game.p1.zones.discard.push(mon, item);
  const oppMon = pokemon('P2 Discarded Mon');
  game.p2.zones.discard.push(oppMon);

  const karen = play(
    game,
    'Each player shuffles all Pokémon in his or her discard pile into his or her deck.',
    { name: 'Karen', trainerType: 'Supporter' }
  ).res;
  assert.equal(karen.error, null);
  assert.ok(zone(karen, 'p1', 'deck').some((c) => c.instanceId === mon.instanceId));
  assert.ok(
    zone(karen, 'p1', 'discard').some((c) => c.instanceId === item.instanceId),
    'the non-Pokémon card stays in the discard pile'
  );
  assert.ok(zone(karen, 'p2', 'deck').some((c) => c.instanceId === oppMon.instanceId));
  assert.equal(karen.events.filter((e) => e.type === 'deckShuffled').length, 2);

  const game2 = setup();
  const mon2 = pokemon('Discarded Mon');
  const item2 = card({ name: 'Discarded Item', type: 'Trainer', trainerType: 'Item' });
  game2.p1.zones.discard.push(mon2, item2);
  const trump = play(
    game2,
    "Each player shuffles all cards in his or her discard pile into his or her deck (except for Lysandre's Trump Card).",
    { name: "Lysandre's Trump Card", trainerType: 'Supporter' }
  ).res;
  assert.equal(trump.error, null);
  assert.ok(zone(trump, 'p1', 'deck').some((c) => c.instanceId === mon2.instanceId));
  assert.ok(zone(trump, 'p1', 'deck').some((c) => c.instanceId === item2.instanceId));
});

test('energyToHand: Energy Reset returns chosen attached Energy to hand', () => {
  const game = setup();
  const active = game.p1.zones.active[0];
  const first = energy();
  const second = energy('Basic Fire Energy', { types: ['Fire'] });
  first.attachedTo = active.instanceId;
  second.attachedTo = active.instanceId;
  game.p1.zones.active.push(first, second);

  const { res } = play(game, 'Put as many Energy attached to your Pokémon as you like into your hand.', {
    name: 'Energy Reset',
  });
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice.min, 0);
  assert.equal(res.pendingChoice.max, 2);
  const done = resolve(game, res, [first.instanceId]);
  assert.deepEqual(ids(zone(done, 'p1', 'hand')), [first.instanceId]);
  assert.equal(cardIn(done, first.instanceId).attachedTo, null);
  assert.ok(!zone(done, 'p1', 'active').some((c) => c.instanceId === first.instanceId));
  assert.ok(zone(done, 'p1', 'active').some((c) => c.instanceId === second.instanceId));
});

test('energyToHand: no attached Energy -> effectStepSkipped', () => {
  const game = setup();
  const res = play(game, 'Put as many Energy attached to your Pokémon as you like into your hand.', {
    name: 'Energy Reset',
  }).res;
  assert.equal(res.error, null);
  assert.ok(res.events.some((e) => e.type === 'effectStepSkipped' && e.reason === 'no_attached_energy'));
});

test('eachPlayerDraw: Erika — each player draws up to 3', () => {
  const game = setup();
  for (let i = 0; i < 4; i++) {
    game.p1.zones.deck.push(card({ name: `p1d${i}` }));
    game.p2.zones.deck.push(card({ name: `p2d${i}` }));
  }
  const res = play(game, 'Each player may draw up to 3 cards. You draw first.', {
    name: 'Erika',
    trainerType: 'Supporter',
  }).res;
  assert.equal(res.error, null);
  assert.equal(zone(res, 'p1', 'hand').length, 3);
  assert.equal(zone(res, 'p2', 'hand').length, 3);
});

test('healPerHeads: Moomoo Milk flips 2 coins and heals 3 counters per heads', () => {
  const game = setup();
  game.rng = { next: () => 0.1, shuffle: (array) => [...array] };
  const active = game.p1.zones.active[0];
  active.damage = 60;
  const bench = pokemon('P1 Bench');
  bench.damage = 30;
  game.p1.zones.bench.push(bench);

  const { res } = play(
    game,
    'Choose 1 of your Pokémon. Flip 2 coins. For each heads, remove 3 damage counters from that Pokémon.',
    { name: 'Moomoo Milk' }
  );
  assert.equal(res.error, null);
  const flips = res.events.filter((e) => e.type === 'coinFlipped');
  assert.equal(flips.length, 2);
  assert.equal(flips.filter((f) => f.face === 'heads').length, 2);

  const done = resolve(game, res, [active.instanceId]);
  assert.equal(done.error, null);
  assert.equal(cardIn(done, active.instanceId).damage, 0, '60 damage - 2 heads x 3 counters');
  assert.equal(cardIn(done, bench.instanceId).damage, 30, 'only the chosen Pokémon is healed');
});

test('healPerHeads: a single damaged Pokémon is healed without a choice', () => {
  const game = setup();
  game.rng = { next: () => 0.9, shuffle: (array) => [...array] };
  const active = game.p1.zones.active[0];
  active.damage = 10;

  const res = play(
    game,
    'Choose 1 of your Pokémon. Flip 2 coins. For each heads, remove 3 damage counters from that Pokémon.',
    { name: 'Moomoo Milk' }
  ).res;
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null, 'tails on both flips is a no-op');
  assert.ok(res.events.some((e) => e.type === 'effectStepSkipped' && e.reason === 'no_healing'));
  assert.equal(cardIn(res, active.instanceId).damage, 10);
});

test('rearrangeTop: Pokédex reorders the top 5 cards in selection order', () => {
  const game = setup();
  const top = [
    card({ name: 't1' }),
    card({ name: 't2' }),
    card({ name: 't3' }),
    card({ name: 't4' }),
    card({ name: 't5' }),
  ];
  const rest = [card({ name: 'r1' }), card({ name: 'r2' })];
  game.p1.zones.deck.push(...top, ...rest);

  const { res } = play(game, 'Look at up to 5 cards from the top of your deck and rearrange them as you like.', {
    name: 'Pokédex',
  });
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice.min, 5);
  assert.equal(res.pendingChoice.max, 5);
  const reversed = [...top].reverse().map((c) => c.instanceId);
  const done = resolve(game, res, reversed);
  assert.equal(done.error, null);
  assert.deepEqual(ids(zone(done, 'p1', 'deck')), [...reversed, ...ids(rest)]);
});

test('rearrangeTop: a deck of 1 needs no choice', () => {
  const game = setup();
  game.p1.zones.deck.push(card({ name: 'only' }));
  const res = play(game, 'Look at up to 5 cards from the top of your deck and rearrange them as you like.', {
    name: 'Pokédex',
  }).res;
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null);
});

test('shufflePokemonIntoDeck: Mr. Fuji shuffles the chosen Benched Pokémon and its attachments in', () => {
  const game = setup();
  const bench = pokemon('P1 Bench');
  const attached = energy();
  attached.attachedTo = bench.instanceId;
  game.p1.zones.bench.push(bench, attached);

  const { res } = play(
    game,
    'Choose a Pokémon on your Bench. Shuffle it and any cards attached to it into your deck.',
    { name: 'Mr. Fuji' }
  );
  assert.equal(res.error, null);
  const done = resolve(game, res, [bench.instanceId]);
  assert.equal(done.error, null);
  assert.ok(zone(done, 'p1', 'deck').some((c) => c.instanceId === bench.instanceId));
  assert.ok(zone(done, 'p1', 'deck').some((c) => c.instanceId === attached.instanceId));
  assert.equal(zone(done, 'p1', 'bench').length, 0);
  assert.equal(cardIn(done, attached.instanceId).attachedTo, null);
  assert.ok(done.events.some((e) => e.type === 'deckShuffled' && e.playerId === 'p1'));
});

test('shufflePokemonIntoDeck: shuffling the Active in auto-promotes the only Benched Pokémon (Cassius)', () => {
  const game = setup();
  const active = game.p1.zones.active[0];
  const bench = pokemon('P1 Bench');
  game.p1.zones.bench.push(bench);

  const { res } = play(game, 'Shuffle 1 of your Pokémon and all cards attached to it into your deck.', {
    name: 'Cassius',
    trainerType: 'Supporter',
  });
  assert.equal(res.error, null);
  const done = resolve(game, res, [active.instanceId]);
  assert.equal(done.error, null);
  assert.equal(done.pendingChoice, null);
  assert.equal(zone(done, 'p1', 'active')[0].instanceId, bench.instanceId);
  assert.ok(zone(done, 'p1', 'deck').some((c) => c.instanceId === active.instanceId));
});

const MR_FUJI_TEXT = 'Choose a Pokémon on your Bench. Shuffle it and any cards attached to it into your deck.';

test('shufflePokemonIntoDeck: Mr. Fuji offers only Benched Pokémon, and skips with an empty Bench (design 038 row 10)', () => {
  const game = setup();
  const bench = pokemon('P1 Bench');
  game.p1.zones.bench.push(bench);
  const offered = play(game, MR_FUJI_TEXT, { name: 'Mr. Fuji' }).res;
  assert.equal(offered.error, null);
  assert.deepEqual(
    offered.pendingChoice.options.map((o) => o.instanceId),
    [bench.instanceId]
  );

  const empty = setup();
  const res = play(empty, MR_FUJI_TEXT, { name: 'Mr. Fuji' }).res;
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null);
  assert.equal(zone(res, 'p1', 'active').length, 1);
});

test('shufflePokemonIntoDeck: a stack shuffled in forgets damage, conditions and markers (design 038 row 11)', () => {
  const game = setup();
  const bench = pokemon('P1 Bench');
  bench.damage = 60;
  bench.specialCondition = 'asleep';
  bench.attackMarkers = [{ kind: 'noWeakness', untilTurn: 9 }];
  bench.cannotAttackUntilTurn = 9;
  bench.cannotAttackAttackName = 'Tackle';
  bench.cannotRetreatUntilTurn = 9;
  const tool = card({ name: 'Tool', supertype: 'Trainer', trainerType: 'Pokémon Tool' });
  tool.attachedTo = bench.instanceId;
  tool.discardAtEndOfTurn = true;
  game.p1.zones.bench.push(bench, tool);

  const { res } = play(game, MR_FUJI_TEXT, { name: 'Mr. Fuji' });
  const done = resolve(game, res, [bench.instanceId]);
  assert.equal(done.error, null);
  const shuffled = cardIn(done, bench.instanceId);
  assert.equal(shuffled.damage, 0);
  assert.equal(shuffled.specialCondition, null);
  assert.equal(shuffled.attackMarkers, undefined);
  assert.equal(shuffled.cannotAttackUntilTurn, undefined);
  assert.equal(shuffled.cannotAttackAttackName, undefined);
  assert.equal(shuffled.cannotRetreatUntilTurn, undefined);
  const shuffledTool = cardIn(done, tool.instanceId);
  assert.equal(shuffledTool.attachedTo, null);
  assert.equal(shuffledTool.discardAtEndOfTurn, undefined);
});

test('clearAttackEffects: Channeler clears own markers; Pokémon Ranger clears both sides', () => {
  const game = setup();
  const own = game.p1.zones.active[0];
  const opponent = game.p2.zones.active[0];
  own.attackMarkers = [{ kind: 'noWeakness', untilTurn: 9 }];
  opponent.attackMarkers = [{ kind: 'incomingReduce', amount: 30, untilTurn: 9 }];

  const channeler = play(game, 'Remove all effects of attacks on you and each of your Pokémon.', {
    name: 'Channeler',
    trainerType: 'Supporter',
  }).res;
  assert.equal(channeler.error, null);
  assert.equal(cardIn(channeler, own.instanceId).attackMarkers, undefined);
  assert.ok(
    Array.isArray(cardIn(channeler, opponent.instanceId).attackMarkers),
    'the opponent keeps their markers'
  );

  const game2 = setup();
  const own2 = game2.p1.zones.active[0];
  const opponent2 = game2.p2.zones.active[0];
  own2.attackMarkers = [{ kind: 'noWeakness', untilTurn: 9 }];
  opponent2.attackMarkers = [{ kind: 'noWeakness', untilTurn: 9 }];
  const ranger = play(game2, 'Remove all effects of attacks on each player and his or her Pokémon.', {
    name: 'Pokémon Ranger',
    trainerType: 'Supporter',
  }).res;
  assert.equal(ranger.error, null);
  assert.equal(cardIn(ranger, own2.instanceId).attackMarkers, undefined);
  assert.equal(cardIn(ranger, opponent2.instanceId).attackMarkers, undefined);
});

test('revealPrizes: Town Map turns own Prizes face up; Here Comes Team Rocket! turns both sides', () => {
  const game = setup();
  const town = play(
    game,
    'Turn all of your Prize cards face up. (Those Prize cards remain face up for the rest of the game.)',
    { name: 'Town Map' }
  ).res;
  assert.equal(town.error, null);
  assert.equal(town.state.players.p1.flags.prizesFaceUp, true);
  assert.ok(!town.state.players.p2.flags.prizesFaceUp);
  const reveal = town.events.find((e) => e.type === 'cardsRevealed');
  assert.equal(reveal.cards.length, 6);

  const game2 = setup();
  const rocket = play(
    game2,
    'Each player turns all of his or her Prize cards face up. (Those Prize cards remain face up for the rest of the game.)',
    { name: 'Here Comes Team Rocket!', trainerType: 'Supporter' }
  ).res;
  assert.equal(rocket.error, null);
  assert.equal(rocket.state.players.p1.flags.prizesFaceUp, true);
  assert.equal(rocket.state.players.p2.flags.prizesFaceUp, true);
  assert.equal(rocket.events.filter((e) => e.type === 'cardsRevealed').length, 2);
});

test("reviveFromDiscard: Revive benches your Basic; Echoing Horn takes the opponent's", () => {
  const game = setup();
  const basic = pokemon('Discarded Basic');
  const stage1 = pokemon('Discarded Stage 1', { stage: 'Stage 1' });
  game.p1.zones.discard.push(basic, stage1);

  const { res } = play(game, 'Put a Basic Pokémon from your discard pile onto your Bench.', {
    name: 'Revive',
  });
  assert.equal(res.error, null);
  assert.deepEqual(ids(res.pendingChoice.options), [basic.instanceId]);
  const done = resolve(game, res, [basic.instanceId]);
  assert.equal(done.error, null);
  assert.ok(zone(done, 'p1', 'bench').some((c) => c.instanceId === basic.instanceId));
  assert.ok(zone(done, 'p1', 'discard').some((c) => c.instanceId === stage1.instanceId));

  const game2 = setup();
  const opponentBasic = pokemon('Opponent Discarded Basic');
  game2.p2.zones.discard.push(opponentBasic);
  const horn = play(
    game2,
    "Choose 1 Basic Pokémon card from your opponent's discard pile and put it onto their Bench.",
    { name: 'Echoing Horn' }
  ).res;
  assert.equal(horn.error, null);
  const done2 = resolve(game2, horn, [opponentBasic.instanceId]);
  assert.equal(done2.error, null);
  assert.ok(zone(done2, 'p2', 'bench').some((c) => c.instanceId === opponentBasic.instanceId));
});

test('moveDamageCounters: Damage Pump moves counters and resumes through a donor + receiver pick', () => {
  const game = setup();
  const active = game.p1.zones.active[0];
  active.damage = 40;
  const bench = pokemon('P1 Bench');
  game.p1.zones.bench.push(bench);

  const { res } = play(
    game,
    'Move up to 2 damage counters from 1 of your Pokémon to another of your Pokémon.',
    { name: 'Damage Pump' }
  );
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null, 'one donor and one receiver resolve without a choice');
  assert.equal(cardIn(res, active.instanceId).damage, 20);
  assert.equal(cardIn(res, bench.instanceId).damage, 20);

  const game2 = setup();
  const donorA = game2.p1.zones.active[0];
  donorA.damage = 40;
  const donorB = pokemon('P1 Bench A');
  donorB.damage = 30;
  const receiver = pokemon('P1 Bench B');
  game2.p1.zones.bench.push(donorB, receiver);

  const first = play(
    game2,
    'Move up to 2 damage counters from 1 of your Pokémon to another of your Pokémon.',
    { name: 'Damage Pump' }
  ).res;
  assert.equal(first.error, null);
  assert.deepEqual(ids(first.pendingChoice.options).sort(), [donorA.instanceId, donorB.instanceId].sort());
  const second = resolve(game2, first, [donorA.instanceId]);
  assert.ok(second.pendingChoice, 'the receiver choice follows the donor choice');
  const done = resolve(game2, second, [receiver.instanceId]);
  assert.equal(done.error, null);
  assert.equal(cardIn(done, donorA.instanceId).damage, 20);
  assert.equal(cardIn(done, receiver.instanceId).damage, 20);
  assert.equal(cardIn(done, donorB.instanceId).damage, 30, 'the other donor is untouched');
});

test('prizeToHand: Peonia takes Prizes and refills them from hand', () => {
  const game = setup();
  const handCards = [card({ name: 'h1' }), card({ name: 'h2' })];
  game.p1.zones.hand.push(...handCards);
  const prizes = [...game.p1.zones.prizes];

  const { res } = play(
    game,
    'Put up to 3 Prize cards into your hand. Then, for each Prize card you put into your hand in this way, put a card from your hand face down as a Prize card.',
    { name: 'Peonia', trainerType: 'Supporter' }
  );
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice.max, 3);
  const afterTake = resolve(game, res, [prizes[0].instanceId, prizes[1].instanceId]);
  assert.equal(afterTake.error, null);
  assert.equal(afterTake.pendingChoice.min, 2, 'two taken Prizes must be replaced');
  const done = resolve(game, afterTake, [handCards[0].instanceId, handCards[1].instanceId]);
  assert.equal(done.error, null);
  assert.equal(zone(done, 'p1', 'prizes').length, 6);
  assert.deepEqual(
    ids(zone(done, 'p1', 'hand')).sort(),
    [prizes[0].instanceId, prizes[1].instanceId].sort()
  );
  assert.ok(zone(done, 'p1', 'prizes').some((c) => c.instanceId === handCards[0].instanceId));
});

test('prizeToHand: Peonia offers its blind Prize pick face down, to the chooser and the opponent', () => {
  const game = setup();
  const { res } = play(
    game,
    'Put up to 3 Prize cards into your hand. Then, for each Prize card you put into your hand in this way, put a card from your hand face down as a Prize card.',
    { name: 'Peonia', trainerType: 'Supporter' }
  );
  assert.equal(res.error, null);
  for (const opt of res.pendingChoice.options) {
    assert.deepEqual(Object.keys(opt).sort(), ['faceDown', 'instanceId']);
    assert.equal(opt.faceDown, true);
  }
  const ownView = JSON.stringify(viewFor(res.state, 'p1'));
  assert.ok(!ownView.includes('P1 Prize'), 'the chooser view names no Prize card');
});

test('prizeToHand: a resumed blind pick rejects unknown ids and re-checks the live Prizes', () => {
  const game = setup();
  const prizes = [...game.p1.zones.prizes];
  const { res } = play(game, 'Put up to 3 Prize cards into your hand.', { name: 'Peonia', trainerType: 'Supporter' });
  assert.equal(resolve(game, res, [99999]).error, 'invalid_selection');

  // A Prize that left the zone while the choice was pending (e.g. across a reconnect) is not taken.
  const [gone] = res.state.players.p1.zones.prizes.splice(0, 1);
  res.state.players.p1.zones.discard.push(gone);
  const done = resolve(game, res, [prizes[0].instanceId, prizes[1].instanceId]);
  assert.equal(done.error, null);
  assert.equal(zone(done, 'p1', 'prizes').length, 4, 'only the live Prize is taken');
  assert.ok(zone(done, 'p1', 'discard').some((c) => c.instanceId === prizes[0].instanceId));
  assert.ok(zone(done, 'p1', 'hand').some((c) => c.instanceId === prizes[1].instanceId));
});

test("lookAtFaceDownPrize: Hisuian Heavy Ball trades itself for a Basic; Daisy's Help only looks", () => {
  const game = setup();
  const prizedBasic = pokemon('Prized Basic');
  game.p1.zones.prizes[2] = prizedBasic;

  const { res, trainer } = play(
    game,
    "Look at your face-down Prize cards. You may reveal a Basic Pokémon you find there, put it into your hand, and put this Hisuian Heavy Ball in its place as a face-down Prize card. (If you don't reveal a Basic Pokémon, put this card in the discard pile.)",
    { name: 'Hisuian Heavy Ball' }
  );
  assert.equal(res.error, null);
  assert.deepEqual(ids(res.pendingChoice.options), [prizedBasic.instanceId], 'the "you may" is always asked');
  assert.equal(res.pendingChoice.min, 0);
  const taken = resolve(game, res, [prizedBasic.instanceId]);
  assert.equal(taken.error, null);
  assert.ok(zone(taken, 'p1', 'hand').some((c) => c.instanceId === prizedBasic.instanceId));
  assert.ok(zone(taken, 'p1', 'prizes').some((c) => c.instanceId === trainer.instanceId));
  assert.equal(zone(taken, 'p1', 'prizes').length, 6);
  const revealed = taken.events.filter((e) => e.type === 'cardsRevealed');
  assert.deepEqual(revealed.map((e) => ids(e.cards)), [[prizedBasic.instanceId]], 'only the taken card is revealed');

  const game2 = setup();
  const daisy = play(game2, 'Draw 2 cards. Look at your face-down Prize cards.', {
    name: "Daisy's Help",
    trainerType: 'Supporter',
  }).res;
  assert.equal(daisy.error, null);
  assert.equal(daisy.pendingChoice, null);
  assert.equal(zone(daisy, 'p1', 'prizes').length, 6, 'no Prize is taken');
  const look = daisy.events.find((e) => e.type === 'cardsLookedAt');
  assert.deepEqual(look, { type: 'cardsLookedAt', playerId: 'p1', count: 6, zone: 'prizes' });
  assert.ok(!JSON.stringify(daisy.events).includes('P1 Prize'), 'no Prize name reaches the broadcast events');
});

const HEAVY_BALL_TEXT =
  "Look at your face-down Prize cards. You may reveal a Basic Pokémon you find there, put it into your hand, and put this Hisuian Heavy Ball in its place as a face-down Prize card. (If you don't reveal a Basic Pokémon, put this card in the discard pile.)";

test('lookAtFaceDownPrize: Heavy Ball with no matching Basic skips and discards itself', () => {
  const game = setup();
  const { res, trainer } = play(game, HEAVY_BALL_TEXT, { name: 'Hisuian Heavy Ball' });
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null);
  assert.ok(res.events.some((e) => e.type === 'effectStepSkipped' && e.reason === 'no_matching_prize'));
  assert.ok(zone(res, 'p1', 'discard').some((c) => c.instanceId === trainer.instanceId));
  assert.equal(zone(res, 'p1', 'prizes').length, 6);
});

test('lookAtFaceDownPrize: Heavy Ball chooses between two Basics, or declines', () => {
  const game = setup();
  const basicA = pokemon('Basic A');
  const basicB = pokemon('Basic B');
  game.p1.zones.prizes[1] = basicA;
  game.p1.zones.prizes[4] = basicB;
  const { res } = play(game, HEAVY_BALL_TEXT, { name: 'Hisuian Heavy Ball' });
  assert.deepEqual(ids(res.pendingChoice.options), [basicA.instanceId, basicB.instanceId]);
  const picked = resolve(game, res, [basicB.instanceId]);
  assert.ok(zone(picked, 'p1', 'hand').some((c) => c.instanceId === basicB.instanceId));
  assert.ok(zone(picked, 'p1', 'prizes').some((c) => c.instanceId === basicA.instanceId));

  const game2 = setup();
  game2.p1.zones.prizes[1] = pokemon('Basic C');
  const prizesBefore = ids(game2.p1.zones.prizes);
  const second = play(game2, HEAVY_BALL_TEXT, { name: 'Hisuian Heavy Ball' });
  const declined = resolve(game2, second.res, []);
  assert.equal(declined.error, null);
  assert.deepEqual(ids(zone(declined, 'p1', 'prizes')), prizesBefore, 'Prizes unchanged');
  assert.ok(zone(declined, 'p1', 'discard').some((c) => c.instanceId === second.trainer.instanceId));
  assert.ok(!declined.events.some((e) => e.type === 'cardsRevealed'));
});

test("opponentHandToBenchBasic: Captivating Poké Puff benches opponent Basics; Erika's Invitation switches one in", () => {
  const game = setup();
  const puffBasic = pokemon('Puff Basic');
  game.p2.zones.hand.push(puffBasic, energy());

  const { res } = play(
    game,
    "Your opponent reveals his or her hand. Put any number of Basic Pokémon you find there onto your opponent's Bench.",
    { name: 'Captivating Poké Puff' }
  );
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice.min, 0);
  assert.deepEqual(ids(res.pendingChoice.options), [puffBasic.instanceId]);
  const done = resolve(game, res, [puffBasic.instanceId]);
  assert.equal(done.error, null);
  assert.ok(zone(done, 'p2', 'bench').some((c) => c.instanceId === puffBasic.instanceId));

  const game2 = setup();
  const invitationBasic = pokemon('Invitation Basic');
  game2.p2.zones.hand.push(invitationBasic);
  const oldActive = game2.p2.zones.active[0];
  const invite = play(
    game2,
    "Your opponent reveals their hand, and you put a Basic Pokémon you find there onto your opponent's Bench. If you put a Pokémon onto their Bench in this way, switch in that Pokémon to the Active Spot.",
    { name: "Erika's Invitation", trainerType: 'Supporter' }
  ).res;
  assert.equal(invite.error, null);
  const done2 = resolve(game2, invite, [invitationBasic.instanceId]);
  assert.equal(done2.error, null);
  assert.equal(zone(done2, 'p2', 'active')[0].instanceId, invitationBasic.instanceId);
  assert.ok(zone(done2, 'p2', 'bench').some((c) => c.instanceId === oldActive.instanceId));
});

test('opponentActiveEnergyToDeck: Nita puts the opponent Active Energy on top of their deck', () => {
  const game = setup();
  const opponentActive = game.p2.zones.active[0];
  const first = energy();
  const second = energy('Basic Fire Energy', { types: ['Fire'] });
  first.attachedTo = opponentActive.instanceId;
  second.attachedTo = opponentActive.instanceId;
  game.p2.zones.active.push(first, second);

  const { res } = play(
    game,
    "Put an Energy from your opponent's Active Pokémon on top of their deck.",
    { name: 'Nita', trainerType: 'Supporter' }
  );
  assert.equal(res.error, null);
  const done = resolve(game, res, [first.instanceId]);
  assert.equal(done.error, null);
  assert.equal(zone(done, 'p2', 'deck')[0].instanceId, first.instanceId);
  assert.ok(!zone(done, 'p2', 'active').some((c) => c.instanceId === first.instanceId));
  assert.ok(zone(done, 'p2', 'active').some((c) => c.instanceId === second.instanceId));
});

test("discardOwnBenchPokemon: Giovanni's Exile discards only undamaged Bench with attachments", () => {
  const game = setup();
  const clean = pokemon('Clean Bench');
  const attached = energy();
  attached.attachedTo = clean.instanceId;
  const hurt = pokemon('Hurt Bench');
  hurt.damage = 10;
  game.p1.zones.bench.push(clean, attached, hurt);

  const { res } = play(
    game,
    'Discard up to 2 of your Benched Pokémon that have no damage counters on them and all cards attached to them.',
    { name: "Giovanni's Exile", trainerType: 'Supporter' }
  );
  assert.equal(res.error, null);
  assert.deepEqual(ids(res.pendingChoice.options), [clean.instanceId]);
  const done = resolve(game, res, [clean.instanceId]);
  assert.equal(done.error, null);
  assert.ok(zone(done, 'p1', 'discard').some((c) => c.instanceId === clean.instanceId));
  assert.ok(zone(done, 'p1', 'discard').some((c) => c.instanceId === attached.instanceId));
  assert.ok(zone(done, 'p1', 'bench').some((c) => c.instanceId === hurt.instanceId));
});

test('lostZoneCost: Lost Blender sends 2 hand cards to the Lost Zone, then draws', () => {
  const game = setup();
  const [h1, h2, h3] = [card({ name: 'h1' }), card({ name: 'h2' }), card({ name: 'h3' })];
  game.p1.zones.hand.push(h1, h2, h3);
  const deck = [card({ name: 'd1' }), card({ name: 'd2' })];
  game.p1.zones.deck.push(...deck);

  const { res } = play(game, 'Put 2 cards from your hand in the Lost Zone. If you do, draw a card.', {
    name: 'Lost Blender',
  });
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice.min, 2);
  assert.equal(res.pendingChoice.max, 2);
  const done = resolve(game, res, [h1.instanceId, h2.instanceId]);
  assert.equal(done.error, null);
  assert.deepEqual(ids(zone(done, 'p1', 'lostZone')).sort(), [h1.instanceId, h2.instanceId].sort());
  assert.deepEqual(
    ids(zone(done, 'p1', 'hand')).sort(),
    [h3.instanceId, deck[0].instanceId].sort()
  );
  const view = viewFor(done.state, 'p2');
  assert.ok(
    view.them.zones.lostZone.some((c) => c.name === 'h1'),
    'the Lost Zone is public to both players'
  );
});

test("opponentChoosesFromTop: Riley's opponent discards 2 of the top 5; the rest go to hand", () => {
  const game = setup();
  const top = [
    card({ name: 't1' }),
    card({ name: 't2' }),
    card({ name: 't3' }),
    card({ name: 't4' }),
    card({ name: 't5' }),
  ];
  const rest = [card({ name: 'r1' }), card({ name: 'r2' })];
  game.p1.zones.deck.push(...top, ...rest);

  const { res } = play(
    game,
    'Reveal the top 5 cards of your deck and have your opponent choose 2 of them. Discard the chosen cards and put the remaining cards into your hand.',
    { name: 'Riley', trainerType: 'Supporter' }
  );
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice.player, 'p2');
  assert.equal(res.pendingChoice.max, 2);
  const done = resolve(game, res, [top[0].instanceId, top[1].instanceId]);
  assert.equal(done.error, null);
  assert.ok(zone(done, 'p1', 'discard').some((c) => c.instanceId === top[0].instanceId));
  assert.deepEqual(
    ids(zone(done, 'p1', 'hand')).sort(),
    [top[2].instanceId, top[3].instanceId, top[4].instanceId].sort()
  );
  assert.deepEqual(ids(zone(done, 'p1', 'deck')), ids(rest));
  const reveals = [...res.events, ...done.events].filter((e) => e.type === 'cardsRevealed');
  assert.equal(reveals.length, 1, 'the top cards are revealed once, not again on resume (I147)');
});

test("lookAtOpponentHand: Hand Scope reveals the opponent's hand", () => {
  const game = setup();
  const opponentHand = [card({ name: 'oh1' }), card({ name: 'oh2' })];
  game.p2.zones.hand.push(...opponentHand);

  const res = play(game, 'Your opponent reveals his or her hand.', { name: 'Hand Scope' }).res;
  assert.equal(res.error, null);
  const reveal = res.events.find((e) => e.type === 'cardsRevealed');
  assert.deepEqual(ids(reveal.cards).sort(), ids(opponentHand).sort());
});

test("opponentHandShuffleDeck: Morty shuffles 2 chosen cards from the opponent's hand into their deck", () => {
  const game = setup();
  const opponentHand = [card({ name: 'oh1' }), card({ name: 'oh2' }), card({ name: 'oh3' })];
  game.p2.zones.hand.push(...opponentHand);
  // Morty's play condition (slice 11): a {P} Pokémon was Knocked Out last turn.
  game.p1.flags = {
    ...game.p1.flags,
    koedLastOppTurn: true,
    koedLastOppTurnVictims: [{ name: 'Gardevoir', types: ['Psychic'] }],
  };

  const { res } = play(
    game,
    "You can play this card only if 1 of your {P} Pokémon was Knocked Out during your opponent's last turn. Your opponent reveals their hand. Choose 2 cards you find there. Your opponent shuffles those cards into their deck.",
    { name: 'Morty', trainerType: 'Supporter' }
  );
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice.player, 'p1');
  assert.equal(res.pendingChoice.min, 2);
  const done = resolve(game, res, [opponentHand[0].instanceId, opponentHand[1].instanceId]);
  assert.equal(done.error, null);
  assert.deepEqual(ids(zone(done, 'p2', 'hand')), [opponentHand[2].instanceId]);
  assert.equal(zone(done, 'p2', 'deck').length, 2);
  assert.ok(done.events.some((e) => e.type === 'deckShuffled' && e.playerId === 'p2'));
});

test('discardAnyThenDraw: Secret Mission discards any number, then draws that many', () => {
  const game = setup();
  const hand = [card({ name: 'h1' }), card({ name: 'h2' }), card({ name: 'h3' })];
  game.p1.zones.hand.push(...hand);
  const deck = [card({ name: 'd1' }), card({ name: 'd2' }), card({ name: 'd3' })];
  game.p1.zones.deck.push(...deck);

  const { res } = play(
    game,
    "Look at your opponent's hand. Then, you may discard as many other cards as you want from your hand and draw that many cards.",
    { name: 'Secret Mission' }
  );
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice.min, 0);
  const done = resolve(game, res, [hand[0].instanceId, hand[1].instanceId]);
  assert.equal(done.error, null);
  assert.deepEqual(
    ids(zone(done, 'p1', 'hand')).sort(),
    [hand[2].instanceId, deck[0].instanceId, deck[1].instanceId].sort()
  );
});

test('shuffleHandCardsThenDraw: Maintenance shuffles 2 from hand and draws 1', () => {
  const game = setup();
  const hand = [card({ name: 'h1' }), card({ name: 'h2' }), card({ name: 'h3' })];
  game.p1.zones.hand.push(...hand);
  game.p1.zones.deck.push(card({ name: 'd1' }), card({ name: 'd2' }));

  const { res } = play(
    game,
    "Shuffle 2 cards from your hand into your deck. (If you can't shuffle 2 cards into your deck, you can't play this card.) Then, draw a card.",
    { name: 'Maintenance' }
  );
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice.min, 2);
  const done = resolve(game, res, [hand[0].instanceId, hand[1].instanceId]);
  assert.equal(done.error, null);
  assert.equal(zone(done, 'p1', 'hand').length, 2, 'h3 plus the drawn card');
  assert.equal(zone(done, 'p1', 'deck').length, 3);
  assert.ok(done.events.some((e) => e.type === 'deckShuffled' && e.playerId === 'p1'));
});

test('revealUntilCard: Quick Ball takes the first Pokémon and shuffles the rest back', () => {
  const game = setup();
  const item1 = card({ name: 'i1' });
  const item2 = card({ name: 'i2' });
  const basic = pokemon('Quick Basic');
  const item3 = card({ name: 'i3' });
  game.p1.zones.deck.push(item1, item2, basic, item3);

  const res = play(
    game,
    "Reveal cards from your deck until you reveal a Pokémon. Show that Pokémon to your opponent and put it into your hand. Shuffle the other revealed cards back into your deck. (If you don't reveal a Pokémon, shuffle all the revealed cards back into your deck.)",
    { name: 'Quick Ball' }
  ).res;
  assert.equal(res.error, null);
  assert.ok(zone(res, 'p1', 'hand').some((c) => c.instanceId === basic.instanceId));
  assert.equal(zone(res, 'p1', 'deck').length, 3);
  assert.ok(res.events.some((e) => e.type === 'deckShuffled' && e.playerId === 'p1'));
});

test('revealTopEnergy: Ether attaches a basic Energy and keeps a non-match on top; Gutsy Pickaxe draws it', () => {
  const game = setup();
  const basicEnergy = energy();
  game.p1.zones.deck.push(basicEnergy);
  const ether = play(
    game,
    'Reveal the top card of your deck. If that card is a basic Energy card, attach it to 1 of your Pokémon. If it is not a basic Energy card, return it to the top of your deck.',
    { name: 'Ether' }
  ).res;
  assert.equal(ether.error, null);
  assert.equal(ether.pendingChoice, null);
  assert.equal(cardIn(ether, basicEnergy.instanceId).attachedTo, game.p1.zones.active[0].instanceId);
  assert.equal(zone(ether, 'p1', 'deck').length, 0);

  const game2 = setup();
  const item = card({ name: 'Top Item' });
  game2.p1.zones.deck.push(item);
  const ether2 = play(
    game2,
    'Reveal the top card of your deck. If that card is a basic Energy card, attach it to 1 of your Pokémon. If it is not a basic Energy card, return it to the top of your deck.',
    { name: 'Ether' }
  ).res;
  assert.equal(ether2.error, null);
  assert.deepEqual(ids(zone(ether2, 'p1', 'deck')), [item.instanceId], 'the non-Energy stays on top');

  const game3 = setup();
  const bench = pokemon('Bench');
  game3.p1.zones.bench.push(bench);
  const fightingEnergy = energy('Basic Fighting Energy', { types: ['Fighting'] });
  game3.p1.zones.deck.push(fightingEnergy);
  const gutsy = play(
    game3,
    'Reveal the top card of your deck. If that card is a {F} Energy card, attach it to 1 of your Benched Pokémon. If it is not a {F} Energy card, put it into your hand.',
    { name: 'Gutsy Pickaxe' }
  ).res;
  assert.equal(gutsy.error, null);
  assert.equal(gutsy.pendingChoice, null, 'one Benched target auto-attaches');
  assert.equal(cardIn(gutsy, fightingEnergy.instanceId).attachedTo, bench.instanceId);

  const game4 = setup();
  const item4 = card({ name: 'Not Energy' });
  game4.p1.zones.deck.push(item4);
  const gutsy2 = play(
    game4,
    'Reveal the top card of your deck. If that card is a {F} Energy card, attach it to 1 of your Benched Pokémon. If it is not a {F} Energy card, put it into your hand.',
    { name: 'Gutsy Pickaxe' }
  ).res;
  assert.equal(gutsy2.error, null);
  assert.ok(zone(gutsy2, 'p1', 'hand').some((c) => c.instanceId === item4.instanceId));
});

test('toolOrStadiumToLostZone: Lost Vacuum sends a Tool or the Stadium to the Lost Zone', () => {
  const game = setup();
  const hand = [card({ name: 'h1' }), card({ name: 'h2' })];
  game.p1.zones.hand.push(...hand);
  const active = game.p1.zones.active[0];
  const toolCard = card({ name: 'Air Balloon', type: 'Trainer', trainerType: 'Tool' });
  toolCard.attachedTo = active.instanceId;
  game.p1.zones.active.push(toolCard);

  const { res } = play(
    game,
    'You can use this card only if you put another card from your hand in the Lost Zone. Choose a Pokémon Tool attached to any Pokémon, or any Stadium in play, and put it in the Lost Zone.',
    { name: 'Lost Vacuum' }
  );
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice.min, 1);
  const afterCost = resolve(game, res, [hand[0].instanceId]);
  assert.ok(afterCost.pendingChoice, 'the Tool/Stadium choice follows the cost');
  const done = resolve(game, afterCost, [toolCard.instanceId]);
  assert.equal(done.error, null);
  assert.ok(zone(done, 'p1', 'lostZone').some((c) => c.instanceId === toolCard.instanceId));
  assert.ok(!zone(done, 'p1', 'active').some((c) => c.instanceId === toolCard.instanceId));

  const game2 = setup();
  game2.p1.zones.hand.push(card({ name: 'h1' }));
  const stadium = card({
    name: 'Artazon',
    type: 'Trainer',
    trainerType: 'Stadium',
    ownerId: 'p2',
    playerId: 'p2',
  });
  game2.state.stadium = stadium;
  const vacuum = play(
    game2,
    'You can use this card only if you put another card from your hand in the Lost Zone. Choose a Pokémon Tool attached to any Pokémon, or any Stadium in play, and put it in the Lost Zone.',
    { name: 'Lost Vacuum' }
  ).res;
  assert.equal(vacuum.error, null);
  const afterCost2 = resolve(game2, vacuum, [game2.p1.zones.hand[0].instanceId]);
  const done2 = resolve(game2, afterCost2, [stadium.instanceId]);
  assert.equal(done2.error, null);
  assert.equal(done2.state.stadium, null);
  assert.ok(zone(done2, 'p2', 'lostZone').some((c) => c.instanceId === stadium.instanceId));
});

test('attachAttackTool: a Technical Machine attaches and its granted attack resolves', () => {
  const game = setup();
  const text =
    "Attach this card to 1 of your Pokémon that has Team Magma in its name. That Pokémon may use this card's attack instead of its own. At the end of your turn, discard Team Magma Technical Machine 01. {C} → Crushing Magma : 10 Choose an Energy card attached to the Defending Pokémon and put that card at the bottom of your opponent's deck.";
  const { res, trainer } = play(game, text, { name: 'Team Magma Technical Machine 01' });
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null, 'the only own Pokémon auto-attaches');
  // Keep both decks non-empty so the post-attack win check does not read a deck-out.
  for (const id of ['p1', 'p2']) res.state.players[id].zones.deck.push(card({ name: 'Deck Card' }));
  const active = game.p1.zones.active[0];
  assert.equal(cardIn(res, trainer.instanceId).attachedTo, active.instanceId);
  assert.equal(cardIn(res, trainer.instanceId).discardAtEndOfTurn, true);

  // A Colorless Energy pays the granted attack's {C} cost; Ralts has no printed
  // attacks, so the granted attack is index 0 of the server's attack list.
  const colorless = energy('Basic Colorless Energy', { types: ['Colorless'] });
  colorless.attachedTo = active.instanceId;
  res.state.players.p1.zones.active.push(colorless);
  const attacked = applyCommand(
    res.state,
    { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' },
    game.rng
  );
  assert.equal(attacked.error, null);
  assert.equal(zone(attacked, 'p2', 'active')[0].damage, 10, 'Crushing Magma deals 10');

  // Attacking ends the turn, and the end-of-turn sweep discards the flagged tool.
  assert.ok(!zone(attacked, 'p1', 'active').some((c) => c.instanceId === trainer.instanceId));
  assert.ok(zone(attacked, 'p1', 'discard').some((c) => c.instanceId === trainer.instanceId));
});

test('revealPrizes: the view shows Prize faces once prizesFaceUp is set', () => {
  const game = setup();
  const before = viewFor(game.state, 'p2');
  assert.ok(
    before.them.zones.prizes.every((p) => p.name === undefined),
    'face down to the opponent before the reveal'
  );

  const town = play(
    game,
    'Turn all of your Prize cards face up. (Those Prize cards remain face up for the rest of the game.)',
    { name: 'Town Map' }
  ).res;
  assert.equal(town.error, null);
  const after = viewFor(town.state, 'p2');
  assert.equal(after.them.flags.prizesFaceUp, true);
  assert.ok(after.them.zones.prizes.every((p) => typeof p.name === 'string'));
  const own = viewFor(town.state, 'p1');
  assert.ok(own.you.zones.prizes.every((p) => typeof p.name === 'string'));
});
