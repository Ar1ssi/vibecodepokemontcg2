// Design 062 tranche 2 (I229): WotC passive Pokémon Powers. Power texts are inlined from
// out/pkmn-wotc-cards.json (pkmncards rows cited per constant); Trainer texts from
// out/tcgdex-wotc-trainers.json (TCGdex ids cited).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand, validateLegality } from '../reduce.mjs';
import { parseAbility } from '../rules/abilities.mjs';
import { legacyPowerStopCondition } from '../rules/legacy-power-wording.mjs';
import { cardAbilityText } from '../rules/ability-executors.mjs';
import {
  abilityPlayLocks,
  abilityEvolveLock,
  abilityEnergyMultiplier,
  isAbilitySuppressed,
  legacyPowerStopped,
} from '../rules/ability-combat.mjs';

// Dark Vileplume [Team Rocket 13] Hay Fever
const HAY_FEVER =
  'No Trainer cards can be played. This power stops working while Dark Vileplume is Asleep, Confused, or Paralyzed.';
// Muk [Fossil 13] Toxic Gas
const TOXIC_GAS =
  'Ignore all Pokémon Powers other than Toxic Gases. This power stops working while Muk is Asleep, Confused, or Paralyzed.';
// Muk [Legendary Collection 16] Toxic Gas
const TOXIC_GAS_LC =
  'Ignore all Pokémon Powers other than Toxic Gases. This power stops working while Muk is affected by a Special Condition.';
// Aerodactyl [Fossil 1] Prehistoric Power
const PREHISTORIC_POWER =
  'No more Evolution cards can be played. This power stops working while Aerodactyl is Asleep, Confused, or Paralyzed.';
// Dodrio [Jungle 34] Retreat Aid
const RETREAT_AID = 'As long as Dodrio is Benched, pay {C} less to retreat your Active Pokémon.';
// Machamp [Base Set 8] Strikes Back
const STRIKES_BACK =
  "Whenever your opponent's attack damages Machamp (even if Machamp is Knocked Out), this power does 10 damage to the attacking Pokémon. (Don't apply Weakness and Resistance.) This power can't be used if Machamp is Asleep, Confused, or Paralyzed when your opponent attacks.";
// Blastoise [Base Set 2] Rain Dance
const RAIN_DANCE =
  "As often as you like during your turn (before your attack), you may attach 1 {W} Energy card to 1 of your {W} Pokémon. (This doesn't use up your 1 Energy card attachment for the turn.) This power can't be used if Blastoise is Asleep, Confused, or Paralyzed.";
// base1-91 Bill
const BILL = 'Draw 2 cards.';
// neo1-86 Focus Band
const FOCUS_BAND =
  "Attach Focus Band to 1 of your Pokémon that doesn't have a Pokémon Tool attached to it. If the Pokémon Focus Band is attached to would be Knocked Out by your opponent's attack, flip a coin. If heads, that Pokémon is not Knocked Out and its remaining HP become 10 instead. Then, discard Focus Band.";
// base1-76 Pokémon Breeder
const BREEDER =
  'Put a Stage 2 Evolution card from your hand on the matching Basic Pokémon. You can only play this card when you would be allowed to evolve that Pokémon anyway.';

const stripGuidance = (parsed) => JSON.parse(JSON.stringify(parsed, (key, value) => (key === 'guidance' ? undefined : value)));
const modernText = (name, text) => cardAbilityText({ name, abilities: [{ name: 'Power', text }] });

function setupGame(turnNumber = 3) {
  const state = createGameState({ gameId: 'legacy-passive', seed: 7, rulesEnabled: true });
  for (const playerId of ['p1', 'p2']) {
    state.players[playerId] = { playerId, username: playerId, zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
  }
  state.turn = { player: 'p1', number: turnNumber, phase: 'main' };
  return state;
}

const power = (name, text) => ({ name, type: 'Pokémon Power', text });
const pokemon = (extra) => createCard({ supertype: 'Pokémon', stage: 'Basic', hp: 100, ...extra });
const trainer = (instanceId, name, text, extra = {}) =>
  createCard({ instanceId, name, supertype: 'Trainer', type: 'Trainer', text, ...extra });
const sideCtx = (state, playerId) => {
  const own = state.players[playerId].zones;
  const other = state.players[playerId === 'p1' ? 'p2' : 'p1'].zones;
  return {
    sideCards: [...own.active, ...own.bench],
    opponentSideCards: [...other.active, ...other.bench],
    sideActive: own.active,
    sideBench: own.bench,
    opponentActive: other.active,
    opponentBench: other.bench,
  };
};

// ── the Power's own off-switch ──────────────────────────────────────────

test('legacy passive: stop clauses read as the rotation conditions or any Special Condition', () => {
  assert.equal(legacyPowerStopCondition(HAY_FEVER.toLowerCase()), 'rotation');
  assert.equal(legacyPowerStopCondition(TOXIC_GAS_LC.toLowerCase()), 'any');
  assert.equal(legacyPowerStopCondition(STRIKES_BACK.toLowerCase()), 'rotation');
  assert.equal(legacyPowerStopCondition(RETREAT_AID.toLowerCase()), null);
  assert.equal(legacyPowerStopCondition(''), null);
  // Unown L [Neo Destiny 86]: "can be used even if" is no off-switch.
  assert.equal(
    legacyPowerStopCondition('this power can be used even if unown l is asleep, confused, or paralyzed.'),
    null
  );
});

test('legacy passive: a passive Power is suppressed while its holder has the printed condition', () => {
  const vileplume = pokemon({ instanceId: 1, name: 'Dark Vileplume', abilities: [power('Hay Fever', HAY_FEVER)] });
  assert.equal(isAbilitySuppressed(vileplume), false);
  vileplume.specialCondition = 'Asleep';
  assert.equal(isAbilitySuppressed(vileplume), true);
  vileplume.specialCondition = null;
  vileplume.poisoned = true;
  assert.equal(isAbilitySuppressed(vileplume), false, 'Poisoned is not Asleep, Confused, or Paralyzed');
  const lcMuk = pokemon({ instanceId: 2, name: 'Muk', poisoned: true, abilities: [power('Toxic Gas', TOXIC_GAS_LC)] });
  assert.equal(legacyPowerStopped(lcMuk), true, 'LC wording: any Special Condition');
});

// ── Hay Fever ─────────────────────────────────────────────────────────────

test('legacy passive: Hay Fever parses like an each-player Trainer lock', () => {
  assert.deepEqual(
    stripGuidance(parseAbility(modernText('Dark Vileplume', HAY_FEVER))),
    stripGuidance(
      parseAbility(
        "Each player can't play any Trainer cards from his or her hand. This power stops working while Dark Vileplume is Asleep, Confused, or Paralyzed."
      )
    )
  );
});

function hayFeverBoard() {
  const state = setupGame();
  state.players.p2.zones.active.push(
    pokemon({ instanceId: 10, name: 'Dark Vileplume', stage: 'Stage 2', abilities: [power('Hay Fever', HAY_FEVER)] })
  );
  state.players.p1.zones.active.push(pokemon({ instanceId: 20, name: 'Pikachu' }));
  state.players.p1.zones.hand.push(
    trainer(30, 'Bill', BILL),
    trainer(31, 'Focus Band', FOCUS_BAND, { trainerType: 'Tool', subtypes: ['Pokémon Tool'] })
  );
  state.players.p1.zones.deck.push(createCard({ instanceId: 40 }), createCard({ instanceId: 41 }));
  return state;
}

test('legacy passive: Hay Fever stops the opponent playing Trainers and attaching Tools', () => {
  const state = hayFeverBoard();
  const bill = validateLegality(state, { type: 'playTrainer', payload: { instanceId: 30 }, playerId: 'p1' });
  assert.equal(bill.allowed, false);
  assert.match(bill.reason, /Dark Vileplume prevents playing/);
  const band = validateLegality(state, {
    type: 'attachCard',
    payload: { instanceId: 31, targetInstanceId: 20 },
    playerId: 'p1',
  });
  assert.equal(band.allowed, false);
  // "No Trainer cards can be played": the holder's own player is locked too.
  assert.ok(abilityPlayLocks(trainer(32, 'Bill', BILL), sideCtx(state, 'p2')));
});

test('legacy passive: Hay Fever stops working while Dark Vileplume is Asleep', () => {
  const state = hayFeverBoard();
  state.players.p2.zones.active[0].specialCondition = 'Asleep';
  assert.equal(validateLegality(state, { type: 'playTrainer', payload: { instanceId: 30 }, playerId: 'p1' }).allowed, true);
});

// ── Toxic Gas ─────────────────────────────────────────────────────────────

function toxicGasBoard() {
  const state = setupGame();
  state.players.p2.zones.active.push(pokemon({ instanceId: 10, name: 'Muk', abilities: [power('Toxic Gas', TOXIC_GAS)] }));
  state.players.p1.zones.active.push(
    pokemon({ instanceId: 20, name: 'Blastoise', types: ['Water'], abilities: [power('Rain Dance', RAIN_DANCE)] })
  );
  state.players.p1.zones.hand.push(
    createCard({ instanceId: 21, name: 'Water Energy', supertype: 'Energy', subtypes: ['Basic'], energyType: 'Water', type: 'Energy' }),
    trainer(30, 'Bill', BILL)
  );
  return state;
}

test('legacy passive: Toxic Gas blocks every other Pokémon Power on both sides', () => {
  const state = toxicGasBoard();
  const blocked = validateLegality(state, { type: 'useAbility', payload: { instanceId: 20 }, playerId: 'p1' });
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason, /suppressed/);
  // A passive Power (Hay Fever) on the Muk player's own side is ignored as well.
  const vileplume = pokemon({ instanceId: 11, name: 'Dark Vileplume', abilities: [power('Hay Fever', HAY_FEVER)] });
  state.players.p2.zones.bench.push(vileplume);
  const playBill = () => validateLegality(state, { type: 'playTrainer', payload: { instanceId: 30 }, playerId: 'p1' });
  assert.equal(playBill().allowed, true);
  assert.equal(isAbilitySuppressed(vileplume, sideCtx(state, 'p2')), true);
  state.players.p2.zones.active[0].specialCondition = 'Confused';
  assert.equal(playBill().allowed, false, 'a Confused Muk no longer ignores Hay Fever');
});

test('legacy passive: Toxic Gas spares Toxic Gases, modern Abilities, and stops while Muk is Asleep', () => {
  const state = toxicGasBoard();
  const otherMuk = pokemon({ instanceId: 12, name: 'Muk', abilities: [power('Toxic Gas', TOXIC_GAS)] });
  state.players.p1.zones.bench.push(otherMuk);
  assert.equal(isAbilitySuppressed(otherMuk, sideCtx(state, 'p1')), false);
  const modern = pokemon({
    instanceId: 13,
    name: 'Kirlia',
    abilities: [{ name: 'Refinement', type: 'Ability', text: 'Once during your turn, you may draw 2 cards.' }],
  });
  state.players.p1.zones.bench.push(modern);
  assert.equal(isAbilitySuppressed(modern, sideCtx(state, 'p1')), false);

  state.players.p1.zones.bench = [];
  state.players.p2.zones.active[0].specialCondition = 'Asleep';
  const res = applyCommand(state, { type: 'useAbility', payload: { instanceId: 20 }, playerId: 'p1' });
  assert.equal(res.error, null);
});

// ── Prehistoric Power ─────────────────────────────────────────────────────

function prehistoricBoard() {
  const state = setupGame();
  state.players.p2.zones.active.push(
    pokemon({ instanceId: 10, name: 'Aerodactyl', abilities: [power('Prehistoric Power', PREHISTORIC_POWER)] })
  );
  state.players.p1.zones.active.push(pokemon({ instanceId: 20, name: 'Charmander', enteredPlayTurn: 1 }));
  state.players.p1.zones.hand.push(
    createCard({ instanceId: 21, name: 'Charmeleon', supertype: 'Pokémon', stage: 'Stage 1', evolvesFrom: 'Charmander' }),
    createCard({ instanceId: 22, name: 'Charizard', supertype: 'Pokémon', stage: 'Stage 2', evolvesFrom: 'Charmeleon' }),
    trainer(23, 'Pokémon Breeder', BREEDER)
  );
  // The Stage 1 traces Charizard's line back to Charmander for Breeder.
  state.players.p1.zones.discard.push(
    createCard({ instanceId: 24, name: 'Charmeleon', supertype: 'Pokémon', stage: 'Stage 1', evolvesFrom: 'Charmander' })
  );
  return state;
}

const evolve = (state) =>
  validateLegality(state, { type: 'attachCard', payload: { instanceId: 21, targetInstanceId: 20 }, playerId: 'p1' });
const breeder = (state) => validateLegality(state, { type: 'playTrainer', payload: { instanceId: 23 }, playerId: 'p1' });

test('legacy passive: Prehistoric Power stops evolving from the hand on both sides', () => {
  const state = prehistoricBoard();
  const blocked = evolve(state);
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason, /prevents evolving/);
  const ownCtx = sideCtx(state, 'p2');
  assert.equal(abilityEvolveLock(state.players.p1.zones.hand[0], ownCtx), true, "the holder's player is locked too");
  // A Basic Pokémon card is no Evolution card.
  assert.equal(abilityEvolveLock(pokemon({ instanceId: 99, name: 'Pikachu' }), ownCtx), false);
});

test('legacy passive: Prehistoric Power stops Pokémon Breeder', () => {
  const state = prehistoricBoard();
  const blocked = breeder(state);
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason, /Evolution cards/);
});

test('legacy passive: Prehistoric Power stops working while Aerodactyl is Paralyzed', () => {
  const state = prehistoricBoard();
  state.players.p2.zones.active[0].specialCondition = 'Paralyzed';
  assert.equal(evolve(state).allowed, true);
  assert.equal(breeder(state).allowed, true);
});

// ── Retreat Aid ───────────────────────────────────────────────────────────

test('legacy passive: Retreat Aid parses like the modern Bench retreat discount', () => {
  assert.deepEqual(
    stripGuidance(parseAbility(modernText('Dodrio', RETREAT_AID))),
    // Zoroark [30th Celebration 096] Nighttime Byway, with Retreat Aid's {C}.
    stripGuidance(parseAbility("As long as this Pokémon is on your Bench, your Active Pokémon's Retreat Cost is {C} less."))
  );
});

function retreatBoard(dodrioZone) {
  const state = setupGame();
  state.players.p2.zones.active.push(pokemon({ instanceId: 10, name: 'Opp' }));
  state.players.p1.zones.active.push(pokemon({ instanceId: 20, name: 'Rattata', retreatCost: 1 }));
  state.players.p1.zones.bench.push(pokemon({ instanceId: 21, name: 'Pidgey' }));
  const dodrio = pokemon({ instanceId: 22, name: 'Dodrio', abilities: [power('Retreat Aid', RETREAT_AID)] });
  if (dodrioZone) state.players.p1.zones[dodrioZone].push(dodrio);
  return state;
}

test('legacy passive: a Benched Dodrio pays {C} of the Active Pokémon retreat', () => {
  const retreat = (state) =>
    applyCommand(state, { type: 'retreat', playerId: 'p1', payload: { benchInstanceId: 21 } });
  assert.match(retreat(retreatBoard(null)).error, /Not enough energy to retreat/);
  const res = retreat(retreatBoard('bench'));
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.active[0].instanceId, 21);
});

// ── Strikes Back ──────────────────────────────────────────────────────────

test('legacy passive: Strikes Back parses as 1 damage counter on the Attacking Pokémon', () => {
  const text = modernText('Machamp', STRIKES_BACK);
  assert.deepEqual(
    stripGuidance(parseAbility(text)),
    stripGuidance(
      parseAbility(
        "If this Pokémon is damaged by an attack from your opponent's Pokémon (even if this Pokémon is Knocked Out), put 1 damage counter on the Attacking Pokémon. This power can't be used if Machamp is Asleep, Confused, or Paralyzed when your opponent attacks."
      )
    )
  );
});

function strikesBackBoard() {
  const state = setupGame(2);
  state.players.p1.zones.active.push(
    pokemon({ instanceId: 20, name: 'Rattata', attacks: [{ name: 'Bite', cost: [], damage: '20' }] })
  );
  state.players.p2.zones.active.push(
    pokemon({ instanceId: 10, name: 'Machamp', stage: 'Stage 2', abilities: [power('Strikes Back', STRIKES_BACK)] })
  );
  return state;
}

test('legacy passive: Strikes Back does 10 damage to the attacker', () => {
  const res = applyCommand(strikesBackBoard(), { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p2.zones.active[0].damage, 20);
  assert.equal(res.state.players.p1.zones.active[0].damage, 10);
});

test("legacy passive: Strikes Back can't be used while Machamp is Paralyzed", () => {
  const state = strikesBackBoard();
  state.players.p2.zones.active[0].specialCondition = 'Paralyzed';
  const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.active[0].damage || 0, 0);
});

test('legacy passive: a Benched Machamp strikes back at an attack that damages it', () => {
  const state = strikesBackBoard();
  state.players.p1.zones.active[0].attacks = [
    {
      name: 'Spread',
      cost: [],
      damage: '',
      text: "This attack does 10 damage to each of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
    },
  ];
  const machamp = state.players.p2.zones.active.pop();
  state.players.p2.zones.active.push(pokemon({ instanceId: 11, name: 'Opp' }));
  state.players.p2.zones.bench.push(machamp);
  const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p2.zones.bench[0].damage, 10);
  assert.equal(res.state.players.p1.zones.active[0].damage, 10);
});

// ── Wild Growth (consumed before; now under its off-switch and Toxic Gas) ─────────────────────

// Meganium [Neo Genesis 11] Wild Growth
const WILD_GROWTH =
  'As long as Meganium is in play, each {G} Energy card attached to your {G} Pokémon instead provides {G}{G}. This power stops working while Meganium is Asleep, Confused, or Paralyzed.';

test('legacy passive: Wild Growth stops working while an evolved Meganium is Asleep or under Toxic Gas', () => {
  const root = pokemon({ instanceId: 30, name: 'Chikorita' });
  const top = createCard({
    instanceId: 31,
    name: 'Meganium',
    supertype: 'Pokémon',
    stage: 'Stage 2',
    attachedTo: 30,
    abilities: [power('Wild Growth', WILD_GROWTH)],
  });
  const side = [root, top];
  assert.ok(abilityEnergyMultiplier(side), 'Wild Growth reads on the evolved stack');
  root.specialCondition = 'Asleep';
  assert.equal(abilityEnergyMultiplier(side), null);
  root.specialCondition = null;
  const muk = pokemon({ instanceId: 40, name: 'Muk', abilities: [power('Toxic Gas', TOXIC_GAS)] });
  assert.equal(abilityEnergyMultiplier(side, { sideCards: side, opponentSideCards: [muk] }), null);
});

// ── Sticky Goo (consumed before; its position clause now reaches the server price) ──────────

// Dark Muk [Team Rocket 41] Sticky Goo
const STICKY_GOO =
  'As long as Dark Muk is your Active Pokémon, your opponent pays {C}{C} more to retreat his or her Active Pokémon. This power stops working while Dark Muk is Asleep, Confused, or Paralyzed.';

test('legacy passive: an Active Dark Muk makes the opponent pay {C}{C} more to retreat', () => {
  const board = () => {
    const state = setupGame();
    state.players.p2.zones.active.push(pokemon({ instanceId: 10, name: 'Dark Muk', abilities: [power('Sticky Goo', STICKY_GOO)] }));
    state.players.p1.zones.active.push(pokemon({ instanceId: 20, name: 'Rattata', retreatCost: 0 }));
    state.players.p1.zones.bench.push(pokemon({ instanceId: 21, name: 'Pidgey' }));
    return state;
  };
  const retreat = (state) => applyCommand(state, { type: 'retreat', playerId: 'p1', payload: { benchInstanceId: 21 } });
  assert.match(retreat(board()).error, /Not enough energy to retreat \(costs 2\)/);
  const asleep = board();
  asleep.players.p2.zones.active[0].specialCondition = 'Asleep';
  assert.equal(retreat(asleep).error, null);
});
