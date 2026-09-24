// Design 034 slice 6: one-off activated Ability executables, driven through useAbility with the
// printed card texts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

function setupGame() {
  const rng = createRng(42);
  const state = createGameState({ gameId: 'ability-one-offs', seed: 42, rulesEnabled: true });
  for (const playerId of ['p1', 'p2']) {
    state.players[playerId] = {
      playerId,
      username: playerId,
      zones: createPlayerZones(),
      flags: { abilitiesUsed: {} },
    };
  }
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  return { state, rng };
}

const mon = (instanceId, name = 'Mon', extra = {}) =>
  createCard({ instanceId, name, hp: 100, supertype: 'Pokémon', ...extra });
const card = (instanceId, name = 'Card', extra = {}) => createCard({ instanceId, name, ...extra });
const basicEnergy = (instanceId, type, attachedTo = null) =>
  createCard({
    instanceId,
    name: `${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    types: [type],
    attachedTo,
  });
const stadium = (instanceId, name) =>
  createCard({ instanceId, name, supertype: 'Trainer', subtypes: ['Stadium'] });
const supporter = (instanceId) =>
  createCard({ instanceId, name: 'Supporter', supertype: 'Trainer', subtypes: ['Supporter'] });

function holder(state, text, { zone = 'active', ...extra } = {}) {
  const pokemon = mon(70, 'Holder', {
    hp: 200,
    abilities: [{ name: 'Test Ability', type: 'Ability', text }],
    ...extra,
  });
  state.players.p1.zones[zone].push(pokemon);
  if (state.players.p2.zones.active.length === 0) state.players.p2.zones.active.push(mon(71, 'Opp'));
  return pokemon;
}

const use70 = (state, rng) =>
  applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
const resolveWith = (res, selection, rng) =>
  applyCommand(
    res.state,
    {
      type: 'resolveChoice',
      payload: { choiceId: res.pendingChoice.choiceId, selection },
      playerId: res.pendingChoice.player,
    },
    rng
  );
const abilitySpent = (res) => Boolean(res.state.players.p1.flags.abilitiesUsed?.[70]);
const ids = (cards) => cards.map((c) => c.instanceId);

// ── win-game (Unown MISSING / HAND / DAMAGE) ─────────────────────────────

const UNOWN_HAND =
  'Once during your turn (before your attack), if this Pokémon is your Active Pokémon, and if you have 35 or more cards in your hand, you may use this Ability. If you do, you win this game.';
const UNOWN_DAMAGE =
  'Once during your turn (before your attack), if this Pokémon is your Active Pokémon, and if there are 66 or more damage counters on your Benched Pokémon, you may use this Ability. If you do, you win this game.';
const UNOWN_MISSING =
  'Once during your turn (before your attack), if this Pokémon is your Active Pokémon, and if your opponent has 12 or more Supporter cards in the Lost Zone, you may use this Ability. If you do, you win this game.';

test('ability: Unown HAND wins the game with 35 cards in hand', () => {
  const { state, rng } = setupGame();
  holder(state, UNOWN_HAND);
  for (let i = 0; i < 35; i++) state.players.p1.zones.hand.push(card(100 + i));

  const res = use70(state, rng);
  assert.equal(res.error, null);
  assert.equal(res.state.winner, 'p1');
  assert.equal(res.state.turn.phase, 'ended');
  assert.ok(res.events.some((e) => e.type === 'gameEnded' && e.winner === 'p1'));
});

test('ability: Unown HAND with 34 cards does nothing and is not spent', () => {
  const { state, rng } = setupGame();
  holder(state, UNOWN_HAND);
  for (let i = 0; i < 34; i++) state.players.p1.zones.hand.push(card(100 + i));

  const res = use70(state, rng);
  assert.equal(res.error, null);
  assert.equal(res.state.winner, null);
  assert.equal(res.state.turn.phase, 'main');
  assert.equal(abilitySpent(res), false);
});

test('ability: Unown DAMAGE counts counters on Benched Pokémon only, not a damage bonus', () => {
  const { state, rng } = setupGame();
  holder(state, UNOWN_DAMAGE);
  state.players.p1.zones.active[0].damage = 100;
  state.players.p1.zones.bench.push(mon(72, 'A', { damage: 330 }), mon(73, 'B', { damage: 320 }));

  const short = use70(state, rng);
  assert.equal(short.state.winner, null, '65 Bench counters is short even with Active damage');

  state.players.p1.zones.bench[1].damage = 330;
  const res = use70(state, rng);
  assert.equal(res.state.winner, 'p1');
});

test('ability: Unown MISSING reads Supporters in the opponent Lost Zone', () => {
  const { state, rng } = setupGame();
  holder(state, UNOWN_MISSING);
  for (let i = 0; i < 11; i++) state.players.p2.zones.lostZone.push(supporter(100 + i));
  state.players.p2.zones.lostZone.push(card(150, 'Item', { supertype: 'Trainer', subtypes: ['Item'] }));
  assert.equal(use70(state, rng).state.winner, null);

  state.players.p2.zones.lostZone.push(supporter(111));
  assert.equal(use70(state, rng).state.winner, 'p1');
});

test('ability: Unown win abilities are refused from the Bench', () => {
  const { state, rng } = setupGame();
  state.players.p1.zones.active.push(mon(72));
  holder(state, UNOWN_HAND, { zone: 'bench' });
  for (let i = 0; i < 40; i++) state.players.p1.zones.hand.push(card(100 + i));

  const res = use70(state, rng);
  assert.ok(res.error);
  assert.equal(state.winner, null);
});

// ── draw-variable (Genesect V Fusion Strike System) ─────────────────────

const FUSION_STRIKE_SYSTEM =
  'Once during your turn, you may draw cards until you have as many cards in your hand as you have Fusion Strike Pokémon in play.';

test('ability: Fusion Strike System draws up to the Fusion Strike Pokémon count', () => {
  const { state, rng } = setupGame();
  holder(state, FUSION_STRIKE_SYSTEM, { subtypes: ['Basic', 'V', 'Fusion Strike'] });
  state.players.p1.zones.bench.push(
    mon(72, 'Fusion A', { subtypes: ['Basic', 'Fusion Strike'] }),
    mon(73, 'Fusion B', { subtypes: ['Basic', 'Fusion Strike'] }),
    mon(74, 'Plain', { subtypes: ['Basic'] })
  );
  state.players.p1.zones.hand.push(card(80));
  for (let i = 0; i < 5; i++) state.players.p1.zones.deck.push(card(90 + i));

  const res = use70(state, rng);
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.hand.length, 3, '3 Fusion Strike Pokémon in play');
  assert.equal(abilitySpent(res), true);
});

test('ability: Fusion Strike System with a full enough hand is not spent', () => {
  const { state, rng } = setupGame();
  holder(state, FUSION_STRIKE_SYSTEM, { subtypes: ['Basic', 'V', 'Fusion Strike'] });
  state.players.p1.zones.hand.push(card(80));
  state.players.p1.zones.deck.push(card(90));

  const res = use70(state, rng);
  assert.equal(res.state.players.p1.zones.hand.length, 1);
  assert.equal(abilitySpent(res), false);
});

// ── discard-for-draw (Rotom VSTAR Conversion Star) ──────────────────────

const CONVERSION_STAR =
  "During your turn, you may use this Ability. Discard any number of cards from your hand. Then, draw that many cards. (You can't use more than 1 VSTAR Power in a game.)";

test('ability: Conversion Star discards the chosen cards and draws that many', () => {
  const { state, rng } = setupGame();
  holder(state, CONVERSION_STAR);
  state.players.p1.zones.hand.push(card(80), card(81), card(82));
  for (let i = 0; i < 5; i++) state.players.p1.zones.deck.push(card(90 + i));

  const res1 = use70(state, rng);
  assert.deepEqual(ids(res1.pendingChoice.options), [80, 81, 82]);
  const res2 = resolveWith(res1, [80, 82], rng);
  assert.equal(res2.error, null);
  assert.deepEqual(ids(res2.state.players.p1.zones.discard), [80, 82]);
  assert.deepEqual(ids(res2.state.players.p1.zones.hand), [81, 90, 91]);
});

test('ability: Conversion Star with an empty hand is not spent', () => {
  const { state, rng } = setupGame();
  holder(state, CONVERSION_STAR);
  state.players.p1.zones.deck.push(card(90));
  const res = use70(state, rng);
  assert.equal(res.pendingChoice, null);
  assert.equal(abilitySpent(res), false);
});

// ── deck-place (Aipom Scampering Tail) ──────────────────────────────────

test("ability: Scampering Tail puts the opponent's top card on the bottom", () => {
  const { state, rng } = setupGame();
  holder(
    state,
    "Once during your turn (before your attack), you may put the top card of your opponent's deck on the bottom of their deck without looking at it."
  );
  state.players.p2.zones.deck.push(card(90), card(91), card(92));

  const res = use70(state, rng);
  assert.equal(res.error, null);
  assert.deepEqual(ids(res.state.players.p2.zones.deck), [91, 92, 90]);
});

// ── discard-bench (Hydreigon Weed Out) ──────────────────────────────────

const WEED_OUT =
  'Once during your turn (before your attack), you may choose 3 of your Benched Pokémon. Then, discard your other Benched Pokémon.';

test('ability: Weed Out keeps 3 chosen Benched Pokémon and discards the rest with attachments', () => {
  const { state, rng } = setupGame();
  holder(state, WEED_OUT);
  state.players.p1.zones.bench.push(
    mon(72),
    mon(73),
    mon(74),
    mon(75, 'Gone', { damage: 30 }),
    basicEnergy(76, 'Water', 75)
  );

  const res1 = use70(state, rng);
  assert.equal(res1.pendingChoice.min, 3);
  assert.equal(res1.pendingChoice.max, 3);
  const res2 = resolveWith(res1, [72, 73, 74], rng);
  assert.equal(res2.error, null);
  assert.deepEqual(ids(res2.state.players.p1.zones.bench), [72, 73, 74]);
  assert.deepEqual(ids(res2.state.players.p1.zones.discard).sort(), [75, 76]);
  const gone = res2.state.players.p1.zones.discard.find((c) => c.instanceId === 75);
  assert.equal(gone.damage, 0);
  assert.equal(res2.state.players.p1.zones.discard.find((c) => c.instanceId === 76).attachedTo, null);
});

test('ability: Weed Out with 3 or fewer Benched Pokémon is not spent', () => {
  const { state, rng } = setupGame();
  holder(state, WEED_OUT);
  state.players.p1.zones.bench.push(mon(72), mon(73));
  const res = use70(state, rng);
  assert.equal(res.pendingChoice, null);
  assert.equal(abilitySpent(res), false);
});

// ── energy-swap (Smeargle Second Coat) ──────────────────────────────────

const SECOND_COAT =
  'Once during your turn (before your attack), you may switch a basic Energy attached to your Active Pokémon with a different type of basic Energy card from your discard pile.';

test('ability: Second Coat swaps an attached basic Energy for a different type from discard', () => {
  const { state, rng } = setupGame();
  holder(state, SECOND_COAT);
  state.players.p1.zones.active.push(basicEnergy(80, 'Water', 70));
  state.players.p1.zones.discard.push(basicEnergy(81, 'Water'), basicEnergy(82, 'Fire'));

  const res1 = use70(state, rng);
  assert.deepEqual(ids(res1.pendingChoice.options), [80]);
  const res2 = resolveWith(res1, [80], rng);
  assert.deepEqual(ids(res2.pendingChoice.options), [82], 'same-type Water is not offered');
  const res3 = resolveWith(res2, [82], rng);
  assert.equal(res3.error, null);
  const p1 = res3.state.players.p1.zones;
  assert.equal(p1.active.find((c) => c.instanceId === 82)?.attachedTo, 70);
  assert.deepEqual(ids(p1.discard).sort(), [80, 81]);
  assert.equal(p1.discard.find((c) => c.instanceId === 80).attachedTo, null);
});

test('ability: Second Coat without a different-type replacement is not spent', () => {
  const { state, rng } = setupGame();
  holder(state, SECOND_COAT);
  state.players.p1.zones.active.push(basicEnergy(80, 'Water', 70));
  state.players.p1.zones.discard.push(basicEnergy(81, 'Water'));
  const res = use70(state, rng);
  assert.equal(res.pendingChoice, null);
  assert.equal(abilitySpent(res), false);
});

// ── stadium manipulation ────────────────────────────────────────────────

test('ability: Teleport Room discards the Stadium and plays a differently named one from discard', () => {
  const { state, rng } = setupGame();
  holder(
    state,
    'Once during your turn (before your attack), you may discard any Stadium card in play. If you do, put a Stadium card with a different name from your discard pile into play.'
  );
  state.stadium = stadium(90, 'Path to the Peak');
  state.stadium.ownerId = 'p2';
  state.players.p1.zones.discard.push(stadium(91, 'Path to the Peak'), stadium(92, 'Magma Basin'));

  const res1 = use70(state, rng);
  assert.equal(res1.error, null);
  assert.deepEqual(ids(res1.pendingChoice.options), [92]);
  const res2 = resolveWith(res1, [92], rng);
  assert.equal(res2.error, null);
  assert.equal(res2.state.stadium.instanceId, 92);
  assert.equal(res2.state.stadium.ownerId, 'p1');
  assert.deepEqual(ids(res2.state.players.p2.zones.discard), [90]);
  assert.deepEqual(ids(res2.state.players.p1.zones.discard), [91]);
});

test('ability: Resetting Hole discards the Stadium and this Benched Pokémon', () => {
  const { state, rng } = setupGame();
  state.players.p1.zones.active.push(mon(72));
  holder(
    state,
    'Once during your turn (before your attack), if this Pokémon is on your Bench, you may discard any Stadium card in play. If you do, discard this Pokémon and all cards attached to it.',
    { zone: 'bench' }
  );
  state.players.p1.zones.bench.push(basicEnergy(80, 'Fighting', 70));
  state.stadium = stadium(90, 'Magma Basin');
  state.stadium.ownerId = 'p1';

  const res = use70(state, rng);
  assert.equal(res.error, null);
  assert.equal(res.state.stadium, null);
  assert.deepEqual(ids(res.state.players.p1.zones.bench), []);
  assert.deepEqual(ids(res.state.players.p1.zones.discard).sort(), [70, 80, 90]);
});

test('ability: Resetting Hole from the Active Spot does nothing and is not spent', () => {
  const { state, rng } = setupGame();
  holder(
    state,
    'Once during your turn (before your attack), if this Pokémon is on your Bench, you may discard any Stadium card in play. If you do, discard this Pokémon and all cards attached to it.'
  );
  state.stadium = stadium(90, 'Magma Basin');
  const res = use70(state, rng);
  assert.equal(res.state.stadium?.instanceId, 90);
  assert.equal(abilitySpent(res), false);
});

const GRIND_UP =
  'Once during your turn (before your attack), you may discard any Stadium card in play. If you do, attach up to 3 in any combination of {R} and {M} Energy cards from your hand to this Pokémon.';

test('ability: Grind Up discards the Stadium, then attaches any mix of {R}/{M} from hand', () => {
  const { state, rng } = setupGame();
  holder(state, GRIND_UP);
  state.stadium = stadium(90, 'Magma Basin');
  state.stadium.ownerId = 'p1';
  state.players.p1.zones.hand.push(
    basicEnergy(80, 'Metal'),
    basicEnergy(81, 'Metal'),
    basicEnergy(82, 'Fire'),
    basicEnergy(83, 'Water'),
    card(84, 'Filler')
  );

  const res1 = use70(state, rng);
  assert.equal(res1.error, null);
  assert.equal(res1.state.stadium, null);
  assert.deepEqual(ids(res1.pendingChoice.options), [80, 81, 82]);
  assert.equal(res1.pendingChoice.max, 3);
  const res2 = resolveWith(res1, [80, 81], rng);
  assert.equal(res2.error, null);
  const attached = res2.state.players.p1.zones.active.filter((c) => c.attachedTo === 70);
  assert.deepEqual(ids(attached).sort(), [80, 81], 'two of the same type attach together');
  assert.deepEqual(ids(res2.state.players.p1.zones.hand).sort(), [82, 83, 84], 'no hand card was discarded');
});

test('ability: Grind Up with no Stadium in play attaches nothing and is not spent', () => {
  const { state, rng } = setupGame();
  holder(state, GRIND_UP);
  state.players.p1.zones.hand.push(basicEnergy(80, 'Metal'));
  const res = use70(state, rng);
  assert.equal(res.pendingChoice, null);
  assert.deepEqual(ids(res.state.players.p1.zones.hand), [80]);
  assert.equal(abilitySpent(res), false);
});
