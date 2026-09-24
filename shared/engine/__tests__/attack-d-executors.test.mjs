// Design 036 D: damage counters onto the opponent, opponent Energy moves, deck reorders,
// per-Bench attaches, a typed attach target, shuffle clauses and qualified switches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAttackSteps } from '../rules/attack-steps.mjs';
import { ATTACK_YES } from '../effects/attack-steps.mjs';

const stepsOf = (text, selfName = 'Attacker') => {
  const { before, after } = parseAttackSteps(text, { selfName });
  return [...before, ...after].map(({ attackName, ...step }) => step);
};

test('parser: design 036 D wordings', () => {
  assert.deepEqual(stepsOf("Move all damage counters from each of your Pokémon to your opponent's Active Pokémon."), [
    { type: 'atkMoveCounterToOpponent', count: 'all', from: 'each', to: 'active' },
  ]);
  assert.deepEqual(stepsOf("Move 1 damage counter from 1 of your Pokémon to 1 of your opponent's Pokémon."), [
    { type: 'atkMoveCounterToOpponent', count: 1, from: 'one', to: 'any' },
  ]);
  assert.deepEqual(stepsOf("Move an Energy from 1 of your opponent's Pokémon to another of their Pokémon."), [
    { type: 'atkMoveEnergy', from: 'opponentAny', to: 'opponentAny', count: 1 },
  ]);
  assert.deepEqual(stepsOf("Look at the top 3 cards of either player's deck and put them back in any order."), [
    { type: 'atkLookDeckReorder', count: 3, side: 'either' },
  ]);
  assert.deepEqual(
    stepsOf(
      'For each of your Benched Pokémon, search your deck for a Basic {P} Energy card and attach it to that Pokémon. Then, shuffle your deck.'
    ),
    [{ type: 'atkAttachEachBench', source: 'deck', energyType: 'P', basic: true }]
  );
  assert.deepEqual(stepsOf('Shuffle up to 3 Basic {W} Energy cards from your discard pile into your deck.'), [
    { type: 'atkShuffleFromDiscard', count: 3, upTo: true, what: 'energy', energyType: 'W', basic: true },
  ]);
  assert.deepEqual(stepsOf('Shuffle 4 Item cards from your discard pile into your deck.'), [
    { type: 'atkShuffleFromDiscard', count: 4, what: 'Item' },
  ]);
  assert.deepEqual(stepsOf('Switch this Pokémon with 1 of your Benched {L} Pokémon.'), [
    { type: 'atkSwitchSelf', benchType: 'l' },
  ]);
  assert.deepEqual(stepsOf('You may switch this Pokémon with 1 of your Benched Murkrow.'), [
    { type: 'atkSwitchSelf', benchName: 'murkrow', optional: true },
  ]);
  // The older bench-to-Active wording keeps its own step.
  assert.deepEqual(stepsOf("Move all damage counters from 1 of your Benched Pokémon to your opponent's Active Pokémon."), [
    { type: 'atkMoveAllCounters' },
  ]);
});

// ── game flow ────────────────────────────────────────────────────────────────

const pokemon = (props) => createCard({ supertype: 'Pokémon', type: 'Pokémon', hp: 100, ...props });
const energy = (instanceId, type, props = {}) =>
  createCard({
    instanceId,
    name: `${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType: type,
    ...props,
  });

function board({ text, own = [], ownBench = [], opp = [], oppBench = [], deck = [], discard = [], oppHand = [] }) {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  const p1 = state.players.p1.zones;
  const p2 = state.players.p2.zones;
  p1.active.push(pokemon({ instanceId: 1, name: 'Attacker', hp: 200, attacks: [{ name: 'Hit', cost: [], damage: '', text }] }));
  p1.active.push(...own);
  for (const props of ownBench) p1.bench.push(pokemon(props));
  p2.active.push(pokemon({ instanceId: 20, name: 'Defender', hp: 200 }));
  p2.active.push(...opp);
  for (const props of oppBench) p2.bench.push(pokemon(props));
  p1.deck.push(...deck);
  p1.discard.push(...discard);
  p2.hand.push(...oppHand);
  for (const playerId of ['p1', 'p2']) {
    const offset = playerId === 'p1' ? 0 : 50;
    for (let i = 0; i < 6; i += 1) {
      state.players[playerId].zones.prizes.push(createCard({ instanceId: 1000 + offset + i, name: 'Prize' }));
      state.players[playerId].zones.deck.push(createCard({ instanceId: 2000 + offset + i, name: 'Deck Card' }));
    }
  }
  return state;
}

const rng = () => createRng(5);
const attack = (state) => {
  const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' }, rng());
  assert.ok(!res.error, res.error);
  return res.state;
};
const choose = (state, selection) => {
  const res = applyCommand(
    state,
    { type: 'resolveChoice', payload: { choiceId: state.pendingChoice.choiceId, selection }, playerId: 'p1' },
    rng()
  );
  assert.ok(!res.error, res.error);
  return res.state;
};
const cardIn = (state, playerId, instanceId) => {
  const zones = state.players[playerId].zones;
  return [...zones.active, ...zones.bench].find((c) => c.instanceId === instanceId);
};
const ids = (cards) => cards.map((c) => c.instanceId);

test('Sanctuary-GX moves every damage counter from your Pokémon to the opponent\'s Active', () => {
  const state = attack(
    board({
      text: "Move all damage counters from each of your Pokémon to your opponent's Active Pokémon.",
      ownBench: [
        { instanceId: 2, name: 'Hurt', damage: 30 },
        { instanceId: 3, name: 'Fine' },
      ],
    })
  );
  assert.equal(cardIn(state, 'p1', 2).damage, 0);
  assert.equal(cardIn(state, 'p2', 20).damage, 30);
});

test('Transfer Pain: pick the source, then the opponent\'s Pokémon', () => {
  let state = attack(
    board({
      text: "Move 1 damage counter from 1 of your Pokémon to 1 of your opponent's Pokémon.",
      ownBench: [
        { instanceId: 2, name: 'A', damage: 30 },
        { instanceId: 3, name: 'B', damage: 20 },
      ],
      oppBench: [{ instanceId: 21, name: 'Target' }],
    })
  );
  state = choose(state, [3]);
  state = choose(state, [21]);
  assert.equal(cardIn(state, 'p1', 3).damage, 10);
  assert.equal(cardIn(state, 'p1', 2).damage, 30);
  assert.equal(cardIn(state, 'p2', 21).damage, 10);
});

test('Energy Warp moves an Energy from the opponent\'s Bench to their Active', () => {
  const state = attack(
    board({
      text: "Move an Energy from 1 of your opponent's Benched Pokémon to their Active Pokémon.",
      oppBench: [{ instanceId: 21, name: 'Bench' }],
    })
  );
  // No Energy on the Bench: nothing moves and nothing breaks.
  assert.equal(state.pendingChoice, null);

  const withEnergy = board({
    text: "Move an Energy from 1 of your opponent's Benched Pokémon to their Active Pokémon.",
    oppBench: [{ instanceId: 21, name: 'Bench' }],
  });
  withEnergy.players.p2.zones.bench.push({ ...energy(60, 'Water'), attachedTo: 21 });
  const moved = attack(withEnergy);
  const water = moved.players.p2.zones.active.find((c) => c.instanceId === 60);
  assert.equal(water?.attachedTo, 20);
});

test('Calculation reorders the top of your own deck', () => {
  const deck = [70, 71, 72].map((id) => createCard({ instanceId: id, name: `Card ${id}` }));
  let state = attack(board({ text: 'Look at the top 3 cards of your deck and put them back in any order.', deck }));
  assert.ok(state.pendingChoice);
  state = choose(state, [72]);
  state = choose(state, [70]);
  assert.deepEqual(ids(state.players.p1.zones.deck.slice(0, 3)), [72, 70, 71]);
});

test('Future Sight picks a deck first, then reorders it', () => {
  let state = attack(board({ text: "Look at the top 2 cards of either player's deck and put them back in any order." }));
  state = choose(state, [ATTACK_YES]);
  const [first, second] = ids(state.players.p1.zones.deck.slice(0, 2));
  state = choose(state, [second]);
  assert.deepEqual(ids(state.players.p1.zones.deck.slice(0, 2)), [second, first]);
});

test('Overflowing Wishes attaches a {P} Energy from the deck to each Benched Pokémon', () => {
  const state = attack(
    board({
      text: 'For each of your Benched Pokémon, search your deck for a Basic {P} Energy card and attach it to that Pokémon. Then, shuffle your deck.',
      ownBench: [
        { instanceId: 2, name: 'A' },
        { instanceId: 3, name: 'B' },
      ],
      deck: [energy(80, 'Psychic'), energy(81, 'Psychic'), energy(82, 'Fire')],
    })
  );
  const attached = state.players.p1.zones.bench.filter((c) => c.attachedTo != null);
  assert.deepEqual(attached.map((c) => c.attachedTo).sort(), [2, 3]);
  assert.ok(attached.every((c) => c.energyType === 'Psychic'));
});

test('Dual Turbo lets you choose which 2 Benched Pokémon take the Energy', () => {
  let state = attack(
    board({
      text: 'Choose up to 2 of your Benched Pokémon and attach a Basic {R} Energy card from your discard pile to each of them.',
      ownBench: [
        { instanceId: 2, name: 'A' },
        { instanceId: 3, name: 'B' },
        { instanceId: 4, name: 'C' },
      ],
      discard: [energy(80, 'Fire'), energy(81, 'Fire'), energy(82, 'Fire')],
    })
  );
  state = choose(state, [2, 4]);
  const hosts = state.players.p1.zones.bench.filter((c) => c.attachedTo != null).map((c) => c.attachedTo);
  assert.deepEqual(hosts.sort(), [2, 4]);
  assert.equal(state.players.p1.zones.discard.length, 1);
});

test('Dragon\'s Fury attaches only to a {N} Pokémon', () => {
  const state = attack(
    board({
      text: 'Attach a Basic {R} Energy card from your discard pile to 1 of your {N} Pokémon.',
      ownBench: [
        { instanceId: 2, name: 'Dragon', types: ['Dragon'] },
        { instanceId: 3, name: 'Grass', types: ['Grass'] },
      ],
      discard: [energy(80, 'Fire')],
    })
  );
  assert.equal(state.players.p1.zones.bench.find((c) => c.instanceId === 80)?.attachedTo, 2);
});

test('Scoop Water shuffles the chosen Energy from the discard pile into the deck', () => {
  let state = attack(
    board({
      text: 'Shuffle up to 3 Basic {W} Energy cards from your discard pile into your deck.',
      discard: [energy(80, 'Water'), energy(81, 'Water'), energy(82, 'Fire')],
    })
  );
  state = choose(state, [80, 81]);
  assert.deepEqual(ids(state.players.p1.zones.discard), [82]);
  assert.ok(ids(state.players.p1.zones.deck).includes(80));
});

test('Strong Breeze shuffles the opponent\'s Active and its cards into their deck', () => {
  const state = attack(
    board({
      text: 'Your opponent shuffles their Active Pokémon and all attached cards into their deck.',
      opp: [{ ...energy(60, 'Water'), attachedTo: 20 }],
      oppBench: [{ instanceId: 21, name: 'Bench' }],
    })
  );
  const deckIds = ids(state.players.p2.zones.deck);
  assert.ok(deckIds.includes(20) && deckIds.includes(60));
  assert.equal(state.players.p1.flags?.prizesOwed, undefined);
});

test('Homeward Chime shuffles your only Benched Pokémon into your deck', () => {
  const state = attack(
    board({
      text: 'Shuffle 1 of your Benched Pokémon and all attached cards into your deck.',
      ownBench: [{ instanceId: 2, name: 'Bench' }],
    })
  );
  assert.equal(state.players.p1.zones.bench.length, 0);
  assert.ok(ids(state.players.p1.zones.deck).includes(2));
});

test('Devastating Wind: the opponent shuffles their hand and draws 3', () => {
  const hand = [70, 71, 72, 73, 74].map((id) => createCard({ instanceId: id, name: `Hand ${id}` }));
  const state = attack(
    board({ text: 'Your opponent shuffles their hand into their deck and draws 3 cards.', oppHand: hand })
  );
  // 3 drawn by the attack, then 1 for the opponent's turn.
  assert.equal(state.players.p2.zones.hand.length, 4);
});

test('Volt Switch only switches with a Benched {L} Pokémon', () => {
  const state = attack(
    board({
      text: 'Switch this Pokémon with 1 of your Benched {L} Pokémon.',
      ownBench: [
        { instanceId: 2, name: 'Water', types: ['Water'] },
        { instanceId: 3, name: 'Volt', types: ['Lightning'] },
      ],
    })
  );
  assert.equal(state.players.p1.zones.active[0].instanceId, 3);
});
