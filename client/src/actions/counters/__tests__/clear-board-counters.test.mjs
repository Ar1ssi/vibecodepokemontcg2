import test from 'node:test';
import assert from 'node:assert/strict';
import { clearBoardCounters } from '../clear-board-counters.mjs';

const matWith = (elements) => ({
  querySelectorAll: (selector) => {
    assert.equal(selector, '.self-circle, .opp-circle, .self-tab, .opp-tab');
    return elements;
  },
});

const legacyCounter = (textContent) => {
  const element = { textContent, removedWith: [] };
  element.handleRemove = (emit) => element.removedWith.push(emit);
  return element;
};

test('legacy counters are zeroed and removed without emitting', () => {
  const damage = legacyCounter('50');
  const ability = legacyCounter('');

  clearBoardCounters(matWith([damage, ability]));

  assert.equal(damage.textContent, '0');
  assert.deepEqual(damage.removedWith, [false]);
  assert.deepEqual(ability.removedWith, [false]);
});

// The repro: under SERVER_AUTHORITATIVE=1 the winner, with 50 damage on its Active,
// pressed Reset and got "element.handleRemove is not a function" (reset.js), so the
// reset never reached the server.
test('a server-rendered counter (no handleRemove) is left for the renderer and does not throw', () => {
  const serverDamage = { textContent: '50' };
  const legacy = legacyCounter('20');

  assert.doesNotThrow(() => clearBoardCounters(matWith([serverDamage, legacy])));

  assert.equal(serverDamage.textContent, '50', 'the renderer owns it until the next view');
  assert.deepEqual(legacy.removedWith, [false], 'counters after it are still cleared');
});

test('a detached counter whose handleRemove was nulled is skipped', () => {
  const detached = { textContent: '10', handleRemove: null };
  assert.doesNotThrow(() => clearBoardCounters(matWith([detached])));
});

test('a missing mat document is a no-op', () => {
  assert.doesNotThrow(() => clearBoardCounters(null));
  assert.doesNotThrow(() => clearBoardCounters(undefined));
  assert.doesNotThrow(() => clearBoardCounters({}));
});
