import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDamagePlan,
  damagePopPose,
  lungePoseFor,
  screenShakeAmplitude,
  screenShakeOffsets,
  shakePose,
} from '../combat-pose.mjs';

test('classifyDamagePlan: engine dealt is the hit amount, weakness passes through', () => {
  const seen = new Map();
  assert.deepEqual(classifyDamagePlan({ instanceId: 1, damage: 60, dealt: 60, weakness: true }, seen), {
    kind: 'hit',
    amount: 60,
    weakness: true,
  });
  assert.equal(seen.get(1), 60);
});

test('classifyDamagePlan: healed -> heal, never a negative hit', () => {
  const hit = classifyDamagePlan({ instanceId: 1, damage: 20, healed: 30 }, new Map());
  assert.deepEqual(hit, { kind: 'heal', amount: 30, weakness: false });
});

test('classifyDamagePlan: no dealt -> diff against last seen; unknown baseline -> null (edge 2)', () => {
  const seen = new Map();
  assert.equal(classifyDamagePlan({ instanceId: 1, damage: 40 }, seen), null);
  assert.deepEqual(classifyDamagePlan({ instanceId: 1, damage: 70 }, seen), {
    kind: 'hit',
    amount: 30,
    weakness: false,
  });
  assert.deepEqual(classifyDamagePlan({ instanceId: 1, damage: 50 }, seen), {
    kind: 'heal',
    amount: 20,
    weakness: false,
  });
});

test('classifyDamagePlan: zero delta and junk payloads show nothing (edge 3)', () => {
  const seen = new Map([[1, 30]]);
  assert.equal(classifyDamagePlan({ instanceId: 1, damage: 30 }, seen), null);
  assert.equal(classifyDamagePlan({ instanceId: 1, dealt: 0, damage: 30 }, seen), null);
  assert.equal(classifyDamagePlan({ instanceId: 2, dealt: 'x' }, seen), null);
});

test('screenShakeAmplitude: zero below threshold, grows, capped', () => {
  assert.equal(screenShakeAmplitude(10), 0);
  assert.equal(screenShakeAmplitude(undefined), 0);
  assert.ok(screenShakeAmplitude(30) > 0);
  assert.ok(screenShakeAmplitude(120) > screenShakeAmplitude(30));
  assert.equal(screenShakeAmplitude(9999), 6);
});

test('screenShakeOffsets: ends at rest and decays', () => {
  const offsets = screenShakeOffsets(6);
  assert.equal(offsets.at(-1), '0px 0px');
  assert.ok(Math.abs(parseFloat(offsets[0])) > Math.abs(parseFloat(offsets[4])));
});

test('damagePopPose: rises, fully visible early, faded at the end', () => {
  const start = damagePopPose(0);
  const mid = damagePopPose(0.5);
  const end = damagePopPose(1);
  assert.equal(Math.abs(start.y), 0);
  assert.ok(start.scale < 1);
  assert.equal(mid.opacity, 1);
  assert.ok(mid.y < 0);
  assert.equal(end.opacity, 0);
  assert.equal(damagePopPose(2).opacity, 0);
});

test('shakePose: settles to rest with zero opacity', () => {
  const end = shakePose(1, 8);
  assert.ok(Math.abs(end.x) < 1e-9);
  assert.equal(end.opacity, 0);
});

test('lungePoseFor: heads toward the defender, returns home, null without direction', () => {
  const from = { left: 0, top: 200, width: 40, height: 60 };
  const to = { left: 0, top: 0, width: 40, height: 60 };
  const pose = lungePoseFor(from, to);
  const home = pose(0);
  assert.equal(Math.abs(home.x) + Math.abs(home.y), 0);
  assert.equal(home.scale, 1);
  const peak = pose(0.3);
  assert.ok(peak.y < 0);
  assert.ok(Math.abs(peak.x) < 1e-9);
  assert.ok(-peak.y <= 56);
  const end = pose(1);
  assert.ok(Math.abs(end.y) < 1e-9);
  assert.equal(lungePoseFor(from, from), null);
});
