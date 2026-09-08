import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createGameState, findCard, hashState } from '../../../shared/engine/state.mjs';
import { createCard } from '../../../shared/engine/cards.mjs';
import { createRelayedRng } from '../../../shared/engine/rng.mjs';
import {
  initializePlayerDeck,
  translateLegacyAction,
  ShadowSession,
} from '../shadow.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function fixtureDeck(prefix = 'Card') {
  return [
    [4, `${prefix} A`, 'Pokémon', 'http://img/a.png', 1, 'SET1', 'set1-1'],
    [4, `${prefix} B`, 'Pokémon', 'http://img/b.png', 2, 'SET1', 'set1-2'],
    [4, `${prefix} Energy`, 'Energy', 'http://img/e.png', 3, 'SET1', 'set1-3'],
    [
      4,
      `${prefix} Trainer`,
      'Trainer',
      'http://img/t.png',
      4,
      'SET1',
      'set1-4',
    ],
    [
      4,
      `${prefix} Basic`,
      'Pokémon',
      'http://img/basic.png',
      5,
      'SET1',
      'set1-5',
    ],
  ]; // 20 cards
}

test('initializePlayerDeck: populates player deck with sequential syncInstance IDs matching client buildDeck', () => {
  const state = createGameState({
    gameId: 'g1',
    players: { p1: { username: 'Alice' } },
  });
  const deck = fixtureDeck('Alpha');

  initializePlayerDeck(state, 'p1', deck);

  const playerDeck = state.players.p1.zones.deck;
  assert.equal(playerDeck.length, 20);
  assert.equal(playerDeck[0].syncInstance, 0);
  assert.equal(playerDeck[0].instanceId, 1);
  assert.equal(playerDeck[0].name, 'Alpha A');
  assert.equal(playerDeck[19].syncInstance, 19);
  assert.equal(playerDeck[19].instanceId, 20);
  assert.equal(playerDeck[19].name, 'Alpha Basic');
});

test('Finding 3: initializePlayerDeck mints globally unique instanceIds across players', () => {
  const state = createGameState({
    gameId: 'g-finding3',
    players: {
      p1: { username: 'Alice' },
      p2: { username: 'Bob' },
    },
  });

  initializePlayerDeck(state, 'p1', fixtureDeck('Alpha'));
  initializePlayerDeck(state, 'p2', fixtureDeck('Beta'));

  const p1Deck = state.players.p1.zones.deck;
  const p2Deck = state.players.p2.zones.deck;

  assert.equal(p1Deck.length, 20);
  assert.equal(p2Deck.length, 20);

  // All 40 instanceIds must be unique
  const allInstanceIds = new Set([
    ...p1Deck.map((c) => c.instanceId),
    ...p2Deck.map((c) => c.instanceId),
  ]);
  assert.equal(allInstanceIds.size, 40, 'All 40 cards must have distinct instanceIds');

  // Verify p2 cards do not collide with p1
  for (const card of p2Deck) {
    assert.ok(card.instanceId > 20, `P2 card ${card.name} must have instanceId > 20`);
  }

  // Verify findCard correctly resolves P2 card to P2
  const p2Card = p2Deck[0];
  const resolved = findCard(state, p2Card.instanceId);
  assert.ok(resolved);
  assert.equal(resolved.playerId, 'p2');
  assert.equal(resolved.card.instanceId, p2Card.instanceId);
});

test('translateLegacyAction: setup deals 7 cards to hand and 6 to prizes after shuffle', () => {
  const state = createGameState({
    gameId: 'g1',
    players: { p1: { username: 'Alice' } },
  });
  initializePlayerDeck(state, 'p1', fixtureDeck('P1'));
  const rng = createRelayedRng();

  // Reverse 20 cards via relayed indices
  const reverseIndices = Array.from({ length: 20 }, (_, i) => 19 - i);

  const res = translateLegacyAction(
    'setup',
    [reverseIndices],
    'p1',
    state,
    rng
  );
  assert.equal(res.handled, true);

  const p1 = state.players.p1;
  assert.equal(p1.zones.hand.length, 7);
  assert.equal(p1.zones.prizes.length, 6);
  assert.equal(p1.zones.deck.length, 7); // 20 - 7 - 6 = 7 left

  // First hand card was index 19 (the top after reverse)
  assert.equal(p1.zones.hand[0].syncInstance, 19);
});

test('translateLegacyAction: setupPrizes and drawOpeningHand split setup steps accurately', () => {
  const state = createGameState({
    gameId: 'g1',
    players: { p1: { username: 'Alice' } },
  });
  initializePlayerDeck(state, 'p1', fixtureDeck('P1'));
  const rng = createRelayedRng();

  translateLegacyAction('setupPrizes', [null], 'p1', state, rng);
  assert.equal(state.players.p1.zones.prizes.length, 6);
  assert.equal(state.players.p1.zones.hand.length, 0);
  assert.equal(state.players.p1.zones.deck.length, 14);

  translateLegacyAction('drawOpeningHand', ['p1'], 'p1', state, rng);
  assert.equal(state.players.p1.zones.prizes.length, 6);
  assert.equal(state.players.p1.zones.hand.length, 7);
  assert.equal(state.players.p1.zones.deck.length, 7);
});

test('translateLegacyAction: moveCardBundle translates to moveCard command', () => {
  const state = createGameState({
    gameId: 'g1',
    players: { p1: { username: 'Alice' } },
  });
  initializePlayerDeck(state, 'p1', fixtureDeck('P1'));
  translateLegacyAction('setup', [null], 'p1', state);

  // Moving card from hand[0] to active
  const movingCard = state.players.p1.zones.hand[0];
  const res = translateLegacyAction(
    'moveCardBundle',
    ['self', 'hand', 'active', 0, false, 'move', null],
    'p1',
    state
  );

  assert.ok(res.command);
  assert.equal(res.command.type, 'moveCard');
  assert.equal(res.command.payload.instanceId, movingCard.instanceId);
  assert.equal(res.command.payload.from, 'hand');
  assert.equal(res.command.payload.to, 'active');
});

test('translateLegacyAction: moveCardBundle of energy to existing active Pokemon translates to attachCard', () => {
  const state = createGameState({
    gameId: 'g1',
    players: { p1: { username: 'Alice' } },
  });
  initializePlayerDeck(state, 'p1', fixtureDeck('P1'));
  translateLegacyAction('setup', [null], 'p1', state);

  // Put a Pokemon into active
  const pokemon = createCard({
    instanceId: 98,
    syncInstance: 98,
    name: 'P1 Active',
    type: 'Pokémon',
  });
  state.players.p1.zones.active.push(pokemon);

  // Put an energy card in hand
  const energyCard = createCard({
    instanceId: 99,
    syncInstance: 99,
    name: 'P1 Energy',
    type: 'Energy',
  });
  state.players.p1.zones.hand.push(energyCard);
  const energyIdx = state.players.p1.zones.hand.length - 1;

  const res = translateLegacyAction(
    'moveCardBundle',
    ['self', 'hand', 'active', energyIdx, 0, 'move', null],
    'p1',
    state
  );

  assert.ok(res.command);
  assert.equal(res.command.type, 'attachCard');
  assert.equal(res.command.payload.instanceId, energyCard.instanceId);
  assert.equal(res.command.payload.targetInstanceId, pokemon.instanceId);
});

test('translateLegacyAction: manual damage counter action translates correctly', () => {
  const state = createGameState({
    gameId: 'g1',
    players: { p1: { username: 'Alice' } },
  });
  initializePlayerDeck(state, 'p1', fixtureDeck('P1'));
  state.players.p1.zones.active.push(state.players.p1.zones.deck[0]);

  const activeCard = state.players.p1.zones.active[0];
  const res = translateLegacyAction(
    'addDamageCounter',
    ['self', 'active', 0, 30],
    'p1',
    state
  );

  assert.ok(res.command);
  assert.equal(res.command.type, 'addDamageCounter');
  assert.equal(res.command.payload.instanceId, activeCard.instanceId);
  assert.equal(res.command.payload.amount, 30);
});

test('ShadowSession: ingests relay traffic, tracks syncCheck, and detects exact matches', () => {
  const tmpLog = path.join(__dirname, 'test-shadow-mismatches.log');
  if (fs.existsSync(tmpLog)) fs.unlinkSync(tmpLog);

  const shadow = new ShadowSession({
    roomId: 'test-room',
    logFilePath: tmpLog,
  });
  shadow.addPlayer('sock-1', 'p1', 'Alice');

  // Ingest deck
  const deck = fixtureDeck('Alice');
  shadow.ingestAction('sock-1', {
    action: 'exchangeData',
    parameters: ['Alice', deck, 'sleeve.png', false, false, 'mat-1'],
    counter: 1,
    roomId: 'test-room',
  });

  // Ingest setup
  shadow.ingestAction('sock-1', {
    action: 'setup',
    parameters: [null],
    counter: 2,
    roomId: 'test-room',
  });

  // Client computes its hash: exact match
  const expectedHash = hashState(shadow.gameRoom.state, 'p1');
  const syncResult = shadow.checkSync('sock-1', {
    roomId: 'test-room',
    counter: 2,
    boardHash: expectedHash,
  });

  assert.equal(syncResult.match, true);
  assert.equal(syncResult.clientHash, expectedHash);
  assert.equal(syncResult.serverHash, expectedHash);

  const report = shadow.getReport();
  assert.equal(report.totalChecks, 1);
  assert.equal(report.matches, 1);
  assert.equal(report.mismatches, 0);
  assert.equal(report.mismatchRate, 0);

  if (fs.existsSync(tmpLog)) fs.unlinkSync(tmpLog);
});

test('ShadowSession: logs mismatch and groups telemetry by preceding command when hashes differ', () => {
  const tmpLog = path.join(__dirname, 'test-shadow-mismatch-log.log');
  if (fs.existsSync(tmpLog)) fs.unlinkSync(tmpLog);

  const shadow = new ShadowSession({
    roomId: 'test-room-2',
    logFilePath: tmpLog,
  });
  shadow.addPlayer('sock-2', 'p1', 'Bob');

  shadow.ingestAction('sock-2', {
    action: 'draw',
    parameters: ['self', 2],
    counter: 5,
    roomId: 'test-room-2',
  });

  // Client reports diverged hash
  const syncResult = shadow.checkSync('sock-2', {
    roomId: 'test-room-2',
    counter: 5,
    boardHash: 'diverged-client-hash-12345',
  });

  assert.equal(syncResult.match, false);
  assert.equal(syncResult.precedingAction, 'draw');

  const report = shadow.getReport();
  assert.equal(report.totalChecks, 1);
  assert.equal(report.matches, 0);
  assert.equal(report.mismatches, 1);
  assert.equal(report.mismatchesByAction.draw, 1);

  // File logging verified
  assert.ok(fs.existsSync(tmpLog));
  const logContent = fs.readFileSync(tmpLog, 'utf8');
  assert.ok(logContent.includes('MISMATCH'));
  assert.ok(logContent.includes('action=draw'));
  assert.ok(logContent.includes('diverged-client-hash-12345'));

  if (fs.existsSync(tmpLog)) fs.unlinkSync(tmpLog);
});
