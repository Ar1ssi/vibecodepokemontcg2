// Audit SE1: server cards are built from identity-only deck rows (server/game/shadow.mjs),
// so special-Energy text reaches the server only through the client's cardStats payload.
// These tests build cards exactly that way instead of seeding `text` directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { buildCardStatsPayload } from '../../../client/src/setup/netcode/card-stats.js';

const ENRICHING =
  'As long as this card is attached to a Pokémon, it provides {C} Energy. When you attach this card from your hand to a Pokémon, draw 4 cards.';

function game() {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 6; i += 1) {
      state.players[pid].zones.prizes.push(createCard({ instanceId: (pid === 'p1' ? 900 : 950) + i, name: 'Prize' }));
    }
    for (let i = 0; i < 8; i += 1) {
      state.players[pid].zones.deck.push(createCard({ instanceId: (pid === 'p1' ? 800 : 850) + i, name: 'Filler' }));
    }
  }
  return state;
}

// The shape shadow.mjs initializePlayerDeck creates: identity only, no text.
function serverShapeEnergy(instanceId, syncInstance, name) {
  return createCard({ instanceId, syncInstance, ownerId: 'p1', name, type: 'Energy' });
}

test('SE1: Enriching Energy draws 4 once its text arrives through cardStats', () => {
  let state = game();
  state.players.p1.zones.active.push(
    createCard({ instanceId: 1, ownerId: 'p1', supertype: 'Pokémon', name: 'Snorlax', stage: 'Basic', hp: 150 })
  );
  state.players.p1.zones.hand.push(serverShapeEnergy(2, 0, 'Enriching Energy'));
  state.players.p2.zones.active.push(
    createCard({ instanceId: 9, ownerId: 'p2', supertype: 'Pokémon', name: 'Budew', stage: 'Basic', hp: 30 })
  );

  const payload = buildCardStatsPayload([
    { syncInstance: 0, name: 'Enriching Energy', type: 'Energy', subtypes: ['Special'], effect: ENRICHING },
  ]);
  const stats = applyCommand(state, { type: 'cardStats', payload, playerId: 'p1' });
  assert.equal(stats.error, null);
  state = stats.state;

  const res = applyCommand(state, {
    type: 'attachCard',
    payload: { instanceId: 2, targetInstanceId: 1 },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.hand.length, 4);
});
