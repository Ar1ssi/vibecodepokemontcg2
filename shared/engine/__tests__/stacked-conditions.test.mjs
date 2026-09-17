// Design 011 / audit A-1: Poisoned and Burned are markers that stack with each other and
// with one rotation condition (Asleep, Confused, Paralyzed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, hashStateZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { executeSteps } from '../effects/executor.mjs';
import { hasCardChanged } from '../../../client/src/setup/netcode/view-diff.mjs';
import {
  addCondition,
  removeCondition,
  clearConditions,
  copyConditions,
  hasCondition,
  listConditions,
} from '../rules/special-conditions.mjs';

const TAILS = { next: () => 0.9, shuffle: (cards) => cards };
const HEADS = { next: () => 0.1 };

function checkupState({ hp = 100, damage = 0, conditions = [] } = {}) {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  state.players.p1.zones.active.push(createCard({ instanceId: 1, name: 'Pikachu', hp: 60 }));
  state.players.p1.zones.deck.push(createCard({ instanceId: 2, name: 'P1 card' }));
  const target = createCard({ instanceId: 10, name: 'Eevee', hp, damage });
  for (const condition of conditions) addCondition(target, condition);
  state.players.p2.zones.active.push(target);
  state.players.p2.zones.bench.push(createCard({ instanceId: 11, name: 'Snorlax', hp: 150 }));
  state.players.p2.zones.deck.push(createCard({ instanceId: 12, name: 'P2 card' }));
  for (let i = 0; i < 6; i++) state.players.p1.zones.prizes.push(createCard({ instanceId: 900 + i, name: 'Prize' }));
  return state;
}

function p2Active(state) {
  return state.players.p2.zones.active.find((c) => !c.attachedTo);
}

// --- helper ---

test('conditions: adding the same condition twice is idempotent', () => {
  const card = createCard({ instanceId: 1 });
  addCondition(card, 'Poisoned');
  addCondition(card, 'Poisoned');
  assert.deepEqual(listConditions(card), ['Poisoned']);
});

test('conditions: an unknown condition is ignored', () => {
  const card = createCard({ instanceId: 1 });
  assert.equal(addCondition(card, 'Frozen'), false);
  assert.equal(removeCondition(card, 'Frozen'), false);
  assert.deepEqual(listConditions(card), []);
  assert.equal(card.specialCondition, null);
});

test('conditions: a new rotation condition replaces the old one and keeps both markers', () => {
  const card = createCard({ instanceId: 1 });
  for (const c of ['Poisoned', 'Burned', 'Asleep', 'Confused']) addCondition(card, c);
  assert.deepEqual(listConditions(card), ['Poisoned', 'Burned', 'Confused']);
});

test('conditions: a legacy specialCondition "Poisoned" reads as the marker and is normalized on write', () => {
  const card = createCard({ instanceId: 1, specialCondition: 'Poisoned' });
  assert.equal(hasCondition(card, 'Poisoned'), true);
  addCondition(card, 'Asleep');
  assert.equal(card.poisoned, true);
  assert.equal(card.specialCondition, 'Asleep');
  assert.deepEqual(listConditions(card), ['Poisoned', 'Asleep']);
});

test('conditions: clearConditions removes the marker keys entirely; copyConditions copies all', () => {
  const from = createCard({ instanceId: 1 });
  for (const c of ['Burned', 'Paralyzed']) addCondition(from, c);
  const to = createCard({ instanceId: 2, specialCondition: 'Asleep' });
  copyConditions(from, to);
  assert.deepEqual(listConditions(to), ['Burned', 'Paralyzed']);
  clearConditions(from);
  assert.equal('poisoned' in from || 'burned' in from, false);
  assert.equal(from.specialCondition, null);
});

// --- commands ---

test('addSpecialCondition: Asleep on a Poisoned Pokémon keeps the Poison', () => {
  const state = checkupState({ conditions: ['Poisoned'] });
  state.turn.player = 'p2';
  const res = applyCommand(state, {
    type: 'addSpecialCondition',
    payload: { instanceId: 10, condition: 'Asleep' },
    playerId: 'p2',
  });
  assert.equal(res.error, null);
  assert.deepEqual(listConditions(p2Active(res.state)), ['Poisoned', 'Asleep']);
  const event = res.events.find((e) => e.type === 'specialConditionUpdated');
  assert.deepEqual(event.conditions, ['Poisoned', 'Asleep']);
});

test('removeSpecialCondition: a named condition removes only that one; no name clears all', () => {
  const state = checkupState({ conditions: ['Poisoned', 'Burned', 'Asleep'] });
  state.turn.player = 'p2';
  const one = applyCommand(state, {
    type: 'removeSpecialCondition',
    payload: { instanceId: 10, condition: 'Burned' },
    playerId: 'p2',
  });
  assert.deepEqual(listConditions(p2Active(one.state)), ['Poisoned', 'Asleep']);
  const all = applyCommand(one.state, {
    type: 'removeSpecialCondition',
    payload: { instanceId: 10 },
    playerId: 'p2',
  });
  assert.deepEqual(listConditions(p2Active(all.state)), []);
});

test('updateSpecialCondition: null clears every condition', () => {
  const state = checkupState({ conditions: ['Poisoned', 'Paralyzed'] });
  state.turn.player = 'p2';
  const res = applyCommand(state, {
    type: 'updateSpecialCondition',
    payload: { instanceId: 10, condition: null },
    playerId: 'p2',
  });
  assert.deepEqual(listConditions(p2Active(res.state)), []);
});

// --- Checkup ---

test('Checkup: Poisoned and Burned both deal damage in the same Checkup', () => {
  const state = checkupState({ conditions: ['Poisoned', 'Burned'] });
  const res = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' }, TAILS);
  assert.equal(res.error, null);
  const active = p2Active(res.state);
  assert.equal(active.damage, 30);
  assert.deepEqual(listConditions(active), ['Poisoned', 'Burned']);
});

test('Checkup: Burn cured on heads leaves the Poison in place', () => {
  const state = checkupState({ conditions: ['Poisoned', 'Burned'] });
  const res = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' }, HEADS);
  assert.deepEqual(listConditions(p2Active(res.state)), ['Poisoned']);
});

test('Checkup: Poisoned + Burned + Asleep all resolve', () => {
  const state = checkupState({ conditions: ['Poisoned', 'Burned', 'Asleep'] });
  const res = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' }, HEADS);
  const active = p2Active(res.state);
  assert.equal(active.damage, 30);
  assert.deepEqual(listConditions(active), ['Poisoned']);
});

test('Checkup: combined Poison and Burn damage Knocks Out once and awards one prize', () => {
  const state = checkupState({ hp: 60, damage: 30, conditions: ['Poisoned', 'Burned'] });
  const passRes = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' }, TAILS);
  assert.equal(passRes.error, null);
  const discarded = passRes.state.players.p2.zones.discard.find((c) => c.instanceId === 10);
  assert.ok(discarded, 'Knocked Out Pokémon is discarded');
  assert.deepEqual(listConditions(discarded), []);
  const choice = passRes.state.pendingChoice;
  assert.equal(choice.player, 'p1');
  assert.equal(choice.min, 1, 'one Knockout, one prize');
  const res = applyCommand(passRes.state, {
    type: 'resolveChoice',
    payload: { choiceId: choice.choiceId, selection: [choice.options[0].instanceId] },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.prizes.length, 5);
});

test('retreat clears every condition, markers included', () => {
  const state = checkupState({ conditions: ['Poisoned', 'Burned', 'Confused'] });
  state.turn.player = 'p2';
  const res = applyCommand(state, { type: 'retreat', payload: { benchInstanceId: 11 }, playerId: 'p2' });
  assert.equal(res.error, null);
  const retreated = res.state.players.p2.zones.bench.find((c) => c.instanceId === 10);
  assert.deepEqual(listConditions(retreated), []);
});

test('a card without markers hashes exactly as before markers existed', () => {
  const state = checkupState();
  const before = hashStateZones(state, 'p2');
  addCondition(p2Active(state), 'Burned');
  removeCondition(p2Active(state), 'Burned');
  assert.equal('burned' in p2Active(state), false);
  assert.deepEqual(hashStateZones(state, 'p2'), before);
});

// --- effects (slice 2) ---

function effectState() {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  state.players.p1.zones.active.push(createCard({ instanceId: 1, name: 'Pikachu', hp: 60, damage: 20 }));
  state.players.p1.zones.bench.push(createCard({ instanceId: 2, name: 'Eevee', hp: 60 }));
  state.players.p2.zones.active.push(createCard({ instanceId: 10, name: 'Snorlax', hp: 150 }));
  return state;
}

test('effect applyStatus: every listed condition lands (Burned + Confused)', () => {
  const state = effectState();
  const events = [];
  executeSteps(state, {
    steps: [{ type: 'applyStatus', target: 'opponentActive', conditions: ['Burned', 'Confused'] }],
    playerId: 'p1',
    activeRng: TAILS,
    events,
  });
  assert.deepEqual(listConditions(state.players.p2.zones.active[0]), ['Burned', 'Confused']);
  assert.equal(events.filter((e) => e.type === 'statusApplied').length, 2);
});

test('effect applyStatus: Poison added to an Asleep Pokémon keeps it Asleep', () => {
  const state = effectState();
  addCondition(state.players.p2.zones.active[0], 'Asleep');
  executeSteps(state, {
    steps: [{ type: 'applyStatus', target: 'opponentActive', condition: 'Poisoned' }],
    playerId: 'p1',
    activeRng: TAILS,
    events: [],
  });
  assert.deepEqual(listConditions(state.players.p2.zones.active[0]), ['Poisoned', 'Asleep']);
});

test('effect switch: the Pokémon moving to the Bench loses every condition', () => {
  const state = effectState();
  const active = state.players.p1.zones.active[0];
  for (const c of ['Poisoned', 'Burned', 'Paralyzed']) addCondition(active, c);
  executeSteps(state, { steps: [{ type: 'switch' }], playerId: 'p1', activeRng: TAILS, events: [] });
  const benched = state.players.p1.zones.bench.find((c) => c.instanceId === 1);
  assert.deepEqual(listConditions(benched), []);
});

test('effect heal with cure: clears markers, and a marker alone makes the Pokémon a heal target', () => {
  const state = effectState();
  const bench = state.players.p1.zones.bench[0];
  addCondition(bench, 'Burned');
  const active = state.players.p1.zones.active[0];
  addCondition(active, 'Poisoned');
  executeSteps(state, {
    steps: [{ type: 'heal', target: 'each of your Pokémon', cure: true }],
    playerId: 'p1',
    activeRng: TAILS,
    events: [],
  });
  assert.deepEqual(listConditions(active), []);
  assert.deepEqual(listConditions(bench), []);
});

test('effect swapWithDiscard: the incoming Pokémon takes every condition; the outgoing one keeps none', () => {
  const state = effectState();
  const active = state.players.p1.zones.active[0];
  for (const c of ['Poisoned', 'Burned', 'Asleep']) addCondition(active, c);
  active.stage = 'Basic';
  active.supertype = 'Pokémon';
  const incoming = createCard({ instanceId: 30, name: 'Ogerpon', hp: 110, supertype: 'Pokémon', stage: 'Basic' });
  state.players.p1.zones.discard.push(incoming);
  const res = executeSteps(state, {
    steps: [{ type: 'swapWithDiscard', filter: 'Basic Pokémon' }],
    playerId: 'p1',
    activeRng: TAILS,
    events: [],
    selection: [1],
    context: { '0:swapWithDiscard': { phase: 'inPlay', discardId: 30 } },
  });
  assert.equal(res.completed, true);
  assert.deepEqual(listConditions(state.players.p1.zones.active.find((c) => c.instanceId === 30)), [
    'Poisoned',
    'Burned',
    'Asleep',
  ]);
  assert.deepEqual(listConditions(state.players.p1.zones.discard.find((c) => c.instanceId === 1)), []);
});

test('effect searchAttachEach poisonActive: Poison stacks with an existing rotation condition', () => {
  const state = effectState();
  const active = state.players.p1.zones.active[0];
  active.supertype = 'Pokémon';
  addCondition(active, 'Confused');
  state.players.p1.zones.deck.push(
    createCard({ instanceId: 40, name: 'Grass Energy', supertype: 'Energy', type: 'Energy' })
  );
  executeSteps(state, {
    steps: [{ type: 'searchAttachEach', count: 1, energy: 'Grass Energy', target: '', poisonActive: true }],
    playerId: 'p1',
    activeRng: TAILS,
    events: [],
    selection: [1],
  });
  assert.deepEqual(listConditions(active), ['Poisoned', 'Confused']);
});

// --- client-visible fingerprints (slice 3) ---

test('zone hash changes when a Poison or Burn marker is added', () => {
  const state = checkupState({ conditions: ['Asleep'] });
  const before = hashStateZones(state, 'p2');
  addCondition(p2Active(state), 'Burned');
  assert.notDeepEqual(hashStateZones(state, 'p2'), before);
});

test('view diff reports a card changed when only its markers change', () => {
  assert.equal(hasCardChanged({ instanceId: 1, name: 'A' }, { instanceId: 1, name: 'A', poisoned: true }), true);
  assert.equal(hasCardChanged({ instanceId: 1, name: 'A', burned: true }, { instanceId: 1, name: 'A' }), true);
  assert.equal(hasCardChanged({ instanceId: 1, name: 'A', burned: true }, { instanceId: 1, name: 'A', burned: true }), false);
});
