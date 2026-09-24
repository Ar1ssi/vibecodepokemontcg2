// Design 036 A5: discard-to-scale "… or …" groups (Rayquaza Dragon Burst / Rayquaza V and
// VMAX) and the lone "Discard all {X} Energy attached to …" / "times the number of Energy
// you discarded" prints (Pikachu-EX Overspark, Hydreigon Dark Burn) on the authoritative path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { discardEnergyScaling } from '../rules/damage-parser.mjs';

const pokemon = (props) => createCard({ supertype: 'Pokémon', type: 'Pokémon', ...props });
const FIRE = ['Basic Fire Energy', ['Fire']];
const LIGHTNING = ['Basic Lightning Energy', ['Lightning']];
const WATER = ['Basic Water Energy', ['Water']];
const DARK = ['Basic Darkness Energy', ['Darkness']];
const energy = (instanceId, attachedTo, [name, types]) =>
  createCard({ instanceId, name, supertype: 'Energy', type: 'Energy', subtypes: ['Basic'], types, attachedTo });

const DRAGON_BURST_EX = {
  name: 'Dragon Burst',
  cost: [],
  damage: 60,
  text: 'Discard all basic {R} Energy or all basic {L} Energy attached to this Pokémon. This attack does 60 damage times the number of Energy you discarded.',
};
const DRAGON_BURST_OLD = {
  name: 'Dragon Burst',
  cost: [],
  damage: 40,
  text: 'Discard either all {R} Energy or all {L} Energy attached to Rayquaza ex. This attack does 40 damage times the amount of {R} or {L} Energy discarded.',
};
const RAYQUAZA_V = {
  name: 'Dragon Pulse',
  cost: [],
  damage: '20+',
  text: 'You may discard up to 2 basic {R} Energy or up to 2 basic {L} Energy from this Pokémon. This attack does 80 more damage for each card you discarded in this way.',
};
const RAYQUAZA_VMAX = {
  name: 'Max Burst',
  cost: [],
  damage: '20+',
  text: 'You may discard any amount of basic {R} Energy or any amount of basic {L} Energy from this Pokémon. This attack does 80 more damage for each card you discarded in this way.',
};
const OVERSPARK = {
  name: 'Overspark',
  cost: [],
  damage: 50,
  text: 'Discard all {L} Energy attached to this Pokémon. This attack does 50 damage times the number of Energy cards you discarded.',
};
const DARK_BURN = {
  name: 'Dark Burn',
  cost: [],
  damage: 50,
  text: 'Discard as many {D} Energy attached to your Pokémon as you like. This attack does 50 damage times the amount of {D} Energy you discarded in this way.',
};
const SALAMENCE = 'Discard 2 basic {R} Energy cards or 2 basic {W} Energy cards attached to Salamence. If you discarded 2 basic {R} Energy cards, this attack does 100 damage to the Defending Pokémon. If you discarded 2 Basic {W} Energy cards, this attack does 100 damage to 1 of your opponent\'s Benched Pokémon.';

function board({ attack, attached, bench = [] }) {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  state.players.p1.zones.active.push(
    pokemon({ instanceId: 1, name: 'Rayquaza', hp: 400, attacks: [attack] }),
    ...attached.map(([id, kind]) => energy(id, 1, kind))
  );
  if (bench.length) {
    state.players.p1.zones.bench.push(
      pokemon({ instanceId: 10, name: 'Deino', hp: 60 }),
      ...bench.map(([id, kind]) => energy(id, 10, kind))
    );
  }
  state.players.p2.zones.active.push(pokemon({ instanceId: 20, name: 'Defender', hp: 900 }));
  state.players.p2.zones.bench.push(pokemon({ instanceId: 21, name: 'Opp Bench', hp: 60 }));
  for (const playerId of ['p1', 'p2']) {
    const offset = playerId === 'p1' ? 0 : 50;
    for (let i = 0; i < 6; i += 1) {
      state.players[playerId].zones.prizes.push(createCard({ instanceId: 1000 + offset + i, name: 'Prize' }));
      // A deck so the turn hand-off draw does not end the game by deck-out.
      state.players[playerId].zones.deck.push(createCard({ instanceId: 2000 + offset + i, name: 'Deck Card' }));
    }
  }
  return state;
}

const attack = (state) => applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
const choose = (state, selection) =>
  applyCommand(state, {
    type: 'resolveChoice',
    payload: { choiceId: state.pendingChoice.choiceId, selection },
    playerId: 'p1',
  });
const defenderDamage = (state) => state.players.p2.zones.active.find((c) => c.instanceId === 20)?.damage || 0;
const discardIds = (state) => state.players.p1.zones.discard.map((c) => c.instanceId).sort((a, b) => a - b);

test('parser: "… or …" wordings return one group per printed type', () => {
  const burst = discardEnergyScaling(DRAGON_BURST_EX.text);
  assert.equal(burst.source, 'self');
  assert.deepEqual(burst.groups, [
    { energyType: 'Fire', basicOnly: true, max: Infinity, all: true },
    { energyType: 'Lightning', basicOnly: true, max: Infinity, all: true },
  ]);
  const old = discardEnergyScaling(DRAGON_BURST_OLD.text);
  assert.equal(old.source, 'self', '"attached to Rayquaza ex" is the attacker');
  assert.deepEqual(old.groups.map((g) => [g.energyType, g.basicOnly, g.all]), [
    ['Fire', false, true],
    ['Lightning', false, true],
  ]);
  assert.deepEqual(discardEnergyScaling(RAYQUAZA_V.text).groups.map((g) => g.max), [2, 2]);
  assert.deepEqual(discardEnergyScaling(RAYQUAZA_VMAX.text).groups.map((g) => g.max), [Infinity, Infinity]);
});

test('parser: lone "Discard all" and "times the number … discarded" prints now scale', () => {
  assert.deepEqual(discardEnergyScaling(OVERSPARK.text), {
    max: Infinity,
    source: 'self',
    energyType: 'Lightning',
    basicOnly: false,
    all: true,
  });
  assert.deepEqual(discardEnergyScaling(DARK_BURN.text), {
    max: Infinity,
    source: 'all',
    energyType: 'Darkness',
    basicOnly: false,
  });
});

test('parser: Salamence (branching effects, no scaling) and deck mills stay unparsed', () => {
  assert.equal(discardEnergyScaling(SALAMENCE), null);
  assert.equal(
    discardEnergyScaling('Discard the top 5 cards of your deck. This attack does 80 damage times the number of Energy cards you discarded.'),
    null
  );
});

test('Dragon Burst with both types attached asks which type, then discards all of it', () => {
  const pending = attack(board({ attack: DRAGON_BURST_EX, attached: [[2, FIRE], [3, FIRE], [4, LIGHTNING], [5, WATER]] }));
  assert.ok(!pending.error, pending.error);
  const choice = pending.state.pendingChoice;
  assert.ok(choice, 'expected a type choice');
  assert.equal(choice.options.length, 2);
  assert.equal(choice.min, 1);
  assert.equal(choice.max, 1);
  assert.equal(defenderDamage(pending.state), 0, 'no damage before the choice');

  const res = choose(pending.state, [1]);
  assert.ok(!res.error, res.error);
  assert.deepEqual(discardIds(res.state), [2, 3], 'every basic Fire Energy, nothing else');
  assert.equal(defenderDamage(res.state), 120);
  assert.equal(res.state.turn.player, 'p2', 'turn ends after the attack');
});

test('Dragon Burst picking the other type discards only that group', () => {
  const pending = attack(board({ attack: DRAGON_BURST_EX, attached: [[2, FIRE], [3, FIRE], [4, LIGHTNING], [5, WATER]] }));
  const res = choose(pending.state, [2]);
  assert.ok(!res.error, res.error);
  assert.deepEqual(discardIds(res.state), [4]);
  assert.equal(defenderDamage(res.state), 60);
});

test('Dragon Burst with only one type attached discards that group without asking (edge 17)', () => {
  const res = attack(board({ attack: DRAGON_BURST_EX, attached: [[4, LIGHTNING], [6, LIGHTNING], [5, WATER]] }));
  assert.ok(!res.error, res.error);
  assert.equal(res.state.pendingChoice, null);
  assert.deepEqual(discardIds(res.state), [4, 6]);
  assert.equal(defenderDamage(res.state), 120);
});

test('Dragon Burst with neither type attached deals 0 and discards nothing', () => {
  const res = attack(board({ attack: DRAGON_BURST_OLD, attached: [[5, WATER]] }));
  assert.ok(!res.error, res.error);
  assert.equal(res.state.pendingChoice, null);
  assert.deepEqual(discardIds(res.state), []);
  assert.equal(defenderDamage(res.state), 0);
});

test('Rayquaza V discards from one group only, capped at that group\'s "up to 2"', () => {
  const pending = attack(board({ attack: RAYQUAZA_V, attached: [[2, FIRE], [3, FIRE], [7, FIRE], [4, LIGHTNING]] }));
  assert.ok(!pending.error, pending.error);
  const choice = pending.state.pendingChoice;
  assert.deepEqual(choice.options.map((o) => o.instanceId).sort((a, b) => a - b), [2, 3, 4, 7]);
  assert.equal(choice.min, 0);
  assert.equal(choice.max, 2);

  // The first chosen card fixes the group; the Fire Energy picked after it is ignored.
  const mixed = choose(pending.state, [4, 2]);
  assert.ok(!mixed.error, mixed.error);
  assert.deepEqual(discardIds(mixed.state), [4]);
  assert.equal(defenderDamage(mixed.state), 100);

  const fire = choose(pending.state, [2, 3]);
  assert.deepEqual(discardIds(fire.state), [2, 3]);
  assert.equal(defenderDamage(fire.state), 180);
});

test('Rayquaza VMAX may discard nothing and deals the printed 20', () => {
  const pending = attack(board({ attack: RAYQUAZA_VMAX, attached: [[2, FIRE], [4, LIGHTNING]] }));
  const res = choose(pending.state, []);
  assert.ok(!res.error, res.error);
  assert.deepEqual(discardIds(res.state), []);
  assert.equal(defenderDamage(res.state), 20);
});

test('Overspark discards every {L} Energy without asking and counts only those', () => {
  const res = attack(board({ attack: OVERSPARK, attached: [[4, LIGHTNING], [6, LIGHTNING], [5, WATER]] }));
  assert.ok(!res.error, res.error);
  assert.equal(res.state.pendingChoice, null);
  assert.deepEqual(discardIds(res.state), [4, 6]);
  assert.equal(defenderDamage(res.state), 100, '50 × 2, not × every attached Energy');
});

test('Dark Burn offers {D} Energy from all of your Pokémon and scales with the chosen count', () => {
  const pending = attack(board({ attack: DARK_BURN, attached: [[2, DARK], [5, WATER]], bench: [[11, DARK]] }));
  assert.ok(!pending.error, pending.error);
  assert.deepEqual(pending.state.pendingChoice.options.map((o) => o.instanceId).sort((a, b) => a - b), [2, 11]);
  const res = choose(pending.state, [11]);
  assert.deepEqual(discardIds(res.state), [11]);
  assert.equal(defenderDamage(res.state), 50);
});
