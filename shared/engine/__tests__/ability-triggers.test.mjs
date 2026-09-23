// Design 034 slice 4: ability-trigger planners and their reduce hooks
// (Checkup damage, end-of-turn discard, opponent-evolve counters, thorns).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { addCondition } from '../rules/special-conditions.mjs';
import {
  parseCheckupAbilities,
  parseOnOpponentEvolveAbilities,
  parseOnDamageAbilities,
  parseEndOfTurnAbilities,
  parseOnKoAbilities,
  parseOnPromotionAbilities,
  parseBetweenTurnsAbilities,
  parsePlayLocks,
  inPlayEntries,
} from '../rules/ability-triggers.mjs';

function setupGame({ turn = { number: 5, player: 'p1', phase: 'turn' } } = {}) {
  const state = createGameState({
    gameId: 'ability-triggers',
    seed: 7,
    rulesEnabled: true,
  });
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
const ctxFor = (state, playerId) => {
  const own = state.players[playerId].zones;
  const other = Object.values(state.players).find((p) => p.playerId !== playerId).zones;
  return {
    sideCards: [...own.active, ...own.bench],
    opponentSideCards: [...other.active, ...other.bench],
    sideActive: own.active,
    sideBench: own.bench,
    opponentActive: other.active,
    opponentBench: other.bench,
  };
};

// ── Checkup ──────────────────────────────────────────────────────────────

test('parseCheckupAbilities: scope, Ability filter and holder-Active gate', () => {
  const state = setupGame();
  const froslass = pokemon({
    instanceId: 1,
    name: 'Froslass',
    abilities: [
      ability(
        'Freezing Shroud',
        "During Pokémon Checkup, put 1 damage counter on each Pokémon that has an Ability (both yours and your opponent's), except any Froslass."
      ),
    ],
  });
  const kirlia = pokemon({
    instanceId: 2,
    name: 'Kirlia',
    abilities: [ability('Refinement', 'Once during your turn, you may draw 2 cards.')],
  });
  const plain = pokemon({ instanceId: 3, name: 'Plain' });
  state.players.p1.zones.active.push(froslass);
  state.players.p2.zones.active.push(kirlia);
  state.players.p2.zones.bench.push(plain);

  const effects = parseCheckupAbilities(inPlayEntries(state), ctxFor(state, 'p1'));
  assert.equal(effects.length, 1);
  const targets = effects[0].targets.map((t) => t.card.name);
  assert.deepEqual(targets, ['Kirlia']);

  // Trevenant only fires while it is Active, and only hits the opponent's Active.
  const trevenant = pokemon({
    instanceId: 4,
    name: 'Trevenant',
    abilities: [
      ability(
        'Forest Miasma',
        "During Pokémon Checkup, if this Pokémon is in the Active Spot, put 1 damage counter on your opponent's Active Pokémon."
      ),
    ],
  });
  const t = setupGame();
  t.players.p1.zones.bench.push(trevenant);
  t.players.p2.zones.active.push(pokemon({ instanceId: 5, name: 'Opp Active' }));
  t.players.p2.zones.bench.push(pokemon({ instanceId: 6, name: 'Opp Bench' }));
  assert.equal(parseCheckupAbilities(inPlayEntries(t), ctxFor(t, 'p1')).length, 0);
  t.players.p1.zones.bench = [];
  t.players.p1.zones.active.push(trevenant);
  const active = parseCheckupAbilities(inPlayEntries(t), ctxFor(t, 'p1'));
  assert.equal(active.length, 1);
  assert.deepEqual(active[0].targets.map((x) => x.card.name), ['Opp Active']);
});

test('Checkup hook: Froslass damages every in-play Ability holder except itself', () => {
  const state = setupGame();
  const froslass = pokemon({
    instanceId: 1,
    name: 'Froslass',
    abilities: [
      ability(
        'Freezing Shroud',
        "During Pokémon Checkup, put 1 damage counter on each Pokémon that has an Ability (both yours and your opponent's), except any Froslass."
      ),
    ],
  });
  const kirlia = pokemon({
    instanceId: 2,
    name: 'Kirlia',
    abilities: [ability('Refinement', 'Once during your turn, you may draw 2 cards.')],
  });
  state.players.p1.zones.active.push(froslass);
  state.players.p2.zones.active.push(kirlia);

  const res = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p2.zones.active[0].damage, 10);
  assert.equal(res.state.players.p1.zones.active[0].damage || 0, 0);
});

test('Checkup hook: Magmortar adds counters on the opponent\'s Burned Pokémon', () => {
  const state = setupGame();
  const magmortar = pokemon({
    instanceId: 1,
    name: 'Magmortar',
    abilities: [
      ability(
        'Magma Surge',
        "During Pokémon Checkup, put 3 more damage counters on your opponent's Burned Pokémon."
      ),
    ],
  });
  const burned = pokemon({ instanceId: 2, name: 'Burned' });
  state.players.p1.zones.active.push(magmortar);
  state.players.p2.zones.active.push(burned);
  addCondition(burned, 'Burned');

  const res = applyCommand(
    state,
    { type: 'pass', payload: {}, playerId: 'p1' },
    { next: () => 0.9 }
  );
  assert.equal(res.error, null);
  // 20 from Burn + 30 from Magma Surge.
  assert.equal(res.state.players.p2.zones.active[0].damage, 50);
});

// ── end of turn ──────────────────────────────────────────────────────────

test('parseEndOfTurnAbilities: only the Active holder discards', () => {
  const state = setupGame();
  const greatTusk = pokemon({
    instanceId: 1,
    name: 'Great Tusk ex',
    abilities: [
      ability(
        'Quaking Demolition',
        'Once at the end of your turn (after your attack), if this Pokémon is in the Active Spot, you must discard the top 5 cards of your deck.'
      ),
    ],
  });
  state.players.p1.zones.bench.push(greatTusk);
  assert.equal(parseEndOfTurnAbilities(inPlayEntries(state), ctxFor(state, 'p1')).length, 0);
  state.players.p1.zones.bench = [];
  state.players.p1.zones.active.push(greatTusk);
  const effects = parseEndOfTurnAbilities(inPlayEntries(state), ctxFor(state, 'p1'));
  assert.equal(effects.length, 1);
  assert.equal(effects[0].kind, 'discardTop');
  assert.equal(effects[0].n, 5);
});

test('end-of-turn hook: Great Tusk ex discards the top 5 cards', () => {
  const state = setupGame();
  const greatTusk = pokemon({
    instanceId: 1,
    name: 'Great Tusk ex',
    abilities: [
      ability(
        'Quaking Demolition',
        'Once at the end of your turn (after your attack), if this Pokémon is in the Active Spot, you must discard the top 5 cards of your deck.'
      ),
    ],
  });
  state.players.p1.zones.active.push(greatTusk);
  for (let i = 0; i < 8; i++) {
    state.players.p1.zones.deck.push(createCard({ instanceId: 100 + i }));
  }

  const res = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.deck.length, 3);
  assert.equal(res.state.players.p1.zones.discard.length, 5);
});

// ── opponent evolves ─────────────────────────────────────────────────────

test('parseOnOpponentEvolveAbilities: Darkest Impulse is non-stacking', () => {
  const state = setupGame();
  const ampharos = pokemon({
    instanceId: 1,
    name: "Team Rocket's Ampharos",
    abilities: [
      ability(
        'Darkest Impulse',
        'Whenever your opponent plays a Pokémon from their hand to evolve 1 of their Pokémon, put 4 damage counters on that Pokémon. The effect of Darkest Impulse doesn\'t stack.'
      ),
    ],
  });
  state.players.p2.zones.active.push(ampharos);
  const effects = parseOnOpponentEvolveAbilities(inPlayEntries(state), ctxFor(state, 'p1'));
  assert.equal(effects.length, 1);
  assert.equal(effects[0].count, 4);
  assert.equal(effects[0].playerId, 'p2');
});

test('opponent-evolve hook: the evolved Pokémon takes 4 counters', () => {
  const state = setupGame({ turn: { number: 5, player: 'p1', phase: 'turn' } });
  const ampharos = pokemon({
    instanceId: 1,
    name: "Team Rocket's Ampharos",
    abilities: [
      ability(
        'Darkest Impulse',
        'Whenever your opponent plays a Pokémon from their hand to evolve 1 of their Pokémon, put 4 damage counters on that Pokémon.'
      ),
    ],
  });
  const charmander = pokemon({
    instanceId: 2,
    name: 'Charmander',
    enteredPlayTurn: 1,
  });
  const charmeleon = createCard({
    instanceId: 3,
    name: 'Charmeleon',
    supertype: 'Pokémon',
    stage: 'Stage 1',
    evolvesFrom: 'Charmander',
  });
  state.players.p2.zones.active.push(ampharos);
  state.players.p1.zones.active.push(charmander);
  state.players.p1.zones.hand.push(charmeleon);

  const res = applyCommand(state, {
    type: 'attachCard',
    payload: { instanceId: 3, targetInstanceId: 2 },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.active[0].damage, 40);
});

// ── thorns ───────────────────────────────────────────────────────────────

test('parseOnDamageAbilities: zone gate and suppression', () => {
  const thornsMon = pokemon({
    instanceId: 1,
    name: 'Stunfisk',
    abilities: [
      ability(
        'Custom Trap',
        "If this Pokémon is in the Active Spot, has a Pokémon Tool attached, and is damaged by an attack from your opponent's Pokémon (even if this Pokémon is Knocked Out), put 5 damage counters on the Attacking Pokémon."
      ),
    ],
  });
  assert.equal(parseOnDamageAbilities(thornsMon, { isActive: true }).count, 5);
  assert.equal(parseOnDamageAbilities(thornsMon, { isActive: false }).count, 0);

  const weezing = pokemon({
    instanceId: 2,
    name: 'Galarian Weezing',
    abilities: [
      ability(
        'Neutralizing Gas',
        "As long as this Pokémon is in the Active Spot, your opponent's Pokémon in play have no Abilities, except for Neutralizing Gas."
      ),
    ],
  });
  const suppressed = parseOnDamageAbilities(thornsMon, {
    isActive: true,
    sideActive: [thornsMon],
    sideBench: [],
    sideCards: [thornsMon],
    opponentActive: [weezing],
    opponentBench: [],
    opponentSideCards: [weezing],
  });
  assert.equal(suppressed.count, 0);
});

// ── readers pending wiring (slice 5/6 executors) ─────────────────────────

test('parseOnKoAbilities: reads Miraidon Photon Cord', () => {
  const state = setupGame();
  state.players.p1.zones.active.push(
    pokemon({
      instanceId: 1,
      name: 'Miraidon',
      abilities: [
        ability(
          'Photon Cord',
          "If this Pokémon is in the Active Spot and is Knocked Out by damage from an attack from your opponent's Pokémon, move up to 2 Basic {L} Energy cards from this Pokémon to 1 of your Benched Pokémon."
        ),
      ],
    })
  );
  const effects = parseOnKoAbilities(inPlayEntries(state), ctxFor(state, 'p1'));
  assert.equal(effects.length, 1);
  assert.equal(effects[0].basic, true);
  assert.equal(effects[0].upTo, 2);
  assert.equal(effects[0].activeOnly, true);
  assert.equal(effects[0].energyType, 'lightning');
  assert.equal(effects[0].targetKind, 'bench');
  assert.equal(effects[0].selfSource, true);
});

test('parseOnKoAbilities: reads Raichu Electrical Grounding (holder target)', () => {
  const state = setupGame();
  state.players.p1.zones.bench.push(
    pokemon({
      instanceId: 1,
      name: 'Raichu',
      abilities: [
        ability(
          'Electrical Grounding',
          "When 1 of your Pokémon is Knocked Out by damage from an attack from your opponent's Pokémon, you may move a {L} Energy from that Pokémon to this Pokémon."
        ),
      ],
    })
  );
  const effects = parseOnKoAbilities(inPlayEntries(state), ctxFor(state, 'p1'));
  assert.equal(effects.length, 1);
  assert.equal(effects[0].energyType, 'lightning');
  assert.equal(effects[0].targetKind, 'holder');
  assert.equal(effects[0].selfSource, false);
  assert.equal(effects[0].activeOnly, false);
});

test('on-KO energy move: Veluza moves its Energy to the only Benched Pokémon', () => {
  const state = setupGame({ turn: { number: 5, player: 'p2', phase: 'turn' } });
  const veluza = pokemon({
    instanceId: 1,
    name: 'Veluza',
    hp: 60,
    abilities: [
      ability(
        'Fillet Memento',
        "If this Pokémon is in the Active Spot and is Knocked Out by damage from an attack from your opponent's Pokémon, move up to 2 {W} Energy cards from this Pokémon to 1 of your Benched Pokémon."
      ),
    ],
  });
  const benchMon = pokemon({ instanceId: 2, name: 'Bench' });
  const water = createCard({
    instanceId: 3,
    name: 'Water Energy',
    supertype: 'Energy',
    subtypes: ['Basic'],
    attachedTo: 1,
  });
  const lightning = createCard({
    instanceId: 4,
    name: 'Lightning Energy',
    supertype: 'Energy',
    subtypes: ['Basic'],
    attachedTo: 1,
  });
  state.players.p1.zones.active.push(veluza, water, lightning);
  state.players.p1.zones.bench.push(benchMon);
  state.players.p1.zones.deck.push(createCard({ instanceId: 90, name: 'Deck' }));

  const attacker = createCard({
    instanceId: 50,
    name: 'Attacker',
    attacks: [{ name: 'KO', cost: [], damage: 200 }],
  });
  state.players.p2.zones.active.push(attacker);
  state.players.p2.zones.deck.push(createCard({ instanceId: 91, name: 'Deck' }));

  const res = applyCommand(
    state,
    { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p2' },
    undefined
  );
  assert.equal(res.error, null);

  // Veluza (and its Energy) is discarded, then the Ability pulls the {W}
  // Energy back out onto the sole Benched Pokémon; the {L} stays behind.
  const landed = [
    ...res.state.players.p1.zones.active,
    ...res.state.players.p1.zones.bench,
  ].find((c) => c.instanceId === 3);
  assert.ok(landed, 'Water Energy moved onto the Benched Pokémon');
  assert.equal(landed.attachedTo, 2);
  assert.ok(
    res.state.players.p1.zones.discard.some((c) => c.instanceId === 4),
    'non-Water Energy stays in the discard pile'
  );
  const energyEvent = res.events.find((e) => e.type === 'koEnergyMoveRequested');
  assert.ok(energyEvent, 'on-KO energy move announced');
  assert.equal(energyEvent.source, 'Veluza');
});



test('parseOnPromotionAbilities: reads Iron Valiant ex Tachyon Bits', () => {
  const state = setupGame();
  state.players.p1.zones.bench.push(
    pokemon({
      instanceId: 1,
      name: 'Iron Valiant ex',
      abilities: [
        ability(
          'Tachyon Bits',
          "Once during your turn, when this Pokémon moves from your Bench to the Active Spot, you may put 2 damage counters on 1 of your opponent's Pokémon."
        ),
      ],
    })
  );
  const effects = parseOnPromotionAbilities(inPlayEntries(state), ctxFor(state, 'p1'));
  assert.equal(effects.length, 1);
  assert.equal(effects[0].count, 2);
});

test('parseBetweenTurnsAbilities: keeps the family in one place', () => {
  const state = setupGame();
  state.players.p1.zones.active.push(
    pokemon({
      instanceId: 1,
      name: 'Synthetic',
      abilities: [
        ability(
          'Night Chill',
          "In between turns, put 1 damage counter on your opponent's Active Pokémon."
        ),
      ],
    })
  );
  const effects = parseBetweenTurnsAbilities(inPlayEntries(state), ctxFor(state, 'p1'));
  assert.equal(effects.length, 1);
  assert.equal(effects[0].count, 1);
  assert.equal(effects[0].scope, 'opponent');
});

test('parsePlayLocks: delegates to the shared play-lock reader', () => {
  const item = createCard({
    instanceId: 1,
    name: 'Ultra Ball',
    type: 'Trainer',
    supertype: 'Trainer',
    trainerType: 'Item',
    subtypes: ['Item'],
    text: 'Search your deck for a Pokémon.',
  });
  const gothitelle = pokemon({
    instanceId: 2,
    name: 'Gothitelle',
    abilities: [
      ability(
        'Magic Room',
        "As long as this Pokémon is your Active Pokémon, your opponent can't play any Item cards from his or her hand."
      ),
    ],
  });
  const lock = parsePlayLocks(item, {
    sideActive: [],
    sideBench: [],
    sideCards: [],
    opponentActive: [gothitelle],
    opponentBench: [],
    opponentSideCards: [gothitelle],
  });
  assert.ok(lock);
  assert.deepEqual(lock.cards, ['Item']);
});
