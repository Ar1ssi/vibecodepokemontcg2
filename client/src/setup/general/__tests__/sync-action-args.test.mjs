import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deckDataEquals,
  flipCoin,
  parseAttackArgs,
  parseRetreatArgs,
  rngFromCoin,
  splitEmitAndTail,
  isMirrorReplayCall,
} from '../sync-action-args.mjs';
import { hashBoardSnapshot, hashCardList } from '../../../../../shared/engine/zones/zone-hash.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { shouldAnimateDrawFlight } from '../../image-logic/draw-flight-predicate.mjs';

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

test('parseRetreatArgs: local (emit, image) and acceptAction (benchIndex, emit)', () => {
  const image = { tagName: 'IMG' };
  assert.deepEqual(parseRetreatArgs(true, image), { target: image, emit: true });
  assert.deepEqual(parseRetreatArgs(true, null), { target: null, emit: true });
  assert.deepEqual(parseRetreatArgs(undefined, undefined), { target: null, emit: true });
  // I30: acceptAction calls fn(user, ...parameters, emit) — a bench index parameter must
  // not be mistaken for the emit flag, and must survive the peer replay intact.
  assert.deepEqual(parseRetreatArgs(3, true), { target: 3, emit: true });
  assert.deepEqual(parseRetreatArgs(0, false), { target: 0, emit: false });
});

test('rngFromCoin is deterministic for heads and tails', () => {
  assert.equal(rngFromCoin('heads')() < 0.5, true);
  assert.equal(rngFromCoin('tails')() < 0.5, false);
});

test('flipCoin stores and replays the same face', () => {
  const bundle = {};
  const coin1 = flipCoin(bundle, 'wake');
  const coin2 = flipCoin(bundle, 'wake');
  assert.equal(coin1, coin2);
  assert.equal(['heads', 'tails'].includes(coin1), true);
  assert.equal(bundle.wake, coin1);
});

test('deckDataEquals matches identical arrays of deck card tuples', () => {
  const a = [['Pikachu', 'src1'], ['Raichu', 'src2']];
  const b = [['Pikachu', 'src1'], ['Raichu', 'src2']];
  const c = [['Pikachu', 'src1'], ['Raichu', 'src3']];
  assert.equal(deckDataEquals(a, b), true);
  assert.equal(deckDataEquals(a, c), false);
  assert.equal(deckDataEquals(a, null), false);
  assert.equal(deckDataEquals(null, null), true);
});

test('hashBoardSnapshot matches across duplicate calls', () => {
  const zones = {
    active: { array: [{ name: 'Pikachu', syncInstance: 0 }] },
    bench: { array: [] },
    hand: { array: [{ name: 'Popplio', syncInstance: 1 }] },
    discard: { array: [] },
  };
  assert.equal(hashBoardSnapshot(zones), hashBoardSnapshot(zones));
  assert.equal(typeof hashBoardSnapshot(zones), 'string');
});

test('hashBoardSnapshot differs when a card moves', () => {
  const h1 = hashBoardSnapshot({
    active: { array: [{ name: 'Pikachu', syncInstance: 0 }] },
    hand: { array: [] },
  });
  const h2 = hashBoardSnapshot({
    active: { array: [] },
    hand: { array: [{ name: 'Pikachu', syncInstance: 0 }] },
  });
  assert.notEqual(h1, h2);
});

test('hashCardList changes when counter fields change', () => {
  const base = [{ name: 'Pikachu', syncInstance: 0 }];
  const withDamage = [{ name: 'Pikachu', syncInstance: 0, damage: 30 }];
  const withStatus = [
    { name: 'Pikachu', syncInstance: 0, specialCondition: 'Asleep' },
  ];
  const withAbility = [{ name: 'Pikachu', syncInstance: 0, abilityUsed: true }];
  const baseHash = hashCardList(base);
  assert.notEqual(hashCardList(withDamage), baseHash);
  assert.notEqual(hashCardList(withStatus), baseHash);
  assert.notEqual(hashCardList(withAbility), baseHash);
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
  const { abilityKey } = await import('../../../../../shared/engine/rules/rules-state.mjs');
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

test('I30: retreat broadcasts the resolved bench index instead of an empty parameter list', () => {
  const path = fileURLToPath(
    new URL('../../../actions/chat-buttons/chat-buttons.js', import.meta.url)
  );
  const src = readFileSync(path, 'utf8');
  const start = src.indexOf('export const retreat =');
  assert.ok(start >= 0, 'retreat export');
  const next = src.indexOf('\nexport const ', start + 1);
  const body = src.slice(start, next === -1 ? undefined : next);
  assert.match(
    body,
    /processAction\(user, emit, 'retreat', \[resolvedBenchIdx\]\)/,
    "retreat's final processAction call must send the chosen bench index, or the peer's " +
      'replay always defaults to the first bench Pokémon (I30)'
  );
});

test('rotateCard broadcasts newRotation in action payload', () => {
  const path = fileURLToPath(
    new URL('../../../actions/general/rotate-card.js', import.meta.url)
  );
  const src = readFileSync(path, 'utf8');
  assert.match(src, /processAction\(user, emit, 'rotateCard', \[zoneId, index, single, newRotation\]\)/);
});

test('requestAction routes counter mismatches through the ordered queue, not a bypass', () => {
  const path = fileURLToPath(
    new URL('../../../initialization/socket-event-listeners/socket-event-listeners.js', import.meta.url)
  );
  const src = readFileSync(path, 'utf8');
  assert.doesNotMatch(src, /isCounterOrStatusAction/);
  assert.match(src, /admitRequestAction/);
  assert.match(src, /requestActionQueue\.buffer/);
});

test('socket-event-listeners registers visibilitychange and focus listeners', () => {
  const path = fileURLToPath(
    new URL('../../../initialization/socket-event-listeners/socket-event-listeners.js', import.meta.url)
  );
  const src = readFileSync(path, 'utf8');
  assert.match(src, /document\.addEventListener\('visibilitychange'/);
  assert.match(src, /window\.addEventListener\('focus'/);
  assert.match(src, /emitRequestView/);
});

test('shuffle flight animation skips when document is hidden', () => {
  const path = fileURLToPath(
    new URL('../../image-logic/shuffle-flight.js', import.meta.url)
  );
  const src = readFileSync(path, 'utf8');
  assert.match(src, /typeof document === 'undefined' \|\| document\.hidden/);
});




// ── I32 (mirror half), S87 ───────────────────────────────────────────────────
// A peer replaying the other client's retreat must not re-adjudicate legality.
// When it did, a gate disagreement made the mirror silently return, leaving the
// peer's board on the pre-retreat state with zero cmdRejected.
test('isMirrorReplayCall: a peer replaying the other client is a mirror replay', () => {
  assert.equal(
    isMirrorReplayCall({ emit: false, user: 'opp', isTwoPlayer: true }),
    true
  );
});

test('isMirrorReplayCall: a locally-initiated action is never a mirror replay', () => {
  // Own board, emitting.
  assert.equal(isMirrorReplayCall({ emit: true, user: 'self', isTwoPlayer: true }), false);
  // Own board, not emitting (e.g. an internal re-entrant call).
  assert.equal(isMirrorReplayCall({ emit: false, user: 'self', isTwoPlayer: true }), false);
  // Driving the opponent's board in 2P emits a requestAction — not a replay.
  assert.equal(isMirrorReplayCall({ emit: true, user: 'opp', isTwoPlayer: true }), false);
});

test('isMirrorReplayCall: one-player mode has no mirror to replay onto', () => {
  assert.equal(isMirrorReplayCall({ emit: false, user: 'opp', isTwoPlayer: false }), false);
});

test('isMirrorReplayCall: missing/garbage input is not a mirror replay', () => {
  assert.equal(isMirrorReplayCall(), false);
  assert.equal(isMirrorReplayCall({}), false);
  // Truthiness is not enough - only an explicit false/true pair counts.
  assert.equal(isMirrorReplayCall({ emit: 0, user: 'opp', isTwoPlayer: 1 }), false);
});
