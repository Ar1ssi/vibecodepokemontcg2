// The starter's turn-1 draw comes after setup (rules/opening-draw.mjs): setup deals 7 each, the
// draw is owed until both Starting Actives are placed, and until then placing one is the only
// game action. Official order: place Active and Bench, set Prizes, flip, then the first player
// draws (Pokémon TCG rulebook, "Setting Up to Play" then "Parts of a Turn").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

const deck = (base) =>
  Array.from({ length: 30 }, (_, i) =>
    i < 15
      ? createCard({ instanceId: base + i, name: `Pikachu ${i}`, supertype: 'Pokémon', stage: 'Basic', hp: 60 })
      : createCard({ instanceId: base + i, name: 'Lightning Energy', supertype: 'Energy', type: 'Energy' })
  );

function dealt() {
  const rng = createRng(77);
  const state = createGameState({
    players: { p1: { username: 'Ash', zones: { deck: deck(100) } }, p2: { username: 'Gary', zones: { deck: deck(200) } } },
    seed: 77,
    rulesEnabled: true,
  });
  const res = applyCommand(state, { type: 'setup', payload: { firstPlayerId: 'p1' }, playerId: 'p1' }, rng);
  assert.equal(res.error, null);
  return { state: res.state, rng, events: res.events };
}

const basicIn = (state, pid) => state.players[pid].zones.hand.find((c) => c.stage === 'Basic');
const place = (state, rng, pid) =>
  applyCommand(
    state,
    { type: 'moveCard', payload: { instanceId: basicIn(state, pid).instanceId, from: 'hand', to: 'active' }, playerId: pid },
    rng
  );
const draws = (res) => res.events.filter((e) => e.type === 'cardsDrawn').map((e) => [e.playerId, e.count]);

test('opening draw: setup deals 7 each and draws nothing for the starter yet', () => {
  const { state, events } = dealt();
  assert.equal(state.players.p1.zones.hand.length, 7);
  assert.equal(state.players.p2.zones.hand.length, 7);
  assert.deepEqual(events.filter((e) => e.type === 'cardsDrawn'), []);
  assert.equal(state.openingDrawPending, 'p1');
});

test('opening draw: the starter draws in the command that places the last Active (opponent last)', () => {
  const { state, rng } = dealt();
  const first = place(state, rng, 'p1');
  assert.equal(first.error, null);
  assert.deepEqual(draws(first), []);
  const second = place(first.state, rng, 'p2');
  assert.equal(second.error, null);
  assert.deepEqual(draws(second), [['p1', 1]]);
  assert.equal(second.state.players.p1.zones.hand.length, 7);
  assert.equal(second.state.openingDrawPending, undefined);
  const placed = second.events.findIndex((e) => e.type === 'cardMoved' && e.to === 'active');
  const drew = second.events.findIndex((e) => e.type === 'cardsDrawn');
  assert.ok(placed >= 0 && placed < drew, 'the draw follows the placement');
});

test('opening draw: the starter placing last also draws, once', () => {
  const { state, rng } = dealt();
  const opp = place(state, rng, 'p2');
  assert.equal(opp.error, null);
  const own = place(opp.state, rng, 'p1');
  assert.deepEqual(draws(own), [['p1', 1]]);
  const later = applyCommand(own.state, { type: 'draw', payload: { count: 0 }, playerId: 'p1' }, rng);
  assert.equal(later.state.players.p1.zones.hand.length, own.state.players.p1.zones.hand.length);
});

test('opening draw: until both Actives are down, the starter can do nothing else', () => {
  const { state, rng } = dealt();
  const placed = place(state, rng, 'p1');
  const energy = placed.state.players.p1.zones.hand.find((c) => c.supertype === 'Energy');
  const bench = basicIn(placed.state, 'p1');
  const refused = [
    { type: 'pass', payload: {} },
    { type: 'draw', payload: { count: 1 } },
    { type: 'moveCard', payload: { instanceId: bench.instanceId, from: 'hand', to: 'bench' } },
    { type: 'attachCard', payload: { instanceId: energy.instanceId, targetInstanceId: placed.state.players.p1.zones.active[0].instanceId } },
  ];
  for (const command of refused) {
    const res = applyCommand(placed.state, { ...command, playerId: 'p1' }, rng);
    assert.equal(res.error, 'Both players must choose a Starting Active Pokémon first.', command.type);
  }
});

test('opening draw: an empty deck owes no card', () => {
  const { state, rng } = dealt();
  state.players.p1.zones.deck = [];
  const second = place(place(state, rng, 'p1').state, rng, 'p2');
  assert.equal(second.error, null);
  assert.deepEqual(draws(second), []);
  assert.equal(second.state.openingDrawPending, undefined);
});
