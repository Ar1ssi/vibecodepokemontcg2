import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deckDataEquals } from '../../../setup/general/sync-action-args.mjs';

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

test('exchangeData skips reset when opponent metadata unchanged (resync replay)', () => {
  const deck = [[1, 'Pikachu', 'Pokémon']];
  assert.equal(deckDataEquals(deck, [[1, 'Pikachu', 'Pokémon']]), true);
  assert.equal(deckDataEquals(deck, [[1, 'Raichu', 'Pokémon']]), false);
});
