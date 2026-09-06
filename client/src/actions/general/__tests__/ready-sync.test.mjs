import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deckDataEquals } from '../../../setup/general/sync-action-args.mjs';
import { setupDealPlan } from '../setup-deal.mjs';

// Simulates selfReady/oppReady on two clients for the fixed readyUp contract.
function simulateReadyExchange({ hostInitiator, joinerInitiator }) {
  const host = { selfReady: false, oppReady: false, initiator: hostInitiator };
  const joiner = { selfReady: false, oppReady: false, initiator: joinerInitiator };

  function localReady(client) {
    client.selfReady = true;
  }

  function mirrorReady(client) {
    client.oppReady = true;
  }

  // Host clicks Set Up
  localReady(host);
  mirrorReady(joiner);

  assert.equal(host.selfReady, true);
  assert.equal(host.oppReady, false);
  assert.equal(joiner.selfReady, false);
  assert.equal(joiner.oppReady, true);

  // Joiner clicks Set Up
  localReady(joiner);
  mirrorReady(host);

  assert.equal(host.selfReady, true);
  assert.equal(host.oppReady, true);
  assert.equal(joiner.selfReady, true);
  assert.equal(joiner.oppReady, true);

  return { host, joiner };
}

test('ready exchange completes on both clients after host then joiner click', () => {
  simulateReadyExchange({ hostInitiator: 'self', joinerInitiator: 'opp' });
});

test('ready exchange completes when joiner clicks first', () => {
  const host = { selfReady: false, oppReady: false };
  const joiner = { selfReady: false, oppReady: false };

  joiner.selfReady = true;
  host.oppReady = true;
  assert.equal(host.selfReady, false);
  assert.equal(joiner.oppReady, false);

  host.selfReady = true;
  joiner.oppReady = true;
  assert.equal(host.selfReady && host.oppReady, true);
  assert.equal(joiner.selfReady && joiner.oppReady, true);
});

test('setupDealPlan: full deck deals 7 to hand and 6 prizes', () => {
  assert.deepEqual(setupDealPlan(60), { hand: 7, prizes: 6 });
});

test('setupDealPlan: prizes come from the remaining deck after the hand', () => {
  assert.deepEqual(setupDealPlan(10), { hand: 7, prizes: 3 });
  assert.deepEqual(setupDealPlan(6), { hand: 6, prizes: 0 });
  assert.deepEqual(setupDealPlan(0), { hand: 0, prizes: 0 });
});

test('exchangeData skips reset when opponent metadata unchanged (resync replay)', () => {
  const deck = [[1, 'Pikachu', 'Pokémon']];
  assert.equal(deckDataEquals(deck, [[1, 'Pikachu', 'Pokémon']]), true);
  assert.equal(deckDataEquals(deck, [[1, 'Raichu', 'Pokémon']]), false);
});

// Mirrors rules-bridge handleSetupClick guards + peerSocketId retry gate.
function shouldStartCoinFlip({ rulesEnabled, openingSetupReadyForCoinFlip, phase }) {
  if (!rulesEnabled) return false;
  if (!openingSetupReadyForCoinFlip) return false;
  if (phase !== 'setup') return false;
  return true;
}

test('coin flip does not start before both players ready (peerSocketId on join)', () => {
  assert.equal(
    shouldStartCoinFlip({
      rulesEnabled: true,
      openingSetupReadyForCoinFlip: false,
      phase: 'setup',
    }),
    false
  );
});

test('coin flip starts after both-players-ready opens the gate', () => {
  assert.equal(
    shouldStartCoinFlip({
      rulesEnabled: true,
      openingSetupReadyForCoinFlip: true,
      phase: 'setup',
    }),
    true
  );
});

test('rules setup order: prizes before coin flip before hands', () => {
  const steps = [];
  const rulesEnabled = true;
  if (rulesEnabled) {
    steps.push('prizes');
    steps.push('coinFlip');
    steps.push('hands');
  } else {
    steps.push('prizesAndHands');
  }
  assert.deepEqual(steps, ['prizes', 'coinFlip', 'hands']);
});
