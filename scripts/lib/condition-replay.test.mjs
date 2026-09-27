// Condition-true replay: a conditional bonus is checked on a board where its condition holds,
// so "condition not understood" no longer looks the same as "condition not met".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bonusClauses, setupFor, replayBonuses, CONDITION_SETUPS } from './condition-replay.mjs';
import { mon, buildState } from './oracle-harness.mjs';
import { hasCondition } from '../../shared/engine/rules/special-conditions.mjs';

const holder = (text, damage = '30+') => () => {
  const m = mon('Replay Holder', { hp: 200, attacks: [{ name: 'Probe', cost: [], damage, text }] });
  m.type = 'Pokémon';
  return m;
};

test('bonusClauses reads board-state conditions and skips coin and cost outcomes', () => {
  assert.deepEqual(
    bonusClauses(
      "If your opponent's Active Pokémon is Poisoned, this attack does 90 more damage. " +
        'Flip a coin. If heads, this attack does 30 more damage. ' +
        'You may discard an Energy. If you do, this attack does 50 more damage.'
    ),
    [{ clause: "your opponent's active pokémon is poisoned", bonus: 90 }]
  );
});

test('setupFor stages the printed condition with the state the engine keeps', () => {
  const state = buildState(holder(''), 'active');
  const opp = state.players.p2.zones.active.find((c) => !c.attachedTo);
  const own = state.players.p1.zones.active.find((c) => !c.attachedTo);
  setupFor("the defending pokémon is poisoned")(state);
  assert.ok(hasCondition(opp, 'Poisoned'));
  setupFor('this pokémon moved from your bench to the active spot this turn')(state);
  assert.equal(own.movedToActiveTurn, state.turn.number);
  setupFor("your opponent's active pokémon is a pokémon ex")(state);
  assert.match(opp.name, / ex$/);
  assert.equal(setupFor('the defending pokémon has 100 hp or more'), null);
  assert.ok(CONDITION_SETUPS.length > 10);
});

test('replayBonuses passes a bonus the engine applies and fails one that falls short', () => {
  const text = 'If there is any Stadium card in play, this attack does 90 more damage.';
  const pass = replayBonuses(holder(text), 0, { text, printedBase: 30, costPool: {} });
  assert.deepEqual(pass, { failed: [], untested: [] });
  // The same run judged against a higher printed base: the bonus cannot reach it.
  const short = replayBonuses(holder(text), 0, { text, printedBase: 1000, costPool: {} });
  assert.equal(short.failed.length, 1);
  assert.equal(short.failed[0].clause, 'there is any stadium card in play');
  assert.equal(short.failed[0].want, 1090);
});

test('replayBonuses lists the clauses it cannot stage', () => {
  const text = 'If the Defending Pokémon has 100 HP or more, this attack does 30 more damage.';
  assert.deepEqual(replayBonuses(holder(text), 0, { text, printedBase: 30, costPool: {} }), {
    failed: [],
    untested: ['the defending pokémon has 100 hp or more'],
  });
});
