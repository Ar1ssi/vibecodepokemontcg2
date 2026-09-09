/**
 * @file Design 002 slice 3.5 — the Phase 3A exit test.
 * Replays a real recorded 2-player legacy trace (server/game/__tests__/fixtures/
 * legacy-2p-recorded.json, produced by record-legacy-2p-fixture.mjs against a live
 * server started with SERVER_AUTHORITATIVE=1 + two Playwright browsers) through a fresh
 * GameRoom via the actual production translation path (translateActionToCmd from
 * client/src/setup/netcode/dual-run-bridge.js), and asserts hashState(room.state, playerId)
 * agrees with the client's own recorded boardHash after every step. Structural mismatch
 * here means 3A is not done.
 *
 * rulesEnabled: false, matching ShadowSession's existing precedent (shadow.mjs) — turn-order
 * and coin-flip resolution are a client-driven rules-mode feature outside design 002's command
 * scope, not something this harness's independently-seeded 'setup' call can reproduce.
 *
 * I17 (server/client opening-deal desync — client's local shuffle vs GameRoom's
 * independent shuffle dealt two different hands, failing every moveCard from hand with
 * stale_view) is fixed as of this slice: server.js now waits for both decks to actually
 * load before running 'setup', then hands each player its own syncInstance deal order
 * ('dealOrder' event); client's setupPrizes() (client/src/actions/general/setup.js) waits
 * for it in server-authoritative 2P instead of rolling a local shuffle. See I17 in
 * ISSUES.md (closed) for the two-bug history (dead 'setup' wiring, then this).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameRoom } from '../room.mjs';
import { extractDeckData } from '../shadow.mjs';
import { hashState } from '../../../shared/engine/state.mjs';
import {
  translateActionToCmd,
  setInstanceMap,
} from '../../../client/src/setup/netcode/dual-run-bridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/legacy-2p-recorded.json'), 'utf8')
);

// Legacy actions with no server-side command: 'exchangeData'/'loadDeckData' are handled
// directly below via the 'loadDeck' command (mirroring server.js's own interception);
// 'readyUp'/'setupPrizes'/'drawOpeningHand' are DISPOSITION_TABLE 'server_lifecycle' —
// translateActionToCmd correctly returns null for them, and the single 'setup' command
// call below is their server-side equivalent.
const SKIPPED_ACTIONS = new Set([
  'exchangeData',
  'loadDeckData',
  'readyUp',
  'setupPrizes',
  'drawOpeningHand',
]);

// Client-side moveCard auto-sorts 'deck'/'lostZone'/'discard'/'hand' for display after
// every card added (move-card.js:604-607, pre-existing, not part of design 002) — the
// server's simulated zones never do this, they stay in insertion order. This is the
// already-tracked intra-zone-order gap (I15; design 002 row 10/22, Phase 3B scope), not
// an I17 regression: the *set* of cards must still agree, order does not until 3B
// reconciles rendering. Sort each zone's card list before comparing so the assertion
// tracks real membership/state divergence, not this known cosmetic reordering.
function canonicalizeHash(hash) {
  return hash
    .split(';')
    .map((zoneEntry) => {
      const sep = zoneEntry.indexOf(':');
      const zoneId = zoneEntry.slice(0, sep);
      const cards = zoneEntry.slice(sep + 1);
      const sorted = cards ? cards.split(',').sort().join(',') : '';
      return `${zoneId}:${sorted}`;
    })
    .join(';');
}

test('Design 002 slice 3.5: replayed recorded 2P traffic agrees with clients boardHash at every step', () => {
  const room = new GameRoom({
    roomId: fixture.roomId,
    rulesEnabled: false,
    seed: 0,
  });

  const socketOf = { A: 'sock-a', B: 'sock-b' };
  const playerOf = { A: 'p1', B: 'p2' };
  room.addPlayer(socketOf.A, playerOf.A, 'E2E-A');
  room.addPlayer(socketOf.B, playerOf.B, 'E2E-B');

  const instanceMaps = {};

  for (const label of ['A', 'B']) {
    const step = fixture.players[label].stepLog.find(
      (s) => s.action === 'loadDeckData'
    );
    assert.ok(step, `fixture missing loadDeckData for ${label}`);
    const deckData = extractDeckData('loadDeckData', step.parameters);

    const result = room.handleCommand(socketOf[label], {
      type: 'loadDeck',
      payload: { deckData },
    });
    assert.equal(result.success, true, `loadDeck failed for ${label}: ${result.reason}`);

    const map = {};
    for (const card of room.state.players[playerOf[label]].zones.deck) {
      map[card.syncInstance] = card.instanceId;
    }
    instanceMaps[label] = map;
  }

  // Mirrors the server.js wiring this slice adds: once both decks are loaded, deal
  // hands and prizes. Discovered while building this harness that nothing else ever
  // called the 'setup' command in production — see the S46+1 journal entry / D-note.
  const setupResult = room.handleCommand(socketOf.A, {
    type: 'setup',
    payload: {},
  });
  assert.equal(setupResult.success, true, `setup failed: ${setupResult.reason}`);

  let assertedSteps = 0;

  for (const label of ['A', 'B']) {
    const playerId = playerOf[label];
    for (const step of fixture.players[label].stepLog) {
      if (SKIPPED_ACTIONS.has(step.action)) continue;

      setInstanceMap(instanceMaps[label]);
      const cmd = translateActionToCmd(step.action, step.parameters);
      setInstanceMap(null);
      assert.ok(cmd, `translateActionToCmd returned null for ${label}'s "${step.action}"`);

      const result = room.handleCommand(socketOf[label], cmd);
      assert.equal(
        result.success,
        true,
        `${label}'s "${step.action}" rejected: ${result.error} ${result.reason}`
      );

      const serverHash = hashState(room.state, playerId);
      assert.equal(
        canonicalizeHash(serverHash),
        canonicalizeHash(step.hash),
        `hashState diverged from the recorded client hash after ${label}'s "${step.action}"`
      );
      assertedSteps++;
    }
  }

  // Sanity: the fixture actually exercised at least the loadDeck + setup + one
  // translated command (moveCardBundle) per side that recorded it — a harness that
  // silently skipped everything would pass vacuously.
  assert.ok(assertedSteps >= 1, 'no steps were asserted — fixture or SKIPPED_ACTIONS drifted');
});
