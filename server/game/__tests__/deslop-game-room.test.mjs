import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../room.mjs';
import { applySetupAction } from '../setup-actions.mjs';
import { NO_JOURNAL } from '../../log/journal.mjs';
import { PROTOCOL_VERSION } from '../../../shared/engine/commands.mjs';

function journalSpy() {
  const rebases = [];
  return { journal: { ...NO_JOURNAL, rebase: (_state, _rng, why) => rebases.push(why) }, rebases };
}

test('addPlayer refuses a username that is not a string, so it never reaches game state', () => {
  const room = new GameRoom({ roomId: 'deslop-username', rulesEnabled: false });
  for (const username of [['Ash'], { name: 'Ash' }, 7, null]) {
    assert.equal(room.addPlayer('sock-a', 'p1', username), false);
  }
  assert.equal(room.state.players.p1, undefined);
  assert.equal(room.addPlayer('sock-a', 'p1', 'Ash'), true);
});

// D256: the rename is an in-place mutation the journal's last-seen state object cannot notice.
test('a seat taking its real username rebases the journal; a same-name rejoin does not', () => {
  const { journal, rebases } = journalSpy();
  const room = new GameRoom({ roomId: 'deslop-rename', rulesEnabled: false, journal });
  room.addPlayer('sock-a', 'p1');
  assert.equal(room.state.players.p1.username, 'p1');
  assert.deepEqual(rebases, ['created', 'seated:p1']);

  room.addPlayer('sock-a', 'p1', 'Ash');
  assert.equal(room.state.players.p1.username, 'Ash');
  assert.deepEqual(rebases, ['created', 'seated:p1', 'renamed:p1']);

  room.addPlayer('sock-b', 'p1', 'Ash');
  assert.deepEqual(rebases, ['created', 'seated:p1', 'renamed:p1']);
});

function seatedRoom(rulesEnabled = false) {
  const room = new GameRoom({ roomId: 'deslop-seq', rulesEnabled });
  room.addPlayer('sock-a', 'p1', 'Ash');
  room.addPlayer('sock-b', 'p2', 'Gary');
  return room;
}

test('resolveChoice refuses a malformed clientSeq instead of poisoning the dedupe watermark', () => {
  for (const bad of [1e308, -1, 1.5, '3', Number.NaN]) {
    const room = seatedRoom();
    const refused = room.resolveChoice('sock-a', { choiceId: 'c', selection: [] }, bad);
    assert.equal(refused.error, 'bad_command');
    assert.equal(room.getClientSeq('p1'), 0, `clientSeq ${String(bad)} left the watermark alone`);
  }
  const room = seatedRoom();
  assert.equal(
    room.resolveChoice('sock-a', { choiceId: 'c', selection: [], clientSeq: 1e308 }).error,
    'bad_command',
    'the payload copy is held to the same rule'
  );
});

test('handleClientCommand refuses a clientSeq past the safe-integer range', () => {
  const room = seatedRoom();
  const refused = room.handleClientCommand('sock-a', {
    type: 'draw',
    payload: { count: 1 },
    clientSeq: 1e308,
  });
  assert.equal(refused.error, 'bad_command');
  assert.equal(room.getClientSeq('p1'), 0);
});

test('a present protocolVersion that is falsy is refused, not read as absent', () => {
  const room = seatedRoom();
  for (const protocolVersion of [0, '', false]) {
    const refused = room.handleCommand('sock-a', {
      type: 'draw',
      payload: { count: 1 },
      protocolVersion,
    });
    assert.equal(refused.error, 'version_mismatch');
    assert.equal(refused.expectedVersion, PROTOCOL_VERSION);
  }
  const absent = room.handleCommand('sock-a', { type: 'draw', payload: { count: 1 } });
  assert.notEqual(absent.error, 'version_mismatch');
});

test('resolveSeat: own seat in a normal room, bad_seat only for a solo socket naming no seat', () => {
  const room = seatedRoom();
  assert.deepEqual(room.resolveSeat('sock-a', { seat: 'p2' }), { seat: 'p1', refused: null });
  assert.deepEqual(room.resolveSeat('stranger'), { seat: null, refused: null });

  const solo = new GameRoom({ roomId: 'deslop-solo', rulesEnabled: false });
  solo.addSoloPlayer('sock-solo', 'Ash');
  assert.deepEqual(solo.resolveSeat('sock-solo', { seat: 'p2' }), { seat: 'p2', refused: null });
  assert.deepEqual(solo.resolveSeat('sock-solo', { seat: 'p9' }), { seat: null, refused: 'bad_seat' });
  assert.deepEqual(solo.resolveSeat('stranger', { seat: 'p1' }), { seat: null, refused: null });
});

test('applySetupAction names why a deck packet did not load', () => {
  const room = seatedRoom(true);
  const noDeck = applySetupAction(room, 'sock-a', 'p1', {
    action: 'loadDeckData',
    parameters: ['self', 'not-a-deck'],
  });
  assert.equal(noDeck.deckLoaded, false);
  assert.equal(noDeck.deckError.error, 'bad_deck');

  const deck = [[1, 'Pikachu', 'Pokémon', 'pika.png', '1', 'SVI', 'svi-1']];
  const loaded = applySetupAction(room, 'sock-a', 'p1', { action: 'loadDeckData', parameters: [deck] });
  assert.equal(loaded.deckLoaded, true);
  assert.equal(loaded.deckError, null);

  room.state.turn.phase = 'main';
  const late = applySetupAction(room, 'sock-a', 'p1', { action: 'loadDeckData', parameters: [deck] });
  assert.equal(late.deckLoaded, false);
  assert.equal(late.deckError.error, 'Cannot load a deck after the game has started.');
});
