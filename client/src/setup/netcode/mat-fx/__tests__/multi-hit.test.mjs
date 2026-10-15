import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HIT_SPREAD_MAX_MS,
  HIT_STEP_MS,
  MAX_BRANCH_LANES,
  hitDelayFor,
  hitDelaysOf,
  hitWaitMs,
  recoilVector,
  layoutHits,
} from '../multi-hit.mjs';
import { classifyHitOnce, peekHit, resetDamageBaselines } from '../damage-hit.mjs';

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
