import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hashBoardSnapshot } from '../../../shared/engine/zones/zone-hash.mjs';
import { ShadowSession } from '../shadow.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function fixtureDeck(prefix) {
  return [
    [
      4,
      `${prefix} Pikachu`,
      'Pokémon',
      'http://img/pika.png',
      1,
      'SET1',
      'set1-1',
    ],
    [
      4,
      `${prefix} Charmander`,
      'Pokémon',
      'http://img/char.png',
      2,
      'SET1',
      'set1-2',
    ],
    [
      6,
      `${prefix} Lightning Energy`,
      'Energy',
      'http://img/energy.png',
      3,
      'SET1',
      'set1-3',
    ],
    [
      6,
      `${prefix} Fire Energy`,
      'Energy',
      'http://img/fire.png',
      4,
      'SET1',
      'set1-4',
    ],
  ]; // 20 cards
}

test('Shadow E2E: Full 2-player game simulation runs through shadow mode with 0 mismatches', () => {
  const logFile = path.join(__dirname, 'e2e-shadow-mismatches.log');
  if (fs.existsSync(logFile)) fs.unlinkSync(logFile);

  const shadow = new ShadowSession({
    roomId: 'e2e-shadow-game',
    logFilePath: logFile,
  });

  // 1. Join room
  shadow.addPlayer('sock-a', 'p1', 'Player-A');
  shadow.addPlayer('sock-b', 'p2', 'Player-B');

  // 2. Exchange decks (20 cards each)
  const deckA = fixtureDeck('Alpha');
  const deckB = fixtureDeck('Bravo');

  shadow.ingestAction('sock-a', {
    action: 'exchangeData',
    parameters: ['Player-A', deckA, 'sleeve-a.png', false, false, 'mat-1'],
    counter: 1,
    roomId: 'e2e-shadow-game',
  });

  shadow.ingestAction('sock-b', {
    action: 'exchangeData',
    parameters: ['Player-B', deckB, 'sleeve-b.png', false, false, 'mat-2'],
    counter: 1,
    roomId: 'e2e-shadow-game',
  });

  // Client A and B check initial sync
  const clientAHash0 = hashBoardSnapshot({
    ...shadow.gameRoom.state.players.p1.zones,
    stadium: [],
  });
  const clientBHash0 = hashBoardSnapshot({
    ...shadow.gameRoom.state.players.p2.zones,
    stadium: [],
  });

  assert.equal(
    shadow.checkSync('sock-a', {
      roomId: 'e2e-shadow-game',
      counter: 1,
      boardHash: clientAHash0,
    }).match,
    true
  );

  assert.equal(
    shadow.checkSync('sock-b', {
      roomId: 'e2e-shadow-game',
      counter: 1,
      boardHash: clientBHash0,
    }).match,
    true
  );

  // 3. Setup (shuffle deck and deal 7 hand, 6 prizes)
  const shuffleIndicesA = Array.from({ length: 20 }, (_, i) => (i * 7) % 20);
  const shuffleIndicesB = Array.from({ length: 20 }, (_, i) => (i * 3) % 20);

  shadow.ingestAction('sock-a', {
    action: 'setup',
    parameters: [shuffleIndicesA],
    counter: 2,
    roomId: 'e2e-shadow-game',
  });

  shadow.ingestAction('sock-b', {
    action: 'setup',
    parameters: [shuffleIndicesB],
    counter: 2,
    roomId: 'e2e-shadow-game',
  });

  // Client check sync after setup
  const clientAHash1 = hashBoardSnapshot({
    ...shadow.gameRoom.state.players.p1.zones,
    stadium: [],
  });
  const clientBHash1 = hashBoardSnapshot({
    ...shadow.gameRoom.state.players.p2.zones,
    stadium: [],
  });

  assert.equal(
    shadow.checkSync('sock-a', {
      roomId: 'e2e-shadow-game',
      counter: 2,
      boardHash: clientAHash1,
    }).match,
    true
  );

  assert.equal(
    shadow.checkSync('sock-b', {
      roomId: 'e2e-shadow-game',
      counter: 2,
      boardHash: clientBHash1,
    }).match,
    true
  );

  // 4. Player A plays Active Pokémon from hand
  const p1Hand = shadow.gameRoom.state.players.p1.zones.hand;
  const p1PikaIdx = p1Hand.findIndex((c) => c.name.includes('Pikachu'));
  assert.ok(p1PikaIdx >= 0);

  shadow.ingestAction('sock-a', {
    action: 'moveCardBundle',
    parameters: ['self', 'hand', 'active', p1PikaIdx, 0, 'move', null],
    counter: 3,
    roomId: 'e2e-shadow-game',
  });

  const clientAHash2 = hashBoardSnapshot({
    ...shadow.gameRoom.state.players.p1.zones,
    stadium: [],
  });
  assert.equal(
    shadow.checkSync('sock-a', {
      roomId: 'e2e-shadow-game',
      counter: 3,
      boardHash: clientAHash2,
    }).match,
    true
  );

  // 5. Player A attaches Energy from hand to Active
  const p1EnergyIdx = shadow.gameRoom.state.players.p1.zones.hand.findIndex(
    (c) => c.name.includes('Energy')
  );
  assert.ok(p1EnergyIdx >= 0);

  shadow.ingestAction('sock-a', {
    action: 'moveCardBundle',
    parameters: ['self', 'hand', 'active', p1EnergyIdx, 0, 'move', null],
    counter: 4,
    roomId: 'e2e-shadow-game',
  });

  const clientAHash3 = hashBoardSnapshot({
    ...shadow.gameRoom.state.players.p1.zones,
    stadium: [],
  });
  assert.equal(
    shadow.checkSync('sock-a', {
      roomId: 'e2e-shadow-game',
      counter: 4,
      boardHash: clientAHash3,
    }).match,
    true
  );

  // 6. Player B plays Active Pokémon and takes damage
  const p2Hand = shadow.gameRoom.state.players.p2.zones.hand;
  const p2CharIdx = p2Hand.findIndex((c) => c.name.includes('Charmander'));
  assert.ok(p2CharIdx >= 0);

  shadow.ingestAction('sock-b', {
    action: 'moveCardBundle',
    parameters: ['self', 'hand', 'active', p2CharIdx, 0, 'move', null],
    counter: 3,
    roomId: 'e2e-shadow-game',
  });

  shadow.ingestAction('sock-b', {
    action: 'addDamageCounter',
    parameters: ['self', 'active', 0, 30],
    counter: 4,
    roomId: 'e2e-shadow-game',
  });

  const clientBHash2 = hashBoardSnapshot({
    ...shadow.gameRoom.state.players.p2.zones,
    stadium: [],
  });
  assert.equal(
    shadow.checkSync('sock-b', {
      roomId: 'e2e-shadow-game',
      counter: 4,
      boardHash: clientBHash2,
    }).match,
    true
  );

  // 7. Verify telemetry report has 0 mismatches
  const report = shadow.getReport();
  assert.equal(report.totalChecks, 7);
  assert.equal(report.matches, 7);
  assert.equal(report.mismatches, 0);
  assert.equal(report.mismatchRate, 0);

  if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
});
