import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCommandShape,
  COMMAND_SCHEMAS,
  DISPOSITION_TABLE,
  VALID_ZONES,
  SPECIAL_CONDITIONS,
} from '../commands.mjs';

test('commands: validateCommandShape rejects non-objects and unknown command types (Edge Case 2)', () => {
  assert.equal(validateCommandShape(null).valid, false);
  assert.equal(validateCommandShape(undefined).valid, false);
  assert.equal(validateCommandShape('string').valid, false);
  assert.equal(validateCommandShape({}).valid, false);
  assert.equal(validateCommandShape({ type: '' }).valid, false);
  assert.equal(validateCommandShape({ type: 'unknownCommand' }).valid, false);
});

test('commands: moveCard schema validation', () => {
  const valid = {
    type: 'moveCard',
    payload: { instanceId: 1, from: 'hand', to: 'bench', targetIndex: 0 },
  };
  assert.equal(validateCommandShape(valid).valid, true);

  // Missing instanceId
  assert.equal(
    validateCommandShape({ type: 'moveCard', payload: { from: 'hand', to: 'bench' } }).valid,
    false
  );
  // Invalid zone
  assert.equal(
    validateCommandShape({ type: 'moveCard', payload: { instanceId: 1, from: 'invalidZone', to: 'bench' } }).valid,
    false
  );
  // Invalid targetIndex
  assert.equal(
    validateCommandShape({ type: 'moveCard', payload: { instanceId: 1, from: 'hand', to: 'bench', targetIndex: -1 } }).valid,
    false
  );
});

test('commands: draw schema validation', () => {
  assert.equal(validateCommandShape({ type: 'draw', payload: {} }).valid, true);
  assert.equal(validateCommandShape({ type: 'draw', payload: { count: 3 } }).valid, true);
  assert.equal(validateCommandShape({ type: 'draw', payload: { count: 0 } }).valid, false);
  assert.equal(validateCommandShape({ type: 'draw', payload: { count: -1 } }).valid, false);
  assert.equal(validateCommandShape({ type: 'draw', payload: { count: 1.5 } }).valid, false);
});

test('commands: attachCard schema validation', () => {
  assert.equal(
    validateCommandShape({ type: 'attachCard', payload: { instanceId: 10, targetInstanceId: 20 } }).valid,
    true
  );
  // Same instanceId
  assert.equal(
    validateCommandShape({ type: 'attachCard', payload: { instanceId: 10, targetInstanceId: 10 } }).valid,
    false
  );
  // Non-integer
  assert.equal(
    validateCommandShape({ type: 'attachCard', payload: { instanceId: '10', targetInstanceId: 20 } }).valid,
    false
  );
});

test('commands: manual counter and status schema validation', () => {
  assert.equal(
    validateCommandShape({ type: 'addDamageCounter', payload: { instanceId: 1, amount: 20 } }).valid,
    true
  );
  assert.equal(
    validateCommandShape({ type: 'updateDamageCounter', payload: { instanceId: 1, amount: 0 } }).valid,
    true
  );
  assert.equal(
    validateCommandShape({ type: 'removeDamageCounter', payload: { instanceId: 1, amount: 10 } }).valid,
    true
  );
  assert.equal(
    validateCommandShape({ type: 'addSpecialCondition', payload: { instanceId: 1, condition: 'Poisoned' } }).valid,
    true
  );
  assert.equal(
    validateCommandShape({ type: 'addSpecialCondition', payload: { instanceId: 1, condition: 'Invalid' } }).valid,
    false
  );
  assert.equal(
    validateCommandShape({ type: 'updateSpecialCondition', payload: { instanceId: 1, condition: null } }).valid,
    true
  );
  assert.equal(
    validateCommandShape({ type: 'removeSpecialCondition', payload: { instanceId: 1 } }).valid,
    true
  );
  assert.equal(
    validateCommandShape({ type: 'removeAbilityCounter', payload: { instanceId: 1 } }).valid,
    true
  );
  assert.equal(
    validateCommandShape({ type: 'changeType', payload: { instanceId: 1, type: 'Water' } }).valid,
    true
  );
  assert.equal(
    validateCommandShape({ type: 'rotateCard', payload: { instanceId: 1, rotation: 90 } }).valid,
    true
  );
});

test('commands: DISPOSITION_TABLE accounts for all 59 legacy dispatch entries', () => {
  const legacyActionKeys = [
    'exchangeData', 'loadDeckData', 'changeCardBack', 'changePlaymat', 'reset', 'restartGame',
    'setup', 'setupPrizes', 'drawOpeningHand', 'readyUp', 'takeTurn', 'draw', 'moveCardBundle',
    'shuffleIntoDeck', 'moveToDeckTop', 'switchWithDeckTop', 'viewDeck', 'shuffleAll',
    'shuffleBottom', 'discardAll', 'lostZoneAll', 'handAll', 'leaveAll', 'discardAndDraw',
    'shuffleAndDraw', 'shuffleBottomAndDraw', 'shufflePrizesToDeckBottom', 'takePrizes',
    'takePrizesByIndex', 'shuffleZone', 'useAbility', 'removeAbilityCounter', 'addDamageCounter',
    'updateDamageCounter', 'removeDamageCounter', 'addSpecialCondition', 'updateSpecialCondition',
    'removeSpecialCondition', 'discardBoard', 'handBoard', 'shuffleBoard', 'lostZoneBoard',
    'lookAtCards', 'stopLookingAtCards', 'revealCards', 'hideCards', 'revealShortcut',
    'hideShortcut', 'lookShortcut', 'stopLookingShortcut', 'playRandomCardFaceDown',
    'rotateCard', 'changeType', 'attack', 'pass', 'retreat', 'stadium-effect',
    'VSTARGXFunction', 'undo',
  ];

  assert.equal(legacyActionKeys.length, 59, 'Should have exactly 59 legacy actions');
  assert.equal(Object.keys(DISPOSITION_TABLE).length, 59, 'Disposition table must have 59 entries');

  for (const key of legacyActionKeys) {
    assert.ok(DISPOSITION_TABLE[key], `Missing disposition entry for legacy action: ${key}`);
    assert.ok(DISPOSITION_TABLE[key].disposition, `Missing disposition category for: ${key}`);
  }

  // Check categories
  const categories = new Set(Object.values(DISPOSITION_TABLE).map((d) => d.disposition));
  assert.ok(categories.has('server_command'));
  assert.ok(categories.has('manual_override'));
  assert.ok(categories.has('server_lifecycle'));
  assert.ok(categories.has('replaced_by_protocol'));
  assert.ok(categories.has('replaced_by_redaction'));
  assert.ok(categories.has('announcement_only'));
  assert.ok(categories.has('client_local'));
  assert.ok(categories.has('undo'));
});
