// Dialga ex Time Twister ({M}, 20). Source: client/src/assets/custom-sets/customhb/set.json (the
// user's custom set): "Look at the top and bottom cards of your deck. Put one into your hand and
// discard the other."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAttackSteps } from '../rules/attack-steps.mjs';

const TIME_TWISTER = 'Look at the top and bottom cards of your deck. Put one into your hand and discard the other.';
const rng = { next: () => 0.1 };

const card = (instanceId, name) => createCard({ instanceId, name, supertype: 'Trainer', subtypes: ['Item'], ownerId: 'p1' });

function board(deckSize) {
  const state = createGameState({ gameId: 'time-twister', seed: 1, rulesEnabled: true });
  for (const p of ['p1', 'p2']) {
    state.players[p] = { playerId: p, username: p, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[p].zones.prizes.push(card(500 + i + (p === 'p2' ? 10 : 0), 'Prize'));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const dialga = createCard({
    instanceId: 70, name: 'Dialga ex', supertype: 'Pokémon', stage: 'Basic', hp: 220, types: ['Metal'], ownerId: 'p1',
    attacks: [{ name: 'Time Twister', cost: ['Metal'], damage: '20', text: TIME_TWISTER }],
  });
  const metal = createCard({
    instanceId: 61, name: 'Metal Energy', supertype: 'Energy', subtypes: ['Basic'], types: ['Metal'], attachedTo: 70, ownerId: 'p1',
  });
  state.players.p1.zones.active.push(dialga, metal);
  for (let i = 0; i < deckSize; i++) state.players.p1.zones.deck.push(card(100 + i, `Card ${i}`));
  state.players.p2.zones.active.push(
    createCard({ instanceId: 71, name: 'Opp', supertype: 'Pokémon', stage: 'Basic', hp: 200, ownerId: 'p2' })
  );
  state.players.p2.zones.deck.push(card(600, 'Opp card'), card(601, 'Opp card'));
  return state;
}

const attack = (state) => applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' }, rng);
const choose = (res, selection) =>
  applyCommand(
    res.state,
    { type: 'resolveChoice', payload: { choiceId: res.pendingChoice.choiceId, selection }, playerId: res.pendingChoice.player },
    rng
  );
const ids = (cards) => cards.map((c) => c.instanceId);

test('parses to one look-at-top-and-bottom step: 1 to hand, the other discarded', () => {
  const { after, before } = parseAttackSteps(TIME_TWISTER, { selfName: 'Dialga ex' });
  assert.deepEqual([...before, ...after], [{ type: 'atkLookTopTake', look: 'topAndBottom', take: 1, rest: 'discard' }]);
});

test('offers the top and bottom cards; the pick goes to hand, the other to the discard, no shuffle', () => {
  const res = attack(board(5));
  assert.equal(res.error, null);
  assert.deepEqual(ids(res.pendingChoice.options), [100, 104]);
  const done = choose(res, [104]);
  assert.equal(done.error, null);
  const p1 = done.state.players.p1.zones;
  assert.ok(p1.hand.some((c) => c.instanceId === 104));
  assert.ok(p1.discard.some((c) => c.instanceId === 100));
  assert.deepEqual(ids(p1.deck), [101, 102, 103], 'the rest of the deck stays in order');
  assert.equal(done.state.players.p2.zones.active[0].damage, 20);
});

test('with one card in the deck it is both top and bottom: it goes to hand', () => {
  const res = attack(board(1));
  assert.equal(res.error, null);
  const done = res.pendingChoice ? choose(res, [100]) : res;
  const p1 = done.state.players.p1.zones;
  assert.deepEqual(ids(p1.hand), [100]);
  assert.equal(p1.discard.length, 0);
});

test('with an empty deck the attack still does its damage', () => {
  const res = attack(board(0));
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null);
  assert.equal(res.state.players.p2.zones.active[0].damage, 20);
});
