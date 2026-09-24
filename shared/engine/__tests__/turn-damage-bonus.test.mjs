import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { computeAttackDamage } from '../rules/attack-engine.mjs';
import {
  parseTurnDamageBonus,
  turnDamageBonusTotal,
} from '../rules/turn-damage-bonus.mjs';

const PREMIUM_POWER_PRO =
  'During this turn, attacks used by your {F} Pokémon do 30 more damage to your opponent’s Active Pokémon (before applying Weakness and Resistance).';
const BLACK_BELT =
  "During this turn, attacks used by your Pokémon do 40 more damage to your opponent's Active Pokémon ex (before applying Weakness and Resistance).";

function gameWithAttacker(types) {
  const state = createGameState({
    players: {
      p1: {
        username: 'Ash',
        zones: {
          active: [
            createCard({
              instanceId: 10,
              name: 'Lucario',
              hp: 130,
              types,
              attacks: [{ name: 'Aura Sphere', damage: 50, cost: [] }],
            }),
          ],
          hand: [
            createCard({
              instanceId: 30,
              name: 'Premium Power Pro',
              supertype: 'Trainer',
              subtypes: ['Item'],
              text: PREMIUM_POWER_PRO,
            }),
          ],
          deck: [createCard({ instanceId: 12, name: 'P1 Deck' })],
          discard: [],
        },
      },
      p2: {
        username: 'Gary',
        zones: {
          active: [createCard({ instanceId: 20, name: 'Snorlax', hp: 200 })],
          bench: [createCard({ instanceId: 21, name: 'Vulpix', hp: 60 })],
          deck: [createCard({ instanceId: 22, name: 'P2 Deck' })],
          discard: [],
        },
      },
    },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  return state;
}

function playThenAttack(types) {
  const played = applyCommand(gameWithAttacker(types), {
    type: 'playTrainer',
    payload: { instanceId: 30 },
    playerId: 'p1',
  });
  assert.equal(played.error, null);
  assert.ok(
    played.state.players.p1.zones.discard.some((c) => c.instanceId === 30)
  );
  const attacked = applyCommand(played.state, {
    type: 'attack',
    payload: { attackIndex: 0 },
    playerId: 'p1',
  });
  assert.equal(attacked.error, null);
  return attacked.state;
}

test('parseTurnDamageBonus: Premium Power Pro is +30 for Fighting', () => {
  assert.deepEqual(parseTurnDamageBonus(PREMIUM_POWER_PRO), {
    amount: 30,
    type: 'fighting',
    attackerNoRuleBox: false,
    defenderFilter: null,
  });
});

test('parseTurnDamageBonus: Black Belt is +40 against ex only; ex-and-V and no-Rule-Box variants', () => {
  assert.equal(parseTurnDamageBonus(BLACK_BELT).defenderFilter, 'ex');
  const exOrV = parseTurnDamageBonus(
    "During this turn, attacks used by your Pokémon do 30 more damage to your opponent's Active Pokémon ex and Active Pokémon V (before applying Weakness and Resistance)."
  );
  assert.equal(exOrV.defenderFilter, 'exOrV');
  const noRuleBox = parseTurnDamageBonus(
    "During this turn, attacks used by your Pokémon that don't have a Rule Box do 80 more damage to your opponent's Active Pokémon (before applying Weakness and Resistance)."
  );
  assert.equal(noRuleBox.amount, 80);
  assert.equal(noRuleBox.attackerNoRuleBox, true);
});

test('parseTurnDamageBonus: unrelated or empty text is null', () => {
  assert.equal(parseTurnDamageBonus('Draw 2 cards.'), null);
  assert.equal(parseTurnDamageBonus(null), null);
});

test('turnDamageBonusTotal filters by attacker type, defender ex, and bench target', () => {
  const pro = parseTurnDamageBonus(PREMIUM_POWER_PRO);
  const belt = parseTurnDamageBonus(BLACK_BELT);
  const fighter = { types: ['Fighting'] };
  const fire = { types: ['Fire'] };
  const plain = { name: 'Snorlax' };
  const ex = { name: 'Snorlax ex' };
  assert.equal(turnDamageBonusTotal([pro], fighter, plain), 30);
  assert.equal(turnDamageBonusTotal([pro], fire, plain), 0);
  assert.equal(
    turnDamageBonusTotal([pro], fighter, plain, { defenderIsActive: false }),
    0
  );
  assert.equal(turnDamageBonusTotal([belt], fire, plain), 0);
  assert.equal(turnDamageBonusTotal([pro, pro, belt], fighter, ex), 100);
  assert.equal(turnDamageBonusTotal(undefined, fighter, ex), 0);
});

test('turnDamageBonusTotal: attackerInstanceId scopes a this-Pokémon boost', () => {
  const bonus = { amount: 120, type: null, attackerNoRuleBox: false, defenderFilter: null, attackerInstanceId: 70 };
  const holder = { name: 'Feraligatr', instanceId: 70 };
  const other = { name: 'Other', instanceId: 71 };
  assert.equal(turnDamageBonusTotal([bonus], holder, { name: 'Defender' }), 120);
  assert.equal(turnDamageBonusTotal([bonus], other, { name: 'Defender' }), 0);
});

test('computeAttackDamage adds the turn bonus before Weakness', () => {
  const result = computeAttackDamage(
    { types: ['Fighting'] },
    { name: 'Snorlax', weakness: { type: 'Fighting', value: 2 } },
    { damage: '50' },
    { turnDamageBonuses: [parseTurnDamageBonus(PREMIUM_POWER_PRO)] }
  );
  assert.equal(result.total, 160);
});

test('Premium Power Pro: Fighting attacker does +30 after the card is discarded', () => {
  const state = playThenAttack(['Fighting']);
  assert.equal(state.players.p2.zones.active[0].damage, 80);
});

test('Premium Power Pro: non-Fighting attacker gets no bonus', () => {
  const state = playThenAttack(['Fire']);
  assert.equal(state.players.p2.zones.active[0].damage, 50);
});

test('Premium Power Pro: bonus ends with the turn', () => {
  const state = playThenAttack(['Fighting']);
  assert.equal(state.players.p1.flags?.turnDamageBonuses, undefined);
});
