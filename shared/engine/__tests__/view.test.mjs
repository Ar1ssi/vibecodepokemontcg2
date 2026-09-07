import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { viewFor } from '../view.mjs';

function setupSampleGame() {
  const state = createGameState({
    gameId: 'game-redaction-test',
    players: {
      p1: { username: 'PlayerOne' },
      p2: { username: 'PlayerTwo' },
    },
  });

  // P1 cards
  const p1Hand1 = createCard({ instanceId: 10, name: 'Secret Ultra Ball', set: 'SVI', number: '196', src: 'ultraball.png' });
  const p1Hand2 = createCard({ instanceId: 11, name: 'Secret Professor Research', set: 'SVI', number: '189', src: 'research.png' });
  const p1Deck1 = createCard({ instanceId: 12, name: 'Secret Lugia V', set: 'SIT', number: '138', src: 'lugia.png' });
  const p1Deck2 = createCard({ instanceId: 13, name: 'Secret Archeops', set: 'SIT', number: '147', src: 'archeops.png' });
  const p1PrizeUnrevealed = createCard({ instanceId: 14, name: 'Secret Double Turbo', set: 'BRS', number: '151', revealed: false });
  const p1PrizeRevealed = createCard({ instanceId: 15, name: 'Revealed Boss Orders', set: 'PAL', number: '172', revealed: true });
  const p1Active = createCard({ instanceId: 16, name: 'Public Raichu', set: 'PAL', number: '211', damage: 30 });

  state.players.p1.zones.hand.push(p1Hand1, p1Hand2);
  state.players.p1.zones.deck.push(p1Deck1, p1Deck2);
  state.players.p1.zones.prizes.push(p1PrizeUnrevealed, p1PrizeRevealed);
  state.players.p1.zones.active.push(p1Active);

  // P2 cards
  const p2HandSecret = createCard({ instanceId: 20, name: 'Opponent Secret Iono', set: 'PAL', number: '185', src: 'iono.png' });
  const p2DeckSecret = createCard({ instanceId: 21, name: 'Opponent Secret Charizard', set: 'OBF', number: '125', src: 'charizard.png' });
  const p2PrizeSecret = createCard({ instanceId: 22, name: 'Opponent Secret Rare Candy', set: 'SVI', number: '191', revealed: false });
  const p2Active = createCard({ instanceId: 23, name: 'Opponent Public Pidgeot ex', set: 'OBF', number: '164' });

  state.players.p2.zones.hand.push(p2HandSecret);
  state.players.p2.zones.deck.push(p2DeckSecret);
  state.players.p2.zones.prizes.push(p2PrizeSecret);
  state.players.p2.zones.active.push(p2Active);

  return state;
}

test('Invariant 5: viewFor leaks no hidden opponent hand or deck info in serialized payload', () => {
  const state = setupSampleGame();
  const viewP1 = viewFor(state, 'p1');
  const serialized = JSON.stringify(viewP1);

  // P1 should see their own hand cards
  assert.ok(serialized.includes('Secret Ultra Ball'));
  assert.ok(serialized.includes('Secret Professor Research'));

  // P1 should NOT see opponent secret hand cards
  assert.equal(serialized.includes('Opponent Secret Iono'), false);
  assert.equal(serialized.includes('iono.png'), false);

  // Opponent hand card MUST keep its instanceId for animation continuity
  assert.ok(serialized.includes('"instanceId":20'));

  // Neither player's deck cards should leak into serialized JSON
  assert.equal(serialized.includes('Secret Lugia V'), false);
  assert.equal(serialized.includes('lugia.png'), false);
  assert.equal(serialized.includes('Opponent Secret Charizard'), false);
  assert.equal(serialized.includes('charizard.png'), false);

  // Deck zones must only reveal counts
  assert.equal(viewP1.you.zones.deck.count, 2);
  assert.equal(viewP1.them.zones.deck.count, 1);
});

test('Invariant 5: viewFor unrevealed prizes leak no card details, while revealed prizes show full info', () => {
  const state = setupSampleGame();
  const viewP1 = viewFor(state, 'p1');
  const serialized = JSON.stringify(viewP1);

  // Unrevealed prize should have instanceId 14 but NO name or set
  assert.equal(serialized.includes('Secret Double Turbo'), false);
  assert.ok(serialized.includes('"instanceId":14'));

  // Revealed prize should show name
  assert.ok(serialized.includes('Revealed Boss Orders'));
  assert.ok(serialized.includes('"instanceId":15'));

  // Opponent unrevealed prize should not leak name
  assert.equal(serialized.includes('Opponent Secret Rare Candy'), false);
  assert.ok(serialized.includes('"instanceId":22'));
});

test('viewFor maps absolute IDs to { you, them } per Hazard H1', () => {
  const state = setupSampleGame();

  const viewP1 = viewFor(state, 'p1');
  assert.equal(viewP1.you.playerId, 'p1');
  assert.equal(viewP1.you.username, 'PlayerOne');
  assert.equal(viewP1.them.playerId, 'p2');
  assert.equal(viewP1.them.username, 'PlayerTwo');
  assert.equal(viewP1.turn.isYourTurn, true);

  const viewP2 = viewFor(state, 'p2');
  assert.equal(viewP2.you.playerId, 'p2');
  assert.equal(viewP2.you.username, 'PlayerTwo');
  assert.equal(viewP2.them.playerId, 'p1');
  assert.equal(viewP2.them.username, 'PlayerOne');
  assert.equal(viewP2.turn.isYourTurn, false);
});

test('viewFor redacts PendingChoice options for opponent so secret deck searches do not leak', () => {
  const state = setupSampleGame();

  state.pendingChoice = {
    choiceId: 'choice-99',
    player: 'p1',
    prompt: 'Search your deck for a Pokémon',
    options: [
      createCard({ instanceId: 12, name: 'Secret Lugia V', set: 'SIT', number: '138' }),
      createCard({ instanceId: 13, name: 'Secret Archeops', set: 'SIT', number: '147' }),
    ],
    min: 1,
    max: 1,
    cancellable: false,
    resumeToken: { effectId: 'ultra-ball', stepIndex: 1 },
  };

  // P1 view contains options to choose from
  const viewP1 = viewFor(state, 'p1');
  assert.equal(viewP1.pendingChoice.options.length, 2);
  assert.equal(viewP1.pendingChoice.options[0].name, 'Secret Lugia V');

  // P2 view is REDACTED: receives prompt and player, but zero options
  const viewP2 = viewFor(state, 'p2');
  assert.equal(viewP2.pendingChoice.player, 'p1');
  assert.equal(viewP2.pendingChoice.options, undefined);
  assert.equal(viewP2.pendingChoice.optionsCount, 2);

  // Serialized P2 view MUST NOT contain 'Secret Lugia V' or 'Secret Archeops'
  const serializedP2 = JSON.stringify(viewP2);
  assert.equal(serializedP2.includes('Secret Lugia V'), false);
  assert.equal(serializedP2.includes('Secret Archeops'), false);
});

test('viewFor formats spectator view with hand and deck counts only', () => {
  const state = setupSampleGame();
  const specView = viewFor(state, null);
  const serialized = JSON.stringify(specView);

  assert.equal(specView.isSpectator, true);
  assert.equal(specView.you, null);
  assert.equal(specView.them, null);
  assert.ok(specView.players.p1);
  assert.ok(specView.players.p2);

  // Spectator sees hand count only, not card list
  assert.equal(specView.players.p1.zones.hand.count, 2);
  assert.equal(Array.isArray(specView.players.p1.zones.hand), false);

  // Spectator serialized payload does not leak secret hand or deck cards
  assert.equal(serialized.includes('Secret Ultra Ball'), false);
  assert.equal(serialized.includes('Opponent Secret Iono'), false);
  assert.equal(serialized.includes('Secret Lugia V'), false);

  // Spectator does see public active Pokémon
  assert.ok(serialized.includes('Public Raichu'));
  assert.ok(serialized.includes('Opponent Public Pidgeot ex'));
});
