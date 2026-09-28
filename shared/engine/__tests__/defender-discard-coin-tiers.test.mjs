// I195: Flygon ex Psychic Protector (defender discards from hand mid-attack) and Delibird
// Souvenir (one outcome per heads tier of 3 coins).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '../reduce.mjs';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { parseDamagePrevention } from '../rules/ability-executors.mjs';

const PSYCHIC_PROTECTOR =
  "If Flygon ex is damaged by an opponent's attack, you may discard up to 4 cards from your hand. If you do, any damage done to Flygon ex is reduced by 10 for each card you discarded.";
const SOUVENIR_TEXT =
  'Flip 3 coins. If 1 of them is heads, put 4 damage counters on the Defending Pokémon. If 2 of them are heads, remove 1 damage counter from the Defending Pokémon. If all of them are heads, put 10 damage counters on the Defending Pokémon. If all of them are tails, remove all damage counters from the Defending Pokémon.';

/** Deterministic rng: each next() returns the queued value (< 0.5 is heads), then 0.9. */
function queuedRng(values) {
  const queue = [...values];
  return { next: () => (queue.length ? queue.shift() : 0.9), shuffle: (arr) => arr };
}

function game({ attacker, defender, defenderHand = [] }) {
  const state = createGameState({
    id: 'i195',
    seed: 7,
    players: {
      p1: {
        id: 'p1',
        name: 'P1',
        zones: {
          active: [attacker],
          bench: [],
          hand: [],
          deck: [createCard({ instanceId: 101, id: 'd1', name: 'Deck 1' })],
          discard: [],
          prizes: [createCard({ instanceId: 201, id: 'p1', name: 'Prize' })],
        },
        flags: {},
      },
      p2: {
        id: 'p2',
        name: 'P2',
        zones: {
          active: [defender],
          bench: [],
          hand: defenderHand,
          deck: [createCard({ instanceId: 301, id: 'd2', name: 'Deck 2' })],
          discard: [],
          prizes: [createCard({ instanceId: 401, id: 'p2', name: 'Prize' })],
        },
        flags: {},
      },
    },
  });
  state.turn = { number: 2, player: 'p1', phase: 'main' };
  return state;
}

function flygonGame(handSize) {
  const attacker = createCard({
    instanceId: 1,
    id: 'hitter',
    name: 'Hitter',
    supertype: 'Pokémon',
    hp: 300,
    attacks: [{ name: 'Smash', cost: [], damage: 100, text: '' }],
  });
  const flygon = createCard({
    instanceId: 2,
    id: 'flygon-ex-pk-94',
    name: 'Flygon ex',
    supertype: 'Pokémon',
    hp: 150,
    abilities: [{ type: 'Poké-Body', name: 'Psychic Protector', text: PSYCHIC_PROTECTOR }],
  });
  const hand = Array.from({ length: handSize }, (_, i) =>
    createCard({ instanceId: 500 + i, id: `h${i}`, name: `Hand ${i}`, supertype: 'Trainer' })
  );
  return game({ attacker, defender: flygon, defenderHand: hand });
}

const attack = (state, rng) =>
  applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, rng);

describe('Flygon ex Psychic Protector', () => {
  it('is no flat damage reduction', () => {
    assert.equal(parseDamagePrevention({ abilities: [{ text: PSYCHIC_PROTECTOR }] }).reduceHp, 0);
  });

  it('asks the defending player before damage lands and reduces 10 per discarded card', () => {
    const res = attack(flygonGame(5));
    assert.equal(res.error, null);
    const choice = res.pendingChoice;
    assert.ok(choice, 'the defender must be offered the discard');
    assert.equal(choice.player, 'p2');
    assert.equal(choice.min, 0);
    assert.equal(choice.max, 4);
    assert.equal(choice.options.length, 5);
    assert.equal(res.state.players.p2.zones.active[0].damage || 0, 0);

    const wrong = applyCommand(res.state, {
      type: 'resolveChoice',
      playerId: 'p1',
      payload: { choiceId: choice.choiceId, selection: [] },
    });
    assert.equal(wrong.error, 'not_your_choice');

    const resolved = applyCommand(res.state, {
      type: 'resolveChoice',
      playerId: 'p2',
      payload: { choiceId: choice.choiceId, selection: [500, 501, 502] },
    });
    assert.equal(resolved.error, null);
    assert.equal(resolved.pendingChoice, null);
    const p2 = resolved.state.players.p2;
    assert.equal(p2.zones.active[0].damage, 70);
    // 5 - 3 discarded, + the turn-start draw.
    assert.equal(p2.zones.hand.length, 3);
    assert.deepEqual(
      p2.zones.discard.map((c) => c.instanceId).sort(),
      [500, 501, 502]
    );
    assert.equal(resolved.state.turn.player, 'p2');
  });

  it('declining deals the full damage', () => {
    const res = attack(flygonGame(2));
    assert.equal(res.pendingChoice.max, 2);
    const resolved = applyCommand(res.state, {
      type: 'resolveChoice',
      playerId: 'p2',
      payload: { choiceId: res.pendingChoice.choiceId, selection: [] },
    });
    assert.equal(resolved.state.players.p2.zones.active[0].damage, 100);
    assert.equal(resolved.state.players.p2.zones.hand.length, 3); // + the turn-start draw
  });

  it('an empty hand skips the prompt', () => {
    const res = attack(flygonGame(0));
    assert.equal(res.pendingChoice, null);
    assert.equal(res.state.players.p2.zones.active[0].damage, 100);
  });
});

describe('Delibird Souvenir coin tiers', () => {
  function delibirdGame(defenderDamage) {
    const delibird = createCard({
      instanceId: 1,
      id: 'delibird-tr-21',
      name: 'Delibird',
      supertype: 'Pokémon',
      hp: 70,
      attacks: [{ name: 'Souvenir', cost: [], damage: '', text: SOUVENIR_TEXT }],
    });
    const defender = createCard({
      instanceId: 2,
      id: 'def',
      name: 'Defender',
      supertype: 'Pokémon',
      hp: 200,
      damage: defenderDamage,
    });
    return game({ attacker: delibird, defender });
  }

  const cases = [
    { flips: [0.9, 0.9, 0.9], label: 'all tails removes all counters', expected: 0 },
    { flips: [0.1, 0.9, 0.9], label: '1 heads puts 4 counters', expected: 90 },
    { flips: [0.1, 0.1, 0.9], label: '2 heads removes 1 counter', expected: 40 },
    { flips: [0.1, 0.1, 0.1], label: 'all heads puts 10 counters', expected: 150 },
  ];
  for (const { flips, label, expected } of cases) {
    it(label, () => {
      const res = attack(delibirdGame(50), queuedRng(flips));
      assert.equal(res.error, null);
      assert.equal(res.pendingChoice, null);
      assert.equal(res.state.players.p2.zones.active[0].damage || 0, expected);
    });
  }
});
