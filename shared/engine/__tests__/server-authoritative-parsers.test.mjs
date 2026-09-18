import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '../reduce.mjs';
import { createCard } from '../cards.mjs';
import { buildServerAttackContext } from '../rules/attack-damage-context.mjs';
import { parseAttackDamage } from '../rules/damage-parser.mjs';
import { isAbilityCard } from '../rules/ability-effects.mjs';
import { isUsableAbilityCard } from '../rules/collect-usable-abilities.mjs';
import { tcgAbilityFromDetail } from '../rules/rules-state.mjs';
import { executeStadium } from '../effects/stadium.mjs';

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
            createCard({ instanceId: 101, name: 'Lightning Energy', type: 'Energy', attachedTo: 1 }),
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
  assert.ok(res.events.some((e) => e.type === 'specialConditionUpdated' && e.condition === 'Asleep'));
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
  assert.equal(draft.players.p1.zones.deck[1].instanceId, topDeckCard.instanceId);
  assert.ok(events.some((e) => e.type === 'cardsMovedToDeckTop' && e.count === 1));
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

  const e1 = createCard({ instanceId: 201, name: 'Lightning Energy', type: 'Energy', subtypes: ['Basic'] });
  const e2 = createCard({ instanceId: 202, name: 'Lightning Energy', type: 'Energy', subtypes: ['Basic'] });
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

