import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TERA_BURST_MS,
  TERA_COAT_AT_MS,
  TERA_ENTRY_MS,
  TERA_HIT_STOP_MS,
  TERA_HOLD_MS,
  TERA_RIM_GLINTS,
  buildTeraCluster,
  lurch,
  teraBokehPose,
  teraCardPose,
  teraLightPose,
  teraMotePose,
  teraPointPose,
  teraRimGlintPose,
  teraShardPose,
  teraSparkPose,
  teraStrain,
  teraStreakPose,
} from '../tera-entry.mjs';

const RELEASE_MS = TERA_BURST_MS + TERA_HIT_STOP_MS;
const finite = (pose) => Object.values(pose).every((v) => Number.isFinite(v));
const CARD_HALF = { w: 0.358, h: 0.5 };

test('the timeline: gather, coat, burst on the sample peak, hold into the dissipation', () => {
  assert.ok(TERA_COAT_AT_MS > 0 && TERA_COAT_AT_MS < TERA_BURST_MS, 'the coat forms while the crystal grows');
  assert.equal(TERA_BURST_MS, 1300);
  assert.ok(TERA_HIT_STOP_MS >= 40 && TERA_HIT_STOP_MS <= 80, 'one to three frames of hit stop');
  assert.ok(TERA_HOLD_MS > RELEASE_MS && TERA_HOLD_MS < TERA_ENTRY_MS, 'the queue waits past the burst, not to the last shard');
  assert.ok(TERA_ENTRY_MS - RELEASE_MS > TERA_BURST_MS * 0.8, 'dissipation is the longest phase');
});

test('lurch: three jumps with a rest after each, from 0 to 1', () => {
  assert.equal(lurch(-1), 0);
  assert.equal(lurch(0), 0);
  assert.equal(lurch(1), 1);
  assert.equal(lurch(4), 1);
  let last = 0;
  let rests = 0;
  for (let u = 0.01; u < 1; u += 0.01) {
    const now = lurch(u);
    assert.ok(now >= last - 1e-12, 'never shrinks');
    if (now === last) rests += 1;
    last = now;
  }
  assert.ok(rests > 40, 'most of the time it rests between jumps');
  for (const third of [1 / 3, 2 / 3]) assert.ok(Math.abs(lurch(third - 0.02) - third) < 1e-9, 'it rests on each third');
});

test('buildTeraCluster: seeded; points rooted inside the card and aimed outward', () => {
  const cluster = buildTeraCluster(7);
  assert.deepEqual(buildTeraCluster(7), cluster);
  assert.notDeepEqual(buildTeraCluster(8).points[0], cluster.points[0]);
  const main = cluster.points.filter((p) => p.tier === 'main');
  const small = cluster.points.filter((p) => p.tier === 'small');
  assert.ok(main.length >= 8 && small.length >= 5);
  for (const point of cluster.points) {
    assert.ok(Math.abs(point.root.x) < CARD_HALF.w && Math.abs(point.root.y) < CARD_HALF.h, 'the card hides the root');
    const heading = (point.headingDeg * Math.PI) / 180;
    const outward = Math.cos(heading) * point.root.x + Math.sin(heading) * point.root.y;
    assert.ok(outward > 0, 'it grows away from the card');
    // The board camera looks almost straight down: nothing stands past half-way up.
    assert.ok(point.elevationDeg > 10 && point.elevationDeg < 60);
    assert.ok(point.length > point.width, 'a point, not a pebble');
    assert.ok(point.start >= 0 && point.start <= 1);
    assert.ok(point.shards.length >= 2);
  }
  assert.ok(Math.max(...main.map((p) => p.length)) > Math.max(...small.map((p) => p.length)));
});

test('teraCardPose: lifts, strains, holds at the burst, lands and settles to rest', () => {
  assert.deepEqual(teraCardPose(0), { lift: 0, scale: 1, yawDeg: 0 });
  const gathered = teraCardPose(500);
  assert.ok(gathered.lift > 0.1 && gathered.scale > 1);
  const atBurst = teraCardPose(TERA_BURST_MS);
  assert.deepEqual(teraCardPose(TERA_BURST_MS + TERA_HIT_STOP_MS - 1), atBurst, 'the hit stop holds the pose');
  assert.equal(atBurst.yawDeg, 0);
  assert.ok(atBurst.lift > gathered.lift, 'highest at the burst');
  const landed = teraCardPose(RELEASE_MS + 130);
  assert.ok(Math.abs(landed.lift) < 1e-9);
  assert.ok(landed.scale < 1, 'squashed on landing');
  const settled = teraCardPose(TERA_ENTRY_MS);
  assert.ok(Math.abs(settled.scale - 1) < 0.005 && settled.lift === 0 && settled.yawDeg === 0, 'frame 7 is frame 1');
  let trembled = 0;
  for (let ms = 0; ms <= TERA_ENTRY_MS; ms += 10) {
    const pose = teraCardPose(ms);
    assert.ok(finite(pose) && pose.lift >= 0 && pose.lift < 0.2 && Math.abs(pose.yawDeg) < 2);
    if (pose.yawDeg !== 0) trembled += 1;
  }
  assert.ok(trembled > 5, 'it trembles under the strain');
});

test('teraStrain: nothing until late in the growth, full at the burst', () => {
  assert.equal(teraStrain(0), 0);
  assert.equal(teraStrain(1000), 0);
  assert.ok(teraStrain(1200) > 0 && teraStrain(1200) < 1);
  assert.equal(teraStrain(TERA_BURST_MS), 1);
});

test('teraPointPose: nothing before it breaks the cloth, full grown before the burst, gone at the release', () => {
  const cluster = buildTeraCluster(3);
  for (const point of cluster.points) {
    assert.equal(teraPointPose(point, 0), null);
    assert.equal(teraPointPose(point, 370), null, 'no crystal while the light gathers');
    const grown = teraPointPose(point, 1250);
    assert.ok(grown && grown.length >= point.length && Math.abs(grown.width - point.width) < 1e-9);
    assert.ok(grown.glow > 0 && grown.glow <= 1, 'it shines under the strain');
    assert.deepEqual(teraPointPose(point, RELEASE_MS - 1), teraPointPose(point, TERA_BURST_MS), 'held through the hit stop');
    assert.equal(teraPointPose(point, RELEASE_MS), null, 'the shards take over');
    let last = 0;
    for (let ms = 380; ms < 1040; ms += 10) {
      const length = teraPointPose(point, ms)?.length ?? 0;
      assert.ok(length >= last - 1e-12, 'it never shrinks while it grows');
      last = length;
    }
  }
});

test('teraShardPose: thrown from its point, out and up; it lands, lies down and dissolves', () => {
  const cluster = buildTeraCluster(11);
  for (const point of cluster.points) {
    for (const shard of point.shards) {
      assert.equal(teraShardPose(point, shard, RELEASE_MS - 1), null);
      const first = teraShardPose(point, shard, RELEASE_MS);
      assert.ok(finite(first) && first.dissolve === 0);
      const startOut = Math.hypot(first.x, first.y);
      let peak = 0;
      let last = null;
      for (let ms = RELEASE_MS; ms <= TERA_ENTRY_MS; ms += 10) {
        const pose = teraShardPose(point, shard, ms);
        if (!pose) break;
        assert.ok(finite(pose) && pose.z >= 0 && pose.length > 0 && pose.width > 0);
        assert.ok(pose.dissolve >= (last?.dissolve ?? 0));
        peak = Math.max(peak, pose.z);
        last = pose;
      }
      assert.ok(peak > first.z, 'it rises before it falls');
      assert.ok(Math.hypot(last.x, last.y) > startOut, 'it ends further from the card than it began');
      assert.ok(last.z < 0.05 && Math.abs(last.elevationDeg - 3) < 1, 'at rest it lies on the cloth');
      assert.equal(teraShardPose(point, shard, TERA_ENTRY_MS), null, 'nothing is left when the scene ends');
    }
  }
});

test('teraLightPose: the pool builds and dies; the jewel pops over the burst and is gone by the end', () => {
  assert.equal(teraLightPose(0).pool.alpha, 0);
  assert.ok(teraLightPose(600).pool.alpha > 0.4);
  assert.ok(teraLightPose(TERA_BURST_MS).pool.alpha > 0.9, 'the pool flares at the burst');
  assert.ok(teraLightPose(TERA_ENTRY_MS).pool.alpha < 1e-9);
  assert.equal(teraLightPose(TERA_BURST_MS - 1).sign.alpha, 0, 'no jewel before the burst');
  const popped = teraLightPose(TERA_BURST_MS + 220).sign;
  assert.ok(popped.alpha === 1 && popped.scale > 0.95 && popped.rise > 0.3);
  assert.ok(teraLightPose(TERA_BURST_MS + 100).sign.scale > 0.5, 'it grows in, it is not switched on');
  assert.ok(teraLightPose(TERA_BURST_MS + 900).sign.alpha < 1e-9);
  assert.equal(teraLightPose(TERA_BURST_MS).sign.heat, 1);
  assert.equal(teraLightPose(TERA_BURST_MS + 200).sign.heat, 0, 'only its first moment burns');
  assert.equal(teraLightPose(1000).ring, undefined, 'no ring is drawn on the cloth');
});

test('the gathering light falls into the card and is gone before the burst', () => {
  const cluster = buildTeraCluster(5);
  for (const [list, poseOf] of [[cluster.bokeh, teraBokehPose], [cluster.motes, teraMotePose]]) {
    for (const item of list) {
      const early = poseOf(item, item.lag + 60);
      const late = poseOf(item, item.lag + 520);
      assert.ok(early && late && finite(early) && finite(late));
      assert.ok(Math.hypot(late.x, late.y) < Math.hypot(early.x, early.y), 'inward');
      assert.ok(late.z < early.z, 'and down onto the card');
      assert.equal(poseOf(item, item.lag), null);
      assert.equal(poseOf(item, TERA_BURST_MS), null);
    }
  }
});

test('burst sparks, streaks and rim glints live only after the burst', () => {
  const cluster = buildTeraCluster(5);
  for (const spark of cluster.sparks) {
    assert.equal(teraSparkPose(spark, RELEASE_MS), null);
    const mid = teraSparkPose(spark, RELEASE_MS + 200);
    assert.ok(mid && finite(mid) && mid.z > 0.12, 'thrown up off the cloth');
    assert.equal(teraSparkPose(spark, TERA_ENTRY_MS), null);
  }
  assert.equal(teraStreakPose(TERA_BURST_MS), null);
  const streak = teraStreakPose(TERA_BURST_MS + 60);
  assert.ok(streak.alpha === 1 && streak.length > 0.3);
  assert.equal(teraStreakPose(TERA_BURST_MS + 300), null, 'a glint, not a beam');
  for (const [x, y, lag] of TERA_RIM_GLINTS) {
    assert.ok(Math.abs(x) > 0.3 || Math.abs(y) > 0.3, 'on the rim, not over the art');
    assert.equal(teraRimGlintPose(lag, RELEASE_MS), null);
    const pop = teraRimGlintPose(lag, RELEASE_MS + 180 + lag + 260);
    assert.ok(Math.abs(pop.alpha - 1) < 1e-9);
    assert.equal(teraRimGlintPose(lag, TERA_ENTRY_MS), null);
  }
});
