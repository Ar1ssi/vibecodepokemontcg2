// Whole-attack condition gates (design 036 A1): one case per descriptor kind, using the real
// card texts the S279 attack audit verified (report.md §A1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAttackCondition, attackConditionMet } from '../attack-conditions.mjs';

const withDefender = (extra = {}) => ({ defenderPresent: true, ...extra });
const met = (text, context, selfName = '') =>
  attackConditionMet(parseAttackCondition(text, { selfName }), context);

// [kind, printed text, ctx where the attack proceeds, ctx where it does nothing]
const CASES = [
  [
    'defenderStatus',
    "If your opponent's Active Pokémon isn't Confused, this attack does nothing.",
    { defenderConditions: ['Confused'] },
    { defenderConditions: [] },
  ],
  [
    'attackerStatus',
    "If this Pokémon isn't Confused, this attack does nothing.",
    { attackerConditions: ['Confused'] },
    { attackerConditions: [] },
  ],
  [
    'noStadium',
    'If there is no Stadium in play, this attack does nothing.',
    { stadiumInPlay: true },
    { stadiumInPlay: false },
  ],
  [
    'noStadium',
    'If there is any Stadium card in play, this attack does nothing.',
    { stadiumInPlay: false },
    { stadiumInPlay: true },
  ],
  [
    'handCount',
    "If you don't have exactly 7 cards in your hand, this attack does nothing.",
    { ownHandCount: 7 },
    { ownHandCount: 33 },
  ],
  [
    'handCountVsOpponent',
    'If you have more or the same number of cards in your hand as your opponent, this attack does nothing.',
    { ownHandCount: 3, opponentHandCount: 5 },
    { ownHandCount: 5, opponentHandCount: 3 },
  ],
  [
    'sameHandCountAsOpponent',
    "If you don't have the same number of cards in your hand as your opponent, this attack does nothing.",
    { ownHandCount: 5, opponentHandCount: 5 },
    { ownHandCount: 5, opponentHandCount: 4 },
  ],
  [
    'benchCount',
    'If you have 4 or fewer Benched Pokémon, this attack does nothing.',
    { benchNames: ['a', 'b', 'c', 'd', 'e'] },
    { benchNames: ['a', 'b', 'c'] },
  ],
  [
    'benchCount',
    "If you don't have any Benched Pokémon, this attack does nothing.",
    { benchNames: ['a'] },
    { benchNames: [] },
  ],
  [
    'benchCount',
    'If you have 4 or fewer {G} Pokémon on your Bench, this attack does nothing.',
    { benchNames: ['a', 'b', 'c', 'd', 'e'], benchTypes: [['Grass'], ['Grass'], ['Grass'], ['Grass'], ['Grass']] },
    { benchNames: ['a', 'b', 'c', 'd', 'e'], benchTypes: [['Grass'], ['Grass'], ['Grass'], ['Grass'], ['Fire']] },
  ],
  [
    'benchHasName',
    "If you don't have Lunatone on your Bench, this attack does nothing. This attack's damage isn't affected by Weakness or Resistance.",
    { benchNames: ['Lunatone'] },
    { benchNames: ['Solrock'] },
  ],
  [
    'benchHasName',
    "If you don't have Uxie and Azelf on your Bench, this attack does nothing.",
    { benchNames: ['Uxie', 'Azelf'] },
    { benchNames: ['Uxie'] },
  ],
  [
    'inPlayHasName',
    "If you don't have Illumise in play, this attack does nothing.",
    { ownInPlayNames: ['Illumise'] },
    { ownInPlayNames: ['Volbeat'] },
  ],
  [
    'defenderRuleBox',
    "If your opponent's Active Pokémon isn't a Pokémon ex, this attack does nothing.",
    { defenderIsEx: true },
    { defenderIsEx: false },
  ],
  [
    'defenderRuleBox',
    "If your opponent's Active Pokémon isn't a Basic Pokémon, this attack does nothing.",
    { defenderIsBasic: true },
    { defenderIsBasic: false },
  ],
  [
    'defenderRuleBox',
    "If your opponent's Active Pokémon isn't a Tera Pokémon, this attack does nothing.",
    { defenderIsTera: true },
    { defenderIsTera: false },
  ],
  [
    'defenderRuleBox',
    "If your opponent's Active Pokémon isn't a Radiant Pokémon, this attack does nothing.",
    { defenderIsRadiant: true },
    { defenderIsRadiant: false },
  ],
  [
    'defenderRuleBox',
    "If your opponent's Active Pokémon isn't a Mega Pokémon, this attack does nothing.",
    { defenderIsMega: true },
    { defenderIsMega: false },
  ],
  [
    'movedToActiveThisTurn',
    "If this Pokémon didn't move from the Bench to the Active Spot this turn, this attack does nothing.",
    { attackerMovedToActiveThisTurn: true },
    { attackerMovedToActiveThisTurn: false },
  ],
  [
    'evolvedThisTurn',
    'If this Pokémon evolved during this turn, this attack does nothing.',
    { attackerEvolvedThisTurn: false },
    { attackerEvolvedThisTurn: true },
  ],
  [
    'attackerDamageCounters',
    'If this Pokémon has 4 or more damage counters on it, this attack does nothing.',
    { attackerDamage: 20 },
    { attackerDamage: 40 },
  ],
  [
    'attackerDamageCounters',
    'If this Pokémon has no damage counters on it, this attack does nothing.',
    { attackerDamage: 10 },
    { attackerDamage: 0 },
  ],
  [
    'defenderDamageCounters',
    "If your opponent's Active Pokémon has no damage counters on it before this attack does damage, this attack does nothing.",
    { defenderDamage: 10 },
    { defenderDamage: 0 },
  ],
  [
    'defenderDamageCounters',
    "If your opponent's Active Pokémon already has any damage counters on it before this attack does damage, this attack does nothing.",
    { defenderDamage: 0 },
    { defenderDamage: 10 },
  ],
  [
    'opponentPrizes',
    "If your opponent doesn't have exactly 3 or 4 Prize cards remaining, this attack does nothing.",
    { opponentPrizes: 3 },
    { opponentPrizes: 5 },
  ],
  [
    'ownPrizes',
    'If you have exactly 2, 4, or 6 Prize cards remaining, this attack does nothing.',
    { ownPrizes: 5 },
    { ownPrizes: 6 },
  ],
  [
    'opponentHandCount',
    'If your opponent has 3 or fewer cards in their hand, this attack does nothing.',
    { opponentHandCount: 4 },
    { opponentHandCount: 3 },
  ],
  [
    'attackerEnergyType',
    'If this Pokémon has no Voltaic {L} Energy attached, this attack does nothing.',
    { attackerEnergyNames: ['Voltaic Energy'] },
    { attackerEnergyNames: ['Basic Lightning Energy'] },
  ],
  [
    'attackerEnergyType',
    'If this Pokémon has no {L} Energy attached, this attack does nothing.',
    { attackerEnergyTypes: ['Lightning'] },
    { attackerEnergyTypes: ['Fire'] },
  ],
  [
    'attackerEnergyType',
    'If this Pokémon has any {L} Energy attached, this attack does nothing.',
    { attackerEnergyTypes: ['Fire'] },
    { attackerEnergyTypes: ['Lightning'] },
  ],
  [
    'attackerEnergyType',
    'If this Pokémon has no {L} Energy attached, this attack does nothing.',
    // Holon Research Tower units provide either of their two types.
    { attackerEnergyTypes: ['Lightning|Fighting'] },
    { attackerEnergyTypes: ['Fire|Water'] },
  ],
  [
    'discardEnergyCount',
    "If you don't have 10 or more basic {F} Energy cards in your discard pile, this attack does nothing.",
    { ownDiscardEnergy: Array.from({ length: 10 }, () => ({ name: 'Basic Fighting Energy', type: 'Fighting', basic: true })) },
    { ownDiscardEnergy: [{ name: 'Basic Fighting Energy', type: 'Fighting', basic: true }] },
  ],
  [
    'defenderMaxHp',
    "If your opponent's Active Pokémon's maximum HP is 100 or more, this attack does nothing.",
    { defenderMaxHp: 90 },
    { defenderMaxHp: 120 },
  ],
  [
    'defenderRemainingHpVsAttacker',
    "If the Defending Pokémon has the same or less remaining HP as Swalot, this attack does nothing.",
    { defenderRemainingHp: 50, attackerRemainingHp: 40 },
    { defenderRemainingHp: 30, attackerRemainingHp: 40 },
    'Swalot',
  ],
  [
    'defenderHasSpecialEnergy',
    "If your opponent's Active Pokémon has any Special Energy attached, this attack does nothing.",
    { defenderSpecialEnergyCount: 0 },
    { defenderSpecialEnergyCount: 1 },
  ],
];

test('one case per kind: the attack proceeds only in the printed state', () => {
  for (const [kind, text, trueCtx, falseCtx, selfName = ''] of CASES) {
    const cond = parseAttackCondition(text, { selfName });
    assert.equal(cond?.kind, kind, text);
    assert.equal(met(text, withDefender(trueCtx), selfName), true, `met: ${text}`);
    assert.equal(met(text, withDefender(falseCtx), selfName), false, `unmet: ${text}`);
  }
});

test('coin-gated "does nothing" clauses are design 032, not a state gate', () => {
  assert.equal(parseAttackCondition('Flip a coin. If tails, this attack does nothing.'), null);
  assert.equal(parseAttackCondition('Flip a coin. If heads, this attack does nothing.'), null);
  assert.equal(parseAttackCondition('Flip 2 coins. If both of them are tails, this attack does nothing.'), null);
});

test('unknown, empty and non-gating text return null', () => {
  assert.equal(parseAttackCondition(''), null);
  assert.equal(parseAttackCondition(undefined), null);
  assert.equal(parseAttackCondition('If the moon is full, this attack does nothing.'), null);
  assert.equal(parseAttackCondition('Your opponent’s Active Pokémon is now Asleep.'), null);
  assert.equal(parseAttackCondition('If you can’t discard a card, this attack does nothing.'), null);
});

test('a null descriptor is always met', () => {
  assert.equal(attackConditionMet(null, {}), true);
});

test('conditions that read the defender are skipped when there is no defender', () => {
  const cond = parseAttackCondition(
    "If your opponent's Active Pokémon isn't Confused, this attack does nothing."
  );
  assert.equal(attackConditionMet(cond, { defenderPresent: false }), true);
  assert.equal(attackConditionMet(cond, { defenderPresent: false, defenderConditions: [] }), true);
});

test('an unknown descriptor kind fails open', () => {
  assert.equal(attackConditionMet({ kind: 'notARealKind' }, {}), true);
});

test('Eternatus: "Discard a Stadium in play. If you can’t, …" gates on a Stadium in play', () => {
  const text = "Discard a Stadium in play. If you can't, this attack does nothing.";
  assert.deepEqual(parseAttackCondition(text), { kind: 'noStadium', negated: true });
  assert.equal(met(text, { stadiumInPlay: true }), true);
  assert.equal(met(text, { stadiumInPlay: false }), false);
});

test('the attacker name normalizes to "this Pokémon" before matching', () => {
  const text = "If Swalot's remaining HP is 40 or less, this attack does nothing.";
  assert.equal(parseAttackCondition(text, { selfName: 'Swalot' }), null);
  const real =
    'If the Defending Pokémon has the same or less remaining HP as Swalot, this attack does nothing.';
  // The gate inverts the printed clause: the attack proceeds when the defender has MORE
  // remaining HP than the attacker.
  assert.deepEqual(parseAttackCondition(real, { selfName: 'Swalot' }), {
    kind: 'defenderRemainingHpVsAttacker',
    op: 'lte',
    negated: true,
  });
});
