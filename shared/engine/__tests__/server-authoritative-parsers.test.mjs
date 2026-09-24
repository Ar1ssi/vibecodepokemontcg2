import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, validateLegality } from '../reduce.mjs';
import { createCard } from '../cards.mjs';
import { buildServerAttackContext } from '../rules/attack-damage-context.mjs';
import { parseAttackDamage } from '../rules/damage-parser.mjs';
import { isAbilityCard } from '../rules/ability-effects.mjs';
import { isUsableAbilityCard } from '../rules/collect-usable-abilities.mjs';
import { tcgAbilityFromDetail } from '../rules/rules-state.mjs';
import { executeStadium } from '../effects/stadium.mjs';
import { attachedTools, parseUnlimitedHandEnergyAcceleration } from '../rules/ability-executors.mjs';
import { executeSteps } from '../effects/executor.mjs';

function setupGame(overrides = {}) {
  const state = {
    rulesEnabled: true,
    stateVersion: 1,
    turn: { number: 2, player: 'p1', phase: 'turn' },
    commandLog: [],
    stadium: null,
    players: {
      p1: {
        playerId: 'p1',
        zones: {
          active: [
            createCard({
              instanceId: 1,
              name: 'Pikachu',
              supertype: 'Pokémon',
              type: 'Lightning',
              hp: 60,
              types: ['Lightning'],
              attacks: [
                {
                  name: 'Thunder Shock',
                  damage: 20,
                  cost: ['Lightning'],
                  text: "Flip a coin. If heads, your opponent's Active Pokémon is now Paralyzed.",
                },
                {
                  name: 'Hypnosis',
                  damage: 10,
                  cost: ['Lightning'],
                  text: "Your opponent's Active Pokémon is now Asleep.",
                },
                {
                  name: 'Poison Jab',
                  damage: 30,
                  cost: ['Lightning'],
                  text: "Your opponent's Active Pokémon is now Poisoned.",
                },
                {
                  name: 'Self Sleep',
                  damage: 40,
                  cost: ['Lightning'],
                  text: 'This Pokémon is now Asleep.',
                },
              ],
            }),
            createCard({
              instanceId: 101,
              name: 'Lightning Energy',
              type: 'Energy',
              attachedTo: 1,
            }),
          ],
          bench: [],
          hand: [],
          deck: [createCard({ instanceId: 10, name: 'Card 1' })],
          discard: [],
          prizes: [createCard({ instanceId: 11, name: 'Prize 1' })],
        },
        flags: {},
      },
      p2: {
        playerId: 'p2',
        zones: {
          active: [
            createCard({
              instanceId: 2,
              name: 'Squirtle',
              supertype: 'Pokémon',
              type: 'Water',
              hp: 70,
              types: ['Water'],
              attacks: [{ name: 'Tackle', damage: 10 }],
            }),
          ],
          bench: [],
          hand: [],
          deck: [createCard({ instanceId: 20, name: 'Card 2' })],
          discard: [],
          prizes: [createCard({ instanceId: 21, name: 'Prize 2' })],
        },
        flags: {},
      },
    },
    ...overrides,
  };
  return state;
}

test('attack status: Hypnosis inflicts Asleep unconditionally', () => {
  const state = setupGame();
  // 0.8 means checkup sleep flip rolls tails and Asleep condition remains
  const rng = { next: () => 0.8 };
  const res = applyCommand(
    state,
    {
      type: 'attack',
      payload: { attackIndex: 1 },
      playerId: 'p1',
    },
    rng
  );

  assert.equal(res.error, null);
  const defender = res.state.players.p2.zones.active[0];
  assert.equal(defender.specialCondition, 'Asleep');
  assert.ok(
    res.events.some(
      (e) => e.type === 'specialConditionUpdated' && e.condition === 'Asleep'
    )
  );
});

test('attack status: Thunder Shock inflicts Paralyzed on coin heads, not on tails', () => {
  // Heads roll (< 0.5)
  const stateHeads = setupGame();
  const rngHeads = { next: () => 0.2 };
  const resHeads = applyCommand(
    stateHeads,
    {
      type: 'attack',
      payload: { attackIndex: 0 },
      playerId: 'p1',
    },
    rngHeads
  );
  assert.equal(resHeads.error, null);
  const defHeads = resHeads.state.players.p2.zones.active[0];
  assert.equal(defHeads.specialCondition, 'Paralyzed');

  // Tails roll (>= 0.5)
  const stateTails = setupGame();
  const rngTails = { next: () => 0.8 };
  const resTails = applyCommand(
    stateTails,
    {
      type: 'attack',
      payload: { attackIndex: 0 },
      playerId: 'p1',
    },
    rngTails
  );
  assert.equal(resTails.error, null);
  const defTails = resTails.state.players.p2.zones.active[0];
  assert.equal(defTails.specialCondition, null);
});

test('attack status: Poison Jab inflicts Poisoned marker and deals checkup damage', () => {
  const state = setupGame();
  const rng = { next: () => 0.3 };
  const res = applyCommand(
    state,
    {
      type: 'attack',
      payload: { attackIndex: 2 },
      playerId: 'p1',
    },
    rng
  );

  assert.equal(res.error, null);
  const defender = res.state.players.p2.zones.active[0];
  assert.equal(defender.poisoned, true);
  // Initial damage 30 + checkup poison damage 10 = 40
  assert.equal(defender.damage, 40);
});

test('attack status: Self Sleep inflicts Asleep on the attacker', () => {
  const state = setupGame();
  // We want coin flip in checkup to roll tails (>= 0.5) so Asleep stays on attacker
  const rng = { next: () => 0.8 };
  const res = applyCommand(
    state,
    {
      type: 'attack',
      payload: { attackIndex: 3 },
      playerId: 'p1',
    },
    rng
  );

  assert.equal(res.error, null);
  const attacker = res.state.players.p1.zones.active[0];
  assert.equal(attacker.specialCondition, 'Asleep');
  assert.ok(
    res.events.some(
      (e) =>
        e.type === 'specialConditionUpdated' &&
        e.instanceId === attacker.instanceId &&
        e.condition === 'Asleep'
    )
  );
});

test('buildServerAttackContext: accurately computes damagedBenchCount, grassPokemonCount, and specialEnergyOnSelfCount', () => {
  const state = setupGame();
  const b1 = createCard({
    instanceId: 5,
    name: 'Bulbasaur',
    supertype: 'Pokémon',
    type: 'Grass',
    types: ['Grass'],
    damage: 20,
  });
  const b2 = createCard({
    instanceId: 6,
    name: 'Oddish',
    supertype: 'Pokémon',
    type: 'Grass',
    types: ['Grass'],
    damage: 0,
  });
  state.players.p1.zones.bench.push(b1, b2);

  const dce = createCard({
    instanceId: 102,
    name: 'Double Colorless Energy',
    type: 'Energy',
    subtypes: ['Special'],
    attachedTo: 1,
  });
  state.players.p1.zones.active.push(dce);

  state.players.p2.zones.active[0].specialCondition = 'Confused';

  const ctx = buildServerAttackContext(state, {
    attackerPlayerId: 'p1',
    defenderPlayerId: 'p2',
    attacker: state.players.p1.zones.active[0],
    defender: state.players.p2.zones.active[0],
  });

  assert.equal(ctx.damagedBenchCount, 1);
  assert.equal(ctx.grassPokemonCount, 2);
  assert.equal(ctx.specialEnergyOnSelfCount, 1);
  assert.equal(ctx.opponentStatusCount, 1);

  const attackBenchScale = {
    name: 'Bench Hit',
    damage: 10,
    text: 'This attack does 20 more damage for each of your Benched Pokémon that has any damage counters on it.',
  };
  const parsed = parseAttackDamage(attackBenchScale, {}, {}, ctx);
  assert.equal(parsed.total, 30);
});

test('ability parity: recognizes card.abilities array on server cards', () => {
  const serverCard = createCard({
    instanceId: 70,
    name: 'Pidgeot ex',
    supertype: 'Pokémon',
    type: 'Colorless',
    abilities: [
      {
        name: 'Quick Search',
        text: 'Once during your turn, you may search your deck for a card and put it into your hand. Then, shuffle your deck.',
      },
    ],
  });

  assert.equal(isAbilityCard(serverCard), true);
  assert.equal(isUsableAbilityCard(serverCard), true);
});

test('tcgAbilityFromDetail: recognizes modern Ability entry and falls back to detail.ability', () => {
  const pidgeot = {
    abilities: [
      {
        name: 'Quick Search',
        type: 'Ability',
        effect: 'Once during your turn, you may search your deck for a card.',
      },
    ],
  };
  const legacyCard = {
    ability: {
      name: 'Old Ability',
      text: 'Draw 1 card.',
    },
  };

  const pidgeotAbility = tcgAbilityFromDetail(pidgeot);
  assert.ok(pidgeotAbility);
  assert.equal(pidgeotAbility.name, 'Quick Search');

  const legacyAbility = tcgAbilityFromDetail(legacyCard);
  assert.ok(legacyAbility);
  assert.equal(legacyAbility.name, 'Old Ability');
});

test('executeStadium: handles switch-type and heal once-per-turn kinds', () => {
  const draft = setupGame();
  draft.stadium = createCard({
    instanceId: 90,
    name: 'Water Gym',
    type: 'Trainer',
    subtypes: ['Stadium'],
    text: "Once during each player's turn, that player may switch their Active {W} Pokémon with 1 of their Benched Pokémon.",
  });

  const res = executeStadium(draft, {
    stadium: draft.stadium,
    playerId: 'p1',
    activeRng: { next: () => 0.5 },
  });

  assert.ok(res);
  assert.equal(draft.players.p1.flags.stadiumUsedThisTurn, true);
});

test('executeStadium: handles hand-to-deck-top by placing card on top of deck', () => {
  const draft = setupGame();
  const handCard = createCard({ instanceId: 77, name: 'Hand Card' });
  const topDeckCard = draft.players.p1.zones.deck[0];
  draft.players.p1.zones.hand.push(handCard);

  draft.stadium = createCard({
    instanceId: 91,
    name: 'Top Deck Gym',
    type: 'Trainer',
    subtypes: ['Stadium'],
    text: "Once during each player's turn, that player may put a card from their hand on top of their deck.",
  });

  const events = [];
  // Initial call prompts player to choose card from hand
  const res1 = executeStadium(draft, {
    stadium: draft.stadium,
    playerId: 'p1',
    activeRng: { next: () => 0.5 },
    events,
  });

  assert.ok(res1.pendingChoice);
  assert.equal(res1.pendingChoice.min, 1);
  assert.equal(res1.pendingChoice.max, 1);

  // Resume with chosen hand card
  const res2 = executeStadium(draft, {
    stadium: draft.stadium,
    playerId: 'p1',
    activeRng: { next: () => 0.5 },
    selection: [77],
    resumeToken: res1.pendingChoice.resumeToken,
    events,
  });

  assert.ok(res2.completed);
  // Hand card was unshifted to index 0 (top of deck)
  assert.equal(draft.players.p1.zones.deck[0].instanceId, 77);
  assert.equal(
    draft.players.p1.zones.deck[1].instanceId,
    topDeckCard.instanceId
  );
  assert.ok(
    events.some((e) => e.type === 'cardsMovedToDeckTop' && e.count === 1)
  );
});

test('executeStadium: handles discard-to-bench by generating attachMultipleFromDiscard with count', () => {
  const draft = setupGame();
  const benchMon = createCard({
    instanceId: 88,
    name: 'Pikachu',
    supertype: 'Pokémon',
    type: 'Lightning',
  });
  draft.players.p1.zones.bench.push(benchMon);

  const e1 = createCard({
    instanceId: 201,
    name: 'Lightning Energy',
    type: 'Energy',
    subtypes: ['Basic'],
  });
  const e2 = createCard({
    instanceId: 202,
    name: 'Lightning Energy',
    type: 'Energy',
    subtypes: ['Basic'],
  });
  draft.players.p1.zones.discard.push(e1, e2);

  draft.stadium = createCard({
    instanceId: 92,
    name: 'Thunder Mountain',
    type: 'Trainer',
    subtypes: ['Stadium'],
    text: "Once during each player's turn, that player may put up to 2 Basic {L} Energy cards from their discard pile onto 1 of their Benched Pokémon.",
  });

  const events = [];
  // Initial call prompts for energy or target
  const res = executeStadium(draft, {
    stadium: draft.stadium,
    playerId: 'p1',
    activeRng: { next: () => 0.5 },
    events,
  });

  assert.ok(res);
  // Since there is 1 bench target, attachMultipleFromDiscard asks for up to 2 energies directly
  assert.ok(res.pendingChoice);
  assert.equal(res.pendingChoice.max, 2);
  assert.ok(res.pendingChoice.prompt.includes('Attach up to 2'));
});

test('attachedTools: resolves attached Tool cards via attachedTo in headless state', () => {
  const mon = createCard({ instanceId: 10, name: 'Pikachu' });
  const toolCard = createCard({
    instanceId: 50,
    name: 'Bravery Charm',
    isTool: true,
    attachedTo: 10,
  });
  const zoneCards = [mon, toolCard];
  const found = attachedTools(mon, zoneCards);
  assert.equal(found.length, 1);
  assert.equal(found[0].instanceId, 50);
});

test("effectiveHp: attached Tool (Hero's Cape) prevents knockout when damage equals base HP", () => {
  const state = setupGame();
  const cap = createCard({
    instanceId: 105,
    name: "Hero's Cape",
    type: 'Trainer',
    subtypes: ['Pokémon Tool'],
    isTool: true,
    attachedTo: 2,
    text: 'The Pokémon this card is attached to gets +100 HP.',
  });
  state.players.p2.zones.active.push(cap);

  // Attack with 70 damage (Squirtle base HP is 70)
  state.players.p1.zones.active[0].attacks.push({
    name: 'Mega Shock',
    damage: 70,
    cost: ['Lightning'],
  });

  const res = applyCommand(state, {
    type: 'attack',
    payload: { attackIndex: 4 },
    playerId: 'p1',
  });

  assert.equal(res.error, null);
  const defender = res.state.players.p2.zones.active.find(
    (c) => c.instanceId === 2
  );
  // Squirtle should survive with 70 damage because effective HP is 170 (70 + 100)
  assert.ok(defender, 'Squirtle should not be discarded');
  assert.equal(defender.damage, 70);
  assert.equal(res.state.players.p1.flags.prizesOwed || 0, 0);

  // Separate test state without Hero's Cape -> 70 damage should knock out Squirtle
  const stateNoTool = setupGame();
  stateNoTool.players.p1.zones.active[0].attacks.push({
    name: 'Mega Shock',
    damage: 70,
    cost: ['Lightning'],
  });
  const resKo = applyCommand(stateNoTool, {
    type: 'attack',
    payload: { attackIndex: 4 },
    playerId: 'p1',
  });
  assert.equal(resKo.error, null);
  assert.equal(
    resKo.state.players.p2.zones.active.length,
    0,
    'Squirtle should be knocked out without tool'
  );
  // Taking the last prize while emptying the defender's board is a two-way
  // attacker win (rulebook 30c 1.3a): the game ends immediately for p1 and the
  // prize is collected, rather than held for a tiebreaker.
  assert.equal(resKo.state.turn.phase, 'ended');
  assert.equal(resKo.state.winner, 'p1');
  assert.equal(resKo.state.winReason, 'all prize cards taken');
  assert.equal(resKo.state.players.p1.zones.prizes.length, 0);
  assert.equal(resKo.state.players.p1.flags.prizesOwed, undefined);

  // Third test: 170 damage against Squirtle with Hero's Cape -> should knock out
  const stateBigHit = setupGame();
  stateBigHit.players.p2.zones.active.push(cap);
  stateBigHit.players.p1.zones.active[0].attacks.push({
    name: 'Ultra Shock',
    damage: 170,
    cost: ['Lightning'],
  });
  const resBigKo = applyCommand(stateBigHit, {
    type: 'attack',
    payload: { attackIndex: 4 },
    playerId: 'p1',
  });
  assert.equal(resBigKo.error, null);
  assert.equal(
    resBigKo.state.players.p2.zones.active.length,
    0,
    'Squirtle should be knocked out at 170 HP'
  );
  assert.equal(resBigKo.state.turn.phase, 'ended');
  assert.equal(resBigKo.state.winner, 'p1');
  assert.equal(resBigKo.state.winReason, 'all prize cards taken');
  assert.equal(resBigKo.state.players.p1.zones.prizes.length, 0);
  assert.equal(resBigKo.state.players.p1.flags.prizesOwed, undefined);
});

test('handleKnockout: attached Legacy Energy reduces prizes owed by 1', () => {
  // Full prize row so the KO does not end the game and prizesOwed is observable.
  const state = setupGame();
  state.players.p1.zones.prizes = Array.from({ length: 6 }, (_, i) =>
    createCard({ instanceId: 200 + i, name: `Prize ${i + 1}` })
  );
  state.players.p2.zones.active.push(
    createCard({
      instanceId: 300,
      name: 'Legacy Energy',
      type: 'Energy',
      subtypes: ['Special Energy'],
      attachedTo: 2,
      text: "If the Pokémon this card is attached to is Knocked Out by damage from an attack from your opponent's Pokémon, that player takes 1 fewer Prize card.",
    })
  );
  state.players.p1.zones.active[0].attacks.push({
    name: 'Big Shock',
    damage: 100,
    cost: ['Lightning'],
  });

  const res = applyCommand(state, {
    type: 'attack',
    payload: { attackIndex: 4 },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  assert.equal(
    res.state.players.p1.flags.prizesOwed,
    0,
    'the single KO prize is reduced to 0 by Legacy Energy'
  );
  assert.equal(
    res.state.players.p1.zones.prizes.length,
    6,
    'no prize is collected when Legacy Energy reduces the count to 0'
  );

  // Control: same KO without Legacy Energy collects the full 1 prize.
  const control = setupGame();
  control.players.p1.zones.prizes = Array.from({ length: 6 }, (_, i) =>
    createCard({ instanceId: 200 + i, name: `Prize ${i + 1}` })
  );
  control.players.p1.zones.active[0].attacks.push({
    name: 'Big Shock',
    damage: 100,
    cost: ['Lightning'],
  });
  const resControl = applyCommand(control, {
    type: 'attack',
    payload: { attackIndex: 4 },
    playerId: 'p1',
  });
  assert.equal(resControl.state.players.p1.zones.prizes.length, 5);
});

test('attack heal: heals damage from attacker and emits damageUpdated event', () => {
  const state = setupGame();
  const attacker = state.players.p1.zones.active[0];
  attacker.damage = 50;
  attacker.attacks.push({
    name: 'Draining Kiss',
    damage: 20,
    cost: ['Lightning'],
    text: 'Heal 30 damage from this Pokémon.',
  });

  const res = applyCommand(state, {
    type: 'attack',
    payload: { attackIndex: 4 },
    playerId: 'p1',
  });

  assert.equal(res.error, null);
  const updatedAttacker = res.state.players.p1.zones.active[0];
  // 50 - 30 = 20 damage remaining
  assert.equal(updatedAttacker.damage, 20);
  assert.ok(
    res.events.some(
      (e) =>
        e.type === 'damageUpdated' &&
        e.instanceId === attacker.instanceId &&
        e.healed === 30
    )
  );
});

test('stadium play limit: can only play 1 Stadium per turn', () => {
  const state = setupGame();
  const stadium1 = createCard({
    instanceId: 301,
    name: 'Gym 1',
    type: 'Trainer',
    subtypes: ['Stadium'],
  });
  const stadium2 = createCard({
    instanceId: 302,
    name: 'Gym 2',
    type: 'Trainer',
    subtypes: ['Stadium'],
  });
  state.players.p1.zones.hand.push(stadium1, stadium2);

  // Play first stadium
  const res1 = applyCommand(state, {
    type: 'playTrainer',
    payload: { instanceId: 301 },
    playerId: 'p1',
  });
  assert.equal(res1.error, null);
  assert.equal(res1.state.players.p1.flags.stadiumPlayedThisTurn, true);
  assert.equal(res1.state.stadium?.instanceId, 301);

  // Attempt to play second stadium in same turn
  const res2 = applyCommand(res1.state, {
    type: 'playTrainer',
    payload: { instanceId: 302 },
    playerId: 'p1',
  });
  assert.ok(res2.error);
  assert.match(res2.error, /only play 1 Stadium card per turn/i);
});

test("trainer play conditions: Switch and Boss's Orders validate bench counts", () => {
  const state = setupGame();
  const switchCard = createCard({
    instanceId: 310,
    name: 'Switch',
    type: 'Trainer',
    subtypes: ['Item'],
    text: 'Switch your Active Pokémon with 1 of your Benched Pokémon.',
  });
  const bossOrders = createCard({
    instanceId: 311,
    name: "Boss's Orders",
    type: 'Trainer',
    subtypes: ['Supporter'],
    text: "Switch 1 of your opponent's Benched Pokémon with their Active Pokémon.",
  });
  state.players.p1.zones.hand.push(switchCard, bossOrders);

  // P1 has 0 bench
  const switchLegal = validateLegality(state, {
    type: 'playTrainer',
    payload: { instanceId: 310 },
    playerId: 'p1',
  });
  assert.equal(switchLegal.allowed, false);
  assert.match(switchLegal.reason, /No Benched Pokémon to switch with/i);

  // P2 has 0 bench
  const bossLegal = validateLegality(state, {
    type: 'playTrainer',
    payload: { instanceId: 311 },
    playerId: 'p1',
  });
  assert.equal(bossLegal.allowed, false);
  assert.match(bossLegal.reason, /Opponent has no Benched Pokémon to switch/i);

  // Add bench to p1 and p2
  state.players.p1.zones.bench.push(
    createCard({ instanceId: 312, name: 'Benched P1', supertype: 'Pokémon' })
  );
  state.players.p2.zones.bench.push(
    createCard({ instanceId: 313, name: 'Benched P2', supertype: 'Pokémon' })
  );

  const switchLegalAfter = validateLegality(state, {
    type: 'playTrainer',
    payload: { instanceId: 310 },
    playerId: 'p1',
  });
  assert.equal(switchLegalAfter.allowed, true);

  const bossLegalAfter = validateLegality(state, {
    type: 'playTrainer',
    payload: { instanceId: 311 },
    playerId: 'p1',
  });
  assert.equal(bossLegalAfter.allowed, true);
});

test('evolution legality: enforces turn-1 ban, same-turn ban, stage order, and once-per-turn', () => {
  const state = setupGame({ turn: { number: 1, player: 'p1', phase: 'turn' } });
  const charmander = createCard({
    instanceId: 401,
    name: 'Charmander',
    supertype: 'Pokémon',
    stage: 'Basic',
    enteredPlayTurn: 1,
  });
  const charmeleon = createCard({
    instanceId: 402,
    name: 'Charmeleon',
    supertype: 'Pokémon',
    stage: 'Stage 1',
    evolvesFrom: 'Charmander',
  });
  const charizard = createCard({
    instanceId: 403,
    name: 'Charizard',
    supertype: 'Pokémon',
    stage: 'Stage 2',
    evolvesFrom: 'Charmeleon',
  });
  state.players.p1.zones.bench.push(charmander);
  state.players.p1.zones.hand.push(charmeleon, charizard);

  // Turn 1 check: cannot evolve
  const t1Check = validateLegality(state, {
    type: 'attachCard',
    payload: { instanceId: 402, targetInstanceId: 401 },
    playerId: 'p1',
  });
  assert.equal(t1Check.allowed, false);
  assert.match(t1Check.reason, /Can't evolve on the first turn/i);

  // Turn 3: Charmander was played on Turn 3 (same-turn ban)
  state.turn.number = 3;
  charmander.enteredPlayTurn = 3;
  const sameTurnCheck = validateLegality(state, {
    type: 'attachCard',
    payload: { instanceId: 402, targetInstanceId: 401 },
    playerId: 'p1',
  });
  assert.equal(sameTurnCheck.allowed, false);
  assert.match(sameTurnCheck.reason, /just played this turn/i);

  // Charmander was entered on turn 1 -> Stage skipping check (Basic to Stage 2)
  charmander.enteredPlayTurn = 1;
  const skipCheck = validateLegality(state, {
    type: 'attachCard',
    payload: { instanceId: 403, targetInstanceId: 401 },
    playerId: 'p1',
  });
  assert.equal(skipCheck.allowed, false);
  assert.match(skipCheck.reason, /can't evolve from Basic directly/i);

  // Valid evolution from Charmander to Charmeleon
  const validCheck = validateLegality(state, {
    type: 'attachCard',
    payload: { instanceId: 402, targetInstanceId: 401 },
    playerId: 'p1',
  });
  assert.equal(validCheck.allowed, true);

  // Apply evolution
  const evoRes = applyCommand(state, {
    type: 'attachCard',
    payload: { instanceId: 402, targetInstanceId: 401 },
    playerId: 'p1',
  });
  assert.equal(evoRes.error, null);
  assert.ok(evoRes.events.some((e) => e.type === 'pokemonEvolved'));
  assert.equal(evoRes.state.players.p1.flags.evolved[401], true);

  // Attempting to evolve again in the same turn
  const secondEvoCheck = validateLegality(evoRes.state, {
    type: 'attachCard',
    payload: { instanceId: 403, targetInstanceId: 401 },
    playerId: 'p1',
  });
  assert.equal(secondEvoCheck.allowed, false);
  assert.match(
    secondEvoCheck.reason,
    /Already evolved that Pokémon this turn/i
  );
});

test('Forest of Vitality: a {G} Basic played this turn evolves to Stage 1 then Stage 2', () => {
  const state = setupGame({ turn: { number: 3, player: 'p1', phase: 'turn' } });
  state.stadium = createCard({
    instanceId: 490,
    name: 'Forest of Vitality',
    type: 'Trainer',
    trainerType: 'Stadium',
    ownerId: 'p2',
    text: "Each player's {G} Pokémon can evolve into {G} Pokémon during the turn they play those Pokémon, except during their first turn.",
  });
  const grass = (instanceId, name, stage, evolvesFrom) =>
    createCard({ instanceId, name, supertype: 'Pokémon', stage, evolvesFrom, types: ['Grass'] });
  const bulbasaur = grass(491, 'Bulbasaur', 'Basic');
  bulbasaur.enteredPlayTurn = 3;
  state.players.p1.zones.bench.push(bulbasaur);
  state.players.p1.zones.hand.push(
    grass(492, 'Ivysaur', 'Stage 1', 'Bulbasaur'),
    grass(493, 'Venusaur', 'Stage 2', 'Ivysaur')
  );
  const evolve = (st, instanceId) =>
    applyCommand(st, { type: 'attachCard', payload: { instanceId, targetInstanceId: 491 }, playerId: 'p1' });

  const stage1 = evolve(state, 492);
  assert.equal(stage1.error, null);
  const stage2 = evolve(stage1.state, 493);
  assert.equal(stage2.error, null);
  assert.equal(stage2.events.filter((e) => e.type === 'pokemonEvolved').length, 1);

  // A non-{G} line keeps both gates.
  const fire = setupGame({ turn: { number: 3, player: 'p1', phase: 'turn' } });
  fire.stadium = state.stadium;
  const charmander = createCard({ instanceId: 494, name: 'Charmander', supertype: 'Pokémon', stage: 'Basic', types: ['Fire'] });
  charmander.enteredPlayTurn = 3;
  fire.players.p1.zones.bench.push(charmander);
  fire.players.p1.zones.hand.push(
    createCard({ instanceId: 495, name: 'Charmeleon', supertype: 'Pokémon', stage: 'Stage 1', evolvesFrom: 'Charmander', types: ['Fire'] })
  );
  const blocked = validateLegality(fire, { type: 'attachCard', payload: { instanceId: 495, targetInstanceId: 494 }, playerId: 'p1' });
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason, /just played this turn/i);
});

test('Rare Candy: blocked on turn 1/2 and blocked on same-turn Basics', () => {
  const state = setupGame({ turn: { number: 1, player: 'p1', phase: 'turn' } });
  const candy = createCard({
    instanceId: 450,
    name: 'Rare Candy',
    type: 'Trainer',
    subtypes: ['Item'],
    text: 'Choose 1 of your Basic Pokémon in play. If you have a Stage 2 card in your hand that evolves from that Pokémon, put that card onto the Basic Pokémon to evolve it.',
  });
  const pidgey = createCard({
    instanceId: 451,
    name: 'Pidgey',
    supertype: 'Pokémon',
    stage: 'Basic',
    enteredPlayTurn: 1,
  });
  const pidgeotto = createCard({
    instanceId: 453,
    name: 'Pidgeotto',
    supertype: 'Pokémon',
    stage: 'Stage 1',
    evolvesFrom: 'Pidgey',
  });
  const pidgeot = createCard({
    instanceId: 452,
    name: 'Pidgeot ex',
    supertype: 'Pokémon',
    stage: 'Stage 2',
    evolvesFrom: 'Pidgeotto',
  });
  state.players.p1.zones.bench.push(pidgey);
  state.players.p1.zones.deck.push(pidgeotto);
  state.players.p1.zones.hand.push(candy, pidgeot);

  // Turn 1: Rare Candy blocked
  const candyT1 = validateLegality(state, {
    type: 'playTrainer',
    payload: { instanceId: 450 },
    playerId: 'p1',
  });
  assert.equal(candyT1.allowed, false);
  assert.match(candyT1.reason, /during your first turn/i);

  // Turn 3, but Pidgey was played on Turn 3
  state.turn.number = 3;
  pidgey.enteredPlayTurn = 3;
  const candySameTurn = validateLegality(state, {
    type: 'playTrainer',
    payload: { instanceId: 450 },
    playerId: 'p1',
  });
  assert.equal(candySameTurn.allowed, false);

  // Turn 3, Pidgey was played on Turn 1 -> Allowed
  pidgey.enteredPlayTurn = 1;
  const candyAllowed = validateLegality(state, {
    type: 'playTrainer',
    payload: { instanceId: 450 },
    playerId: 'p1',
  });
  assert.equal(candyAllowed.allowed, true);
});

test('executeSteps: handles discardCostAbility, statusAbility, and opponent gust switchAbility', () => {
  const draft = setupGame();
  const card1 = createCard({ instanceId: 501, name: 'Energy 1' });
  const card2 = createCard({ instanceId: 502, name: 'Energy 2' });
  draft.players.p1.zones.hand.push(card1, card2);

  // 1. discardCostAbility
  const events = [];
  const resDiscard = executeSteps(draft, {
    steps: [{ type: 'discardCostAbility', count: 1 }],
    playerId: 'p1',
    activeRng: { next: () => 0.5 },
    selection: [501],
    events,
  });
  assert.ok(resDiscard.completed);
  assert.equal(
    draft.players.p1.zones.discard.some((c) => c.instanceId === 501),
    true
  );

  // 2. statusAbility
  const resStatus = executeSteps(draft, {
    steps: [
      { type: 'statusAbility', status: 'Poisoned', target: 'opponentActive' },
    ],
    playerId: 'p1',
    activeRng: { next: () => 0.5 },
    events,
  });
  assert.ok(resStatus.completed);
  assert.equal(draft.players.p2.zones.active[0].poisoned, true);

  // 3. switchAbility with target opponent
  const oppBenchMon = createCard({
    instanceId: 505,
    name: 'Opponent Bench Mon',
    supertype: 'Pokémon',
  });
  draft.players.p2.zones.bench.push(oppBenchMon);
  const oppActiveId = draft.players.p2.zones.active[0].instanceId;

  const resSwitch = executeSteps(draft, {
    steps: [{ type: 'switchAbility', target: 'opponent' }],
    playerId: 'p1',
    activeRng: { next: () => 0.5 },
    events,
  });
  assert.ok(resSwitch.completed);
  // Bench mon should now be active
  assert.equal(draft.players.p2.zones.active[0].instanceId, 505);
  // Former active should now be on bench
  assert.equal(draft.players.p2.zones.bench[0].instanceId, oppActiveId);
});

test('parseUnlimitedHandEnergyAcceleration reads {R} as Fire (I98)', () => {
  const text = 'As often as you like during your turn, you may attach a Basic {R} Energy card from your hand to 1 of your Pokémon.';
  assert.equal(parseUnlimitedHandEnergyAcceleration({ abilities: [{ text }] })?.energyType, 'Fire');
});
