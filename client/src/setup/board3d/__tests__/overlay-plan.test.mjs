import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_ASPECT,
  counterPlan,
  countLabelPlan,
  energyRowPlan,
  markerPlan,
} from '../overlay-plan.mjs';
import { planEnergyTokenRow } from '../../../actions/move-card-bundle/energy-token-row.mjs';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('damage 30 / 120 / 250 map to the DAMAGE_COUNTER_TIERS bands', () => {
  assert.equal(counterPlan({ damage: 30 }).tier, 'dmg-tier-20');
  assert.equal(counterPlan({ damage: 120 }).tier, 'dmg-tier-100');
  assert.equal(counterPlan({ damage: 250 }).tier, 'dmg-tier-100');
  assert.equal(counterPlan({ damage: 10 }).tier, 'dmg-tier-10');
  assert.equal(counterPlan({ damage: 60 }).tier, 'dmg-tier-50');
  assert.equal(counterPlan({ damage: 250 }).digits, '250');
});

test('no counter for zero damage or a back face', () => {
  assert.equal(counterPlan({ damage: 0 }), null);
  assert.equal(counterPlan({}), null);
  assert.equal(counterPlan(null), null);
  assert.equal(counterPlan({ damage: 30, face: 'back' }), null);
});

test('the counter sits where apply-view puts it: 2/3 across, a quarter down, 1/3 wide', () => {
  const plan = counterPlan({ damage: 30 }, { aspect: 1.5 });
  assert.equal(plan.size, 1 / 3);
  assert.ok(near(plan.anchor[0], 1 / 3));
  assert.ok(near(plan.anchor[1], 0.25 - 1 / 3 / 1.5 / 2));
  const defaultAspect = counterPlan({ damage: 30 });
  assert.ok(near(defaultAspect.anchor[1], 0.25 - 1 / 3 / CARD_ASPECT / 2));
});

test('poison and burn both get markers, stacked under the rotation condition', () => {
  const plan = markerPlan({ conditions: ['Poisoned', 'Burned', 'Asleep'] }, { aspect: 1.5 });
  const step = 1 / 3 / 1.5;
  assert.equal(plan.conditionLabel.text, 'Asleep');
  assert.ok(near(plan.conditionLabel.anchor[0], -1 / 3));
  assert.ok(near(plan.conditionLabel.anchor[1], 0.25 - step / 2));
  assert.ok(near(plan.poison[1], 0.25 - step - step / 2));
  assert.ok(near(plan.burn[1], 0.25 - 2 * step - step / 2));
  assert.ok(near(plan.poison[0], -1 / 3) && near(plan.burn[0], -1 / 3));
  assert.equal(plan.abilityTab, null);
});

test('markers read a view card through listConditions too', () => {
  const plan = markerPlan({ poisoned: true, burned: true });
  assert.notEqual(plan.poison, null);
  assert.notEqual(plan.burn, null);
  assert.equal(plan.conditionLabel, null);
  assert.ok(plan.poison[1] > plan.burn[1], 'Poison above Burn');
});

test('the ability tab spans the card from its middle down', () => {
  const plan = markerPlan({ abilityUsed: true }, { aspect: 1.5 });
  assert.deepEqual(plan.abilityTab, [0, -0.2 / 1.5 / 2]);
  assert.deepEqual(plan.abilityTabSize, [1, 0.2]);
  assert.equal(markerPlan({ abilityUsed: true, face: 'back' }).abilityTab, null);
});

test('count labels read "(N)" above the pile', () => {
  assert.deepEqual(countLabelPlan('deck', 0), { text: '(0)', anchor: [0, 0.58] });
  assert.equal(countLabelPlan('discard', 1).text, '(1)');
  assert.equal(countLabelPlan('lostZone', 60).text, '(60)');
  assert.equal(countLabelPlan('prizes', 6).text, '(6)');
  assert.equal(countLabelPlan('deck', Number.NaN).text, '(0)');
  assert.equal(countLabelPlan('hand', 3), null);
});

test('energy row follows planEnergyTokenRow along the bottom edge', () => {
  const keys = ['fire', 'fire', 'dce'];
  const plan = energyRowPlan(keys, 200, { aspect: 1.5 });
  const px = planEnergyTokenRow(keys, 200);
  const size = px.tokenSize / 200;
  assert.ok(near(plan.tokenSize, 0.24));
  plan.tokens.forEach((token, i) => {
    assert.ok(near(token.anchor[0], -0.5 + px.tokens[i].left / 200 + size / 2));
    assert.ok(near(token.anchor[1], -0.5 + 0.03 + size / 1.5 / 2));
    assert.equal(token.zIndex, px.tokens[i].zIndex);
  });
  assert.deepEqual(plan.badges, []);
});

test('more than four tokens produce badges; bad input gives an empty row', () => {
  const plan = energyRowPlan([{ src: 'a' }, { src: 'a' }, { src: 'a' }, { src: 'a' }, { src: 'b' }], 200);
  assert.deepEqual(plan.badges.map((b) => b.label), ['4x']);
  assert.ok(plan.tokens.every((t) => t.anchor[0] >= -0.5 && t.anchor[0] <= 0.5));
  assert.deepEqual(energyRowPlan([], 200), { tokenSize: 0, tokens: [], badges: [] });
  assert.deepEqual(energyRowPlan(['a'], 0), { tokenSize: 0, tokens: [], badges: [] });
});
