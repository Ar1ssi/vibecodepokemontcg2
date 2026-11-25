// Kyogre ex Drizzle (custom set customhb 546, client/src/assets/custom-sets/customhb/set.json,
// verbatim): "As long as this Pokémon is in play, Pokémon that have {W} or {L} Energy attached to
// them do 20 more damage with their attacks. Pokémon that have a {R} Weakness have no Weakness."
// Fighting Fury Belt (customhb 234) and Full Metal Lab (customhb 159) texts are verbatim set.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

const DRIZZLE =
  'As long as this Pokémon is in play, Pokémon that have {W} or {L} Energy attached to them do 20 more damage with their attacks. Pokémon that have a {R} Weakness have no Weakness.';
const FIGHTING_FURY_BELT =
  "The Basic Pokémon this card is attached to gets +40 HP and its attacks do 10 more damage to your opponent's Active Pokémon (before applying Weakness and Resistance).";
const FULL_METAL_LAB =
  "{M} Pokémon (both yours and your opponent's) take 10 less damage from attacks from the opponent's Pokémon (after applying Weakness and Resistance).";
const AIR_LOCK = 'As long as this Pokémon is in play, Pokémon with the Drizzle or Drought Ability have no Abilities.';

let nextId = 1000;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 300, types: ['Colorless'], ...extra });
const energy = (energyType, attachedTo) =>
  createCard({ instanceId: nextId++, name: `Basic ${energyType} Energy`, supertype: 'Energy', subtypes: ['Basic'], energyType, attachedTo });
const kyogre = () =>
  mon('Kyogre ex', { hp: 140, types: ['Water'], abilities: [{ name: 'Drizzle', type: 'Ability', text: DRIZZLE }] });
const hit = (damage) => [{ name: 'Hit', cost: [], damage: String(damage), text: '' }];

function game() {
  const state = createGameState({ gameId: 'drizzle', seed: 3, rulesEnabled: true });
  for (const playerId of ['p1', 'p2']) {
    state.players[playerId] = { playerId, username: playerId, zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
    for (let i = 0; i < 6; i++) state.players[playerId].zones.prizes.push(mon(`${playerId} prize ${i}`));
    for (let i = 0; i < 10; i++) {
      state.players[playerId].zones.deck.push(
        createCard({ instanceId: nextId++, name: `${playerId} deck ${i}`, supertype: 'Trainer', subtypes: ['Item'] })
      );
    }
  }
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  return state;
}

function attackDamage(state, defender) {
  const result = applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(3));
  assert.equal(result.error, null);
  const after = Object.values(result.state.players.p2.zones).flat().find((c) => c?.instanceId === defender.instanceId);
  return after.damage || 0;
}

function attackerWith(state, attacker, ...energyTypes) {
  state.players.p1.zones.active.push(attacker, ...energyTypes.map((type) => energy(type, attacker.instanceId)));
}

test('Drizzle: a {W}-Energy attacker does 20 more damage', () => {
  const state = game();
  attackerWith(state, mon('Attacker', { types: ['Water'], attacks: hit(30) }), 'Water');
  state.players.p1.zones.bench.push(kyogre());
  const defender = mon('Defender');
  state.players.p2.zones.active.push(defender);
  assert.equal(attackDamage(state, defender), 50);
});

test('Drizzle: {L} Energy qualifies too, and a Pokémon without {W}/{L} Energy gets nothing', () => {
  const lightning = game();
  attackerWith(lightning, mon('Attacker', { attacks: hit(30) }), 'Lightning');
  lightning.players.p1.zones.bench.push(kyogre());
  const d1 = mon('Defender');
  lightning.players.p2.zones.active.push(d1);
  assert.equal(attackDamage(lightning, d1), 50);

  const fire = game();
  attackerWith(fire, mon('Attacker', { attacks: hit(30) }), 'Fire');
  fire.players.p1.zones.bench.push(kyogre());
  const d2 = mon('Defender');
  fire.players.p2.zones.active.push(d2);
  assert.equal(attackDamage(fire, d2), 30);
});

test("Drizzle: the opponent's Kyogre ex boosts your {W} attacker as well", () => {
  const state = game();
  attackerWith(state, mon('Attacker', { attacks: hit(30) }), 'Water');
  const defender = mon('Defender');
  state.players.p2.zones.active.push(defender);
  state.players.p2.zones.bench.push(kyogre());
  assert.equal(attackDamage(state, defender), 50);
});

test('Drizzle: Rayquaza Air Lock switches the bonus off', () => {
  const state = game();
  attackerWith(state, mon('Attacker', { attacks: hit(30) }), 'Water');
  state.players.p1.zones.bench.push(kyogre());
  const defender = mon('Defender');
  state.players.p2.zones.active.push(defender);
  state.players.p2.zones.bench.push(mon('Rayquaza', { abilities: [{ name: 'Air Lock', type: 'Ability', text: AIR_LOCK }] }));
  assert.equal(attackDamage(state, defender), 30);
});

test('Drizzle: Pokémon with a {R} Weakness have no Weakness; other Weaknesses still apply', () => {
  const fireWeak = game();
  attackerWith(fireWeak, mon('Attacker', { types: ['Fire'], attacks: hit(30) }), 'Fire');
  fireWeak.players.p1.zones.bench.push(kyogre());
  const d1 = mon('Defender', { weakness: { type: 'Fire', value: 2 } });
  fireWeak.players.p2.zones.active.push(d1);
  assert.equal(attackDamage(fireWeak, d1), 30);

  const grassWeak = game();
  attackerWith(grassWeak, mon('Attacker', { types: ['Grass'], attacks: hit(30) }), 'Grass');
  grassWeak.players.p2.zones.bench.push(kyogre());
  const d2 = mon('Defender', { weakness: { type: 'Grass', value: 2 } });
  grassWeak.players.p2.zones.active.push(d2);
  assert.equal(attackDamage(grassWeak, d2), 60);
});

// The board from the reported game: Kyogre ex (Fighting Fury Belt, {W} Energy) hits a 140 HP
// Dialga ex under Full Metal Lab: 130 + 20 + 10 − 10 = 150, a Knock Out. Before the fix it dealt 130.
test('Drizzle + Fighting Fury Belt + Full Metal Lab: 150 damage Knocks Out a 140 HP {M} Pokémon', () => {
  const state = game();
  const attacker = kyogre();
  attacker.attacks = hit(130);
  attackerWith(state, attacker, 'Water');
  state.players.p1.zones.active.push(
    createCard({
      instanceId: nextId++,
      name: 'Fighting Fury Belt',
      supertype: 'Trainer',
      subtypes: ['Pokémon Tool'],
      text: FIGHTING_FURY_BELT,
      attachedTo: attacker.instanceId,
    })
  );
  const dialga = mon('Dialga ex', { hp: 300, types: ['Metal'] });
  state.players.p2.zones.active.push(dialga);
  state.players.p2.zones.bench.push(mon('Beldum', { types: ['Metal'] }));
  state.stadium = createCard({ instanceId: nextId++, name: 'Full Metal Lab', supertype: 'Trainer', subtypes: ['Stadium'], text: FULL_METAL_LAB });
  state.stadium.ownerId = 'p2';
  assert.equal(attackDamage(state, dialga), 150);
});
