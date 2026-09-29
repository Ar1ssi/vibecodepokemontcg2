// Design 059: a card taken from the deck into the hand is named in `cardsRevealed` only when
// its printed text reveals it, and a public reveal carries each card's art (`src`) so the
// opponent's client can draw a card its view still shows face down. Texts are corpus rows
// (out/pkmn-trainer-cards.json, out/pkmn-pokemon-cards.json), cited per test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

const art = (id) => `https://img.test/card-${id}.png`;

function setupGame({ rulesEnabled = true } = {}) {
  const rng = createRng(12345);
  const state = createGameState({ gameId: 'deck-reveal', seed: 12345, rulesEnabled });
  for (const id of ['p1', 'p2']) {
    state.players[id] = {
      playerId: id,
      username: id,
      zones: createPlayerZones(),
      flags: { abilitiesUsed: {}, supporterPlayed: false },
    };
  }
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  state.players.p1.zones.active.push(
    createCard({ instanceId: 1, name: 'Pikachu', hp: 70, supertype: 'Pokémon', stage: 'Basic', src: art(1) })
  );
  state.players.p2.zones.active.push(
    createCard({ instanceId: 2, name: 'Squirtle', hp: 60, supertype: 'Pokémon', stage: 'Basic', src: art(2) })
  );
  return { state, rng };
}

const pokemon = (instanceId, name, extra = {}) =>
  createCard({ instanceId, name, hp: 90, supertype: 'Pokémon', stage: 'Basic', src: art(instanceId), ...extra });
const basicEnergy = (instanceId, type) =>
  createCard({
    instanceId,
    name: `Basic ${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType: type,
    type: 'Energy',
    src: art(instanceId),
  });
const item = (instanceId, name, text, extra = {}) =>
  createCard({ instanceId, name, supertype: 'Trainer', trainerType: 'Item', type: 'Trainer', text, src: art(instanceId), ...extra });
const supporter = (instanceId, name, text) =>
  createCard({
    instanceId,
    name,
    supertype: 'Trainer',
    trainerType: 'Supporter',
    subtypes: ['Supporter'],
    type: 'Trainer',
    text,
    src: art(instanceId),
  });

const run = (state, rng, type, payload = {}, playerId = 'p1') => {
  const res = applyCommand(state, { type, payload, playerId }, rng);
  assert.equal(res.error, null, `${type}: ${res.reason || res.error}`);
  return res;
};
const pick = (res, rng, selection) =>
  run(res.state, rng, 'resolveChoice', { choiceId: res.pendingChoice.choiceId, selection });
const reveals = (res) => res.events.filter((e) => e.type === 'cardsRevealed');
const movedToHand = (res) =>
  res.events.filter((e) => e.type === 'cardMoved' && e.from === 'deck' && e.to === 'hand').map((e) => e.instanceId);
const handIds = (res, playerId = 'p1') => res.state.players[playerId].zones.hand.map((c) => c.instanceId);

// Ultra Ball (30th Celebration 128).
const ULTRA_BALL =
  'You can use this card only if you discard 2 other cards from your hand. Search your deck for a Pokémon, reveal it, and put it into your hand. Then, shuffle your deck.';

test('trainer: Ultra Ball reveals the searched Pokémon with its art', () => {
  const { state, rng } = setupGame();
  state.players.p1.zones.hand.push(
    item(7, 'Ultra Ball', ULTRA_BALL),
    basicEnergy(15, 'Lightning'),
    item(16, 'Potion', 'Heal 30 damage from 1 of your Pokémon.')
  );
  state.players.p1.zones.deck.push(pokemon(31, 'Raichu', { stage: 'Stage 1' }), basicEnergy(40, 'Fire'));

  const played = run(state, rng, 'playTrainer', { instanceId: 7 });
  const discarded = pick(played, rng, [15, 16]);
  const searched = pick(discarded, rng, [31]);

  assert.deepEqual(movedToHand(searched), [31]);
  assert.deepEqual(reveals(searched).map((e) => e.cards), [[{ instanceId: 31, name: 'Raichu', src: art(31) }]]);
  assert.ok(handIds(searched).includes(31));
});

// Cassiopeia (Shrouded Fable 094).
const CASSIOPEIA =
  'You can use this card only when it is the last card in your hand. Search your deck for up to 2 cards and put them into your hand. Then, shuffle your deck.';

test('trainer: Cassiopeia searches without revealing, so no event names the cards', () => {
  const { state, rng } = setupGame();
  state.players.p1.zones.hand.push(supporter(8, 'Cassiopeia', CASSIOPEIA));
  state.players.p1.zones.deck.push(pokemon(31, 'Raichu'), basicEnergy(40, 'Fire'), pokemon(41, 'Pichu'));

  const played = run(state, rng, 'playTrainer', { instanceId: 8 });
  // The parser reads "up to 2 cards" as 1 today (an ISSUES line); one pick shows the rule.
  const searched = pick(played, rng, [31]);

  assert.deepEqual(movedToHand(searched), [31]);
  assert.deepEqual(reveals(searched), []);
  assert.ok(!JSON.stringify(searched.events).includes('Raichu'), 'the hidden pick is never named');
});

// Pokémon Collector (HeartGold & SoulSilver 97) — the older "show them to your opponent".
const POKEMON_COLLECTOR =
  'Search your deck for up to 3 Basic Pokémon, show them to your opponent, and put them into your hand. Shuffle your deck afterward.';

test('trainer: Pokémon Collector\'s "show them to your opponent" is a reveal', () => {
  const { state, rng } = setupGame();
  state.players.p1.zones.hand.push(supporter(9, 'Pokémon Collector', POKEMON_COLLECTOR));
  state.players.p1.zones.deck.push(pokemon(31, 'Pichu'), pokemon(32, 'Cleffa'), basicEnergy(40, 'Fire'));

  const played = run(state, rng, 'playTrainer', { instanceId: 9 });
  const searched = pick(played, rng, [31, 32]);

  assert.deepEqual(reveals(searched).map((e) => e.cards.map((c) => [c.instanceId, c.src])), [
    [
      [31, art(31)],
      [32, art(32)],
    ],
  ]);
});

// Nest Ball (Paldean Fates 084).
const NEST_BALL = 'Search your deck for a Basic Pokémon and put it onto your Bench. Then, shuffle your deck.';

test('trainer: Nest Ball still names its benched Pokémon, which is public', () => {
  const { state, rng } = setupGame();
  state.players.p1.zones.hand.push(item(10, 'Nest Ball', NEST_BALL));
  state.players.p1.zones.deck.push(pokemon(31, 'Pichu'));

  const played = run(state, rng, 'playTrainer', { instanceId: 10 });
  const searched = pick(played, rng, [31]);

  assert.deepEqual(movedToHand(searched), []);
  assert.deepEqual(reveals(searched).map((e) => e.cards.map((c) => c.instanceId)), [[31]]);
});

// Great Ball (Paldea Evolved 183).
const GREAT_BALL =
  'Look at the top 7 cards of your deck. You may reveal a Pokémon you find there and put it into your hand. Shuffle the other cards back into your deck.';

test('trainer: Great Ball reveals the Pokémon it takes from the top of the deck', () => {
  const { state, rng } = setupGame();
  state.players.p1.zones.hand.push(item(11, 'Great Ball', GREAT_BALL));
  state.players.p1.zones.deck.push(basicEnergy(40, 'Fire'), pokemon(31, 'Pichu'), basicEnergy(41, 'Water'));

  const played = run(state, rng, 'playTrainer', { instanceId: 11 });
  const taken = pick(played, rng, [31]);

  assert.deepEqual(movedToHand(taken), [31]);
  assert.deepEqual(reveals(taken).map((e) => e.cards), [[{ instanceId: 31, name: 'Pichu', src: art(31) }]]);
});

// Explorer's Guidance (Prismatic Evolutions 107).
const EXPLORERS_GUIDANCE =
  'Look at the top 6 cards of your deck and put 2 of them into your hand. Discard the other cards.';

test("trainer: Explorer's Guidance puts its looked-at cards in the hand unrevealed", () => {
  const { state, rng } = setupGame();
  state.players.p1.zones.hand.push(supporter(12, 'Explorer’s Guidance', EXPLORERS_GUIDANCE));
  for (let i = 0; i < 6; i++) state.players.p1.zones.deck.push(pokemon(50 + i, `Deck Mon ${i}`));

  let res = run(state, rng, 'playTrainer', { instanceId: 12 });
  while (res.pendingChoice) {
    const options = res.pendingChoice.options.map((o) => o.instanceId);
    res = pick(res, rng, options.slice(0, res.pendingChoice.max));
  }

  const taken = movedToHand(res);
  assert.ok(taken.length > 0, 'cards went into the hand');
  const revealedIds = reveals(res).flatMap((e) => e.cards.map((c) => c.instanceId));
  assert.deepEqual(revealedIds.filter((id) => taken.includes(id)), [], 'no hand pick is named');
});

// Town Store (Obsidian Flames 196).
const TOWN_STORE =
  'Once during each player’s turn, that player may search their deck for a Pokémon Tool card, reveal it, and put it into their hand. Then, that player shuffles their deck.';

test('stadium: Town Store reveals the Pokémon Tool it searches', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 60,
    name: 'Town Store',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: TOWN_STORE,
    src: art(60),
  });
  state.players.p1.zones.deck.push(
    item(61, 'Bravery Charm', 'The Basic Pokémon this card is attached to gets +50 HP.', {
      trainerType: 'Pokémon Tool',
      subtypes: ['Pokémon Tool'],
    }),
    basicEnergy(40, 'Fire')
  );

  const used = run(state, rng, 'stadium-effect');
  const searched = pick(used, rng, [61]);

  assert.deepEqual(movedToHand(searched), [61]);
  assert.deepEqual(reveals(searched).map((e) => e.cards), [[{ instanceId: 61, name: 'Bravery Charm', src: art(61) }]]);
});

const holder = (state, name, abilityName, text) =>
  state.players.p1.zones.bench.push(
    pokemon(70, name, { hp: 200, abilities: [{ name: abilityName, type: 'Ability', text }] })
  );

// Aromatisse Scent Collection (Perfect Order 036).
const SCENT_COLLECTION =
  'Once during your turn, you may use this Ability. Search your deck for up to 2 Basic {P} Energy cards, reveal them, and put them into your hand. Then, shuffle your deck.';

test('ability: Aromatisse Scent Collection reveals the Energy it searches', () => {
  const { state, rng } = setupGame();
  holder(state, 'Aromatisse', 'Scent Collection', SCENT_COLLECTION);
  state.players.p1.zones.deck.push(basicEnergy(40, 'Psychic'), basicEnergy(41, 'Psychic'), basicEnergy(42, 'Fire'));

  const used = run(state, rng, 'useAbility', { instanceId: 70 });
  const searched = pick(used, rng, [40, 41]);

  assert.deepEqual(movedToHand(searched).sort(), [40, 41]);
  assert.deepEqual(
    reveals(searched).flatMap((e) => e.cards.map((c) => [c.instanceId, c.src])).sort(),
    [
      [40, art(40)],
      [41, art(41)],
    ]
  );
});

// Pidgeot ex Quick Search (Paldean Fates 221).
const QUICK_SEARCH =
  "Once during your turn, you may search your deck for a card and put it into your hand. Then, shuffle your deck. You can't use more than 1 Quick Search Ability each turn.";

test('ability: Pidgeot ex Quick Search keeps its card hidden', () => {
  const { state, rng } = setupGame();
  holder(state, 'Pidgeot ex', 'Quick Search', QUICK_SEARCH);
  state.players.p1.zones.deck.push(item(31, 'Rare Candy', 'Choose 1 of your Basic Pokémon in play.'), basicEnergy(40, 'Fire'));

  const used = run(state, rng, 'useAbility', { instanceId: 70 });
  const searched = pick(used, rng, [31]);

  assert.deepEqual(movedToHand(searched), [31]);
  assert.deepEqual(reveals(searched), []);
  assert.ok(!JSON.stringify(searched.events).includes('Rare Candy'));
});

// Jirachi Charge Energy (Paradox Rift 126).
const CHARGE_ENERGY =
  'Search your deck for up to 2 Basic Energy cards, reveal them, and put them into your hand. Then, shuffle your deck.';

test('attack: Jirachi Charge Energy reveals the Energy it searches, with art', () => {
  const { state, rng } = setupGame({ rulesEnabled: false });
  state.players.p1.zones.active[0] = pokemon(1, 'Jirachi', {
    attacks: [{ name: 'Charge Energy', cost: [], damage: '', text: CHARGE_ENERGY }],
  });
  state.players.p1.zones.deck.push(basicEnergy(40, 'Metal'), basicEnergy(41, 'Water'), pokemon(31, 'Pichu'));
  for (let i = 0; i < 6; i++) state.players.p1.zones.prizes.push(pokemon(80 + i, `Prize ${i}`));

  const attacked = run(state, rng, 'attack', { attackIndex: 0 });
  assert.equal(attacked.pendingChoice?.player, 'p1');
  const searched = pick(attacked, rng, [40, 41]);

  assert.deepEqual(movedToHand(searched).sort(), [40, 41]);
  assert.deepEqual(reveals(searched).map((e) => e.cards.map((c) => [c.instanceId, c.src])), [
    [
      [40, art(40)],
      [41, art(41)],
    ],
  ]);
});

test('attack: a search that does not reveal names nothing (Chase Up wording)', () => {
  const { state, rng } = setupGame({ rulesEnabled: false });
  state.players.p1.zones.active[0] = pokemon(1, 'Searcher', {
    attacks: [{ name: 'Find', cost: [], damage: '', text: 'Search your deck for a card and put it into your hand. Then, shuffle your deck.' }],
  });
  state.players.p1.zones.deck.push(pokemon(31, 'Pichu'), basicEnergy(40, 'Fire'));
  for (let i = 0; i < 6; i++) state.players.p1.zones.prizes.push(pokemon(80 + i, `Prize ${i}`));

  const attacked = run(state, rng, 'attack', { attackIndex: 0 });
  const searched = pick(attacked, rng, [31]);

  assert.deepEqual(movedToHand(searched), [31]);
  assert.deepEqual(reveals(searched), []);
});

// Radio Tower (Neo Destiny 95): a look only its player sees.
const RADIO_TOWER =
  'Once during each player’s turn (before attacking), that player may look at the top 2 cards of his or her deck and put them back in the same order.';

test('stadium: Radio Tower\'s private look carries no art', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({ instanceId: 62, name: 'Radio Tower', supertype: 'Trainer', subtypes: ['Stadium'], text: RADIO_TOWER });
  state.players.p1.zones.deck.push(pokemon(31, 'Pichu'), basicEnergy(40, 'Fire'), basicEnergy(41, 'Water'));

  const used = run(state, rng, 'stadium-effect');
  const peeks = reveals(used).filter((e) => e.peek);
  assert.equal(peeks.length, 1);
  assert.ok(peeks[0].cards.every((c) => c.src === undefined));
});
