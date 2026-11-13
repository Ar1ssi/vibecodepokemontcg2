// Design 089: `attackStarted` marks where an attack's own effects begin. `attackExecuted` comes
// last, and an attack that suspends on a choice after its damage emits it only in a later batch,
// so without the marker a client cannot tell the first batch's damage belongs to an attack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

const pokemon = (props) => createCard({ supertype: 'Pokémon', type: 'Pokémon', hp: 100, ...props });

function board({ text = '', damage = '30', ownBench = 2, attackerProps = {} } = {}) {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  const p1 = state.players.p1.zones;
  const p2 = state.players.p2.zones;
  p1.active.push(
    pokemon({ instanceId: 1, name: 'Attacker', hp: 200, attacks: [{ name: 'Hit', cost: [], damage, text }], ...attackerProps })
  );
  for (let i = 0; i < ownBench; i += 1) p1.bench.push(pokemon({ instanceId: 2 + i, name: `Own Bench ${i}` }));
  p2.active.push(pokemon({ instanceId: 20, name: 'Defender', hp: 200 }));
  p2.bench.push(pokemon({ instanceId: 21, name: 'Opp Bench' }));
  for (const playerId of ['p1', 'p2']) {
    const offset = playerId === 'p1' ? 0 : 50;
    for (let i = 0; i < 6; i += 1) {
      state.players[playerId].zones.prizes.push(createCard({ instanceId: 1000 + offset + i, name: 'Prize' }));
      state.players[playerId].zones.deck.push(createCard({ instanceId: 2000 + offset + i, name: 'Deck Card' }));
    }
  }
  return state;
}

const attack = (state, seed = 5) => {
  const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' }, createRng(seed));
  assert.ok(!res.error, res.error);
  return res;
};

const typesOf = (events) => events.map((event) => event.type);

test('a plain attack starts with attackStarted, once, before its damage and attackExecuted', () => {
  const { events } = attack(board());
  const types = typesOf(events);
  assert.equal(types.filter((type) => type === 'attackStarted').length, 1);
  assert.ok(types.indexOf('attackStarted') < types.indexOf('damageUpdated'));
  assert.ok(types.indexOf('damageUpdated') < types.indexOf('attackExecuted'));
  assert.deepEqual(
    events.find((event) => event.type === 'attackStarted'),
    { type: 'attackStarted', playerId: 'p1', attackerId: 1, defenderId: 20, attackName: 'Hit' }
  );
});

test('an attack suspended on its self-switch choice: the first batch has the marker and the damage, the second only the switch and attackExecuted', () => {
  const first = attack(board({ text: 'Switch this Pokémon with 1 of your Benched Pokémon.' }));
  assert.deepEqual(typesOf(first.events), ['attackStarted', 'damageUpdated']);
  assert.ok(first.state.pendingChoice, 'the Bench choice is pending');

  const second = applyCommand(
    first.state,
    {
      type: 'resolveChoice',
      payload: { choiceId: first.state.pendingChoice.choiceId, selection: [2] },
      playerId: 'p1',
    },
    createRng(5)
  );
  assert.ok(!second.error, second.error);
  const types = typesOf(second.events);
  assert.ok(!types.includes('attackStarted'), 'the marker is not repeated when the attack resumes');
  assert.ok(types.indexOf('cardSwitched') < types.indexOf('attackExecuted'));
});

test('a Confused attacker that hurts itself never starts the attack', () => {
  // Seeds are tried until the Confusion coin lands tails: the attack then does not happen.
  for (let seed = 1; seed < 40; seed += 1) {
    const state = board();
    state.players.p1.zones.active[0].specialCondition = 'Confused';
    const { events } = attack(state, seed);
    const types = typesOf(events);
    if (!types.includes('attackConfusedFizzle')) continue;
    assert.ok(!types.includes('attackStarted'));
    return;
  }
  assert.fail('no seed below 40 flipped tails for Confusion');
});
