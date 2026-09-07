import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffViews, indexPlayerZones, hasCardChanged } from '../view-diff.mjs';

test('hasCardChanged detects mutations, attachments, and reveal state', () => {
  const base = { instanceId: 10, name: 'Pikachu', src: 'pikachu.png', damage: 0, specialCondition: null, abilityUsed: false, attachedTo: null };

  // Identical
  assert.equal(hasCardChanged(base, { ...base }), false);

  // Damage changed
  assert.equal(hasCardChanged(base, { ...base, damage: 30 }), true);

  // Special condition changed
  assert.equal(hasCardChanged(base, { ...base, specialCondition: 'Asleep' }), true);

  // Ability used changed
  assert.equal(hasCardChanged(base, { ...base, abilityUsed: true }), true);

  // Attachment changed
  assert.equal(hasCardChanged(base, { ...base, attachedTo: 42 }), true);

  // Redacted to revealed
  const redacted = { instanceId: 10 };
  assert.equal(hasCardChanged(redacted, base), true);
  assert.equal(hasCardChanged(base, redacted), true);
});

test('indexPlayerZones builds lookup map across zones', () => {
  const player = {
    zones: {
      active: [{ instanceId: 10, name: 'Pikachu' }],
      bench: [{ instanceId: 20, name: 'Raichu' }],
    },
  };
  const indexed = indexPlayerZones(player, 'you');
  assert.equal(indexed.size, 2);
  assert.equal(indexed.get(10).zone, 'active');
  assert.equal(indexed.get(20).zone, 'bench');
});

test('diffViews handles initial view computation', () => {
  const initialView = {
    gameId: 'game-1',
    stateVersion: 1,
    turn: { player: 'p1', isYourTurn: true, number: 1, phase: 'main' },
    stadium: null,
    pendingChoice: null,
    you: {
      playerId: 'p1',
      username: 'Player 1',
      zones: {
        hand: [{ instanceId: 1, name: 'Charmander', src: 'charmander.png' }],
        deck: { count: 50 },
        active: [],
        bench: [],
        prizes: [{ instanceId: 2 }],
        discard: [],
        lostZone: [],
        board: [],
      },
    },
    them: {
      playerId: 'p2',
      username: 'Player 2',
      zones: {
        hand: [{ instanceId: 10 }],
        deck: { count: 50 },
        active: [],
        bench: [],
        prizes: [{ instanceId: 11 }],
        discard: [],
        lostZone: [],
        board: [],
      },
    },
  };

  const diff = diffViews(null, initialView);
  assert.equal(diff.isInitial, true);
  assert.equal(diff.versionChanged, true);
  assert.equal(diff.players.you.added.length, 2); // 1 in hand, 1 in prizes
  assert.equal(diff.players.them.added.length, 2);
  assert.equal(diff.players.you.deckCount.current, 50);
});

test('diffViews detects card movements, property mutations, and removed cards', () => {
  const view1 = {
    gameId: 'game-1',
    stateVersion: 10,
    turn: { player: 'p1', isYourTurn: true, number: 1, phase: 'main' },
    stadium: null,
    pendingChoice: null,
    you: {
      playerId: 'p1',
      username: 'Player 1',
      zones: {
        hand: [
          { instanceId: 1, name: 'Pikachu', src: 'pikachu.png' },
          { instanceId: 2, name: 'Lightning Energy', src: 'energy.png' },
        ],
        active: [],
        bench: [],
        prizes: [],
        discard: [],
        lostZone: [],
        board: [],
        deck: { count: 40 },
      },
    },
    them: {
      playerId: 'p2',
      username: 'Player 2',
      zones: {
        hand: [{ instanceId: 5 }],
        active: [{ instanceId: 6, name: 'Squirtle', src: 'squirtle.png', damage: 0 }],
        bench: [],
        prizes: [],
        discard: [],
        lostZone: [],
        board: [],
        deck: { count: 40 },
      },
    },
  };

  const view2 = {
    gameId: 'game-1',
    stateVersion: 11,
    turn: { player: 'p1', isYourTurn: true, number: 1, phase: 'main' },
    stadium: { instanceId: 99, name: 'Path to the Peak', src: 'path.png' },
    pendingChoice: null,
    you: {
      playerId: 'p1',
      username: 'Player 1',
      zones: {
        hand: [],
        active: [{ instanceId: 1, name: 'Pikachu', src: 'pikachu.png' }],
        bench: [],
        prizes: [],
        discard: [{ instanceId: 2, name: 'Lightning Energy', src: 'energy.png' }],
        lostZone: [],
        board: [],
        deck: { count: 40 },
      },
    },
    them: {
      playerId: 'p2',
      username: 'Player 2',
      zones: {
        hand: [{ instanceId: 5 }],
        active: [{ instanceId: 6, name: 'Squirtle', src: 'squirtle.png', damage: 30, specialCondition: 'Paralyzed' }],
        bench: [],
        prizes: [],
        discard: [],
        lostZone: [],
        board: [],
        deck: { count: 40 },
      },
    },
  };

  const diff = diffViews(view1, view2);
  assert.equal(diff.versionChanged, true);
  assert.equal(diff.stadium.changed, true);
  assert.equal(diff.stadium.current.name, 'Path to the Peak');

  // Check p1 movements
  const p1Moves = diff.players.you.moved;
  assert.equal(p1Moves.length, 2);
  const pikachuMove = p1Moves.find((m) => m.instanceId === 1);
  assert.equal(pikachuMove.fromZone, 'hand');
  assert.equal(pikachuMove.toZone, 'active');

  const energyMove = p1Moves.find((m) => m.instanceId === 2);
  assert.equal(energyMove.fromZone, 'hand');
  assert.equal(energyMove.toZone, 'discard');

  // Check p2 damage/status update
  const p2Updates = diff.players.them.updated;
  assert.equal(p2Updates.length, 1);
  assert.equal(p2Updates[0].instanceId, 6);
  assert.equal(p2Updates[0].card.damage, 30);
  assert.equal(p2Updates[0].card.specialCondition, 'Paralyzed');
});

test('diffViews tracks pending choices for both players', () => {
  const viewNoChoice = {
    gameId: 'game-1',
    stateVersion: 20,
    turn: { player: 'p1', number: 2, phase: 'main' },
    pendingChoice: null,
    you: { playerId: 'p1', zones: {} },
    them: { playerId: 'p2', zones: {} },
  };

  const viewWithChoice = {
    gameId: 'game-1',
    stateVersion: 21,
    turn: { player: 'p1', number: 2, phase: 'main' },
    pendingChoice: {
      choiceId: 'choice_1',
      player: 'p1',
      prompt: 'Select 2 cards to discard',
      options: [{ instanceId: 1 }, { instanceId: 2 }],
      min: 2,
      max: 2,
    },
    you: { playerId: 'p1', zones: {} },
    them: { playerId: 'p2', zones: {} },
  };

  const diff = diffViews(viewNoChoice, viewWithChoice);
  assert.equal(diff.choiceChanged, true);
  assert.equal(diff.pendingChoice.current.choiceId, 'choice_1');
});
