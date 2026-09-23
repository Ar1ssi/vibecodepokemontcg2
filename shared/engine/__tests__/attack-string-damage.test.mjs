// I117: TCGdex prints scaling attacks' damage as strings ("30+", "30×"). parseAttackDamage
// read them as a base of 0, so "N more damage for each …" dropped the printed number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAttackDamage } from '../rules/damage-parser.mjs';

test('"30+" keeps its printed 30 under "20 more damage for each Energy" (I117)', () => {
  const parsed = parseAttackDamage(
    { name: 'Surf', damage: '30+', text: 'This attack does 20 more damage for each {W} Energy attached to this Pokémon.' },
    {},
    {},
    { energyCount: 2 }
  );
  assert.equal(parsed.base, 30);
  assert.equal(parsed.total, 70);
});

test('"30×" with no heads does no damage (I117)', () => {
  const parsed = parseAttackDamage(
    { name: 'Double Kick', damage: '30×', text: 'Flip 2 coins. This attack does 30 damage for each heads.' },
    {},
    {},
    { coin: 'tails', headsCount: 0 }
  );
  assert.equal(parsed.total, 0);
  assert.notEqual(parsed.total, parsed.base, 'the reducer applies the 0, not the printed 30');
});
