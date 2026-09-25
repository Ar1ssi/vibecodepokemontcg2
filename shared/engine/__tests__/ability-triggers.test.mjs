// Design 034 slice 4: ability-trigger planners and their reduce hooks
// (Checkup damage, end-of-turn discard, opponent-evolve counters, thorns).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { addCondition, hasCondition } from '../rules/special-conditions.mjs';
import { createRng, withForcedCoin } from '../rng.mjs';
import {
  parseCheckupAbilities,
  parseOnOpponentEvolveAbilities,
  parseOnDamageAbilities,
  parseOnDamageStatus,
  parseOnEnergyAttachAbilities,
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

test('parseCheckupAbilities: "N instead of 2" adds the difference; a named holder must be Active', () => {
  const state = setupGame();
  const pyroar = pokemon({
    instanceId: 1,
    name: 'Pyroar',
    abilities: [ability('Intimidating Mane', "During Pokémon Checkup, put 4 damage counters on your opponent's Burned Pokémon instead of 2.")],
  });
  const burned = pokemon({ instanceId: 2, name: 'Burned' });
  addCondition(burned, 'Burned');
  state.players.p1.zones.active.push(pyroar);
  state.players.p2.zones.active.push(burned);
  const [effect] = parseCheckupAbilities(inPlayEntries(state), ctxFor(state, 'p1'));
  assert.equal(effect.count, 2);

  const named = setupGame();
  const pecharunt = pokemon({
    instanceId: 3,
    name: 'Pecharunt',
    abilities: [ability('X', "As long as Pecharunt is your Active Pokémon, put 5 more damage counters on your opponent's Poisoned Pokémon during Pokémon Checkup.")],
  });
  const poisoned = pokemon({ instanceId: 4, name: 'Poisoned' });
  addCondition(poisoned, 'Poisoned');
  named.players.p1.zones.active.push(pokemon({ instanceId: 5, name: 'Other' }));
  named.players.p1.zones.bench.push(pecharunt);
  named.players.p2.zones.active.push(poisoned);
  assert.equal(parseCheckupAbilities(inPlayEntries(named), ctxFor(named, 'p1')).length, 0);
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

// ── between-turns abilities (I163) ───────────────────────────────────────

const between = (name, text) => ability(name, text);

test('parseBetweenTurnsAbilities: reads the damage, heal and sleep-flip families', () => {
  const state = setupGame();
  state.players.p1.zones.active.push(
    pokemon({
      instanceId: 1,
      name: 'Seviper',
      abilities: [between('More Poison', "Put 1 more damage counter on your opponent's Poisoned Pokémon between turns.")],
    }),
    pokemon({
      instanceId: 2,
      name: 'Serperior',
      abilities: [between('Royal Heal', 'At any times between turns, heal 10 damage from each of your Pokémon.')],
    })
  );
  state.players.p1.zones.bench.push(
    pokemon({
      instanceId: 3,
      name: 'Snorlax',
      abilities: [
        between(
          'Stir and Snooze',
          'If this Pokémon is Asleep, flip 2 coins instead of 1 between turns. If either of them is tails, this Pokémon is still Asleep.'
        ),
      ],
    })
  );
  const effects = parseBetweenTurnsAbilities(inPlayEntries(state), ctxFor(state, 'p1'));
  assert.deepEqual(
    effects.map((e) => [e.source, e.kind]),
    [
      ['Seviper', 'damage'],
      ['Serperior', 'heal'],
      ['Snorlax', 'sleepFlips'],
    ]
  );
  assert.equal(effects[0].condition, 'Poisoned');
  assert.equal(effects[0].scope, 'opponent');
  assert.equal(effects[1].scope, 'own');
  assert.equal(effects[2].flips, 2);
});

test('I163 Seviper: More Poison adds a counter to the opponent Poisoned Active', () => {
  const state = setupGame();
  state.players.p1.zones.active.push(
    pokemon({
      instanceId: 1,
      name: 'Seviper',
      abilities: [between('More Poison', "Put 1 more damage counter on your opponent's Poisoned Pokémon between turns.")],
    })
  );
  const poisoned = pokemon({ instanceId: 2, name: 'Poisoned' });
  addCondition(poisoned, 'Poisoned');
  state.players.p2.zones.active.push(poisoned);

  const res = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p2.zones.active[0].damage, 20, '10 Poison + 10 More Poison');
});

test('I163 Infernape: Flaming Fighter replaces the Burn counters', () => {
  const state = setupGame();
  state.players.p1.zones.active.push(
    pokemon({
      instanceId: 1,
      name: 'Infernape',
      abilities: [between('Flaming Fighter', "Put 6 damage counters instead of 2 on your opponent's Burned Pokémon between turns.")],
    })
  );
  const burned = pokemon({ instanceId: 2, name: 'Burned' });
  addCondition(burned, 'Burned');
  state.players.p2.zones.active.push(burned);

  const res = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' }, { next: () => 0.9 });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p2.zones.active[0].damage, 60, '6 counters instead of 2');
});

test('I163 Serperior: Royal Heal heals each of your Pokémon at Checkup', () => {
  const state = setupGame();
  state.players.p1.zones.active.push(
    pokemon({
      instanceId: 1,
      name: 'Serperior',
      abilities: [between('Royal Heal', 'At any times between turns, heal 10 damage from each of your Pokémon.')],
    })
  );
  const hurt = pokemon({ instanceId: 2, name: 'Hurt', damage: 30 });
  state.players.p1.zones.bench.push(hurt);
  state.players.p2.zones.active.push(pokemon({ instanceId: 3, name: 'Opp' }));

  const res = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.bench[0].damage, 20);
});

test('I163 Flygon: Sand Slammer puts a counter on each of the opponent Pokémon', () => {
  const state = setupGame();
  state.players.p1.zones.active.push(
    pokemon({
      instanceId: 1,
      name: 'Flygon',
      abilities: [
        between(
          'Sand Slammer',
          "At any time between turns, if this Pokémon is your Active Pokémon, put 1 damage counter on each of your opponent's Pokémon."
        ),
      ],
    })
  );
  state.players.p2.zones.active.push(pokemon({ instanceId: 2, name: 'Active' }));
  state.players.p2.zones.bench.push(pokemon({ instanceId: 3, name: 'Bench' }));

  const res = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p2.zones.active[0].damage, 10);
  assert.equal(res.state.players.p2.zones.bench[0].damage, 10);
});

test('I163 Weezing: Detention Gas hits only the opponent Basic Pokémon', () => {
  const state = setupGame();
  state.players.p1.zones.active.push(
    pokemon({
      instanceId: 1,
      name: 'Weezing',
      abilities: [
        between(
          'Detention Gas',
          "As long as this Pokémon is your Active Pokémon, put 1 damage counter on each of your opponent's Basic Pokémon between turns."
        ),
      ],
    })
  );
  state.players.p2.zones.active.push(pokemon({ instanceId: 2, name: 'Basic' }));
  state.players.p2.zones.bench.push(
    pokemon({ instanceId: 3, name: 'Stage 1', stage: 'Stage 1', subtypes: ['Stage 1'] })
  );

  const res = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p2.zones.active[0].damage, 10);
  assert.equal(res.state.players.p2.zones.bench[0].damage || 0, 0);
});

test('I163 Snorlax: Stir and Snooze flips 2 coins and stays Asleep on a tail', () => {
  const state = setupGame();
  const snorlax = pokemon({
    instanceId: 1,
    name: 'Snorlax',
    abilities: [
      between(
        'Stir and Snooze',
        'If this Pokémon is Asleep, flip 2 coins instead of 1 between turns. If either of them is tails, this Pokémon is still Asleep.'
      ),
    ],
  });
  addCondition(snorlax, 'Asleep');
  state.players.p1.zones.active.push(snorlax);
  state.players.p2.zones.active.push(pokemon({ instanceId: 2, name: 'Opp' }));

  let i = 0;
  const seq = [0.1, 0.9];
  const res = applyCommand(
    state,
    { type: 'pass', payload: {}, playerId: 'p1' },
    { next: () => seq[Math.min(i++, seq.length - 1)] }
  );
  assert.equal(res.error, null);
  assert.ok(hasCondition(res.state.players.p1.zones.active[0], 'Asleep'), 'one tail keeps it Asleep');
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

const QWILFISH =
  "If this Pokémon is in the Active Spot and is damaged by an attack from your opponent's Pokémon (even if this Pokémon is Knocked Out), the Attacking Pokémon is now Poisoned.";
const DELCATTY =
  "If Delcatty is your Active Pokémon and is damaged by an opponent's attack (even if Delcatty is Knocked Out), flip a coin. If heads, the Attacking Pokémon is now Confused.";

test('parseOnDamageStatus: the exact trigger, name-folded and coin-gated; other conditions fail closed', () => {
  const qwilfish = pokemon({ name: 'Qwilfish', abilities: [ability('Poison Point', QWILFISH)] });
  assert.deepEqual(parseOnDamageStatus(qwilfish), { conditions: ['Poisoned'], coin: false, source: 'Qwilfish' });
  const delcatty = pokemon({ name: 'Delcatty', abilities: [ability('Tuff Fur', DELCATTY)] });
  assert.deepEqual(parseOnDamageStatus(delcatty), { conditions: ['Confused'], coin: true, source: 'Delcatty' });
  const gxOnly = pokemon({
    name: 'Sigilyph-GX',
    abilities: [ability('X', QWILFISH.replace("opponent's Pokémon", "opponent's Pokémon-GX"))],
  });
  assert.equal(parseOnDamageStatus(gxOnly), null);
});

function attackIntoTrigger(text, name, rng) {
  const state = setupGame();
  state.players.p1.zones.active.push(
    pokemon({ instanceId: 10, name: 'Attacker', hp: 200, attacks: [{ name: 'Hit', damage: 30, cost: [] }] })
  );
  state.players.p1.zones.deck.push(pokemon({ instanceId: 11, name: 'Deck1' }));
  state.players.p2.zones.active.push(pokemon({ instanceId: 20, name, hp: 200, abilities: [ability('Trigger', text)] }));
  state.players.p2.zones.deck.push(pokemon({ instanceId: 21, name: 'Deck2' }));
  const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' }, rng);
  assert.equal(res.error, null);
  return res.state.players.p1.zones.active[0];
}

test('on-damage status hook: the Attacking Pokémon is Poisoned when it damages Qwilfish', () => {
  assert.equal(hasCondition(attackIntoTrigger(QWILFISH, 'Qwilfish', createRng(3)), 'Poisoned'), true);
});

test('on-damage status hook: a coin-gated condition lands only on heads', () => {
  const heads = attackIntoTrigger(DELCATTY, 'Delcatty', withForcedCoin(createRng(3), 'heads'));
  const tails = attackIntoTrigger(DELCATTY, 'Delcatty', withForcedCoin(createRng(3), 'tails'));
  assert.equal(hasCondition(heads, 'Confused'), true);
  assert.equal(hasCondition(tails, 'Confused'), false);
});

const VAPOREON =
  'Whenever you attach a {W} Energy card from your hand to Vaporeon, remove all Special Conditions affecting Vaporeon.';
const MAGEARNA =
  'As long as this Pokémon is in the Active Spot, whenever you attach an Energy card from your hand to 1 of your Pokémon, heal 90 damage from that Pokémon.';
const energy = (instanceId, type) =>
  createCard({ instanceId, name: `${type} Energy`, supertype: 'Energy', subtypes: ['Basic'] });

test('parseOnEnergyAttachAbilities: typed self trigger, team heal from the Active only', () => {
  const vaporeon = pokemon({ name: 'Vaporeon', abilities: [ability('Water Veil', VAPOREON)] });
  const ctx = { sideActive: [vaporeon], sideBench: [] };
  assert.deepEqual(
    parseOnEnergyAttachAbilities(vaporeon, energy(1, 'Water'), ctx).map(({ recover, heal }) => ({ recover, heal })),
    [{ recover: true, heal: 0 }]
  );
  assert.deepEqual(parseOnEnergyAttachAbilities(vaporeon, energy(2, 'Fire'), ctx), []);
  const magearna = pokemon({ name: 'Magearna', abilities: [ability('Mystic Heart', MAGEARNA)] });
  const benched = pokemon({ name: 'Benched' });
  const fromActive = parseOnEnergyAttachAbilities(benched, energy(3, 'Fire'), { sideActive: [magearna], sideBench: [benched] });
  assert.deepEqual(fromActive.map((e) => e.heal), [90]);
  assert.deepEqual(parseOnEnergyAttachAbilities(benched, energy(4, 'Fire'), { sideActive: [benched], sideBench: [magearna] }), []);
});

test('energy-attach hook: attaching from the hand recovers Vaporeon and Magearna heals the target', () => {
  const state = setupGame();
  const vaporeon = pokemon({ instanceId: 10, name: 'Vaporeon', abilities: [ability('Water Veil', VAPOREON)] });
  addCondition(vaporeon, 'Asleep');
  state.players.p1.zones.active.push(vaporeon);
  state.players.p1.zones.hand.push(energy(30, 'Water'));
  const res = applyCommand(state, { type: 'attachCard', payload: { instanceId: 30, targetInstanceId: 10 }, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(hasCondition(res.state.players.p1.zones.active[0], 'Asleep'), false);

  const team = setupGame();
  team.players.p1.zones.active.push(pokemon({ instanceId: 10, name: 'Magearna', abilities: [ability('Mystic Heart', MAGEARNA)] }));
  team.players.p1.zones.bench.push(pokemon({ instanceId: 11, name: 'Benched', damage: 120 }));
  team.players.p1.zones.hand.push(energy(31, 'Fire'));
  const healed = applyCommand(team, { type: 'attachCard', payload: { instanceId: 31, targetInstanceId: 11 }, playerId: 'p1' });
  assert.equal(healed.error, null);
  assert.equal(healed.state.players.p1.zones.bench[0].damage, 30);
});

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
