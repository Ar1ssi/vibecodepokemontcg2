import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../room.mjs';
import { createClockTransport } from '../clock-transport.mjs';
import { createCard } from '../../../shared/engine/cards.mjs';
import { applyCommand } from '../../../shared/engine/reduce.mjs';
import {
  CLOCK_BANK_MS,
  CLOCK_INCREMENT_MS,
  clockRunner,
  createClock,
  decksAreHomebrew,
  formatClock,
  syncClock,
} from '../../../shared/engine/homebrew-clock.mjs';

// Design 090: the homebrew chess clock (3:00 bank, +15 s per finished turn, 0:00 loses).

const card = (id, ownerId, n) => createCard({ instanceId: `${ownerId}-${n}`, ownerId, name: 'Card', id });

function seatDecks(state, { p1 = 'customhb-578', p2 = 'customhb-578' } = {}) {
  state.players.p1.zones.deck = [card(p1, 'p1', 1), card('sv1-1', 'p1', 2)];
  state.players.p2.zones.deck = [card(p2, 'p2', 1), card('sv1-1', 'p2', 2)];
}

function startPlay(state, player = 'p1', number = 1) {
  state.turn.phase = 'main';
  state.turn.number = number;
  state.turn.player = player;
  delete state.openingDrawPending;
}

function roomInPlay({ decks, enabled = true } = {}) {
  let now = 1_000_000;
  const room = new GameRoom({ roomId: 'clock-room', rulesEnabled: false, now: () => now });
  room.addPlayer('sock-1', 'p1', 'Ash');
  room.addPlayer('sock-2', 'p2', 'Gary');
  if (!enabled) room.setClockEnabled(false);
  const changes = [];
  room.onClockChange = (r) => changes.push(r.clockPayload());
  seatDecks(room.state, decks);
  startPlay(room.state);
  return { room, changes, advance: (ms) => (now += ms) };
}

const pass = (room, socketId, clientSeq) => room.handleClientCommand(socketId, { type: 'pass', clientSeq });

test('decksAreHomebrew needs a customhb card in both decks', () => {
  const state = { players: { p1: { zones: { deck: [{ id: 'customhb-1' }] } }, p2: { zones: { hand: [{ id: 'customhb-9' }] } } } };
  assert.equal(decksAreHomebrew(state), true);
  state.players.p2.zones.hand = [{ id: 'sv1-1' }, { id: 'customdemo-1' }];
  assert.equal(decksAreHomebrew(state), false);
  assert.equal(decksAreHomebrew({ players: { p1: state.players.p1 } }), false);
});

test('clockRunner: the chooser of a pending prompt, else the turn player; nobody outside play', () => {
  const state = { turn: { phase: 'main', number: 3, player: 'p1' }, pendingChoice: null };
  assert.equal(clockRunner(state), 'p1');
  state.pendingChoice = { player: 'p2' };
  assert.equal(clockRunner(state), 'p2');
  assert.equal(clockRunner({ ...state, openingDrawPending: 'p1' }), null);
  assert.equal(clockRunner({ turn: { phase: 'setup', number: 0, player: 'p1' } }), null);
  assert.equal(clockRunner({ turn: { phase: 'ended', number: 4, player: 'p1' } }), null);
});

test('syncClock charges the runner, credits +15 s per finished turn, and never twice after undo', () => {
  const state = { players: { p1: { zones: { deck: [{ id: 'customhb-1' }] } }, p2: { zones: { deck: [{ id: 'customhb-2' }] } } }, turn: { phase: 'main', number: 1, player: 'p1' } };
  const clock = syncClock(createClock(), state, 0);
  assert.equal(clock.armed, true);
  assert.deepEqual(clock.banks, { p1: CLOCK_BANK_MS, p2: CLOCK_BANK_MS });
  assert.equal(clock.runner, 'p1');

  state.turn = { phase: 'main', number: 2, player: 'p2' };
  syncClock(clock, state, 40_000);
  assert.equal(clock.banks.p1, CLOCK_BANK_MS - 40_000 + CLOCK_INCREMENT_MS);
  assert.equal(clock.runner, 'p2');

  // Undo back to turn 1 and pass again: the second end of turn 1 earns nothing.
  state.turn = { phase: 'main', number: 1, player: 'p1' };
  syncClock(clock, state, 50_000);
  state.turn = { phase: 'main', number: 2, player: 'p2' };
  syncClock(clock, state, 60_000);
  assert.equal(clock.banks.p1, CLOCK_BANK_MS - 40_000 + CLOCK_INCREMENT_MS - 10_000);
  assert.equal(clock.banks.p2, CLOCK_BANK_MS - 10_000 - 0);
});

test('the clock stays off unless both decks are homebrew, or when the toggle is off', () => {
  const state = { players: { p1: { zones: { deck: [{ id: 'customhb-1' }] } }, p2: { zones: { deck: [{ id: 'sv1-1' }] } } }, turn: { phase: 'main', number: 1, player: 'p1' } };
  assert.equal(syncClock(createClock(), state, 0).armed, false);
  state.players.p2.zones.deck = [{ id: 'customhb-3' }];
  const off = syncClock(createClock({ enabled: false }), state, 0);
  assert.equal(off.armed, null);
  assert.equal(off.runner, null);
});

test('formatClock rounds up to whole seconds', () => {
  assert.equal(formatClock(CLOCK_BANK_MS), '3:00');
  assert.equal(formatClock(14_001), '0:15');
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(-5), '0:00');
});

test('engine timeOut: the acting player loses, even while the opponent owes a prompt', () => {
  const { room } = roomInPlay();
  room.state.pendingChoice = { choiceId: 'c1', player: 'p2', options: [] };
  const result = applyCommand(room.state, { type: 'timeOut', playerId: 'p1' });
  assert.equal(result.error ?? null, null);
  assert.equal(result.state.turn.phase, 'ended');
  assert.equal(result.state.winner, 'p2');
  assert.equal(result.state.winReason, 'time ran out');
  assert.equal(result.state.pendingChoice, null);
});

test('engine timeOut is legal under the rules engine too', () => {
  const { room } = roomInPlay();
  room.state.rulesEnabled = true;
  const result = applyCommand(room.state, { type: 'timeOut', playerId: 'p2' });
  assert.equal(result.error ?? null, null);
  assert.equal(result.state.winner, 'p1');
});

test('room: a pass hands the clock over and credits the passer 15 s', () => {
  const { room, changes, advance } = roomInPlay();
  assert.equal(pass(room, 'sock-1', 0).success, true); // arms on the first command in play
  advance(30_000);
  assert.equal(room.state.turn.player, 'p2');
  assert.equal(pass(room, 'sock-2', 0).success, true);
  const snapshot = changes.at(-1);
  assert.equal(snapshot.active, true);
  assert.equal(snapshot.runner, 'p1');
  assert.equal(snapshot.remaining.p2, CLOCK_BANK_MS - 30_000 + CLOCK_INCREMENT_MS);
  assert.deepEqual(snapshot.players.map((p) => p.username), ['Ash', 'Gary']);
});

test('room: flagTimeOut ends the game for the runner only once their bank is empty', () => {
  const { room, advance } = roomInPlay();
  pass(room, 'sock-1', 0);
  advance(CLOCK_BANK_MS - 1);
  assert.equal(room.flagTimeOut(), null);
  advance(1);
  const result = room.flagTimeOut();
  assert.equal(result.success, true);
  assert.equal(room.state.winner, 'p1');
  assert.equal(room.state.winReason, 'time ran out');
  assert.equal(room.getGameEndedPayload('p2').message, '🏆 Game over — opponent wins! (time ran out)');
  assert.equal(room.clockPayload().runner, null);
  assert.equal(room.flagTimeOut(), null);
});

test('room: a client cannot send timeOut', () => {
  const { room } = roomInPlay();
  const result = room.handleClientCommand('sock-1', { type: 'timeOut', clientSeq: 0 });
  assert.equal(result.success, false);
  assert.equal(result.error, 'bad_command');
  assert.equal(room.state.turn.phase, 'main');
});

test('room: toggle off before play keeps the clock off; it locks once the clock arms', () => {
  const off = roomInPlay({ enabled: false });
  pass(off.room, 'sock-1', 0);
  assert.equal(off.room.clockPayload().active, false);
  assert.equal(off.room.clockPayload().enabled, false);

  const on = roomInPlay();
  pass(on.room, 'sock-1', 0);
  assert.equal(on.room.setClockEnabled(false), false);
  assert.equal(on.room.clockPayload().active, true);
});

test('room: a non-homebrew match never runs the clock', () => {
  const { room, advance } = roomInPlay({ decks: { p2: 'sv1-1' } });
  pass(room, 'sock-1', 0);
  advance(CLOCK_BANK_MS * 2);
  assert.equal(room.clockPayload().active, false);
  assert.equal(room.flagTimeOut(), null);
});

test('room: reset starts a fresh clock with the room setting', () => {
  const { room } = roomInPlay();
  pass(room, 'sock-1', 0);
  room.resetGame();
  assert.equal(room.clock.armed, null);
  assert.equal(room.clock.enabled, true);
});

test('clock transport arms one timer for the running bank and fires the flag', () => {
  const { room } = roomInPlay();
  const emitted = [];
  const timers = [];
  const flagged = [];
  const transport = createClockTransport({
    emitToRoom: (roomId, payload) => emitted.push({ roomId, payload }),
    onFlag: (gameRoom, roomId) => flagged.push(roomId),
    setTimer: (fn, ms) => timers.push({ fn, ms, cleared: false }) && timers.at(-1),
    clearTimer: (timer) => {
      timer.cleared = true;
    },
  });
  room.onClockChange = (r) => transport.refresh(r, r.roomId);
  pass(room, 'sock-1', 0);
  pass(room, 'sock-2', 0);
  assert.equal(timers.length, 2);
  assert.equal(timers[0].cleared, true);
  assert.equal(timers[1].ms, CLOCK_BANK_MS + CLOCK_INCREMENT_MS * 0 + 25);
  assert.equal(emitted.at(-1).payload.runner, 'p1');
  timers[1].fn();
  assert.deepEqual(flagged, ['clock-room']);
  assert.equal(transport.hasTimer('clock-room'), false);
});
