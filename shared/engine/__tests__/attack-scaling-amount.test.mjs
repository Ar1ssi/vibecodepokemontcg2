// Design 047: GX prints scale with "times the amount of" (Energy on both Active, all your
// Pokémon, typed basic Energy) and reduce with "less damage for each damage counter".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAttackDamage } from '../rules/damage-parser.mjs';

const pokemon = (props) => createCard({ supertype: 'Pokémon', type: 'Pokémon', ...props });
const energy = (instanceId, energyType, attachedTo) =>
  createCard({
    instanceId,
    name: `Basic ${energyType} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    type: 'Energy',
    energyType,
    attachedTo,
  });

const damageOf = (state, playerId, zoneId, instanceId) =>
  state.players[playerId].zones[zoneId].find((c) => c.instanceId === instanceId)?.damage || 0;

/** p1 Active attacker vs p2 Active defender, with attached Energy and damage counters. */
function board({
  attack,
  attackerEnergy = [],
  benchEnergies = [],
  attackerDamage = 0,
  benchDamage = 0,
  defenderEnergy = [],
  defenderDamage = 0,
  ownHand = 0,
  opponentHand = 0,
}) {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };

  const attacker = pokemon({ instanceId: 1, name: 'Attacker', hp: 250, attacks: [attack] });
  attacker.damage = attackerDamage;
  state.players.p1.zones.active.push(attacker);
  attackerEnergy.forEach((type, i) =>
    state.players.p1.zones.active.push(energy(50 + i, type, 1))
  );
  const bench = pokemon({ instanceId: 100, name: 'Own Bench', hp: 60 });
  bench.damage = benchDamage;
  state.players.p1.zones.bench.push(bench);
  benchEnergies.forEach((type, i) =>
    state.players.p1.zones.bench.push(energy(150 + i, type, 100))
  );
  for (let i = 0; i < ownHand; i += 1) {
    state.players.p1.zones.hand.push(
      createCard({ instanceId: 300 + i, name: 'Hand Card', supertype: 'Trainer', type: 'Item' })
    );
  }
  for (let i = 0; i < opponentHand; i += 1) {
    state.players.p2.zones.hand.push(
      createCard({ instanceId: 350 + i, name: 'Hand Card', supertype: 'Trainer', type: 'Item' })
    );
  }

  const defender = pokemon({ instanceId: 20, name: 'Defender', hp: 400 });
  defender.damage = defenderDamage;
  state.players.p2.zones.active.push(defender);
  defenderEnergy.forEach((type, i) =>
    state.players.p2.zones.active.push(energy(60 + i, type, 20))
  );

  for (const playerId of ['p1', 'p2']) {
    for (let i = 0; i < 6; i += 1) {
      state.players[playerId].zones.prizes.push(
        createCard({ instanceId: 1000 + i, name: 'Prize' })
      );
    }
  }
  return state;
}

const attackWith = (state) =>
  applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });

const ENERGY_DRIVE = {
  name: 'Energy Drive',
  cost: ['Colorless', 'Colorless'],
  damage: 20,
  text: 'This attack does 20 damage times the amount of Energy attached to both Active Pokémon. This damage isn\u2019t affected by Weakness or Resistance.',
};

const FULL_BURST = {
  name: 'Full Burst',
  cost: ['Psychic', 'Psychic'],
  damage: 30,
  text: 'This attack does 30 damage times the amount of Energy attached to this Pokémon.',
};

const ESPEON_PSYCHIC = {
  name: 'Psychic',
  cost: ['Psychic', 'Colorless', 'Colorless'],
  damage: 60,
  text: "This attack does 30 more damage times the amount of Energy attached to your opponent's Active Pokémon.",
};

const HYDRO_PRESSURE = {
  name: 'Hydro Pressure',
  cost: ['Water'],
  damage: 20,
  text: 'This attack does 20 more damage times the amount of {W} Energy attached to this Pokémon.',
};

const DRAGON_BREAK = {
  name: 'Dragon Break',
  cost: ['Grass', 'Lightning', 'Colorless'],
  damage: 30,
  text: 'This attack does 30 damage times the amount of basic {G} and basic {L} Energy attached to your Pokémon.',
};

const MASSIVE_BLOOM = {
  name: 'Massive Bloom',
  cost: ['Grass', 'Colorless'],
  damage: 180,
  text: 'This attack does 10 less damage for each damage counter on this Pokémon.',
};

const RAGING_BLADE = {
  name: 'Raging Blade',
  cost: [],
  damage: 80,
  text: 'If this Pokémon has any damage counters on it, this attack does 80 more damage.',
};

const CALAMITOUS_SLASH = {
  name: 'Calamitous Slash',
  cost: [],
  damage: 160,
  text: "If your opponent's Active Pokémon already has any damage counters on it, this attack does 80 more damage.",
};

const BERSERK = {
  name: 'Berserk',
  cost: [],
  damage: 80,
  text: 'If your Benched Pokémon have any damage counters on them, this attack does 70 more damage.',
};

const EXTRASENSORY = {
  name: 'Extrasensory',
  cost: [],
  damage: 90,
  text: 'If you have the same number of cards in your hand as your opponent, this attack does 90 more damage.',
};

test('Energy Drive counts Energy on both Active Pokémon (20 x 7 = 140)', () => {
  const state = board({
    attack: ENERGY_DRIVE,
    attackerEnergy: ['Fire', 'Water', 'Lightning', 'Grass'],
    defenderEnergy: ['Psychic', 'Darkness', 'Metal'],
  });
  const res = attackWith(state);
  assert.ok(!res.error, `unexpected error: ${res.error}`);
  assert.equal(damageOf(res.state, 'p2', 'active', 20), 140);
});

test('Full Burst counts Energy on this Pokémon (30 x 8 = 240)', () => {
  const state = board({
    attack: FULL_BURST,
    attackerEnergy: ['Psychic', 'Psychic', 'Colorless', 'Psychic', 'Psychic', 'Colorless', 'Psychic', 'Psychic'],
  });
  const res = attackWith(state);
  assert.ok(!res.error, `unexpected error: ${res.error}`);
  assert.equal(damageOf(res.state, 'p2', 'active', 20), 240);
});

test("Espeon-GX Psychic adds 30 per Energy on the opponent's Active (60 + 240 = 300)", () => {
  const state = board({
    attack: ESPEON_PSYCHIC,
    attackerEnergy: ['Psychic', 'Water', 'Water'],
    defenderEnergy: ['Water', 'Water', 'Water', 'Water', 'Water', 'Water', 'Water', 'Water'],
  });
  const res = attackWith(state);
  assert.ok(!res.error, `unexpected error: ${res.error}`);
  assert.equal(damageOf(res.state, 'p2', 'active', 20), 300);
});

test('Palkia-GX Hydro Pressure adds 20 per Water on this Pokémon (20 + 60 = 80)', () => {
  const state = board({
    attack: HYDRO_PRESSURE,
    attackerEnergy: ['Water', 'Water', 'Water', 'Fire'],
  });
  const res = attackWith(state);
  assert.ok(!res.error, `unexpected error: ${res.error}`);
  assert.equal(damageOf(res.state, 'p2', 'active', 20), 80);
});

test('Dragon Break counts basic Grass + Lightning across your board (30 x 3 = 90)', () => {
  const state = board({
    attack: DRAGON_BREAK,
    attackerEnergy: ['Grass', 'Lightning', 'Fire'],
    benchEnergies: ['Grass'],
  });
  const res = attackWith(state);
  assert.ok(!res.error, `unexpected error: ${res.error}`);
  assert.equal(damageOf(res.state, 'p2', 'active', 20), 90);
});

test('Massive Bloom reduces 10 per damage counter on this Pokémon (180 - 30 = 150)', () => {
  const state = board({
    attack: MASSIVE_BLOOM,
    attackerEnergy: ['Grass', 'Water'],
    attackerDamage: 30,
  });
  const res = attackWith(state);
  assert.ok(!res.error, `unexpected error: ${res.error}`);
  assert.equal(damageOf(res.state, 'p2', 'active', 20), 150);
});

test('Massive Bloom with no damage counters deals its printed 180', () => {
  const state = board({
    attack: MASSIVE_BLOOM,
    attackerEnergy: ['Grass', 'Water'],
    attackerDamage: 0,
  });
  const res = attackWith(state);
  assert.ok(!res.error, `unexpected error: ${res.error}`);
  assert.equal(damageOf(res.state, 'p2', 'active', 20), 180);
});

test('unreadable scaling counts keep the printed base and an honest note', () => {
  const parsed = parseAttackDamage(ENERGY_DRIVE, {}, {}, {});
  assert.equal(parsed.total, 20);
  assert.match(parsed.notes.join(' '), /resolve the printed count/);
  const reduction = parseAttackDamage(MASSIVE_BLOOM, {}, {}, {});
  assert.equal(reduction.total, 180);
  assert.match(reduction.notes.join(' '), /resolve the printed count/);
});

test('Raging Blade adds 80 with damage counters on itself, base without', () => {
  const hurt = attackWith(board({ attack: RAGING_BLADE, attackerDamage: 30 }));
  assert.equal(damageOf(hurt.state, 'p2', 'active', 20), 160);
  const fresh = attackWith(board({ attack: RAGING_BLADE, attackerDamage: 0 }));
  assert.equal(damageOf(fresh.state, 'p2', 'active', 20), 80);
});

test('Calamitous Slash adds 80 when the opponent Active already has damage counters', () => {
  const hurt = attackWith(board({ attack: CALAMITOUS_SLASH, defenderDamage: 30 }));
  // 30 were already on the defender; the attack adds 160 + 80.
  assert.equal(damageOf(hurt.state, 'p2', 'active', 20) - 30, 240);
  const fresh = attackWith(board({ attack: CALAMITOUS_SLASH, defenderDamage: 0 }));
  assert.equal(damageOf(fresh.state, 'p2', 'active', 20), 160);
});

test('Berserk adds 70 when your Benched Pokémon are damaged', () => {
  const hurt = attackWith(board({ attack: BERSERK, benchDamage: 30 }));
  assert.equal(damageOf(hurt.state, 'p2', 'active', 20), 150);
  const fresh = attackWith(board({ attack: BERSERK, benchDamage: 0 }));
  assert.equal(damageOf(fresh.state, 'p2', 'active', 20), 80);
});

test('Extrasensory adds 90 only when hand sizes are equal', () => {
  const equal = attackWith(board({ attack: EXTRASENSORY, ownHand: 2, opponentHand: 2 }));
  assert.equal(damageOf(equal.state, 'p2', 'active', 20), 180);
  const unequal = attackWith(board({ attack: EXTRASENSORY, ownHand: 2, opponentHand: 1 }));
  assert.equal(damageOf(unequal.state, 'p2', 'active', 20), 90);
});

test('missing condition context keeps the printed base and an unresolved note', () => {
  for (const [card, base] of [
    [RAGING_BLADE, 80],
    [CALAMITOUS_SLASH, 160],
    [BERSERK, 80],
    [EXTRASENSORY, 90],
  ]) {
    const parsed = parseAttackDamage(card, {}, {}, {});
    assert.equal(parsed.total, base);
    assert.match(parsed.notes.join(' '), /resolve the printed condition/);
  }
});

test('older "times the number of" wording keeps its attached-Energy count', () => {
  const parsed = parseAttackDamage(
    {
      name: 'Burst',
      damage: 30,
      text: 'This attack does 30 damage times the number of Energy cards attached to this Pokémon.',
    },
    {},
    {},
    { energyCount: 3 }
  );
  assert.equal(parsed.total, 90);
});
