// Homebrew set customhb (client/src/assets/custom-sets/customhb/set.json): Ability texts the
// engine did not run, or ran wrong. Each test names the card by its HB number; the text is the
// set.json effect, verbatim. Each test has a control case so it cannot pass vacuously.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand, validateLegality } from '../reduce.mjs';
import { addCondition, hasCondition } from '../rules/special-conditions.mjs';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 300, types: ['Colorless'], ...extra });
const ability = (name, text) => [{ name, type: 'Ability', text }];

/** p1 attacks with `text`; `setup(state, { attacker, defender })` adds anything else to the board. */
function board(name, text, { damage = '', setup = () => {}, attackerExtra = {}, defenderExtra = {} } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'customhb', seed: 3, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  const attacker = mon(name, { attacks: [{ name: 'Probe', cost: [], damage, text }], ...attackerExtra });
  state.players.p1.zones.active.push(attacker);
  const defender = mon('Defender', { hp: 400, ...defenderExtra });
  state.players.p2.zones.active.push(defender);
  setup(state, { attacker, defender });
  return { state, attacker, defender };
}

const attack = (state, seed = 3) =>
  applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(seed));
const activeOf = (state, pid) => state.players[pid].zones.active.find((c) => !c.attachedTo);
const damageOn = (state, pid) => activeOf(state, pid)?.damage ?? 0;
const choose = (res, selection) =>
  applyCommand(
    res.state,
    { type: 'resolveChoice', playerId: res.state.pendingChoice.player, payload: { choiceId: res.state.pendingChoice.choiceId, selection } },
    createRng(4)
  );
const ids = (cards) => cards.map((c) => c.instanceId);
const zone = (state, pid, name) => state.players[pid].zones[name];

// ── HB 267 Flaaffy Protective Fluff ──────────────────────────────────────────────────────────

test('HB 267 Flaaffy Protective Fluff: holder cannot get a Special Condition; a plain Pokémon can', () => {
  const flaaffy = mon('Flaaffy', { abilities: ability('Protective Fluff', 'This Pokémon is immune to all Special Conditions') });
  addCondition(flaaffy, 'Asleep');
  assert.equal(hasCondition(flaaffy, 'Asleep'), false);

  const plain = mon('Plain');
  addCondition(plain, 'Asleep');
  assert.equal(hasCondition(plain, 'Asleep'), true);
});

// ── HB 171 Cresselia Lunar Healing ───────────────────────────────────────────────────────────

test('HB 171 Cresselia Lunar Healing: while in play, your Active cannot be Asleep and wakes up', () => {
  const { state } = board('Basic', '', {
    setup: (s) => {
      s.players.p1.zones.bench.push(
        mon('Cresselia', { abilities: ability('Lunar Healing', 'While this Pokémon is in play, your Active Pokémon can\'t become Asleep. If your Active Pokémon is already Asleep, it immediately recovers from being Asleep.') })
      );
    },
  });
  const active = activeOf(state, 'p1');
  const res = applyCommand(
    state,
    { type: 'addSpecialCondition', playerId: 'p1', payload: { instanceId: active.instanceId, condition: 'Asleep' } },
    createRng(3)
  );
  assert.equal(hasCondition(activeOf(res.state, 'p1'), 'Asleep'), false);

  const control = board('Basic', '');
  const controlRes = applyCommand(
    control.state,
    { type: 'addSpecialCondition', playerId: 'p1', payload: { instanceId: activeOf(control.state, 'p1').instanceId, condition: 'Asleep' } },
    createRng(3)
  );
  assert.equal(hasCondition(activeOf(controlRes.state, 'p1'), 'Asleep'), true);
});

// ── HB 262 Magnemite Sparkling Induction ─────────────────────────────────────────────────────

test('HB 262 Magnemite Sparkling Induction: Retreat Cost is {C} less for each Magnemite on your Bench', () => {
  const withBench = (benchNames) =>
    board('Magnemite', '', {
      attackerExtra: {
        retreatCost: 2,
        abilities: ability('Sparkling Induction', 'As long as this Pokémon is your Active Pokémon, its Retreat Cost is {C} less for each Magnemite on your Bench.'),
      },
      setup: (s) => {
        for (const n of benchNames) s.players.p1.zones.bench.push(mon(n));
      },
    });
  const twoMagnemite = withBench(['Magnemite', 'Magnemite']);
  const bench = twoMagnemite.state.players.p1.zones.bench;
  const retreat = (state, benchId) =>
    validateLegality(state, { type: 'retreat', payload: { benchInstanceId: benchId }, playerId: 'p1' });
  assert.equal(retreat(twoMagnemite.state, bench[0].instanceId).allowed, true, 'cost 2 less 2 Magnemite = 0');

  const noMagnemite = withBench(['Plain', 'Plain']);
  const plainBench = noMagnemite.state.players.p1.zones.bench;
  assert.equal(retreat(noMagnemite.state, plainBench[0].instanceId).allowed, false, 'cost stays 2 with no energy');
});

// ── HB 264 Magnezone Magnetic Pull ───────────────────────────────────────────────────────────

test('HB 264 Magnezone Magnetic Pull: opponent Active that is {M} type cannot retreat', () => {
  const retreatOf = (withMagnezone) => {
    const { state } = board('Probe', '', {
      defenderExtra: { types: ['Metal'], retreatCost: 0 },
      setup: (s) => {
        s.players.p2.zones.bench.push(mon('Bench Basic'));
        if (withMagnezone) {
          s.players.p1.zones.bench.push(
            mon('Magnezone', { abilities: ability('Magnetic Pull', 'If your opponents Active Pokémon is a {M} type, it can no longer retreat.') })
          );
        }
      },
    });
    state.turn = { player: 'p2', number: 6, phase: 'main' };
    const benchId = state.players.p2.zones.bench[0].instanceId;
    return validateLegality(state, { type: 'retreat', payload: { benchInstanceId: benchId }, playerId: 'p2' });
  };
  assert.equal(retreatOf(true).allowed, false);
  assert.equal(retreatOf(false).allowed, true);
});

// ── HB 249 Yveltal Life-Locked ───────────────────────────────────────────────────────────────

test('HB 249 Yveltal Life-Locked: opponent Active cannot be healed while Yveltal is in play', () => {
  const healText = 'Heal 30 damage from this Pokémon.';
  const healedAfterAttack = (withYveltal) => {
    const { state } = board('Healer', healText, {
      setup: (s) => {
        s.players.p1.zones.active[0].damage = 60;
        if (withYveltal) {
          s.players.p2.zones.bench.push(
            mon('Yveltal', { abilities: ability('Life-Locked', 'If this Pokémon is in play, your opponent\'s Active Pokémon can\'t be healed.') })
          );
        }
      },
    });
    return damageOn(attack(state).state, 'p1');
  };
  assert.equal(healedAfterAttack(true), 60, 'heal blocked');
  assert.equal(healedAfterAttack(false), 30, 'heal goes through without Yveltal');
});

// ── HB 082 Greninja ex Pain Points ───────────────────────────────────────────────────────────

test('HB 082 Greninja ex Pain Points: attacks ignore the defender Resistance', () => {
  const damageDealt = (withPainPoints) => {
    const { state } = board('Greninja ex', '', {
      damage: '60',
      attackerExtra: {
        types: ['Water'],
        abilities: withPainPoints
          ? ability('Pain Points', 'This Pokémon\'s attacks are not affected by Abilities or Resistance.')
          : [],
      },
      defenderExtra: { resistance: { type: 'Water', value: -30 } },
    });
    return damageOn(attack(state).state, 'p2');
  };
  assert.equal(damageDealt(true), 60, 'Resistance ignored');
  assert.equal(damageDealt(false), 30, 'Resistance applies without Pain Points');
});

// ── HB 214 Quagsire Unaware ──────────────────────────────────────────────────────────────────

test('HB 214 Quagsire Unaware: defender ignores attacker Ability damage increases', () => {
  const damageDealt = (defenderHasUnaware) => {
    const { state } = board('Boosted', '', {
      damage: '60',
      attackerExtra: {
        abilities: ability('Boost', 'This Pokémon\'s attacks do 20 more damage to the Defending Pokémon.'),
      },
      setup: (s, { defender }) => {
        if (defenderHasUnaware) {
          defender.abilities = ability('Unaware', 'This Pokémon ignores all effects that increase damage from your opponent\'s Active Pokémon.');
        }
      },
    });
    return damageOn(attack(state).state, 'p2');
  };
  assert.equal(damageDealt(true), 60, 'boost ignored by Quagsire');
  assert.equal(damageDealt(false), 80, 'boost applies without Unaware');
});

// ── HB 176 Klefki Fairy Lock ─────────────────────────────────────────────────────────────────

test('HB 176 Klefki Fairy Lock: opponent {N} Pokémon Weakness is now {P} (x2)', () => {
  const damageWith = (withKlefki) => {
    const { state } = board('Psychic Attacker', '', {
      damage: '60',
      attackerExtra: { types: ['Psychic'] },
      defenderExtra: { types: ['Dragon'] },
      setup: (s) => {
        if (withKlefki) {
          s.players.p1.zones.bench.push(
            mon('Klefki', { abilities: ability('Fairy Lock', 'The Weakness of each of your opponent\'s {N} Pokémon in play is now {P}. (Apply Weakness as x2)') })
          );
        }
      },
    });
    return damageOn(attack(state).state, 'p2');
  };
  assert.equal(damageWith(true), 120, 'Psychic Weakness x2 from Klefki');
  assert.equal(damageWith(false), 60, 'no Weakness without Klefki');
});

// ── HB 201 Alolan Ninetales Luminous Barrier ─────────────────────────────────────────────────

test('HB 201 Alolan Ninetales Luminous Barrier: prevents attacks from your opponent\'s Pokémon-EX', () => {
  const damageFrom = (attackerName) => {
    const { state } = board(attackerName, '', {
      damage: '100',
      attackerExtra: { types: ['Fire'] },
      defenderExtra: {
        name: 'Alolan Ninetales',
        types: ['Water'],
        abilities: ability('Luminous Barrier', 'Prevent all effects of attacks, including damage, done to this Pokémon by your opponent\'s Pokémon-EX.'),
      },
    });
    return damageOn(attack(state).state, 'p2');
  };
  assert.equal(damageFrom('Charizard ex'), 0, 'EX attacker prevented');
  assert.equal(damageFrom('Charizard'), 100, 'non-EX attacker not prevented');
});

// ── HB 059 Dragapult Infiltrator ─────────────────────────────────────────────────────────────

const INFILTRATOR = 'If any damage is done to this Pokémon by attacks, flip a coin. If heads, prevent that damage.';
const attackWithFace = (state, face) => {
  const rng = createRng(3);
  rng.forcedCoin = face;
  return applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, rng);
};

test('HB 059 Dragapult Infiltrator: heads prevents attack damage to the Active; tails does not', () => {
  const dragapultActive = (withAbility) => board('Basic', '', {
    damage: '60',
    setup: (s) => {
      s.players.p2.zones.active[0].name = 'Dragapult';
      s.players.p2.zones.active[0].abilities = withAbility ? ability('Infiltrator', INFILTRATOR) : [];
    },
  }).state;
  assert.equal(damageOn(attackWithFace(dragapultActive(true), 'heads').state, 'p2'), 0, 'heads prevents');
  assert.equal(damageOn(attackWithFace(dragapultActive(true), 'tails').state, 'p2'), 60, 'tails lets damage through');
  assert.equal(damageOn(attackWithFace(dragapultActive(false), 'heads').state, 'p2'), 60, 'no Infiltrator, no flip');
});

test('HB 059 Dragapult Infiltrator: heads prevents attack damage to a Benched Dragapult', () => {
  const benchHit = (withAbility) => {
    const { state } = board('Spreader', 'This attack does 30 damage to each of your opponent\'s Benched Pokémon.', {
      damage: '',
      setup: (s) => {
        s.players.p2.zones.bench.push(mon('Dragapult', { abilities: withAbility ? ability('Infiltrator', INFILTRATOR) : [] }));
      },
    });
    return attackWithFace(state, 'heads').state.players.p2.zones.bench[0].damage ?? 0;
  };
  assert.equal(benchHit(true), 0, 'heads prevents bench damage');
  assert.equal(benchHit(false), 30, 'no Infiltrator takes the damage');
});

// ── HB 025 Amoonguss Disarming Spore / HB 219 Jellicent Spiteful Spirit ─────────────────────

const amoongussKo = (withAbility, benchCount) => {
  const { state } = board('Basic', '', {
    damage: '60',
    defenderExtra: {
      name: 'Amoonguss',
      hp: 60,
      abilities: withAbility
        ? ability('Disarming Spore', 'If this Pokémon is Knocked Out during your opponent\'s turn, discard 3 cards from your opponent\'s hand.')
        : [],
    },
    setup: (s) => {
      for (let i = 0; i < benchCount; i++) s.players.p2.zones.bench.push(mon(`Bench ${i}`));
      for (let i = 0; i < 4; i++) s.players.p1.zones.hand.push(mon(`Hand ${i}`));
    },
  });
  return attack(state);
};

test('HB 025 Amoonguss Disarming Spore: KO on the opponent\'s turn makes the opponent discard 3 from hand', () => {
  const res = amoongussKo(true, 1);
  assert.equal(res.state.pendingChoice?.player, 'p1', 'opponent chooses the discards');
  assert.equal(res.state.pendingChoice.options.length, 4);
  assert.equal(res.state.pendingChoice.min, 3);
  const done = choose(res, ids(res.state.pendingChoice.options).slice(0, 3));
  assert.equal(done.error, null);
  assert.equal(zone(done.state, 'p1', 'hand').length, 1);
  assert.equal(zone(done.state, 'p1', 'discard').length, 3);

  const control = amoongussKo(false, 1);
  assert.notEqual(control.state.pendingChoice?.source, 'Amoonguss', 'no discard without the ability');
  assert.equal(zone(control.state, 'p1', 'hand').length, 4);
});

test('HB 025 Amoonguss Disarming Spore: the discard waits for a pending promotion choice', () => {
  const res = amoongussKo(true, 2);
  assert.equal(res.state.pendingChoice?.player, 'p2', 'owner promotes first');
  const promoted = choose(res, [ids(zone(res.state, 'p2', 'bench'))[0]]);
  assert.equal(promoted.error, null);
  assert.equal(promoted.state.pendingChoice?.player, 'p1', 'then the opponent discards');
  assert.equal(promoted.state.pendingChoice.options.length, 4);
});

test('HB 219 Jellicent Spiteful Spirit: Active KO\'d by an opponent\'s attack confuses and poisons the Attacking Pokémon', () => {
  const attackerConditions = (withAbility) => {
    const { state } = board('Basic', '', {
      damage: '60',
      defenderExtra: {
        name: 'Jellicent',
        hp: 60,
        abilities: withAbility
          ? ability('Spiteful Spirit', 'If this Pokémon is your Active Pokémon and is Knocked Out by damage from an opponent\'s attack, the Attacking Pokémon is now Confused and Poisoned.')
          : [],
      },
      setup: (s) => {
        s.players.p2.zones.bench.push(mon('Bench Basic'));
      },
    });
    const res = attack(state);
    const attackerActive = activeOf(res.state, 'p1');
    return { confused: hasCondition(attackerActive, 'Confused'), poisoned: hasCondition(attackerActive, 'Poisoned') };
  };
  assert.deepEqual(attackerConditions(true), { confused: true, poisoned: true });
  assert.deepEqual(attackerConditions(false), { confused: false, poisoned: false });
});

// ── HB 070 Gengar ex Gnawing Curse / HB 198 Old Cemetery ─────────────────────────────────────

const GNAWING_CURSE = 'Whenever your opponent attaches an Energy card from their hand to 1 of their Pokémon, put 2 damage counters on that Pokémon.';
const OLD_CEMETERY = 'Whenever any player attaches an Energy card from their hand to 1 of their non-{P} Pokémon, put 2 damage counters on that Pokémon.';

/** p2 attaches a Fire Energy from hand to its Active of `targetType`; returns the Active's damage. */
function p2AttachDamage(targetType, { gengar = false, cemetery = false } = {}) {
  const { state, defender } = board('Basic', '', {
    defenderExtra: { types: [targetType] },
    setup: (s) => {
      if (gengar) {
        s.players.p1.zones.bench.push(mon('Gengar ex', { abilities: ability('Gnawing Curse', GNAWING_CURSE) }));
      }
      if (cemetery) {
        s.stadium = createCard({ instanceId: 91, name: 'Old Cemetery', supertype: 'Trainer', subtypes: ['Stadium'], text: OLD_CEMETERY });
      }
      s.players.p2.zones.hand.push(
        createCard({ instanceId: 900, name: 'Basic Fire Energy', supertype: 'Energy', subtypes: ['Basic'], energyType: 'Fire' })
      );
    },
  });
  state.turn = { player: 'p2', number: 6, phase: 'main' };
  const res = applyCommand(
    state,
    { type: 'attachCard', playerId: 'p2', payload: { instanceId: 900, targetInstanceId: defender.instanceId } },
    createRng(3)
  );
  assert.equal(res.error, null);
  return damageOn(res.state, 'p2');
}

test('HB 070 Gengar ex Gnawing Curse: opponent\'s Energy from hand puts 2 damage counters on that Pokémon', () => {
  assert.equal(p2AttachDamage('Water', { gengar: true }), 20);
  assert.equal(p2AttachDamage('Water'), 0, 'no Gengar, no counters');
});

test('HB 198 Old Cemetery: any player\'s Energy from hand puts 2 damage counters on a non-{P} Pokémon', () => {
  assert.equal(p2AttachDamage('Water', { cemetery: true }), 20);
  assert.equal(p2AttachDamage('Psychic', { cemetery: true }), 0, '{P} Pokémon is excluded');
  assert.equal(p2AttachDamage('Water'), 0, 'no Stadium, no counters');
});

// ── HB 276 Electropower ──────────────────────────────────────────────────────────────────────

const ELECTROPOWER =
  "During this turn, your {L} Pokémon's attacks do 30 more damage to your opponent's Active Pokémon (before applying Weakness and Resistance).";

/** p1 plays Electropower from hand, then attacks p2's Active with a 60-damage attack. */
function electropowerAttack(attackerTypes) {
  const { state } = board('Attacker', '', {
    damage: '60',
    attackerExtra: { types: attackerTypes },
    setup: (s) => {
      s.players.p1.zones.hand.push(
        createCard({ instanceId: 950, name: 'Electropower', supertype: 'Trainer', subtypes: ['Supporter'], effect: ELECTROPOWER })
      );
    },
  });
  const played = applyCommand(state, { type: 'playTrainer', playerId: 'p1', payload: { instanceId: 950 } }, createRng(3));
  assert.equal(played.error, null);
  return damageOn(attack(played.state).state, 'p2');
}

test('HB 276 Electropower: your {L} Pokémon\'s attacks do 30 more damage to the Active this turn', () => {
  assert.equal(electropowerAttack(['Lightning']), 90);
  assert.equal(electropowerAttack(['Colorless']), 60, 'non-{L} Pokémon gets no bonus');
});

// ── HB 272 Alolan Golem Electrum Deposit ─────────────────────────────────────────────────────

const ELECTRUM_DEPOSIT =
  'You may use this Ability once during your turn. Flip a coin, if heads, search your deck for a {L} Energy and attach to one of your Pokémon.';

/** p1 uses Electrum Deposit with a forced coin face; the deck holds a {L} Energy and a Basic {W}. */
function useElectrumDeposit(face) {
  const { state, attacker } = board('Alolan Golem', '', {
    attackerExtra: { types: ['Lightning'], abilities: ability('Electrum Deposit', ELECTRUM_DEPOSIT) },
    setup: (s) => {
      s.players.p1.zones.bench.push(mon('Pikachu', { instanceId: 970, types: ['Lightning'] }));
      s.players.p1.zones.deck.push(
        createCard({ instanceId: 960, name: 'Lightning Energy', supertype: 'Energy', subtypes: ['Basic'], energyType: 'Lightning' }),
        createCard({ instanceId: 961, name: 'Water Energy', supertype: 'Energy', subtypes: ['Basic'], energyType: 'Water' })
      );
    },
  });
  const rng = createRng(3);
  rng.forcedCoin = face;
  return { res: applyCommand(state, { type: 'useAbility', playerId: 'p1', payload: { instanceId: attacker.instanceId } }, rng), attacker };
}

test('HB 272 Alolan Golem Electrum Deposit: heads searches a {L} Energy and attaches it to one of your Pokémon', () => {
  const { res, attacker } = useElectrumDeposit('heads');
  assert.equal(res.error, null);
  assert.deepEqual(ids(res.pendingChoice.options), [960], 'only the {L} Energy is offered');
  const picked = choose(res, [960]);
  assert.equal(picked.error, null);
  assert.deepEqual(
    new Set(ids(picked.state.pendingChoice.options)),
    new Set([attacker.instanceId, 970]),
    'target is one of your Pokémon'
  );
  const done = choose(picked, [970]);
  assert.equal(done.error, null);
  const attached = zone(done.state, 'p1', 'deck').find((c) => c.instanceId === 960);
  assert.equal(attached, undefined, 'energy left the deck');
  assert.equal(done.state.players.p1.zones.bench[0].instanceId, 970);
});

test('HB 272 Alolan Golem Electrum Deposit: tails searches nothing and the deck keeps its {L} Energy', () => {
  const { res } = useElectrumDeposit('tails');
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice ?? null, null);
  assert.ok(zone(res.state, 'p1', 'deck').some((c) => c.instanceId === 960));
});

// ── HB 242 Greninja Mist Concealment ─────────────────────────────────────────────────────────

const MIST_TEXT = "When you play this Pokémon from your hand to evolve 1 of your Pokémon, you may prevent all effects of attacks, including damage, done to this Pokémon by your opponent's Pokémon during your opponent's next turn.";

/**
 * p1 evolves Frogadier into Greninja; optionally uses Mist Concealment; then p2 attacks on `attackTurn`
 * with `hit` ({ damage, text }). Poison is left out of the damage tests: its checkup adds 10 damage.
 */
function greninjaAttackedOn({ useAbility, attackTurn, hit = { damage: '30', text: '' } }) {
  const { state, attacker } = board('Frogadier', '', {
    attackerExtra: { stage: 'Stage 1', evolvesFrom: 'Froakie' },
    defenderExtra: { attacks: [{ name: 'Hit', cost: [], damage: hit.damage, text: hit.text }] },
  });
  const greninja = mon('Greninja', { stage: 'Stage 2', evolvesFrom: 'Frogadier', abilities: ability('Mist Concealment', MIST_TEXT) });
  state.players.p1.zones.hand.push(greninja);
  let res = applyCommand(
    state,
    { type: 'attachCard', playerId: 'p1', payload: { instanceId: greninja.instanceId, targetInstanceId: attacker.instanceId } },
    createRng(3)
  );
  assert.equal(res.error, null);
  assert.ok(zone(res.state, 'p1', 'active').some((c) => c.name === 'Greninja'));
  if (useAbility) {
    res = applyCommand(res.state, { type: 'useAbility', playerId: 'p1', payload: { instanceId: greninja.instanceId } }, createRng(3));
    assert.equal(res.error, null);
  }
  res.state.turn = { player: 'p2', number: attackTurn, phase: 'main' };
  return applyCommand(res.state, { type: 'attack', playerId: 'p2', payload: { attackIndex: 0 } }, createRng(3));
}

// An evolved holder is a stack: damage and Special Conditions may sit on either card in it.
const stackDamage = (state) => zone(state, 'p1', 'active').reduce((sum, c) => sum + (c.damage ?? 0), 0);
const stackHas = (state, condition) => zone(state, 'p1', 'active').some((c) => hasCondition(c, condition));

test('HB 242 Greninja Mist Concealment: evolve play blocks the opponent\'s attack damage next turn', () => {
  const shielded = greninjaAttackedOn({ useAbility: true, attackTurn: 6 });
  assert.equal(stackDamage(shielded.state), 0);

  const control = greninjaAttackedOn({ useAbility: false, attackTurn: 6 });
  assert.equal(stackDamage(control.state), 30);
});

test('HB 242 Greninja Mist Concealment: evolve play blocks the opponent\'s attack effects next turn', () => {
  const poison = { damage: '', text: 'The Defending Pokémon is now Poisoned.' };
  const shielded = greninjaAttackedOn({ useAbility: true, attackTurn: 6, hit: poison });
  assert.equal(stackHas(shielded.state, 'Poisoned'), false);

  const control = greninjaAttackedOn({ useAbility: false, attackTurn: 6, hit: poison });
  assert.equal(stackHas(control.state, 'Poisoned'), true);
});

test('HB 242 Greninja Mist Concealment: the protection ends with the opponent\'s next turn', () => {
  const later = greninjaAttackedOn({ useAbility: true, attackTurn: 7 });
  assert.equal(stackDamage(later.state), 30);
});

// ── HB 160 Mawile Energy Crunch ──────────────────────────────────────────────────────────────

const ENERGY_CRUNCH =
  "When you play this Pokémon from your hand onto your Bench, you may discard 1 Energy from 1 of your opponent's Pokémon.";

function useEnergyCrunch({ playedThisTurn }) {
  const { state, defender } = board('Active Friend', '', {
    setup: (s, { defender: d }) => {
      const benched = mon('Foe Bench');
      s.players.p2.zones.active.push(createCard({ instanceId: 980, name: 'Basic Fire Energy', supertype: 'Energy', subtypes: ['Basic'], energyType: 'Fire', attachedTo: d.instanceId }));
      s.players.p2.zones.bench.push(benched, createCard({ instanceId: 981, name: 'Basic Water Energy', supertype: 'Energy', subtypes: ['Basic'], energyType: 'Water', attachedTo: benched.instanceId }));
      const mawile = mon('Mawile', { abilities: ability('Energy Crunch', ENERGY_CRUNCH), playedToBenchTurn: playedThisTurn ? s.turn.number : s.turn.number - 2 });
      s.players.p1.zones.bench.push(mawile);
      s.mawileId = mawile.instanceId;
    },
  });
  const res = applyCommand(state, { type: 'useAbility', playerId: 'p1', payload: { instanceId: state.mawileId } }, createRng(3));
  return { res, defender };
}

test('HB 160 Mawile Energy Crunch: discards 1 Energy chosen from any of the opponent’s Pokémon', () => {
  const { res } = useEnergyCrunch({ playedThisTurn: true });
  assert.equal(res.error, null);
  assert.deepEqual(new Set(ids(res.pendingChoice.options)), new Set([980, 981]), 'Active and Benched Energy are both offered');
  const done = choose(res, [981]);
  assert.equal(done.error, null);
  const energyIds = [...zone(done.state, 'p2', 'active'), ...zone(done.state, 'p2', 'bench')].map((c) => c.instanceId);
  assert.ok(!energyIds.includes(981) && energyIds.includes(980), 'only the chosen Energy left play');
  assert.ok(zone(done.state, 'p2', 'discard').some((c) => c.instanceId === 981));
});

test('HB 160 Mawile Energy Crunch: refused when Mawile was not played to the Bench this turn', () => {
  const { res } = useEnergyCrunch({ playedThisTurn: false });
  assert.notEqual(res.error, null);
});

test('HB 201 Alolan Ninetales Luminous Barrier: also blocks the non-damage effects of a Pokémon-EX attack', () => {
  const statusAfter = (attackerName) => {
    const { state } = board(attackerName, 'The Defending Pokémon is now Paralyzed.', {
      damage: '10',
      defenderExtra: {
        name: 'Alolan Ninetales',
        abilities: ability('Luminous Barrier', "Prevent all effects of attacks, including damage, done to this Pokémon by your opponent's Pokémon-EX."),
      },
    });
    return hasCondition(activeOf(attack(state).state, 'p2'), 'Paralyzed');
  };
  assert.equal(statusAfter('Charizard ex'), false, 'EX attacker: Paralysis prevented');
  assert.equal(statusAfter('Charizard'), true, 'non-EX attacker: Paralysis lands');
});

test('HB 070 Gengar ex Gnawing Curse: lethal counters Knock Out the Pokémon that received the Energy', () => {
  const { state, defender } = board('Basic', '', {
    defenderExtra: { hp: 20 },
    setup: (s) => {
      s.players.p1.zones.bench.push(mon('Gengar ex', { abilities: ability('Gnawing Curse', GNAWING_CURSE) }));
      s.players.p2.zones.bench.push(mon('Backup'));
      s.players.p2.zones.hand.push(
        createCard({ instanceId: 900, name: 'Basic Fire Energy', supertype: 'Energy', subtypes: ['Basic'], energyType: 'Fire' })
      );
    },
  });
  state.turn = { player: 'p2', number: 6, phase: 'main' };
  const res = applyCommand(
    state,
    { type: 'attachCard', playerId: 'p2', payload: { instanceId: 900, targetInstanceId: defender.instanceId } },
    createRng(3)
  );
  assert.equal(res.error, null);
  assert.ok(!zone(res.state, 'p2', 'active').some((c) => c.instanceId === defender.instanceId), 'the 20-HP Pokémon left play');
  assert.ok(zone(res.state, 'p2', 'discard').some((c) => c.instanceId === defender.instanceId));
});

test('HB 082 Greninja ex Pain Points: attacks are not affected by Infiltrator (no flip, damage lands)', () => {
  const hit = (painPoints, face) => {
    const { state } = board('Greninja ex', '', {
      damage: '60',
      attackerExtra: painPoints ? { abilities: ability('Pain Points', "This Pokémon's attacks are not affected by Abilities or Resistance.") } : {},
      setup: (s) => {
        s.players.p2.zones.active[0].name = 'Dragapult';
        s.players.p2.zones.active[0].abilities = ability('Infiltrator', INFILTRATOR);
      },
    });
    return damageOn(attackWithFace(state, face).state, 'p2');
  };
  assert.equal(hit(false, 'heads'), 0, 'control: Infiltrator heads prevents');
  assert.equal(hit(true, 'heads'), 60, 'Pain Points ignores Infiltrator');
});
