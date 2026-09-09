import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSyncCheckZones,
  emitSyncCheck,
  shouldTriggerDesyncRecovery,
  viewBackedGetZone,
  SYNC_CHECK_INTERVAL_MS,
} from '../sync-check.js';
import { resetRenderState, applyView } from '../apply-view.js';

function makeCard(name) {
  return { name, number: '1', set: 'base1', syncInstance: 1 };
}

function makeGetZone(data) {
  return (user, zoneId) => ({ array: data[user]?.[zoneId] || [] });
}

test('computeSyncCheckZones hashes every player zone plus stadium, excluding deck', () => {
  const getZone = makeGetZone({
    self: { active: [makeCard('Pikachu')], stadium: [makeCard('Lost City')] },
  });
  const zones = computeSyncCheckZones('self', getZone);
  assert.ok('active' in zones);
  assert.ok('stadium' in zones);
  assert.ok('hand' in zones);
  assert.ok('prizes' in zones);
  assert.ok('bench' in zones);
  assert.ok('discard' in zones);
  assert.ok('lostZone' in zones);
  assert.ok('board' in zones);
  // I24: deck is owner-secret even under the client's own view (O4-A / I5) —
  // a client-reported deck hash could never match the server's real deck, so
  // it must not be part of the comparison at all.
  assert.ok(!('deck' in zones));
});

test('computeSyncCheckZones changes when a card moves zones', () => {
  const getZone = makeGetZone({
    self: { hand: [makeCard('Pikachu')], active: [] },
  });
  const before = computeSyncCheckZones('self', getZone);

  const getZoneAfter = makeGetZone({
    self: { hand: [], active: [makeCard('Pikachu')] },
  });
  const after = computeSyncCheckZones('self', getZoneAfter);

  assert.notEqual(before.hand, after.hand);
  assert.notEqual(before.active, after.active);
});

test('computeSyncCheckZones is stable for identical zone contents', () => {
  const getZone = makeGetZone({
    self: { active: [makeCard('Pikachu')] },
  });
  assert.deepEqual(
    computeSyncCheckZones('self', getZone),
    computeSyncCheckZones('self', getZone)
  );
});

test('emitSyncCheck sends roomId and zones on the syncCheck event', () => {
  const calls = [];
  const socket = { emit: (...args) => calls.push(args) };
  const zones = { active: 'hash1' };
  const result = emitSyncCheck({ socket, roomId: 'room1', zones });
  assert.equal(result, true);
  assert.deepEqual(calls, [['syncCheck', { roomId: 'room1', zones }]]);
});

test('emitSyncCheck returns false without a usable socket or roomId', () => {
  assert.equal(emitSyncCheck({ socket: null, roomId: 'room1', zones: {} }), false);
  assert.equal(
    emitSyncCheck({ socket: { emit: () => {} }, roomId: null, zones: {} }),
    false
  );
});

test('shouldTriggerDesyncRecovery allows recovery only when nothing is already in flight', () => {
  assert.equal(
    shouldTriggerDesyncRecovery({ isCatchingUp: false, peerLogRequestPending: false }),
    true
  );
  assert.equal(
    shouldTriggerDesyncRecovery({ isCatchingUp: true, peerLogRequestPending: false }),
    false
  );
  assert.equal(
    shouldTriggerDesyncRecovery({ isCatchingUp: false, peerLogRequestPending: true }),
    false
  );
  assert.equal(
    shouldTriggerDesyncRecovery({ isCatchingUp: true, peerLogRequestPending: true }),
    false
  );
});

test('SYNC_CHECK_INTERVAL_MS is a positive number of milliseconds', () => {
  assert.equal(typeof SYNC_CHECK_INTERVAL_MS, 'number');
  assert.ok(SYNC_CHECK_INTERVAL_MS > 0);
});

// I24: legacy getZone's zoneArrays are never populated under
// server-authoritative rendering, so the heartbeat must read through the
// renderer's own last-applied view instead.
test('viewBackedGetZone reads live cards from the last applied view, not legacy zoneArrays', () => {
  resetRenderState();
  assert.deepEqual(viewBackedGetZone('self', 'active').array, []);

  applyView(
    {
      stateVersion: 1,
      stadium: { instanceId: 99, name: 'Lost City' },
      you: {
        zones: { active: [{ instanceId: 1, name: 'Pikachu' }], hand: [] },
      },
      them: { zones: { active: [], hand: [] } },
    },
    [],
    { getZone: () => ({ element: {} }) }
  );

  assert.deepEqual(viewBackedGetZone('self', 'active').array, [
    { instanceId: 1, name: 'Pikachu' },
  ]);
  assert.deepEqual(viewBackedGetZone('opp', 'active').array, []);
  assert.deepEqual(viewBackedGetZone('self', 'stadium').array, [
    { instanceId: 99, name: 'Lost City' },
  ]);
  // deck is never in the view's own zones array (redacted to {count}) —
  // viewBackedGetZone must not throw or fabricate one.
  assert.deepEqual(viewBackedGetZone('self', 'deck').array, []);

  resetRenderState();
});
