// A Knockout's prize cards are chosen by the player through a server pendingChoice (the
// prize picker) instead of being collected automatically.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { viewFor } from '../view.mjs';

const TAILS = { next: () => 0.9, shuffle: (cards) => cards };

function koState({ attackerPrizes = 6, defenderHp = 60, benchDefender = true } = {}) {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  state.players.p1.zones.active.push(
    createCard({ instanceId: 1, name: 'Mewtwo', hp: 120, attacks: [{ name: 'Psystrike', cost: [], damage: 100 }] })
  );
  state.players.p1.zones.deck.push(createCard({ instanceId: 2, name: 'P1 card' }));
  for (let i = 0; i < attackerPrizes; i++) {
    state.players.p1.zones.prizes.push(createCard({ instanceId: 100 + i, name: `Secret Prize ${i}`, src: `/prize${i}.png` }));
  }
  state.players.p2.zones.active.push(createCard({ instanceId: 10, name: 'Eevee', hp: defenderHp }));
  if (benchDefender) state.players.p2.zones.bench.push(createCard({ instanceId: 11, name: 'Snorlax', hp: 150 }));
  state.players.p2.zones.deck.push(createCard({ instanceId: 12, name: 'P2 card' }));
  for (let i = 0; i < 6; i++) state.players.p2.zones.prizes.push(createCard({ instanceId: 200 + i, name: 'P2 prize' }));
  return state;
}

function attack(state) {
  return applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' }, TAILS);
}

function resolve(state, playerId, selection) {
  return applyCommand(
    state,
    { type: 'resolveChoice', payload: { choiceId: state.pendingChoice.choiceId, selection }, playerId },
    TAILS
  );
}

test('prize choice: a Knockout asks the attacker to choose instead of taking prizes automatically', () => {
  const res = attack(koState());
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.prizes.length, 6, 'no prize moved yet');
  const choice = res.state.pendingChoice;
  assert.equal(choice.player, 'p1');
  assert.equal(choice.min, 1);
  assert.equal(choice.max, 1);
  assert.equal(choice.resumeToken.effectType, 'prizes');
  assert.deepEqual(choice.options.map((o) => o.instanceId), [100, 101, 102, 103, 104, 105]);
});

test('prize choice: options never reveal the face-down prize cards, to the chooser or the opponent', () => {
  const res = attack(koState());
  for (const option of res.state.pendingChoice.options) {
    assert.equal(option.name, '');
    assert.equal(option.src, '');
  }
  const opponentView = viewFor(res.state, 'p2');
  assert.equal(opponentView.pendingChoice.options, undefined);
  assert.equal(opponentView.pendingChoice.optionsCount, 6);
});

test('prize choice: the chosen prize cards, not the first ones, go to hand', () => {
  const res = resolve(attack(koState()).state, 'p1', [104]);
  assert.equal(res.error, null);
  assert.equal(res.state.pendingChoice, null);
  assert.deepEqual(res.state.players.p1.zones.hand.map((c) => c.instanceId), [104]);
  assert.equal(res.state.players.p1.zones.prizes.some((c) => c.instanceId === 104), false);
  assert.equal(res.state.players.p1.flags.prizesOwed, undefined);
  assert.ok(res.events.some((e) => e.type === 'prizesTaken' && e.count === 1));
});

test('prize choice: the game waits — other commands are rejected until prizes are chosen', () => {
  const state = attack(koState()).state;
  const promote = applyCommand(state, { type: 'draw', payload: {}, playerId: 'p2' }, TAILS);
  assert.equal(promote.error, 'waiting_for_choice');
  const byOpponent = resolve(state, 'p2', [100]);
  assert.equal(byOpponent.error, 'not_your_choice');
});

test('prize choice: choosing the wrong number of prizes is rejected', () => {
  const state = attack(koState()).state;
  assert.equal(resolve(state, 'p1', []).error, 'invalid_selection');
  assert.equal(resolve(state, 'p1', [100, 101]).error, 'invalid_selection');
  assert.equal(resolve(state, 'p1', [999]).error, 'invalid_selection');
});

test('prize choice: a game-winning Knockout takes the last prizes without asking', () => {
  const res = attack(koState({ attackerPrizes: 1 }));
  assert.equal(res.error, null);
  assert.equal(res.state.pendingChoice, null);
  assert.equal(res.state.turn.phase, 'ended');
  assert.equal(res.state.players.p1.zones.prizes.length, 0);
});

test('prize choice: a Knockout that leaves the opponent without Pokémon still ends the game with no choice', () => {
  const res = attack(koState({ benchDefender: false }));
  assert.equal(res.state.turn.phase, 'ended');
  assert.equal(res.state.pendingChoice, null);
  assert.equal(res.state.players.p1.flags.prizesOwed, undefined);
});

test('prize choice: an entitlement survives the turn handover and both owed players choose in turn', () => {
  const state = koState();
  state.players.p1.flags.prizesOwed = 1;
  state.players.p2.flags.prizesOwed = 2;
  const passRes = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' }, TAILS);
  assert.equal(passRes.error, null);
  assert.equal(passRes.state.pendingChoice.player, 'p1');

  const first = resolve(passRes.state, 'p1', [100]);
  assert.equal(first.error, null);
  const second = first.state.pendingChoice;
  assert.equal(second.player, 'p2', 'second owed player gets their choice after the first');
  assert.equal(second.min, 2);

  const done = resolve(first.state, 'p2', [200, 201]);
  assert.equal(done.error, null);
  assert.equal(done.state.pendingChoice, null);
  assert.equal(done.state.players.p2.zones.prizes.length, 4);
});
