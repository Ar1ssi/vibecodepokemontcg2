import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../room.mjs';
import { initializePlayerDeck, extractDeckData } from '../shadow.mjs';

function fixtureDeck(prefix = 'Card') {
  return [
    [4, `${prefix} A`, 'Pokémon', 'http://img/a.png', 1, 'SET1', 'set1-1'],
    [4, `${prefix} B`, 'Pokémon', 'http://img/b.png', 2, 'SET1', 'set1-2'],
    [4, `${prefix} Energy`, 'Energy', 'http://img/e.png', 3, 'SET1', 'set1-3'],
    [4, `${prefix} Trainer`, 'Trainer', 'http://img/t.png', 4, 'SET1', 'set1-4'],
    [4, `${prefix} Basic`, 'Pokémon', 'http://img/basic.png', 5, 'SET1', 'set1-5'],
  ]; // 20 cards
}

test('Finding 4 regression: extractDeckData correctly resolves deckData from exchangeData and loadDeckData parameters', () => {
  const deck = fixtureDeck('Alpha');

  // exchangeData format: [username, deckData, cardBack, coachingMode, callback, matId]
  const exchangeDataParams = ['Alice', deck, 'sleeve.png', false, false, 'mat-1'];
  
  // Buggy index 2 access would have resolved to 'sleeve.png' (string), failing Array.isArray
  assert.equal(typeof exchangeDataParams[2], 'string');
  assert.equal(Array.isArray(exchangeDataParams[2]), false);

  // Correct parameter extraction resolves the deck array at index 1
  const extractedExchangeDeck = extractDeckData('exchangeData', exchangeDataParams);
  assert.ok(Array.isArray(extractedExchangeDeck));
  assert.equal(extractedExchangeDeck.length, 5);
  assert.deepEqual(extractedExchangeDeck, deck);

  // loadDeckData format: [deckData]
  const loadDeckDataParams = [deck];
  
  // Buggy index 1 access would have resolved to undefined, failing Array.isArray
  assert.equal(loadDeckDataParams[1], undefined);

  // Correct parameter extraction resolves the deck array at index 0
  const extractedLoadDeck = extractDeckData('loadDeckData', loadDeckDataParams);
  assert.ok(Array.isArray(extractedLoadDeck));
  assert.equal(extractedLoadDeck.length, 5);
  assert.deepEqual(extractedLoadDeck, deck);

  // Legacy loadDeckData format fallback: [user, deckData]
  const legacyLoadDeckParams = ['self', deck];
  const extractedLegacyDeck = extractDeckData('loadDeckData', legacyLoadDeckParams);
  assert.ok(Array.isArray(extractedLegacyDeck));
  assert.deepEqual(extractedLegacyDeck, deck);

  // Invalid/corrupted formats return null
  assert.equal(extractDeckData('exchangeData', ['Alice', 'not-a-deck']), null);
  assert.equal(extractDeckData('exchangeData', null), null);
  assert.equal(extractDeckData('loadDeckData', ['self', 'not-a-deck']), null);
  assert.equal(extractDeckData('loadDeckData', []), null);
  assert.equal(extractDeckData('unknownAction', [deck]), null);
});

test('Finding 4 authoritative server integration: pushAction with exchangeData initializes player deck in GameRoom', () => {
  const room = new GameRoom({ roomId: 'room-finding-4', rulesEnabled: false });
  room.addPlayer('socket-alice', 'p1', 'Alice');
  room.addPlayer('socket-bob', 'p2', 'Bob');

  const deck = fixtureDeck('Alice');
  const pushData = {
    action: 'exchangeData',
    parameters: ['Alice', deck, 'sleeve.png', false, false, 'mat-1'],
    counter: 1,
    roomId: 'room-finding-4',
  };

  // Simulate server.js pushAction handling logic
  const playerId = room.socketToPlayer.get('socket-alice');
  assert.equal(playerId, 'p1');

  // Verify that prior to fix, buggy indexing leaves deck empty
  const buggyDeckData =
    pushData.action === 'exchangeData'
      ? pushData.parameters?.[2]
      : pushData.parameters?.[1];
  assert.equal(Array.isArray(buggyDeckData), false);
  assert.equal(room.state.players.p1.zones.deck.length, 0);

  // Execute with fix via extractDeckData
  const deckData = extractDeckData(pushData.action, pushData.parameters);
  assert.ok(Array.isArray(deckData));
  if (Array.isArray(deckData)) {
    initializePlayerDeck(room.state, playerId, deckData);
  }

  // Player 1 deck must now be populated on authoritative GameRoom state
  assert.equal(room.state.players.p1.zones.deck.length, 20);
  assert.equal(room.state.players.p1.zones.deck[0].name, 'Alice A');
  assert.equal(room.state.players.p1.zones.deck[19].name, 'Alice Basic');
});
