import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { COMMAND_SCHEMAS } from '../commands.mjs';

// Design 002 I26: loadDeck builds every server card from a deck row that carries no
// printed data, so hp is null and attacks is empty. The KO check in reduce.mjs's 'attack'
// case is `koHp > 0 && defender.damage >= koHp` — with hp null it can never fire, so a
// Pokémon takes unlimited damage and the only reachable win condition is deck-out.
function twoPlayerState() {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  return state;
}

test('I26: cardStats applies printed data to a card the deck row could not carry', () => {
  const state = twoPlayerState();
  const card = createCard({ instanceId: 1, syncInstance: 3, name: 'Bravo 5' });
  state.players.p1.zones.deck.push(card);

  assert.equal(card.hp, null);
  assert.deepEqual(card.attacks, []);

  const res = applyCommand(state, {
    type: 'cardStats',
    playerId: 'p1',
    payload: {
      stats: [
        {
          syncInstance: 3,
          hp: 60,
          attacks: [{ name: 'Tackle', damage: '10', text: '' }],
          types: ['Colorless'],
          weakness: { type: 'Fighting', value: 2 },
          retreatCost: ['Colorless'],
          stage: 'Basic',
        },
      ],
    },
  });

  assert.equal(res.error, null);
  const applied = res.state.players.p1.zones.deck[0];
  assert.equal(applied.hp, 60);
  assert.deepEqual(applied.attacks, [{ name: 'Tackle', damage: '10', text: '' }]);
  assert.deepEqual(applied.types, ['Colorless']);
  assert.deepEqual(applied.weakness, { type: 'Fighting', value: 2 });
  assert.equal(applied.stage, 'Basic');
});

test('I26: cardStats reaches cards that have already been dealt out of the deck', () => {
  const state = twoPlayerState();
  state.players.p1.zones.active.push(
    createCard({ instanceId: 1, syncInstance: 0, name: 'Alpha 1' })
  );
  state.players.p1.zones.hand.push(
    createCard({ instanceId: 2, syncInstance: 1, name: 'Alpha 2' })
  );
  state.players.p1.zones.prizes.push(
    createCard({ instanceId: 3, syncInstance: 2, name: 'Alpha 3' })
  );

  const res = applyCommand(state, {
    type: 'cardStats',
    playerId: 'p1',
    payload: {
      stats: [
        { syncInstance: 0, hp: 60 },
        { syncInstance: 1, hp: 70 },
        { syncInstance: 2, hp: 80 },
      ],
    },
  });

  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.active[0].hp, 60);
  assert.equal(res.state.players.p1.zones.hand[0].hp, 70);
  assert.equal(res.state.players.p1.zones.prizes[0].hp, 80);
});

test('I26: cardStats never touches the other player, and ignores unknown syncInstances', () => {
  const state = twoPlayerState();
  state.players.p1.zones.active.push(
    createCard({ instanceId: 1, syncInstance: 0, name: 'Alpha 1' })
  );
  state.players.p2.zones.active.push(
    createCard({ instanceId: 2, syncInstance: 0, name: 'Bravo 1' })
  );

  const res = applyCommand(state, {
    type: 'cardStats',
    playerId: 'p1',
    payload: { stats: [{ syncInstance: 0, hp: 60 }, { syncInstance: 99, hp: 200 }] },
  });

  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.active[0].hp, 60);
  assert.equal(res.state.players.p2.zones.active[0].hp, null);
});

test('I26: with stats applied, a knockout actually fires at exactly lethal damage', () => {
  const state = twoPlayerState();
  state.players.p1.zones.active.push(
    createCard({
      instanceId: 1,
      name: 'Alpha 1',
      hp: 60,
      attacks: [{ name: 'Tackle', damage: '10', text: '' }],
    })
  );
  const defender = createCard({ instanceId: 2, syncInstance: 0, name: 'Bravo 5' });
  state.players.p2.zones.active.push(defender);

  let current = applyCommand(state, {
    type: 'cardStats',
    playerId: 'p2',
    payload: { stats: [{ syncInstance: 0, hp: 60, attacks: [{ name: 'Tackle', damage: '10' }] }] },
  }).state;

  // Six Tackles at 10 damage on a 60 HP Pokémon: the sixth is exactly lethal.
  for (let i = 0; i < 6; i++) {
    current.turn = { player: 'p1', number: i + 2, phase: 'main' };
    current.players.p1.flags.attackerAttacked = false;
    const res = applyCommand(current, {
      type: 'attack',
      playerId: 'p1',
      payload: { attackIndex: 0 },
    });
    assert.equal(res.error, null, `attack ${i + 1} rejected: ${res.reason || res.error}`);
    current = res.state;
  }

  assert.equal(current.players.p2.zones.active.length, 0, 'defender should have been knocked out');
});

test('I26: cardStats payload shape is validated', () => {
  const schema = COMMAND_SCHEMAS.cardStats;
  assert.equal(schema.validate({ stats: [{ syncInstance: 0, hp: 60 }] }).valid, true);
  assert.equal(schema.validate({ stats: [] }).valid, true);
  assert.equal(schema.validate({}).valid, false);
  assert.equal(schema.validate({ stats: {} }).valid, false);
  assert.equal(schema.validate({ stats: [{ hp: 60 }] }).valid, false);
  assert.equal(schema.validate({ stats: [{ syncInstance: -1 }] }).valid, false);
});
