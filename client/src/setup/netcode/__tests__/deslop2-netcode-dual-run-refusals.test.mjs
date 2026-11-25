import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { translateActionToCmd, setInstanceMap } from '../dual-run-bridge.js';

afterEach(() => {
  setInstanceMap(null);
});

const quiet = (fn) => {
  const original = console.warn;
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.warn = original;
  }
};

test('attack: a valid index is sent as given', () => {
  assert.deepEqual(translateActionToCmd('attack', [1, {}]), {
    type: 'attack',
    payload: { attackIndex: 1 },
  });
  assert.equal(translateActionToCmd('attack', [0, {}]).payload.attackIndex, 0);
});

test('attack: a missing or invalid index is refused, never sent as the first attack', () => {
  for (const bad of [undefined, null, '1', -1, 1.5, NaN]) {
    assert.equal(quiet(() => translateActionToCmd('attack', [bad, {}])), null, String(bad));
  }
  assert.equal(quiet(() => translateActionToCmd('attack', [])), null);
});

test('useAbility direct form: a missing or invalid instance id or index is refused', () => {
  assert.equal(quiet(() => translateActionToCmd('useAbility', [18])), null);
  assert.equal(quiet(() => translateActionToCmd('useAbility', [18, -1])), null);
  assert.equal(quiet(() => translateActionToCmd('useAbility', [undefined, 0])), null);
  assert.equal(quiet(() => translateActionToCmd('useAbility', [null, 0])), null);
  assert.equal(quiet(() => translateActionToCmd('useAbility', ['x', 0])), null);
  assert.equal(quiet(() => translateActionToCmd('useAbility', [0, 0])).payload.instanceId, 0);
});

test('moveCardBundle: no moving-card hint is refused instead of addressing the zone index', () => {
  const noHint = ['self', 'hand', 'bench', 2, false, 'move', {}];
  assert.equal(quiet(() => translateActionToCmd('moveCardBundle', noHint)), null);
  assert.equal(
    quiet(() => translateActionToCmd('moveCardBundle', ['self', 'hand', 'bench', 0, false, 'move'])),
    null
  );
});
