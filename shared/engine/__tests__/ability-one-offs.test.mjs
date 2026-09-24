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

// ── transform ───────────────────────────────────────────────────────────

const STANCE_CHANGE =
  'Once during your turn, you may switch this Pokémon with an Aegislash in your hand. Any attached cards, damage counters, Special Conditions, turns in play, and any other effects remain on the new Pokémon.';

test('ability: Stance Change swaps the evolved Aegislash for the hand copy, keeping the stack', () => {
  const { state, rng } = setupGame();
  state.players.p1.zones.active.push(mon(60, 'Honedge', { damage: 40, enteredPlayTurn: 1 }));
  const aegislash = mon(70, 'Aegislash', {
    stage: 'Stage 2',
    attachedTo: 60,
    abilities: [{ name: 'Stance Change', type: 'Ability', text: STANCE_CHANGE }],
  });
  state.players.p1.zones.active.push(aegislash, basicEnergy(61, 'Metal', 60));
  state.players.p2.zones.active.push(mon(71, 'Opp'));
  state.players.p1.zones.hand.push(mon(80, 'Aegislash', { stage: 'Stage 2' }), mon(81, 'Honedge'));

  const res1 = use70(state, rng);
  assert.equal(res1.error, null);
  assert.deepEqual(ids(res1.pendingChoice.options), [80]);
  const res2 = resolveWith(res1, [80], rng);
  assert.equal(res2.error, null);
  const zones = res2.state.players.p1.zones;
  assert.equal(zones.active.find((c) => c.instanceId === 80)?.attachedTo, 60);
  assert.equal(zones.active.find((c) => c.instanceId === 60).damage, 40);
  assert.equal(zones.active.find((c) => c.instanceId === 61).attachedTo, 60);
  assert.deepEqual(ids(zones.hand).sort(), [70, 81]);
  assert.equal(zones.hand.find((c) => c.instanceId === 70).abilityUsed, false);
});

test('ability: Schooling swaps an unevolved Wishiwashi, moving counters, Energy and conditions', () => {
  const { state, rng } = setupGame();
  holder(
    state,
    'Once during your turn (before your attack), you may switch this Pokémon with a Wishiwashi-GX in your hand. Any attached cards, damage counters, Special Conditions, turns in play, and any other effects remain on the new Pokémon.',
    { name: 'Wishiwashi', damage: 20, enteredPlayTurn: 1, specialCondition: 'Confused' }
  );
  state.players.p1.zones.active.push(basicEnergy(61, 'Water', 70));
  state.players.p1.zones.hand.push(mon(80, 'Wishiwashi-GX', { hp: 200 }));

  const res = resolveWith(use70(state, rng), [80], rng);
  assert.equal(res.error, null);
  const zones = res.state.players.p1.zones;
  const gx = zones.active.find((c) => !c.attachedTo);
  assert.equal(gx.instanceId, 80);
  assert.equal(gx.damage, 20);
  assert.equal(gx.enteredPlayTurn, 1);
  assert.equal(gx.specialCondition, 'Confused');
  assert.equal(zones.active.find((c) => c.instanceId === 61).attachedTo, 80);
  const old = zones.hand.find((c) => c.instanceId === 70);
  assert.equal(old.damage, 0);
  assert.equal(old.specialCondition, null);
});

test('ability: V Transformation puts a Basic Pokémon V from discard in place; Ditto V is discarded', () => {
  const { state, rng } = setupGame();
  holder(
    state,
    'Once during your turn, you may choose a Basic Pokémon V from your discard pile and switch it with this Pokémon. Any attached cards, damage counters, Special Conditions, turns in play, and any other effects remain on the new Pokémon.',
    { name: 'Ditto V', damage: 30 }
  );
  state.players.p1.zones.discard.push(
    mon(80, 'Zacian V', { subtypes: ['Basic', 'V'] }),
    mon(81, 'Pikachu', { subtypes: ['Basic'] }),
    mon(82, 'Zacian VMAX', { stage: 'VMAX', subtypes: ['VMAX'] })
  );

  const res1 = use70(state, rng);
  assert.deepEqual(ids(res1.pendingChoice.options), [80]);
  const res2 = resolveWith(res1, [80], rng);
  const zones = res2.state.players.p1.zones;
  assert.equal(zones.active[0].instanceId, 80);
  assert.equal(zones.active[0].damage, 30);
  assert.ok(zones.discard.some((c) => c.instanceId === 70));
});

test('ability: Phantom Transformation discards Zoroark and its cards; the Stage 1 enters fresh', () => {
  const { state, rng } = setupGame();
  holder(
    state,
    'Once during your turn, you may choose a Stage 1 Pokémon, except any Zoroark, from your discard pile. If you do, discard this Pokémon and all attached cards, and put the chosen Pokémon in its place.',
    { name: 'Zoroark', stage: 'Stage 1', damage: 50 }
  );
  state.players.p1.zones.active.push(basicEnergy(61, 'Darkness', 70));
  state.players.p1.zones.discard.push(
    mon(80, 'Zoroark', { stage: 'Stage 1' }),
    mon(81, 'Kirlia', { stage: 'Stage 1' })
  );

  const res1 = use70(state, rng);
  assert.deepEqual(ids(res1.pendingChoice.options), [81]);
  const res2 = resolveWith(res1, [81], rng);
  const zones = res2.state.players.p1.zones;
  assert.deepEqual(ids(zones.active), [81]);
  assert.equal(zones.active[0].damage || 0, 0);
  assert.equal(zones.active[0].enteredPlayTurn, 2);
  assert.deepEqual(ids(zones.discard).sort(), [61, 70, 80]);
});

const TRANSFORMATIVE_START =
  'Once during your first turn, if this Pokémon is in the Active Spot, you may search your deck and choose a Basic Pokémon you find there, except any Ditto. If you do, discard this Pokémon and all attached cards, and put the chosen Pokémon in its place. Then, shuffle your deck.';

test('ability: Transformative Start searches the deck for a non-Ditto Basic on the first turn', () => {
  const { state, rng } = setupGame();
  holder(state, TRANSFORMATIVE_START, { name: 'Ditto' });
  state.players.p1.zones.deck.push(
    mon(80, 'Ditto'),
    mon(81, 'Charmander'),
    mon(82, 'Charmeleon', { stage: 'Stage 1' }),
    card(83)
  );

  const res1 = use70(state, rng);
  assert.equal(res1.error, null);
  assert.deepEqual(ids(res1.pendingChoice.options), [81]);
  const res2 = resolveWith(res1, [81], rng);
  const zones = res2.state.players.p1.zones;
  assert.deepEqual(ids(zones.active), [81]);
  assert.deepEqual(ids(zones.hand), [], 'the searched card goes into play, not the hand');
  assert.deepEqual(ids(zones.discard), [70]);
  assert.ok(res2.events.some((e) => e.type === 'deckShuffled'));
});

test('ability: Transformative Start is refused after your first turn', () => {
  const { state, rng } = setupGame();
  state.turn.number = 3;
  holder(state, TRANSFORMATIVE_START, { name: 'Ditto' });
  state.players.p1.zones.deck.push(mon(81, 'Charmander'));
  assert.ok(use70(state, rng).error);
});

test('ability: Ditto Transform puts a hand Basic on top; the new top keeps the stack state', () => {
  const { state, rng } = setupGame();
  holder(
    state,
    'During your turn (before your attack), you may put a Basic Pokémon from your hand on top of this Pokémon. (This does not count as playing that Pokémon or evolving.) This Pokémon is now that Pokémon. (Any cards attached to this Pokémon, damage counters, Special Conditions, turns in play, and any other effects remain on the new Pokémon.)',
    { name: 'Ditto', damage: 10 }
  );
  state.players.p1.zones.hand.push(mon(80, 'Mewtwo', { hp: 120 }), mon(81, 'Kadabra', { stage: 'Stage 1' }));

  const res1 = use70(state, rng);
  assert.deepEqual(ids(res1.pendingChoice.options), [80]);
  const res2 = resolveWith(res1, [80], rng);
  const zones = res2.state.players.p1.zones;
  assert.equal(zones.active.find((c) => c.instanceId === 80)?.attachedTo, 70);
  assert.equal(zones.active.find((c) => c.instanceId === 70).damage, 10);
  assert.deepEqual(ids(zones.hand), [81]);
});

test('ability: Stance Change without a matching hand card is not spent', () => {
  const { state, rng } = setupGame();
  holder(state, STANCE_CHANGE, { name: 'Aegislash' });
  state.players.p1.zones.hand.push(mon(81, 'Honedge'));
  const res = use70(state, rng);
  assert.equal(res.pendingChoice, null);
  assert.equal(abilitySpent(res), false);
});

// ── self-attach as Special Energy ───────────────────────────────────────

const BUZZAP_THUNDER =
  'Once during your turn (before your attack), you may Knock Out this Pokémon and attach it to one of your {L} Pokémon as a Special Energy card. This card provides 2 {L} Energy only while this card is attached to a Pokémon.';

test('ability: Buzzap Thunder Knocks Out Electrode, gives Prizes, and attaches it as 2 {L}', () => {
  const { state, rng } = setupGame();
  state.players.p1.zones.active.push(
    mon(72, 'Zapdos', { types: ['Lightning'], attacks: [{ name: 'Bolt', cost: ['Lightning', 'Lightning'], damage: '60' }] })
  );
  holder(state, BUZZAP_THUNDER, { zone: 'bench', name: 'Electrode', types: ['Lightning'] });
  state.players.p1.zones.bench.push(
    mon(73, 'Pikachu', { types: ['Lightning'] }),
    mon(74, 'Bulbasaur', { types: ['Grass'] }),
    basicEnergy(75, 'Lightning', 70)
  );
  for (let i = 0; i < 6; i++) state.players.p2.zones.prizes.push(card(200 + i));

  const res1 = use70(state, rng);
  assert.equal(res1.error, null);
  assert.deepEqual(ids(res1.pendingChoice.options).sort(), [72, 73], 'only {L} Pokémon, never itself');
  const res2 = resolveWith(res1, [72], rng);
  assert.equal(res2.error, null);
  const zones = res2.state.players.p1.zones;
  const electrode = zones.active.find((c) => c.instanceId === 70);
  assert.equal(electrode?.attachedTo, 72);
  assert.deepEqual(electrode.asEnergy.provides, ['Lightning', 'Lightning']);
  assert.ok(zones.discard.some((c) => c.instanceId === 75), 'its own Energy is discarded');
  assert.ok(res2.events.some((e) => e.type === 'pokemonKnockedOut' && e.instanceId === 70));
  assert.equal(res2.state.players.p2.flags.prizesOwed, 1);
});

test('ability: an Electrode attached as Energy pays an attack cost and is not the top Pokémon', async () => {
  const { topPokemonCard } = await import('../rules/evolved-pokemon.mjs');
  const { serverEnergyDescriptor } = await import('../rules/server-energy.mjs');
  const { expandEnergyEntries } = await import('../rules/attack-engine.mjs');
  const root = mon(72, 'Zapdos', { types: ['Lightning'] });
  const electrode = mon(70, 'Electrode', { stage: 'Stage 1', attachedTo: 72, asEnergy: { provides: ['Lightning', 'Lightning'] } });
  assert.equal(topPokemonCard([root, electrode], root), root);
  assert.deepEqual(expandEnergyEntries([serverEnergyDescriptor(electrode)]), ['Lightning', 'Lightning']);
  electrode.attachedTo = null;
  const { isPokemon, isEnergy } = await import('../cards.mjs');
  assert.equal(isPokemon(electrode), true, 'off the board it is a Pokémon again');
  assert.equal(isEnergy(electrode), false);
});

test('ability: Charjabug Battery attaches from the hand to a Vikavolt only', () => {
  const { state, rng } = setupGame();
  state.players.p1.zones.active.push(mon(72, 'Vikavolt', { stage: 'Stage 2' }));
  state.players.p1.zones.bench.push(mon(73, 'Pikachu'));
  state.players.p2.zones.active.push(mon(71, 'Opp'));
  state.players.p1.zones.hand.push(
    mon(70, 'Charjabug', {
      stage: 'Stage 1',
      abilities: [
        {
          name: 'Battery',
          type: 'Ability',
          text: "Once during your turn (before your attack), you may attach this card from your hand to 1 of your Vikavolt or Vikavolt-GX as a Special Energy card. This card provides 2 {L} Energy only while it's attached to a Pokémon.",
        },
      ],
    })
  );

  const res = use70(state, rng);
  assert.equal(res.error, null);
  const charjabug = res.state.players.p1.zones.active.find((c) => c.instanceId === 70);
  assert.equal(charjabug?.attachedTo, 72);
  assert.deepEqual(charjabug.asEnergy.provides, ['Lightning', 'Lightning']);
  assert.deepEqual(res.state.players.p1.zones.hand, []);
});

test('ability: an in-play Charjabug cannot use Battery', () => {
  const { state, rng } = setupGame();
  holder(
    state,
    "Once during your turn (before your attack), you may attach this card from your hand to 1 of your Vikavolt or Vikavolt-GX as a Special Energy card. This card provides 2 {L} Energy only while it's attached to a Pokémon."
  );
  assert.ok(use70(state, rng).error);
});

// ── legacy power restrictions ───────────────────────────────────────────

const RAIN_DANCE =
  "As often as you like during your turn, you may attach a Basic {W} Energy card from your hand to 1 of your {W} Pokémon. This Pokémon Power can't be used if this Pokémon is Asleep, Confused, or Paralyzed.";

test("ability: a Pokémon Power's \"can't be used if … Asleep\" clause inflicts nothing", async () => {
  const { parseAbility } = await import('../rules/abilities.mjs');
  assert.equal(parseAbility(RAIN_DANCE).some((s) => s.type === 'statusAbility'), false);
});

test('ability: Rain Dance is refused while the holder is Asleep, allowed when Poisoned', () => {
  const { state, rng } = setupGame();
  holder(state, RAIN_DANCE, { types: ['Water'], specialCondition: 'Asleep' });
  state.players.p1.zones.hand.push(basicEnergy(80, 'Water'));
  assert.ok(use70(state, rng).error);

  state.players.p1.zones.active[0].specialCondition = null;
  state.players.p1.zones.active[0].poisoned = true;
  assert.equal(use70(state, rng).error, null);
});

// ── extra Supporter (Magnezone Dual Brains) ─────────────────────────────

const DUAL_BRAINS = 'During your turn, you may play 2 Supporter cards.';
const drawSupporter = (instanceId) =>
  createCard({
    instanceId,
    name: `Sup ${instanceId}`,
    supertype: 'Trainer',
    subtypes: ['Supporter'],
    type: 'Supporter',
    text: 'Draw a card.',
  });
const playTrainer = (state, instanceId, rng) =>
  applyCommand(state, { type: 'playTrainer', payload: { instanceId }, playerId: 'p1' }, rng);

test('ability: Dual Brains allows a second Supporter, not a third', () => {
  const { state, rng } = setupGame();
  state.players.p1.zones.active.push(mon(60, 'Magnemite'));
  state.players.p1.zones.active.push(
    mon(70, 'Magnezone', { stage: 'Stage 2', attachedTo: 60, abilities: [{ name: 'Dual Brains', type: 'Ability', text: DUAL_BRAINS }] })
  );
  state.players.p2.zones.active.push(mon(71, 'Opp'));
  state.players.p1.zones.hand.push(drawSupporter(80), drawSupporter(81), drawSupporter(82));
  for (let i = 0; i < 5; i++) state.players.p1.zones.deck.push(card(90 + i));

  const r1 = playTrainer(state, 80, rng);
  assert.equal(r1.error, null);
  const r2 = playTrainer(r1.state, 81, rng);
  assert.equal(r2.error, null, 'Evolved Magnezone allows the second Supporter');
  const r3 = playTrainer(r2.state, 82, rng);
  assert.ok(r3.error, 'a third Supporter is refused');
});

test('ability: without Dual Brains the second Supporter is refused', () => {
  const { state, rng } = setupGame();
  holder(state, 'Once during your turn, you may draw a card.');
  state.players.p1.zones.hand.push(drawSupporter(80), drawSupporter(81));
  state.players.p1.zones.deck.push(card(90), card(91));
  const r1 = playTrainer(state, 80, rng);
  assert.equal(r1.error, null);
  assert.ok(playTrainer(r1.state, 81, rng).error);
});

// ── turn-not-end (Alcremie Additional Order) and trainer "Your turn ends." ──

const cafeMaster = (instanceId) =>
  createCard({
    instanceId,
    name: 'Café Master',
    supertype: 'Trainer',
    subtypes: ['Supporter'],
    type: 'Supporter',
    text: 'Choose up to 3 of your Benched Pokémon. For each of those Pokémon, search your deck for a different type of basic Energy card and attach it to that Pokémon. Then, shuffle your deck. Your turn ends.',
  });
const katy = (instanceId) =>
  createCard({
    instanceId,
    name: 'Katy',
    supertype: 'Trainer',
    subtypes: ['Supporter'],
    type: 'Supporter',
    text: 'Discard your hand and draw 8 cards. Your turn ends.',
  });

test('trainer: "Your turn ends." hands the turn to the opponent after the effect', () => {
  const { state, rng } = setupGame();
  holder(state, 'Once during your turn, you may draw a card.');
  state.players.p1.zones.hand.push(katy(80));
  for (let i = 0; i < 10; i++) state.players.p1.zones.deck.push(card(90 + i));
  state.players.p2.zones.deck.push(card(120), card(121));

  const res = playTrainer(state, 80, rng);
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.hand.length, 8);
  assert.equal(res.state.turn.player, 'p2');
});

test('ability: Additional Order keeps the turn after Café Master only from the Active Spot', () => {
  const ADDITIONAL_ORDER =
    'As long as this Pokémon is in the Active Spot, your turn does not end when you use Café Master.';
  const setup = (zone) => {
    const { state, rng } = setupGame();
    if (zone === 'bench') state.players.p1.zones.active.push(mon(72, 'Front'));
    holder(state, ADDITIONAL_ORDER, { zone, name: 'Alcremie' });
    state.players.p1.zones.hand.push(cafeMaster(80));
    for (let i = 0; i < 4; i++) state.players.p1.zones.deck.push(card(90 + i));
    state.players.p2.zones.deck.push(card(120));
    return { state, rng };
  };

  const active = setup('active');
  const kept = playTrainer(active.state, 80, active.rng);
  assert.equal(kept.error, null);
  assert.equal(kept.state.turn.player, 'p1');
  assert.ok(kept.events.some((e) => e.type === 'turnEndPrevented'));

  const bench = setup('bench');
  const ended = playTrainer(bench.state, 80, bench.rng);
  assert.equal(ended.error, null);
  assert.equal(ended.state.turn.player, 'p2');
});

// ── attack-copy Abilities ───────────────────────────────────────────────

const MEMORY_HELIX =
  'This Pokémon can use the attacks of any of your Benched Pokémon. (You still need the necessary Energy to use each attack.)';
const attackCmd = (state, attackIndex, rng) =>
  applyCommand(state, { type: 'attack', payload: { attackIndex }, playerId: 'p1' }, rng);

test("ability: Memory Helix uses a Benched Pokémon's attack as its own", () => {
  const { state, rng } = setupGame();
  holder(state, MEMORY_HELIX, {
    name: 'Mew ex',
    attacks: [{ name: 'Own', cost: [], damage: '10', text: '' }],
  });
  state.players.p1.zones.bench.push(
    mon(72, 'Benched', { attacks: [{ name: 'Big Hit', cost: [], damage: '70', text: '' }] })
  );
  state.players.p2.zones.active[0].hp = 300;
  state.players.p2.zones.deck.push(card(120));

  const res = attackCmd(state, 1, rng);
  assert.equal(res.error, null);
  assert.equal(res.state.players.p2.zones.active[0].damage, 70);
});

test('ability: a borrowed attack still needs its own Energy', () => {
  const { state, rng } = setupGame();
  holder(state, MEMORY_HELIX, {
    name: 'Mew ex',
    attacks: [{ name: 'Own', cost: [], damage: '10', text: '' }],
  });
  state.players.p1.zones.bench.push(
    mon(72, 'Benched', { attacks: [{ name: 'Fire Blast', cost: ['Fire', 'Fire'], damage: '120', text: '' }] })
  );
  state.players.p1.zones.active.push(basicEnergy(80, 'Fire', 70));
  assert.ok(attackCmd(state, 1, rng).error, 'one Fire Energy cannot pay {R}{R}');
});

test('ability: Sudden Transformation borrows only non-Rule-Box Basics in the discard pile', async () => {
  const { state } = setupGame();
  holder(
    state,
    'This Pokémon can use the attacks of any Basic Pokémon in your discard pile, except for Pokémon with a Rule Box (Pokémon V, Pokémon-GX, etc. have Rule Boxes). (You still need the necessary Energy to use each attack.)',
    { name: 'Ditto', attacks: [] }
  );
  state.players.p1.zones.discard.push(
    mon(80, 'Pikachu', { attacks: [{ name: 'Gnaw', cost: [], damage: '10', text: '' }] }),
    mon(81, 'Zacian V', { subtypes: ['Basic', 'V'], attacks: [{ name: 'Brave Blade', cost: [], damage: '230', text: '' }] }),
    mon(82, 'Raichu', { stage: 'Stage 1', attacks: [{ name: 'Thunder', cost: [], damage: '120', text: '' }] })
  );
  const { applyCommand: apply } = await import('../reduce.mjs');
  const rng = createRng(3);
  const ok = apply(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' }, rng);
  assert.equal(ok.error, null);
  assert.equal(ok.state.players.p2.zones.active[0].damage, 10, 'Gnaw is the only borrowed attack');
  assert.ok(apply(state, { type: 'attack', payload: { attackIndex: 1 }, playerId: 'p1' }, rng).error);
});

test("ability: Metamorphosis Gene borrows the opponent's Active attack", () => {
  const GENE =
    "If this Pokémon is your Active Pokémon, it can use the attacks of your opponent's Active Pokémon. (You still need the necessary Energy to use each attack.)";
  const { state, rng } = setupGame();
  holder(state, GENE, { name: 'Ditto', attacks: [] });
  state.players.p2.zones.active[0].attacks = [{ name: 'Slam', cost: [], damage: '30', text: '' }];

  const res = attackCmd(state, 0, rng);
  assert.equal(res.error, null);
  assert.equal(res.state.players.p2.zones.active[0].damage, 30);
});

// ── coin-flip control ───────────────────────────────────────────────────

const CONTRARY =
  'If this Pokémon is your Active Pokémon, whenever your opponent flips a coin during his or her turn, treat it as tails.';
const flipAttack = (damage = '50') => ({
  name: 'Coin Hit',
  cost: [],
  damage,
  text: 'Flip a coin. If tails, this attack does nothing.',
});

test("ability: Contrary makes every coin the opponent flips on their turn tails", () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const { state } = setupGame();
    state.turn.player = 'p2';
    state.players.p1.zones.active.push(mon(60, 'Malamar', { abilities: [{ name: 'Contrary', type: 'Ability', text: CONTRARY }] }));
    state.players.p2.zones.active.push(mon(61, 'Attacker', { attacks: [flipAttack()] }));
    state.players.p1.zones.deck.push(card(120));
    const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p2' }, createRng(seed));
    assert.equal(res.error, null);
    const flip = res.events.find((e) => e.type === 'attackCoinFlipped');
    assert.deepEqual(flip.flips, ['tails'], `seed ${seed}`);
    assert.equal(res.state.players.p1.zones.active[0].damage || 0, 0);
  }
});

test('ability: Contrary from the Bench forces nothing', () => {
  const faces = new Set();
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const { state } = setupGame();
    state.turn.player = 'p2';
    state.players.p1.zones.active.push(mon(62, 'Front'));
    state.players.p1.zones.bench.push(mon(60, 'Malamar', { abilities: [{ name: 'Contrary', type: 'Ability', text: CONTRARY }] }));
    state.players.p2.zones.active.push(mon(61, 'Attacker', { attacks: [flipAttack()] }));
    const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p2' }, createRng(seed));
    faces.add(res.events.find((e) => e.type === 'attackCoinFlipped')?.flips?.[0]);
  }
  assert.ok(faces.has('heads'));
});

test("ability: Pattern Distraction flips for a Basic attacker; tails, the attack does nothing", () => {
  const PATTERN =
    "As long as Spinda is your Active Pokémon, whenever your opponent's Basic Pokémon tries to attack, your opponent flips a coin. If tails, that attack does nothing. You can't use more than 1 Pattern Distraction Poké-Body each turn.";
  const outcomes = new Set();
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const { state } = setupGame();
    state.turn.player = 'p2';
    state.players.p1.zones.active.push(mon(60, 'Spinda', { abilities: [{ name: 'Pattern Distraction', type: 'Poké-Body', text: PATTERN }] }));
    state.players.p2.zones.active.push(mon(61, 'Attacker', { attacks: [{ name: 'Hit', cost: [], damage: '30', text: '' }] }));
    state.players.p1.zones.deck.push(card(120));
    const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p2' }, createRng(seed));
    const coin = res.events.find((e) => e.type === 'attackFlipGateCoinFlipped')?.coin;
    assert.ok(coin, 'the attacker flipped');
    const dealt = res.state.players.p1.zones.active[0].damage || 0;
    assert.equal(dealt, coin === 'heads' ? 30 : 0);
    outcomes.add(coin);
  }
  assert.equal(outcomes.size, 2);
});

test('ability: Victory Star offers a re-flip of an attack\'s coins once per turn', () => {
  const VICTORY_STAR =
    "Once during your turn, after you flip any coins for an attack, you may ignore all results of those coin flips and begin flipping those coins again. You can't use more than 1 Victory Star Ability each turn.";
  const { state, rng } = setupGame();
  holder(state, 'Once during your turn, you may draw a card.', { attacks: [flipAttack('40')] });
  state.players.p1.zones.bench.push(mon(72, 'Victini', { abilities: [{ name: 'Victory Star', type: 'Ability', text: VICTORY_STAR }] }));
  state.players.p2.zones.deck.push(card(120));

  const res1 = attackCmd(state, 0, rng);
  assert.equal(res1.error, null);
  assert.match(res1.pendingChoice.prompt, /Victory Star/);
  const res2 = resolveWith(res1, [2], rng);
  assert.equal(res2.error, null);
  assert.ok(res2.events.some((e) => e.type === 'attackCoinFlipped' && e.reflip === true));
  assert.equal(res2.state.players.p1.flags.victoryStarUsedThisTurn, true);
});

// ── setup / Prize placement ─────────────────────────────────────────────

test('ability: Explosiveness lets a Stage 2 be the opening Active, not a later play', () => {
  const EXPLOSIVENESS =
    'If this Pokémon is in your hand when you are setting up to play, you may put it face down in the Active Spot.';
  const cinderace = () =>
    mon(80, 'Cinderace', { stage: 'Stage 2', abilities: [{ name: 'Explosiveness', type: 'Ability', text: EXPLOSIVENESS }] });
  const move = (state) =>
    applyCommand(state, { type: 'moveCard', payload: { instanceId: 80, from: 'hand', to: 'active' }, playerId: 'p1' }, createRng(1));

  const opening = setupGame().state;
  opening.turn.number = 1;
  opening.players.p1.zones.hand.push(cinderace());
  opening.players.p2.zones.active.push(mon(71, 'Opp'));
  const res = move(opening);
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.active[0].instanceId, 80);

  const later = setupGame().state;
  later.turn.number = 5;
  later.players.p1.zones.hand.push(cinderace());
  later.players.p1.zones.bench.push(mon(72, 'Benched'));
  assert.ok(move(later).error);
});

const WISH_UPON_A_STAR =
  "If you took this Pokémon as a face-down Prize card during your turn and your Bench isn't full, before you put it into your hand, you may put it onto your Bench and take 1 more Prize card.";

test('ability: Wish Upon a Star puts the taken Prize onto the Bench and takes 1 more', () => {
  const { state, rng } = setupGame();
  holder(state, 'Once during your turn, you may draw a card.');
  state.players.p1.zones.deck.push(card(120), card(121));
  state.players.p1.zones.prizes.push(
    mon(90, 'Jirachi', { abilities: [{ name: 'Wish Upon a Star', type: 'Ability', text: WISH_UPON_A_STAR }] }),
    card(91),
    card(92)
  );
  state.players.p1.flags.prizesOwed = 1;

  const res1 = use70(state, rng);
  assert.match(res1.pendingChoice.prompt, /Prize/);
  const res2 = resolveWith(res1, [90], rng);
  assert.match(res2.pendingChoice.prompt, /Bench/);
  const res3 = resolveWith(res2, [1], rng);
  assert.equal(res3.error, null);
  assert.ok(res3.state.players.p1.zones.bench.some((c) => c.instanceId === 90));
  assert.ok(!res3.state.players.p1.zones.hand.some((c) => c.instanceId === 90));
  assert.match(res3.pendingChoice?.prompt || '', /Prize/, 'one more Prize to take');
  const res4 = resolveWith(res3, [91], rng);
  assert.deepEqual(ids(res4.state.players.p1.zones.prizes), [92]);
});

test('ability: declining Wish Upon a Star keeps the Prize in hand with no extra Prize', () => {
  const { state, rng } = setupGame();
  holder(state, 'Once during your turn, you may draw a card.');
  state.players.p1.zones.deck.push(card(120));
  state.players.p1.zones.prizes.push(
    mon(90, 'Jirachi', { abilities: [{ name: 'Wish Upon a Star', type: 'Ability', text: WISH_UPON_A_STAR }] }),
    card(91)
  );
  state.players.p1.flags.prizesOwed = 1;
  const res2 = resolveWith(use70(state, rng), [90], rng);
  const res3 = resolveWith(res2, [2], rng);
  assert.equal(res3.pendingChoice, null);
  assert.ok(res3.state.players.p1.zones.hand.some((c) => c.instanceId === 90));
  assert.deepEqual(ids(res3.state.players.p1.zones.prizes), [91]);
});

test("ability: Pantomime swaps one of your Prizes with your deck's top card", () => {
  const { state, rng } = setupGame();
  holder(
    state,
    'Once during your turn (before your attack), you may switch 1 of your Prizes with the top card of your deck. This power can\'t be used if Rattata is Asleep, Confused, or Paralyzed.'
  );
  state.players.p1.zones.prizes.push(card(90), card(91));
  state.players.p1.zones.deck.push(card(95), card(96));
  const res1 = use70(state, rng);
  assert.deepEqual(ids(res1.pendingChoice.options), [90, 91]);
  const res2 = resolveWith(res1, [91], rng);
  assert.deepEqual(ids(res2.state.players.p1.zones.prizes), [90, 95]);
  assert.deepEqual(ids(res2.state.players.p1.zones.deck), [91, 96]);
});
