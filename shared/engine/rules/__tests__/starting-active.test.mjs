import test from 'node:test';
import assert from 'node:assert/strict';

import {
  rulesState,
  startGame,
  beginTurn,
  canPerformAction,
  shouldAutoDrawAtTurnStart,
} from '../rules-state.mjs';
import { validateLegality } from '../../reduce.mjs';
import { isBasicPokemon, isPokemon, isEnergy, isTrainer } from '../../cards.mjs';

test('canPerformAction: allows starting active placement during setup / turnNumber 0', () => {
  startGame('self');
  assert.equal(rulesState.turnNumber, 0);

  // Both self and opp can place a Basic Pokémon in active
  const selfActiveMove = canPerformAction({
    user: 'self',
    action: 'moveCard',
    targetZoneId: 'active',
    initiator: 'self',
  });
  assert.equal(selfActiveMove.allowed, true);

  const oppActiveMove = canPerformAction({
    user: 'opp',
    action: 'moveCard',
    targetZoneId: 'active',
    initiator: 'opp',
  });
  assert.equal(oppActiveMove.allowed, true);

  // Moving to bench is blocked during starting active selection
  const benchMove = canPerformAction({
    user: 'self',
    action: 'moveCard',
    targetZoneId: 'bench',
    initiator: 'self',
  });
  assert.equal(benchMove.allowed, false);
  assert.match(benchMove.reason, /Starting Active/i);

  // Normal gameplay actions blocked before turn 1
  assert.equal(
    canPerformAction({ user: 'self', action: 'attachEnergy', initiator: 'self' }).allowed,
    false
  );
  assert.equal(
    canPerformAction({ user: 'self', action: 'playSupporter', initiator: 'self' }).allowed,
    false
  );
  assert.equal(
    canPerformAction({ user: 'self', action: 'playItem', initiator: 'self' }).allowed,
    false
  );
  assert.equal(
    canPerformAction({ user: 'self', action: 'evolve', initiator: 'self' }).allowed,
    false
  );
});

test('canPerformAction: normal turn gating resumes after beginTurn', () => {
  startGame('self');
  beginTurn('self');
  assert.equal(rulesState.turnNumber, 1);
  assert.equal(rulesState.phase, 'main');

  // Turn player can move to bench or active
  assert.equal(
    canPerformAction({ user: 'self', action: 'moveCard', targetZoneId: 'bench', initiator: 'self' }).allowed,
    true
  );

  // Non-turn player cannot move cards
  const oppMove = canPerformAction({
    user: 'opp',
    action: 'moveCard',
    targetZoneId: 'bench',
    initiator: 'opp',
  });
  assert.equal(oppMove.allowed, false);
  assert.equal(oppMove.reason, "It's not your turn.");
});

test('shouldAutoDrawAtTurnStart: does not draw during setup (turnNumber 0)', () => {
  assert.equal(
    shouldAutoDrawAtTurnStart({
      enabled: true,
      drewThisTurn: false,
      deckCount: 30,
      turnNumber: 0,
    }),
    false
  );

  assert.equal(
    shouldAutoDrawAtTurnStart({
      enabled: true,
      drewThisTurn: false,
      deckCount: 30,
      turnNumber: 1,
    }),
    true
  );
});

test('validateLegality: allows moveCard from hand to active during setup phase / turn 0', () => {
  const baseState = {
    rulesEnabled: true,
    turn: { player: 'p1', number: 0, phase: 'setup' },
    players: {
      p1: {
        zones: {
          hand: [{ instanceId: 1, name: 'Pikachu', supertype: 'Pokémon', stage: 'Basic', hp: 60 }],
          active: [],
          bench: [],
        },
      },
      p2: {
        zones: {
          hand: [{ instanceId: 2, name: 'Charmander', supertype: 'Pokémon', stage: 'Basic', hp: 70 }],
          active: [],
          bench: [],
        },
      },
    },
  };

  // p1 moving to empty active during setup
  const p1Res = validateLegality(baseState, {
    type: 'moveCard',
    playerId: 'p1',
    payload: { from: 'hand', to: 'active', instanceId: 1 },
  });
  assert.equal(p1Res.allowed, true);

  // p2 moving to empty active during setup (even if state.turn.player === 'p1')
  const p2Res = validateLegality(baseState, {
    type: 'moveCard',
    playerId: 'p2',
    payload: { from: 'hand', to: 'active', instanceId: 2 },
  });
  assert.equal(p2Res.allowed, true);

  // Moving from hand to bench during setup is rejected
  const benchRes = validateLegality(baseState, {
    type: 'moveCard',
    playerId: 'p1',
    payload: { from: 'hand', to: 'bench', instanceId: 1 },
  });
  assert.equal(benchRes.allowed, false);

  // If active is already occupied during setup, another move to active is rejected
  const occupiedState = {
    ...baseState,
    players: {
      ...baseState.players,
      p1: {
        ...baseState.players.p1,
        zones: {
          ...baseState.players.p1.zones,
          active: [{ instanceId: 1, name: 'Pikachu' }],
        },
      },
    },
  };
  const occupiedRes = validateLegality(occupiedState, {
    type: 'moveCard',
    playerId: 'p1',
    payload: { from: 'hand', to: 'active', instanceId: 99 },
  });
  assert.equal(occupiedRes.allowed, false);

  // During main phase, a second move to active fails with active_occupied
  const mainPhaseOccupiedState = {
    ...occupiedState,
    turn: { player: 'p1', number: 1, phase: 'main' },
  };
  const mainOccupiedRes = validateLegality(mainPhaseOccupiedState, {
    type: 'moveCard',
    playerId: 'p1',
    payload: { from: 'hand', to: 'active', instanceId: 99 },
  });
  assert.equal(mainOccupiedRes.allowed, false);
  assert.equal(mainOccupiedRes.reason, 'active_occupied');
});

test('isBasicPokemon: accurately identifies Basic Pokémon candidates vs evolutions and trainers', () => {
  const basic = { name: 'Pikachu', supertype: 'Pokémon', stage: 'Basic', hp: 60, types: ['Lightning'] };
  const stage1 = { name: 'Raichu', supertype: 'Pokémon', stage: 'Stage 1', hp: 120, types: ['Lightning'] };
  const stage2 = { name: 'Charizard', supertype: 'Pokémon', stage: 'Stage 2', hp: 180, types: ['Fire'] };
  const item = { name: 'Potion', supertype: 'Trainer', type: 'Item' };
  const energy = { name: 'Lightning Energy', supertype: 'Energy', type: 'Energy' };

  assert.equal(isBasicPokemon(basic), true);
  assert.equal(isBasicPokemon(stage1), false);
  assert.equal(isBasicPokemon(stage2), false);
  assert.equal(isBasicPokemon(item), false);
  assert.equal(isBasicPokemon(energy), false);
  assert.equal(isPokemon(basic), true);
  assert.equal(isTrainer(item), true);
  assert.equal(isEnergy(energy), true);
});
