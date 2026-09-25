// The oracle harness (I113): real engine runs on the fixed board, with damage amounts recorded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  printedBase,
  diffTags,
  runAll,
  oracleCorpus,
  mon,
  buildState,
  snapshot,
} from './oracle-harness.mjs';

const attackCmd = () => ({
  type: 'attack',
  playerId: 'p1',
  payload: { attackIndex: 0 },
});
const attacker = (attack) => () =>
  mon('Tester', { hp: 200, attacks: [{ cost: [], text: '', ...attack }] });

test('printedBase reads the leading number of printed damage', () => {
  assert.equal(printedBase('30'), 30);
  assert.equal(printedBase('30×'), 30);
  assert.equal(printedBase('10+'), 10);
  assert.equal(printedBase(''), 0);
  assert.equal(printedBase(undefined), 0);
});

test('a flat attack deals its printed damage in every seed', () => {
  const res = runAll(
    attackCmd,
    attacker({ name: 'Hit', damage: '30' }),
    'active',
    [1, 2, 3]
  );
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.dealt, [30, 30, 30]);
  assert.ok(res.tags.includes('opp:active+dmg'));
});

test('a per-Energy attack deals more than its printed base on the 8-Energy board', () => {
  const text =
    'This attack does 10 more damage for each Energy attached to this Pokémon.';
  const res = runAll(
    attackCmd,
    attacker({ name: 'Charge', damage: '10+', text }),
    'active',
    [1]
  );
  assert.deepEqual(res.errors, []);
  assert.ok(res.dealt[0] > 10, `dealt ${res.dealt[0]}`);
});

test('engine rejections and throws are recorded as errors, not thrown', () => {
  const hit = attacker({ name: 'Hit', damage: '30' });
  const rejected = runAll(
    () => ({ type: 'bogus', playerId: 'p1', payload: {} }),
    hit,
    'active',
    [1, 2]
  );
  assert.deepEqual(rejected.errors, [
    'bad_command Unknown command type: bogus',
  ]);
  assert.deepEqual(rejected.dealt, []);
  const thrown = runAll(
    () => {
      throw new Error('boom');
    },
    hit,
    'active',
    [1]
  );
  assert.deepEqual(thrown.errors, ['THROW boom']);
});

test('diffTags names moves, damage, heals and new cards from p1 point of view', () => {
  const before = snapshot(buildState(() => mon('X'), 'active'));
  const state = buildState(() => mon('X'), 'active');
  const hand = state.players.p1.zones.hand;
  state.players.p1.zones.discard.push(hand.shift());
  state.players.p2.zones.active[0].damage += 10;
  state.players.p1.zones.bench[0].damage = 0;
  const tags = diffTags(before, snapshot(state), [{ type: 'coinFlipped' }]);
  assert.deepEqual([...tags].sort(), [
    'coin',
    'opp:active+dmg',
    'own:hand->discard',
    'own:heal',
  ]);
  assert.deepEqual([...diffTags(before, before, [])], []);
  assert.deepEqual(
    [...diffTags(before, before, [{ type: 'turnDamageBonus', playerId: 'p1', amount: 100 }])],
    ['own:turn-bonus']
  );
});

test('diffTags tags a reveal of cards still in the opponent\'s hand, not other reveals', () => {
  const state = buildState(() => mon('X'), 'active');
  const snap = snapshot(state);
  const oppHandCard = state.players.p2.zones.hand[0];
  const ownCard = state.players.p1.zones.hand[0];
  const reveal = (playerId, card) => [{ type: 'cardsRevealed', playerId, cards: [{ instanceId: card.instanceId }] }];
  assert.deepEqual([...diffTags(snap, snap, reveal('p2', oppHandCard))], ['opp:hand-revealed']);
  assert.deepEqual([...diffTags(snap, snap, reveal('p1', ownCard))], []);
});

test('oracleCorpus emits one row per attack and ability with family and damage fields', () => {
  const card = {
    name: 'Probe',
    set: 'TST',
    number: '1',
    text: 'Ability ⇢ Sky Transport\n\nOnce during your turn, you may use this Ability. Switch your Active Pokémon with 1 of your Benched Pokémon.\n\n{C} → Hit : 30\n\nDiscard 2 Energy from this Pokémon.',
  };
  const [ability, attack] = oracleCorpus([card], { seeds: [1] });
  assert.equal(ability.kind, 'ability');
  assert.equal(ability.name, 'Sky Transport');
  assert.ok(ability.tags.includes('own:active-changed'), ability.tags.join());
  assert.equal(attack.kind, 'attack');
  assert.equal(attack.printedBase, 30);
  assert.deepEqual(attack.dealt, [30]);
  assert.ok(attack.tags.includes('own:attached->discard'), attack.tags.join());
  assert.deepEqual(oracleCorpus([]), []);
});
