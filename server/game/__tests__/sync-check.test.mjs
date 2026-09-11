import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findFirstDivergentZone,
  excludeOwnerSecretZones,
} from '../sync-check.mjs';

test('findFirstDivergentZone returns null when every zone hash matches', () => {
  const server = { active: 'a1', bench: 'b1', hand: 'h1' };
  const client = { active: 'a1', bench: 'b1', hand: 'h1' };
  assert.equal(findFirstDivergentZone(server, client), null);
});

test('findFirstDivergentZone names the one zone that disagrees', () => {
  const server = { active: 'a1', bench: 'b1', hand: 'h1' };
  const client = { active: 'a1', bench: 'WRONG', hand: 'h1' };
  assert.equal(findFirstDivergentZone(server, client), 'bench');
});

test('findFirstDivergentZone returns the alphabetically-first mismatch when several zones disagree', () => {
  const server = { active: 'a1', bench: 'b1', hand: 'h1' };
  const client = { active: 'WRONG', bench: 'WRONG', hand: 'h1' };
  assert.equal(findFirstDivergentZone(server, client), 'active');
});

test('findFirstDivergentZone treats a missing client zones object as fully divergent', () => {
  const server = { active: 'a1' };
  assert.equal(findFirstDivergentZone(server, undefined), 'active');
  assert.equal(findFirstDivergentZone(server, null), 'active');
});

test('findFirstDivergentZone returns null when there is no server-side state to compare against', () => {
  assert.equal(findFirstDivergentZone(null, { active: 'a1' }), null);
});

// I24: deck is owner-secret even from its own owner (O4-A / I5), so the
// server must not compare it — the client can never legitimately report it.
test('excludeOwnerSecretZones drops deck but keeps every other zone', () => {
  const zones = { active: 'a1', deck: 'd1', hand: 'h1' };
  assert.deepEqual(excludeOwnerSecretZones(zones), {
    active: 'a1',
    hand: 'h1',
  });
});

test('excludeOwnerSecretZones passes through null unchanged', () => {
  assert.equal(excludeOwnerSecretZones(null), null);
});

test('findFirstDivergentZone never reports deck once excludeOwnerSecretZones is applied', () => {
  const server = excludeOwnerSecretZones({ active: 'a1', deck: 'd1' });
  const client = { active: 'a1' }; // client never sends deck at all
  assert.equal(findFirstDivergentZone(server, client), null);
});

// Live Render report: "The game may be out of sync" kept appearing mid-game.
// The server hashed its real prize cards while the client can only hash its
// own view, where unrevealed prizes are redacted to { instanceId } — so every
// heartbeat named `prizes` as divergent in every server-authoritative game.
async function buildDealtRoom() {
  const { GameRoom } = await import('../room.mjs');
  const { createCard } = await import('../../../shared/engine/cards.mjs');
  const room = new GameRoom({ roomId: 'sync-view-hash', rulesEnabled: false });
  room.addPlayer('sock-a', 'p1', 'Ash');
  room.addPlayer('sock-b', 'p2', 'Gary');
  const p1 = room.state.players.p1;
  for (let i = 0; i < 6; i++) {
    p1.zones.prizes.push(
      createCard({ instanceId: 100 + i, syncInstance: i, name: `Prize ${i}`, number: '001', set: 'e2e' })
    );
  }
  p1.zones.hand.push(createCard({ instanceId: 200, syncInstance: 6, name: 'Pikachu', number: '002', set: 'e2e' }));
  p1.zones.deck.push(createCard({ instanceId: 300, syncInstance: 7, name: 'Hidden', number: '003', set: 'e2e' }));
  return room;
}

// Exactly what the client's heartbeat hashes: its own last-applied view.
async function clientZonesFromView(view) {
  const { computeSyncCheckZones } = await import('../../../client/src/setup/netcode/sync-check.js');
  const fromView = (_user, zoneId) => ({
    array:
      zoneId === 'stadium'
        ? view.stadium
          ? [view.stadium]
          : []
        : Array.isArray(view.you.zones[zoneId])
          ? view.you.zones[zoneId]
          : [],
  });
  return computeSyncCheckZones('self', fromView);
}

test('hashOwnerViewZones matches the client heartbeat when prizes are unrevealed', async () => {
  const { hashOwnerViewZones } = await import('../sync-check.mjs');
  const room = await buildDealtRoom();
  const view = room.getView('p1');
  assert.equal(view.you.zones.prizes[0].name, undefined, 'precondition: prizes are redacted');

  const serverZones = hashOwnerViewZones(view);
  const clientZones = await clientZonesFromView(view);
  assert.equal(findFirstDivergentZone(serverZones, clientZones), null);
  assert.deepEqual(Object.keys(serverZones).sort(), Object.keys(clientZones).sort());
});

test('regression: hashing raw state (the old server path) falsely reports prizes as divergent', async () => {
  const { hashStateZones } = await import('../../../shared/engine/state.mjs');
  const room = await buildDealtRoom();
  const clientZones = await clientZonesFromView(room.getView('p1'));
  const rawServerZones = excludeOwnerSecretZones(hashStateZones(room.state, 'p1'));
  assert.equal(findFirstDivergentZone(rawServerZones, clientZones), 'prizes');
});

test('hashOwnerViewZones still catches a real divergence', async () => {
  const { hashOwnerViewZones } = await import('../sync-check.mjs');
  const room = await buildDealtRoom();
  const view = room.getView('p1');
  const staleView = JSON.parse(JSON.stringify(view));
  staleView.you.zones.hand = [];
  const clientZones = await clientZonesFromView(staleView);
  assert.equal(findFirstDivergentZone(hashOwnerViewZones(view), clientZones), 'hand');
});

test('hashOwnerViewZones returns null without a view to compare', async () => {
  const { hashOwnerViewZones } = await import('../sync-check.mjs');
  assert.equal(hashOwnerViewZones(null), null);
  assert.equal(hashOwnerViewZones({}), null);
});
