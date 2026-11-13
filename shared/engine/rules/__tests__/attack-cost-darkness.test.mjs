// I262: an Energy read as 'Dark' never paid a 'Darkness' cost (and the reverse), so the legacy
// client refused Absorb Vitality (Yveltal-GX, Forbidden Light 137, out/pkmn-pokemon-cards.json:
// "{D} → Absorb Vitality : 20") with a Darkness Energy attached.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canPayAttackCost } from '../attack-engine.mjs';

test("'Dark' and 'Darkness' are one type when a cost is paid, whichever side spells it which way", () => {
  assert.equal(canPayAttackCost(['Dark'], ['Darkness']), true);
  assert.equal(canPayAttackCost(['Darkness'], ['Dark']), true);
  assert.equal(canPayAttackCost([{ type: 'Dark', family: 'basic' }], ['Darkness']), true);
  assert.equal(canPayAttackCost([{ type: 'Dark', family: 'attach-type' }], ['Darkness']), true);
});

test('a double or two-type Energy spelled Dark pays Darkness too', () => {
  assert.equal(canPayAttackCost([{ type: 'Dark', family: 'double' }], ['Darkness', 'Darkness']), true);
  assert.equal(canPayAttackCost([{ type: 'Metal', dualType: 'Dark' }], ['Darkness']), true);
  assert.equal(canPayAttackCost([{ type: 'Dark', provides: ['Dark|Metal'] }], ['Darkness']), true);
});

test('the Darkness spelling pays nothing it did not pay before', () => {
  assert.equal(canPayAttackCost(['Dark'], ['Fire']), false);
  assert.equal(canPayAttackCost(['Dark'], ['Darkness', 'Darkness']), false);
  assert.equal(canPayAttackCost(['Fire'], ['Darkness']), false);
  assert.equal(canPayAttackCost(['Dark'], ['Colorless']), true);
  assert.equal(canPayAttackCost([], ['Darkness']), false);
  assert.equal(canPayAttackCost([null, { type: '' }], ['Dark']), false);
});
