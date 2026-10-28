// Togetic Shared Peace (customhb-184 in set.json, an attack): "Each player draws 3 cards."
// The ability tests cover the same wording as an activated Ability.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAbility } from '../rules/abilities.mjs';

const ATTACK_TEXT = 'Each player draws 3 cards.';
const ABILITY_TEXT = 'Once during your turn, each player draws 3 cards.';

function game(deckSize = 5) {
  const state = createGameState({ gameId: 'shared-peace', seed: 42, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
    for (let i = 0; i < deckSize; i++) {
      state.players[id].zones.deck.push(createCard({ instanceId: (id === 'p1' ? 100 : 200) + i, name: 'Card', supertype: 'Trainer', type: 'Item' }));
    }
  }
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  state.players.p2.zones.active.push(createCard({ instanceId: 50, name: 'Foe', supertype: 'Pokémon', stage: 'Basic', hp: 100 }));
  return state;
}

function withAttacker(state) {
  state.players.p1.zones.active.push(
    createCard({
      instanceId: 10, name: 'Togetic', supertype: 'Pokémon', stage: 'Stage 1', hp: 80,
      attacks: [{ name: 'Shared Peace', cost: [], damage: '', text: ATTACK_TEXT }],
    })
  );
  return state;
}

const hands = (res) => [res.state.players.p1.zones.hand.length, res.state.players.p2.zones.hand.length];

test('Shared Peace attack: both players draw 3 cards', () => {
  const res = applyCommand(withAttacker(game()), { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(42));
  assert.equal(res.error, null);
  // The attack ends the turn, so p2 also takes its start-of-turn draw.
  assert.deepEqual(hands(res), [3, 4]);
  assert.deepEqual(
    res.events.filter((e) => e.type === 'cardsDrawn').slice(0, 2).map((e) => [e.playerId, e.count]),
    [['p1', 3], ['p2', 3]]
  );
});

test('Shared Peace attack: a short deck draws what it has', () => {
  const res = applyCommand(withAttacker(game(2)), { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(42));
  assert.deepEqual(res.events.filter((e) => e.type === 'cardsDrawn').slice(0, 2).map((e) => [e.playerId, e.count]), [['p1', 2], ['p2', 2]]);
});

test('Ability wording: parseAbility reads the printed count', () => {
  const [step] = parseAbility(ABILITY_TEXT);
  assert.equal(step.count, 3);
  assert.equal(step.eachPlayer, true);
  assert.equal(parseAbility('Once during your turn, each player draws a card.')[0].count, 1);
});

test('Ability wording: both players draw 3 cards', () => {
  const state = game();
  state.players.p1.zones.bench.push(
    createCard({
      instanceId: 11, name: 'Togetic', supertype: 'Pokémon', stage: 'Stage 1', hp: 80,
      abilities: [{ name: 'Shared Peace', type: 'Ability', text: ABILITY_TEXT }],
    })
  );
  const res = applyCommand(state, { type: 'useAbility', payload: { instanceId: 11 }, playerId: 'p1' }, createRng(42));
  assert.equal(res.error, null);
  assert.deepEqual(hands(res), [3, 3]);
});
