// Design 013: the authoritative attack must resolve printed text — "for each …" scaling,
// coin flips, recoil, single-target bench damage and bench spread — not just the printed number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';

const pokemon = (props) => createCard({ supertype: 'Pokémon', type: 'Pokémon', ...props });

const FEATHER_RONDO = {
  name: 'Feather Rondo',
  cost: [],
  damage: 60,
  text: "This attack does 20 more damage for each Benched Pokémon (both yours and your opponent's).",
};

const eventsOfType = (res, type) => res.events.filter((e) => e.type === type);
const damageOf = (state, playerId, zoneId, instanceId) =>
  state.players[playerId].zones[zoneId].find((c) => c.instanceId === instanceId)?.damage;

/**
 * Two players, p1 active + N bench, p2 active + M bench, turn 2 so p1 may attack.
 */
function twoBoards({ attack = FEATHER_RONDO, ownBench = 0, oppBench = 0, defenderHp = 150 } = {}) {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };

  state.players.p1.zones.active.push(
    pokemon({ instanceId: 1, name: 'Toucannon', hp: 150, attacks: [attack] })
  );
  for (let i = 0; i < ownBench; i += 1) {
    state.players.p1.zones.bench.push(
      pokemon({ instanceId: 100 + i, name: `Own Bench ${i}`, hp: 60 })
    );
  }

  state.players.p2.zones.active.push(
    pokemon({ instanceId: 20, name: 'Lunatone', hp: defenderHp })
  );
  for (let i = 0; i < oppBench; i += 1) {
    state.players.p2.zones.bench.push(
      pokemon({ instanceId: 200 + i, name: `Opp Bench ${i}`, hp: 60 })
    );
  }
  // Prizes for both sides so a KO has something to grant.
  for (const playerId of ['p1', 'p2']) {
    for (let i = 0; i < 6; i += 1) {
      state.players[playerId].zones.prizes.push(
        createCard({ instanceId: 1000 + (playerId === 'p1' ? 0 : 50) + i, name: 'Prize' })
      );
    }
  }
  return state;
}

const attack = (state, playerId = 'p1') =>
  applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId });

test('Feather Rondo scales by both benches: 60 + 20 x 7 = 200', () => {
  const state = twoBoards({ ownBench: 3, oppBench: 4, defenderHp: 400 });

  const res = attack(state);

  assert.ok(!res.error, `unexpected error: ${res.error}`);
  assert.equal(damageOf(res.state, 'p2', 'active', 20), 200);
  const scaled = eventsOfType(res, 'attackDamageScaled');
  assert.equal(scaled.length, 1);
  assert.equal(scaled[0].base, 60);
  assert.equal(scaled[0].total, 200);
  assert.equal(scaled[0].resolved, true);
  assert.match(scaled[0].notes.join(' '), /20 × 7/);
});

test('empty benches: the same attack deals its printed 60 and stays resolved', () => {
  const state = twoBoards({ ownBench: 0, oppBench: 0, defenderHp: 400 });

  const res = attack(state);

  assert.equal(damageOf(res.state, 'p2', 'active', 20), 60);
  assert.equal(eventsOfType(res, 'attackDamageScaled')[0].total, 60);
});

test('an attack with no printed text is unchanged and emits no scaling event', () => {
  const state = twoBoards({
    attack: { name: 'Peck', cost: [], damage: 30 },
    ownBench: 3,
    oppBench: 3,
  });

  const res = attack(state);

  assert.equal(damageOf(res.state, 'p2', 'active', 20), 30);
  assert.equal(eventsOfType(res, 'attackDamageScaled').length, 0);
  assert.equal(eventsOfType(res, 'attackCoinFlipped').length, 0);
});

test('missing card stats fall back to the flat 10 without crashing', () => {
  const state = twoBoards();
  state.players.p1.zones.active[0].attacks = [];

  const res = attack(state);

  assert.ok(!res.error, `unexpected error: ${res.error}`);
  assert.equal(damageOf(res.state, 'p2', 'active', 20), 10);
});

test('spread damage hits every benched Pokémon of the defender', () => {
  const state = twoBoards({
    attack: {
      name: 'Aerial Storm',
      cost: [],
      damage: 50,
      text: "This attack also does 20 damage to each of your opponent's Benched Pokémon.",
    },
    oppBench: 3,
    defenderHp: 400,
  });

  const res = attack(state);

  assert.equal(damageOf(res.state, 'p2', 'active', 20), 50);
  for (const instanceId of [200, 201, 202]) {
    assert.equal(damageOf(res.state, 'p2', 'bench', instanceId), 20);
  }
  const benchEvents = eventsOfType(res, 'benchDamaged');
  assert.equal(benchEvents.length, 3);
  assert.equal(benchEvents[0].playerId, 'p2');
  assert.equal(benchEvents[0].attackerPlayerId, 'p1');
  assert.equal(benchEvents[0].dealt, 20);
  assert.equal(res.events.find((e) => e.type === 'attackExecuted').benchDealt, 60);
});

test('spread damage knocks out benched Pokémon and owes the attacker their prizes', () => {
  const state = twoBoards({
    attack: {
      name: 'Aerial Storm',
      cost: [],
      damage: 0,
      text: "This attack does 60 damage to each of your opponent's Benched Pokémon.",
    },
    oppBench: 2,
    defenderHp: 400,
  });

  const res = attack(state);

  // Both 60 HP benched Pokémon are gone, and the attacker's prize entitlement (2 prizes,
  // one per KO) is settled before the command returns.
  assert.equal(res.state.players.p2.zones.bench.length, 0);
  assert.equal(res.state.players.p2.zones.discard.length, 2);
  assert.equal(eventsOfType(res, 'pokemonKnockedOut').length, 2);
  assert.equal(res.state.players.p1.zones.prizes.length, 4);
  assert.equal(res.state.players.p1.flags.prizesOwed, undefined);
});

test('bench damage with an empty bench fizzles instead of throwing', () => {
  const state = twoBoards({
    attack: {
      name: 'Aerial Storm',
      cost: [],
      damage: 50,
      text: "This attack also does 20 damage to each of your opponent's Benched Pokémon.",
    },
    oppBench: 0,
    defenderHp: 400,
  });

  const res = attack(state);

  assert.equal(damageOf(res.state, 'p2', 'active', 20), 50);
  const fizzle = eventsOfType(res, 'attackBenchFizzled');
  assert.equal(fizzle.length, 1);
  assert.equal(fizzle[0].reason, 'no-benched-pokemon');
});

test('single-target bench damage lets the player choose which benched Pokémon (D19)', () => {
  const state = twoBoards({
    attack: {
      name: 'Sniping Shot',
      cost: [],
      damage: 40,
      text: 'This attack does 30 damage to 1 of your opponent\'s Benched Pokémon.',
      },
    oppBench: 2,
    defenderHp: 400,
  });

  const res = attack(state);

  // Base damage still lands on the Active; the bench target is suspended as a choice.
  assert.equal(damageOf(res.state, 'p2', 'active', 20), 40);
  const choice = res.pendingChoice;
  assert.ok(choice, 'choosing a bench target must raise a choice');
  assert.equal(choice.player, 'p1');
  assert.equal(choice.min, 1);
  assert.equal(choice.max, 1);
  assert.deepEqual(
    choice.options.map((o) => o.instanceId),
    [200, 201]
  );
  assert.equal(choice.resumeToken.effectType, 'attack');
  assert.equal(damageOf(res.state, 'p2', 'bench', 200), 0);
  assert.equal(damageOf(res.state, 'p2', 'bench', 201), 0);

  const resolved = applyCommand(res.state, {
    type: 'resolveChoice',
    payload: { choiceId: choice.choiceId, selection: [201] },
    playerId: 'p1',
  });
  assert.equal(resolved.error, null);
  assert.equal(damageOf(resolved.state, 'p2', 'bench', 201), 30);
  assert.equal(damageOf(resolved.state, 'p2', 'bench', 200), 0);
  assert.equal(resolved.state.pendingChoice, null);
  // The attack auto-ended the turn after the choice resolved.
  assert.equal(resolved.state.turn.player, 'p2');
});

test('single bench target still auto-applies without a choice', () => {
  const state = twoBoards({
    attack: {
      name: 'Sniping Shot',
      cost: [],
      damage: 0,
      text: "This attack does 30 damage to 1 of your opponent's Benched Pokémon.",
    },
    oppBench: 1,
    defenderHp: 400,
  });

  const res = attack(state);

  assert.equal(res.pendingChoice, null);
  assert.equal(damageOf(res.state, 'p2', 'bench', 200), 30);
});

test('"1 of your opponent\'s Pokémon" offers the Active and the Bench, W/R-free on the bench', () => {
  const state = twoBoards({
    attack: {
      name: 'Pokémon Snipe',
      cost: [],
      damage: 0,
      text: "This attack does 30 damage to 1 of your opponent's Pokémon.",
    },
    oppBench: 1,
    defenderHp: 400,
  });

  const res = attack(state);
  const choice = res.pendingChoice;
  assert.ok(choice);
  assert.deepEqual(
    choice.options.map((o) => o.instanceId),
    [20, 200]
  );

  const resolved = applyCommand(res.state, {
    type: 'resolveChoice',
    payload: { choiceId: choice.choiceId, selection: [200] },
    playerId: 'p1',
  });
  assert.equal(resolved.error, null);
  assert.equal(damageOf(resolved.state, 'p2', 'bench', 200), 30);
  assert.equal(damageOf(resolved.state, 'p2', 'active', 20), 0);
});

test('"choose N of your opponent\'s Pokémon and put M damage counters on each" is a multi-pick', () => {
  const state = twoBoards({
    attack: {
      name: 'Counter Spread',
      cost: [],
      damage: 0,
      text: "Choose 2 of your opponent's Pokémon and put 1 damage counter on each.",
    },
    oppBench: 2,
    defenderHp: 400,
  });

  const res = attack(state);
  const choice = res.pendingChoice;
  assert.ok(choice, 'expected a multi-target choice');
  assert.equal(choice.min, 2);
  assert.equal(choice.max, 2);
  assert.deepEqual(
    choice.options.map((o) => o.instanceId),
    [20, 200, 201]
  );

  const resolved = applyCommand(res.state, {
    type: 'resolveChoice',
    payload: { choiceId: choice.choiceId, selection: [20, 201] },
    playerId: 'p1',
  });
  assert.equal(resolved.error, null);
  assert.equal(damageOf(resolved.state, 'p2', 'active', 20), 10);
  assert.equal(damageOf(resolved.state, 'p2', 'bench', 201), 10);
  assert.equal(damageOf(resolved.state, 'p2', 'bench', 200), 0);
});

test('coin-flip damage: heads and tails resolve from the command RNG', () => {
  const coinAttack = {
    name: 'Beak Blast',
    cost: [],
    damage: 40,
    text: 'Flip a coin. If heads, this attack does 60 more damage.',
  };
  const results = new Set();
  const damages = new Set();

  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const state = twoBoards({ attack: coinAttack, defenderHp: 400 });
    state.seed = seed;
    const res = attack(state);
    const [flipEvent] = eventsOfType(res, 'attackCoinFlipped');
    assert.equal(flipEvent.flips.length, 1);
    results.add(flipEvent.coin);
    damages.add(damageOf(res.state, 'p2', 'active', 20));
    assert.equal(
      damageOf(res.state, 'p2', 'active', 20),
      flipEvent.coin === 'heads' ? 100 : 40
    );
  }

  assert.deepEqual([...results].sort(), ['heads', 'tails']);
  assert.deepEqual([...damages].sort((a, b) => a - b), [40, 100]);
});

test('coin flips are deterministic for the same seed (replay safety)', () => {
  const coinAttack = {
    name: 'Beak Blast',
    cost: [],
    damage: 40,
    text: 'Flip a coin. If heads, this attack does 60 more damage.',
  };
  const run = () => {
    const state = twoBoards({ attack: coinAttack, defenderHp: 400 });
    state.seed = 12345;
    const res = attack(state);
    return eventsOfType(res, 'attackCoinFlipped')[0].coin;
  };

  assert.equal(run(), run());
});

test('multi-flip "for each heads" counts its own flips', () => {
  const state = twoBoards({
    attack: {
      name: 'Rock Barrage',
      cost: [],
      damage: 0,
      text: 'Flip 4 coins. This attack does 50 damage for each heads.',
    },
    defenderHp: 400,
  });
  state.seed = 9;

  const res = attack(state);

  const [flipEvent] = eventsOfType(res, 'attackCoinFlipped');
  assert.equal(flipEvent.flips.length, 4);
  assert.equal(flipEvent.headsCount, flipEvent.flips.filter((f) => f === 'heads').length);
  assert.equal(damageOf(res.state, 'p2', 'active', 20), flipEvent.headsCount * 50);
});

test('recoil self-damage lands on the attacker and can knock it out', () => {
  const state = twoBoards({
    attack: {
      name: 'Reckless Charge',
      cost: [],
      damage: 200,
      text: 'This Pokémon also does 200 damage to itself.',
    },
    defenderHp: 400,
  });
  state.players.p1.zones.bench.push(pokemon({ instanceId: 150, name: 'Pikipek', hp: 60 }));

  const res = attack(state);

  // Attacker had 150 HP and took 200 recoil: KO'd, and p2 collects the prize for it.
  assert.equal(res.state.players.p1.zones.discard.some((c) => c.instanceId === 1), true);
  assert.equal(res.state.players.p2.zones.prizes.length, 5);
  assert.equal(damageOf(res.state, 'p2', 'active', 20), 200);
});

test('a scaling attack with no defender still ends the turn without error', () => {
  const state = twoBoards({ ownBench: 2, oppBench: 2 });
  state.players.p2.zones.active.length = 0;

  const res = attack(state);

  assert.ok(!res.error, `unexpected error: ${res.error}`);
  assert.equal(res.events.some((e) => e.type === 'attackExecuted'), true);
});

test('"put N counters in any way you like" places them one click at a time', () => {
  const state = twoBoards({
    attack: {
      name: 'Counter Rain',
      cost: [],
      damage: 0,
      text: "Put 3 damage counters on your opponent's Pokémon in any way you like.",
    },
    oppBench: 1,
    defenderHp: 400,
  });

  let res = attack(state);
  assert.ok(res.pendingChoice, 'expected the first placement choice');
  assert.equal(res.pendingChoice.min, 1);
  assert.equal(res.pendingChoice.max, 1);
  assert.match(res.pendingChoice.prompt, /3 left/);

  res = applyCommand(res.state, {
    type: 'resolveChoice',
    payload: { choiceId: res.pendingChoice.choiceId, selection: [20] },
    playerId: 'p1',
  });
  assert.equal(damageOf(res.state, 'p2', 'active', 20), 10);
  assert.ok(res.pendingChoice);
  assert.match(res.pendingChoice.prompt, /2 left/);

  // Second counter on the bench, third back on the bench again (duplicates allowed).
  res = applyCommand(res.state, {
    type: 'resolveChoice',
    payload: { choiceId: res.pendingChoice.choiceId, selection: [200] },
    playerId: 'p1',
  });
  assert.equal(damageOf(res.state, 'p2', 'bench', 200), 10);
  assert.ok(res.pendingChoice);
  assert.match(res.pendingChoice.prompt, /1 left/);

  res = applyCommand(res.state, {
    type: 'resolveChoice',
    payload: { choiceId: res.pendingChoice.choiceId, selection: [200] },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null);
  assert.equal(damageOf(res.state, 'p2', 'active', 20), 10);
  assert.equal(damageOf(res.state, 'p2', 'bench', 200), 20);
  assert.equal(res.state.turn.player, 'p2');
});

test('"in any way you like" with only the Active available auto-places every counter', () => {
  const state = twoBoards({
    attack: {
      name: 'Counter Rain',
      cost: [],
      damage: 0,
      text: "Put 3 damage counters on your opponent's Pokémon in any way you like.",
    },
    oppBench: 0,
    defenderHp: 400,
  });

  const res = attack(state);

  assert.equal(res.pendingChoice, null);
  assert.equal(damageOf(res.state, 'p2', 'active', 20), 30);
});
