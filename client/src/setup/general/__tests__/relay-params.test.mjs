import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relayParameters } from '../relay-params.mjs';

const hint = (instanceId, name) => ({ instanceId, name, zone: 'hand', side: 'self' });

test('relayParameters drops the card name from a hand move (Starting Active stays face down)', () => {
  const params = ['opp', 'hand', 'active', 2, undefined, 'move', { moving: hint(41, 'Pikachu') }];
  const relayed = relayParameters('moveCardBundle', params);
  assert.deepEqual(relayed[6], { moving: { instanceId: 41, zone: 'hand', side: 'self' } });
  assert.equal(JSON.stringify(relayed).includes('Pikachu'), false);
  // The command sent to the server still reads the original parameters.
  assert.equal(params[6].moving.name, 'Pikachu');
});

test('relayParameters drops names from both moving and target hints of a hand move', () => {
  const params = ['opp', 'hand', 'bench', 0, 1, 'attach', { moving: hint(5, 'Grass Energy'), target: hint(9, 'Oddish') }];
  const relayed = relayParameters('moveCardBundle', params);
  assert.equal(relayed[6].moving.name, undefined);
  assert.equal(relayed[6].target.name, undefined);
  assert.equal(relayed[6].target.instanceId, 9);
});

test('relayParameters leaves public moves and other actions untouched', () => {
  const benchMove = ['opp', 'bench', 'active', 0, undefined, 'move', { moving: hint(7, 'Raichu') }];
  assert.equal(relayParameters('moveCardBundle', benchMove), benchMove);
  const attack = [0];
  assert.equal(relayParameters('attack', attack), attack);
  assert.equal(relayParameters('moveCardBundle', null), null);
});
