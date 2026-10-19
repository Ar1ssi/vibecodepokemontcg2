import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { viewFor, viewForSolo } from '../view.mjs';

function setupSoloGame() {
  const state = createGameState({
    gameId: 'game-solo-test',
    players: {
      p1: { username: 'Near' },
      p2: { username: 'Far' },
    },
  });
  state.turn.player = 'p1';

  state.players.p1.zones.hand.push(createCard({ instanceId: 10, name: 'Near Hand Iono', src: 'iono.png' }));
  state.players.p1.zones.deck.push(createCard({ instanceId: 11, name: 'Near Deck Secret' }));
  state.players.p1.zones.active.push(createCard({ instanceId: 12, name: 'Near Active Pikachu' }));

  state.players.p2.zones.hand.push(
    createCard({ instanceId: 20, name: 'Far Hand Ultra Ball', src: 'ultraball.png' }),
    createCard({ instanceId: 21, name: 'Far Hand Rare Candy' }),
  );
  state.players.p2.zones.deck.push(
    createCard({ instanceId: 22, name: 'Far Deck Secret A' }),
    createCard({ instanceId: 23, name: 'Far Deck Secret B' }),
  );
  state.players.p2.zones.prizes.push(createCard({ instanceId: 24, name: 'Far Prize Secret', revealed: false }));
  state.players.p2.zones.active.push(createCard({ instanceId: 25, name: 'Far Active Pidgeot ex' }));
  state.players.p2.zones.board.push(
    createCard({ instanceId: 26, name: 'Far Face Down Secret', faceDown: true, revealed: false }),
  );
  return state;
}

function farChoice() {
  return {
    choiceId: 'c-1',
    player: 'p2',
    prompt: 'Choose a card to discard',
    cancellable: true,
    options: [{ instanceId: 20 }, { instanceId: 21 }],
  };
}

test('viewForSolo: both hands are fully visible while viewFor hides the far hand', () => {
  const state = setupSoloGame();
  assert.deepEqual(viewFor(state, 'p1').them.zones.hand, [{ instanceId: 20 }, { instanceId: 21 }]);

  const view = viewForSolo(state, 'p1');
  assert.deepEqual(view.you.zones.hand.map((c) => c.name), ['Near Hand Iono']);
  assert.deepEqual(view.them.zones.hand.map((c) => c.name), ['Far Hand Ultra Ball', 'Far Hand Rare Candy']);
  assert.equal(view.them.zones.hand[0].src, 'ultraball.png');
});

test('viewForSolo: far deck stays a count, far unrevealed prize and face-down board card stay identity-only', () => {
  const view = viewForSolo(setupSoloGame(), 'p1');
  assert.deepEqual(view.them.zones.deck, { count: 2 });
  assert.deepEqual(view.them.zones.prizes, [{ instanceId: 24 }]);
  assert.deepEqual(view.them.zones.board, [{ instanceId: 26 }]);
  const serialized = JSON.stringify(view);
  for (const hidden of ['Far Deck Secret', 'Near Deck Secret', 'Far Prize Secret', 'Far Face Down Secret']) {
    assert.equal(serialized.includes(hidden), false, hidden);
  }
});

test('viewForSolo: a far-seat pending choice is exposed in full with choiceSeat = far id', () => {
  const state = setupSoloGame();
  state.pendingChoice = farChoice();
  assert.equal(viewFor(state, 'p1').pendingChoice.options, undefined);

  const view = viewForSolo(state, 'p1');
  assert.equal(view.choiceSeat, 'p2');
  assert.deepEqual(view.pendingChoice, farChoice());
  assert.notEqual(view.pendingChoice, state.pendingChoice);
});

test('viewForSolo: a near-seat pending choice gives choiceSeat = near id', () => {
  const state = setupSoloGame();
  state.pendingChoice = { ...farChoice(), player: 'p1' };
  const view = viewForSolo(state, 'p1');
  assert.equal(view.choiceSeat, 'p1');
  assert.deepEqual(view.pendingChoice, { ...farChoice(), player: 'p1' });
});

test('viewForSolo: no pending choice gives choiceSeat null and pendingChoice null', () => {
  const view = viewForSolo(setupSoloGame(), 'p1');
  assert.equal(view.choiceSeat, null);
  assert.equal(view.pendingChoice, null);
});

test('viewForSolo: solo flag, seat mapping and isYourTurn follow the near seat', () => {
  const state = setupSoloGame();
  const near = viewForSolo(state, 'p1');
  assert.equal(near.solo, true);
  assert.equal(near.isSpectator, false);
  assert.equal(near.you.playerId, 'p1');
  assert.equal(near.them.playerId, 'p2');
  assert.equal(near.turn.isYourTurn, true);

  const flipped = viewForSolo(state, 'p2');
  assert.equal(flipped.you.playerId, 'p2');
  assert.equal(flipped.turn.isYourTurn, false);
  assert.deepEqual(flipped.them.zones.hand.map((c) => c.name), ['Near Hand Iono']);
});

test('viewForSolo: the far seat carries its own attackExtras', () => {
  const state = setupSoloGame();
  const extra = [{ name: 'Granted Attack', damage: '30' }];
  const attackExtrasFor = (_state, card) => (card.instanceId === 25 || card.instanceId === 12 ? extra : []);
  const view = viewForSolo(state, 'p1', { attackExtrasFor });
  assert.deepEqual(view.them.attackExtras, { 25: extra });
  assert.deepEqual(view.you.attackExtras, { 12: extra });
  assert.equal(viewFor(state, 'p1', { attackExtrasFor }).them.attackExtras, undefined);
});

test('viewForSolo: unknown nearId, missing nearId or missing state returns null', () => {
  const state = setupSoloGame();
  assert.equal(viewForSolo(state, 'p3'), null);
  assert.equal(viewForSolo(state, null), null);
  assert.equal(viewForSolo(null, 'p1'), null);
});

test('viewForSolo: viewFor output for the same state is unchanged (regression guard)', () => {
  const state = setupSoloGame();
  state.pendingChoice = farChoice();
  const before = JSON.stringify(viewFor(state, 'p1'));
  viewForSolo(state, 'p1');
  const after = viewFor(state, 'p1');
  assert.equal(JSON.stringify(after), before);
  assert.equal('solo' in after, false);
  assert.equal('choiceSeat' in after, false);
  assert.deepEqual(after.them.zones.hand, [{ instanceId: 20 }, { instanceId: 21 }]);
  assert.equal(after.pendingChoice.optionsCount, 2);
});
