// Whole-attack "does nothing" condition gates through the reducer (design 036 A1): the S279
// audit's verified rows must deal 0 damage and end the turn when the printed condition fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 300, ...extra });
const energy = (type, extra = {}) =>
  createCard({
    instanceId: nextId++,
    name: `Basic ${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType: type,
    type: 'Energy',
    ...extra,
  });
const namedEnergy = (name) =>
  createCard({ instanceId: nextId++, name, supertype: 'Energy', subtypes: ['Special'], type: 'Energy' });
const trainer = (name) => createCard({ instanceId: nextId++, name, supertype: 'Trainer', type: 'Item' });

/** p1's Active attacks with `text`; `setup` shapes the board before the attack. */
function board(
  text,
  { name = 'Attacker', attackName = 'Test Attack', damage = '0', setup = () => {}, seed = 5 } = {}
) {
  nextId = 1;
  const state = createGameState({ gameId: 'atk-condition', seed, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(trainer(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const attacker = mon(name, { hp: 300, attacks: [{ name: attackName, cost: [], damage, text }] });
  state.players.p1.zones.active.push(attacker);
  const defender = mon('Defender', { hp: 400 });
  state.players.p2.zones.active.push(defender);
  const ctx = { state, attacker, defender, p1: state.players.p1, p2: state.players.p2 };
  setup(ctx);
  return { ...ctx, rng: createRng(seed) };
}

function attack(b) {
  const res = applyCommand(b.state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, b.rng);
  assert.equal(res.error, null);
  return res;
}

const executed = (res) => res.events.find((e) => e.type === 'attackExecuted');
const failed = (res) => res.events.find((e) => e.type === 'attackConditionFailed');
const damageOn = (res, pid = 'p2') => res.state.players[pid].zones.active[0].damage;

/** Asserts the attack did nothing: 0 damage, no attackExecuted, turn passed, attack used. */
function assertFizzled(res) {
  assert.equal(executed(res), undefined, 'no attackExecuted');
  assert.ok(failed(res), 'attackConditionFailed fired');
  assert.equal(res.state.turn.player, 'p2', 'the turn ends');
  assert.equal(res.state.players.p1.flags.attackerAttacked, true, 'the attack counts as used');
}

test('Malamar Brain Crush: nothing when the defender is not Confused, 130 when it is', () => {
  const text = "If your opponent's Active Pokémon isn't Confused, this attack does nothing.";
  const off = attack(board(text, { name: 'Malamar', damage: '130' }));
  assertFizzled(off);
  assert.equal(damageOn(off), 0);

  const on = attack(
    board(text, {
      name: 'Malamar',
      damage: '130',
      setup: ({ defender }) => {
        defender.specialCondition = 'Confused';
      },
    })
  );
  assert.equal(failed(on), undefined);
  assert.equal(damageOn(on), 130);
});

test('Fan Rotom Assault Landing: nothing without a Stadium, 70 with one', () => {
  const text = 'If there is no Stadium in play, this attack does nothing.';
  const off = attack(board(text, { name: 'Fan Rotom', damage: '70' }));
  assertFizzled(off);
  assert.equal(damageOn(off), 0);

  const on = attack(
    board(text, {
      name: 'Fan Rotom',
      damage: '70',
      setup: ({ state }) => {
        state.stadium = createCard({ instanceId: 900, name: 'Stadium', supertype: 'Trainer', type: 'Stadium' });
      },
    })
  );
  assert.equal(damageOn(on), 70);
});

test('Medicham Seventh Kick: nothing unless the hand is exactly 7', () => {
  const text = "If you don't have exactly 7 cards in your hand, this attack does nothing.";
  const off = attack(board(text, { name: 'Medicham', damage: '150' }));
  assertFizzled(off);

  const on = attack(
    board(text, {
      name: 'Medicham',
      damage: '150',
      setup: ({ p1 }) => {
        for (let i = 0; i < 7; i++) p1.zones.hand.push(trainer(`hand ${i}`));
      },
    })
  );
  assert.equal(damageOn(on), 150);
});

test('Solrock Cosmic Beam: nothing without Lunatone on the Bench', () => {
  const text =
    "If you don't have Lunatone on your Bench, this attack does nothing. This attack's damage isn't affected by Weakness or Resistance.";
  const off = attack(board(text, { name: 'Solrock', damage: '70' }));
  assertFizzled(off);

  const on = attack(
    board(text, {
      name: 'Solrock',
      damage: '70',
      setup: ({ p1 }) => {
        p1.zones.bench.push(mon('Lunatone'));
      },
    })
  );
  assert.equal(damageOn(on), 70);
});

test('Sawk Rising Chop: nothing unless the defender is a Pokémon ex', () => {
  const text =
    "If your opponent's Active Pokémon isn't a Pokémon ex, this attack does nothing. This attack's damage isn't affected by Weakness or Resistance.";
  const off = attack(board(text, { name: 'Sawk', damage: '90' }));
  assertFizzled(off);

  const on = attack(
    board(text, {
      name: 'Sawk',
      damage: '90',
      setup: ({ defender }) => {
        defender.name = 'Defender ex';
      },
    })
  );
  assert.equal(damageOn(on), 90);
});

test('Slowbro Laid-Back Tackle: nothing when it evolved this turn', () => {
  const text = 'If this Pokémon evolved during this turn, this attack does nothing.';
  const off = attack(
    board(text, {
      name: 'Slowbro',
      damage: '160',
      setup: ({ p1, attacker }) => {
        p1.flags.evolved = { [attacker.instanceId]: true };
      },
    })
  );
  assertFizzled(off);

  const on = attack(board(text, { name: 'Slowbro', damage: '160' }));
  assert.equal(damageOn(on), 160);
});

test('Primeape Raging Smash: nothing unless the attacker is Confused', () => {
  const text = "If this Pokémon isn't Confused, this attack does nothing.";
  const off = attack(board(text, { name: 'Primeape', damage: '150' }));
  assertFizzled(off);

  // A Confused attacker flips first: find a seed that gets past the Confusion fizzle.
  const confused = { name: 'Primeape', damage: '150', setup: ({ attacker }) => { attacker.specialCondition = 'Confused'; } };
  let on = null;
  for (let seed = 1; seed <= 40 && !on; seed++) {
    const res = attack(board(text, { ...confused, seed }));
    if (!res.events.some((e) => e.type === 'attackConfusedFizzle')) on = res;
  }
  assert.ok(on, 'a seed passes the Confusion check');
  assert.equal(damageOn(on), 150);
});

test('Vikavolt Giga Railgun: nothing without the named Energy attached', () => {
  const text = 'If this Pokémon has no Voltaic {L} Energy attached, this attack does nothing.';
  const off = attack(
    board(text, {
      name: 'Vikavolt',
      damage: '260',
      setup: ({ p1, attacker }) => {
        const e = energy('Lightning');
        e.attachedTo = attacker.instanceId;
        p1.zones.active.push(e);
      },
    })
  );
  assertFizzled(off);

  const on = attack(
    board(text, {
      name: 'Vikavolt',
      damage: '260',
      setup: ({ p1, attacker }) => {
        const e = namedEnergy('Voltaic Energy');
        e.attachedTo = attacker.instanceId;
        p1.zones.active.push(e);
      },
    })
  );
  assert.equal(damageOn(on), 260);
});

test('Victini V-Force: nothing with 4 or fewer Benched Pokémon', () => {
  const text = 'If you have 4 or fewer Benched Pokémon, this attack does nothing.';
  const off = attack(
    board(text, {
      name: 'Victini',
      damage: '120',
      setup: ({ p1 }) => {
        for (let i = 0; i < 3; i++) p1.zones.bench.push(mon(`Bench ${i}`));
      },
    })
  );
  assertFizzled(off);

  const on = attack(
    board(text, {
      name: 'Victini',
      damage: '120',
      setup: ({ p1 }) => {
        for (let i = 0; i < 5; i++) p1.zones.bench.push(mon(`Bench ${i}`));
      },
    })
  );
  assert.equal(damageOn(on), 120);
});

test('Palafin Justice Kick: nothing unless it moved to the Active Spot this turn', () => {
  const text =
    "If this Pokémon didn't move from the Bench to the Active Spot this turn, this attack does nothing.";
  const off = attack(board(text, { name: 'Palafin', damage: '210' }));
  assertFizzled(off);

  const on = attack(
    board(text, {
      name: 'Palafin',
      damage: '210',
      setup: ({ state, attacker }) => {
        attacker.movedToActiveTurn = state.turn.number;
      },
    })
  );
  assert.equal(damageOn(on), 210);
});

test('Eternatus World Ender: nothing without a Stadium; with one it discards it and hits', () => {
  const text = "Discard a Stadium in play. If you can't, this attack does nothing.";
  const off = attack(board(text, { name: 'Eternatus', damage: '230' }));
  assertFizzled(off);

  const stadium = createCard({ instanceId: 901, name: 'Stadium', supertype: 'Trainer', type: 'Stadium' });
  const on = attack(
    board(text, {
      name: 'Eternatus',
      damage: '230',
      setup: ({ state }) => {
        state.stadium = stadium;
      },
    })
  );
  assert.equal(damageOn(on), 230);
  assert.equal(on.state.stadium, null, 'the Stadium is discarded');
});

test('Iron Boulder Adjusted Horn: nothing unless both hands match', () => {
  const text =
    "If you don't have the same number of cards in your hand as your opponent, this attack does nothing.";
  const off = attack(
    board(text, {
      name: 'Iron Boulder',
      damage: '170',
      setup: ({ p1, p2 }) => {
        p1.zones.hand.push(trainer('mine'));
        p2.zones.hand.push(trainer('a'), trainer('b'));
      },
    })
  );
  assertFizzled(off);

  const on = attack(
    board(text, {
      name: 'Iron Boulder',
      damage: '170',
      setup: ({ p1, p2 }) => {
        p1.zones.hand.push(trainer('mine'));
        p2.zones.hand.push(trainer('theirs'));
      },
    })
  );
  assert.equal(damageOn(on), 170);
});

test('a failed GX attack spends the once-per-game GX attack', () => {
  const text = 'If there is no Stadium in play, this attack does nothing.';
  const res = attack(board(text, { name: 'Test', attackName: 'Test-GX', damage: '100' }));
  assertFizzled(res);
  assert.equal(res.state.players.p1.oncePerGame.gxUsed, true);
  assert.ok(res.events.find((e) => e.type === 'gxAttackUsed'));
});

test('an effect-only attack with no defender is not gated', () => {
  const text = "If your opponent's Active Pokémon isn't Confused, this attack does nothing.";
  const res = attack(
    board(text, {
      name: 'Malamar',
      damage: '130',
      setup: ({ p2 }) => {
        p2.zones.active = [];
      },
    })
  );
  assert.equal(failed(res), undefined);
  assert.ok(executed(res), 'the attack still resolves');
});

test('the gate is not re-evaluated when a before-damage step resumes', () => {
  const text =
    "Discard 2 Energy cards from your hand and choose 1 of your opponent's Pokémon. If you don't have exactly 7 cards in your hand, this attack does nothing.";
  const b = board(text, {
    name: 'Raichu',
    damage: '80',
    setup: ({ p1 }) => {
      for (let i = 0; i < 4; i++) p1.zones.hand.push(trainer(`hand ${i}`));
      p1.zones.hand.push(energy('Fire'), energy('Fire'), energy('Fire'));
    },
  });
  const first = attack(b);
  assert.ok(first.state.pendingChoice, 'the hand discard asks which Energy');
  const selection = first.state.pendingChoice.options.slice(0, 2).map((o) => o.instanceId);
  const res = applyCommand(
    first.state,
    { type: 'resolveChoice', playerId: 'p1', payload: { choiceId: first.state.pendingChoice.choiceId, selection } },
    b.rng
  );
  assert.equal(res.error, null);
  // The hand is now 5, not 7: re-reading the gate would fizzle the attack.
  assert.equal(res.state.players.p1.zones.hand.length, 5);
  assert.ok(executed(res), 'the attack resumes past the gate');
  assert.equal(failed(res), undefined);
  assert.equal(damageOn(res), 80);
});

test('a passing condition still runs the attack\'s steps and effects', () => {
  const text =
    "If you don't have exactly 7 cards in your hand, this attack does nothing. Draw 2 cards.";
  const res = attack(
    board(text, {
      name: 'Medicham',
      damage: '150',
      setup: ({ p1 }) => {
        for (let i = 0; i < 7; i++) p1.zones.hand.push(trainer(`hand ${i}`));
      },
    })
  );
  assert.equal(damageOn(res), 150);
  assert.equal(res.state.players.p1.zones.hand.length, 9, 'the draw step ran');
});
