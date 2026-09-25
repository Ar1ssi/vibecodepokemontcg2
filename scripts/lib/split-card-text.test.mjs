// Printed-cost symbols must spell the types the engine's Energy descriptors provide (I137).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCost, TYPE_SYMBOLS } from './split-card-text.mjs';
import { createCard } from '../../shared/engine/cards.mjs';
import { serverEnergyDescriptor } from '../../shared/engine/rules/server-energy.mjs';
import { canPayAttackCost } from '../../shared/engine/rules/attack-engine.mjs';

const basicEnergy = (type) =>
  createCard({
    instanceId: 1,
    name: `Basic ${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType: type,
    type: 'Energy',
  });

test('every printed {symbol} cost is payable by the matching Basic Energy', () => {
  for (const [symbol, type] of Object.entries(TYPE_SYMBOLS)) {
    const cost = parseCost(`{${symbol}}`);
    assert.deepEqual(cost, [type], `{${symbol}} → ${type}`);
    const descriptor = serverEnergyDescriptor(basicEnergy(type));
    assert.equal(
      canPayAttackCost([descriptor], cost),
      true,
      `{${symbol}} (${type}) is payable by ${descriptor.type} Energy`
    );
  }
});

test('{D} is Darkness, not the unpayable "Dark" alias', () => {
  assert.deepEqual(parseCost('{D}'), ['Darkness']);
  const darkness = serverEnergyDescriptor(basicEnergy('Darkness'));
  assert.equal(canPayAttackCost([darkness], parseCost('{D}')), true);
  assert.equal(canPayAttackCost([darkness], ['Dark']), false);
});

test('parseCost keeps multiple symbols in printed order', () => {
  assert.deepEqual(parseCost('{D}{C}'), ['Darkness', 'Colorless']);
});
