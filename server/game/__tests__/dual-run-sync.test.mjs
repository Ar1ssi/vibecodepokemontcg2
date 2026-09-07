import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../room.mjs';
import { applyView, resetRenderState, getCardRegistry } from '../../../client/src/setup/netcode/apply-view.js';
import { createCard } from '../../../shared/engine/cards.mjs';

function buildPlayerDeck(prefix, basicName) {
  const deck = [];
  for (let i = 1; i <= 5; i++) {
    deck.push(
      createCard({
        instanceId: Number(`${prefix}0${i}`),
        name: `${basicName} ${i}`,
        supertype: 'Pokémon',
        types: ['Lightning'],
        stage: 'Basic',
        hp: 70,
      })
    );
  }
  for (let i = 6; i <= 20; i++) {
    deck.push(
      createCard({
        instanceId: Number(`${prefix}${i < 10 ? '0' : ''}${i}`),
        name: 'Lightning Energy',
        supertype: 'Energy',
        type: 'Energy',
      })
    );
  }
  return deck;
}

test('dual-run integration: two clients receive views, applyView reconciles, boards converge', () => {
  resetRenderState();

  const room = new GameRoom({
    roomId: 'room-dual-1',
    rulesEnabled: true,
    seed: 42,
  });

  const sock1 = 'sock_p1';
  const sock2 = 'sock_p2';

  room.addPlayer(sock1, 'p1', 'Ash', buildPlayerDeck(1, 'Pikachu'));
  room.addPlayer(sock2, 'p2', 'Gary', buildPlayerDeck(2, 'Electabuzz'));

  // Put cards into zones for testing turn interaction
  const p1 = room.state.players.p1;
  const p2 = room.state.players.p2;

  const p1Pikachu = createCard({ instanceId: 101, name: 'Pikachu', supertype: 'Pokémon', stage: 'Basic', hp: 60 });
  const p1Energy = createCard({ instanceId: 102, name: 'Lightning Energy', supertype: 'Energy' });
  p1.zones.hand.push(p1Pikachu, p1Energy);

  const p2Electabuzz = createCard({ instanceId: 201, name: 'Electabuzz', supertype: 'Pokémon', stage: 'Basic', hp: 70 });
  p2.zones.hand.push(p2Electabuzz);

  room.state.turn = { player: 'p1', number: 1, phase: 'main' };

  // 1. Player 1 sends cmd to move Pikachu from hand to active
  const cmd1 = {
    type: 'moveCard',
    payload: { instanceId: 101, from: 'hand', to: 'active' },
    clientSeq: 1,
  };

  const res1 = room.handleCommand(sock1, cmd1);
  assert.equal(res1.success, true);
  assert.equal(res1.broadcasts.length, 2);

  const p1Broadcast = res1.broadcasts.find((b) => b.socketId === sock1);
  const p2Broadcast = res1.broadcasts.find((b) => b.socketId === sock2);

  assert.ok(p1Broadcast);
  assert.ok(p2Broadcast);

  // Ash's view: Pikachu is in you.zones.active
  assert.equal(p1Broadcast.view.you.zones.active.length, 1);
  assert.equal(p1Broadcast.view.you.zones.active[0].instanceId, 101);
  assert.equal(p1Broadcast.view.you.zones.active[0].name, 'Pikachu');

  // Gary's view: Pikachu is in them.zones.active (public zone -> full card)
  assert.equal(p2Broadcast.view.them.zones.active.length, 1);
  assert.equal(p2Broadcast.view.them.zones.active[0].instanceId, 101);
  assert.equal(p2Broadcast.view.them.zones.active[0].name, 'Pikachu');

  // Gary's view: Ash's remaining hand is redacted
  assert.equal(p2Broadcast.view.them.zones.hand.length, 1);
  assert.equal(p2Broadcast.view.them.zones.hand[0].instanceId, 102);
  assert.equal(p2Broadcast.view.them.zones.hand[0].name, undefined, 'Opponent hand cards must be redacted');

  // 2. Player 1 attaches energy to Pikachu
  const cmd2 = {
    type: 'attachCard',
    payload: { instanceId: 102, targetInstanceId: 101 },
    clientSeq: 2,
  };

  const res2 = room.handleCommand(sock1, cmd2);
  assert.equal(res2.success, true);

  const p1View2 = res2.broadcasts.find((b) => b.socketId === sock1).view;
  const p2View2 = res2.broadcasts.find((b) => b.socketId === sock2).view;

  assert.equal(p1View2.you.zones.active.length, 2);
  const attachedEnergyP1 = p1View2.you.zones.active.find((c) => c.instanceId === 102);
  assert.equal(attachedEnergyP1.attachedTo, 101);

  assert.equal(p2View2.them.zones.active.length, 2);
  const attachedEnergyP2 = p2View2.them.zones.active.find((c) => c.instanceId === 102);
  assert.equal(attachedEnergyP2.attachedTo, 101);

  // 3. Reconnection / requestView (Edge Case 6)
  const reconnectedView = room.getViewForSocket(sock2);
  assert.equal(reconnectedView.them.zones.active.length, 2);
  assert.equal(reconnectedView.them.zones.active[0].instanceId, 101);

  // 4. Verify applyView applies both views without errors
  const app1 = applyView(p1View2, res2.events);
  assert.equal(app1.applied, true);

  resetRenderState();
  const app2 = applyView(p2View2, res2.events);
  assert.equal(app2.applied, true);
  assert.ok(getCardRegistry());
});
