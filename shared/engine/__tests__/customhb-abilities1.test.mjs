// Homebrew set customhb (client/src/assets/custom-sets/customhb/set.json): Ability texts the
// engine used to ignore (ENGINE-CHECK.md). Each test names the card by its HB number; the Ability
// text is the set.json text, verbatim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { addCondition, hasCondition } from '../rules/special-conditions.mjs';
import { combinedToolRetreatCost } from '../rules/tool-combat.mjs';

let nextId = 1000;
const mon = (name, extra = {}) =>
  createCard({
    instanceId: nextId++,
    name,
    supertype: 'Pokémon',
    stage: 'Basic',
    hp: 200,
    types: ['Colorless'],
    ...extra,
  });
const ability = (name, text) => ({ name, type: 'Ability', text });
const energy = (energyType, attachedTo) =>
  createCard({
    instanceId: nextId++,
    name: `Basic ${energyType} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType,
    attachedTo,
  });

function game(turn = { player: 'p1', number: 5 }) {
  const state = createGameState({ gameId: 'customhb-abilities1', seed: 3, rulesEnabled: true });
  for (const playerId of ['p1', 'p2']) {
    state.players[playerId] = {
      playerId,
      username: playerId,
      zones: createPlayerZones(),
      flags: { abilitiesUsed: {} },
    };
    for (let i = 0; i < 6; i++) state.players[playerId].zones.prizes.push(mon(`${playerId} prize ${i}`));
    for (let i = 0; i < 10; i++) {
      state.players[playerId].zones.deck.push(
        createCard({ instanceId: nextId++, name: `${playerId} deck ${i}`, supertype: 'Trainer', subtypes: ['Item'] })
      );
    }
  }
  state.turn = { ...turn, phase: 'main' };
  return state;
}

// Checkup coin: heads = 0 (below 0.5), tails = 0.99.
const coin = (face) => ({ next: () => (face === 'heads' ? 0 : 0.99) });
const attack = (state, playerId = 'p1', attackIndex = 0) =>
  applyCommand(state, { type: 'attack', playerId, payload: { attackIndex } }, createRng(3));
const pass = (state, playerId, face) =>
  applyCommand(state, { type: 'pass', playerId, payload: {} }, coin(face));
const cardById = (state, instanceId) =>
  Object.values(state.players)
    .flatMap((player) => Object.values(player.zones))
    .flat()
    .find((card) => card?.instanceId === instanceId);

const attacks = (damage, cost = []) => [{ name: 'Hit', cost, damage, text: '' }];

// ── HB 003 Beedrill Hivemind ─────────────────────────────────────────────────────────────

const HIVEMIND =
  "Each of your {G} Pokémon does 30 more damage for any Beedrill in play (both yours and your opponent's)";
const hivemindBeedrill = () =>
  mon('Beedrill', { types: ['Grass'], abilities: [ability('Hivemind', HIVEMIND)] });

test('HB 003 Beedrill Hivemind: a Beedrill on your Bench adds 30 to your {G} attacks', () => {
  const state = game();
  const defender = mon('Defender', { hp: 300 });
  state.players.p1.zones.active.push(mon('Grass Attacker', { types: ['Grass'], attacks: attacks('40') }));
  state.players.p1.zones.bench.push(hivemindBeedrill());
  state.players.p2.zones.active.push(defender);
  const res = attack(state);
  assert.equal(res.error, null);
  assert.equal(cardById(res.state, defender.instanceId).damage, 70);
});

test('HB 003 Beedrill Hivemind: any Beedrill in play counts, and two Beedrill on one side add 30 once', () => {
  // The opponent's own Beedrill is "your opponent's" from p2's side: a plain Beedrill on p1's Bench still counts.
  const withOpponentBeedrill = game({ player: 'p2', number: 6 });
  const defenderA = mon('Defender', { hp: 300 });
  withOpponentBeedrill.players.p2.zones.active.push(
    mon('Grass Attacker', { types: ['Grass'], attacks: attacks('40') })
  );
  withOpponentBeedrill.players.p2.zones.bench.push(hivemindBeedrill());
  withOpponentBeedrill.players.p1.zones.bench.push(mon('Beedrill', { types: ['Grass'] }));
  withOpponentBeedrill.players.p1.zones.active.push(defenderA);
  const plainCounts = attack(withOpponentBeedrill, 'p2');
  assert.equal(plainCounts.error, null);
  assert.equal(cardById(plainCounts.state, defenderA.instanceId).damage, 70);

  const twoOnOneSide = game({ player: 'p2', number: 6 });
  const defenderB = mon('Defender', { hp: 300 });
  twoOnOneSide.players.p2.zones.active.push(mon('Grass Attacker', { types: ['Grass'], attacks: attacks('40') }));
  twoOnOneSide.players.p2.zones.bench.push(hivemindBeedrill(), hivemindBeedrill());
  twoOnOneSide.players.p1.zones.active.push(defenderB);
  const onceOnly = attack(twoOnOneSide, 'p2');
  assert.equal(onceOnly.error, null);
  assert.equal(cardById(onceOnly.state, defenderB.instanceId).damage, 70);
});

// ── HB 015 Gloom Drowziness ──────────────────────────────────────────────────────────────

const DROWZINESS = 'If this Pokémon is Asleep, its Retreat Cost is 1 less.';

// Asleep also blocks retreat outright (legality.mjs), so the reduced cost is read directly.
test('HB 015 Gloom Drowziness: an Asleep Gloom has Retreat Cost 1 (2 less 1)', () => {
  const gloom = mon('Gloom', { retreatCost: 2, abilities: [ability('Drowziness', DROWZINESS)] });
  addCondition(gloom, 'Asleep');
  assert.equal(combinedToolRetreatCost(2, gloom, [gloom]), 1);
});

test('HB 015 Gloom Drowziness: an awake Gloom keeps Retreat Cost 2', () => {
  const gloom = mon('Gloom', { retreatCost: 2, abilities: [ability('Drowziness', DROWZINESS)] });
  assert.equal(combinedToolRetreatCost(2, gloom, [gloom]), 2);
});

// ── HB 020 Rillaboom / HB 132 Tapu Bulu Grassy Surge ─────────────────────────────────────

test('HB 020 Rillaboom Grassy Surge: Checkup heals 10 from each {G} Pokémon in play on both sides', () => {
  const state = game();
  const rillaboom = mon('Rillaboom', {
    types: ['Grass'],
    abilities: [ability('Grassy Surge', 'During Pokémon Checkup, heal 10 damage from each {G} Pokémon in play.')],
  });
  const grassBench = mon('Grass Bench', { types: ['Grass'], damage: 30 });
  const colorless = mon('Colorless Bench', { damage: 30 });
  const oppGrass = mon('Opp Grass', { types: ['Grass'], damage: 30 });
  state.players.p1.zones.active.push(rillaboom);
  state.players.p1.zones.bench.push(grassBench, colorless);
  state.players.p2.zones.active.push(oppGrass, mon('Defender'));
  const res = pass(state, 'p1', 'tails');
  assert.equal(res.error, null);
  assert.equal(cardById(res.state, grassBench.instanceId).damage, 20);
  assert.equal(cardById(res.state, oppGrass.instanceId).damage, 20);
  assert.equal(cardById(res.state, colorless.instanceId).damage, 30);
});

test('HB 132 Tapu Bulu Grassy Surge: a benched Tapu Bulu heals 10 from each {G} Pokémon at each Checkup', () => {
  const state = game();
  const tapuBulu = mon('Tapu Bulu', {
    types: ['Grass'],
    abilities: [ability('Grassy Surge', 'During each Pokémon Checkup, heal 10 damage from each {G} Pokémon in play.')],
  });
  const activeGrass = mon('Active Grass', { types: ['Grass'], damage: 30 });
  const oppGrass = mon('Opp Grass', { types: ['Grass'], damage: 30 });
  state.players.p1.zones.active.push(activeGrass);
  state.players.p1.zones.bench.push(tapuBulu);
  state.players.p2.zones.active.push(oppGrass, mon('Defender'));
  const res = pass(state, 'p1', 'tails');
  assert.equal(res.error, null);
  assert.equal(cardById(res.state, activeGrass.instanceId).damage, 20);
  assert.equal(cardById(res.state, oppGrass.instanceId).damage, 20);
});

// ── HB 022 Whimsicott Prankster ──────────────────────────────────────────────────────────

test('HB 022 Whimsicott Prankster: neither Active recovers from Sleep at Checkup, except Whimsicott', () => {
  const state = game();
  const whimsicott = mon('Whimsicott', {
    abilities: [
      ability(
        'Prankster',
        'Neither Active Pokémon can recover from sleep during Pokémon Checkup, except Whimsicott'
      ),
    ],
  });
  const oppSleeper = mon('Opp Sleeper');
  addCondition(whimsicott, 'Asleep');
  addCondition(oppSleeper, 'Asleep');
  state.players.p1.zones.active.push(whimsicott);
  state.players.p2.zones.active.push(oppSleeper);
  const res = pass(state, 'p1', 'heads');
  assert.equal(res.error, null);
  assert.equal(hasCondition(cardById(res.state, oppSleeper.instanceId), 'Asleep'), true);
  assert.equal(hasCondition(cardById(res.state, whimsicott.instanceId), 'Asleep'), false);
});

// ── HB 083 Heatran Burning Will ──────────────────────────────────────────────────────────

test("HB 083 Heatran Burning Will: Checkup adds 1 damage counter to the opponent's Burned Pokémon", () => {
  const state = game();
  const heatran = mon('Heatran', {
    types: ['Fire'],
    abilities: [
      ability(
        'Burning Will',
        "During Pokémon Checkup, put 1 additional damage counter on your opponent's Burned Pokémon."
      ),
    ],
  });
  const burned = mon('Burned Defender');
  addCondition(burned, 'Burned');
  state.players.p1.zones.active.push(heatran);
  state.players.p2.zones.active.push(burned);
  const res = pass(state, 'p1', 'tails');
  assert.equal(res.error, null);
  // Burn Checkup damage (20) plus Burning Will (1 counter = 10); tails leaves the Burn in place.
  assert.equal(cardById(res.state, burned.instanceId).damage, 30);
});

test('HB 083 Heatran Burning Will: the extra counter lands even when the Burn flip cures the Burn', () => {
  const state = game();
  state.players.p1.zones.active.push(
    mon('Heatran', {
      types: ['Fire'],
      abilities: [
        ability('Burning Will', "During Pokémon Checkup, put 1 additional damage counter on your opponent's Burned Pokémon."),
      ],
    })
  );
  const burned = mon('Burned Defender');
  addCondition(burned, 'Burned');
  state.players.p2.zones.active.push(burned);
  const res = pass(state, 'p1', 'heads');
  const after = cardById(res.state, burned.instanceId);
  assert.equal(hasCondition(after, 'Burned'), false, 'heads cures the Burn');
  assert.equal(after.damage, 30);
});

// ── HB 085 Kartana Beast Boost ───────────────────────────────────────────────────────────

const BEAST_BOOST =
  "If this Pokémon Knocked Out your opponent's Active Pokémon during your previous turn, the attacks of this Pokémon cost 2 {M} less this turn. This effect doesn't stack.";

test('HB 085 Kartana Beast Boost: a Knockout last turn takes 2 {M} off attack costs', () => {
  const koTurn = game({ player: 'p1', number: 3 });
  const kartana = mon('Kartana', {
    types: ['Metal'],
    abilities: [ability('Beast Boost', BEAST_BOOST)],
    attacks: [
      { name: 'Costly', cost: ['Metal', 'Metal', 'Colorless'], damage: '120', text: '' },
      { name: 'Finisher', cost: [], damage: '60', text: '' },
    ],
  });
  koTurn.players.p1.zones.active.push(kartana);
  koTurn.players.p2.zones.active.push(mon('Weak', { hp: 60 }));
  koTurn.players.p2.zones.bench.push(mon('Backup'));
  const ko = attack(koTurn, 'p1', 1);
  assert.equal(ko.error, null);
  const stamped = cardById(ko.state, kartana.instanceId);
  assert.equal(stamped.koedOpponentActiveTurn, 3, 'the Knockout stamps the turn it happened');

  const nextTurn = game({ player: 'p1', number: 5 });
  const defender = mon('Defender', { hp: 300 });
  nextTurn.players.p1.zones.active.push(stamped, energy('Colorless', stamped.instanceId));
  nextTurn.players.p2.zones.active.push(defender);
  const legal = attack(nextTurn, 'p1', 0);
  assert.equal(legal.error, null);
  assert.equal(cardById(legal.state, defender.instanceId).damage, 120);
});

test('HB 085 Kartana Beast Boost: no Knockout last turn leaves the full {M} cost', () => {
  const state = game({ player: 'p1', number: 7 });
  const stamped = mon('Kartana', {
    types: ['Metal'],
    abilities: [ability('Beast Boost', BEAST_BOOST)],
    koedOpponentActiveTurn: 3,
    attacks: attacks('120', ['Metal', 'Metal', 'Colorless']),
  });
  state.players.p1.zones.active.push(stamped, energy('Colorless', stamped.instanceId));
  state.players.p2.zones.active.push(mon('Defender', { hp: 300 }));
  assert.ok(attack(state).error, 'three Energy are needed, only one is attached');
});

// ── HB 107 Landorus Abundance ────────────────────────────────────────────────────────────

const ABUNDANCE =
  "As long as this Pokémon is in play, you may draw a card at the start of your opponent's turn.";

test("HB 107 Landorus Abundance: draws a card at the start of the opponent's turn", () => {
  const state = game();
  state.players.p1.zones.active.push(mon('Probe Active'));
  state.players.p1.zones.bench.push(mon('Landorus', { abilities: [ability('Abundance', ABUNDANCE)] }));
  state.players.p2.zones.active.push(mon('Foe'));
  const res = pass(state, 'p1', 'tails');
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.hand.length, 1);
  assert.equal(res.state.players.p1.zones.deck.length, 9);
});

test("HB 107 Landorus Abundance: declines the draw when it would take the holder's last deck card", () => {
  const state = game();
  state.players.p1.zones.active.push(mon('Probe Active'));
  state.players.p1.zones.bench.push(mon('Landorus', { abilities: [ability('Abundance', ABUNDANCE)] }));
  state.players.p1.zones.deck.splice(1);
  state.players.p2.zones.active.push(mon('Foe'));
  const res = pass(state, 'p1', 'tails');
  assert.equal(res.state.players.p1.zones.hand.length, 0);
  assert.equal(res.state.players.p1.zones.deck.length, 1);
});

// ── HB 114 Galarian Zapdos ex Fighting Instinct ──────────────────────────────────────────

const FIGHTING_INSTINCT =
  "This Pokémon's attacks cost {C} less for each of your opponent's Pokémon ex in play.";

function zapdosAttack(opponentBench) {
  const state = game();
  const zapdos = mon('Galarian Zapdos ex', {
    subtypes: ['Basic', 'ex'],
    abilities: [ability('Fighting Instinct', FIGHTING_INSTINCT)],
    attacks: attacks('40', ['Colorless', 'Colorless']),
  });
  const defender = mon('Defender', { hp: 300 });
  state.players.p1.zones.active.push(zapdos);
  state.players.p2.zones.active.push(defender);
  state.players.p2.zones.bench.push(...opponentBench);
  return { res: attack(state), defender };
}

test('HB 114 Galarian Zapdos ex Fighting Instinct: each opponent Pokémon ex takes 1 {C} off the attack', () => {
  const { res, defender } = zapdosAttack([
    mon('Foe ex', { subtypes: ['Basic', 'ex'] }),
    mon('Foe ex 2', { subtypes: ['Basic', 'ex'] }),
  ]);
  assert.equal(res.error, null);
  assert.equal(cardById(res.state, defender.instanceId).damage, 40);
});

test('HB 114 Galarian Zapdos ex Fighting Instinct: one opponent ex leaves one {C} to pay; a non-ex does not count', () => {
  const { res } = zapdosAttack([mon('Foe ex', { subtypes: ['Basic', 'ex'] }), mon('Foe Plain')]);
  assert.ok(res.error, 'one Colorless still has to be paid');
});

// ── HB 128 Volcarona Flame Body ──────────────────────────────────────────────────────────

const FLAME_BODY =
  'If this Pokémon was attacked last turn, flip a coin. If heads, your opponents Active Pokémon is now Burned.';

test("HB 128 Volcarona Flame Body: heads Burns the opponent's Active after Volcarona was attacked last turn", () => {
  const state = game({ player: 'p2', number: 4 });
  const volcarona = mon('Volcarona', { abilities: [ability('Flame Body', FLAME_BODY)] });
  const attacker = mon('Attacker', { attacks: attacks('30') });
  state.players.p1.zones.active.push(volcarona);
  state.players.p2.zones.active.push(attacker);
  const hit = attack(state, 'p2');
  assert.equal(hit.error, null);
  assert.equal(hit.state.turn.number, 5);
  assert.equal(hit.state.turn.player, 'p1');
  const done = pass(hit.state, 'p1', 'heads');
  assert.equal(done.error, null);
  assert.equal(hasCondition(cardById(done.state, attacker.instanceId), 'Burned'), true);
});

test('HB 128 Volcarona Flame Body: no Burn when Volcarona was not attacked last turn', () => {
  const state = game({ player: 'p1', number: 5 });
  const volcarona = mon('Volcarona', { abilities: [ability('Flame Body', FLAME_BODY)] });
  const attacker = mon('Attacker');
  state.players.p1.zones.active.push(volcarona);
  state.players.p2.zones.active.push(attacker);
  const done = pass(state, 'p1', 'heads');
  assert.equal(done.error, null);
  assert.equal(hasCondition(cardById(done.state, attacker.instanceId), 'Burned'), false);
});

// ── HB 139 Hisuian Samurott ex Ancient Hazard ────────────────────────────────────────────

const ANCIENT_HAZARD =
  "If your opponent's Active Pokémon is switched, put 3 damage counters on the new Active Pokémon.";

test("HB 139 Hisuian Samurott ex Ancient Hazard: the opponent's switched-in Active takes 3 damage counters", () => {
  const state = game({ player: 'p2', number: 4 });
  const samurott = mon('Hisuian Samurott ex', {
    subtypes: ['Stage 2', 'ex'],
    abilities: [ability('Ancient Hazard', ANCIENT_HAZARD)],
  });
  const replacement = mon('Replacement');
  state.players.p1.zones.active.push(samurott);
  state.players.p2.zones.active.push(mon('Retreater', { retreatCost: 0 }));
  state.players.p2.zones.bench.push(replacement);
  const res = applyCommand(
    state,
    { type: 'retreat', playerId: 'p2', payload: { benchInstanceId: replacement.instanceId } },
    createRng(3)
  );
  assert.equal(res.error, null);
  assert.equal(cardById(res.state, replacement.instanceId).damage, 30);
});

// ── HB 159 Kingambit Supreme Overlord ────────────────────────────────────────────────────

const SUPREME_OVERLORD =
  "Attacks used by this Pokémon do 10 more damage to your opponent's Active Pokémon for each Prize card your opponent has taken (before applying Weakness and Resistance).";

test('HB 159 Kingambit Supreme Overlord: adds 10 per Prize card the opponent has taken', () => {
  const state = game();
  const kingambit = mon('Kingambit', {
    abilities: [ability('Supreme Overlord', SUPREME_OVERLORD)],
    attacks: attacks('30'),
  });
  const defender = mon('Defender', { hp: 300 });
  state.players.p1.zones.active.push(kingambit);
  state.players.p2.zones.active.push(defender);
  state.players.p2.zones.prizes.splice(0, 2);
  const res = attack(state);
  assert.equal(res.error, null);
  assert.equal(cardById(res.state, defender.instanceId).damage, 50);
});

test('HB 022 Whimsicott Prankster: an evolved Whimsicott (root named Cottonee) is still the exception', () => {
  const state = game();
  const root = mon('Cottonee');
  const top = mon('Whimsicott', {
    stage: 'Stage 1',
    subtypes: ['Stage 1'],
    evolvesFrom: 'Cottonee',
    attachedTo: root.instanceId,
    abilities: [
      ability('Prankster', 'Neither Active Pokémon can recover from sleep during Pokémon Checkup, except Whimsicott'),
    ],
  });
  const oppSleeper = mon('Opp Sleeper');
  addCondition(root, 'Asleep');
  addCondition(oppSleeper, 'Asleep');
  state.players.p1.zones.active.push(root, top);
  state.players.p2.zones.active.push(oppSleeper);
  const res = pass(state, 'p1', 'heads');
  assert.equal(res.error, null);
  assert.equal(hasCondition(cardById(res.state, oppSleeper.instanceId), 'Asleep'), true, 'the opponent stays Asleep');
  assert.equal(hasCondition(cardById(res.state, root.instanceId), 'Asleep'), false, 'Whimsicott itself wakes');
});
