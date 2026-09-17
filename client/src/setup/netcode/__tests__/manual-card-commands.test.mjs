import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONDITION_CYCLE,
  planCardKeyCommands,
  planMenuCommands,
} from '../manual-card-commands.mjs';
import { translateActionToCmd } from '../dual-run-bridge.js';
import { validateCommandShape } from '../../../../../shared/engine/commands.mjs';

const card = (props = {}) => ({ instanceId: 41, damage: 0, abilityUsed: false, rotation: 0, ...props });

// Every planned command must survive the real translator and schema — otherwise the key
// silently sends nothing, which is the bug design 012 fixes.
function toServer(commands) {
  return commands.map(({ action, params }) => {
    if (action === 'moveCardToBoard') {
      const [{ instanceId, from }] = params;
      const cmd = { type: 'moveCard', payload: { instanceId, from, to: 'board' } };
      assert.equal(validateCommandShape(cmd).valid, true);
      return cmd;
    }
    const cmd = translateActionToCmd(action, params);
    assert.ok(cmd, `${action} did not translate`);
    assert.equal(validateCommandShape(cmd).valid, true, `${action}: ${validateCommandShape(cmd).reason}`);
    return cmd;
  });
}

const keyPlan = (input) => planCardKeyCommands({ zoneId: 'active', isOwnCard: true, ...input });

test('a digit adds that many tens of damage to an undamaged Pokémon', () => {
  assert.deepEqual(toServer(keyPlan({ key: '3', code: 'Digit3', card: card() })), [
    { type: 'addDamageCounter', payload: { instanceId: 41, amount: 30 } },
  ]);
});

test('a digit adjusts existing damage; alt subtracts and never goes below zero', () => {
  assert.deepEqual(toServer(keyPlan({ key: '2', card: card({ damage: 50 }) })), [
    { type: 'updateDamageCounter', payload: { instanceId: 41, amount: 70 } },
  ]);
  assert.deepEqual(toServer(keyPlan({ key: '2', alt: true, card: card({ damage: 50 }) })), [
    { type: 'updateDamageCounter', payload: { instanceId: 41, amount: 30 } },
  ]);
  assert.deepEqual(toServer(keyPlan({ key: '9', alt: true, card: card({ damage: 50 }) })), [
    { type: 'updateDamageCounter', payload: { instanceId: 41, amount: 0 } },
  ]);
});

test('alt-digit on an undamaged Pokémon and 0 without damage do nothing', () => {
  assert.equal(keyPlan({ key: '4', alt: true, card: card() }), null);
  assert.equal(keyPlan({ key: '0', card: card() }), null);
});

test('0 clears damage', () => {
  assert.deepEqual(toServer(keyPlan({ key: '0', card: card({ damage: 20 }) })), [
    { type: 'updateDamageCounter', payload: { instanceId: 41, amount: 0 } },
  ]);
});

test('damage keys only apply to Pokémon in play, and read the layout-independent code', () => {
  assert.equal(keyPlan({ key: '3', zoneId: 'hand', card: card() }), null);
  assert.equal(keyPlan({ key: '£', code: 'Digit3', zoneId: 'bench', card: card() })[0].params[0].amount, 30);
});

test('y adds Poison, then cycles one condition at a time in legacy order', () => {
  assert.deepEqual(toServer(keyPlan({ key: 'y', card: card() })), [
    { type: 'addSpecialCondition', payload: { instanceId: 41, condition: 'Poisoned' } },
  ]);
  for (let i = 0; i < CONDITION_CYCLE.length; i++) {
    const held = CONDITION_CYCLE[i];
    const next = CONDITION_CYCLE[(i + 1) % CONDITION_CYCLE.length];
    const markers = held === 'Poisoned' ? { poisoned: true } : held === 'Burned' ? { burned: true } : {};
    const specialCondition = markers.poisoned || markers.burned ? null : held;
    assert.deepEqual(toServer(keyPlan({ key: 'y', card: card({ specialCondition, ...markers }) })), [
      { type: 'removeSpecialCondition', payload: { instanceId: 41 } },
      { type: 'addSpecialCondition', payload: { instanceId: 41, condition: next } },
    ]);
  }
});

test('y cycles on from the last stacked condition; alt-y clears them all', () => {
  const stacked = card({ poisoned: true, burned: true, specialCondition: 'Confused' });
  assert.equal(keyPlan({ key: 'y', card: stacked })[1].params[0].condition, 'Asleep');
  assert.deepEqual(toServer(keyPlan({ key: 'y', alt: true, card: stacked })), [
    { type: 'removeSpecialCondition', payload: { instanceId: 41 } },
  ]);
  assert.equal(keyPlan({ key: 'y', alt: true, card: card() }), null);
  assert.equal(keyPlan({ key: 'y', zoneId: 'bench', card: card() }), null);
});

test('r rotates a quarter turn; alt-r toggles sideways on Pokémon in play only', () => {
  assert.deepEqual(toServer(keyPlan({ key: 'r', card: card({ rotation: 270 }) })), [
    { type: 'rotateCard', payload: { instanceId: 41, rotation: 0 } },
  ]);
  assert.equal(keyPlan({ key: 'r', zoneId: 'stadium', card: card() })[0].params[0].rotation, 90);
  assert.equal(keyPlan({ key: 'R', alt: true, card: card({ rotation: 90 }) })[0].params[0].rotation, 0);
  assert.equal(keyPlan({ key: 'r', alt: true, zoneId: 'stadium', card: card() }), null);
  assert.equal(keyPlan({ key: 'r', zoneId: 'hand', card: card() }), null);
});

test('alt-e/t/p change type and move an own card onto the board', () => {
  assert.deepEqual(toServer(keyPlan({ key: 'e', alt: true, zoneId: 'hand', card: card() })), [
    { type: 'changeType', payload: { instanceId: 41, type: 'Energy' } },
    { type: 'moveCard', payload: { instanceId: 41, from: 'hand', to: 'board' } },
  ]);
  assert.equal(keyPlan({ key: 't', alt: true, zoneId: 'board', card: card() }).length, 1);
  assert.deepEqual(toServer(keyPlan({ key: 'p', alt: true, zoneId: 'bench', isOwnCard: false, card: card() })), [
    { type: 'changeType', payload: { instanceId: 41, type: 'Pokémon' } },
  ]);
  assert.equal(keyPlan({ key: 'e', card: card() }), null);
});

test('w clears a used ability marker and otherwise leaves the key to the ability flow', () => {
  assert.deepEqual(toServer(keyPlan({ key: 'w', card: card({ abilityUsed: true }) })), [
    { type: 'removeAbilityCounter', payload: { instanceId: 41 } },
  ]);
  assert.equal(keyPlan({ key: 'w', card: card() }), null);
});

test('no card, a redacted card without an id, or an unrelated key plans nothing', () => {
  assert.equal(keyPlan({ key: '3', card: null }), null);
  assert.equal(keyPlan({ key: '3', card: { instanceId: '41' } }), null);
  assert.equal(keyPlan({ key: 'x', card: card() }), null);
});

test('context-menu buttons place real values on a server card', () => {
  const menu = (buttonId, props, extra = {}) =>
    planMenuCommands({ buttonId, zoneId: 'bench', isOwnCard: true, card: card(props), ...extra });
  assert.deepEqual(toServer(menu('damageCounterButton')), [
    { type: 'addDamageCounter', payload: { instanceId: 41, amount: 10 } },
  ]);
  assert.deepEqual(toServer(menu('specialConditionButton')), [
    { type: 'addSpecialCondition', payload: { instanceId: 41, condition: 'Poisoned' } },
  ]);
  assert.equal(menu('specialConditionButton', { poisoned: true }), null);
  assert.deepEqual(toServer(menu('abilityCounterButton', { abilityUsed: true })), [
    { type: 'removeAbilityCounter', payload: { instanceId: 41 } },
  ]);
  assert.equal(menu('abilityCounterButton'), null);
  assert.equal(toServer(menu('changeToToolButton')).at(-1).type, 'moveCard');
  assert.equal(menu('viewAttachedCardsButton'), null);
});
