import test from 'node:test';
import assert from 'node:assert/strict';

import { reconcileTurnState } from '../apply-view.js';
import {
  rulesState,
  resetRulesSessionState,
  startGame,
  beginTurn,
  canPerformAction,
} from '../../../../../shared/engine/rules/rules-state.mjs';
import {
  dispatchAuthoritativeMoveCardBundle,
  buildAuthoritativeCardHint,
  setAuthoritativeDispatchContext,
  resetAuthoritativeDispatchContext,
} from '../authoritative-dispatch.js';

test('multiplayer-starting-active: reconcileTurnState preserves setup phase and turn 0 until both actives are filled', () => {
  const localState = {
    turnPlayer: 'self',
    turnNumber: 0,
    phase: 'setup',
    startingActiveDone: false,
    flags: {},
  };

  // 1. Initial deal view: server reports turn 1 main phase, but both actives are empty
  const initialDealView = {
    you: { playerId: 'p1', zones: { active: [], hand: [{ instanceId: 10 }] } },
    them: { playerId: 'p2', zones: { active: [], hand: [{ count: 7 }] } },
    turn: { player: 'p1', isYourTurn: true, number: 1, phase: 'main' },
  };

  const res1 = reconcileTurnState(initialDealView, { rulesState: localState });
  assert.equal(res1.applied, true);
  assert.equal(localState.turnPlayer, 'self');
  assert.equal(localState.turnNumber, 0, 'Must remain turn 0 while active spots are empty');
  assert.equal(localState.phase, 'setup', 'Must remain in setup phase while active spots are empty');
  assert.equal(localState.startingActiveDone, false);

  // 2. Self places active: you.zones.active has 1 card, but them.zones.active is still empty
  const selfActivePlacedView = {
    you: { playerId: 'p1', zones: { active: [{ instanceId: 10 }] }, hand: [] },
    them: { playerId: 'p2', zones: { active: [], hand: [{ count: 7 }] } },
    turn: { player: 'p1', isYourTurn: true, number: 1, phase: 'main' },
  };

  const res2 = reconcileTurnState(selfActivePlacedView, { rulesState: localState });
  assert.equal(res2.applied, true);
  assert.equal(localState.turnNumber, 0, 'Must remain turn 0 until opponent also sets active');
  assert.equal(localState.phase, 'setup');
  assert.equal(localState.startingActiveDone, false);

  // 3. Opponent also places active: both active zones now have cards
  const bothActivesPlacedView = {
    you: { playerId: 'p1', zones: { active: [{ instanceId: 10 }] }, hand: [] },
    them: { playerId: 'p2', zones: { active: [{ instanceId: 20 }] }, hand: [] },
    turn: { player: 'p1', isYourTurn: true, number: 1, phase: 'main' },
  };

  const res3 = reconcileTurnState(bothActivesPlacedView, { rulesState: localState });
  assert.equal(res3.applied, true);
  assert.equal(localState.turnNumber, 1, 'Transitions to turn 1 once both actives are set');
  assert.equal(localState.phase, 'main', 'Transitions to main phase once both actives are set');
  assert.equal(localState.startingActiveDone, true);

  // 4. Mid-game active knockout: active is empty during turn 3, but startingActiveDone is true
  const knockoutView = {
    you: { playerId: 'p1', zones: { active: [] } },
    them: { playerId: 'p2', zones: { active: [{ instanceId: 20 }] } },
    turn: { player: 'p1', isYourTurn: true, number: 3, phase: 'main' },
  };

  const res4 = reconcileTurnState(knockoutView, { rulesState: localState });
  assert.equal(res4.applied, true);
  assert.equal(localState.turnNumber, 3, 'Mid-game turnNumber is preserved');
  assert.equal(localState.phase, 'main', 'Mid-game phase is preserved');
});

test('multiplayer-starting-active: canPerformAction allows starting active placement for both players during setup', () => {
  resetRulesSessionState();
  startGame('self');
  assert.equal(rulesState.turnNumber, 0);
  assert.equal(rulesState.startingActiveDone, false);

  // Turn player placing starting active is allowed
  const selfMove = canPerformAction({
    user: 'self',
    action: 'moveCard',
    targetZoneId: 'active',
    initiator: 'self',
  });
  assert.equal(selfMove.allowed, true);

  // Non-turn player placing starting active is also allowed (not blocked by "It's not your turn.")
  const oppMove = canPerformAction({
    user: 'opp',
    action: 'moveCard',
    targetZoneId: 'active',
    initiator: 'opp',
  });
  assert.equal(oppMove.allowed, true);

  // Other actions during setup are gracefully blocked
  assert.equal(
    canPerformAction({ user: 'self', action: 'attachEnergy', initiator: 'self' }).allowed,
    false
  );
  assert.equal(
    canPerformAction({ user: 'self', action: 'attack', initiator: 'self' }).allowed,
    false
  );
  assert.equal(
    canPerformAction({ user: 'self', action: 'moveCard', targetZoneId: 'bench', initiator: 'self' }).allowed,
    false
  );

  // After turn 1 begins, normal turn gating takes over
  beginTurn('self');
  assert.equal(rulesState.turnNumber, 1);
  assert.equal(rulesState.startingActiveDone, true);

  // Turn player can move to bench
  assert.equal(
    canPerformAction({ user: 'self', action: 'moveCard', targetZoneId: 'bench', initiator: 'self' }).allowed,
    true
  );

  // Non-turn player is blocked
  const oppBenchMove = canPerformAction({
    user: 'opp',
    action: 'moveCard',
    targetZoneId: 'bench',
    initiator: 'opp',
  });
  assert.equal(oppBenchMove.allowed, false);
  assert.equal(oppBenchMove.reason, "It's not your turn.");
});

test('multiplayer-starting-active: dispatchAuthoritativeMoveCardBundle dispatches moveCard with authoritativeIds', () => {
  const dispatched = [];
  setAuthoritativeDispatchContext({
    processAction: (user, emit, action, parameters) => {
      dispatched.push({ user, emit, action, parameters });
    },
    systemState: { serverAuthoritative: true },
  });

  const fakeRegistry = new Map([
    [
      42,
      {
        card: { name: 'Charmander' },
        zone: 'hand',
        side: 'you',
      },
    ],
  ]);

  const success = dispatchAuthoritativeMoveCardBundle(
    {
      user: 'self',
      emit: true,
      cardHints: null,
      oZoneId: 'hand',
      dZoneId: 'active',
      index: 0,
      targetIndex: false,
      action: 'move',
      authoritativeIds: { moving: 42 },
    },
    {
      systemState: { serverAuthoritative: true },
      registry: fakeRegistry,
    }
  );

  assert.equal(success, true);
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].action, 'moveCardBundle');
  assert.equal(dispatched[0].user, 'self');
  assert.equal(dispatched[0].emit, true);

  // Hints should carry instanceId 42
  const hints = dispatched[0].parameters[6];
  assert.equal(hints.moving.instanceId, 42);
  assert.equal(hints.moving.name, 'Charmander');

  resetAuthoritativeDispatchContext();
});
