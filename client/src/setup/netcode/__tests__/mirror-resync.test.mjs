import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIRROR_RESYNC_MIN_INTERVAL_MS,
  reportMirrorDesync,
  resetMirrorResyncThrottle,
} from '../mirror-resync.mjs';

function makeCard(name) {
  return { name, number: '1', set: 'base1', syncInstance: 1 };
}

function makeGetZone(data) {
  return (user, zoneId) => ({ array: data[user]?.[zoneId] || [] });
}

function makeSocket() {
  const emitted = [];
  return {
    emitted,
    emit: (event, payload) => emitted.push({ event, payload }),
  };
}

const liveZones = makeGetZone({
  self: { hand: [makeCard('Pikachu')], active: [], prizes: [] },
});

test('a refused mirror move reports the zones so the server can name the divergence', () => {
  resetMirrorResyncThrottle();
  const socket = makeSocket();
  const result = reportMirrorDesync({
    socket,
    roomId: 'room1',
    getZoneFn: liveZones,
    zoneId: 'hand',
    reason: 'hint_mismatch',
  });

  assert.equal(result.sent, true);
  assert.equal(socket.emitted.length, 1);
  assert.equal(socket.emitted[0].event, 'syncCheck');
  assert.equal(socket.emitted[0].payload.roomId, 'room1');

  const { zones } = socket.emitted[0].payload;
  assert.ok('hand' in zones, 'the zone the move was reading is hashed');
  assert.ok('active' in zones);
  assert.ok(!('deck' in zones), 'I24: deck stays out of the comparison');
  assert.equal(zones.hand, result.zones.hand);
});

test('no transport, no zone source, or no room means no report — never a throw', () => {
  resetMirrorResyncThrottle();
  const socket = makeSocket();

  assert.deepEqual(
    reportMirrorDesync({ roomId: 'room1', getZoneFn: liveZones }),
    {
      sent: false,
      reason: 'no_socket',
    }
  );
  assert.deepEqual(reportMirrorDesync({ socket, getZoneFn: liveZones }), {
    sent: false,
    reason: 'no_room',
  });
  assert.deepEqual(reportMirrorDesync({ socket, roomId: 'room1' }), {
    sent: false,
    reason: 'no_zone_source',
  });
  assert.equal(socket.emitted.length, 0);
});

// One diverged mirror rejects a burst of moves; each one must not become another
// compare → desync → peer-log replay for the same divergence.
test('reports are throttled, then allowed again once the window passes', () => {
  resetMirrorResyncThrottle();
  const socket = makeSocket();
  const args = { socket, roomId: 'room1', getZoneFn: liveZones, now: 1000 };

  assert.equal(reportMirrorDesync(args).sent, true);
  assert.equal(
    reportMirrorDesync({
      ...args,
      now: 1000 + MIRROR_RESYNC_MIN_INTERVAL_MS - 1,
    }).reason,
    'throttled'
  );
  assert.equal(socket.emitted.length, 1);

  assert.equal(
    reportMirrorDesync({ ...args, now: 1000 + MIRROR_RESYNC_MIN_INTERVAL_MS })
      .sent,
    true
  );
  assert.equal(socket.emitted.length, 2);
});

test('the reported hashes follow the live zone contents, not a snapshot', () => {
  resetMirrorResyncThrottle();
  const socket = makeSocket();
  const before = reportMirrorDesync({
    socket,
    roomId: 'room1',
    getZoneFn: makeGetZone({ self: { hand: [makeCard('Pikachu')] } }),
  });

  resetMirrorResyncThrottle();
  const after = reportMirrorDesync({
    socket,
    roomId: 'room1',
    getZoneFn: makeGetZone({
      self: { hand: [], active: [makeCard('Pikachu')] },
    }),
  });

  assert.notEqual(before.zones.hand, after.zones.hand);
  assert.notEqual(before.zones.active, after.zones.active);
});
