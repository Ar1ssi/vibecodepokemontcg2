// I154: server executors for the parsed Trainer step kinds that previously had none
// (Alph Lithograph, Buddy-Buddy Rescue, Caitlin, Eneporter, Fan of Waves, …). Driven
// through executeSteps with the step shapes the parser emits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { executeSteps } from '../effects/executor.mjs';

function game() {
  const state = createGameState({ gameId: 'i154', seed: 7, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  return state;
}

const mon = (id, name, extra = {}) =>
  createCard({ instanceId: id, name, hp: 100, supertype: 'Pokémon', stage: 'Basic', ...extra });
const card = (id, name, extra = {}) => createCard({ instanceId: id, name, ...extra });
const energy = (id, name, attachedTo) =>
  createCard({ instanceId: id, name, type: 'Energy', supertype: 'Energy', subtypes: ['Basic'], attachedTo });
const specialEnergy = (id, name, attachedTo) =>
  createCard({ instanceId: id, name, type: 'Energy', supertype: 'Energy', subtypes: ['Special Energy'], attachedTo });
const ids = (cards) => cards.map((c) => c.instanceId);

function run(state, step, opts = {}) {
  return executeSteps(state, {
    steps: [step],
    effectType: 'trainer',
    playerId: 'p1',
    activeRng: opts.rng ?? createRng(3),
    events: opts.events ?? [],
    sourceCard: card(900, 'Test Trainer', { supertype: 'Trainer' }),
  });
}

function resume(state, step, first, selection, opts = {}) {
  return executeSteps(state, {
    steps: [step],
    fromStepIndex: 0,
    effectType: 'trainer',
    playerId: 'p1',
    activeRng: opts.rng ?? createRng(3),
    events: opts.events ?? [],
    selection,
    context: first.pendingChoice.resumeToken.context,
  });
}

test('I154 returnStadiumToHand: the Stadium returns to its owner hand', () => {
  const state = game();
  state.players.p2.zones.hand.push(card(50, 'Old Stadium', { supertype: 'Trainer', trainerType: 'Stadium' }));
  state.stadium = { ...state.players.p2.zones.hand.pop(), ownerId: 'p2' };
  const res = run(state, { type: 'returnStadiumToHand' });
  assert.equal(res.pendingChoice, null);
  assert.equal(state.stadium, null);
  assert.ok(state.players.p2.zones.hand.some((c) => c.instanceId === 50));
});

test('I154 shuffleDeckOnly: shuffles the deck in place', () => {
  const state = game();
  for (let i = 0; i < 12; i++) state.players.p1.zones.deck.push(card(100 + i, `D${i}`));
  const before = ids(state.players.p1.zones.deck);
  const events = [];
  run(state, { type: 'shuffleDeckOnly' }, { rng: createRng(11), events });
  const after = ids(state.players.p1.zones.deck);
  assert.deepEqual([...after].sort((a, b) => a - b), [...before].sort((a, b) => a - b));
  assert.ok(events.some((e) => e.type === 'deckShuffled'));
});

test('I154 eachPlayerRecoverPokemon: opponent chooses first, then you', () => {
  const state = game();
  state.players.p1.zones.discard.push(mon(10, 'Mine'));
  state.players.p2.zones.discard.push(mon(20, 'Theirs'));
  let res = run(state, { type: 'eachPlayerRecoverPokemon' });
  assert.equal(res.pendingChoice.player, 'p2');
  res = resume(state, { type: 'eachPlayerRecoverPokemon' }, res, [20]);
  assert.equal(res.pendingChoice.player, 'p1');
  res = resume(state, { type: 'eachPlayerRecoverPokemon' }, res, [10]);
  assert.equal(res.pendingChoice, null);
  assert.ok(state.players.p1.zones.hand.some((c) => c.instanceId === 10));
  assert.ok(state.players.p2.zones.hand.some((c) => c.instanceId === 20));
});

test('I154 putHandBottomThenDraw: chosen cards go to the bottom, then draw that many', () => {
  const state = game();
  state.players.p1.zones.hand.push(card(10, 'H1'), card(11, 'H2'));
  state.players.p1.zones.deck.push(card(12, 'Top'));
  let res = run(state, { type: 'putHandBottomThenDraw' });
  res = resume(state, { type: 'putHandBottomThenDraw' }, res, [10]);
  assert.equal(res.pendingChoice, null);
  assert.equal(ids(state.players.p1.zones.deck).at(-1), 10, 'put on the bottom');
  assert.ok(state.players.p1.zones.hand.some((c) => c.instanceId === 12), 'drew the top card');
});

test('I154 moveEnergyOpponent: a Special Energy moves between the opponent Pokémon', () => {
  const state = game();
  state.players.p2.zones.active.push(mon(20, 'Theirs', { attachedTo: undefined }), specialEnergy(21, 'Special', 20));
  state.players.p2.zones.bench.push(mon(22, 'Bench'));
  let res = run(state, { type: 'moveEnergyOpponent', energy: 'Special Energy' });
  res = resume(state, { type: 'moveEnergyOpponent', energy: 'Special Energy' }, res, [21]);
  res = resume(state, { type: 'moveEnergyOpponent', energy: 'Special Energy' }, res, [22]);
  assert.equal(res.pendingChoice, null);
  assert.equal(state.players.p2.zones.bench.find((c) => c.instanceId === 21).attachedTo, 22);
});

test('I154 sendEnergyToDeckBottom: the Special Energy goes to the deck bottom', () => {
  const state = game();
  state.players.p2.zones.active.push(mon(20, 'Theirs'), specialEnergy(21, 'Special', 20));
  const res = run(state, { type: 'sendEnergyToDeckBottom', energy: 'Special Energy' });
  assert.equal(res.pendingChoice, null);
  assert.equal(state.players.p2.zones.deck.at(-1).instanceId, 21);
});

test('I154 sendEnergyToLostZone: the Special Energy goes to the Lost Zone', () => {
  const state = game();
  state.players.p2.zones.active.push(mon(20, 'Theirs'), specialEnergy(21, 'Special', 20));
  const res = run(state, { type: 'sendEnergyToLostZone', energy: 'Special Energy' });
  assert.equal(res.pendingChoice, null);
  assert.ok(state.players.p2.zones.lostZone.some((c) => c.instanceId === 21));
});

test('I154 opponentHandShuffleItemsDraw: Items shuffle in, the player draws that many', () => {
  const state = game();
  state.players.p2.zones.hand.push(
    card(20, 'Item', { supertype: 'Trainer', trainerType: 'Item' }),
    card(21, 'Supporter', { supertype: 'Trainer', trainerType: 'Supporter' })
  );
  state.players.p1.zones.deck.push(card(30, 'Drawn'));
  const res = run(state, { type: 'opponentHandShuffleItemsDraw' });
  assert.equal(res.pendingChoice, null);
  assert.ok(state.players.p2.zones.deck.some((c) => c.instanceId === 20));
  assert.ok(state.players.p2.zones.hand.some((c) => c.instanceId === 21));
  assert.ok(state.players.p1.zones.hand.some((c) => c.instanceId === 30));
});

test('I154 flipUntilTailsDraw: draws one card per heads', () => {
  const state = game();
  state.players.p1.zones.deck.push(card(10, 'A'), card(11, 'B'), card(12, 'C'));
  let i = 0;
  const seq = [0.1, 0.9];
  const rng = { next: () => seq[Math.min(i++, seq.length - 1)] };
  const res = run(state, { type: 'flipUntilTailsDraw' }, { rng });
  assert.equal(res.pendingChoice, null);
  assert.equal(state.players.p1.zones.hand.length, 1);
});

test('I154 eachPlayerHandToFive: opponent discards first, then you draw up', () => {
  const state = game();
  for (let i = 0; i < 7; i++) state.players.p2.zones.hand.push(card(20 + i, `X${i}`));
  state.players.p1.zones.deck.push(card(10, 'D1'), card(11, 'D2'), card(12, 'D3'));
  let res = run(state, { type: 'eachPlayerHandToFive', count: 5, opponentFirst: true });
  assert.equal(res.pendingChoice.player, 'p2');
  res = resume(state, { type: 'eachPlayerHandToFive', count: 5, opponentFirst: true }, res, [20, 21]);
  assert.equal(res.pendingChoice, null);
  assert.equal(state.players.p2.zones.hand.length, 5, 'discarded down to the count');
  assert.equal(state.players.p1.zones.hand.length, 3, 'drew up to the count');
});

test('I154 eachPlayerDiscardFromHand: each player discards N, opponent first', () => {
  const state = game();
  state.players.p2.zones.hand.push(card(20, 'X1'), card(21, 'X2'));
  state.players.p1.zones.hand.push(card(10, 'Y1'), card(11, 'Y2'));
  let res = run(state, { type: 'eachPlayerDiscardFromHand', count: 1, opponentFirst: true });
  assert.equal(res.pendingChoice.player, 'p2');
  res = resume(state, { type: 'eachPlayerDiscardFromHand', count: 1, opponentFirst: true }, res, [20]);
  assert.equal(res.pendingChoice.player, 'p1');
  res = resume(state, { type: 'eachPlayerDiscardFromHand', count: 1, opponentFirst: true }, res, [10]);
  assert.equal(res.pendingChoice, null);
  assert.ok(state.players.p2.zones.discard.some((c) => c.instanceId === 20));
  assert.ok(state.players.p1.zones.discard.some((c) => c.instanceId === 10));
});

test('I154 putHandBasicAsActive: the hand Basic takes the Active Spot', () => {
  const state = game();
  state.players.p1.zones.active.push(mon(1, 'Old Active'));
  state.players.p1.zones.hand.push(mon(10, 'New Basic'));
  const res = run(state, { type: 'putHandBasicAsActive' });
  assert.equal(res.pendingChoice, null);
  assert.equal(state.players.p1.zones.active.find((c) => !c.attachedTo).instanceId, 10);
  assert.ok(state.players.p1.zones.bench.some((c) => c.instanceId === 1));
});

test('I154 opponentDiscardToLostZonePerPokemon: one discard card per qualifying Pokémon', () => {
  const state = game();
  state.players.p1.zones.active.push(mon(1, 'Fire', { types: ['Fire'] }));
  state.players.p2.zones.discard.push(card(20, 'D1'), card(21, 'D2'));
  let res = run(state, { type: 'opponentDiscardToLostZonePerPokemon', energyType: '{R}' });
  assert.ok(res.pendingChoice);
  res = resume(state, { type: 'opponentDiscardToLostZonePerPokemon', energyType: '{R}' }, res, [20]);
  assert.equal(res.pendingChoice, null);
  assert.deepEqual(ids(state.players.p2.zones.lostZone), [20]);
});

test('I154 putDiscardOnTop: a matching discard card goes on top of the deck', () => {
  const state = game();
  state.players.p1.zones.discard.push(mon(10, 'Mon'), card(11, 'Item', { supertype: 'Trainer' }));
  state.players.p1.zones.deck.push(card(12, 'Top'));
  const res = run(state, { type: 'putDiscardOnTop', what: 'Pokémon' });
  assert.equal(res.pendingChoice, null);
  assert.equal(state.players.p1.zones.deck[0].instanceId, 10);
});

test('I154 searchToTop: chosen deck cards go on top, the rest shuffle', () => {
  const state = game();
  for (let i = 0; i < 5; i++) state.players.p1.zones.deck.push(card(10 + i, `D${i}`));
  let res = run(state, { type: 'searchToTop', count: 2 }, { rng: createRng(5) });
  assert.equal(res.pendingChoice.min, 2);
  res = resume(state, { type: 'searchToTop', count: 2 }, res, [10, 11]);
  assert.equal(res.pendingChoice, null);
  assert.deepEqual(ids(state.players.p1.zones.deck).slice(0, 2), [10, 11]);
  assert.equal(state.players.p1.zones.deck.length, 5);
});

test('I154 healAllOwnAndDiscardEnergy: every damaged Pokémon heals and drops its Energy', () => {
  const state = game();
  const hurt = mon(10, 'Hurt', { damage: 30 });
  state.players.p1.zones.active.push(hurt, energy(11, 'Energy', 10));
  const hurtBench = mon(12, 'Hurt Bench', { damage: 20 });
  state.players.p1.zones.bench.push(hurtBench, energy(13, 'Energy', 12));
  const res = run(state, { type: 'healAllOwnAndDiscardEnergy' });
  assert.equal(res.pendingChoice, null);
  assert.equal(hurt.damage, 0);
  assert.equal(hurtBench.damage, 0);
  assert.ok(state.players.p1.zones.discard.some((c) => c.instanceId === 11));
  assert.ok(state.players.p1.zones.discard.some((c) => c.instanceId === 13));
});

test('I154 healOneDiscardEnergy: heals one Pokémon and discards its Energy', () => {
  const state = game();
  const hurt = mon(10, 'Hurt', { damage: 30 });
  state.players.p1.zones.active.push(hurt, energy(11, 'Energy', 10));
  const res = run(state, { type: 'healOneDiscardEnergy' });
  assert.equal(res.pendingChoice, null);
  assert.equal(hurt.damage, 0);
  assert.ok(state.players.p1.zones.discard.some((c) => c.instanceId === 11));
});

test('I154 opponentDiscardToDeckBottom / ToHand', () => {
  const bottom = game();
  bottom.players.p2.zones.discard.push(card(20, 'D'));
  run(bottom, { type: 'opponentDiscardToDeckBottom' });
  assert.equal(bottom.players.p2.zones.deck.at(-1).instanceId, 20);

  const hand = game();
  hand.players.p2.zones.discard.push(card(20, 'D'));
  run(hand, { type: 'opponentDiscardToHand' });
  assert.ok(hand.players.p2.zones.hand.some((c) => c.instanceId === 20));
});

test('I154 eachPlayerReturnBench: each player returns a Benched Pokémon to hand, you first', () => {
  const state = game();
  state.players.p1.zones.bench.push(mon(10, 'Mine'), energy(11, 'E', 10));
  state.players.p2.zones.bench.push(mon(20, 'Theirs'));
  const res = run(state, { type: 'eachPlayerReturnBench' });
  assert.equal(res.pendingChoice, null);
  assert.ok(state.players.p1.zones.hand.some((c) => c.instanceId === 10));
  assert.ok(state.players.p1.zones.hand.some((c) => c.instanceId === 11), 'attachments come along');
  assert.ok(state.players.p2.zones.hand.some((c) => c.instanceId === 20));
});

test('I154 switchHandWithTop: the hand card trades with the deck top', () => {
  const state = game();
  state.players.p1.zones.hand.push(card(10, 'Hand'));
  state.players.p1.zones.deck.push(card(11, 'Top'), card(12, 'Second'));
  const res = run(state, { type: 'switchHandWithTop' });
  assert.equal(res.pendingChoice, null);
  assert.equal(state.players.p1.zones.deck[0].instanceId, 10);
  assert.ok(state.players.p1.zones.hand.some((c) => c.instanceId === 11));
});

test('I154 millPerHeads: mills per heads flipped', () => {
  const state = game();
  for (let i = 0; i < 6; i++) state.players.p2.zones.deck.push(card(20 + i, `D${i}`));
  const heads = { next: () => 0.1 };
  const res = run(state, { type: 'millPerHeads', coins: 2, per: 2 }, { rng: heads });
  assert.equal(res.pendingChoice, null);
  assert.equal(state.players.p2.zones.deck.length, 2);
  assert.equal(state.players.p2.zones.discard.length, 4);
});

test('I154 toolsToHand: chosen Tools return from the Pokémon', () => {
  const state = game();
  state.players.p1.zones.active.push(mon(10, 'Mon'));
  state.players.p1.zones.active.push(
    createCard({ instanceId: 11, name: 'Tool', supertype: 'Trainer', trainerType: 'Item', subtypes: ['Pokémon Tool'], attachedTo: 10 })
  );
  let res = run(state, { type: 'toolsToHand', count: 2 });
  res = resume(state, { type: 'toolsToHand', count: 2 }, res, [11]);
  assert.equal(res.pendingChoice, null);
  assert.ok(state.players.p1.zones.hand.some((c) => c.instanceId === 11));
});

test('I154 discardRandomOpponentHandIfSupporter: a Supporter is discarded', () => {
  const state = game();
  state.players.p2.zones.hand.push(card(20, 'Supporter', { supertype: 'Trainer', trainerType: 'Supporter' }));
  const res = run(state, { type: 'discardRandomOpponentHandIfSupporter' }, { rng: { next: () => 0 } });
  assert.equal(res.pendingChoice, null);
  assert.ok(state.players.p2.zones.discard.some((c) => c.instanceId === 20));
});

test('I154 shuffleDiscardThenMill: discard shuffles in, then that many mill', () => {
  const state = game();
  for (let i = 0; i < 3; i++) state.players.p1.zones.discard.push(card(10 + i, `D${i}`));
  const res = run(state, { type: 'shuffleDiscardThenMill' }, { rng: createRng(2) });
  assert.equal(res.pendingChoice, null);
  assert.equal(state.players.p1.zones.deck.length, 0);
  assert.deepEqual([...ids(state.players.p1.zones.discard)].sort(), [10, 11, 12]);
});

test('I154 eachPlayerShuffleHandDraw: both players shuffle and redraw the same count', () => {
  const state = game();
  state.players.p1.zones.hand.push(card(10, 'H1'), card(11, 'H2'));
  state.players.p1.zones.deck.push(card(12, 'D1'));
  state.players.p2.zones.hand.push(card(20, 'H3'));
  state.players.p2.zones.deck.push(card(21, 'D2'), card(22, 'D3'));
  const res = run(state, { type: 'eachPlayerShuffleHandDraw' }, { rng: createRng(4) });
  assert.equal(res.pendingChoice, null);
  assert.equal(state.players.p1.zones.hand.length, 2);
  assert.equal(state.players.p2.zones.hand.length, 1);
});

test('I154 discardAllEnergyFromActive: clears the chosen side Active', () => {
  const state = game();
  state.players.p2.zones.active.push(mon(20, 'Theirs'), energy(21, 'E1', 20), energy(22, 'E2', 20));
  const res = run(state, { type: 'discardAllEnergyFromActive', side: 'opponent' });
  assert.equal(res.pendingChoice, null);
  assert.equal(state.players.p2.zones.discard.length, 2);
});

test('I154 discardAllTrainerInPlay: Tools and the owned Stadium are discarded', () => {
  const state = game();
  state.players.p2.zones.active.push(mon(20, 'Theirs'));
  state.players.p2.zones.active.push(
    createCard({ instanceId: 21, name: 'Tool', supertype: 'Trainer', trainerType: 'Item', subtypes: ['Pokémon Tool'], attachedTo: 20 })
  );
  state.stadium = { ...card(22, 'Stadium', { supertype: 'Trainer', trainerType: 'Stadium' }), ownerId: 'p2' };
  const res = run(state, { type: 'discardAllTrainerInPlay', side: 'opponent', excludeSupporters: false });
  assert.equal(res.pendingChoice, null);
  assert.equal(state.stadium, null);
  assert.ok(state.players.p2.zones.discard.some((c) => c.instanceId === 21));
});

test('I154 drawBottom: draws from the bottom of the deck', () => {
  const state = game();
  state.players.p1.zones.deck.push(card(10, 'A'), card(11, 'B'), card(12, 'C'));
  const res = run(state, { type: 'drawBottom', count: 2 });
  assert.equal(res.pendingChoice, null);
  assert.deepEqual([...ids(state.players.p1.zones.hand)].sort(), [11, 12]);
  assert.deepEqual(ids(state.players.p1.zones.deck), [10]);
});
