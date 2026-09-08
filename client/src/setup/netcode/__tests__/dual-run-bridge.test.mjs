import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateActionToCmd, normalizeSpecialCondition } from '../dual-run-bridge.js';
import { validateCommandShape } from '../../../../../shared/engine/commands.mjs';

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

test('updateDamageCounter: maps parameters [zoneId, index, amount, hint] correctly', () => {
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

test('updateSpecialCondition: maps code [zoneId, index, textContent, hint] correctly', () => {
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

test('useAbility: maps [oInitiator, zoneId, resolved, hint] from legacy UI', () => {
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
