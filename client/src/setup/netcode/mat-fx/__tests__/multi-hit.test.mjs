import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStrikeBook,
  HIT_SPREAD_MAX_MS,
  HIT_STEP_MS,
  MAX_BRANCH_LANES,
  hitDelayFor,
  hitDelaysOf,
  hitWaitMs,
  knockoutHoldMs,
  recoilVector,
  layoutHits,
} from '../multi-hit.mjs';
import { classifyHitOnce, peekHit, resetDamageBaselines, seedDamageBaselines } from '../damage-hit.mjs';
import { createImpactQueue } from '../combat-pose.mjs';

const card = (left, top = 0) => ({ left, top, width: 60, height: 84 });

test('layoutHits: nothing to hit is null; one target has no secondaries', () => {
  assert.equal(layoutHits([]), null);
  assert.equal(layoutHits(null), null);
  assert.equal(layoutHits([{ id: 1, rect: null, amount: 30 }]), null);
  assert.deepEqual(layoutHits([{ id: 20, rect: card(0), amount: 30, isDefender: true }]), {
    primaryId: 20,
    secondaries: [],
  });
});

test('layoutHits: a hit Active defender is primary; the Bench ripples out nearest first', () => {
  const layout = layoutHits([
    { id: 22, rect: card(300, 200), amount: 20 },
    { id: 20, rect: card(0), amount: 130, isDefender: true },
    { id: 21, rect: card(100, 200), amount: 20 },
  ]);
  assert.equal(layout.primaryId, 20);
  assert.deepEqual(layout.secondaries, [
    { id: 21, delayMs: HIT_STEP_MS, lane: true },
    { id: 22, delayMs: 2 * HIT_STEP_MS, lane: true },
  ]);
});

test('layoutHits: an undamaged defender is never primary; the most damaged card is (ties: first)', () => {
  const snipe = layoutHits([{ id: 22, rect: card(300, 200), amount: 30 }]);
  assert.equal(snipe.primaryId, 22);
  const spread = layoutHits([
    { id: 21, rect: card(100, 200), amount: 20 },
    { id: 22, rect: card(300, 200), amount: 40 },
    { id: 23, rect: card(500, 200), amount: 40 },
  ]);
  assert.equal(spread.primaryId, 22);
  const tie = layoutHits([
    { id: 21, rect: card(100, 200), amount: 20 },
    { id: 22, rect: card(300, 200), amount: 20 },
  ]);
  assert.equal(tie.primaryId, 21);
});

test('layoutHits: past the lane cap cards keep their hit but no lane; delays stop at the spread cap', () => {
  const targets = Array.from({ length: 8 }, (_, i) => ({
    id: i,
    rect: card(i * 70, 200),
    amount: i === 0 ? 100 : 10,
    isDefender: i === 0,
  }));
  const layout = layoutHits(targets);
  assert.equal(layout.secondaries.length, 7);
  assert.equal(layout.secondaries.filter((s) => s.lane).length, MAX_BRANCH_LANES);
  assert.equal(layout.secondaries.at(-1).delayMs, HIT_SPREAD_MAX_MS);
  assert.ok(layout.secondaries.every((s, i) => i === 0 || s.delayMs >= layout.secondaries[i - 1].delayMs));
});

test('hitDelayFor: a secondary’s ripple delay, 0 for the primary, a missing ctx or junk', () => {
  const ctx = { hitDelays: hitDelaysOf({ secondaries: [{ id: 21, delayMs: 80 }] }) };
  assert.equal(hitDelayFor(ctx, 21), 80);
  assert.equal(hitDelayFor(ctx, '21'), 80);
  assert.equal(hitDelayFor(ctx, 20), 0);
  assert.equal(hitDelayFor(null, 21), 0);
  assert.equal(hitDelayFor({ hitDelays: { 21: -5 } }, 21), 0);
  assert.deepEqual(hitDelaysOf(null), {});
});

test('peekHit: reads a hit without moving the baseline classifyHitOnce diffs against', () => {
  resetDamageBaselines();
  classifyHitOnce({ instanceId: 7, damage: 20, dealt: 20 });
  const cumulative = { instanceId: 7, damage: 50 };
  assert.deepEqual(peekHit(cumulative), { kind: 'hit', amount: 30, weakness: false });
  assert.deepEqual(peekHit(cumulative), { kind: 'hit', amount: 30, weakness: false });
  assert.deepEqual(classifyHitOnce({ instanceId: 7, damage: 50 }), { kind: 'hit', amount: 30, weakness: false });
  assert.deepEqual(peekHit({ instanceId: 7, damage: 20 }), { kind: 'heal', amount: 30, weakness: false });
  assert.equal(peekHit(null), null);
  resetDamageBaselines();
});

test('hitWaitMs: a hit lands its delay after contact, however late its plan arrives', () => {
  assert.equal(hitWaitMs(1000, 80, 1000), 80);
  assert.equal(hitWaitMs(1000, 80, 1040), 40);
  assert.equal(hitWaitMs(1000, 80, 1300), 0);
  assert.equal(hitWaitMs(1000, 0, 900), 100);
  assert.equal(hitWaitMs(null, 80, 1000), 80);
  assert.equal(hitWaitMs(undefined, undefined, 5), 0);
});

test('recoilVector: away from the attacker, turned into a rotated frame, null when unusable', () => {
  const attacker = card(0, 300);
  const below = card(0, 0);
  const up = recoilVector(attacker, below, 0, 10);
  assert.ok(Math.abs(up.x) < 1e-9 && Math.abs(up.y + 10) < 1e-9);
  const turned = recoilVector(attacker, below, 180, 10);
  assert.ok(Math.abs(turned.x) < 1e-9 && Math.abs(turned.y - 10) < 1e-9);
  const right = recoilVector(card(0), card(300), 90, 10);
  assert.ok(Math.abs(right.x) < 1e-9 && Math.abs(right.y + 10) < 1e-9);
  assert.equal(recoilVector(attacker, attacker, 0, 10), null);
  assert.equal(recoilVector(null, below, 0, 10), null);
  assert.equal(recoilVector(attacker, below, 0, 0), null);
});

test('seedDamageBaselines: a counter-only first event reads as a hit; recorded totals are kept', () => {
  resetDamageBaselines();
  assert.equal(peekHit({ instanceId: 30, damage: 30 }), null, 'unknown baseline');
  seedDamageBaselines([{ instanceId: 30, damage: 0 }, { instanceId: 31, damage: 50 }, { instanceId: 32, damage: Number.NaN }]);
  assert.deepEqual(peekHit({ instanceId: 30, damage: 30 }), { kind: 'hit', amount: 30, weakness: false });
  assert.deepEqual(peekHit({ instanceId: 31, damage: 80 }), { kind: 'hit', amount: 30, weakness: false });
  assert.equal(peekHit({ instanceId: 32, damage: 30 }), null);
  seedDamageBaselines([{ instanceId: 31, damage: 0 }]);
  assert.deepEqual(peekHit({ instanceId: 31, damage: 80 }), { kind: 'hit', amount: 30, weakness: false });
  seedDamageBaselines(null);
  resetDamageBaselines();
});

test('knockoutHoldMs: a ripple attack’s knockouts hold once, at the last, from its hit', () => {
  assert.equal(knockoutHoldMs({ ripple: false, moreKnockouts: true, waitMs: 200, holdMs: 900 }), 900);
  assert.equal(knockoutHoldMs({ ripple: true, moreKnockouts: true, waitMs: 200, holdMs: 900 }), 0);
  assert.equal(knockoutHoldMs({ ripple: true, waitMs: 200, holdMs: 900 }), 1100);
  assert.equal(knockoutHoldMs({ ripple: true, waitMs: Number.NaN, holdMs: 900 }), 900);
  assert.equal(knockoutHoldMs(), 0);
});

test('createStrikeBook: a hit queued after the impact queue flushed still gets its attack’s context', () => {
  let now = 0;
  const timers = [];
  const setTimer = (fn, ms) => timers.push({ at: now + ms, fn });
  const book = createStrikeBook({ now: () => now, setTimer });
  const impacts = createImpactQueue({ setTimer: (fn, ms) => setTimer(fn, ms) });
  const runUntil = (t) => {
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      if (!timers[0] || timers[0].at > t) break;
      const next = timers.shift();
      now = next.at;
      next.fn();
    }
    now = t;
  };
  const strike = {};
  const ctx = { impactType: 'fire', hitDelays: { 21: 80 } };
  book.announce(strike, 200, ctx);
  impacts.strikeIn(200, ctx);
  runUntil(240);
  const landed = [];
  book.afterHit(impacts, { instanceId: 20, strike }, (got) => landed.push([20, now, got]));
  book.afterHit(impacts, { instanceId: 21, strike }, (got) => landed.push([21, now, got]));
  book.afterHit(impacts, { instanceId: 9 }, (got) => landed.push([9, now, got]));
  runUntil(1000);
  assert.deepEqual(landed, [
    [20, 240, ctx],
    [9, 240, null],
    [21, 280, ctx],
  ]);
  assert.equal(book.isRipple({ strike }), true);
  assert.equal(book.isRipple({ strike: {} }), false);
  assert.equal(book.contextOf({ strike }), ctx);
  assert.equal(book.contextOf({}), null);
  book.announce(null, 10, ctx);
  assert.equal(book.waitMs({ instanceId: 21 }), 0);
});
