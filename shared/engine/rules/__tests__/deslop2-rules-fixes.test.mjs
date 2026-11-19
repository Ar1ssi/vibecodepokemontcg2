// Round-2 deslop fixes in rules/. Card texts are corpus rows named in each test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAttackDamage } from '../damage-parser.mjs';
import { formsAllowEvolution } from '../pokemon-forms.mjs';
import { canPayAttackCost } from '../attack-engine.mjs';
import { canRetreat } from '../retreat.mjs';
import { rulesState } from '../rules-state.mjs';
import { eachFilterMatches } from '../each-filter.mjs';

test('M Garchomp-EX Crimson Edge (out/pkmn-pokemon-cards.json, XY Promos XY168): recoil counts counters, not damage points', () => {
  const attack = {
    name: 'Crimson Edge',
    damage: 180,
    text: 'This Pokémon does 10 damage to itself for each damage counter on it.',
  };
  // A server-built ctx carries 40 damage points as attackerDamage and 4 as attackerDamageCounters.
  const ctx = { benchNames: [], defenderPresent: true, attackerDamage: 40, attackerDamageCounters: 4 };
  assert.equal(parseAttackDamage(attack, { name: 'M Garchomp-EX' }, {}, ctx).selfDamage, 40);
});

test('rule-box names told from a form of the Zygarde line with a space or a hyphen', () => {
  const complete = { name: 'Zygarde', stage: 'Stage 1', description: 'a Pokédex entry of the 50% Forme' };
  // "Zygarde-EX" is the corpus spelling (out/pkmn-pokemon-cards.json); the Mega prints "Zygarde ex".
  assert.equal(formsAllowEvolution(complete, { name: 'Zygarde-EX', stage: 'Basic' }), false);
  assert.equal(formsAllowEvolution(complete, { name: 'Zygarde ex', stage: 'Basic' }), false);
});

test('canPayAttackCost pays colored symbols before Colorless whatever the listed order', () => {
  assert.equal(canPayAttackCost(['Water', 'Fire'], ['Colorless', 'Fire']), true);
  assert.equal(canPayAttackCost(['Water', 'Fire'], ['Colorless', 'Colorless', 'Fire']), false);
  assert.equal(canPayAttackCost(['Fire'], ['Colorless', 'Fire']), false);
  assert.equal(canPayAttackCost(['Wildcard', 'Water'], ['Colorless', 'Fire']), true);
});

test('canRetreat honours a pending "can\'t retreat" attack effect like canPerformAction does', () => {
  const saved = {
    enabled: rulesState.enabled,
    turnPlayer: rulesState.turnPlayer,
    pendingEffects: rulesState.pendingEffects,
    flags: rulesState.flags,
  };
  try {
    rulesState.enabled = true;
    rulesState.turnPlayer = 'self';
    rulesState.flags = { self: { attackerAttacked: false, retreatedThisTurn: false }, opp: {} };
    rulesState.pendingEffects = { self: [], opp: [] };
    assert.equal(canRetreat('self', { name: 'Pikachu', retreatCost: 0 }).allowed, true);
    rulesState.pendingEffects = { self: [{ kind: 'cant-retreat', scope: 'active' }], opp: [] };
    const verdict = canRetreat('self', { name: 'Pikachu', retreatCost: 0 });
    assert.equal(verdict.allowed, false);
    assert.match(verdict.reason, /can't retreat/);
  } finally {
    Object.assign(rulesState, saved);
  }
});

test('"each non-{D} Pokémon" filter treats the board\'s Dark and Darkness spellings as one type', () => {
  // No printed card pairs this filter with Darkness yet; Pupitar [Neo Discovery 45] uses non-{F}.
  const owner = { zones: { active: [{ instanceId: 'a', name: 'Umbreon', types: ['Dark'] }], bench: [] } };
  const root = owner.zones.active[0];
  assert.equal(eachFilterMatches(owner, root, { excludeTypes: ['darkness'] }), false);
  assert.equal(eachFilterMatches(owner, root, { excludeTypes: ['fighting'] }), true);
});
