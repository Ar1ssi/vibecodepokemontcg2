// Design 069: attackHitIds against the events reduce actually emits for multi-target attacks.
// Card text: out/pkmn-pokemon-cards.json (Kyurem ex BLK 165, Mewtwo ex 30C 157, Buzzwole-GX 30C 57).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attackHitIds } from '../advisory-animations.mjs';
import { createGameState } from '../../../../../shared/engine/state.mjs';
import { createCard } from '../../../../../shared/engine/cards.mjs';
import { applyCommand } from '../../../../../shared/engine/reduce.mjs';

const pokemon = (props) => createCard({ supertype: 'Pokémon', type: 'Pokémon', subtypes: ['Basic'], ...props });

const board = ({ attacker, active, bench = [], prizesLeft = { p1: 6, p2: 6 } }) => {
  const state = createGameState({ players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } }, rulesEnabled: true });
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  state.players.p1.zones.active.push(attacker);
  state.players.p2.zones.active.push(active);
  state.players.p2.zones.bench.push(...bench);
  for (const playerId of ['p1', 'p2']) {
    for (let i = 0; i < prizesLeft[playerId]; i += 1) {
      state.players[playerId].zones.prizes.push(createCard({ instanceId: `${playerId}-prize-${i}`, name: 'Prize' }));
    }
  }
  return state;
};

const hitIdsOf = (events) => {
  const attack = events.find((event) => event.type === 'attackExecuted');
  assert.ok(attack, `no attackExecuted in ${events.map((event) => event.type).join(' > ')}`);
  return attackHitIds(events).get(attack).map((hit) => hit.instanceId);
};

test('Kyurem ex Blizzard Burst (BLK 165): the Active and every Benched Pokémon are hits', () => {
  const attacker = pokemon({
    instanceId: 1,
    name: 'Kyurem ex',
    subtypes: ['Basic', 'ex'],
    hp: 230,
    attacks: [
      {
        name: 'Blizzard Burst',
        cost: [],
        damage: '130',
        text: "This attack also does 10 damage to each of your opponent's Benched Pokémon for each Prize card your opponent has taken. (Don't apply Weakness and Resistance for Benched Pokémon.)",
      },
    ],
  });
  const state = board({
    attacker,
    active: pokemon({ instanceId: 20, name: 'Snorlax', hp: 300 }),
    bench: [pokemon({ instanceId: 21, name: 'Pidgey', hp: 200 }), pokemon({ instanceId: 22, name: 'Rattata', hp: 200 })],
    prizesLeft: { p1: 6, p2: 4 },
  });
  const { events, error } = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(error, null);
  assert.deepEqual(hitIdsOf(events), [20, 21, 22]);
});

test('Mewtwo ex Photon Bullets (30C 157): only the opponent’s Pokémon ex are hits', () => {
  const attacker = pokemon({
    instanceId: 1,
    name: 'Mewtwo ex',
    subtypes: ['Basic', 'ex'],
    hp: 230,
    attacks: [
      {
        name: 'Photon Bullets',
        cost: [],
        damage: '',
        text: "This attack does 50 damage to each of your opponent's Pokémon ex. (Don't apply Weakness and Resistance for Benched Pokémon.)",
      },
    ],
  });
  const state = board({
    attacker,
    active: pokemon({ instanceId: 20, name: 'Iron Hands ex', subtypes: ['Basic', 'ex'], hp: 230 }),
    bench: [
      pokemon({ instanceId: 21, name: 'Pidgey', hp: 200 }),
      pokemon({ instanceId: 22, name: 'Miraidon ex', subtypes: ['Basic', 'ex'], hp: 220 }),
    ],
  });
  const { events, error } = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(error, null);
  assert.deepEqual(hitIdsOf(events), [20, 22]);
});

test('Buzzwole-GX Jet Punch (30C 57): the resumed batch’s hit is the chosen Benched Pokémon', () => {
  const attacker = pokemon({
    instanceId: 1,
    name: 'Buzzwole-GX',
    subtypes: ['Basic', 'GX'],
    hp: 190,
    attacks: [
      {
        name: 'Jet Punch',
        cost: [],
        damage: '30',
        text: "This attack does 30 damage to 1 of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
      },
    ],
  });
  const state = board({
    attacker,
    active: pokemon({ instanceId: 20, name: 'Snorlax', hp: 300 }),
    bench: [pokemon({ instanceId: 21, name: 'Pidgey', hp: 200 }), pokemon({ instanceId: 22, name: 'Rattata', hp: 200 })],
  });
  const first = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(first.error, null);
  // The pick suspends the attack: the Active's 30 arrives with no attackExecuted, so it plays bare.
  assert.deepEqual(first.events.map((event) => event.type), ['damageUpdated']);
  const choice = first.state.pendingChoice;
  assert.deepEqual(choice.options.map((option) => option.instanceId), [21, 22]);
  const resumed = applyCommand(first.state, {
    type: 'resolveChoice',
    playerId: choice.player,
    payload: { choiceId: choice.choiceId, selection: [22] },
  });
  assert.equal(resumed.error, null);
  assert.deepEqual(hitIdsOf(resumed.events), [22]);
});
