import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS_MARKER_TYPES,
  getSpecialConditionClass,
} from '../special-condition-style.mjs';

describe('getSpecialConditionClass', () => {
  it('maps poison and burn to official-style marker classes', () => {
    assert.equal(getSpecialConditionClass('P'), 'status-poison');
    assert.equal(getSpecialConditionClass('p'), 'status-poison');
    assert.equal(getSpecialConditionClass('B'), 'status-burn');
    assert.equal(getSpecialConditionClass('b'), 'status-burn');
  });

  it('maps other condition codes', () => {
    assert.equal(getSpecialConditionClass('A'), 'status-asleep');
    assert.equal(getSpecialConditionClass('Pa'), 'status-paralyzed');
    assert.equal(getSpecialConditionClass('C'), 'status-confused');
    assert.equal(getSpecialConditionClass('?'), 'status-default');
  });

  it('exports marker type list for class toggling', () => {
    assert.ok(STATUS_MARKER_TYPES.includes('status-poison'));
    assert.ok(STATUS_MARKER_TYPES.includes('status-burn'));
  });
});
