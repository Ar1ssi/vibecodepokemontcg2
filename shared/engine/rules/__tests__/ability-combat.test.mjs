// Ability-combat readers (design 034 slice 2). Real card wordings come from the
// S278 corpus sweeps (.agent/scratch/ability-series-audit/rows-*.json).
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  abilityDamageBonus,
  abilityDamageReduction,
  abilityDamagePrevention,
  abilityWeaknessOverride,
  abilityHpBonus,
  abilityPrizeModify,
  abilityRetreatCost,
  abilityAttackCostDiscount,
  abilityIgnoresDefenderEffects,
  abilityExtraTypes,
  abilityEnergyMultiplier,
  applyEnergyMultiplier,
} = await import('../ability-combat.mjs');

let nextId = 1;
const mon = (name, extra = {}) => ({
  instanceId: nextId++,
  name,
  type: 'Pokémon',
  stage: 'Basic',
  subtypes: ['Basic'],
  types: ['Colorless'],
  hp: 100,
  abilities: [],
  ...extra,
});

const ability = (name, text) => ({ name, text });

/** Attach a card to a Pokémon by instanceId. */
const attached = (card, host) => ({ ...card, attachedTo: host.instanceId });

const energy = (name, type, extra = {}) => ({
  instanceId: nextId++,
  name,
  type: 'Energy',
  supertype: 'Energy',
  types: [type],
  ...extra,
});

const tool = (name, extra = {}) => ({
  instanceId: nextId++,
  name,
  type: 'Trainer',
  supertype: 'Trainer',
  trainerType: 'Tool',
  ...extra,
});

// ── damage bonus ─────────────────────────────────────────────────────────

test('abilityDamageBonus: team type bonus applies to a matching attacker', () => {
  const garganacl = mon('Garganacl', {
    types: ['Fighting'],
    abilities: [
      ability(
        'Powerful a-Salt',
        "Attacks used by your {F} Pokémon do 30 more damage to your opponent's Active Pokémon (before applying Weakness and Resistance)."
      ),
    ],
  });
  const fighter = mon('Fighter', { types: ['Fighting'] });
  const water = mon('Water', { types: ['Water'] });
  const defender = mon('Defender');
  const ctx = { sideCards: [fighter, garganacl], isActive: true };
  assert.equal(abilityDamageBonus(fighter, defender, ctx), 30);
  assert.equal(abilityDamageBonus(water, defender, ctx), 0);
  assert.equal(
    abilityDamageBonus(fighter, defender, { ...ctx, isActive: false }),
    0
  );
});

test('abilityDamageBonus: "this Pokémon" holder and in-play conditions', () => {
  const seviper = mon('Seviper', {
    types: ['Darkness'],
    abilities: [
      ability(
        'Sudden Stripe',
        "If you have any {D} Mega Evolution Pokémon ex in play, attacks used by this Pokémon do 120 more damage to your opponent's Active Pokémon (before applying Weakness and Resistance)."
      ),
    ],
  });
  const megaEx = mon('Mega Darkrai ex', { types: ['Darkness'] });
  const defender = mon('Defender');
  assert.equal(
    abilityDamageBonus(seviper, defender, { sideCards: [seviper] }),
    0
  );
  assert.equal(
    abilityDamageBonus(seviper, defender, { sideCards: [seviper, megaEx] }),
    120
  );
});

test('abilityDamageBonus: scaling wording and non-stacking', () => {
  const kingambit = mon('Kingambit', {
    abilities: [
      ability(
        'Supreme Overlord',
        "Attacks used by this Pokémon do 30 more damage to your opponent's Active Pokémon for each Prize card your opponent has taken (before applying Weakness and Resistance)."
      ),
    ],
  });
  const defender = mon('Defender');
  assert.equal(
    abilityDamageBonus(kingambit, defender, { sideCards: [kingambit] }),
    0
  );

  const text =
    "All of your Pokémon that have any {W} Energy attached take 50 less damage from attacks from your opponent's Pokémon (after applying Weakness and Resistance). The effect of Tundra Wall doesn't stack.";
  const a = mon('Aurorus', { abilities: [ability('Tundra Wall', text)] });
  const b = mon('Aurorus', { abilities: [ability('Tundra Wall', text)] });
  const walled = mon('Walled', { types: ['Water'] });
  const wallEnergy = attached(energy('Water Energy', 'Water'), walled);
  const ctx = {
    sideCards: [walled, wallEnergy, a, b],
    zone: 'active',
    isActive: true,
  };
  assert.equal(abilityDamageReduction(walled, defender, ctx).afterWR, 50);
});

// ── damage reduction ─────────────────────────────────────────────────────

test('abilityDamageReduction: team scope, conditions and placement', () => {
  const bronzong = mon('Bronzong', {
    abilities: [
      ability(
        'Metal Fortress',
        "All of your Pokémon take 10 less damage from attacks from your opponent's Pokémon (after applying Weakness and Resistance)."
      ),
    ],
  });
  const defender = mon('Defender');
  const attacker = mon('Attacker');
  assert.deepEqual(
    abilityDamageReduction(defender, attacker, { sideCards: [defender, bronzong] }),
    { beforeWR: 0, afterWR: 10 }
  );

  const aurorus = mon('Aurorus', {
    abilities: [
      ability(
        'Tundra Wall',
        "All of your Pokémon that have any {W} Energy attached take 50 less damage from attacks from your opponent's Pokémon (after applying Weakness and Resistance). The effect of Tundra Wall doesn't stack."
      ),
    ],
  });
  const waterMon = mon('Water Mon', { types: ['Water'] });
  const waterEnergy = attached(energy('Water Energy', 'Water'), waterMon);
  assert.equal(
    abilityDamageReduction(waterMon, attacker, {
      sideCards: [waterMon, waterEnergy, aurorus],
    }).afterWR,
    50
  );
  assert.equal(
    abilityDamageReduction(waterMon, attacker, { sideCards: [waterMon, aurorus] })
      .afterWR,
    0
  );

  const pyroar = mon('Pyroar', {
    abilities: [
      ability(
        'Intimidating Fang',
        "As long as this Pokémon is in the Active Spot, attacks used by your opponent's Active Pokémon do 30 less damage (before applying Weakness and Resistance)."
      ),
    ],
  });
  assert.deepEqual(
    abilityDamageReduction(pyroar, attacker, {
      sideCards: [pyroar],
      sideActive: [pyroar],
      isActive: true,
    }),
    { beforeWR: 30, afterWR: 0 }
  );
});

test('abilityDamageReduction: full-HP, energy and attacker-tool conditions', () => {
  const attacker = mon('Attacker');
  const armarouge = mon('Armarouge ex', {
    abilities: [
      ability(
        'Flame Screen',
        "If this Pokémon has full HP, it takes 80 less damage from attacks from your opponent's Pokémon (after applying Weakness and Resistance)."
      ),
    ],
  });
  assert.equal(
    abilityDamageReduction(armarouge, attacker, { sideCards: [armarouge] }).afterWR,
    80
  );
  assert.equal(
    abilityDamageReduction({ ...armarouge, damage: 20 }, attacker, {
      sideCards: [armarouge],
    }).afterWR,
    0
  );

  const regirock = mon('Regirock', {
    abilities: [
      ability(
        'Primal Armor',
        'If this Pokémon has any Energy attached, it takes 30 less damage from attacks (after applying Weakness and Resistance).'
      ),
    ],
  });
  const rockEnergy = attached(energy('Fighting Energy', 'Fighting'), regirock);
  assert.equal(
    abilityDamageReduction(regirock, attacker, {
      sideCards: [regirock, rockEnergy],
    }).afterWR,
    30
  );
  assert.equal(
    abilityDamageReduction(regirock, attacker, { sideCards: [regirock] }).afterWR,
    0
  );

  const garbodor = mon('Garbodor', {
    abilities: [
      ability(
        'Stench',
        "Attacks used by your opponent's Active Pokémon that has a Pokémon Tool attached do 20 less damage (before applying Weakness and Resistance)."
      ),
    ],
  });
  const toolOnAttacker = attached(tool('Choice Belt'), attacker);
  assert.equal(
    abilityDamageReduction(garbodor, attacker, {
      sideCards: [garbodor],
      opponentSideCards: [attacker, toolOnAttacker],
    }).beforeWR,
    20
  );
  assert.equal(
    abilityDamageReduction(garbodor, attacker, {
      sideCards: [garbodor],
      opponentSideCards: [attacker],
    }).beforeWR,
    0
  );
});

// ── damage prevention ────────────────────────────────────────────────────

test('abilityDamagePrevention: team prevention honours zone and energy cap', () => {
  const bastiodon = mon('Bastiodon', {
    abilities: [
      ability(
        'Guard Press',
        "As long as this Pokémon is on your Bench, prevent all damage done to each of your Pokémon by attacks from your opponent's Pokémon that have 2 or less Energy attached."
      ),
    ],
  });
  const defender = mon('Defender');
  const attacker = mon('Attacker');
  const twoEnergy = [
    attached(energy('Fire Energy', 'Fire'), attacker),
    attached(energy('Water Energy', 'Water'), attacker),
  ];
  const threeEnergy = [...twoEnergy, attached(energy('Grass Energy', 'Grass'), attacker)];
  const base = {
    sideCards: [defender, bastiodon],
    sideBench: [bastiodon],
    opponentSideCards: [attacker, ...twoEnergy],
  };
  assert.deepEqual(abilityDamagePrevention(defender, attacker, base), {
    preventAll: true,
    reduceHp: 0,
  });
  assert.deepEqual(
    abilityDamagePrevention(defender, attacker, {
      ...base,
      opponentSideCards: [attacker, ...threeEnergy],
    }),
    { preventAll: false, reduceHp: 0 }
  );
  assert.deepEqual(
    abilityDamagePrevention(defender, attacker, {
      ...base,
      sideActive: [bastiodon],
      sideBench: [],
    }),
    { preventAll: false, reduceHp: 0 }
  );
});

test('abilityDamagePrevention: bench-target and Rule Box filters', () => {
  const attacker = mon('Attacker');
  const rabsca = mon('Rabsca', {
    abilities: [
      ability(
        'Revive',
        "Prevent all damage from and effects of attacks from your opponent's Pokémon done to your Benched Pokémon."
      ),
    ],
  });
  const benchMon = mon('Bench Mon');
  assert.equal(
    abilityDamagePrevention(benchMon, attacker, {
      sideCards: [benchMon, rabsca],
      zone: 'bench',
      isActive: false,
    }).preventAll,
    true
  );
  assert.equal(
    abilityDamagePrevention(benchMon, attacker, {
      sideCards: [benchMon, rabsca],
      zone: 'active',
      isActive: true,
    }).preventAll,
    false
  );

  const shaymin = mon('Shaymin', {
    abilities: [
      ability(
        'Flower Veil',
        "Prevent all damage done to your Benched Pokémon that don't have a Rule Box by attacks from your opponent's Pokémon."
      ),
    ],
  });
  const plain = mon('Plain');
  const ruleBox = mon('Charizard ex', { subtypes: ['ex'] });
  const ctx = { sideCards: [shaymin], zone: 'bench', isActive: false };
  assert.equal(
    abilityDamagePrevention(plain, attacker, { ...ctx, sideCards: [plain, shaymin] })
      .preventAll,
    true
  );
  assert.equal(
    abilityDamagePrevention(ruleBox, attacker, {
      ...ctx,
      sideCards: [ruleBox, shaymin],
    }).preventAll,
    false
  );
});

test('abilityDamagePrevention: self prevention reads plural abilities[]', () => {
  const defender = mon('Sigilyph', {
    abilities: [ability('Safeguard', 'Prevent all damage done to this Pokémon by attacks.')],
  });
  assert.deepEqual(
    abilityDamagePrevention(defender, mon('Attacker'), { sideCards: [defender] }),
    { preventAll: true, reduceHp: 0 }
  );
});

// ── weakness override ────────────────────────────────────────────────────

test('abilityWeaknessOverride: none, multiplier and type replacement', () => {
  const defender = mon('Defender', { types: ['Dragon'] });
  const florges = mon('Florges', {
    abilities: [ability('Blooming Garden', 'Your Pokémon in play have no Weakness.')],
  });
  assert.deepEqual(abilityWeaknessOverride(defender, { sideCards: [defender, florges] }), {
    none: true,
  });

  const illumise = mon('Illumise', {
    abilities: [
      ability(
        'Tinted Lens',
        'If you have Volbeat in play, apply Weakness for both Active Pokémon as x3.'
      ),
    ],
  });
  const volbeat = mon('Volbeat');
  assert.equal(
    abilityWeaknessOverride(defender, {
      sideCards: [defender],
      opponentSideCards: [illumise],
    }),
    null
  );
  assert.deepEqual(
    abilityWeaknessOverride(defender, {
      sideCards: [defender],
      opponentSideCards: [illumise, volbeat],
    }),
    { multiplier: 3 }
  );

  const kabutops = mon('Kabutops', {
    abilities: [
      ability('Primordial Sea', "Apply Weakness for your opponent's Active Pokémon as ×4 instead."),
    ],
  });
  assert.deepEqual(
    abilityWeaknessOverride(defender, {
      sideCards: [defender],
      opponentSideCards: [kabutops],
    }),
    { multiplier: 4 }
  );

  const clefairy = mon("Lillie's Clefairy ex", {
    abilities: [
      ability(
        'Fairy Zone',
        "The Weakness of each of your opponent's {N} Pokémon in play is now {P}. (Apply Weakness as ×2.)"
      ),
    ],
  });
  assert.deepEqual(
    abilityWeaknessOverride(defender, {
      sideCards: [defender],
      opponentSideCards: [clefairy],
    }),
    { type: 'Psychic' }
  );
  assert.equal(
    abilityWeaknessOverride(mon('Fire Mon', { types: ['Fire'] }), {
      sideCards: [mon('Fire Mon', { types: ['Fire'] })],
      opponentSideCards: [clefairy],
    }),
    null
  );
});

// ── HP bonus ─────────────────────────────────────────────────────────────

test('abilityHpBonus: energy-count conditions', () => {
  const exeggutor = mon('Alolan Exeggutor', {
    hp: 160,
    abilities: [
      ability(
        'Tropical Shake',
        'If this Pokémon has 6 or more {G} Energy attached, it gets +250 HP.'
      ),
    ],
  });
  const six = Array.from({ length: 6 }, () =>
    attached(energy('Grass Energy', 'Grass'), exeggutor)
  );
  assert.equal(
    abilityHpBonus(exeggutor, { sideCards: [exeggutor, ...six] }),
    250
  );
  assert.equal(
    abilityHpBonus(exeggutor, { sideCards: [exeggutor, ...six.slice(0, 5)] }),
    0
  );

  const okidogi = mon('Okidogi', {
    abilities: [
      ability(
        'Adrenaline Rush',
        'If this Pokémon has any {D} Energy attached, it gets +100 HP, and the attacks it uses do 100 more damage to your opponent\u2019s Active Pokémon (before applying Weakness and Resistance).'
      ),
    ],
  });
  const darkEnergy = attached(energy('Darkness Energy', 'Dark'), okidogi);
  assert.equal(
    abilityHpBonus(okidogi, { sideCards: [okidogi, darkEnergy] }),
    100
  );
  assert.equal(abilityHpBonus(okidogi, { sideCards: [okidogi] }), 0);
  assert.equal(
    abilityDamageBonus(okidogi, mon('Defender'), {
      sideCards: [okidogi, darkEnergy],
      isActive: true,
    }),
    100
  );
});

// ── prize modify ─────────────────────────────────────────────────────────

test('abilityPrizeModify: KO-condition prize reduction, trigger wordings excluded', () => {
  const gengar = mon('Mega Gengar ex', {
    types: ['Darkness'],
    abilities: [
      ability(
        'Shadowy Concealment',
        "If 1 of your {D} Pokémon is Knocked Out by damage from an attack from your opponent's Pokémon ex, that player takes 1 fewer Prize card. The effect of Shadowy Concealment doesn't stack."
      ),
    ],
  });
  const darkVictim = mon('Dark Victim', { types: ['Darkness'] });
  const psychicVictim = mon('Psychic Victim', { types: ['Psychic'] });
  const exAttacker = mon('Attacker ex', { subtypes: ['ex'] });
  assert.equal(
    abilityPrizeModify(darkVictim, {
      sideCards: [darkVictim, gengar],
      attackerIsEx: true,
    }),
    -1
  );
  assert.equal(
    abilityPrizeModify(psychicVictim, {
      sideCards: [psychicVictim, gengar],
      attackerIsEx: true,
    }),
    0
  );
  assert.equal(
    abilityPrizeModify(darkVictim, {
      sideCards: [darkVictim, gengar],
      attackerIsEx: false,
    }),
    0
  );
  const second = mon('Mega Gengar ex', { types: ['Darkness'], abilities: gengar.abilities });
  assert.equal(
    abilityPrizeModify(darkVictim, {
      sideCards: [darkVictim, gengar, second],
      attackerIsEx: true,
    }),
    -1
  );

  const togekiss = mon('Togekiss', {
    abilities: [
      ability(
        'Wonder Kiss',
        "When your opponent's Active Pokémon is Knocked Out, flip a coin. If heads, take 1 more Prize card."
      ),
    ],
  });
  assert.equal(
    abilityPrizeModify(togekiss, { sideCards: [togekiss], attackerIsEx: false }),
    0
  );

  const kingambit = mon('Kingambit', {
    abilities: [
      ability(
        'Supreme Overlord',
        "Attacks used by this Pokémon do 30 more damage to your opponent's Active Pokémon for each Prize card your opponent has taken (before applying Weakness and Resistance)."
      ),
    ],
  });
  assert.equal(
    abilityPrizeModify(kingambit, { sideCards: [kingambit] }),
    0
  );
});

// ── retreat cost ─────────────────────────────────────────────────────────

test('abilityRetreatCost: opponent-target increases and own-bench reductions', () => {
  const target = mon('Target', { stage: 'Stage 1', retreatCost: 2 });
  const chandelure = mon('Mega Chandelure ex', {
    abilities: [
      ability('Binding Flame', "Your opponent's Active Pokémon's Retreat Cost is {C} more."),
    ],
  });
  assert.equal(
    abilityRetreatCost(target, {
      sideCards: [target],
      opponentSideCards: [chandelure],
      zone: 'active',
      isActive: true,
    }),
    1
  );
  assert.equal(
    abilityRetreatCost(target, {
      sideCards: [target],
      opponentSideCards: [chandelure],
      zone: 'bench',
      isActive: false,
    }),
    0
  );

  const ariados = mon('Ariados', {
    abilities: [
      ability(
        'Big Net',
        "Your opponent's Active Evolution Pokémon's Retreat Cost is {C} more."
      ),
    ],
  });
  assert.equal(
    abilityRetreatCost(mon('Basic Target'), {
      sideCards: [],
      opponentSideCards: [ariados],
      isActive: true,
    }),
    0
  );

  const helper = mon('Helper', {
    abilities: [
      ability('Helping Hand', "Your Active Pokémon's Retreat Cost is 1 less.")
    ],
  });
  assert.equal(
    abilityRetreatCost(target, { sideCards: [helper], isActive: true }),
    -1
  );
  assert.equal(
    abilityRetreatCost(target, { sideCards: [helper], isActive: false }),
    0
  );
});

// ── attack cost ──────────────────────────────────────────────────────────

test('abilityAttackCostDiscount: ignore-all and ignore-Colorless wordings', () => {
  const nidoking = mon('Nidoking', {
    abilities: [
      ability(
        'Enthusiastic King',
        'If you have Nidoqueen in play, ignore all Energy in the costs of attacks used by this Pokémon.'
      ),
    ],
  });
  const nidoqueen = mon('Nidoqueen');
  assert.equal(
    abilityAttackCostDiscount(nidoking, { sideCards: [nidoking] }).ignoreAll,
    false
  );
  assert.equal(
    abilityAttackCostDiscount(nidoking, { sideCards: [nidoking, nidoqueen] })
      .ignoreAll,
    true
  );

  const decidueye = mon('Decidueye ex', {
    abilities: [
      ability(
        "Sniper's Eye",
        'If your opponent has exactly 4 cards in their hand, ignore all {C} Energy in the costs of attacks used by this Pokémon.'
      ),
    ],
  });
  const ctx = { sideCards: [decidueye], opponentHandCount: 4 };
  assert.equal(abilityAttackCostDiscount(decidueye, ctx).ignoreColorless, true);
  assert.equal(
    abilityAttackCostDiscount(decidueye, { ...ctx, opponentHandCount: 3 })
      .ignoreColorless,
    false
  );
});

// ── ignore defender effects / extra types / energy multiplier ────────────

test('abilityIgnoresDefenderEffects and abilityExtraTypes', () => {
  const walkingWake = mon('Walking Wake ex', {
    abilities: [
      ability(
        'Hydro Jet',
        "Damage from attacks used by this Pokémon isn't affected by any effects on your opponent's Active Pokémon."
      ),
    ],
  });
  assert.equal(abilityIgnoresDefenderEffects(walkingWake), true);
  assert.equal(abilityIgnoresDefenderEffects(mon('Plain')), false);

  const carbink = mon('Carbink', {
    types: ['Fighting'],
    abilities: [
      ability('Primal Shield', 'As long as this Pokémon is in play, it is {F} and {P} type.')
    ],
  });
  assert.deepEqual(abilityExtraTypes(carbink), ['Psychic']);

  const ironTreads = mon('Iron Treads', {
    types: ['Fighting'],
    abilities: [
      ability(
        'Future Engine',
        'As long as this Pokémon has a Future Booster Energy Capsule attached, it is {F} and {M} type.'
      ),
    ],
  });
  const capsule = attached(tool('Future Booster Energy Capsule'), ironTreads);
  assert.deepEqual(abilityExtraTypes(ironTreads), []);
  assert.deepEqual(
    abilityExtraTypes(ironTreads, { sideCards: [ironTreads, capsule] }),
    ['Metal']
  );
});

test('abilityEnergyMultiplier and applyEnergyMultiplier', () => {
  const meganium = mon('Meganium', {
    abilities: [
      ability(
        'Wild Growth',
        "Each Basic {G} Energy attached to all of your Pokémon provides {G}{G} Energy. The effect of Wild Growth doesn't stack."
      ),
    ],
  });
  assert.deepEqual(abilityEnergyMultiplier([meganium]), {
    multiplier: 2,
    energyType: 'Grass',
  });
  assert.deepEqual(
    applyEnergyMultiplier(['Grass', 'Water'], [meganium]),
    ['Grass', 'Grass', 'Water']
  );
  assert.deepEqual(applyEnergyMultiplier(['Water'], []), ['Water']);
});

// ── edge cases ───────────────────────────────────────────────────────────

test('readers are neutral on absent/malformed cards', () => {
  assert.equal(abilityDamageBonus(null, null, {}), 0);
  assert.deepEqual(abilityDamageReduction(null, null, {}), {
    beforeWR: 0,
    afterWR: 0,
  });
  assert.deepEqual(abilityDamagePrevention(null, null, {}), {
    preventAll: false,
    reduceHp: 0,
  });
  assert.equal(abilityWeaknessOverride(null, {}), null);
  assert.equal(abilityHpBonus(null, {}), 0);
  assert.equal(abilityPrizeModify(null, {}), 0);
  assert.equal(abilityRetreatCost(null, {}), 0);
  assert.deepEqual(abilityAttackCostDiscount(null, {}), {
    ignoreAll: false,
    ignoreColorless: false,
  });
  assert.equal(abilityIgnoresDefenderEffects({}), false);
  assert.deepEqual(abilityExtraTypes({}), []);
  assert.equal(abilityEnergyMultiplier([]), null);
  assert.equal(abilityDamageBonus({ name: 'Empty' }, mon('D'), { sideCards: [] }), 0);
});
