import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  translateActionToCmd,
  normalizeSpecialCondition,
  setInstanceMap,
  resolveInstanceId,
} from '../dual-run-bridge.js';
import { validateCommandShape } from '../../../../../shared/engine/commands.mjs';

afterEach(() => {
  setInstanceMap(null);
});

test('normalizeSpecialCondition: maps codes and names correctly', () => {
  assert.equal(normalizeSpecialCondition('P'), 'Poisoned');
  assert.equal(normalizeSpecialCondition('B'), 'Burned');
  assert.equal(normalizeSpecialCondition('A'), 'Asleep');
  assert.equal(normalizeSpecialCondition('PA'), 'Paralyzed');
  assert.equal(normalizeSpecialCondition('C'), 'Confused');
  assert.equal(normalizeSpecialCondition('poison'), 'Poisoned');
  assert.equal(normalizeSpecialCondition('Burned'), 'Burned');
  assert.equal(normalizeSpecialCondition(''), null);
  assert.equal(normalizeSpecialCondition('0'), null);
  assert.equal(normalizeSpecialCondition(null), null);
});

test('normalizeSpecialCondition: returns null for unrecognized input instead of mislabeling', () => {
  assert.equal(normalizeSpecialCondition('garbage'), null);
  assert.equal(normalizeSpecialCondition('xyz123'), null);
});

test('resolveInstanceId: returns null when no map has been set', () => {
  assert.equal(resolveInstanceId(14), null);
});

test('resolveInstanceId: returns null when the map is set but lacks the key', () => {
  setInstanceMap({ 14: 14 });
  assert.equal(resolveInstanceId(99), null);
});

test('resolveInstanceId: resolves a syncInstance through the map', () => {
  setInstanceMap({ 5: 105 });
  assert.equal(resolveInstanceId(5), 105);
});

test('updateDamageCounter: maps parameters [zoneId, index, amount, hint] correctly', () => {
  setInstanceMap({ 14: 14 });
  const cmd = translateActionToCmd('updateDamageCounter', [
    'active',
    0,
    30,
    { syncInstance: 14 },
  ]);

  assert.ok(cmd);
  assert.equal(cmd.type, 'updateDamageCounter');
  assert.equal(cmd.payload.instanceId, 14);
  assert.equal(cmd.payload.amount, 30);
  assert.equal(validateCommandShape(cmd).valid, true);
});

test('updateDamageCounter: handles optional user prefix [user, zoneId, index, amount, hint]', () => {
  setInstanceMap({ 14: 14 });
  const cmd = translateActionToCmd('updateDamageCounter', [
    'self',
    'active',
    0,
    50,
    { syncInstance: 14 },
  ]);

  assert.ok(cmd);
  assert.equal(cmd.type, 'updateDamageCounter');
  assert.equal(cmd.payload.instanceId, 14);
  assert.equal(cmd.payload.amount, 50);
  assert.equal(validateCommandShape(cmd).valid, true);
});

test('updateDamageCounter: handles direct [instanceId, amount]', () => {
  const cmd = translateActionToCmd('updateDamageCounter', [42, 60]);

  assert.ok(cmd);
  assert.equal(cmd.type, 'updateDamageCounter');
  assert.equal(cmd.payload.instanceId, 42);
  assert.equal(cmd.payload.amount, 60);
  assert.equal(validateCommandShape(cmd).valid, true);
});

test('addDamageCounter: maps parameters [zoneId, index, amount, hint] correctly', () => {
  setInstanceMap({ 22: 22 });
  const cmd = translateActionToCmd('addDamageCounter', [
    'bench',
    1,
    20,
    { syncInstance: 22 },
  ]);

  assert.ok(cmd);
  assert.equal(cmd.type, 'addDamageCounter');
  assert.equal(cmd.payload.instanceId, 22);
  assert.equal(cmd.payload.amount, 20);
  assert.equal(validateCommandShape(cmd).valid, true);
});

test('removeDamageCounter: maps parameters [zoneId, index, hint] correctly', () => {
  setInstanceMap({ 14: 14 });
  const cmd = translateActionToCmd('removeDamageCounter', [
    'active',
    0,
    { syncInstance: 14 },
  ]);

  assert.ok(cmd);
  assert.equal(cmd.type, 'removeDamageCounter');
  assert.equal(cmd.payload.instanceId, 14);
  assert.equal(validateCommandShape(cmd).valid, true);
});

test('removeDamageCounter: maps parameters with explicit amount [zoneId, index, amount, hint]', () => {
  setInstanceMap({ 14: 14 });
  const cmd = translateActionToCmd('removeDamageCounter', [
    'active',
    0,
    10,
    { syncInstance: 14 },
  ]);

  assert.ok(cmd);
  assert.equal(cmd.type, 'removeDamageCounter');
  assert.equal(cmd.payload.instanceId, 14);
  assert.equal(cmd.payload.amount, 10);
  assert.equal(validateCommandShape(cmd).valid, true);
});

test('addSpecialCondition: maps parameters [zoneId, index, condition, hint] with valid condition', () => {
  setInstanceMap({ 14: 14 });
  const cmd = translateActionToCmd('addSpecialCondition', [
    'active',
    0,
    'Burned',
    { syncInstance: 14 },
  ]);

  assert.ok(cmd);
  assert.equal(cmd.type, 'addSpecialCondition');
  assert.equal(cmd.payload.instanceId, 14);
  assert.equal(cmd.payload.condition, 'Burned');
  assert.equal(validateCommandShape(cmd).valid, true);
});

test('addSpecialCondition: maps legacy UI parameters [zoneId, index, hint] to default condition', () => {
  setInstanceMap({ 14: 14 });
  const cmd = translateActionToCmd('addSpecialCondition', [
    'active',
    0,
    { syncInstance: 14 },
  ]);

  assert.ok(cmd);
  assert.equal(cmd.type, 'addSpecialCondition');
  assert.equal(cmd.payload.instanceId, 14);
  assert.equal(cmd.payload.condition, 'Poisoned');
  assert.equal(validateCommandShape(cmd).valid, true);
});

test('addSpecialCondition: drops command when condition is unrecognized (not relabeled Poisoned)', () => {
  setInstanceMap({ 14: 14 });
  const cmd = translateActionToCmd('addSpecialCondition', [
    'active',
    0,
    'Toxic',
    { syncInstance: 14 },
  ]);

  assert.equal(cmd, null);
});

test('addSpecialCondition: still builds command for a valid recognized condition', () => {
  setInstanceMap({ 14: 14 });
  const cmd = translateActionToCmd('addSpecialCondition', [
    'active',
    0,
    'Confused',
    { syncInstance: 14 },
  ]);

  assert.ok(cmd);
  assert.equal(cmd.type, 'addSpecialCondition');
  assert.equal(cmd.payload.instanceId, 14);
  assert.equal(cmd.payload.condition, 'Confused');
  assert.equal(validateCommandShape(cmd).valid, true);
});

test('updateSpecialCondition: maps code [zoneId, index, textContent, hint] correctly', () => {
  setInstanceMap({ 14: 14 });
  const cmd = translateActionToCmd('updateSpecialCondition', [
    'active',
    0,
    'PA',
    { syncInstance: 14 },
  ]);

  assert.ok(cmd);
  assert.equal(cmd.type, 'updateSpecialCondition');
  assert.equal(cmd.payload.instanceId, 14);
  assert.equal(cmd.payload.condition, 'Paralyzed');
  assert.equal(validateCommandShape(cmd).valid, true);
});

test('updateSpecialCondition: clears condition when textContent is empty string', () => {
  setInstanceMap({ 14: 14 });
  const cmd = translateActionToCmd('updateSpecialCondition', [
    'active',
    0,
    '',
    { syncInstance: 14 },
  ]);

  assert.ok(cmd);
  assert.equal(cmd.type, 'updateSpecialCondition');
  assert.equal(cmd.payload.instanceId, 14);
  assert.equal(cmd.payload.condition, null);
  assert.equal(validateCommandShape(cmd).valid, true);
});

test('removeSpecialCondition: maps parameters [zoneId, index, hint] correctly', () => {
  setInstanceMap({ 14: 14 });
  const cmd = translateActionToCmd('removeSpecialCondition', [
    'active',
    0,
    { syncInstance: 14 },
  ]);

  assert.ok(cmd);
  assert.equal(cmd.type, 'removeSpecialCondition');
  assert.equal(cmd.payload.instanceId, 14);
  assert.equal(validateCommandShape(cmd).valid, true);
});

test('retreat: emits benchInstanceId when target provided', () => {
  setInstanceMap({ 25: 25 });
  const cmd = translateActionToCmd('retreat', [{ syncInstance: 25 }]);

  assert.ok(cmd);
  assert.equal(cmd.type, 'retreat');
  assert.equal(cmd.payload.benchInstanceId, 25);
  assert.equal(validateCommandShape(cmd).valid, true);
});

test('retreat: emits empty payload when no target provided (first bench fallback)', () => {
  const cmd = translateActionToCmd('retreat', []);

  assert.ok(cmd);
  assert.equal(cmd.type, 'retreat');
  assert.equal(cmd.payload.benchInstanceId, undefined);
  assert.equal(validateCommandShape(cmd).valid, true);
});

test('retreat: maps discardEnergyIds when provided', () => {
  const cmd = translateActionToCmd('retreat', [12, [101, 102]]);

  assert.ok(cmd);
  assert.equal(cmd.type, 'retreat');
  assert.equal(cmd.payload.benchInstanceId, 12);
  assert.deepEqual(cmd.payload.discardEnergyIds, [101, 102]);
  assert.equal(validateCommandShape(cmd).valid, true);
});

test('retreat: returns null when target syncInstance cannot be resolved', () => {
  setInstanceMap({ 25: 25 });
  const cmd = translateActionToCmd('retreat', [{ syncInstance: 999 }]);

  assert.equal(cmd, null);
});

test('useAbility: maps [oInitiator, zoneId, resolved, hint] from legacy UI', () => {
  setInstanceMap({ 18: 18 });
  const cmd = translateActionToCmd('useAbility', [
    'opp',
    'bench',
    1,
    { syncInstance: 18 },
  ]);

  assert.ok(cmd);
  assert.equal(cmd.type, 'useAbility');
  assert.equal(cmd.payload.instanceId, 18);
  assert.equal(cmd.payload.abilityIndex, 0);
  assert.equal(validateCommandShape(cmd).valid, true);
});

test('useAbility: maps direct [instanceId, abilityIndex]', () => {
  const cmd = translateActionToCmd('useAbility', [18, 1]);

  assert.ok(cmd);
  assert.equal(cmd.type, 'useAbility');
  assert.equal(cmd.payload.instanceId, 18);
  assert.equal(cmd.payload.abilityIndex, 1);
  assert.equal(validateCommandShape(cmd).valid, true);
});

test('useAbility: returns null when hint syncInstance cannot be resolved (no positional fallback)', () => {
  setInstanceMap({ 18: 18 });
  const cmd = translateActionToCmd('useAbility', [
    'opp',
    'bench',
    1,
    { syncInstance: 999 },
  ]);

  assert.equal(cmd, null);
});

test('unresolved syncInstance hint: translateActionToCmd returns null instead of a guessed command', () => {
  setInstanceMap({ 14: 14 });
  const cmd = translateActionToCmd('updateDamageCounter', [
    'active',
    0,
    30,
    { syncInstance: 999 },
  ]);

  assert.equal(cmd, null);
});

test('no instance map set: translateActionToCmd returns null instead of a guessed command', () => {
  const cmd = translateActionToCmd('updateDamageCounter', [
    'active',
    0,
    30,
    { syncInstance: 14 },
  ]);

  assert.equal(cmd, null);
});

test('positional-index fallback is gone: index with no resolvable hint returns null', () => {
  setInstanceMap({ 14: 14 });
  // No hint object at all in the maybeAmount/maybeHint slots — previously this fell
  // back to using the raw zone index (0) as instanceId.
  const cmd = translateActionToCmd('updateDamageCounter', ['active', 0, 30]);

  assert.equal(cmd, null);
});

test('round trip: setInstanceMap then a syncInstance hint resolves to the mapped instanceId', () => {
  setInstanceMap({ 5: 105 });
  const cmd = translateActionToCmd('updateDamageCounter', [
    'active',
    0,
    30,
    { syncInstance: 5 },
  ]);

  assert.ok(cmd);
  assert.equal(cmd.payload.instanceId, 105);
});

test('moveCardBundle: resolves moving and target syncInstance hints through the instance map', () => {
  setInstanceMap({ 3: 103, 7: 107 });
  const cmd = translateActionToCmd('moveCardBundle', [
    'self',
    'bench',
    'active',
    1,
    0,
    'attach',
    { moving: { syncInstance: 3 }, target: { syncInstance: 7 } },
  ]);

  assert.ok(cmd);
  assert.equal(cmd.type, 'attachCard');
  assert.equal(cmd.payload.instanceId, 103);
  assert.equal(cmd.payload.targetInstanceId, 107);
});

test('moveCardBundle: returns null when the moving card syncInstance cannot be resolved', () => {
  setInstanceMap({ 7: 107 });
  const cmd = translateActionToCmd('moveCardBundle', [
    'self',
    'bench',
    'active',
    1,
    0,
    'attach',
    { moving: { syncInstance: 999 }, target: { syncInstance: 7 } },
  ]);

  assert.equal(cmd, null);
});

// --- Disposition-table gate (design 002 slice 3.2) ---

test('disposition gate: a client_local action (changeCardBack) returns null and never throws', () => {
  assert.doesNotThrow(() => {
    const cmd = translateActionToCmd('changeCardBack', ['someBackId']);
    assert.equal(cmd, null);
  });
});

test('disposition gate: a server_command action with no case yet (playRandomCardFaceDown) returns null, does not throw', () => {
  assert.doesNotThrow(() => {
    const cmd = translateActionToCmd('playRandomCardFaceDown', ['self']);
    assert.equal(cmd, null);
  });
});

// --- Setup & turn (design 002 slice 3.4c) ---

test('takeTurn: translates to an empty-payload command', () => {
  const cmd = translateActionToCmd('takeTurn', ['self']);
  assert.deepEqual(cmd, { type: 'takeTurn', payload: {} });
});

// design 002 slice 3.4e: undo is now implemented server-side (I16); the legacy client
// action's filteredActionData replay list carries nothing the server needs.
test('undo: translates to an empty-payload command, ignoring the legacy filteredActionData array', () => {
  const cmd = translateActionToCmd('undo', [
    [{ action: 'draw', parameters: [] }],
  ]);
  assert.deepEqual(cmd, { type: 'undo', payload: {} });
});

test('disposition gate: server_lifecycle actions (setup family) stay relay-only, no command', () => {
  for (const action of [
    'setup',
    'setupPrizes',
    'drawOpeningHand',
    'readyUp',
    'reset',
    'restartGame',
  ]) {
    assert.equal(
      translateActionToCmd(action, ['self']),
      null,
      `${action} should not produce a command`
    );
  }
});

test('disposition gate: client_local actions (changePlaymat) return null and never throw', () => {
  assert.doesNotThrow(() => {
    const cmd = translateActionToCmd('changePlaymat', ['someMatId']);
    assert.equal(cmd, null);
  });
});

// --- Zone ops (design 002 slice 3.4a) ---

test('shuffleIntoDeck: translates zoneId + positional index, ignores client shuffle indices', () => {
  const cmd = translateActionToCmd('shuffleIntoDeck', [
    'opp',
    'bench',
    2,
    [1, 0],
  ]);
  assert.deepEqual(cmd, {
    type: 'shuffleIntoDeck',
    payload: { from: 'bench', index: 2 },
  });
});

test('moveToDeckTop: translates zoneId + positional index', () => {
  const cmd = translateActionToCmd('moveToDeckTop', ['self', 'hand', 0]);
  assert.deepEqual(cmd, {
    type: 'moveToDeckTop',
    payload: { from: 'hand', index: 0 },
  });
});

test('switchWithDeckTop: translates zoneId + positional index', () => {
  const cmd = translateActionToCmd('switchWithDeckTop', ['self', 'discard', 3]);
  assert.deepEqual(cmd, {
    type: 'switchWithDeckTop',
    payload: { from: 'discard', index: 3 },
  });
});

test('shuffleZone: translates zoneId only, drops client-supplied indices', () => {
  const cmd = translateActionToCmd('shuffleZone', [
    'opp',
    'deck',
    [2, 1, 0],
    true,
  ]);
  assert.deepEqual(cmd, { type: 'shuffleZone', payload: { zoneId: 'deck' } });
});

test('shuffleBottom: translates zoneId only', () => {
  const cmd = translateActionToCmd('shuffleBottom', ['self', 'hand', [0, 1]]);
  assert.deepEqual(cmd, { type: 'shuffleBottom', payload: { zoneId: 'hand' } });
});

test('shuffleAll: translates zoneId only', () => {
  const cmd = translateActionToCmd('shuffleAll', ['self', 'discard', null]);
  assert.deepEqual(cmd, { type: 'shuffleAll', payload: { zoneId: 'discard' } });
});

test('discardAll: translates zoneId only', () => {
  const cmd = translateActionToCmd('discardAll', ['opp', 'hand']);
  assert.deepEqual(cmd, { type: 'discardAll', payload: { zoneId: 'hand' } });
});

test('lostZoneAll: translates zoneId only', () => {
  const cmd = translateActionToCmd('lostZoneAll', ['opp', 'discard']);
  assert.deepEqual(cmd, {
    type: 'lostZoneAll',
    payload: { zoneId: 'discard' },
  });
});

test('handAll: translates zoneId only', () => {
  const cmd = translateActionToCmd('handAll', ['self', 'lostZone']);
  assert.deepEqual(cmd, { type: 'handAll', payload: { zoneId: 'lostZone' } });
});

test('leaveAll: translates source and destination zone', () => {
  const cmd = translateActionToCmd('leaveAll', ['self', 'active', 'bench']);
  assert.deepEqual(cmd, {
    type: 'leaveAll',
    payload: { from: 'active', to: 'bench' },
  });
});

test('discardAndDraw: translates draw count, non-negative fallback', () => {
  assert.deepEqual(translateActionToCmd('discardAndDraw', ['self', 3]), {
    type: 'discardAndDraw',
    payload: { count: 3 },
  });
  assert.deepEqual(
    translateActionToCmd('discardAndDraw', ['self', 'not-a-number']),
    {
      type: 'discardAndDraw',
      payload: { count: 0 },
    }
  );
});

test('shuffleAndDraw: translates draw count only, drops indices', () => {
  const cmd = translateActionToCmd('shuffleAndDraw', ['opp', 4, [2, 0, 1]]);
  assert.deepEqual(cmd, { type: 'shuffleAndDraw', payload: { count: 4 } });
});

test('shuffleBottomAndDraw: translates draw count only, drops indices', () => {
  const cmd = translateActionToCmd('shuffleBottomAndDraw', ['self', 2, [1, 0]]);
  assert.deepEqual(cmd, {
    type: 'shuffleBottomAndDraw',
    payload: { count: 2 },
  });
});

test('shufflePrizesToDeckBottom: translates to an empty payload, drops indices', () => {
  const cmd = translateActionToCmd('shufflePrizesToDeckBottom', [
    'self',
    [3, 2, 1, 0],
  ]);
  assert.deepEqual(cmd, { type: 'shufflePrizesToDeckBottom', payload: {} });
});

// --- Prize & board ops (design 002 slice 3.4b) ---

test('takePrizes: translates count, non-positive fallback to 1', () => {
  assert.deepEqual(translateActionToCmd('takePrizes', ['self', 2]), {
    type: 'takePrizes',
    payload: { count: 2 },
  });
  assert.deepEqual(translateActionToCmd('takePrizes', ['self', 0]), {
    type: 'takePrizes',
    payload: { count: 1 },
  });
});

test('takePrizesByIndex: translates indices, drops non-integer/negative entries', () => {
  const cmd = translateActionToCmd('takePrizesByIndex', [
    'self',
    [0, 2, -1, 1.5],
  ]);
  assert.deepEqual(cmd, {
    type: 'takePrizesByIndex',
    payload: { indices: [0, 2] },
  });
});

test('takePrizesByIndex: returns null when indices is not an array', () => {
  const cmd = translateActionToCmd('takePrizesByIndex', ['self', undefined]);
  assert.equal(cmd, null);
});

test('discardBoard: translates to an empty payload', () => {
  const cmd = translateActionToCmd('discardBoard', ['self', true]);
  assert.deepEqual(cmd, { type: 'discardBoard', payload: {} });
});

test('handBoard: translates to an empty payload', () => {
  const cmd = translateActionToCmd('handBoard', ['self', true]);
  assert.deepEqual(cmd, { type: 'handBoard', payload: {} });
});

test('shuffleBoard: translates to an empty payload, drops indices', () => {
  const cmd = translateActionToCmd('shuffleBoard', ['self', true, [1, 0]]);
  assert.deepEqual(cmd, { type: 'shuffleBoard', payload: {} });
});

test('lostZoneBoard: translates to an empty payload', () => {
  const cmd = translateActionToCmd('lostZoneBoard', ['self', true]);
  assert.deepEqual(cmd, { type: 'lostZoneBoard', payload: {} });
});

// --- Reveal / look family (design 002 slice 3.4d, I19) ---
// revealCards/hideCards/revealShortcut/hideShortcut were reclassified 'server_command'
// (I19): nothing server-side ever set card.revealed=true, so the redaction they were
// meant to be "replaced by" was unreachable. lookShortcut/stopLookingShortcut stay
// 'replaced_by_redaction' (local-only viewing, no state mutation) and lookAtCards /
// stopLookingAtCards stay 'announcement_only' — those are untouched by I19.

test('revealShortcut: translates zoneId/index, no cardHint needed', () => {
  const cmd = translateActionToCmd('revealShortcut', ['prizes', 2]);
  assert.deepEqual(cmd, {
    type: 'revealShortcut',
    payload: { zoneId: 'prizes', index: 2 },
  });
});

test('hideShortcut: translates zoneId/index, no cardHint needed', () => {
  const cmd = translateActionToCmd('hideShortcut', ['hand', 0]);
  assert.deepEqual(cmd, {
    type: 'hideShortcut',
    payload: { zoneId: 'hand', index: 0 },
  });
});

test('revealCards: translates zoneId only', () => {
  const cmd = translateActionToCmd('revealCards', ['prizes']);
  assert.deepEqual(cmd, { type: 'revealCards', payload: { zoneId: 'prizes' } });
});

test('hideCards: translates zoneId only', () => {
  const cmd = translateActionToCmd('hideCards', ['prizes']);
  assert.deepEqual(cmd, { type: 'hideCards', payload: { zoneId: 'prizes' } });
});

test('revealShortcut/hideShortcut/revealCards/hideCards: null for missing/non-string zoneId', () => {
  assert.equal(translateActionToCmd('revealShortcut', [42, 0]), null);
  assert.equal(translateActionToCmd('hideShortcut', ['prizes', 'x']), null);
  assert.equal(translateActionToCmd('revealCards', [42]), null);
  assert.equal(translateActionToCmd('hideCards', []), null);
});

test('disposition gate: replaced_by_redaction actions (look shortcuts) stay relay-only, no command', () => {
  for (const action of ['lookShortcut', 'stopLookingShortcut']) {
    assert.equal(
      translateActionToCmd(action, ['self']),
      null,
      `${action} should not produce a command`
    );
  }
});

test('disposition gate: announcement_only actions (lookAtCards family) stay relay-only, no command', () => {
  for (const action of ['lookAtCards', 'stopLookingAtCards']) {
    assert.equal(
      translateActionToCmd(action, ['self']),
      null,
      `${action} should not produce a command`
    );
  }
});

test('disposition gate: an action absent from DISPOSITION_TABLE throws under a dev-like environment', () => {
  // node --test runs with NODE_ENV unset (not 'production'), so isDevLikeEnvironment() is true.
  assert.throws(
    () => translateActionToCmd('totallyMadeUpAction', []),
    /totallyMadeUpAction/
  );
});
