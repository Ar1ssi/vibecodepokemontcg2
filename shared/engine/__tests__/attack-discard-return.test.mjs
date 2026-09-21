// Mega Charizard X ex / Inferno X (discard-to-scale Energy picker) and Meowth ex /
// Tuck Tail (return the attacker and its attachments to hand) on the authoritative path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';

const pokemon = (props) => createCard({ supertype: 'Pokémon', type: 'Pokémon', ...props });
const energy = (instanceId, attachedTo, name = 'Basic Fire Energy', types = ['Fire']) =>
  createCard({ instanceId, name, supertype: 'Energy', type: 'Energy', subtypes: ['Basic'], types, attachedTo });

const INFERNO_X = {
  name: 'Inferno X',
  cost: [],
  damage: 90,
  text: 'Discard any amount of {R} Energy from among your Pokémon, and this attack does 90 damage for each card you discarded in this way.',
};
const TUCK_TAIL = {
  name: 'Tuck Tail',
  cost: [],
  damage: 60,
  text: 'Put this Pokémon and all attached cards into your hand.',
};

function board({ attack, bench = true }) {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  state.players.p1.zones.active.push(
    pokemon({ instanceId: 1, name: 'Attacker', hp: 360, attacks: [attack] }),
    energy(2, 1),
    energy(3, 1, 'Basic Water Energy', ['Water'])
  );
  if (bench) {
    state.players.p1.zones.bench.push(
      pokemon({ instanceId: 10, name: 'Charmander', hp: 70 }),
      energy(11, 10),
      pokemon({ instanceId: 12, name: 'Charmeleon', hp: 90 })
    );
  }
  state.players.p2.zones.active.push(pokemon({ instanceId: 20, name: 'Defender', hp: 400 }));
  state.players.p2.zones.bench.push(pokemon({ instanceId: 21, name: 'Opp Bench', hp: 60 }));
  for (const playerId of ['p1', 'p2']) {
    for (let i = 0; i < 6; i += 1) {
      state.players[playerId].zones.prizes.push(
        createCard({ instanceId: 1000 + (playerId === 'p1' ? 0 : 50) + i, name: 'Prize' })
      );
      // A deck so the turn hand-off draw does not end the game by deck-out.
      state.players[playerId].zones.deck.push(
        createCard({ instanceId: 2000 + (playerId === 'p1' ? 0 : 50) + i, name: 'Deck Card' })
      );
    }
  }
  return state;
}

const attack = (state) => applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
const choose = (state, selection) =>
  applyCommand(state, {
    type: 'resolveChoice',
    payload: { choiceId: state.pendingChoice.choiceId, selection },
    playerId: 'p1',
  });
const damageOf = (state, instanceId) =>
  state.players.p2.zones.active.find((c) => c.instanceId === instanceId)?.damage || 0;

test('Inferno X offers only {R} Energy from all of your Pokémon', () => {
  const res = attack(board({ attack: INFERNO_X }));
  assert.ok(!res.error, res.error);
  const choice = res.state.pendingChoice;
  assert.ok(choice, 'expected an Energy discard choice');
  assert.deepEqual(choice.options.map((o) => o.instanceId).sort((a, b) => a - b), [2, 11]);
  assert.equal(choice.min, 0);
  assert.equal(choice.max, 2);
  assert.equal(damageOf(res.state, 20), 0, 'no damage before the choice');
});

test('Inferno X discards the chosen Energy and deals 90 per card', () => {
  const pending = attack(board({ attack: INFERNO_X }));
  const res = choose(pending.state, [2, 11]);
  assert.ok(!res.error, res.error);
  assert.equal(damageOf(res.state, 20), 180);
  const discard = res.state.players.p1.zones.discard.map((c) => c.instanceId).sort((a, b) => a - b);
  assert.deepEqual(discard, [2, 11]);
  assert.equal(res.state.turn.player, 'p2', 'turn ends after the attack');
});

test('Inferno X with nothing chosen deals 0', () => {
  const pending = attack(board({ attack: INFERNO_X }));
  const res = choose(pending.state, []);
  assert.ok(!res.error, res.error);
  assert.equal(damageOf(res.state, 20), 0);
  assert.equal(res.state.players.p1.zones.discard.length, 0);
});

test('Tuck Tail deals damage then puts the attacker and attachments into hand', () => {
  const res = attack(board({ attack: TUCK_TAIL }));
  assert.ok(!res.error, res.error);
  assert.equal(damageOf(res.state, 20), 60);
  const hand = res.state.players.p1.zones.hand.map((c) => c.instanceId).sort((a, b) => a - b);
  assert.deepEqual(hand, [1, 2, 3]);
  assert.ok(res.state.players.p1.zones.hand.every((c) => !c.attachedTo));
  assert.ok(!res.state.players.p1.zones.active.some((c) => [1, 2, 3].includes(c.instanceId)));
  // Two Benched Pokémon: p1 picks the new Active.
  assert.equal(res.state.pendingChoice?.player, 'p1');
});

test('Tuck Tail with an empty Bench loses the game', () => {
  const res = attack(board({ attack: TUCK_TAIL, bench: false }));
  assert.ok(!res.error, res.error);
  assert.equal(res.state.winner, 'p2');
});

const GIGA_HAMMER = {
  name: 'Blastoise Hand Discard',
  cost: [],
  damage: 140,
  text: 'Discard up to 2 Basic {W} Energy cards from your hand. This attack does 140 damage for each card you discarded in this way.',
};

function handBoard() {
  const state = board({ attack: GIGA_HAMMER });
  state.players.p1.zones.hand.push(
    energy(30, null, 'Basic Water Energy', ['Water']),
    energy(31, null, 'Basic Water Energy', ['Water']),
    energy(32, null, 'Basic Water Energy', ['Water']),
    energy(33, null),
    createCard({ instanceId: 34, name: 'Ultra Ball', supertype: 'Trainer', type: 'Trainer' })
  );
  return state;
}

test('hand discard-to-scale offers only matching Energy from hand, capped at the printed max', () => {
  const res = attack(handBoard());
  assert.ok(!res.error, res.error);
  const choice = res.state.pendingChoice;
  assert.deepEqual(choice.options.map((o) => o.instanceId).sort((a, b) => a - b), [30, 31, 32]);
  assert.equal(choice.max, 2);
});

test('hand discard-to-scale discards from hand and scales damage', () => {
  const pending = attack(handBoard());
  const res = choose(pending.state, [30, 32]);
  assert.ok(!res.error, res.error);
  assert.equal(damageOf(res.state, 20), 280);
  const discard = res.state.players.p1.zones.discard.map((c) => c.instanceId).sort((a, b) => a - b);
  assert.deepEqual(discard, [30, 32]);
  assert.ok(res.state.players.p1.zones.active.some((c) => c.instanceId === 3), 'attached Energy untouched');
});

test('hand discard-to-scale with no matching Energy in hand deals 0 without a choice', () => {
  const res = attack(board({ attack: GIGA_HAMMER }));
  assert.ok(!res.error, res.error);
  assert.equal(res.state.pendingChoice, null);
  assert.equal(damageOf(res.state, 20), 0);
});

test('"N more damage for each card" adds to the printed base (Mega Clefable ex)', () => {
  const state = board({
    attack: {
      name: 'Clefable Hand Discard',
      cost: [],
      damage: 40,
      text: 'You may discard up to 4 Energy cards from your hand, and this attack does 40 more damage for each card you discarded in this way.',
    },
  });
  state.players.p1.zones.hand.push(energy(40, null), energy(41, null), energy(42, null));
  const pending = attack(state);
  assert.equal(pending.state.pendingChoice.max, 3);
  const res = choose(pending.state, [40, 41]);
  assert.ok(!res.error, res.error);
  assert.equal(damageOf(res.state, 20), 120);
});
