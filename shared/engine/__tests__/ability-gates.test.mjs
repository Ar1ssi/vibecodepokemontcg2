// Design 034 slice 3: server legality gates for suppression, play locks,
// evolve permission/lock, summon, retreat lock, first-turn attack and status
// immunity, plus picker parity with the shared activation reader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand, validateLegality } from '../reduce.mjs';
import { addCondition, hasCondition } from '../rules/special-conditions.mjs';
import { damageCounterMoveLocked } from '../effects/trainer-steps.mjs';
import { abilityActivationBlockReason } from '../rules/ability-combat.mjs';
import { isUsableAbilityCard } from '../rules/collect-usable-abilities.mjs';

function setupGame({ turn = { number: 2, player: 'p1', phase: 'turn' } } = {}) {
  const state = createGameState({ gameId: 'ability-gates', seed: 7, rulesEnabled: true });
  state.players.p1 = {
    playerId: 'p1',
    username: 'Alice',
    zones: createPlayerZones(),
    flags: { abilitiesUsed: {} },
  };
  state.players.p2 = {
    playerId: 'p2',
    username: 'Bob',
    zones: createPlayerZones(),
    flags: { abilitiesUsed: {} },
  };
  state.turn = { ...turn };
  return state;
}

const pokemon = (extra) =>
  createCard({ supertype: 'Pokémon', stage: 'Basic', hp: 100, ...extra });

const ability = (name, text) => ({ name, type: 'Ability', text });

// ── suppression ──────────────────────────────────────────────────────────

test('useAbility: a Pokémon-source suppression blocks activation (server + picker)', () => {
  const state = setupGame();
  const weezing = pokemon({
    instanceId: 1,
    name: 'Galarian Weezing',
    abilities: [
      ability(
        'Neutralizing Gas',
        "As long as this Pokémon is in the Active Spot, your opponent's Pokémon in play have no Abilities, except for Neutralizing Gas."
      ),
    ],
  });
  state.players.p2.zones.active.push(weezing);
  const kirlia = pokemon({
    instanceId: 2,
    name: 'Kirlia',
    abilities: [
      ability('Refinement', 'Once during your turn, you may draw 2 cards.'),
    ],
  });
  state.players.p1.zones.bench.push(kirlia);
  state.players.p1.zones.deck.push(createCard({ instanceId: 3 }), createCard({ instanceId: 4 }));

  const blocked = validateLegality(state, {
    type: 'useAbility',
    payload: { instanceId: 2 },
    playerId: 'p1',
  });
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason, /suppressed/);

  // Picker parity: the same board context greys the ability out.
  const sideCards = [...state.players.p1.zones.active, ...state.players.p1.zones.bench];
  const opponentSideCards = [...state.players.p2.zones.active, ...state.players.p2.zones.bench];
  assert.equal(
    isUsableAbilityCard(kirlia, {
      zone: 'bench',
      sideCards,
      opponentSideCards,
      sideActive: state.players.p1.zones.active,
      sideBench: state.players.p1.zones.bench,
      opponentActive: state.players.p2.zones.active,
      opponentBench: state.players.p2.zones.bench,
    }),
    false
  );

  // Off the Active Spot the suppression stops and the ability resolves.
  state.players.p2.zones.active = [];
  state.players.p2.zones.bench.push(weezing);
  assert.equal(
    validateLegality(state, {
      type: 'useAbility',
      payload: { instanceId: 2 },
      playerId: 'p1',
    }).allowed,
    true
  );
  const res = applyCommand(
    state,
    { type: 'useAbility', payload: { instanceId: 2 }, playerId: 'p1' },
    undefined
  );
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.hand.length, 2);
});

test('status writes through the effect executor honour immunity', async () => {
  const { executeSteps } = await import('../effects/executor.mjs');
  const state = setupGame();
  const immune = pokemon({
    instanceId: 100,
    name: 'Garganacl ex',
    abilities: [
      ability('Salted Cure', "This Pokémon can't be affected by any Special Conditions."),
    ],
  });
  state.players.p2.zones.active.push(immune);
  const events = [];
  const res = executeSteps(state, {
    steps: [{ type: 'statusAbility', status: 'Poisoned', target: 'opponentActive' }],
    playerId: 'p1',
    activeRng: { next: () => 0.5 },
    events,
  });
  assert.ok(res.completed);
  assert.equal(state.players.p2.zones.active[0].poisoned, undefined);
  assert.equal(
    events.some((e) => e.type === 'statusApplied'),
    false
  );
});

test('addCondition: Special-Condition immunity refuses the write', () => {
  const garganacl = pokemon({
    instanceId: 10,
    name: 'Garganacl ex',
    abilities: [
      ability('Salted Cure', "This Pokémon can't be affected by any Special Conditions."),
    ],
  });
  assert.equal(addCondition(garganacl, 'Asleep'), false);
  assert.equal(hasCondition(garganacl, 'Asleep'), false);

  const hoothoot = pokemon({
    instanceId: 11,
    name: 'Hoothoot',
    abilities: [ability('Insomnia', "This Pokémon can't be Asleep.")],
  });
  assert.equal(addCondition(hoothoot, 'Asleep'), false);
  assert.equal(addCondition(hoothoot, 'Burned'), true);
  assert.equal(hasCondition(hoothoot, 'Burned'), true);

  const plain = pokemon({ instanceId: 12, name: 'Plain' });
  assert.equal(addCondition(plain, 'Poisoned'), true);
  assert.equal(hasCondition(plain, 'Poisoned'), true);
});

// ── play locks ───────────────────────────────────────────────────────────

test('playTrainer: an Item lock refuses the play, off-Active it does not', () => {
  const state = setupGame();
  const gothitelle = pokemon({
    instanceId: 20,
    name: 'Gothitelle',
    abilities: [
      ability(
        'Magic Room',
        "As long as this Pokémon is your Active Pokémon, your opponent can't play any Item cards from his or her hand."
      ),
    ],
  });
  state.players.p2.zones.active.push(gothitelle);
  const item = createCard({
    instanceId: 21,
    name: 'Ultra Ball',
    type: 'Trainer',
    supertype: 'Trainer',
    trainerType: 'Item',
    subtypes: ['Item'],
    text: 'Search your deck for a Pokémon.',
  });
  state.players.p1.zones.hand.push(item);

  const blocked = validateLegality(state, {
    type: 'playTrainer',
    payload: { instanceId: 21 },
    playerId: 'p1',
  });
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason, /prevents playing Item/);

  state.players.p2.zones.active = [];
  state.players.p2.zones.bench.push(gothitelle);
  assert.equal(
    validateLegality(state, {
      type: 'playTrainer',
      payload: { instanceId: 21 },
      playerId: 'p1',
    }).allowed,
    true
  );
});

// ── summon / evolve ──────────────────────────────────────────────────────

test('moveCard: a summon-restricted Pokémon cannot be played from hand', () => {
  const state = setupGame();
  const palafin = pokemon({
    instanceId: 30,
    name: 'Palafin ex',
    abilities: [
      ability(
        'Zero to Hero',
        "Put this Pokémon into play only with the effect of Palafin's Zero to Hero Ability."
      ),
    ],
  });
  const pichu = pokemon({ instanceId: 31, name: 'Pichu' });
  state.players.p1.zones.hand.push(palafin, pichu);

  const blocked = validateLegality(state, {
    type: 'moveCard',
    payload: { instanceId: 30, from: 'hand', to: 'bench' },
    playerId: 'p1',
  });
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason, /Ability's effect/);

  assert.equal(
    validateLegality(state, {
      type: 'moveCard',
      payload: { instanceId: 31, from: 'hand', to: 'bench' },
      playerId: 'p1',
    }).allowed,
    true
  );
});

test('attachCard: evolve permission relaxes the first-turn and just-played gates', () => {
  // Turn 1: Scatterbug may evolve anyway.
  const t1 = setupGame({ turn: { number: 1, player: 'p1', phase: 'turn' } });
  const scatterbug = pokemon({
    instanceId: 40,
    name: 'Scatterbug',
    enteredPlayTurn: 1,
    abilities: [
      ability('Adaptive Evolution', 'This Pokémon can evolve during your first turn or the turn you play it.'),
    ],
  });
  const spewpa = createCard({
    instanceId: 41,
    name: 'Spewpa',
    supertype: 'Pokémon',
    stage: 'Stage 1',
    evolvesFrom: 'Scatterbug',
  });
  t1.players.p1.zones.active.push(scatterbug);
  t1.players.p1.zones.hand.push(spewpa);
  assert.equal(
    validateLegality(t1, {
      type: 'attachCard',
      payload: { instanceId: 41, targetInstanceId: 40 },
      playerId: 'p1',
    }).allowed,
    true
  );

  // A control Basic on turn 1 still can't evolve.
  const control = setupGame({ turn: { number: 1, player: 'p1', phase: 'turn' } });
  const charmander = pokemon({ instanceId: 42, name: 'Charmander', enteredPlayTurn: 1 });
  const charmeleon = createCard({
    instanceId: 43,
    name: 'Charmeleon',
    supertype: 'Pokémon',
    stage: 'Stage 1',
    evolvesFrom: 'Charmander',
  });
  control.players.p1.zones.active.push(charmander);
  control.players.p1.zones.hand.push(charmeleon);
  const controlCheck = validateLegality(control, {
    type: 'attachCard',
    payload: { instanceId: 43, targetInstanceId: 42 },
    playerId: 'p1',
  });
  assert.equal(controlCheck.allowed, false);
  assert.match(controlCheck.reason, /Can't evolve on the first turn/);

  // Turn 4: Eevee's permission needs the Active Spot.
  const later = setupGame({ turn: { number: 4, player: 'p1', phase: 'turn' } });
  const eevee = pokemon({
    instanceId: 44,
    name: 'Eevee',
    enteredPlayTurn: 4,
    abilities: [
      ability(
        'Boosted Evolution',
        'As long as this Pokémon is in the Active Spot, it can evolve during your first turn or the turn you play it.'
      ),
    ],
  });
  const jolteon = createCard({
    instanceId: 45,
    name: 'Jolteon',
    supertype: 'Pokémon',
    stage: 'Stage 1',
    evolvesFrom: 'Eevee',
  });
  later.players.p1.zones.bench.push(eevee);
  later.players.p1.zones.hand.push(jolteon);
  const benchCheck = validateLegality(later, {
    type: 'attachCard',
    payload: { instanceId: 45, targetInstanceId: 44 },
    playerId: 'p1',
  });
  assert.equal(benchCheck.allowed, false);
  assert.match(benchCheck.reason, /just played this turn/);

  later.players.p1.zones.bench = [];
  later.players.p1.zones.active.push(eevee);
  assert.equal(
    validateLegality(later, {
      type: 'attachCard',
      payload: { instanceId: 45, targetInstanceId: 44 },
      playerId: 'p1',
    }).allowed,
    true
  );
});

test('attachCard: an evolve lock refuses the evolution outright', () => {
  const state = setupGame({ turn: { number: 5, player: 'p1', phase: 'turn' } });
  const primal = pokemon({
    instanceId: 50,
    name: 'Primal Kyogre',
    abilities: [
      ability(
        'Primal Law',
        "As long as this Pokémon is in the Active Spot, your opponent can't play any Pokémon from their hand to evolve their Pokémon."
      ),
    ],
  });
  state.players.p2.zones.active.push(primal);
  const charmander = pokemon({ instanceId: 51, name: 'Charmander', enteredPlayTurn: 1 });
  const charmeleon = createCard({
    instanceId: 52,
    name: 'Charmeleon',
    supertype: 'Pokémon',
    stage: 'Stage 1',
    evolvesFrom: 'Charmander',
  });
  state.players.p1.zones.active.push(charmander);
  state.players.p1.zones.hand.push(charmeleon);

  const blocked = validateLegality(state, {
    type: 'attachCard',
    payload: { instanceId: 52, targetInstanceId: 51 },
    playerId: 'p1',
  });
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason, /prevents evolving/);

  state.players.p2.zones.active = [];
  state.players.p2.zones.bench.push(primal);
  assert.equal(
    validateLegality(state, {
      type: 'attachCard',
      payload: { instanceId: 52, targetInstanceId: 51 },
      playerId: 'p1',
    }).allowed,
    true
  );
});

// ── retreat / attack / counter moves ─────────────────────────────────────

test('retreat: an opponent Active-Spot retreat lock refuses the retreat', () => {
  const state = setupGame();
  const active = pokemon({ instanceId: 60, name: 'Active' });
  const benched = pokemon({ instanceId: 61, name: 'Benched' });
  state.players.p1.zones.active.push(active);
  state.players.p1.zones.bench.push(benched);
  const omastar = pokemon({
    instanceId: 62,
    name: 'Omastar',
    abilities: [
      ability(
        'Suffocating Tentacles',
        "As long as this Pokémon is in the Active Spot, your opponent's Active Pokémon can't retreat."
      ),
    ],
  });
  state.players.p2.zones.active.push(omastar);

  const blocked = validateLegality(state, {
    type: 'retreat',
    payload: {},
    playerId: 'p1',
  });
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason, /can't retreat/);

  state.players.p2.zones.active = [];
  state.players.p2.zones.bench.push(omastar);
  assert.equal(
    validateLegality(state, { type: 'retreat', payload: {}, playerId: 'p1' }).allowed,
    true
  );
});

test('attack: Meloetta ex may attack on turn 1, a plain Active may not', () => {
  const state = setupGame({ turn: { number: 1, player: 'p1', phase: 'turn' } });
  const meloetta = pokemon({
    instanceId: 70,
    name: 'Meloetta ex',
    attacks: [{ name: 'Debut', cost: [], damage: '10' }],
    abilities: [
      ability('Debut Performance', 'If you go first, this Pokémon can use attacks during your first turn.'),
    ],
  });
  state.players.p1.zones.active.push(meloetta);
  state.players.p2.zones.active.push(pokemon({ instanceId: 71, name: 'Defender' }));
  assert.equal(
    validateLegality(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' })
      .allowed,
    true
  );

  const control = setupGame({ turn: { number: 1, player: 'p1', phase: 'turn' } });
  control.players.p1.zones.active.push(
    pokemon({
      instanceId: 72,
      name: 'Plain',
      attacks: [{ name: 'Tackle', cost: [], damage: '10' }],
    })
  );
  control.players.p2.zones.active.push(pokemon({ instanceId: 73, name: 'Defender' }));
  const blocked = validateLegality(control, {
    type: 'attack',
    payload: { attackIndex: 0 },
    playerId: 'p1',
  });
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason, /going first can't attack on turn 1/);
});

test('damageCounterMoveLocked: Patrat stops every counter-move path', () => {
  const patrat = pokemon({
    instanceId: 80,
    name: 'Patrat',
    abilities: [
      ability(
        'Counter Guard',
        "Damage counters on each Pokémon (both yours and your opponent's) can't be moved to other Pokémon."
      ),
    ],
  });
  const zone = (active = [], bench = []) => ({ zones: { active, bench } });
  const locked = {
    player: zone([pokemon({ instanceId: 81 })]),
    opponent: zone([patrat]),
  };
  assert.equal(damageCounterMoveLocked(locked), true);
  assert.equal(
    damageCounterMoveLocked({
      player: zone([pokemon({ instanceId: 82 })]),
      opponent: zone(),
    }),
    false
  );
});

test('picker parity: server reason and picker gate agree on the shared reader', () => {
  const kirlia = pokemon({
    instanceId: 90,
    name: 'Kirlia',
    abilities: [
      ability('Refinement', 'Once during your turn, you may draw 2 cards.'),
    ],
  });
  const ctx = { zone: 'bench', used: false };
  const serverReason = abilityActivationBlockReason(kirlia, ctx);
  assert.equal(serverReason, null);
  assert.equal(isUsableAbilityCard(kirlia, { zone: 'bench' }), true);

  const usedReason = abilityActivationBlockReason(kirlia, { ...ctx, used: true });
  assert.equal(usedReason, 'Ability already used this turn.');
  assert.equal(isUsableAbilityCard(kirlia, { zone: 'bench', used: true }), false);
});

// ── slice 4b: on-promotion stamp / window ────────────────────────────────

test('moveCard: bench→active stamps movedToActiveTurn and clears it on the way back', () => {
  const state = setupGame();
  const cobalion = pokemon({
    instanceId: 100,
    name: 'Cobalion ex',
    abilities: [
      ability(
        'Metal Road',
        'Once during your turn, when this Pokémon moves from your Bench to the Active Spot, you may attach a Basic {M} Energy card from your hand to this Pokémon.'
      ),
    ],
  });
  state.players.p1.zones.bench.push(cobalion);

  const moved = applyCommand(state, {
    type: 'moveCard',
    payload: { instanceId: 100, from: 'bench', to: 'active' },
    playerId: 'p1',
  });
  assert.equal(moved.error, null);
  assert.equal(moved.state.players.p1.zones.active[0].movedToActiveTurn, 2);

  // The turn it moved, the promotion trigger is legal.
  assert.equal(
    validateLegality(moved.state, {
      type: 'useAbility',
      payload: { instanceId: 100 },
      playerId: 'p1',
    }).allowed,
    true
  );

  // A later turn makes the stamp stale and the ability illegal.
  const nextTurn = { ...moved.state, turn: { ...moved.state.turn, number: 3 } };
  const blocked = validateLegality(nextTurn, {
    type: 'useAbility',
    payload: { instanceId: 100 },
    playerId: 'p1',
  });
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason, /moved to the Active Spot/);

  // Leaving the Active Spot drops the stamp.
  const back = applyCommand(moved.state, {
    type: 'moveCard',
    payload: { instanceId: 100, from: 'active', to: 'bench' },
    playerId: 'p1',
  });
  assert.equal(back.error, null);
  assert.equal(back.state.players.p1.zones.bench[0].movedToActiveTurn, undefined);
});

test('extra attack: Dipplin attacks twice while Festival Grounds is in play', () => {
  const state = setupGame();
  const dipplin = pokemon({
    instanceId: 110,
    name: 'Dipplin',
    hp: 90,
    attacks: [{ name: 'Do the Wave', cost: [], damage: 30 }],
    abilities: [
      ability(
        'Festival Lead',
        'If Festival Grounds is in play, this Pokémon may use an attack it has twice. If the first attack Knocks Out your opponent\u2019s Active Pokémon, you may attack again after your opponent chooses a new Active Pokémon.'
      ),
    ],
  });
  state.players.p1.zones.active.push(dipplin);
  state.players.p2.zones.active.push(pokemon({ instanceId: 111, name: 'Defender', hp: 200 }));
  state.players.p2.zones.deck.push(createCard({ instanceId: 112, name: 'Card' }));

  // Without the Stadium the second attack is refused.
  const first = applyCommand(state, {
    type: 'attack',
    payload: { attackIndex: 0 },
    playerId: 'p1',
  });
  assert.equal(first.error, null);
  assert.equal(first.state.players.p1.flags.attacksThisTurn, 1);
  // The turn ended (the KO wording never satisfied, no Stadium).
  assert.notEqual(first.state.turn.player, 'p1');

  // With Festival Grounds in play, the turn stays open for the second attack.
  const state2 = setupGame();
  state2.players.p1.zones.active.push({ ...dipplin });
  state2.players.p2.zones.active.push(pokemon({ instanceId: 113, name: 'Defender', hp: 200 }));
  state2.players.p2.zones.deck.push(createCard({ instanceId: 114, name: 'Card' }));
  state2.stadium = createCard({
    instanceId: 115,
    name: 'Festival Grounds',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
  });
  const attack1 = applyCommand(state2, {
    type: 'attack',
    payload: { attackIndex: 0 },
    playerId: 'p1',
  });
  assert.equal(attack1.error, null);
  assert.equal(attack1.state.turn.player, 'p1', 'turn stays with the attacker');
  assert.equal(attack1.state.players.p1.flags.attacksThisTurn, 1);

  const attack2 = applyCommand(attack1.state, {
    type: 'attack',
    payload: { attackIndex: 0 },
    playerId: 'p1',
  });
  assert.equal(attack2.error, null);
  assert.equal(attack2.state.players.p1.flags.attacksThisTurn, 2);
  assert.notEqual(attack2.state.turn.player, 'p1', 'third attack ends the turn');
});
