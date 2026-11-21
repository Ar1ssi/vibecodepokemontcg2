// SM-LOT audit: Sun & Moon through Lost Thunder Abilities that did nothing in play. Every text is
// the TCGdex card the game loads (id named per case); each runs through the reducer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', subtypes: ['Basic'], hp: 200, types: ['Colorless'], ...extra });
const energy = (type, attachedTo) =>
  createCard({ instanceId: nextId++, name: `Basic ${type} Energy`, supertype: 'Energy', subtypes: ['Basic'], energyType: type, attachedTo });
const ability = (text, name = 'Ability') => ({ abilities: [{ name, type: 'Ability', text }] });

function board(turn = 5) {
  nextId = 1;
  const state = createGameState({ gameId: 'sm-lot-abilities', seed: 3, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 8; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: turn, phase: 'main' };
  return state;
}
const command = (state, playerId, type, payload) => applyCommand(state, { type, playerId, payload }, createRng(3));

/** p1's Active (1 Colorless Retreat Cost, no Energy) retreating after `setup`. */
function retreats(setup, turn = 5) {
  const state = board(turn);
  const active = mon('Holder', { retreatCost: ['Colorless'] });
  const bench = mon('Bench');
  state.players.p1.zones.active.push(active);
  state.players.p1.zones.bench.push(bench);
  state.players.p2.zones.active.push(mon('Opponent'));
  setup(state, active);
  return !command(state, 'p1', 'retreat', { benchInstanceId: bench.instanceId, discardEnergyIds: [] }).error;
}

/** Damage p1's 10-damage attack deals to p2's Active after `setup`. */
function dealt(setup, damage = '10') {
  const state = board();
  const attacker = mon('Attacker', { attacks: [{ name: 'Hit', cost: [], damage, text: '' }] });
  const defender = mon('Defender', { hp: 500 });
  state.players.p1.zones.active.push(attacker);
  state.players.p2.zones.active.push(defender);
  setup(state, attacker, defender);
  const res = command(state, 'p1', 'attack', { attackIndex: 0 });
  assert.equal(res.error ?? null, null, res.reason);
  return res.events.find((e) => e.type === 'attackExecuted')?.damage;
}

/** Whether p1 (1 Fire Energy, a {C} attack) is refused its attack after `setup`. */
function attackRefused(setup) {
  const state = board();
  const attacker = mon('Attacker', { attacks: [{ name: 'Hit', cost: ['Colorless'], damage: '10', text: '' }] });
  state.players.p1.zones.active.push(attacker, energy('Fire', attacker.instanceId));
  state.players.p2.zones.active.push(mon('Defender'));
  setup(state, attacker);
  return Boolean(command(state, 'p1', 'attack', { attackIndex: 0 }).error);
}

const weakTo = (defender, type) => {
  defender.weakness = { type, value: 2 };
  defender.weaknesses = [{ type, value: '×2' }];
};

test('a 1-Colorless Retreat Cost is not free without an Ability (control)', () => {
  assert.equal(retreats(() => {}), false);
});

test('Wimpod Wimp Out (sm3-16): no Retreat Cost during its first turn only', () => {
  const wimpOut = (state, active) => Object.assign(active, ability('During your first turn, this Pokémon has no Retreat Cost.'));
  assert.equal(retreats(wimpOut, 2), true);
  assert.equal(retreats(wimpOut, 4), false);
});

test('Weakness readers: Earthen Aura (sm6-71), Weather Guard (sm5-11), Full Metal Body (sm7-99)', () => {
  const fightingIntoWeakness = (state, attacker, defender) => {
    attacker.types = ['Fighting'];
    weakTo(defender, 'Fighting');
  };
  assert.equal(dealt(fightingIntoWeakness), 20, 'control: Weakness doubles');
  assert.equal(
    dealt((state, attacker, defender) => {
      fightingIntoWeakness(state, attacker, defender);
      Object.assign(attacker, ability('Damage from this Pokémon’s attacks isn’t affected by Weakness or Resistance.'));
    }),
    10
  );
  assert.equal(
    dealt((state, attacker, defender) => {
      fightingIntoWeakness(state, attacker, defender);
      defender.types = ['Grass'];
      state.players.p2.zones.bench.push(mon('Cherrim', ability('Your Grass Pokémon have no Weakness.')));
    }),
    10
  );
  const metal = (withEnergy) => (state, attacker, defender) => {
    fightingIntoWeakness(state, attacker, defender);
    Object.assign(defender, ability('If this Pokémon has any Metal Energy attached to it, it has no Weakness.'));
    if (withEnergy) state.players.p2.zones.active.push(energy('Metal', defender.instanceId));
  };
  assert.equal(dealt(metal(true)), 10);
  assert.equal(dealt(metal(false)), 20);
});

test('Mesprit Silent Waves (sm6-42): no Resistance while Azelf is in play', () => {
  const resisted = (withAzelf) => (state, attacker, defender) => {
    attacker.types = ['Fire'];
    defender.resistance = { type: 'Fire', value: -20 };
    defender.resistances = [{ type: 'Fire', value: '-20' }];
    state.players.p1.zones.bench.push(mon('Mesprit', ability('If you have Azelf in play, your opponent’s Pokémon in play have no Resistance.')));
    if (withAzelf) state.players.p1.zones.bench.push(mon('Azelf'));
  };
  assert.equal(dealt(resisted(true), '40'), 40);
  assert.equal(dealt(resisted(false), '40'), 20);
});

test('Damage reduction: Stakataka-GX Ultra Wall (sm7-102), Shelgon Energy Guard (sm7.5-43)', () => {
  const wall = (ultraBeast) => (state, attacker, defender) => {
    if (ultraBeast) defender.subtypes = ['Basic', 'Ultra Beast'];
    state.players.p2.zones.bench.push(
      mon('Stakataka GX', ability('Your Ultra Beasts take 10 less damage from your opponent’s attacks (after applying Weakness and Resistance).'))
    );
  };
  assert.equal(dealt(wall(true)), 0);
  assert.equal(dealt(wall(false)), 10);
  const guard = (attached) => (state, attacker, defender) => {
    Object.assign(defender, ability('If this Pokémon has any basic Energy attached to it, it takes 20 less damage from attacks (after applying Weakness and Resistance).'));
    if (attached) state.players.p2.zones.active.push(energy('Fire', defender.instanceId));
  };
  assert.equal(dealt(guard(true), '30'), 10);
  assert.equal(dealt(guard(false), '30'), 30);
});

test('Damage bonuses: Passimian Power Huddle (sm5-70), Charizard Resolute Flame (sm7.5-3)', () => {
  const huddle = (state, attacker, defender) => {
    attacker.name = 'Passimian';
    defender.stage = 'Stage 1';
    defender.subtypes = ['Stage 1'];
    state.players.p1.zones.bench.push(
      mon(
        'Passimian',
        ability(
          'As long as this Pokémon is on your Bench, your Passimian’s attacks do 30 more damage to your opponent’s Active Evolution Pokémon (before applying Weakness and Resistance).'
        )
      )
    );
  };
  assert.equal(dealt(huddle), 40);
  const flame = (state, attacker) => {
    Object.assign(attacker, ability('This Pokémon’s attacks do 30 more damage to your opponent’s Active Pokémon for each of their Pokémon-GX and Pokémon-EX in play.'));
    state.players.p2.zones.bench.push(mon('Tapu Koko GX', { subtypes: ['Basic', 'GX'] }), mon('Lucario-EX', { subtypes: ['Basic', 'EX'] }), mon('Plain'));
  };
  assert.equal(dealt(flame), 70);
});

test('Attack gates: Sticky Membrane (sm6-91), Disgusting Pollen (sm3-6), Seal of Antiquity (sm4-84)', () => {
  assert.equal(attackRefused(() => {}), false, 'control');
  const activeHolder = (text) => (state) => state.players.p2.zones.active.splice(0, 1, mon('Holder', ability(text)));
  assert.equal(attackRefused(activeHolder('As long as this Pokémon is your Active Pokémon, your opponent’s Pokémon’s attacks cost Colorless more.')), true);
  assert.equal(attackRefused(activeHolder('As long as this Pokémon is your Active Pokémon, your opponent’s Basic Pokémon can’t attack.')), true);
  const seal = (benched) => (state, attacker) => {
    Object.assign(attacker, ability('This Pokémon can’t attack unless Regirock, Regice, and Registeel are on your Bench.'), { name: 'Regigigas' });
    state.players.p1.zones.bench.push(...benched.map((name) => mon(name)));
  };
  assert.equal(attackRefused(seal(['Regirock', 'Regice'])), true);
  assert.equal(attackRefused(seal(['Regirock', 'Regice', 'Registeel'])), false);
});
