import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../../game/room.mjs';
import { NO_JOURNAL, createJournal } from '../journal.mjs';
import { replayJournal } from '../replay.mjs';
import { createLogger } from '../../../shared/log/logger.mjs';
import { LIMITS } from '../../../shared/log/log-schema.mjs';
import { applyCommand } from '../../../shared/engine/reduce.mjs';
import { createRng } from '../../../shared/engine/rng.mjs';
import { hashState } from '../../../shared/engine/state.mjs';

const ENGINE = { applyCommand, createRng, hashState };
const deck = [
  [20, 'Pikachu', 'Pokémon', 'u', '001', 'e2e', 'x-1'],
  [20, 'Lightning Energy', 'Energy', 'u', '002', 'e2e', 'x-2'],
];

function makeLogCollector() {
  const entries = [];
  const logger = createLogger({
    now: Date.now,
    sink: ({ line }) => entries.push(JSON.parse(line)),
  });
  return { entries, log: logger.child({ room: 'r1' }) };
}

function setup(journalOptions = {}) {
  const { entries, log } = makeLogCollector();
  const journal = createJournal({ roomId: 'r1', log, ...journalOptions });
  const room = new GameRoom({ roomId: 'r1', rulesEnabled: false, seed: 7, journal });
  room.addPlayer('sock-a', 'p1', 'Ash');
  room.addPlayer('sock-b', 'p2', 'Gary');
  let seq = 0;
  const send = (socketId, type, payload = {}) =>
    room.handleCommand(socketId, { type, payload, clientSeq: ++seq });
  assert.equal(send('sock-a', 'loadDeck', { deckData: deck }).success, true);
  assert.equal(send('sock-b', 'loadDeck', { deckData: deck }).success, true);
  return { room, journal, entries, send };
}

const parsed = (journal) => journal.games().flatMap((g) => g.records.map((r) => JSON.parse(r)));
const cmds = (journal) => parsed(journal).filter((r) => r.k === 'cmd');

test('journal records created and seated rebases, then contiguous cmd records with hashes', () => {
  const { room, journal, send } = setup();
  const hashes = [];
  for (const type of ['draw', 'draw']) {
    assert.equal(send('sock-a', type).success, true);
    hashes.push(hashState(room.state));
  }
  const bad = send('sock-a', 'noSuchCommand');
  assert.equal(bad.success, false);

  const records = parsed(journal);
  assert.deepEqual(
    records.filter((r) => r.k === 'rebase').map((r) => r.why),
    ['created', 'seated:p1', 'seated:p2']
  );
  const commands = cmds(journal);
  assert.deepEqual(commands.map((r) => r.n), commands.map((_, i) => i + 1));
  const last = commands[commands.length - 1];
  assert.equal(last.ok, false);
  assert.equal(last.error, bad.error);
  const okTail = commands.slice(-3, -1);
  assert.deepEqual(okTail.map((r) => r.after.hash), hashes);
});

test('replayJournal reproduces the room state', () => {
  const { room, journal, send } = setup();
  send('sock-a', 'draw');
  send('sock-b', 'draw');
  send('sock-a', 'noSuchCommand');
  const records = parsed(journal);
  const result = replayJournal(records, ENGINE);
  assert.equal(result.ok, true, JSON.stringify(result.divergence));
  assert.equal(result.commands, records.filter((r) => r.k === 'cmd').length);
  assert.equal(hashState(result.state), hashState(room.state));
});

test('a tampered after.hash is reported as a hash divergence at that n', () => {
  const { journal, send } = setup();
  send('sock-a', 'draw');
  send('sock-a', 'draw');
  const records = parsed(journal);
  const target = records.filter((r) => r.k === 'cmd' && r.ok)[1];
  target.after.hash = 'tampered';
  const result = replayJournal(records, ENGINE);
  assert.equal(result.ok, false);
  assert.equal(result.divergence.kind, 'hash');
  assert.equal(result.divergence.n, target.n);
});

test('resetGame starts a new game and only the last two are kept', () => {
  const { room, journal } = setup();
  room.resetGame();
  let records = journal.games();
  const lastRecord = JSON.parse(records[records.length - 1].records[0]);
  assert.equal(lastRecord.k, 'rebase');
  assert.equal(lastRecord.why, 'reset');
  assert.equal(lastRecord.game, 2);
  room.resetGame();
  room.resetGame();
  assert.ok(journal.games().length <= 2);
  assert.equal(JSON.parse(journal.games().at(-1).records[0]).game, 4);
});

test('a state change outside a command adds an unjournaled-change rebase, replay stays ok', () => {
  const { room, journal, send } = setup();
  send('sock-a', 'draw');
  room.state.stateVersion += 1;
  send('sock-a', 'draw');
  const records = parsed(journal);
  const idx = records.findLastIndex((r) => r.k === 'cmd');
  assert.equal(records[idx - 1].k, 'rebase');
  assert.equal(records[idx - 1].why, 'unjournaled-change');
  assert.equal(journal.games().length, 1);
  assert.equal(replayJournal(records, ENGINE).ok, true);
});

test('rng use outside a command adds an rng record, replay stays ok', () => {
  const { room, journal, send } = setup();
  send('sock-a', 'draw');
  room.rng.next();
  send('sock-a', 'draw');
  const records = parsed(journal);
  const idx = records.findLastIndex((r) => r.k === 'cmd');
  assert.equal(records[idx - 1].k, 'rng');
  assert.equal(replayJournal(records, ENGINE).ok, true);
});

test('the state ring is bounded', () => {
  const { journal, send } = setup({ limits: { ...LIMITS, stateRing: 3 } });
  for (let i = 0; i < 6; i++) send('sock-a', 'draw');
  assert.ok(journal.states().length <= 3);
  assert.ok(journal.states().length > 0);
});

test('the per-game byte cap truncates commands and marks the journal incomplete', () => {
  const { journal, send } = setup({ limits: { ...LIMITS, journalGameBytes: 200 } });
  send('sock-a', 'draw');
  const truncated = cmds(journal).filter((r) => r.cmd._truncated === true);
  assert.ok(truncated.length > 0);
  assert.equal(journal.stats().complete, false);
  const result = replayJournal(parsed(journal), ENGINE);
  assert.equal(result.divergence.kind, 'truncated');
});

test('a deduped clientSeq adds no journal record and logs one cmd/dedupe entry', () => {
  const { room, journal, entries } = setup();
  const cmd = { type: 'draw', payload: {}, clientSeq: 500 };
  assert.equal(room.handleClientCommand('sock-a', cmd).success, true);
  const before = journal.stats().records;
  const second = room.handleClientCommand('sock-a', cmd);
  assert.equal(second.dedupe, true);
  assert.equal(journal.stats().records, before);
  const dedupes = entries.filter((e) => e.cat === 'cmd' && e.ev === 'dedupe');
  assert.equal(dedupes.length, 1);
  assert.equal(dedupes[0].cs, 500);
});

test('a throwing hash never reaches the room and is logged once', () => {
  const { entries, log } = makeLogCollector();
  const journal = createJournal({
    roomId: 'r1',
    log,
    hash: () => {
      throw new Error('boom');
    },
  });
  const room = new GameRoom({ roomId: 'r1', rulesEnabled: false, journal });
  room.addPlayer('sock-a', 'p1', 'Ash');
  const first = room.handleCommand('sock-a', { type: 'loadDeck', payload: { deckData: deck }, clientSeq: 1 });
  const second = room.handleCommand('sock-a', { type: 'draw', payload: {}, clientSeq: 2 });
  assert.equal(first.success, true);
  assert.equal(second.success, true);
  const failed = entries.filter((e) => e.cat === 'journal' && e.ev === 'failed');
  assert.equal(failed.length, 1);
});

test('a room without a journal keeps the no-op default', () => {
  const room = new GameRoom({ roomId: 'plain', rulesEnabled: false });
  assert.equal(room.journal, NO_JOURNAL);
  room.addPlayer('sock-a', 'p1', 'Ash');
  assert.equal(room.handleCommand('sock-a', { type: 'draw', payload: {}, clientSeq: 1 }).success, true);
  assert.deepEqual(NO_JOURNAL.games(), []);
  assert.equal(NO_JOURNAL.stats().complete, true);
});

test('onRecord receives every record line in order, and a throwing onRecord leaves the journal intact', () => {
  const seen = [];
  const { journal, send } = setup({ onRecord: (line) => seen.push(line) });
  assert.equal(send('sock-a', 'draw').success, true);
  const stored = journal.games().flatMap((g) => g.records);
  assert.deepEqual(seen, stored);
  assert.ok(seen.length > 0);

  const { journal: sturdy, entries, send: sendSturdy } = setup({
    onRecord: () => {
      throw new Error('disk full');
    },
  });
  assert.equal(sendSturdy('sock-a', 'draw').success, true);
  assert.ok(sturdy.games().flatMap((g) => g.records).length > 0);
  assert.equal(entries.filter((e) => e.cat === 'journal' && e.ev === 'failed').length, 0);
});

test('an undo is one journaled command and the replay reproduces the rewound state', () => {
  const { room, journal, send } = setup();
  assert.equal(send('sock-a', 'draw').success, true);
  assert.equal(send('sock-a', 'draw').success, true);
  const handBefore = room.state.players.p1.zones.hand.length;
  assert.equal(send('sock-a', 'undo', { count: 1 }).success, true);
  assert.equal(room.state.players.p1.zones.hand.length, handBefore - 1);

  const commands = cmds(journal);
  assert.equal(commands[commands.length - 1].cmd.type, 'undo');
  assert.equal(commands[commands.length - 1].ok, true);
  const result = replayJournal(parsed(journal), ENGINE);
  assert.equal(result.ok, true, JSON.stringify(result.divergence));
  assert.equal(hashState(result.state), hashState(room.state));
});

test('a solo room journals the seat the command acted for', () => {
  const { entries, log } = makeLogCollector();
  const journal = createJournal({ roomId: 'r1', log });
  const room = new GameRoom({ roomId: 'r1', rulesEnabled: false, seed: 7, journal });
  assert.equal(room.addSoloPlayer('sock-solo', 'Ash', { p1: deck, p2: deck }), true);
  const result = room.handleClientCommand('sock-solo', { type: 'loadDeck', payload: { deckData: deck }, clientSeq: 1, seat: 'p2' });
  assert.equal(result.success, true, JSON.stringify(result));

  const last = cmds(journal).at(-1);
  assert.equal(last.playerId, 'p2');
  const mirror = entries.filter((e) => e.cat === 'engine' && e.ev === 'applied').at(-1);
  assert.equal(mirror.seat, 'p2');
  assert.equal(mirror.cs, 1);
  assert.deepEqual(
    parsed(journal).filter((r) => r.k === 'rebase').map((r) => r.why),
    ['created', 'seated:p1', 'seated:p2']
  );
  assert.equal(replayJournal(parsed(journal), ENGINE).ok, true);
});
