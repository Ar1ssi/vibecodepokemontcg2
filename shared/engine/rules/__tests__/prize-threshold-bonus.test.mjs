import test from 'node:test';
import assert from 'node:assert/strict';

const { parseAttackDamage } = await import('../damage-parser.mjs');

// Source: TCGdex me02-045 Zacian "Limit Break" {P}{C} 50+
const LIMIT_BREAK = {
  name: 'Limit Break',
  damage: '50+',
  text: 'If your opponent has 3 or fewer Prize cards remaining, this attack does 90 more damage.',
};

test('Zacian Limit Break: +90 only when the opponent has 3 or fewer Prize cards', () => {
  for (const [prizes, total] of [[6, 50], [4, 50], [3, 140], [1, 140]]) {
    const r = parseAttackDamage(LIMIT_BREAK, { name: 'Zacian' }, {}, { opponentPrizes: prizes, benchNames: [] });
    assert.equal(r.total, total, `${prizes} prizes left`);
  }
});

test('Counter Jewel (2 or fewer Prize cards, +100) is not per-Prize scaling either', () => {
  const attack = {
    name: 'Counter Jewel',
    damage: '70+',
    text: 'If your opponent has 2 or fewer Prize cards remaining, this attack does 100 more damage.',
  };
  assert.equal(parseAttackDamage(attack, {}, {}, { opponentPrizes: 3, benchNames: [] }).total, 70);
  assert.equal(parseAttackDamage(attack, {}, {}, { opponentPrizes: 2, benchNames: [] }).total, 170);
});
