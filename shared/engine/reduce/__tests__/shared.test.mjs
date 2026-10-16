// Direct tests for the cross-domain reducer helpers split out of reduce.mjs (design 073 B, I250).
// They pin what the helpers did inside reduce.mjs; the reducer suites cover them end to end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  benchTargets,
  rootsIn,
  markerCount,
  setGameEnded,
  ensureOncePerGame,
  isGameConcluded,
  isGameFrozen,
  effectiveOncePerGameKind,
  tiebreakActive,
  shuffleDeckWithRng,
} from '../shared.mjs';

const pokemon = (instanceId, extra = {}) => ({ instanceId, supertype: 'Pokémon', hp: 60, ...extra });
const energy = (instanceId, attachedTo) => ({ instanceId, supertype: 'Energy', attachedTo });

test('benchTargets and rootsIn keep unattached Pokémon roots only', () => {
  const bench = [pokemon(1), energy(2, 1), pokemon(3, { attachedTo: 1 }), pokemon(4)];
  assert.deepEqual(benchTargets({ zones: { bench } }).map((c) => c.instanceId), [1, 4]);
  assert.deepEqual(rootsIn(bench).map((c) => c.instanceId), [1, 4]);
  assert.deepEqual(benchTargets(null), []);
  assert.deepEqual(rootsIn(undefined), []);
});

test('markerCount sums one field over markers of one kind', () => {
  const markers = [
    { kind: 'retreatDelta', amount: 1 },
    { kind: 'retreatDelta', amount: 2 },
    { kind: 'other', amount: 5 },
    { kind: 'retreatDelta' },
  ];
  assert.equal(markerCount(markers, 'retreatDelta', 'amount'), 3);
  assert.equal(markerCount([], 'retreatDelta', 'amount'), 0);
});

test('isGameConcluded covers ended and tiebreak; isGameFrozen only ended', () => {
  assert.equal(isGameConcluded({ turn: { phase: 'ended' } }), true);
  assert.equal(isGameConcluded({ turn: { phase: 'tiebreak' } }), true);
  assert.equal(isGameConcluded({ turn: { phase: 'main' } }), false);
  assert.equal(isGameConcluded(null), false);
  assert.equal(isGameFrozen({ turn: { phase: 'ended' } }), true);
  assert.equal(isGameFrozen({ turn: { phase: 'tiebreak' } }), false);
});

test('tiebreakActive is the tiebreak phase or a first-Prize-wins game', () => {
  assert.equal(tiebreakActive({ turn: { phase: 'tiebreak' } }), true);
  assert.equal(tiebreakActive({ turn: { phase: 'main' }, firstPrizeWins: true }), true);
  assert.equal(tiebreakActive({ turn: { phase: 'main' } }), false);
  assert.equal(tiebreakActive(undefined), false);
});

test('setGameEnded ends the game, or enters a tiebreak on a simultaneous win', () => {
  const ended = { turn: { phase: 'main' } };
  const events = [];
  setGameEnded(ended, { winner: 'p1', reason: 'prizes', events });
  assert.equal(ended.turn.phase, 'ended');
  assert.equal(ended.winner, 'p1');
  assert.equal(ended.winReason, 'prizes');
  assert.deepEqual(events, [{ type: 'gameEnded', winner: 'p1', reason: 'prizes' }]);

  const tied = { turn: { phase: 'main' } };
  const tieEvents = [];
  setGameEnded(tied, { simultaneous: ['p1', 'p2'], ways: { p1: ['prizes'] }, events: tieEvents });
  assert.equal(tied.turn.phase, 'tiebreak');
  assert.equal(tied.winner, null);
  assert.equal(tied.winReason, 'simultaneous');
  assert.equal(tied.firstPrizeWins, true);
  assert.deepEqual(tied.tiebreak, { players: ['p1', 'p2'], ways: { p1: ['prizes'], p2: [] } });
  assert.deepEqual(tieEvents, [{ type: 'tiebreakStarted', players: ['p1', 'p2'] }]);
});

test('ensureOncePerGame initialises lazily and returns the same object', () => {
  const draft = { players: { p1: {} } };
  const first = ensureOncePerGame(draft, 'p1');
  assert.deepEqual(first, { vstarUsed: false, gxUsed: false });
  first.gxUsed = true;
  assert.equal(ensureOncePerGame(draft, 'p1'), first);
  assert.equal(ensureOncePerGame(draft, 'p9'), null);
});

test('effectiveOncePerGameKind prefers an explicit payload kind', () => {
  const state = { players: {} };
  assert.equal(effectiveOncePerGameKind(state, { payload: { kind: 'gx' } }), 'gx');
  assert.equal(effectiveOncePerGameKind(state, { payload: { kind: 'vstar' } }), 'vstar');
  assert.equal(effectiveOncePerGameKind(state, { payload: { instanceId: 404 } }), null);
});

test('shuffleDeckWithRng uses the rng shuffle and is a no-op without one', () => {
  const player = { zones: { deck: [1, 2, 3] } };
  shuffleDeckWithRng(player, null);
  assert.deepEqual(player.zones.deck, [1, 2, 3]);
  shuffleDeckWithRng(player, { shuffle: (cards) => [...cards].reverse() });
  assert.deepEqual(player.zones.deck, [3, 2, 1]);
});
