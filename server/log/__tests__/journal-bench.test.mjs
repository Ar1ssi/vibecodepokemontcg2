import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { GameRoom } from '../../game/room.mjs';
import { createJournal } from '../journal.mjs';
import { createLogger } from '../../../shared/log/logger.mjs';

const COMMANDS = 200;
const BUDGET_MS = 0.5;
// A 60-card deck, the size of a real game; draw stays legal once the deck is empty.
const deck = [
  [30, 'Pikachu', 'Pokémon', 'u', '001', 'e2e', 'x-1'],
  [30, 'Lightning Energy', 'Energy', 'u', '002', 'e2e', 'x-2'],
];

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

function makeRoom(journal) {
  const room = journal
    ? new GameRoom({ roomId: 'r1', rulesEnabled: false, seed: 7, journal })
    : new GameRoom({ roomId: 'r1', rulesEnabled: false, seed: 7 });
  room.addPlayer('sock-a', 'p1', 'Ash');
  room.addPlayer('sock-b', 'p2', 'Gary');
  let seq = 0;
  const send = (socketId, type, payload = {}) =>
    room.handleCommand(socketId, { type, payload, clientSeq: ++seq });
  assert.equal(send('sock-a', 'loadDeck', { deckData: deck }).success, true);
  assert.equal(send('sock-b', 'loadDeck', { deckData: deck }).success, true);
  return send;
}

function timeCommands(send) {
  const durations = [];
  for (let i = 0; i < COMMANDS; i++) {
    const start = performance.now();
    const result = send('sock-a', 'draw');
    durations.push(performance.now() - start);
    assert.equal(result.success, true);
  }
  return durations;
}

test('handleCommand with a journal is at most 0.5 ms slower (median of 200) than without', (t) => {
  // A clock that steps 20 ms per entry keeps `engine/applied` under the flood gate, so every
  // command pays for its mirror entry too (a wall clock would suppress most of them).
  let clock = 0;
  let mirrored = 0;
  const log = createLogger({ now: () => (clock += 20), sink: () => { mirrored += 1; } }).child({ room: 'r1' });
  const journal = createJournal({ roomId: 'r1', log });
  const withJournal = makeRoom(journal);
  const withoutJournal = makeRoom(null);

  timeCommands(makeRoom(createJournal({ roomId: 'warm', log }))); // JIT warm-up, not measured
  const without = median(timeCommands(withoutJournal));
  const withJ = median(timeCommands(withJournal));
  t.diagnostic(`median with journal ${withJ.toFixed(4)} ms, without ${without.toFixed(4)} ms`);

  assert.equal(journal.stats().complete, true);
  assert.ok(mirrored >= COMMANDS * 2, 'every measured command wrote its mirror entry');
  assert.ok(withJ - without <= BUDGET_MS, `${(withJ - without).toFixed(4)} ms > ${BUDGET_MS} ms`);
});
