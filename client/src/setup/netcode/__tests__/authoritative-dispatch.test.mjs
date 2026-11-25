import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  setAuthoritativeDispatchContext,
  resetAuthoritativeDispatchContext,
  isAuthoritativeDispatchActive,
  buildAuthoritativeCardHint,
  buildAuthoritativeCardHints,
  emitAuthoritativeCommand,
  readCardInstanceId,
  dispatchAuthoritativeMoveCardBundle,
  dispatchAuthoritativeZoneOp,
  dispatchAuthoritativeAction,
  dispatchAuthoritativeUseAbility,
  isMirrorSuppressedAction,
  actsForSide,
  isInRoom,
  refuseWithoutRoom,
  NO_ROOM_MESSAGE,
  DISPATCH_MISS_MESSAGE,
} from '../authoritative-dispatch.js';
import { setInstanceMap } from '../dual-run-bridge.js';
import { onEntry } from '../../../log/client-log.js';

afterEach(() => {
  resetAuthoritativeDispatchContext();
  setInstanceMap(null);
});

// Wired but in no room: the Multiplayer lobby, or before the join acknowledgement.
const NO_ROOM = { serverAuthoritative: false, solo: false, isTwoPlayer: false };

/** Registry stub shaped exactly like apply-view.js's cardRegistry entries. */
function stubRegistry(entries = []) {
  return new Map(
    entries.map((entry) => [
      entry.instanceId,
      {
        instanceId: entry.instanceId,
        element: {},
        card: { instanceId: entry.instanceId, name: entry.name ?? '' },
        side: entry.side ?? 'you',
        zone: entry.zone ?? 'hand',
        container: null,
      },
    ])
  );
}

test('isAuthoritativeDispatchActive: false with no context wired', () => {
  assert.equal(isAuthoritativeDispatchActive(), false);
});

test('isAuthoritativeDispatchActive: tracks systemState.serverAuthoritative', () => {
  const systemState = { serverAuthoritative: false };
  setAuthoritativeDispatchContext({ systemState });
  assert.equal(isAuthoritativeDispatchActive(), false);

  systemState.serverAuthoritative = true;
  assert.equal(isAuthoritativeDispatchActive(), true);
});

test('isAuthoritativeDispatchActive: options.systemState overrides the injected one', () => {
  setAuthoritativeDispatchContext({
    systemState: { serverAuthoritative: false },
  });
  assert.equal(
    isAuthoritativeDispatchActive({
      systemState: { serverAuthoritative: true },
    }),
    true
  );
});

test('resetAuthoritativeDispatchContext: clears the wired context', () => {
  setAuthoritativeDispatchContext({
    systemState: { serverAuthoritative: true },
    processAction: () => {},
  });
  resetAuthoritativeDispatchContext();
  assert.equal(isAuthoritativeDispatchActive(), false);
  assert.equal(emitAuthoritativeCommand('moveCardBundle', []), false);
});

test('buildAuthoritativeCardHint: resolves a registry card to a server-shaped hint', () => {
  const registry = stubRegistry([
    { instanceId: 7, name: 'Pikachu', zone: 'bench', side: 'you' },
  ]);
  assert.deepEqual(buildAuthoritativeCardHint(7, { registry }), {
    instanceId: 7,
    name: 'Pikachu',
    zone: 'bench',
    side: 'you',
  });
});

test('buildAuthoritativeCardHint: accepts a numeric string instanceId', () => {
  const registry = stubRegistry([{ instanceId: 7, name: 'Pikachu' }]);
  assert.equal(buildAuthoritativeCardHint('7', { registry })?.instanceId, 7);
});

// Design 003 edge case 1: stale click, or card removed by a concurrent server view.
test('Row 1: buildAuthoritativeCardHint returns null for a card absent from the registry', () => {
  const registry = stubRegistry([{ instanceId: 7 }]);
  assert.equal(buildAuthoritativeCardHint(99, { registry }), null);
});

test('Row 1: buildAuthoritativeCardHint returns null for null/undefined/non-integer ids', () => {
  const registry = stubRegistry([{ instanceId: 7 }]);
  assert.equal(buildAuthoritativeCardHint(null, { registry }), null);
  assert.equal(buildAuthoritativeCardHint(undefined, { registry }), null);
  assert.equal(buildAuthoritativeCardHint('not-a-number', { registry }), null);
  assert.equal(buildAuthoritativeCardHint(1.5, { registry }), null);
});

test('Row 1: buildAuthoritativeCardHint returns null against an empty registry', () => {
  assert.equal(buildAuthoritativeCardHint(7, { registry: new Map() }), null);
});

test('buildAuthoritativeCardHints: moving-only bundle omits target', () => {
  const registry = stubRegistry([{ instanceId: 7, name: 'Pikachu' }]);
  const hints = buildAuthoritativeCardHints({ moving: 7 }, { registry });
  assert.equal(hints.moving.instanceId, 7);
  assert.equal('target' in hints, false);
});

test('buildAuthoritativeCardHints: attach bundle carries both cards', () => {
  const registry = stubRegistry([
    { instanceId: 7, name: 'Lightning Energy' },
    { instanceId: 8, name: 'Pikachu' },
  ]);
  const hints = buildAuthoritativeCardHints(
    { moving: 7, target: 8 },
    { registry }
  );
  assert.equal(hints.moving.instanceId, 7);
  assert.equal(hints.target.instanceId, 8);
});

test('Row 1: buildAuthoritativeCardHints fails closed when the moving card is gone', () => {
  const registry = stubRegistry([{ instanceId: 8 }]);
  assert.equal(buildAuthoritativeCardHints({ moving: 7 }, { registry }), null);
});

test('Row 1: buildAuthoritativeCardHints fails closed as a unit when only the target is gone', () => {
  const registry = stubRegistry([{ instanceId: 7 }]);
  assert.equal(
    buildAuthoritativeCardHints({ moving: 7, target: 99 }, { registry }),
    null
  );
});

test('emitAuthoritativeCommand: hands a translatable action to processAction', () => {
  const calls = [];
  setAuthoritativeDispatchContext({
    processAction: (...args) => calls.push(args),
  });

  const parameters = [
    'self',
    'hand',
    'bench',
    0,
    false,
    'move',
    { moving: { instanceId: 7, name: 'Pikachu', zone: 'hand', side: 'you' } },
  ];
  assert.equal(emitAuthoritativeCommand('moveCardBundle', parameters), true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ['self', true, 'moveCardBundle', parameters]);
});

test('emitAuthoritativeCommand: no-ops when no processAction is wired', () => {
  const parameters = [
    'self',
    'hand',
    'bench',
    0,
    false,
    'move',
    { moving: { instanceId: 7 } },
  ];
  assert.equal(emitAuthoritativeCommand('moveCardBundle', parameters), false);
});

test('emitAuthoritativeCommand: rejects a missing or non-string action name', () => {
  setAuthoritativeDispatchContext({ processAction: () => {} });
  assert.equal(emitAuthoritativeCommand('', []), false);
  assert.equal(emitAuthoritativeCommand(null, []), false);
  assert.equal(emitAuthoritativeCommand(42, []), false);
});

// Fail-open: an untranslatable action must NOT be swallowed — the gated call site is told
// "not dispatched" so it falls through to its legacy body (slice 0 deviation).
test('emitAuthoritativeCommand: returns false without emitting when translation yields null', () => {
  let called = false;
  setAuthoritativeDispatchContext({
    processAction: () => {
      called = true;
    },
  });

  // 'changeCardBack' is disposition client_local: translateActionToCmd returns null for it
  // by design, permanently. Nothing must reach processAction through this path.
  assert.equal(
    emitAuthoritativeCommand('changeCardBack', ['self', 'x']),
    false
  );
  assert.equal(called, false);
});

// dual-run-bridge.js deliberately throws in dev-like environments for an action with no
// DISPOSITION_TABLE entry (its edge case 14: "must never silently no-op"). This module does
// not swallow that — a missing classification is a build-time bug, not a runtime fallback.
test('emitAuthoritativeCommand: propagates the unclassified-action error rather than hiding it', () => {
  setAuthoritativeDispatchContext({ processAction: () => {} });
  assert.throws(
    () => emitAuthoritativeCommand('notARealAction', ['self']),
    /no DISPOSITION_TABLE entry/
  );
});

test('emitAuthoritativeCommand: returns false when a known action carries unresolvable hints', () => {
  let called = false;
  setAuthoritativeDispatchContext({
    processAction: () => {
      called = true;
    },
  });

  // syncInstance with no instanceMap set: translateActionToCmd fails closed to null.
  const parameters = [
    'self',
    'hand',
    'bench',
    0,
    false,
    'move',
    { moving: { syncInstance: 3 } },
  ];
  assert.equal(emitAuthoritativeCommand('moveCardBundle', parameters), false);
  assert.equal(called, false);
});

test('emitAuthoritativeCommand: options.translate overrides the real translator', () => {
  const calls = [];
  assert.equal(
    emitAuthoritativeCommand('anything', ['x'], {
      processAction: (...args) => calls.push(args),
      translate: () => ({ type: 'moveCard', payload: {} }),
    }),
    true
  );
  assert.deepEqual(calls[0], ['self', true, 'anything', ['x']]);
});

// --- Slice 1: readCardInstanceId ------------------------------------------------

test('readCardInstanceId: reads the renderer stamp off the element itself', () => {
  assert.equal(readCardInstanceId({ dataset: { instanceId: '42' } }), 42);
});

test('readCardInstanceId: walks up to the nearest stamped ancestor', () => {
  const wrapper = { dataset: { instanceId: '7' } };
  const target = {
    dataset: {},
    closest: (selector) =>
      selector === '[data-instance-id]' ? wrapper : null,
  };
  assert.equal(readCardInstanceId(target), 7);
});

test('readCardInstanceId: null for a legacy-rendered card, empty stamp, or no element', () => {
  assert.equal(readCardInstanceId(null), null);
  assert.equal(readCardInstanceId({}), null);
  assert.equal(readCardInstanceId({ dataset: {} }), null);
  assert.equal(readCardInstanceId({ dataset: { instanceId: '' } }), null);
  assert.equal(readCardInstanceId({ dataset: { instanceId: 'abc' } }), null);
});

// --- Slice 1: dispatchAuthoritativeMoveCardBundle --------------------------------

const ALWAYS_TRANSLATES = () => ({ type: 'moveCard', payload: {} });

/** A locally-initiated hand→bench move of instanceId 5, with test seams attached. */
function moveParams(overrides = {}) {
  return {
    user: 'self',
    emit: true,
    cardHints: null,
    oZoneId: 'hand',
    dZoneId: 'bench',
    index: 0,
    targetIndex: false,
    action: 'move',
    authoritativeIds: { moving: 5 },
    ...overrides,
  };
}

function moveOptions(overrides = {}) {
  return {
    systemState: { serverAuthoritative: true },
    registry: stubRegistry([{ instanceId: 5, name: 'Popplio', zone: 'hand' }]),
    translate: ALWAYS_TRANSLATES,
    processAction: () => {},
    ...overrides,
  };
}

test('moveCardBundle gate: dispatches a locally-initiated move and skips the legacy body', () => {
  const calls = [];
  const dispatched = dispatchAuthoritativeMoveCardBundle(
    moveParams(),
    moveOptions({ processAction: (...args) => calls.push(args) })
  );

  assert.equal(dispatched, true);
  assert.equal(calls.length, 1);
  const [user, emit, action, parameters] = calls[0];
  assert.equal(user, 'self');
  assert.equal(emit, true);
  assert.equal(action, 'moveCardBundle');
  assert.deepEqual(parameters, [
    'opp',
    'hand',
    'bench',
    0,
    false,
    'move',
    { moving: { instanceId: 5, name: 'Popplio', zone: 'hand', side: 'you' } },
  ]);
});

test('moveCardBundle gate: no room refuses with one chat line and sends nothing (design 090 row 4)', () => {
  let called = false;
  const notes = [];
  const dispatched = dispatchAuthoritativeMoveCardBundle(
    moveParams(),
    moveOptions({
      systemState: NO_ROOM,
      notify: (text) => notes.push(text),
      processAction: () => {
        called = true;
      },
    })
  );

  assert.equal(dispatched, true, 'refused: the caller stops, it does not run a local body');
  assert.equal(called, false);
  assert.deepEqual(notes, [NO_ROOM_MESSAGE]);
});

test('moveCardBundle gate: relayed mirror-apply is not gated', () => {
  // emit false + hints = acceptAction replaying the opponent's own move.
  assert.equal(
    dispatchAuthoritativeMoveCardBundle(
      moveParams({ emit: false, cardHints: { moving: { syncInstance: 1 } } }),
      moveOptions()
    ),
    false
  );
  // A self-directed relay (owner applying an opponent's requestAction) carries hints too.
  assert.equal(
    dispatchAuthoritativeMoveCardBundle(
      moveParams({ cardHints: { moving: { syncInstance: 1 } } }),
      moveOptions()
    ),
    false
  );
});

test('moveCardBundle gate: acting on the opponent zone is not gated', () => {
  assert.equal(
    dispatchAuthoritativeMoveCardBundle(
      moveParams({ user: 'opp' }),
      moveOptions()
    ),
    false
  );
});

test('design 074 D7: a solo room dispatches the far side\'s move as the far side', () => {
  const calls = [];
  const dispatched = dispatchAuthoritativeMoveCardBundle(
    moveParams({ user: 'opp' }),
    moveOptions({
      systemState: { serverAuthoritative: true, solo: true },
      processAction: (...args) => calls.push(args),
    })
  );
  assert.equal(dispatched, true);
  assert.equal(calls[0][0], 'opp', 'processAction learns the acting side, which names the seat');
  assert.equal(calls[0][3][0], 'self', 'the relay initiator is the other side, as for self');
});

test('design 074 D7: actsForSide is self everywhere and opp only in a solo room', () => {
  assert.equal(actsForSide('self', { systemState: {} }), true);
  assert.equal(actsForSide('opp', { systemState: { solo: false } }), false);
  assert.equal(actsForSide('opp', { systemState: { solo: true } }), true);
  assert.equal(actsForSide('spectator', { systemState: { solo: true } }), false);
});

test('design 074 D7: the action and ability gates act for the far side in a solo room', () => {
  const calls = [];
  const options = {
    systemState: { serverAuthoritative: true, solo: true },
    translate: ALWAYS_TRANSLATES,
    processAction: (...args) => calls.push(args),
  };
  assert.equal(
    dispatchAuthoritativeAction('attack', { user: 'opp', emit: true, commandArgs: [0, null] }, options),
    true
  );
  assert.equal(
    dispatchAuthoritativeUseAbility(
      { user: 'opp', emit: true, oInitiator: 'self', zoneId: 'active', index: 0, authoritativeId: 5 },
      { ...options, registry: stubRegistry([{ instanceId: 5, name: 'Popplio', zone: 'active', side: 'them' }]) }
    ),
    true
  );
  assert.deepEqual(calls.map((call) => call[0]), ['opp', 'opp']);
});

test('moveCardBundle gate: unidentifiable moving card falls through to legacy', () => {
  let called = false;
  const dispatched = dispatchAuthoritativeMoveCardBundle(
    moveParams({ authoritativeIds: { moving: null } }),
    moveOptions({
      processAction: () => {
        called = true;
      },
    })
  );

  assert.equal(dispatched, false);
  assert.equal(called, false);
});

test('moveCardBundle gate: evolve/attach resolves the target, and fails closed if it cannot', () => {
  const registry = stubRegistry([
    { instanceId: 5, name: 'Popplio', zone: 'hand' },
    { instanceId: 9, name: 'Brionne', zone: 'bench' },
  ]);
  const calls = [];
  const dispatched = dispatchAuthoritativeMoveCardBundle(
    moveParams({
      action: 'evolve',
      targetIndex: 1,
      authoritativeIds: { moving: 5, target: 9 },
    }),
    moveOptions({ registry, processAction: (...args) => calls.push(args) })
  );

  assert.equal(dispatched, true);
  assert.deepEqual(calls[0][3][6], {
    moving: { instanceId: 5, name: 'Popplio', zone: 'hand', side: 'you' },
    target: { instanceId: 9, name: 'Brionne', zone: 'bench', side: 'you' },
  });

  // Target absent from the registry: the whole bundle fails, no half-guessed command.
  let called = false;
  assert.equal(
    dispatchAuthoritativeMoveCardBundle(
      moveParams({ authoritativeIds: { moving: 5, target: 404 } }),
      moveOptions({
        registry,
        processAction: () => {
          called = true;
        },
      })
    ),
    false
  );
  assert.equal(called, false);
});

test('moveCardBundle gate: untranslatable action falls through instead of losing the move', () => {
  let called = false;
  const dispatched = dispatchAuthoritativeMoveCardBundle(
    moveParams(),
    moveOptions({
      translate: () => null,
      processAction: () => {
        called = true;
      },
    })
  );

  assert.equal(dispatched, false);
  assert.equal(called, false);
});

// --- Slice 2: dispatchAuthoritativeZoneOp -----------------------------------------

function zoneOpOptions(overrides = {}) {
  return {
    systemState: { serverAuthoritative: true },
    translate: () => ({ type: 'shuffleZone', payload: {} }),
    processAction: () => {},
    ...overrides,
  };
}

test('zoneOp gate: dispatches a locally-initiated call, prefixing oInitiator onto commandArgs', () => {
  const calls = [];
  const dispatched = dispatchAuthoritativeZoneOp(
    'discardAll',
    { user: 'self', emit: true, oInitiator: 'opp', commandArgs: ['hand'] },
    zoneOpOptions({ processAction: (...args) => calls.push(args) })
  );

  assert.equal(dispatched, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ['self', true, 'discardAll', ['opp', 'hand']]);
});

test('zoneOp gate: no room refuses with one chat line and sends nothing (design 090 row 4)', () => {
  let called = false;
  const notes = [];
  const dispatched = dispatchAuthoritativeZoneOp(
    'discardAll',
    { user: 'self', emit: true, oInitiator: 'opp', commandArgs: ['hand'] },
    zoneOpOptions({
      systemState: NO_ROOM,
      notify: (text) => notes.push(text),
      processAction: () => {
        called = true;
      },
    })
  );

  assert.equal(dispatched, true, 'refused: the caller stops, it does not run a local body');
  assert.equal(called, false);
  assert.deepEqual(notes, [NO_ROOM_MESSAGE]);
});

test('zoneOp gate: relayed mirror-apply (emit false) is not gated', () => {
  let called = false;
  const dispatched = dispatchAuthoritativeZoneOp(
    'shuffleZone',
    { user: 'self', emit: false, oInitiator: 'opp', commandArgs: ['deck'] },
    zoneOpOptions({
      processAction: () => {
        called = true;
      },
    })
  );

  assert.equal(dispatched, false);
  assert.equal(called, false);
});

test('zoneOp gate: acting on the opponent zone is not gated', () => {
  let called = false;
  const dispatched = dispatchAuthoritativeZoneOp(
    'handAll',
    { user: 'opp', emit: true, oInitiator: 'self', commandArgs: ['bench'] },
    zoneOpOptions({
      processAction: () => {
        called = true;
      },
    })
  );

  assert.equal(dispatched, false);
  assert.equal(called, false);
});

test('zoneOp gate: untranslatable action falls through instead of losing the action', () => {
  let called = false;
  const dispatched = dispatchAuthoritativeZoneOp(
    'lostZoneAll',
    { user: 'self', emit: true, oInitiator: 'opp', commandArgs: ['discard'] },
    zoneOpOptions({
      translate: () => null,
      processAction: () => {
        called = true;
      },
    })
  );

  assert.equal(dispatched, false);
  assert.equal(called, false);
});

// -- design 003 slice 5: attack / retreat / stadium-effect / useAbility --------

/** Options for the identity-free family gate (attack, retreat, stadium-effect). */
function actionOptions(overrides = {}) {
  return {
    systemState: { serverAuthoritative: true },
    translate: () => ({ type: 'attack', payload: { attackIndex: 0 } }),
    processAction: () => {},
    ...overrides,
  };
}

test('action gate: attack forwards commandArgs verbatim, with no oInitiator prefix', () => {
  const calls = [];
  const rngBundle = { coin: 'heads' };
  const dispatched = dispatchAuthoritativeAction(
    'attack',
    { user: 'self', emit: true, commandArgs: [2, rngBundle] },
    actionOptions({ processAction: (...args) => calls.push(args) })
  );

  assert.equal(dispatched, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ['self', true, 'attack', [2, rngBundle]]);
});

test('action gate: retreat dispatches with an empty parameter list', () => {
  const calls = [];
  const dispatched = dispatchAuthoritativeAction(
    'retreat',
    { user: 'self', emit: true, commandArgs: [] },
    actionOptions({ processAction: (...args) => calls.push(args) })
  );

  assert.equal(dispatched, true);
  assert.deepEqual(calls[0], ['self', true, 'retreat', []]);
});

test('action gate: stadium-effect carries its payload through unchanged', () => {
  const calls = [];
  const payload = { action: 'search-evolve' };
  const dispatched = dispatchAuthoritativeAction(
    'stadium-effect',
    { user: 'self', emit: true, commandArgs: [payload] },
    actionOptions({ processAction: (...args) => calls.push(args) })
  );

  assert.equal(dispatched, true);
  assert.deepEqual(calls[0], ['self', true, 'stadium-effect', [payload]]);
});

test('action gate: no room refuses with one chat line and sends nothing (design 090 row 4)', () => {
  let called = false;
  const notes = [];
  const dispatched = dispatchAuthoritativeAction(
    'attack',
    { user: 'self', emit: true, commandArgs: [0, null] },
    actionOptions({
      systemState: NO_ROOM,
      notify: (text) => notes.push(text),
      processAction: () => {
        called = true;
      },
    })
  );

  assert.equal(dispatched, true, 'refused: the caller stops, it does not run a local body');
  assert.equal(called, false);
  assert.deepEqual(notes, [NO_ROOM_MESSAGE]);
});

test('action gate: relayed mirror-apply (emit false) is not gated', () => {
  let called = false;
  const dispatched = dispatchAuthoritativeAction(
    'retreat',
    { user: 'self', emit: false, commandArgs: [] },
    actionOptions({
      processAction: () => {
        called = true;
      },
    })
  );

  assert.equal(dispatched, false);
  assert.equal(called, false);
});

test('action gate: acting on the opponent side is not gated', () => {
  let called = false;
  const dispatched = dispatchAuthoritativeAction(
    'attack',
    { user: 'opp', emit: true, commandArgs: [0, null] },
    actionOptions({
      processAction: () => {
        called = true;
      },
    })
  );

  assert.equal(dispatched, false);
  assert.equal(called, false);
});

test('action gate: untranslatable action falls through instead of losing the action', () => {
  let called = false;
  const dispatched = dispatchAuthoritativeAction(
    'stadium-effect',
    { user: 'self', emit: true, commandArgs: [{}] },
    actionOptions({
      translate: () => null,
      processAction: () => {
        called = true;
      },
    })
  );

  assert.equal(dispatched, false);
  assert.equal(called, false);
});

/** Options for the useAbility gate, which does resolve card identity. */
function useAbilityOptions(overrides = {}) {
  return {
    systemState: { serverAuthoritative: true },
    registry: stubRegistry([
      { instanceId: 42, name: 'Gardevoir ex', zone: 'active', side: 'you' },
    ]),
    translate: () => ({
      type: 'useAbility',
      payload: { instanceId: 42, abilityIndex: 0 },
    }),
    processAction: () => {},
    ...overrides,
  };
}

test('useAbility gate: dispatches with a registry-resolved hint in the legacy slot', () => {
  const calls = [];
  const dispatched = dispatchAuthoritativeUseAbility(
    {
      user: 'self',
      emit: true,
      incomingHint: null,
      oInitiator: 'opp',
      zoneId: 'active',
      index: 0,
      authoritativeId: 42,
    },
    useAbilityOptions({ processAction: (...args) => calls.push(args) })
  );

  assert.equal(dispatched, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [
    'self',
    true,
    'useAbility',
    [
      'opp',
      'active',
      0,
      { instanceId: 42, name: 'Gardevoir ex', zone: 'active', side: 'you' },
    ],
  ]);
});

test('useAbility gate: a card missing from the registry falls through (edge case 1)', () => {
  let called = false;
  const dispatched = dispatchAuthoritativeUseAbility(
    {
      user: 'self',
      emit: true,
      oInitiator: 'opp',
      zoneId: 'bench',
      index: 1,
      authoritativeId: 999,
    },
    useAbilityOptions({
      processAction: () => {
        called = true;
      },
    })
  );

  assert.equal(dispatched, false);
  assert.equal(called, false);
});

test('useAbility gate: a legacy-rendered card (no captured id) falls through', () => {
  let called = false;
  const dispatched = dispatchAuthoritativeUseAbility(
    {
      user: 'self',
      emit: true,
      oInitiator: 'opp',
      zoneId: 'active',
      index: 0,
      authoritativeId: null,
    },
    useAbilityOptions({
      processAction: () => {
        called = true;
      },
    })
  );

  assert.equal(dispatched, false);
  assert.equal(called, false);
});

test('useAbility gate: a relayed call carrying an incoming hint is not gated', () => {
  let called = false;
  const dispatched = dispatchAuthoritativeUseAbility(
    {
      user: 'self',
      emit: true,
      incomingHint: { syncInstance: 7 },
      oInitiator: 'opp',
      zoneId: 'active',
      index: 0,
      authoritativeId: 42,
    },
    useAbilityOptions({
      processAction: () => {
        called = true;
      },
    })
  );

  assert.equal(dispatched, false);
  assert.equal(called, false);
});

test('useAbility gate: no room refuses with one chat line and sends nothing (design 090 row 4)', () => {
  let called = false;
  const notes = [];
  const dispatched = dispatchAuthoritativeUseAbility(
    {
      user: 'self',
      emit: true,
      oInitiator: 'opp',
      zoneId: 'active',
      index: 0,
      authoritativeId: 42,
    },
    useAbilityOptions({
      systemState: NO_ROOM,
      notify: (text) => notes.push(text),
      processAction: () => {
        called = true;
      },
    })
  );

  assert.equal(dispatched, true, 'refused: the caller stops, it does not run a local body');
  assert.equal(called, false);
  assert.deepEqual(notes, [NO_ROOM_MESSAGE]);
});

test('useAbility gate: acting on the opponent side is not gated', () => {
  let called = false;
  const dispatched = dispatchAuthoritativeUseAbility(
    {
      user: 'opp',
      emit: true,
      oInitiator: 'self',
      zoneId: 'active',
      index: 0,
      authoritativeId: 42,
    },
    useAbilityOptions({
      processAction: () => {
        called = true;
      },
    })
  );

  assert.equal(dispatched, false);
  assert.equal(called, false);
});

test('useAbility gate: untranslatable action falls through instead of losing the action', () => {
  let called = false;
  const dispatched = dispatchAuthoritativeUseAbility(
    {
      user: 'self',
      emit: true,
      oInitiator: 'opp',
      zoneId: 'active',
      index: 0,
      authoritativeId: 42,
    },
    useAbilityOptions({
      translate: () => null,
      processAction: () => {
        called = true;
      },
    })
  );

  assert.equal(dispatched, false);
  assert.equal(called, false);
});

// -- design 003 closing I21: relay-mirror suppression ---------------------------

test('isMirrorSuppressedAction: true for a server_command action', () => {
  assert.equal(isMirrorSuppressedAction('moveCardBundle'), true);
  assert.equal(isMirrorSuppressedAction('attack'), true);
  assert.equal(isMirrorSuppressedAction('discardAll'), true);
});

test('isMirrorSuppressedAction: true for a manual_override action', () => {
  assert.equal(isMirrorSuppressedAction('addDamageCounter'), true);
  assert.equal(isMirrorSuppressedAction('rotateCard'), true);
});

test('isMirrorSuppressedAction: false for server_lifecycle/replaced/relay-only actions', () => {
  assert.equal(isMirrorSuppressedAction('setup'), false);
  assert.equal(isMirrorSuppressedAction('changeCardBack'), false);
  assert.equal(isMirrorSuppressedAction('viewDeck'), false);
});

test('isMirrorSuppressedAction: false for an unclassified action (fail open)', () => {
  assert.equal(isMirrorSuppressedAction('notARealAction'), false);
});

// -- design 090: no-room refusal and in-room gate misses ----------------------------

/** Collects the log entries `fn` writes. */
function logged(fn) {
  const seen = [];
  const off = onEntry((entry) => seen.push(entry));
  try {
    fn();
  } finally {
    off();
  }
  return seen;
}

test('isInRoom: seated in a room, solo, or watching; not in the lobby or before the join ack', () => {
  assert.equal(isInRoom({ systemState: NO_ROOM }), false);
  assert.equal(isInRoom({ systemState: { roomId: 'solo-abcd1234' } }), false);
  assert.equal(isInRoom({ systemState: { serverAuthoritative: true } }), true);
  assert.equal(isInRoom({ systemState: { solo: true } }), true);
  assert.equal(isInRoom({ systemState: { isTwoPlayer: true } }), true);
  assert.equal(isInRoom(), false);
});

test('refuseWithoutRoom: refuses and logs dispatch.refused in no room, never in a room', () => {
  const notes = [];
  const entries = logged(() => {
    assert.equal(
      refuseWithoutRoom({ systemState: NO_ROOM, action: 'undo', notify: (t) => notes.push(t) }),
      true
    );
  });
  assert.deepEqual(notes, [NO_ROOM_MESSAGE]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].ev, 'dispatch.refused');
  assert.equal(
    refuseWithoutRoom({ systemState: { solo: true }, notify: (t) => notes.push(t) }),
    false
  );
  assert.equal(notes.length, 1);
});

test('refuseWithoutRoom: nothing is refused while no systemState is wired (module tests)', () => {
  assert.equal(refuseWithoutRoom({ notify: () => assert.fail('must not post') }), false);
});

test('refuseWithoutRoom: one chat line per user action, a later action gets its own', () => {
  const notes = [];
  let clock = 10_000;
  const options = { systemState: NO_ROOM, notify: (t) => notes.push(t), now: () => clock };
  refuseWithoutRoom(options);
  refuseWithoutRoom(options);
  clock += 200;
  refuseWithoutRoom(options);
  assert.equal(notes.length, 1);
  clock += 5_000;
  refuseWithoutRoom(options);
  assert.equal(notes.length, 2);
});

test('a board-wide action that reaches several gates in no room posts one line', () => {
  const notes = [];
  const options = { systemState: NO_ROOM, notify: (t) => notes.push(t), now: () => 1 };
  dispatchAuthoritativeZoneOp('discardAll', { user: 'self', emit: true, oInitiator: 'opp' }, options);
  dispatchAuthoritativeMoveCardBundle(moveParams(), options);
  dispatchAuthoritativeAction('revealCards', { user: 'self', emit: true, commandArgs: ['hand'] }, options);
  assert.deepEqual(notes, [NO_ROOM_MESSAGE]);
});

test('no room: a relayed mirror-apply (emit false) is not refused and keeps its local body', () => {
  const options = { systemState: NO_ROOM, notify: () => assert.fail('must not post') };
  assert.equal(
    dispatchAuthoritativeZoneOp('discardAll', { user: 'opp', emit: false, oInitiator: 'self' }, options),
    false
  );
  assert.equal(
    dispatchAuthoritativeAction('attack', { user: 'opp', emit: false, commandArgs: [] }, options),
    false
  );
  assert.equal(dispatchAuthoritativeMoveCardBundle(moveParams({ emit: false, cardHints: {} }), options), false);
  assert.equal(
    dispatchAuthoritativeUseAbility(
      { user: 'opp', emit: false, incomingHint: { instanceId: 1 }, oInitiator: 'self', zoneId: 'active', index: 0 },
      options
    ),
    false
  );
});

test('emitAuthoritativeCommand: no room refuses (true) and never reaches processAction', () => {
  const notes = [];
  const sent = emitAuthoritativeCommand('shuffleZone', ['opp', 'deck'], {
    systemState: NO_ROOM,
    processAction: () => assert.fail('must not send'),
    translate: ALWAYS_TRANSLATES,
    notify: (t) => notes.push(t),
  });
  assert.equal(sent, true);
  assert.deepEqual(notes, [NO_ROOM_MESSAGE]);
});

test('gate miss in a room: a zone op still returns false so its kept local body runs', () => {
  const notes = [];
  const dispatched = dispatchAuthoritativeZoneOp(
    'discardAll',
    { user: 'self', emit: true, oInitiator: 'opp', commandArgs: ['hand'] },
    zoneOpOptions({ translate: () => null, notify: (t) => notes.push(t) })
  );
  assert.equal(dispatched, false);
  assert.deepEqual(notes, []);
});

test('gate miss in a room: failClosed refuses an untranslatable action, logs dispatch.refused, no local run (design 090 row 5)', () => {
  const notes = [];
  let sent = false;
  const entries = logged(() => {
    const dispatched = dispatchAuthoritativeAction(
      'attack',
      { user: 'self', emit: true, commandArgs: [0, null], failClosed: true },
      actionOptions({
        translate: () => null,
        processAction: () => {
          sent = true;
        },
        notify: (t) => notes.push(t),
      })
    );
    assert.equal(dispatched, true);
  });
  assert.equal(sent, false);
  assert.deepEqual(notes, [DISPATCH_MISS_MESSAGE]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].ev, 'dispatch.refused');
  assert.equal(JSON.parse(entries[0].line).d.reason, 'not_dispatched');
});

test('gate miss in a room: failClosed refuses an ability on an unregistered card (design 090 row 5)', () => {
  const notes = [];
  const entries = logged(() => {
    const dispatched = dispatchAuthoritativeUseAbility(
      {
        user: 'self',
        emit: true,
        incomingHint: null,
        oInitiator: 'opp',
        zoneId: 'active',
        index: 0,
        authoritativeId: 999,
        failClosed: true,
      },
      useAbilityOptions({
        processAction: () => assert.fail('must not send'),
        notify: (t) => notes.push(t),
      })
    );
    assert.equal(dispatched, true);
  });
  assert.deepEqual(notes, [DISPATCH_MISS_MESSAGE]);
  assert.equal(entries[0].ev, 'dispatch.refused');
  assert.equal(JSON.parse(entries[0].line).d.reason, 'unregistered_card');
});

test('gate miss in a room: without failClosed an ability on an unregistered card still returns false', () => {
  const dispatched = dispatchAuthoritativeUseAbility(
    { user: 'self', emit: true, incomingHint: null, oInitiator: 'opp', zoneId: 'active', index: 0, authoritativeId: 999 },
    useAbilityOptions({ notify: () => assert.fail('must not post') })
  );
  assert.equal(dispatched, false);
});
