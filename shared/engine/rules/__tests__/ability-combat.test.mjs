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
  isAbilitySuppressed,
  abilityActivationBlockReason,
  abilityPlayLocks,
  abilityStatusImmune,
  abilityEvolvePermission,
  abilityEvolveLock,
  abilityRetreatLock,
  abilityCounterMoveLock,
  abilitySummonRestricted,
  abilityFirstTurnAttack,
  abilityExtraAttack,
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
  // The holder being the attacker must not double-count itself, and a side
  // with no in-play cards contributes nothing.
  assert.equal(
    abilityDamageBonus(garganacl, defender, { sideCards: [garganacl] }),
    30
  );
  assert.equal(abilityDamageBonus(fighter, defender, { sideCards: [] }), 0);
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

// ── computeAttackDamage option matrix ────────────────────────────────────

const { computeAttackDamage } = await import('../attack-engine.mjs');
const { effectiveHp } = await import('../stadium-effects.mjs');

test('computeAttackDamage: ability options apply at their printed step', () => {
  const attacker = { types: ['Fire'] };
  const defender = { weakness: { type: 'Fire', value: 2 } };
  const hit = (options) =>
    computeAttackDamage(attacker, defender, { damage: '50' }, options).total;

  // Weakness ×2 baseline is 100.
  assert.equal(hit({}), 100);
  assert.equal(hit({ abilityBonusBeforeWR: 30 }), 160);
  assert.equal(hit({ abilityReductionBeforeWR: 30 }), 40);
  assert.equal(hit({ abilityReductionAfterWR: 30 }), 70);
  assert.equal(
    hit({ abilityPrevention: { preventAll: false, reduceHp: 30 } }),
    70
  );
  assert.equal(hit({ abilityPrevention: { preventAll: true, reduceHp: 0 } }), 0);
  assert.equal(hit({ weaknessOverride: { multiplier: 4 } }), 200);
  assert.equal(hit({ weaknessOverride: { none: true } }), 50);
});

test('computeAttackDamage: external ability reads do not double-count the self ability', () => {
  const defender = {
    name: 'Samurott',
    type: 'Pokémon',
    stage: 'Basic',
    hp: 140,
    abilities: [
      {
        name: 'Shell Armor',
        text: 'Any damage done to this Pokémon by attacks is reduced by 20 (after applying Weakness and Resistance).',
      },
    ],
  };
  const attacker = { name: 'Attacker', types: ['Fire'] };
  // Legacy callers (no ability options) keep the internal read.
  assert.equal(
    computeAttackDamage(attacker, defender, { damage: '50' }, {}).total,
    30
  );
  // Callers that computed the reads themselves must not have them applied twice.
  const reads = abilityDamagePrevention(defender, attacker, {
    sideCards: [defender],
  });
  assert.deepEqual(reads, { preventAll: false, reduceHp: 20 });
  assert.equal(
    computeAttackDamage(attacker, defender, { damage: '50' }, {
      abilityPrevention: reads,
    }).total,
    30
  );
});

test('effectiveHp: includes own and team ability HP bonuses', () => {
  const exeggutor = mon('Alolan Exeggutor', {
    hp: 160,
    abilities: [
      ability(
        'Tropical Shake',
        'If this Pokémon has 6 or more {G} Energy attached, it gets +250 HP.'
      ),
    ],
  });
  const energies = Array.from({ length: 6 }, () =>
    attached(energy('Grass Energy', 'Grass'), exeggutor)
  );
  const zone = [exeggutor, ...energies];
  assert.equal(effectiveHp(160, 'self', exeggutor, zone, null, zone), 410);
  assert.equal(
    effectiveHp(160, 'self', exeggutor, [exeggutor, ...energies.slice(0, 5)], null, [
      exeggutor,
      ...energies.slice(0, 5),
    ]),
    160
  );

  const okidogi = mon('Okidogi', {
    hp: 130,
    abilities: [
      ability(
        'Adrenaline Rush',
        'If this Pokémon has any {D} Energy attached, it gets +100 HP, and the attacks it uses do 100 more damage to your opponent\u2019s Active Pokémon (before applying Weakness and Resistance).'
      ),
    ],
  });
  const dark = attached(energy('Darkness Energy', 'Dark'), okidogi);
  assert.equal(
    effectiveHp(130, 'self', okidogi, [okidogi, dark], null, [okidogi, dark]),
    230
  );
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
  assert.equal(isAbilitySuppressed(null, {}), false);
  assert.equal(isAbilitySuppressed(mon('Plain'), {}), false);
  assert.equal(abilityActivationBlockReason(null, {}), 'Unknown card.');
  assert.equal(abilityPlayLocks(null, {}), null);
  assert.equal(abilityStatusImmune(null, 'Asleep'), false);
  assert.equal(abilityEvolvePermission(null, {}), false);
  assert.equal(abilityEvolveLock(null, {}), false);
  assert.equal(abilityRetreatLock(null, {}), false);
  assert.equal(abilityCounterMoveLock({}), false);
  assert.equal(abilitySummonRestricted(null), false);
  assert.equal(abilityFirstTurnAttack(null, {}), false);
  assert.equal(abilityExtraAttack(null), null);
});

// ── slice 3: suppression ─────────────────────────────────────────────────

test('isAbilitySuppressed: in-play "no Abilities" sources scope by side and target', () => {
  const wobbuffet = mon('Wobbuffet', {
    types: ['Psychic'],
    abilities: [
      ability(
        'Bide Barricade',
        "As long as this Pokémon is your Active Pokémon, each Pokémon in play, in each player's hand, and in each player's discard pile has no Abilities (except for {P} Pokémon)."
      ),
    ],
  });
  const psychic = mon('Psychic Mon', { types: ['Psychic'] });
  const fire = mon('Fire Mon', { types: ['Fire'] });
  const ctx = {
    sideCards: [psychic, fire],
    sideActive: [psychic],
    sideBench: [fire],
    opponentSideCards: [wobbuffet],
    opponentActive: [wobbuffet],
  };
  assert.equal(isAbilitySuppressed(fire, ctx), true);
  assert.equal(isAbilitySuppressed(psychic, ctx), false, '{P} exception');
  assert.equal(
    isAbilitySuppressed(wobbuffet, { sideCards: [wobbuffet], sideActive: [wobbuffet] }),
    false,
    'the holder is exempt from its own suppression'
  );

  const muk = mon('Alolan Muk', {
    abilities: [
      ability(
        'Power of Alchemy',
        "Each Basic Pokémon in play, in each player's hand, and in each player's discard pile has no Abilities."
      ),
    ],
  });
  const basic = mon('Basic Mon');
  const stage1 = mon('Stage 1 Mon', { stage: 'Stage 1' });
  assert.equal(
    isAbilitySuppressed(basic, { sideCards: [basic], opponentSideCards: [muk] }),
    true
  );
  assert.equal(
    isAbilitySuppressed(stage1, { sideCards: [stage1], opponentSideCards: [muk] }),
    false
  );

  const weezing = mon('Galarian Weezing', {
    abilities: [
      ability(
        'Neutralizing Gas',
        "As long as this Pokémon is in the Active Spot, your opponent's Pokémon in play have no Abilities, except for Neutralizing Gas."
      ),
    ],
  });
  assert.equal(
    isAbilitySuppressed(fire, {
      sideCards: [fire],
      opponentSideCards: [weezing],
      opponentActive: [weezing],
    }),
    true
  );
  assert.equal(
    isAbilitySuppressed(fire, {
      sideCards: [fire],
      opponentSideCards: [weezing],
      opponentBench: [weezing],
    }),
    false,
    'off the Active Spot the source stops'
  );
});

test('isAbilitySuppressed: Rule Box, Future and benched-Stage-2 filters', () => {
  const ironThorns = mon('Iron Thorns ex', {
    subtypes: ['ex'],
    abilities: [
      ability(
        'Initialization',
        "As long as this Pokémon is in the Active Spot, Pokémon with a Rule Box in play (both yours and your opponent's) have no Abilities, except for Future Pokémon. (Pokémon ex, Pokémon V, etc. have Rule Boxes.)"
      ),
    ],
  });
  const exMon = mon('Some ex', { subtypes: ['ex'] });
  const futureEx = mon('Iron Hands ex', { subtypes: ['ex', 'Future'] });
  const plain = mon('Plain Mon');
  const base = {
    opponentSideCards: [ironThorns],
    opponentActive: [ironThorns],
  };
  assert.equal(isAbilitySuppressed(exMon, { ...base, sideCards: [exMon] }), true);
  assert.equal(
    isAbilitySuppressed(futureEx, { ...base, sideCards: [futureEx] }),
    false,
    'Future Pokémon are exempt'
  );
  assert.equal(isAbilitySuppressed(plain, { ...base, sideCards: [plain] }), false);

  const empoleon = mon('Empoleon V', {
    abilities: [
      ability(
        'Emperor Eye',
        "As long as this Pokémon is in the Active Spot, your opponent's Basic Pokémon in play have no Abilities, except for Pokémon with a Rule Box (Pokémon V, Pokémon-GX, etc. have Rule Boxes)."
      ),
    ],
  });
  const basicEx = mon('Basic ex', { subtypes: ['ex'] });
  const basicMon = mon('Basic Mon');
  const empoleonCtx = {
    opponentSideCards: [empoleon],
    opponentActive: [empoleon],
  };
  assert.equal(
    isAbilitySuppressed(basicMon, { ...empoleonCtx, sideCards: [basicMon] }),
    true
  );
  assert.equal(
    isAbilitySuppressed(basicEx, { ...empoleonCtx, sideCards: [basicEx] }),
    false,
    'the Rule Box exception protects it'
  );

  const gastrodon = mon('Gastrodon', {
    abilities: [
      ability(
        'Sticky Membrane',
        "As long as this Pokémon is on your Bench, Benched Stage 2 Pokémon (both yours and your opponent's) have no Abilities."
      ),
    ],
  });
  const stage2 = mon('Stage 2 Mon', { stage: 'Stage 2' });
  assert.equal(
    isAbilitySuppressed(stage2, {
      sideCards: [stage2],
      sideBench: [stage2],
      zone: 'bench',
      isActive: false,
      opponentSideCards: [gastrodon],
      opponentBench: [gastrodon],
    }),
    true
  );
  assert.equal(
    isAbilitySuppressed(stage2, {
      sideCards: [stage2],
      sideActive: [stage2],
      zone: 'active',
      isActive: true,
      opponentSideCards: [gastrodon],
      opponentBench: [gastrodon],
    }),
    false
  );
});

test('isAbilitySuppressed: Psyduck self-KO filter and Ancient Trait exemption', () => {
  const psyduck = mon('Psyduck', {
    abilities: [
      ability(
        'Damp',
        "Pokémon in play (both yours and your opponent's) lose any Ability that requires the Pokémon using it to Knock Out itself."
      ),
    ],
  });
  const selfKo = mon('Self KO', {
    abilities: [
      ability(
        'Explode',
        'Once during your turn, you may Knock Out this Pokémon. If you do, put 3 damage counters on each of your opponent\u2019s Pokémon.'
      ),
    ],
  });
  const other = mon('Other', {
    abilities: [ability('Draw', 'Once during your turn, you may draw a card.')],
  });
  assert.equal(
    isAbilitySuppressed(selfKo, { sideCards: [selfKo], opponentSideCards: [psyduck] }),
    true
  );
  assert.equal(
    isAbilitySuppressed(other, { sideCards: [other], opponentSideCards: [psyduck] }),
    false
  );

  // D72/App. 23: an Ancient Trait is not an Ability, so suppression spares it.
  const traitCard = mon('Celebi', {
    ability: {
      name: '\u03b8 Stop',
      text: "Prevent all effects of your opponent's Pokémon's Abilities done to this Pokémon.",
    },
  });
  assert.equal(
    isAbilitySuppressed(traitCard, { sideCards: [traitCard], opponentSideCards: [psyduck] }),
    false
  );
});

test('isAbilitySuppressed: a suppressed holder stops contributing combat reads', () => {
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
  const weezing = mon('Galarian Weezing', {
    abilities: [
      ability(
        'Neutralizing Gas',
        "As long as this Pokémon is in the Active Spot, your opponent's Pokémon in play have no Abilities, except for Neutralizing Gas."
      ),
    ],
  });
  const ctx = {
    sideCards: [defender, bronzong],
    sideActive: [defender],
    sideBench: [bronzong],
    opponentSideCards: [attacker, weezing],
    opponentActive: [attacker],
    opponentBench: [weezing],
  };
  // Weezing is Benched here, so Bronzong still applies.
  assert.equal(abilityDamageReduction(defender, attacker, ctx).afterWR, 10);
  // Weezing moves to the Active Spot: Bronzong is suppressed.
  assert.equal(
    abilityDamageReduction(defender, attacker, {
      ...ctx,
      opponentActive: [weezing],
      opponentBench: [attacker],
      attackerIsActive: false,
    }).afterWR,
    0
  );
});

// ── slice 3: activation reasons ──────────────────────────────────────────

test('abilityActivationBlockReason: shared gate reasons', () => {
  const kirlia = mon('Kirlia', {
    abilities: [
      ability('Refinement', 'Once during your turn, you may draw 2 cards.'),
    ],
  });
  assert.equal(abilityActivationBlockReason(kirlia, {}), null);
  assert.equal(
    abilityActivationBlockReason(kirlia, { used: true }),
    'Ability already used this turn.'
  );
  assert.equal(
    abilityActivationBlockReason(kirlia, { used: true, rulesEnabled: false }),
    null,
    'presence-only callers skip the spent flag'
  );

  const passive = mon('Carbink', {
    abilities: [ability('Primal Shield', 'As long as this Pokémon is in play, it is {F} and {P} type.')],
  });
  assert.equal(
    abilityActivationBlockReason(passive, {}),
    "This Ability can't be activated; it works on its own."
  );

  const spot = mon('Spot', {
    abilities: [
      ability(
        'Aura',
        'If this Pokémon is in the Active Spot, once during your turn, you may draw a card.'
      ),
    ],
  });
  assert.equal(
    abilityActivationBlockReason(spot, { zone: 'bench' }),
    'This ability can only be used from the Active Spot.'
  );
  assert.equal(abilityActivationBlockReason(spot, { zone: 'active' }), null);

  const fez = mon('Fezandipiti ex', {
    abilities: [
      ability(
        'Flip the Script',
        "Once during your turn, if any of your Pokémon were Knocked Out during your opponent's last turn, you may draw 3 cards."
      ),
    ],
  });
  assert.match(
    abilityActivationBlockReason(fez, { koedLastOppTurn: false }),
    /Knocked Out during your opponent's last turn/
  );

  const primarina = mon('Primarina', {
    abilities: [
      ability(
        'Enriching Melody',
        'When you play this Pokémon from your hand to evolve 1 of your Pokémon, you may search your deck for up to 2 Supporter cards.'
      ),
    ],
  });
  assert.equal(
    abilityActivationBlockReason(primarina, {
      turnNumber: 5,
      enteredPlayTurn: 4,
    }),
    'This ability can only be used the turn it evolved.'
  );
  assert.equal(
    abilityActivationBlockReason(primarina, {
      turnNumber: 4,
      enteredPlayTurn: 4,
    }),
    null
  );
  assert.equal(
    abilityActivationBlockReason(primarina, { turnNumber: 5 }),
    null,
    'no stamp supplied means the caller cannot judge the window'
  );

  const meowth = mon('Meowth ex', {
    abilities: [
      ability(
        'Last Ditch Catch',
        'When you play this Pokémon from your hand onto your Bench during your turn, you may search your deck for a card.'
      ),
    ],
  });
  assert.match(
    abilityActivationBlockReason(meowth, {
      zone: 'bench',
      turnNumber: 5,
      playedToBenchTurn: 4,
    }),
    /played from hand to the Bench/
  );
  assert.equal(
    abilityActivationBlockReason(meowth, {
      zone: 'bench',
      turnNumber: 4,
      playedToBenchTurn: 4,
    }),
    null
  );
});

// ── slice 4b: on-promotion window ────────────────────────────────────────

test('abilityActivationBlockReason: on-promotion window reads movedToActiveTurn', () => {
  const cobalion = mon('Cobalion ex', {
    abilities: [
      ability(
        'Metal Road',
        'Once during your turn, when this Pokémon moves from your Bench to the Active Spot, you may attach a Basic {M} Energy card from your hand to this Pokémon.'
      ),
    ],
  });
  assert.equal(
    abilityActivationBlockReason(cobalion, { turnNumber: 5 }),
    null,
    'no stamp supplied means the caller cannot judge the window (fail open)'
  );
  assert.equal(
    abilityActivationBlockReason(cobalion, {
      turnNumber: 5,
      movedToActiveTurn: 5,
    }),
    null,
    'the move happened this turn'
  );
  assert.match(
    abilityActivationBlockReason(cobalion, {
      turnNumber: 5,
      movedToActiveTurn: 4,
    }),
    /moved to the Active Spot/
  );
  assert.match(
    abilityActivationBlockReason(
      { ...cobalion, movedToActiveTurn: 4 },
      { turnNumber: 5 }
    ),
    /moved to the Active Spot/,
    'the stamp can be read off the card itself'
  );
});

// ── slice 3: play / evolve / retreat / counter locks ─────────────────────

test('abilityPlayLocks: category locks, each-player wording and conditions', () => {
  const item = { name: 'Ultra Ball', type: 'Trainer', supertype: 'Trainer', trainerType: 'Item', subtypes: ['Item'] };
  const supporter = { name: 'Professor', type: 'Trainer', supertype: 'Trainer', trainerType: 'Supporter', subtypes: ['Supporter'] };
  const stadium = { name: 'Artazon', type: 'Trainer', supertype: 'Trainer', trainerType: 'Stadium', subtypes: ['Stadium'] };
  const toolCard = { name: 'Choice Belt', type: 'Trainer', supertype: 'Trainer', trainerType: 'Tool', subtypes: ['Tool'] };
  const aceSpec = { name: 'Prime Catcher', type: 'Trainer', supertype: 'Trainer', trainerType: 'Item', subtypes: ['Item', 'ACE SPEC'] };

  const gothitelle = mon('Gothitelle', {
    abilities: [
      ability(
        'Magic Room',
        "As long as this Pokémon is your Active Pokémon, your opponent can't play any Item cards from his or her hand."
      ),
    ],
  });
  const gCtx = {
    sideCards: [],
    opponentSideCards: [gothitelle],
    opponentActive: [gothitelle],
  };
  assert.deepEqual(abilityPlayLocks(item, gCtx)?.cards, ['Item']);
  assert.equal(abilityPlayLocks(supporter, gCtx), null);
  assert.equal(
    abilityPlayLocks(item, { ...gCtx, opponentActive: [], opponentBench: [gothitelle] }),
    null
  );

  const vileplume = mon('Vileplume', {
    abilities: [ability('Wafting Pollen', "Each player can't play any Item cards from his or her hand.")],
  });
  assert.deepEqual(
    abilityPlayLocks(item, { sideCards: [vileplume], sideActive: [vileplume] })?.cards,
    ['Item'],
    'an each-player lock applies to its own side too'
  );

  const copperajah = mon('Copperajah', {
    abilities: [
      ability(
        'Stone Tablet',
        "As long as this Pokémon is in the Active Spot, your opponent can't play any Stadium cards from their hand."
      ),
    ],
  });
  assert.deepEqual(
    abilityPlayLocks(stadium, {
      opponentSideCards: [copperajah],
      opponentActive: [copperajah],
    })?.cards,
    ['Stadium']
  );

  const jellicent = mon('Jellicent ex', {
    abilities: [
      ability(
        'Draining Lock',
        "As long as this Pokémon is in the Active Spot, your opponent can't play any Item cards or Pokémon Tool cards from their hand."
      ),
    ],
  });
  assert.deepEqual(
    abilityPlayLocks(toolCard, {
      opponentSideCards: [jellicent],
      opponentActive: [jellicent],
    })?.cards,
    ['Pokémon Tool']
  );

  const spiritomb = mon('Spiritomb', {
    abilities: [ability('Cursed Lock', "Each player can't play any ACE SPEC cards from his or her hand.")],
  });
  assert.deepEqual(
    abilityPlayLocks(aceSpec, { sideCards: [spiritomb], sideActive: [spiritomb] })?.cards,
    ['ACE SPEC']
  );

  const omastar = mon('Omastar', {
    abilities: [
      ability(
        'Fossil Bind',
        "As long as you have fewer Pokémon in play than your opponent, they can't play any Item cards from their hand."
      ),
    ],
  });
  assert.deepEqual(
    abilityPlayLocks(item, {
      sideCards: [mon('A'), mon('B')],
      opponentSideCards: [omastar],
    })?.cards,
    ['Item']
  );
  assert.equal(
    abilityPlayLocks(item, { sideCards: [mon('A')], opponentSideCards: [omastar] }),
    null,
    'equal counts stop the lock'
  );

  const genesect = mon('Genesect', {
    abilities: [
      ability(
        'ACE Nullifier',
        "If this Pokémon has a Pokémon Tool attached, your opponent can't play any ACE SPEC cards from their hand."
      ),
    ],
  });
  assert.equal(
    abilityPlayLocks(aceSpec, {
      opponentSideCards: [genesect],
      opponentActive: [genesect],
    }),
    null
  );
  assert.deepEqual(
    abilityPlayLocks(aceSpec, {
      opponentSideCards: [genesect, attached(tool('Choice Belt'), genesect)],
      opponentActive: [genesect],
    })?.cards,
    ['ACE SPEC']
  );

  const arbok = mon("Team Rocket's Arbok", {
    abilities: [
      ability(
        'Venomous Lock',
        "As long as this Pokémon is in the Active Spot, your opponent can't play any Pokémon that has an Ability from their hand, except for Team Rocket's Pokémon."
      ),
    ],
  });
  const aCtx = {
    opponentSideCards: [arbok],
    opponentActive: [arbok],
  };
  assert.deepEqual(
    abilityPlayLocks(
      mon('Kirlia', { abilities: [ability('Refinement', 'Once during your turn, you may draw 2 cards.')] }),
      aCtx
    )?.cards,
    ['Pokémon']
  );
  assert.equal(abilityPlayLocks(mon('Plain'), aCtx), null);
  assert.equal(
    abilityPlayLocks(
      mon("Team Rocket's Mewtwo", {
        abilities: [ability('X', 'Once during your turn, you may draw a card.')],
      }),
      aCtx
    ),
    null
  );

  // A draw-effect text must never read as a play lock (Chandelure TWM).
  const chandelure = mon('Chandelure', {
    abilities: [ability('Free Draw', 'Each player draws a card.')],
  });
  assert.equal(abilityPlayLocks(item, { sideCards: [chandelure], sideActive: [chandelure] }), null);
});

test('abilityEvolveLock and abilityEvolvePermission', () => {
  const primal = mon('Primal Kyogre', {
    abilities: [
      ability(
        'Primal Law',
        "As long as this Pokémon is in the Active Spot, your opponent can't play any Pokémon from their hand to evolve their Pokémon."
      ),
    ],
  });
  assert.equal(
    abilityEvolveLock(mon('Target'), {
      opponentSideCards: [primal],
      opponentActive: [primal],
    }),
    true
  );
  assert.equal(
    abilityEvolveLock(mon('Target'), {
      opponentSideCards: [primal],
      opponentBench: [primal],
    }),
    false
  );

  const scatterbug = mon('Scatterbug', {
    abilities: [
      ability('Adaptive Evolution', 'This Pokémon can evolve during your first turn or the turn you play it.'),
    ],
  });
  assert.equal(abilityEvolvePermission(scatterbug, { turnNumber: 1 }), true);

  const eevee = mon('Eevee', {
    abilities: [
      ability(
        'Boosted Evolution',
        'As long as this Pokémon is in the Active Spot, it can evolve during your first turn or the turn you play it.'
      ),
    ],
  });
  assert.equal(abilityEvolvePermission(eevee, { isActive: false }), false);
  assert.equal(abilityEvolvePermission(eevee, { isActive: true }), true);

  const luxio = mon('Luxio', {
    abilities: [
      ability(
        'Top Entry',
        "If your opponent's Active Pokémon is a Pokémon ex, this Pokémon can evolve during your first turn or the turn you play it."
      ),
    ],
  });
  assert.equal(abilityEvolvePermission(luxio, { opponentActiveIsEx: false }), false);
  assert.equal(abilityEvolvePermission(luxio, { opponentActiveIsEx: true }), true);

  const spearow = mon('Spearow', {
    abilities: [
      ability('First Impression', 'If you go second, this Pokémon can evolve during your first turn.'),
    ],
  });
  assert.equal(abilityEvolvePermission(spearow, { turnNumber: 1 }), false);
  assert.equal(abilityEvolvePermission(spearow, { turnNumber: 2 }), true);

  const shelmet = mon('Shelmet', {
    abilities: [
      ability(
        'Trade',
        'If you have Karrablast in play, this Pokémon can evolve during your first turn or the turn you play it.'
      ),
    ],
  });
  assert.equal(abilityEvolvePermission(shelmet, { sideCards: [mon('Karrablast')] }), true);
  assert.equal(abilityEvolvePermission(shelmet, { sideCards: [mon('Other')] }), false);
});

test('abilityRetreatLock, abilityCounterMoveLock, summon and attack permissions', () => {
  const omastar = mon('Omastar', {
    abilities: [
      ability(
        'Suffocating Tentacles',
        "As long as this Pokémon is in the Active Spot, your opponent's Active Pokémon can't retreat."
      ),
    ],
  });
  const active = mon('Active');
  assert.equal(
    abilityRetreatLock(active, {
      sideCards: [active],
      sideActive: [active],
      opponentSideCards: [omastar],
      opponentActive: [omastar],
    }),
    true
  );
  assert.equal(
    abilityRetreatLock(active, {
      sideCards: [active],
      sideActive: [active],
      opponentSideCards: [omastar],
      opponentBench: [omastar],
    }),
    false
  );

  const snorlax = mon('Snorlax', {
    specialCondition: 'Asleep',
    abilities: [
      ability(
        'Block',
        "As long as Snorlax is your Active Pokémon, the Defending Pokémon can't Retreat. This power stops working when Snorlax is affected by a Special Condition."
      ),
    ],
  });
  assert.equal(
    abilityRetreatLock(active, {
      sideCards: [active],
      sideActive: [active],
      opponentSideCards: [snorlax],
      opponentActive: [snorlax],
    }),
    false,
    'the Snorlax wording stops while its holder has a Special Condition'
  );

  const patrat = mon('Patrat', {
    abilities: [
      ability(
        'Counter Guard',
        "Damage counters on each Pokémon (both yours and your opponent's) can't be moved to other Pokémon."
      ),
    ],
  });
  assert.equal(
    abilityCounterMoveLock({ sideCards: [active], opponentSideCards: [patrat] }),
    true
  );
  assert.equal(abilityCounterMoveLock({ sideCards: [active] }), false);

  const palafin = mon('Palafin ex', {
    abilities: [
      ability(
        'Zero to Hero',
        "Put this Pokémon into play only with the effect of Palafin's Zero to Hero Ability."
      ),
    ],
  });
  assert.equal(abilitySummonRestricted(palafin), true);
  assert.equal(abilitySummonRestricted(active), false);

  const meloetta = mon('Meloetta ex', {
    abilities: [
      ability('Debut Performance', 'If you go first, this Pokémon can use attacks during your first turn.'),
    ],
  });
  assert.equal(abilityFirstTurnAttack(meloetta, { turnNumber: 1 }), true);
  assert.equal(abilityFirstTurnAttack(meloetta, { turnNumber: 3 }), false);
  assert.equal(abilityFirstTurnAttack(active, { turnNumber: 1 }), false);

  const dipplin = mon('Dipplin', {
    abilities: [
      ability(
        'Festival Lead',
        'If Festival Grounds is in play, this Pokémon may use an attack it has twice. If the first attack Knocks Out your opponent\u2019s Active Pokémon, you may attack again after your opponent chooses a new Active Pokémon.'
      ),
    ],
  });
  assert.deepEqual(abilityExtraAttack(dipplin), {
    twice: true,
    stadium: 'festival grounds',
    onKo: true,
  });
  assert.deepEqual(abilityExtraAttack(mon('Omega', { abilities: [ability('Ω Barrage', 'This Pokémon may attack twice a turn.')] })), {
    twice: true,
    stadium: null,
    onKo: false,
  });
  assert.equal(abilityExtraAttack(active), null);
});

test('abilityStatusImmune: all-conditions and named-condition wordings', () => {
  const garganacl = mon('Garganacl ex', {
    abilities: [
      ability('Salted Cure', "This Pokémon can't be affected by any Special Conditions."),
    ],
  });
  for (const condition of ['Asleep', 'Burned', 'Confused', 'Paralyzed', 'Poisoned']) {
    assert.equal(abilityStatusImmune(garganacl, condition), true, condition);
  }
  const hoothoot = mon('Hoothoot', {
    abilities: [ability('Insomnia', "This Pokémon can't be Asleep.")],
  });
  assert.equal(abilityStatusImmune(hoothoot, 'Asleep'), true);
  assert.equal(abilityStatusImmune(hoothoot, 'Burned'), false);
  const slowpoke = mon('Slowpoke', {
    abilities: [ability('Oblivious', "This Pokémon can't be Confused.")],
  });
  assert.equal(abilityStatusImmune(slowpoke, 'Confused'), true);
  assert.equal(abilityStatusImmune(mon('Plain'), 'Asleep'), false);
});
