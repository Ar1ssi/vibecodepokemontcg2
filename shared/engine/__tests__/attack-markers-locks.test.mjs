// Design 036 A8b: next-turn base-damage overrides, Energy attach and evolve locks on the
// Defending Pokémon, and Special Condition immunity on the attacker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAttackSteps } from '../rules/attack-steps.mjs';
import { computeAttackDamage } from '../rules/attack-engine.mjs';
import { listConditions } from '../rules/special-conditions.mjs';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand, validateLegality } from '../reduce.mjs';

const markerOf = (text, selfName) => {
  const steps = [...parseAttackSteps(text, { selfName }).after].filter((s) => s.type === 'atkAddMarker');
  return steps.length === 1 ? { target: steps[0].target, window: steps[0].window, ...steps[0].marker } : null;
};

test('parser: next-turn base damage wordings', () => {
  const base = (attackName, value) => ({
    target: 'self',
    window: 'yourNextTurn',
    kind: 'nextTurnBaseDamage',
    attackName,
    value,
  });
  assert.deepEqual(
    markerOf("During your next turn, Scyther's Slash attack's base damage is 60 instead of 30.", 'Scyther'),
    base('slash', 60)
  );
  assert.deepEqual(
    markerOf("During your next turn, this Pokémon's Psycho Boost's base damage is 50.", 'Deoxys'),
    base('psycho boost', 50)
  );
  assert.deepEqual(
    markerOf("During your next turn, Farfetch'd's Leek Slap attack's base damage is 60.", "Farfetch'd"),
    base('leek slap', 60)
  );
  assert.deepEqual(
    markerOf("During your next turn, Hustle Punch attack's base damage is 50 instead of 70.", 'Breloom'),
    base('hustle punch', 50)
  );
  assert.deepEqual(
    markerOf("During your next turn, base damage of Swellow's Agility is 70 instead of 30.", 'Swellow'),
    base('agility', 70)
  );
  assert.deepEqual(
    markerOf("During your next turn, this Pokémon's Sharpshooting attack does 120 damage instead of 40.", 'Clawitzer'),
    base('sharpshooting', 120)
  );
  assert.deepEqual(
    markerOf("During your next turn, Rocket's Scizor's Agility attack's damage is doubled.", "Rocket's Scizor"),
    { target: 'self', window: 'yourNextTurn', kind: 'nextTurnBaseDamage', attackName: 'agility', doubled: true }
  );
  // A base-damage sentence without "during your next turn" is not a marker.
  assert.equal(markerOf("If your opponent's Active Pokémon has damage counters on it, this attack's base damage is 30.", 'Mawile'), null);
});

test('parser: attach lock, evolve lock and Special Condition immunity', () => {
  const lock = { target: 'opponentActive', window: 'opponentNextTurn', kind: 'attachLock' };
  assert.deepEqual(
    markerOf(
      'Your opponent can\'t attach Energy from his or her hand to the Defending Pokémon during his or her next turn.',
      'Palkia'
    ),
    lock
  );
  assert.deepEqual(
    markerOf(
      "During your opponent's next turn, Energy cards can't be attached from your opponent's hand to the Defending Pokémon.",
      'Dracozolt V'
    ),
    lock
  );
  assert.deepEqual(
    markerOf(
      'Flip a coin. If heads, your opponent can\'t attach Energy cards from his or her hand to his or her Active Pokémon during his or her next turn.',
      'Dewgong'
    ),
    lock
  );
  assert.deepEqual(
    markerOf(
      "During your opponent's next turn, the Defending Pokémon can't evolve except from effects of attacks or Pokémon Powers. (Benching that Pokémon ends this effect.)",
      'Dark Omastar'
    ),
    { target: 'opponentActive', window: 'opponentNextTurn', kind: 'evolveLock' }
  );
  assert.deepEqual(
    markerOf("During your opponent's next turn, this Pokémon can't be affected by any Special Conditions.", 'Goodra'),
    { target: 'self', window: 'opponentNextTurn', kind: 'statusImmunity', conditions: null }
  );
  assert.deepEqual(
    markerOf(
      "During your opponent's next turn, Bayleef can't become Asleep, Confused, Paralyzed, or Poisoned. (All other effects of attacks, Pokémon Powers and Trainer cards still happen.)",
      'Bayleef'
    ),
    {
      target: 'self',
      window: 'opponentNextTurn',
      kind: 'statusImmunity',
      conditions: ['Asleep', 'Confused', 'Paralyzed', 'Poisoned'],
    }
  );
});

// ── damage ───────────────────────────────────────────────────────────────────

const attacker = { instanceId: 10, types: ['Colorless'] };
const defender = { instanceId: 20 };
const baseMarker = (attackName, extra) => [{ kind: 'nextTurnBaseDamage', attackName, ...extra }];
const hit = (attack, options) => computeAttackDamage(attacker, defender, attack, options).total;

test('computeAttackDamage: nextTurnBaseDamage swaps only the printed base of the named attack', () => {
  const markers = baseMarker('rollout', { value: 40 });
  assert.equal(hit({ name: 'Rollout', damage: '10' }, { attackerMarkers: markers }), 40);
  assert.equal(hit({ name: 'Tackle', damage: '10' }, { attackerMarkers: markers }), 10);
  // "30+": the extra 20 the effect added stays on top of the new base.
  assert.equal(
    hit({ name: 'Slash', damage: '30+' }, { baseDamage: 50, attackerMarkers: baseMarker('slash', { value: 60 }) }),
    80
  );
  // "10×" with 3 heads: 3 × the new base.
  assert.equal(
    hit({ name: 'Fury', damage: '10×' }, { baseDamage: 30, attackerMarkers: baseMarker('fury', { value: 40 }) }),
    120
  );
  // An effect that already zeroed the damage (tails) is not revived.
  assert.equal(hit({ name: 'Rollout', damage: '10' }, { baseDamage: 0, attackerMarkers: markers }), 0);
  assert.equal(hit({ name: 'Agility', damage: '30' }, { attackerMarkers: baseMarker('agility', { doubled: true }) }), 60);
  // "Quick Attack's base damage": the parser drops the trailing "attack".
  assert.equal(hit({ name: 'Quick Attack', damage: '10' }, { attackerMarkers: baseMarker('quick', { doubled: true }) }), 20);
});

// ── game flow ────────────────────────────────────────────────────────────────

const pokemon = (props) => createCard({ supertype: 'Pokémon', type: 'Pokémon', ...props });
const basicEnergy = (instanceId) =>
  createCard({ instanceId, name: 'Basic Grass Energy', supertype: 'Energy', type: 'Energy', subtypes: ['Basic'], types: ['Grass'] });
const specialEnergy = (instanceId) =>
  createCard({ instanceId, name: 'Double Colorless Energy', supertype: 'Energy', type: 'Energy', subtypes: ['Special'] });

function board({ name, attacks, defenderAttacks = [] }) {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  state.players.p1.zones.active.push(pokemon({ instanceId: 1, name, hp: 200, types: ['Colorless'], attacks }));
  state.players.p2.zones.active.push(
    pokemon({ instanceId: 20, name: 'Defender', hp: 300, types: ['Colorless'], attacks: defenderAttacks, enteredPlayTurn: 1 })
  );
  state.players.p2.zones.bench.push(pokemon({ instanceId: 21, name: 'Bench Mon', hp: 60, enteredPlayTurn: 1 }));
  state.players.p2.zones.hand.push(
    basicEnergy(40),
    specialEnergy(41),
    pokemon({ instanceId: 42, name: 'Evolved Defender', stage: 'Stage 1', subtypes: ['Stage 1'], evolvesFrom: 'Defender', hp: 150 })
  );
  for (const playerId of ['p1', 'p2']) {
    const offset = playerId === 'p1' ? 0 : 50;
    for (let i = 0; i < 6; i += 1) {
      state.players[playerId].zones.prizes.push(createCard({ instanceId: 1000 + offset + i, name: 'Prize' }));
      state.players[playerId].zones.deck.push(createCard({ instanceId: 2000 + offset + i, name: 'Deck Card' }));
    }
  }
  return state;
}

const attack = (state, playerId, attackIndex = 0) => {
  const res = applyCommand(state, { type: 'attack', payload: { attackIndex }, playerId }, createRng(5));
  assert.ok(!res.error, res.error);
  return res.state;
};
const attachFromHand = (state, instanceId, targetInstanceId) =>
  validateLegality(state, { type: 'attachCard', payload: { instanceId, targetInstanceId }, playerId: 'p2' });

test('Swords Dance: Slash does its new base damage on your next turn', () => {
  let state = attack(
    board({
      name: 'Scyther',
      attacks: [
        { name: 'Swords Dance', cost: [], damage: '', text: "During your next turn, Scyther's Slash attack's base damage is 60 instead of 30." },
        { name: 'Slash', cost: [], damage: '30', text: '' },
      ],
    }),
    'p1'
  );
  // Skip the opponent's turn: the marker window is the attacker's next turn (turn 4).
  state.turn = { player: 'p1', number: 4, phase: 'main' };
  state.players.p1.flags = {};
  state = attack(state, 'p1', 1);
  assert.equal(state.players.p2.zones.active.find((c) => c.instanceId === 20).damage, 60);
});

test('Cross Slicer: no Energy from the hand onto the Defending Pokémon, the Bench is free', () => {
  const state = attack(
    board({
      name: 'Palkia',
      attacks: [
        {
          name: 'Cross Slicer',
          cost: [],
          damage: '10',
          text: "Your opponent can't attach Energy from his or her hand to the Defending Pokémon during his or her next turn.",
        },
      ],
    }),
    'p1'
  );
  assert.equal(state.turn.player, 'p2');
  assert.equal(attachFromHand(state, 40, 20).allowed, false);
  assert.equal(attachFromHand(state, 40, 21).allowed, true);
});

test('Bind-style special-only lock lets Basic Energy through', () => {
  const state = attack(
    board({
      name: 'Azelf',
      attacks: [
        {
          name: 'Lock',
          cost: [],
          damage: '',
          text: "Your opponent can't attach Special Energy cards from his or her hand to the Defending Pokémon during his or her next turn.",
        },
      ],
    }),
    'p1'
  );
  assert.equal(attachFromHand(state, 41, 20).allowed, false);
  assert.equal(attachFromHand(state, 40, 20).allowed, true);
});

test('Dark Tentacle: the Defending Pokémon cannot evolve from the hand', () => {
  const text =
    "During your opponent's next turn, the Defending Pokémon can't evolve except from effects of attacks or Pokémon Powers.";
  const locked = attack(board({ name: 'Dark Omastar', attacks: [{ name: 'Dark Tentacle', cost: [], damage: '', text }] }), 'p1');
  const res = attachFromHand(locked, 42, 20);
  assert.equal(res.allowed, false);
  assert.match(res.reason, /evolving/);

  const free = attack(board({ name: 'Dark Omastar', attacks: [{ name: 'Tackle', cost: [], damage: '', text: '' }] }), 'p1');
  assert.equal(attachFromHand(free, 42, 20).allowed, true, attachFromHand(free, 42, 20).reason);
});

test('Pollen Shield: the listed Special Conditions do not land during the opponent\'s turn', () => {
  const state = attack(
    board({
      name: 'Bayleef',
      attacks: [
        {
          name: 'Pollen Shield',
          cost: [],
          damage: '',
          text: "During your opponent's next turn, Bayleef can't become Asleep, Confused, Paralyzed, or Poisoned.",
        },
      ],
      defenderAttacks: [
        { name: 'Poison Burn', cost: [], damage: '', text: "Your opponent's Active Pokémon is now Burned and Poisoned." },
      ],
    }),
    'p1'
  );
  const after = attack(state, 'p2');
  const bayleef = after.players.p1.zones.active.find((c) => c.instanceId === 1);
  assert.deepEqual(listConditions(bayleef), ['Burned']);
});
