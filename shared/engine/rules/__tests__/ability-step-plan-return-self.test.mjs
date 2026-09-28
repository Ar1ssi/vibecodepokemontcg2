// Run Away Draw (Dudunsparce): the client bridge only executes plan actions it knows,
// so the shuffle step must plan as an action, not an announcement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAbility } from '../abilities.mjs';
import { planAbilitySteps } from '../ability-step-plan.mjs';

const RUN_AWAY_DRAW =
  'Once during your turn, you may draw 3 cards. If you drew any cards in this way, shuffle this Pokémon and all attached cards into your deck.';

test('interactive plan executes the shuffle-self step after the draw', () => {
  const plan = planAbilitySteps(parseAbility(RUN_AWAY_DRAW), { mode: 'interactive' });
  assert.deepEqual(plan.map((p) => p.action), ['draw', 'return-self-to-deck']);
});

test('auto plan (board-on-play) only announces the shuffle-self step', () => {
  const plan = planAbilitySteps(parseAbility(RUN_AWAY_DRAW), { mode: 'auto' });
  assert.equal(plan.find((p) => p.step.type === 'returnSelfToDeckAbility').action, 'announce');
});

test('top/bottom-of-deck wording is not executed', () => {
  const steps = parseAbility('Once during your turn, you may put this Pokémon on the bottom of your deck.');
  const plan = planAbilitySteps(steps, { mode: 'interactive' });
  assert.ok(plan.every((p) => p.action !== 'return-self-to-deck'));
});
