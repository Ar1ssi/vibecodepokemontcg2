import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deckDataEquals,
  flipCoin,
  parseAttackArgs,
  rngFromCoin,
  splitEmitAndTail,
} from '../sync-action-args.mjs';
import { hashBoardSnapshot, hashCardList } from '../../zones/zone-hash.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  hashResyncKey,
  resetBoardResyncDedupe,
  shouldAnimateDrawFlight,
  shouldEmitBoardResync,
  shouldRequestBoardSnapshot,
  shouldRequestHashResync,
} from '../sync-replay.mjs';

test('splitEmitAndTail: local emit boolean stays emit', () => {
  assert.deepEqual(splitEmitAndTail(true), { emit: true, tail: null });
  assert.deepEqual(splitEmitAndTail(false), { emit: false, tail: null });
  assert.deepEqual(splitEmitAndTail(undefined), { emit: true, tail: null });
});

test('splitEmitAndTail: acceptAction (hints, false) does not treat hints as emit', () => {
  const hints = { moving: { name: 'Popplio', syncInstance: 1 } };
  const parsed = splitEmitAndTail(hints, false);
  assert.equal(parsed.emit, false);
  assert.equal(parsed.tail, hints);
});

test('parseAttackArgs: local (emit, index) and acceptAction (index, rng, emit)', () => {
  assert.deepEqual(parseAttackArgs(true, 2), {
    attackIndex: 2,
    rngBundle: {},
    emit: true,
  });
  assert.deepEqual(parseAttackArgs(false), {
    attackIndex: 0,
    rngBundle: {},
    emit: false,
  });
  const rng = { wake: 'heads' };
  assert.deepEqual(parseAttackArgs(1, rng, false), {
    attackIndex: 1,
    rngBundle: rng,
    emit: false,
  });
});

test('rngFromCoin is deterministic for heads and tails', () => {
  assert.equal(rngFromCoin('heads')() < 0.5, true);
  assert.equal(rngFromCoin('tails')() < 0.5, false);
});

test('flipCoin stores and replays the same face', () => {
  const bundle = {};
  const first = flipCoin(bundle, 'attack');
  assert.match(first, /^(heads|tails)$/);
  assert.equal(flipCoin(bundle, 'attack'), first);
});

test('deckDataEquals compares by value not reference', () => {
  const a = [[1, 'Pikachu', 'Pokémon']];
  const b = [[1, 'Pikachu', 'Pokémon']];
  assert.equal(deckDataEquals(a, b), true);
  assert.equal(deckDataEquals(a, [[1, 'Raichu', 'Pokémon']]), false);
  assert.equal(deckDataEquals(null, null), true);
});

test('zone hash is order-sensitive and identity-based', () => {
  const a = hashCardList([
    { name: 'Popplio', syncInstance: 1, number: '37' },
    { name: "Professor's Research", syncInstance: 2 },
  ]);
  const b = hashCardList([
    { name: "Professor's Research", syncInstance: 2 },
    { name: 'Popplio', syncInstance: 1, number: '37' },
  ]);
  assert.notEqual(a, b);
  assert.equal(
    hashBoardSnapshot({
      hand: [{ name: 'Popplio', syncInstance: 1 }],
      active: [],
    }),
    hashBoardSnapshot({
      active: { array: [] },
      hand: { array: [{ name: 'Popplio', syncInstance: 1 }] },
    })
  );
});

test('shouldAnimateDrawFlight: live draw animates, catch-up / syncReplay / hidden do not', () => {
  assert.equal(shouldAnimateDrawFlight({}), true);
  assert.equal(shouldAnimateDrawFlight({ syncReplay: false, syncReplaying: false }), true);
  assert.equal(shouldAnimateDrawFlight({ syncReplay: true }), false);
  assert.equal(shouldAnimateDrawFlight({ syncReplaying: true }), false);
  assert.equal(shouldAnimateDrawFlight({ syncReplay: true, syncReplaying: true }), false);
  assert.equal(shouldAnimateDrawFlight({ hidden: true }), false);
  assert.equal(shouldAnimateDrawFlight({ syncReplay: false, hidden: true }), false);
});

test('shouldRequestHashResync: one fullReplay per matching counter pair', () => {
  const first = shouldRequestHashResync(null, 11, 11);
  assert.equal(first.request, true);
  assert.equal(first.key, hashResyncKey(11, 11));
  assert.equal(shouldRequestHashResync(first.key, 11, 11).request, false);
  // A new action advances the pair — allow one more recovery attempt.
  const next = shouldRequestHashResync(first.key, 13, 13);
  assert.equal(next.request, true);
  assert.equal(next.key, '13:13');
  assert.equal(shouldRequestHashResync(next.key, 13, 13).request, false);
});

test('shouldEmitBoardResync: skip while catch-up is rebuilding the board', () => {
  resetBoardResyncDedupe();
  assert.equal(
    shouldEmitBoardResync({
      selfCounter: 56,
      oppCounter: 17,
      syncReplaying: true,
    }).request,
    false
  );
  assert.equal(
    shouldEmitBoardResync({
      selfCounter: 56,
      oppCounter: 17,
      isCatchingUp: true,
    }).skipped,
    'replaying'
  );
  const live = shouldEmitBoardResync({ selfCounter: 56, oppCounter: 17 });
  assert.equal(live.request, true);
  assert.equal(live.key, '56:17');
});

test('shouldEmitBoardResync: hint_mismatch and apply_failed share one slot', () => {
  resetBoardResyncDedupe();
  const hint = shouldEmitBoardResync({ selfCounter: 56, oppCounter: 17 });
  assert.equal(hint.request, true);
  // Same counters: the failed Darkrai drag would otherwise emit both
  // hint_mismatch and apply_failed, then each replay would emit again.
  const applyFailed = shouldEmitBoardResync({
    selfCounter: 56,
    oppCounter: 17,
  });
  assert.equal(applyFailed.request, false);
  const later = shouldEmitBoardResync({ selfCounter: 56, oppCounter: 19 });
  assert.equal(later.request, true);
  resetBoardResyncDedupe();
});

test('shouldRequestBoardSnapshot: one snapshot per pair, after replay may still fire', () => {
  resetBoardResyncDedupe();
  const replay = shouldEmitBoardResync({ selfCounter: 8, oppCounter: 4 });
  assert.equal(replay.request, true);
  assert.equal(
    shouldEmitBoardResync({ selfCounter: 8, oppCounter: 4 }).request,
    false
  );
  const snap = shouldRequestBoardSnapshot({ selfCounter: 8, oppCounter: 4 });
  assert.equal(snap.request, true);
  assert.equal(
    shouldRequestBoardSnapshot({ selfCounter: 8, oppCounter: 4 }).request,
    false
  );
  assert.equal(
    shouldRequestBoardSnapshot({
      selfCounter: 8,
      oppCounter: 4,
      isCatchingUp: true,
    }).skipped,
    'replaying'
  );
  resetBoardResyncDedupe();
});

test('drawOpeningHand emits when rules-bridge deals after the coin flip', () => {
  const handPath = fileURLToPath(
    new URL('../../../actions/zones/hand-actions.js', import.meta.url)
  );
  const handSrc = readFileSync(handPath, 'utf8');
  const start = handSrc.indexOf('export const drawOpeningHand');
  const next = handSrc.indexOf('\nexport const ', start + 1);
  const body = handSrc.slice(start, next === -1 ? undefined : next);
  assert.match(body, /processAction\(user, emit, 'drawOpeningHand'/);
  assert.match(body, /emit = false/);

  const bridgePath = fileURLToPath(
    new URL('../../rules/rules-bridge.js', import.meta.url)
  );
  const bridgeSrc = readFileSync(bridgePath, 'utf8');
  assert.match(
    bridgeSrc,
    /drawOpeningHand\('self', 'self', true\)/
  );
});

test('switchAbility relays active/bench swaps via moveCardBundle', () => {
  const path = fileURLToPath(
    new URL('../../../actions/chat-buttons/chat-buttons.js', import.meta.url)
  );
  const src = readFileSync(path, 'utf8');
  const start = src.indexOf('export const switchAbility');
  assert.ok(start >= 0, 'switchAbility export');
  const next = src.indexOf('\nexport const ', start + 1);
  const body = src.slice(start, next === -1 ? undefined : next);
  assert.match(body, /moveCardBundle\(/);
  assert.equal(
    [...body.matchAll(/(?<![\w])moveCard\(/g)].length,
    0,
    'switchAbility must not call raw moveCard (local-only, never emitted)'
  );
});

test('trainer-execution must not call raw moveCard (local-only, never emitted)', () => {
  const path = fileURLToPath(
    new URL('../../rules/trainer-execution.js', import.meta.url)
  );
  const src = readFileSync(path, 'utf8');
  const rawMoveMatches = [...src.matchAll(/(?<![\w])moveCard\(/g)];
  assert.equal(
    rawMoveMatches.length,
    0,
    'trainer-execution must not call raw moveCard directly — all moves must use moveCardBundle'
  );
});

test('catchUpActions does not wipe self board on fullReplay', () => {
  const path = fileURLToPath(
    new URL('../catch-up-actions.js', import.meta.url)
  );
  const src = readFileSync(path, 'utf8');
  assert.match(src, /reset\('opp', true, true, false, false\)/);
  assert.equal(
    src.includes("reset('self'"),
    false,
    'catchUpActions must never call reset(\'self\') during opponent catch-up'
  );
});

test('undoAsync executes sequentially rather than Promise.all concurrent race', () => {
  const path = fileURLToPath(
    new URL('../../../actions/general/undo.js', import.meta.url)
  );
  const src = readFileSync(path, 'utf8');
  assert.equal(
    src.includes('Promise.all'),
    false,
    'undoAsync must not use Promise.all for action replay'
  );
  assert.match(src, /for \(const data of replay\)/);
});

test('server events whitelist includes resetCounter', () => {
  const path = fileURLToPath(
    new URL('../../../../../server/server.js', import.meta.url)
  );
  const src = readFileSync(path, 'utf8');
  assert.match(src, /'resetCounter'/);
});

test('abilityKey differentiates duplicate cards when cardId or syncInstance differ', async () => {
  const { abilityKey } = await import('../../rules/rules-state.mjs');
  const cardA = { name: 'Bibarel', id: 'swsh9-121', cardId: 'bibarel-1', syncInstance: 1 };
  const cardB = { name: 'Bibarel', id: 'swsh9-121', cardId: 'bibarel-2', syncInstance: 2 };
  assert.notEqual(abilityKey(cardA), abilityKey(cardB));
  assert.equal(abilityKey(cardA), 'cardId:bibarel-1');
  assert.equal(abilityKey(cardB), 'cardId:bibarel-2');

  const cardC = { name: 'Kirlia', user: 'self', id: 'swsh12-68', syncInstance: 10 };
  const cardD = { name: 'Kirlia', user: 'self', id: 'swsh12-68', syncInstance: 11 };
  assert.notEqual(abilityKey(cardC), abilityKey(cardD));
  assert.equal(abilityKey(cardC), 'sync:self_10');
  assert.equal(abilityKey(cardD), 'sync:self_11');
});

test('attachAbility, energyRedirectAbility, and moveDamageAbility do not use raw moveCard', () => {
  const path = fileURLToPath(
    new URL('../../../actions/chat-buttons/chat-buttons.js', import.meta.url)
  );
  const src = readFileSync(path, 'utf8');
  for (const fnName of ['export const attachAbility', 'export const energyRedirectAbility', 'export const moveDamageAbility']) {
    const start = src.indexOf(fnName);
    assert.ok(start >= 0, `${fnName} export`);
    const next = src.indexOf('\nexport const ', start + 1);
    const body = src.slice(start, next === -1 ? undefined : next);
    assert.match(body, /moveCardBundle\(/, `${fnName} must use moveCardBundle`);
    assert.equal(
      [...body.matchAll(/(?<![\w])moveCard\(/g)].length,
      0,
      `${fnName} must not call raw moveCard (local-only, never emitted)`
    );
  }
});

test('discardEnergyScaling uses rngBundle.energyDiscarded on replay', () => {
  const path = fileURLToPath(
    new URL('../../../actions/chat-buttons/chat-buttons.js', import.meta.url)
  );
  const src = readFileSync(path, 'utf8');
  assert.match(src, /typeof rngBundle\.energyDiscarded === 'number'/);
});

test('rotateCard broadcasts newRotation in action payload', () => {
  const path = fileURLToPath(
    new URL('../../../actions/general/rotate-card.js', import.meta.url)
  );
  const src = readFileSync(path, 'utf8');
  assert.match(src, /processAction\(user, emit, 'rotateCard', \[zoneId, index, single, newRotation\]\)/);
});

test('requestAction accepts counter and status actions', () => {
  const path = fileURLToPath(
    new URL('../../../initialization/socket-event-listeners/socket-event-listeners.js', import.meta.url)
  );
  const src = readFileSync(path, 'utf8');
  assert.match(src, /isCounterOrStatusAction/);
});

test('socket-event-listeners registers visibilitychange and focus listeners', () => {
  const path = fileURLToPath(
    new URL('../../../initialization/socket-event-listeners/socket-event-listeners.js', import.meta.url)
  );
  const src = readFileSync(path, 'utf8');
  assert.match(src, /document\.addEventListener\('visibilitychange'/);
  assert.match(src, /window\.addEventListener\('focus'/);
  assert.match(src, /triggerSyncCheck\(50\)/);
});

test('shuffle flight animation skips when document is hidden', () => {
  const path = fileURLToPath(
    new URL('../../image-logic/shuffle-flight.js', import.meta.url)
  );
  const src = readFileSync(path, 'utf8');
  assert.match(src, /typeof document === 'undefined' \|\| document\.hidden/);
});



