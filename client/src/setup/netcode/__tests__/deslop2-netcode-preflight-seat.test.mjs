import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  emitAuthoritativeCommand,
  resetAuthoritativeDispatchContext,
} from '../authoritative-dispatch.js';
import { setInstanceMap, translateActionToCmd } from '../dual-run-bridge.js';

afterEach(() => {
  resetAuthoritativeDispatchContext();
  setInstanceMap(null);
});

const soloState = { solo: true, nearSeat: 'p1' };
const useAbility = ['opp', 'bench', 0, { syncInstance: 5 }];

test('preflight translate names the seat the send uses (solo room, two instance maps)', () => {
  setInstanceMap({ 5: 105 }, 'p1');
  setInstanceMap({ 5: 205 }, 'p2');
  const calls = [];
  const sent = emitAuthoritativeCommand('useAbility', useAbility, {
    user: 'opp',
    systemState: soloState,
    processAction: (...args) => calls.push(args),
  });
  assert.equal(sent, true, 'the check agrees with the send instead of refusing a resolvable card');
  assert.equal(calls.length, 1);
  assert.equal(translateActionToCmd('useAbility', useAbility, { seat: 'p2' }).payload.instanceId, 205);
});

test('preflight hands the translator the acting seat', () => {
  const seats = [];
  const translate = (_action, _parameters, { seat }) => {
    seats.push(seat);
    return { type: 'pass', payload: {} };
  };
  const base = { translate, processAction: () => {} };
  emitAuthoritativeCommand('pass', [], { ...base, user: 'self', systemState: soloState });
  emitAuthoritativeCommand('pass', [], { ...base, user: 'opp', systemState: soloState });
  emitAuthoritativeCommand('pass', [], { ...base, user: 'self', systemState: { solo: false, isTwoPlayer: true } });
  assert.deepEqual(seats, ['p1', 'p2', undefined]);
});
