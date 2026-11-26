import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GMAX_BURST_AT,
  GMAX_BURST_MS,
  GMAX_ENTRY_MS,
  GMAX_HOLD_MS,
  GMAX_SCALE,
  GMAX_SETTLE_AT,
  boltPath,
  buildGmaxScene,
  drawGmaxEntry,
  gmaxCardPose,
  gmaxEntryPose,
  gmaxPostPose,
  pebblePlace,
  puffPlace,
  ringPoint,
} from '../gmax-entry.mjs';
import { seededRandom } from '../flow-pose.mjs';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const steps = (n = 200) => Array.from({ length: n + 1 }, (_, i) => i / n);

/** A 2D-context stand-in that records every drawing call. */
const recordingContext = () => {
  const calls = [];
  const gradient = { addColorStop: () => {} };
  const ctx = new Proxy(
    { globalAlpha: 1 },
    {
      get(target, key) {
        if (key in target) return target[key];
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
        return (...args) => calls.push([key, args]);
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    }
  );
  return { ctx, calls };
};

test('timing: the burst, the hold and the settle line up', () => {
  assert.equal(GMAX_BURST_MS, Math.round(GMAX_ENTRY_MS * GMAX_BURST_AT));
  assert.equal(GMAX_HOLD_MS, Math.round(GMAX_ENTRY_MS * GMAX_SETTLE_AT));
  assert.ok(GMAX_BURST_MS < GMAX_HOLD_MS && GMAX_HOLD_MS < GMAX_ENTRY_MS);
});

test('gmaxCardPose: the card rests exactly as before, at the start and from the settle on', () => {
  for (const t of [0, GMAX_SETTLE_AT, 0.95, 1, 2]) {
    const pose = gmaxCardPose(t);
    assert.equal(pose.scale, 1, `scale at ${t}`);
    assert.equal(pose.lift, 0, `lift at ${t}`);
    assert.equal(pose.yawDeg, 0, `yaw at ${t}`);
    assert.equal(pose.shake, 0, `shake at ${t}`);
    assert.equal(pose.rim, 0, `rim at ${t}`);
  }
  assert.deepEqual(gmaxCardPose(-1), gmaxCardPose(0));
});

test('gmaxCardPose: crouches before the burst, swells past GMAX_SCALE, holds it giant', () => {
  const crouched = gmaxCardPose(GMAX_BURST_AT - 0.02).scale;
  assert.ok(crouched < 1 && crouched > 0.9, `crouch ${crouched}`);
  const peak = Math.max(...steps(400).map((t) => gmaxCardPose(t).scale));
  assert.ok(peak > GMAX_SCALE && peak < GMAX_SCALE * 1.1, `overshoot ${peak}`);
  assert.ok(near(gmaxCardPose(0.7).scale, GMAX_SCALE, 1e-6));
  assert.ok(gmaxCardPose(0.7).lift > 0);
});

test('gmaxCardPose: the swell starts on the burst and is fast', () => {
  const before = gmaxCardPose(GMAX_BURST_AT - 0.011).scale;
  const after = gmaxCardPose(GMAX_BURST_AT + 0.05).scale;
  assert.ok(before < 1);
  assert.ok(after > GMAX_SCALE * 0.98, `${after}`);
});

test('gmaxCardPose: shrinks back on one spring that undershoots once, never collapses', () => {
  const settle = steps(400).filter((t) => t > 0.76 && t < GMAX_SETTLE_AT).map((t) => gmaxCardPose(t).scale);
  const low = Math.min(...settle);
  assert.ok(low < 1 && low > 0.88, `undershoot ${low}`);
  for (const t of steps(400)) {
    const { scale, lift, rim } = gmaxCardPose(t);
    assert.ok(scale > 0.88 && scale < GMAX_SCALE * 1.1, `${t}: scale ${scale}`);
    assert.ok(lift >= 0 && lift <= 0.12 + 1e-9, `${t}: lift ${lift}`);
    assert.ok(rim >= 0 && rim <= 1, `${t}: rim ${rim}`);
  }
});

test('gmaxCardPose: it trembles only while it strains toward the burst', () => {
  assert.equal(gmaxCardPose(0.1).yawDeg, 0);
  assert.ok(steps(400).some((t) => t > 0.3 && t < GMAX_BURST_AT && Math.abs(gmaxCardPose(t).yawDeg) > 0.3));
  assert.equal(gmaxCardPose(GMAX_BURST_AT + 0.01).yawDeg, 0);
});

test('gmaxEntryPose: every strength stays in [0, 1], t is clamped', () => {
  const keys = ['pool', 'glow', 'gather', 'column', 'columnRise', 'columnBreak', 'flare', 'clouds', 'billow', 'launch', 'disperse', 'debris'];
  for (const t of steps()) {
    const pose = gmaxEntryPose(t);
    for (const key of keys) assert.ok(pose[key] >= 0 && pose[key] <= 1, `${key} at ${t}: ${pose[key]}`);
  }
  assert.deepEqual(gmaxEntryPose(-3), gmaxEntryPose(0));
  assert.deepEqual(gmaxEntryPose(3), gmaxEntryPose(1));
});

test('gmaxEntryPose: beats in order — column before the burst, clouds launched after it', () => {
  assert.equal(gmaxEntryPose(0.2).column, 0);
  assert.ok(gmaxEntryPose(0.4).column > 0.9);
  assert.equal(gmaxEntryPose(GMAX_BURST_AT + 0.1).column, 0);
  assert.equal(gmaxEntryPose(GMAX_BURST_AT).launch, 0);
  assert.ok(gmaxEntryPose(GMAX_BURST_AT + 0.15).launch > 0.99);
  assert.ok(gmaxEntryPose(GMAX_BURST_AT).flare > 0.99);
  for (const key of ['pool', 'glow', 'column', 'flare', 'clouds', 'debris']) assert.equal(gmaxEntryPose(1)[key], 0, key);
});

test('gmaxPostPose: the fringe kicks only round the burst', () => {
  assert.equal(gmaxPostPose(0.2).fringe, 0);
  assert.ok(gmaxPostPose(GMAX_BURST_AT).fringe > 0);
  assert.equal(gmaxPostPose(0.8).fringe, 0);
});

test('buildGmaxScene: deterministic for a seed', () => {
  assert.deepEqual(buildGmaxScene(7), buildGmaxScene(7));
  assert.notDeepEqual(buildGmaxScene(7), buildGmaxScene(8));
  const scene = buildGmaxScene(3);
  assert.ok(scene.puffs.length >= 8 && scene.puffs.every((p) => p.lobes.length >= 8));
  const burst = scene.bolts.filter((b) => b.kind === 'burst');
  assert.ok(burst.length > 0);
  assert.ok(burst.every((b) => b.at <= GMAX_BURST_AT && b.at + b.dur > GMAX_BURST_AT), 'every burst bolt shows on the contact frame');
});

test('ringPoint: the ring is tilted so its near side sits lower than its far side', () => {
  const [, nearY, nearZ] = ringPoint(90, 1);
  const [, farY, farZ] = ringPoint(270, 1);
  assert.ok(nearZ > 0 && farZ < 0);
  assert.ok(nearY < farY);
});

test('puffPlace: low at the base while gathering, then on the ring, which widens as it disperses', () => {
  const [puff] = buildGmaxScene(5).puffs;
  const gathering = puffPlace(puff, gmaxEntryPose(0.3));
  assert.ok(gathering.y < -0.35, `base y ${gathering.y}`);
  const circling = puffPlace(puff, gmaxEntryPose(0.7));
  assert.ok(circling.y > 0, `ring y ${circling.y}`);
  const spread = puffPlace(puff, gmaxEntryPose(0.97));
  assert.ok(Math.hypot(spread.x, spread.z) > Math.hypot(circling.x, circling.z) + 0.3);
  assert.ok(spread.size > circling.size, 'clouds expand as they thin');
});

test('puffPlace: the ring sits round the card top, so it comes down as the card shrinks back', () => {
  const [puff] = buildGmaxScene(5).puffs;
  const pose = gmaxEntryPose(0.7);
  assert.ok(puffPlace(puff, pose, 1).y < puffPlace(puff, pose, GMAX_SCALE).y);
  assert.deepEqual(puffPlace(puff, pose, 0.9), puffPlace(puff, pose, 1), 'never below the card at rest');
});

test('pebblePlace: lifts off after its start, rises, then falls once the card shrinks back', () => {
  const [pebble] = buildGmaxScene(11).debris;
  assert.equal(pebblePlace(pebble, gmaxEntryPose(pebble.start - 0.01)), null);
  const risen = pebblePlace(pebble, gmaxEntryPose(0.7)).y;
  assert.ok(risen > pebble.y);
  assert.ok(pebblePlace(pebble, gmaxEntryPose(0.99)).y < risen);
});

test('boltPath: joins its ends in jagged straight runs', () => {
  const path = boltPath(seededRandom(4), [0, 0], [100, 0], 0.24, 4);
  assert.deepEqual(path[0], [0, 0]);
  assert.deepEqual(path[path.length - 1], [100, 0]);
  assert.equal(path.length, 17);
  assert.ok(path.some(([, y]) => Math.abs(y) > 2), 'it leaves the straight line');
});

test('drawGmaxEntry: draws every frame with save/restore balanced, nothing at rest', () => {
  const scene = buildGmaxScene(9);
  for (const grows of [true, false]) {
    for (const t of steps(100)) {
      const { ctx, calls } = recordingContext();
      drawGmaxEntry(ctx, t, { cx: 400, cy: 400, unit: 100, card: { width: 72, height: 100 }, scene, grows });
      const saves = calls.filter(([k]) => k === 'save').length;
      const restores = calls.filter(([k]) => k === 'restore').length;
      assert.equal(saves, restores, `t=${t}`);
    }
  }
  const atRest = recordingContext();
  drawGmaxEntry(atRest.ctx, 1, { cx: 400, cy: 400, unit: 100, scene });
  assert.equal(atRest.calls.filter(([k]) => k === 'fill' || k === 'stroke' || k === 'fillRect').length, 0);
  const mid = recordingContext();
  drawGmaxEntry(mid.ctx, 0.65, { cx: 400, cy: 400, unit: 100, scene });
  assert.ok(mid.calls.filter(([k]) => k === 'fill').length > 50, 'the cloud ring draws');
});

test('drawGmaxEntry: no unit or no scene draws nothing', () => {
  const { ctx, calls } = recordingContext();
  drawGmaxEntry(ctx, 0.5, { cx: 0, cy: 0, unit: 0, scene: buildGmaxScene(1) });
  drawGmaxEntry(ctx, 0.5, { cx: 0, cy: 0, unit: 100, scene: null });
  assert.equal(calls.length, 0);
});
