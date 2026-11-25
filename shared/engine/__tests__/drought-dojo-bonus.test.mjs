// Groudon ex Drought and Martial Arts Dojo (custom set customhb 959), texts verbatim from the
// exported game log (customhb set.json rows): Dragapult survived a Kubfu G-Max Rapid Flow at 90
// because neither bonus reached the damage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

const DROUGHT =
  'As long as this Pokémon is in play, Pokémon that have {F} or {R} Energy attached to them do 20 more damage with their attacks. Pokémon that have a {W} Weakness have no Weakness. You cannot have more than one Drought Active at once.';
const DOJO =
  "The attacks of non-Ultra Beast Pokémon that have any Basic {F} Energy attached to them (both yours and your opponent's) do 10 more damage to the opponent's Active Pokémon (before applying Weakness and Resistance). If the attacking player has more Prize cards remaining than their opponent, those attacks do 40 more damage instead.";

let nextId = 1000;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 300, types: ['Colorless'], ...extra });
const energy = (energyType, attachedTo) =>
  createCard({ instanceId: nextId++, name: `Basic ${energyType} Energy`, supertype: 'Energy', subtypes: ['Basic'], energyType, attachedTo });
const groudon = () =>
  mon('Groudon ex', { hp: 140, types: ['Fighting'], abilities: [{ name: 'Drought', type: 'Ability', text: DROUGHT }] });
const dojo = () =>
  createCard({ instanceId: nextId++, name: 'Martial Arts Dojo', supertype: 'Trainer', subtypes: ['Stadium'], text: DOJO });

function game({ p1Prizes = 6, p2Prizes = 6 } = {}) {
  const state = createGameState({ gameId: 'dd', seed: 3, rulesEnabled: true });
  const prizes = { p1: p1Prizes, p2: p2Prizes };
  for (const playerId of ['p1', 'p2']) {
    state.players[playerId] = { playerId, username: playerId, zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
    for (let i = 0; i < prizes[playerId]; i++) state.players[playerId].zones.prizes.push(mon(`${playerId} prize ${i}`));
    for (let i = 0; i < 10; i++) {
      state.players[playerId].zones.deck.push(createCard({ instanceId: nextId++, name: `${playerId} deck ${i}`, supertype: 'Trainer', subtypes: ['Item'] }));
    }
  }
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  return state;
}

function damageDone(state, defender) {
  const result = applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(3));
  assert.equal(result.error, null);
  const after = Object.values(result.state.players.p2.zones).flat().find((c) => c?.instanceId === defender.instanceId);
  return after.damage || 0;
}

const attacker = (types = ['Fighting']) =>
  mon('Kubfu', { types, attacks: [{ name: 'Hit', cost: [], damage: '120', text: '' }] });

function setup({ stadium = false, holder = false, energyType = 'Fighting', prizes } = {}) {
  const state = game(prizes);
  const a = attacker();
  state.players.p1.zones.active.push(a, energy(energyType, a.instanceId));
  if (holder) state.players.p1.zones.bench.push(groudon());
  if (stadium) state.stadium = { card: dojo(), user: 'p2', instanceId: nextId++ };
  const defender = mon('Dragapult', { types: ['Psychic'] });
  state.players.p2.zones.active.push(defender);
  return { state, defender };
}

test('Drought: a {F}-Energy attacker does 20 more damage', () => {
  const { state, defender } = setup({ holder: true });
  assert.equal(damageDone(state, defender), 140);
});

test('Martial Arts Dojo: Basic {F} Energy attacker does 10 more to the Active Pokémon', () => {
  const { state, defender } = setup({ stadium: true });
  assert.equal(damageDone(state, defender), 130);
});

test('Martial Arts Dojo: 40 more when the attacking player has more Prize cards left', () => {
  const { state, defender } = setup({ stadium: true, prizes: { p1Prizes: 6, p2Prizes: 4 } });
  assert.equal(damageDone(state, defender), 160);
});

test('Martial Arts Dojo: no bonus without Basic {F} Energy attached, or for an Ultra Beast', () => {
  const noEnergy = setup({ stadium: true, energyType: 'Fire' });
  assert.equal(damageDone(noEnergy.state, noEnergy.defender), 120);
  const beast = setup({ stadium: true });
  beast.state.players.p1.zones.active[0].subtypes = ['Ultra Beast'];
  assert.equal(damageDone(beast.state, beast.defender), 120);
});

test('Drought + Dojo stack', () => {
  const { state, defender } = setup({ holder: true, stadium: true });
  assert.equal(damageDone(state, defender), 150);
});

test('Drought: an evolved attacker (energy on the root) is boosted, Groudon on the Bench', () => {
  const state = game();
  const root = mon('Kubfu', { types: ['Fighting'] });
  const top = mon('Rapid Strike Urshifu VMAX', {
    stage: 'VMAX', types: ['Fighting'], evolvesFrom: 'Rapid Strike Urshifu V', attachedTo: root.instanceId,
    attacks: [{ name: 'Hit', cost: [], damage: '120', text: '' }],
  });
  state.players.p1.zones.active.push(root, top, energy('Fighting', root.instanceId));
  state.players.p1.zones.bench.push(groudon());
  const defender = mon('Dragapult', { types: ['Psychic'] });
  state.players.p2.zones.active.push(defender);
  assert.equal(damageDone(state, defender), 140);
});

// The text discards the Energy BEFORE the damage, so no Energy-gated bonus (Drought, Dojo) is left to
// apply: the exported game's 90 on Dragapult was 120 - 30 Resistance, and it would still have lived
// at 120 with both bonuses (140 HP).
test('G-Max Rapid Flow discards Energy first: Drought and Dojo no longer apply', () => {
  const state = game();
  const a = mon('Kubfu', {
    types: ['Fighting'],
    attacks: [{ name: 'G-Max Rapid Flow', cost: [], damage: '', text: "Discard all Energy from this Pokémon. This attack does 120 damage to 2 of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)" }],
  });
  state.players.p1.zones.active.push(a, energy('Fighting', a.instanceId));
  state.players.p1.zones.bench.push(groudon());
  const defender = mon('Dragapult', { types: ['Psychic'] });
  const benched = mon('Blacephalon', { types: ['Psychic'] });
  state.players.p2.zones.active.push(defender);
  state.players.p2.zones.bench.push(benched);
  const result = applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(3));
  assert.equal(result.error, null);
  const dealt = (id, st) => Object.values(st.players.p2.zones).flat().find((c) => c?.instanceId === id)?.damage || 0;
  let st = result.state;
  if (st.pendingChoice) {
    const ids = st.pendingChoice.options.map((o) => o.instanceId ?? o);
    st = applyCommand(st, { type: 'resolveChoice', playerId: 'p1', payload: { choiceId: st.pendingChoice.choiceId, selection: ids.slice(0, 2) } }, createRng(3)).state;
  }
  assert.equal(dealt(defender.instanceId, st), 120);
  assert.equal(dealt(benched.instanceId, st), 120);
});
