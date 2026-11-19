// Aegislash Stance Change, printed text from out/pkmn-pokemon-cards.json (Aegislash XY 85/86):
// "Once during your turn (before your attack), you may switch this Pokémon with an Aegislash in your
// hand. (Any cards attached to this Pokémon, damage counters, Special Conditions, turns in play, and
// any other effects remain on the new Pokémon.)"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

const STANCE_CHANGE =
  'Once during your turn (before your attack), you may switch this Pokémon with an Aegislash in your hand. (Any cards attached to this Pokémon, damage counters, Special Conditions, turns in play, and any other effects remain on the new Pokémon.)';
const rng = createRng(9);

const mon = (instanceId, name, extra = {}) =>
  createCard({ instanceId, name, hp: 170, supertype: 'Pokémon', stage: 'Basic', ownerId: 'p1', ...extra });
const aegislash = (instanceId, extra = {}) =>
  mon(instanceId, 'Aegislash', {
    stage: 'Stage 2',
    evolvesFrom: 'Doublade',
    abilities: [{ name: 'Stance Change', type: 'Ability', text: STANCE_CHANGE }],
    attacks: [{ name: 'Slash', cost: [], damage: '30', text: '' }],
    ...extra,
  });

// p1: Honedge (60) ← Doublade (61) ← Aegislash (70) in `zone`, a Metal Energy (62); Aegislash (80) in hand.
function board({ zone = 'active' } = {}) {
  const state = createGameState({ gameId: 'stance-change', seed: 9, rulesEnabled: true });
  for (const p of ['p1', 'p2']) {
    state.players[p] = { playerId: p, username: p, zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
    for (let i = 0; i < 4; i++) {
      state.players[p].zones.deck.push(createCard({ instanceId: 900 + i + (p === 'p2' ? 10 : 0), name: 'Card', supertype: 'Trainer', ownerId: p }));
    }
  }
  state.turn = { player: 'p1', number: 4, phase: 'main' };
  const p1 = state.players.p1.zones;
  if (zone === 'bench') p1.active.push(mon(50, 'Pikachu'));
  p1[zone].push(
    mon(60, 'Honedge', { damage: 50, enteredPlayTurn: 1, specialCondition: zone === 'active' ? 'Confused' : null }),
    mon(61, 'Doublade', { stage: 'Stage 1', attachedTo: 60 }),
    aegislash(70, { attachedTo: 60 }),
    createCard({ instanceId: 62, name: 'Metal Energy', supertype: 'Energy', subtypes: ['Basic'], types: ['Metal'], attachedTo: 60, ownerId: 'p1' })
  );
  p1.hand.push(aegislash(80, { attacks: [{ name: 'Blade', cost: [], damage: '120', text: '' }] }));
  state.players.p2.zones.active.push(mon(71, 'Opp', { ownerId: 'p2' }));
  return state;
}

const use = (state, instanceId) =>
  applyCommand(state, { type: 'useAbility', payload: { instanceId }, playerId: 'p1' }, rng);

// Uses Stance Change on `instanceId`, picking hand card `pick` when asked.
function stanceChange(state, instanceId, pick) {
  const res = use(state, instanceId);
  if (res.error || !res.pendingChoice) return res;
  return applyCommand(
    res.state,
    { type: 'resolveChoice', payload: { choiceId: res.pendingChoice.choiceId, selection: [pick] }, playerId: 'p1' },
    rng
  );
}

const byId = (cards, id) => cards.find((c) => c.instanceId === id);

test('the hand Aegislash takes the top of the stack; everything on the Pokémon stays', () => {
  const res = stanceChange(board(), 70, 80);
  assert.equal(res.error, null);
  const { active, hand } = res.state.players.p1.zones;
  assert.equal(byId(active, 80).attachedTo, 60);
  assert.equal(byId(active, 61).attachedTo, 60);
  assert.equal(byId(active, 62).attachedTo, 60);
  assert.equal(byId(active, 60).damage, 50);
  assert.equal(byId(active, 60).specialCondition, 'Confused');
  assert.ok(byId(hand, 70));
  assert.equal(byId(hand, 70).attachedTo, null);
});

test('the new Aegislash cannot Stance Change back the same turn', () => {
  const swapped = stanceChange(board(), 70, 80);
  assert.equal(swapped.error, null);
  const again = stanceChange(swapped.state, 80, 70);
  assert.ok(again.error || again.pendingChoice == null, 'no second swap this turn');
  const { active, hand } = (again.error ? swapped : again).state.players.p1.zones;
  assert.ok(byId(active, 80), 'Aegislash 80 is still the one in play');
  assert.ok(byId(hand, 70));
});

test('on the next turn the new Aegislash can Stance Change again', () => {
  const swapped = stanceChange(board(), 70, 80);
  const p1Ends = applyCommand(swapped.state, { type: 'pass', payload: {}, playerId: 'p1' }, rng);
  assert.equal(p1Ends.error, null);
  const p2Ends = applyCommand(p1Ends.state, { type: 'pass', payload: {}, playerId: 'p2' }, rng);
  assert.equal(p2Ends.error, null);
  const back = stanceChange(p2Ends.state, 80, 70);
  assert.equal(back.error, null);
  assert.ok(byId(back.state.players.p1.zones.active, 70));
  assert.ok(byId(back.state.players.p1.zones.hand, 80));
});

test('an attack effect on the old Aegislash stays on the new one', () => {
  const state = board();
  // "This Pokémon can't attack during your next turn", set by the old Aegislash last turn.
  byId(state.players.p1.zones.active, 60).attackMarkers = [{ kind: 'cantAttack', untilTurn: 4, fromTurn: 4, topId: 70 }];
  assert.ok(applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' }, rng).error);
  const swapped = stanceChange(state, 70, 80);
  assert.equal(swapped.error, null);
  const res = applyCommand(swapped.state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' }, rng);
  assert.ok(res.error, 'the new Aegislash still cannot attack this turn');
});

test('the new Aegislash attacks with its own attacks', () => {
  const state = board();
  byId(state.players.p1.zones.active, 60).specialCondition = null;
  const swapped = stanceChange(state, 70, 80);
  const res = applyCommand(swapped.state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' }, rng);
  assert.equal(res.error, null);
  assert.equal(byId(res.state.players.p2.zones.active, 71).damage, 120);
});

test('works from the Bench too', () => {
  const res = stanceChange(board({ zone: 'bench' }), 70, 80);
  assert.equal(res.error, null);
  assert.equal(byId(res.state.players.p1.zones.bench, 80).attachedTo, 60);
});
