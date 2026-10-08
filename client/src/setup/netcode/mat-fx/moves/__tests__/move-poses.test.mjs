import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLARE_ARMS,
  armTongues,
  auraPose,
  beamPose,
  boltPose,
  chargeCore,
  chargeOrbs,
  cloudPose,
  flarePose,
  flashPose,
  glyphPose,
  pillarPose,
  projectilePose,
  rainPose,
  raysPose,
  releaseRings,
  resolveArms,
  ringPose,
  shardsPose,
  slashPose,
  smokePuffs,
  spiralPose,
  splashPose,
  terrainPose,
  vignettePose,
  volleyPose,
  anchorPoint,
  boltPoses,
  chainPose,
  clusterPose,
  fanPose,
  finsPose,
  gripPose,
  laneFromPoint,
  pillarColumns,
  shadePose,
} from '../move-poses.mjs';
import { lanePoint, laneGeometry, skyLane } from '../move-geometry.mjs';

const H = 200;
const SEED = 7;
const lane = laneGeometry({ left: 0, top: 0, width: 140, height: H }, { left: 400, top: 100, width: 140, height: H });

/** Every number reachable in a pose result is finite. */
const allFinite = (value) => {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allFinite);
  if (value && typeof value === 'object') return Object.values(value).every(allFinite);
  return true;
};

const POSES = {
  chargeOrbs: (s) => chargeOrbs(s, H, {}),
  chargeCore: (s) => chargeCore(s, H, {}),
  releaseRings: (s) => releaseRings(s, H, {}),
  projectilePose: (s) => projectilePose(s, H, {}),
  vignettePose: (s) => vignettePose(s, H, {}),
  raysPose: (s) => raysPose(s, H, {}),
  flarePose: (s) => flarePose(s, H, {}),
  flashPose: (s) => flashPose(s, H, {}),
  smokePuffs: (s) => smokePuffs(s, H, {}),
  beamPose: (s) => beamPose(s, lane, {}),
  splashPose: (s) => splashPose(s, H, SEED, {}),
  pillarPose: (s) => pillarPose(s, H, {}),
  slashPose: (s) => slashPose(s, H, {}),
  terrainPose: (s) => terrainPose(s, H, SEED, { kind: 'crack' }),
  cloudPose: (s) => cloudPose(s, H, SEED, {}),
  spiralPose: (s) => spiralPose(s, H, {}),
  volleyPose: (s) => volleyPose(s, H, {}),
  auraPose: (s) => auraPose(s, H, {}),
  rainPose: (s) => rainPose(s, H, SEED, {}),
  shardsPose: (s) => shardsPose(s, H, SEED, {}),
  boltPose: (s) => boltPose(s, lane, SEED, 300, {}),
  ringPose: (s) => ringPose(s, H, {}),
  glyphPose: (s) => glyphPose(s, H, {}),
};

test('every pose function returns finite numbers over [0, 1] and clamps outside it', () => {
  for (const [name, pose] of Object.entries(POSES)) {
    for (let i = 0; i <= 40; i += 1) {
      assert.ok(allFinite(pose(i / 40)), `${name} at ${i / 40}`);
    }
    assert.deepEqual(pose(-3), pose(0), `${name} below 0`);
    assert.deepEqual(pose(9), pose(1), `${name} above 1`);
  }
});

test('chargeOrbs: radius tightens 0.85 h -> 0.25 h, spreads over the ellipse and respects count', () => {
  const start = chargeOrbs(0, H, { count: 5 });
  assert.equal(start.length, 5);
  const radiusAt = (s) => Math.hypot(...[chargeOrbs(s, H, { count: 1 })[0]].map((o) => [o.dx, (o.dy + H * 0.04) / 0.42]).flat());
  assert.ok(Math.abs(radiusAt(0) - 0.85 * H) < 1e-6);
  assert.ok(Math.abs(radiusAt(1) - 0.25 * H) < 1e-6);
  assert.equal(chargeOrbs(0.5, H, { count: 3 }).length, 3);
  for (const orb of chargeOrbs(0.5, H, { count: 8 })) assert.ok(orb.depth >= -1 && orb.depth <= 1);
});

test('chargeCore builds from its start and sits along the lane axis', () => {
  assert.equal(chargeCore(0.2, H, {}).alpha, 0);
  const full = chargeCore(1, H, {});
  assert.ok(Math.abs(full.r - 0.56 * H) < 1e-9);
  assert.equal(full.alpha, 1);
  assert.equal(full.x, 0.42 * H);
  assert.equal(full.y, 0);
});

test('releaseRings: the second ring starts after its delay; width and alpha shrink', () => {
  assert.equal(releaseRings(0.1, H, {}).length, 1);
  assert.equal(releaseRings(0.5, H, {}).length, 2);
  assert.equal(releaseRings(0.5, H, { count: 3, delay: 0.2 }).length, 3);
  const late = releaseRings(0.99, H, {})[0];
  assert.ok(late.alpha < 0.01 && late.r > 1.2 * H);
});

test('projectilePose: accelerates (f = s^2), bows off the lane and grows; straight has no bow', () => {
  assert.equal(projectilePose(0.5, H, {}).f, 0.25);
  assert.equal(projectilePose(0.5, H, { ease: 'linear' }).f, 0.5);
  assert.equal(projectilePose(0.5, H, { ease: 'out' }).f, 0.75);
  assert.ok(Math.abs(projectilePose(0.5, H, { bow: 0.2 }).side - 0.2 * H) < 1e-9);
  assert.equal(projectilePose(0.5, H, { path: 'straight' }).side, 0);
  assert.notEqual(projectilePose(0.2, H, { path: 'spiral' }).side, projectilePose(0.2, H, { path: 'arc' }).side);
  assert.ok(Math.abs(projectilePose(1, H, {}).r - 0.56 * H) < 1e-9);
});

test('vignettePose stays local (<= 1.6 h) and below the house alpha cap', () => {
  for (let i = 0; i <= 20; i += 1) {
    const v = vignettePose(i / 20, H, {});
    assert.ok(v.alpha >= 0 && v.alpha <= 0.45 + 1e-12);
    assert.ok(v.outer <= 1.6 * H + 1e-9);
  }
  assert.equal(vignettePose(0, H, {}).alpha, 0);
  assert.ok(Math.abs(vignettePose(0.5, H, {}).alpha - 0.45) < 1e-9);
});

test('raysPose fades as it lengthens and reports its count', () => {
  assert.ok(raysPose(0.8, H, {}).alpha < raysPose(0.1, H, {}).alpha);
  assert.ok(raysPose(0.8, H, {}).outer > raysPose(0.1, H, {}).outer);
  assert.equal(raysPose(0.5, H, { count: 16 }).count, 16);
});

test('flarePose: arm length is reach x grow, breaks up from 60 %, and arm presets resolve', () => {
  const grown = flarePose(0.3, H, {});
  assert.equal(grown.arms.length, 5);
  FLARE_ARMS.forEach((arm, i) => assert.ok(Math.abs(grown.arms[i].length - arm.reach * H) < 1e-6));
  assert.equal(flarePose(0.5, H, {}).breakUp, 0);
  assert.ok(flarePose(0.9, H, {}).breakUp > 0.5);
  assert.equal(resolveArms('cross').length, 4);
  assert.equal(resolveArms('ring').length, 8);
  assert.equal(resolveArms('dai'), FLARE_ARMS);
  assert.deepEqual(resolveArms([{ angle: 10, reach: 2 }]), [{ angle: 10, reach: 2 }]);
  assert.equal(flarePose(0.3, H, { arms: 'cross' }).arms.length, 4);
});

test('armTongues: a main tongue plus two sides, fragments while breaking up, none for a zero arm', () => {
  const arm = { angle: -90, length: 100, width: 40, drift: 10, alpha: 1 };
  assert.equal(armTongues(arm, 0).length, 3);
  assert.equal(armTongues(arm, 0.8).length, 5);
  assert.deepEqual(armTongues({ ...arm, length: 0 }, 0), []);
});

test('flashPose peaks early and fades; smokePuffs stay under alpha 0.32', () => {
  assert.equal(flashPose(0, H, {}).alpha, 0);
  assert.ok(flashPose(0.12, H, {}).alpha > 0.99);
  assert.ok(flashPose(0.99, H, {}).alpha < 0.01);
  for (let i = 0; i <= 20; i += 1) {
    for (const puff of smokePuffs(i / 20, H, { count: 6 })) assert.ok(puff.alpha <= 0.32 + 1e-12);
  }
  assert.ok(smokePuffs(1, H, { count: 10 }).length <= 10);
});

test('beamPose grows from the attacker, holds and retracts from the attacker', () => {
  const grow = beamPose(0.1, lane, { kind: 'solid' });
  assert.ok(grow.to > 0 && grow.to < 1 && grow.from === 0);
  const hold = beamPose(0.5, lane, { kind: 'solid' });
  assert.equal(hold.to, 1);
  assert.equal(hold.from, 0);
  const retract = beamPose(0.9, lane, { kind: 'solid' });
  assert.ok(retract.from > 0 && retract.to === 1);
  assert.equal(hold.segments.length, 1);
});

test('beamPose kinds: helix has two strands, segmented and pulse-train at most 8 pieces, widening widens', () => {
  assert.equal(beamPose(0.5, lane, { kind: 'helix' }).segments.length, 2);
  assert.ok(beamPose(0.5, lane, { kind: 'segmented' }).segments.length <= 8);
  assert.ok(beamPose(0.5, lane, { kind: 'pulse-train' }).segments.length <= 8);
  assert.ok(beamPose(0.9, lane, { kind: 'widening' }).width > beamPose(0.3, lane, { kind: 'widening' }).width);
  assert.equal(beamPose(0.5, lane, { kind: 'solid', w: 0.5 }).width, 0.5 * lane.h);
  const [a, b] = beamPose(0.5, lane, { kind: 'helix' }).segments;
  assert.equal(a.side, -b.side);
});

test('splashPose launches `count` tongues that fall under gravity and fade', () => {
  assert.equal(splashPose(1, H, SEED, { count: 6 }).length, 6);
  const early = splashPose(0.3, H, SEED, { count: 6, gravity: 0 });
  const heavy = splashPose(0.3, H, SEED, { count: 6, gravity: 1 });
  assert.ok(heavy.every((t, i) => t.y > early[i].y));
  assert.ok(splashPose(0.99, H, SEED, { count: 6 }).every((t) => t.alpha < 0.2));
  assert.deepEqual(splashPose(0.5, H, SEED, {}), splashPose(0.5, H, SEED, {}));
});

test('pillarPose rises (angle -90) from below or drops (angle 90) from above, then dissolves', () => {
  const up = pillarPose(0.5, H, { from: 'below' });
  assert.equal(up.angleDeg, -90);
  assert.ok(Math.abs(up.length - 1.8 * H) < 1e-9);
  assert.equal(pillarPose(0.5, H, { from: 'above' }).angleDeg, 90);
  assert.ok(pillarPose(0.99, H, {}).alpha < 0.1);
  assert.ok(pillarPose(0.1, H, {}).length < up.length);
});

test('slashPose: one slash per count, the tip leads along the sweep and fades after', () => {
  assert.equal(slashPose(0.5, H, { count: 3 }).length, 3);
  const early = slashPose(0.1, H, {})[0];
  const late = slashPose(0.5, H, {})[0];
  assert.ok(late.edge > early.edge);
  assert.ok(slashPose(0.99, H, {})[0].alpha < 0.05);
  assert.ok(slashPose(0.4, H, {})[0].length > 0);
});

test('terrainPose fills only the arrays its kind uses', () => {
  const crack = terrainPose(0.6, H, SEED, { kind: 'crack' });
  assert.equal(crack.cracks.length, 5);
  assert.ok(crack.cracks.every((line) => line.length === 5));
  assert.deepEqual([crack.waves, crack.dust], [[], []]);
  assert.ok(terrainPose(0.6, H, SEED, { kind: 'wave' }).waves.length > 0);
  assert.equal(terrainPose(0.6, H, SEED, { kind: 'dust' }).dust.length, 6);
  const quake = terrainPose(0.3, H, SEED, { kind: 'quake', amp: 0.05 });
  assert.ok(Math.abs(quake.jitter.x) <= 0.05 * H + 1e-9);
  assert.deepEqual(terrainPose(0.3, H, SEED, { kind: 'crack' }).jitter, { x: 0, y: 0 });
});

test('cloudPose bodies drift along the direction and never exceed their alpha', () => {
  const puffs = cloudPose(0.5, H, SEED, { count: 8, alpha: 0.5 });
  assert.ok(puffs.length > 0 && puffs.length <= 8);
  assert.ok(puffs.every((p) => p.alpha <= 0.5 + 1e-12));
  const up = cloudPose(1, H, SEED, { direction: -90, drift: 1 });
  const down = cloudPose(1, H, SEED, { direction: 90, drift: 1 });
  assert.ok(up[0].dy < down[0].dy);
});

test('spiralPose has one tongue per `tongues`, radius between r0 and r1', () => {
  const tongues = spiralPose(0.5, H, { tongues: 10, r0: 0.2, r1: 1.1 });
  assert.equal(tongues.length, 10);
  for (const t of tongues) assert.ok(Math.hypot(t.x, t.y / 0.7) <= 1.1 * H + 1e-6);
});

test('volleyPose launches bodies on the stagger; the last defines the end', () => {
  const params = { count: 3, stagger: 100, beatMs: 400 };
  assert.equal(volleyPose(0.01, H, params).length, 1);
  assert.equal(volleyPose(0.3, H, params).length, 2);
  assert.equal(volleyPose(0.999, H, params).length, 1);
  assert.ok(volleyPose(0.3, H, params).every((b) => b.f >= 0 && b.f < 1));
  assert.equal(volleyPose(0.5, H, { count: 3 }).length, 3);
});

test('auraPose pulses within its radius band and fades in and out', () => {
  for (let i = 0; i <= 20; i += 1) {
    const a = auraPose(i / 20, H, { r0: 0.7, r1: 0.9 });
    assert.ok(a.r >= 0.7 * H - 1e-9 && a.r <= 0.9 * H + 1e-9);
  }
  assert.equal(auraPose(0, H, {}).alpha, 0);
});

test('rainPose drops fall from above into the footprint and then splash', () => {
  const drops = rainPose(0.4, H, SEED, { count: 12, height: 1.6 });
  assert.ok(drops.length > 0 && drops.length <= 12);
  assert.ok(drops.every((d) => d.y <= 0));
  assert.ok(rainPose(0.95, H, SEED, { count: 12 }).some((d) => d.splash > 0));
});

test('shardsPose bursts outward over the arc, spinning, and fades', () => {
  const shards = shardsPose(0.5, H, SEED, { count: 8, distance: 1.1 });
  assert.equal(shards.length, 8);
  assert.ok(shards.every((s) => Math.hypot(s.x, s.y) <= 1.1 * 1.1 * H + 1e-6));
  assert.ok(shardsPose(0.99, H, SEED, {})[0].alpha < 0.05);
  const fan = shardsPose(1, H, SEED, { count: 8, arc: 60, direction: -90 });
  assert.ok(fan.every((s) => s.y < 0));
});

test('boltPose: fixed endpoints, `segments` joints, re-rolls only on the interval, branches', () => {
  const bolt = boltPose(0.3, lane, SEED, 100, { segments: 9, branches: 2, from: 'attacker' });
  assert.equal(bolt.points.length, 10);
  assert.equal(bolt.branches.length, 2);
  assert.deepEqual(bolt.points.at(-1), [lane.bx, lane.by]);
  const same = boltPose(0.3, lane, SEED, 110, { segments: 9, rerollMs: 45 });
  const next = boltPose(0.3, lane, SEED, 200, { segments: 9, rerollMs: 45 });
  assert.deepEqual(boltPose(0.3, lane, SEED, 100, { segments: 9 }).points, same.points);
  assert.notDeepEqual(same.points, next.points);
  const sky = boltPose(0.3, lane, SEED, 100, { from: 'sky' });
  assert.deepEqual(sky.points[0], [lane.bx, lane.by - 1.6 * lane.h]);
});

test('ringPose staggers rings and ringPose / glyphPose obey their ranges', () => {
  assert.equal(ringPose(0.99, H, { count: 3 }).length, 3);
  assert.ok(ringPose(0.1, H, { count: 3 }).length < 3);
  const g = glyphPose(0.5, H, { r: 0.9 });
  assert.ok(g.r <= 0.9 * H + 1e-9 && g.alpha === 1);
  assert.equal(glyphPose(0, H, {}).alpha, 0);
});

// ---- design 065 slice 4 ----------------------------------------------------------

const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('anchorPoint: card centres untouched at 0 offset, lane offsets on cards, screen offsets in the sky', () => {
  assert.deepEqual(anchorPoint(lane, 'attacker'), { x: lane.ax, y: lane.ay });
  assert.deepEqual(anchorPoint(lane, 'defender', 0, 0), { x: lane.bx, y: lane.by });
  const along = anchorPoint(lane, 'defender', 0.5, 0);
  assert.ok(close(along.x, lane.bx + lane.ux * 0.5 * H) && close(along.y, lane.by + lane.uy * 0.5 * H));
  const sky = anchorPoint(lane, 'sky');
  const drop = lanePoint(skyLane(lane), 0);
  assert.ok(close(sky.x, drop.x) && close(sky.y, drop.y), 'sky = skyLane start');
  assert.deepEqual(anchorPoint(lane, 'sky-attacker', 0.1, -0.2), { x: lane.ax - 0.5 * H + 0.1 * H, y: lane.ay - 1.7 * H - 0.2 * H });
  const fromSky = laneFromPoint(lane, sky.x, sky.y);
  const end = lanePoint(fromSky, 1);
  assert.ok(close(end.x, lane.bx) && close(end.y, lane.by));
});

test('fanPose: count tongues evenly over the spread, growing then fading', () => {
  const ring = fanPose(0.5, 100, { count: 4, spread: 360 });
  assert.equal(ring.tongues.length, 4);
  for (let i = 1; i < 4; i += 1) assert.ok(close(ring.tongues[i].angleDeg - ring.tongues[i - 1].angleDeg, 90));
  const wing = fanPose(0.5, 100, { count: 3, spread: 100, direction: 180 });
  assert.deepEqual(wing.tongues.map((t) => t.angleDeg), [130, 180, 230]);
  assert.ok(fanPose(0.05, 100, {}).tongues[1].length < fanPose(0.5, 100, {}).tongues[1].length);
  assert.ok(close(fanPose(0.5, 100, {}).tongues[1].length, 100));
  assert.ok(fanPose(0.95, 100, {}).alpha < 1);
  assert.ok(allFinite(fanPose(0.3, 100, { flap: 12, spin: 40 })));
});

test('shadePose grows over 25 %, holds, then shrinks; kinds shape it', () => {
  const early = shadePose(0.1, 100, { r: 0.9 });
  assert.ok(early.rx < 90 && early.rx > 0);
  assert.ok(close(shadePose(0.5, 100, { r: 0.9 }).rx, 90));
  assert.ok(shadePose(0.95, 100, { r: 0.9 }).rx < 90);
  const disc = shadePose(0.5, 100, {});
  assert.ok(close(disc.ry, disc.rx * 0.45));
  const sphere = shadePose(0.5, 100, { kind: 'sphere' });
  assert.equal(sphere.rx, sphere.ry);
  assert.ok(close(shadePose(0.5, 100, { kind: 'giant' }).ry * 2, 220));
});

test('chainPose strings links along the lane, then wraps the defender', () => {
  const length = 3 * 100;
  const out = chainPose(0.3, 100, { links: 9 });
  assert.equal(out.links.length, 9);
  for (const link of out.links) {
    assert.equal(link.y + 0, 0);
    assert.ok(link.x <= 0 && link.x >= -(length - 0.42 * 100), `on the lane segment: ${link.x}`);
  }
  const wrapped = chainPose(0.99, 100, { links: 9 });
  assert.equal(wrapped.links.length, 9);
  for (const link of wrapped.links) {
    assert.ok(Math.abs(link.y) <= 0.56 * 100 && Math.abs(link.x) <= 0.76 * 100, JSON.stringify(link));
  }
  assert.deepEqual(out.links.slice(0, 2).map((l) => l.rotDeg), [0, 90]);
});

test('gripPose descends over 40 % and curls to 70° by 70 %', () => {
  assert.equal(gripPose(0).y, 0);
  assert.ok(close(gripPose(0.4).y, 1));
  assert.equal(gripPose(0.3).curl, 0);
  assert.ok(close(gripPose(0.7).curl, 70));
  assert.ok(close(gripPose(0.95).curl, 70));
});

test('pillarColumns, finsPose, clusterPose and boltPoses', () => {
  assert.deepEqual(pillarColumns(0.4, 100, {}), [{ x: 0, s: 0.4 }]);
  const cols = pillarColumns(0.1, 100, { count: 3, spread: 2, stagger: 100, beatMs: 1000 });
  assert.deepEqual(cols.map((c) => c.x), [-100, 0, 100]);
  assert.equal(cols[0].s, 0.1);
  assert.equal(cols[2].s, null);
  assert.equal(finsPose(0.5, 100, { kind: 'fins', count: 5 }).length, 5);
  const cluster = clusterPose(0.9, 100, SEED, { count: 6 });
  assert.equal(cluster.length, 6);
  assert.ok(cluster.every((t) => t.alpha === 1 && t.y > 40));
  assert.deepEqual(boltPoses(0.5, lane, SEED, 100, {}), [boltPose(0.5, lane, SEED, 100, {})]);
  const cage = boltPoses(0.5, lane, SEED, 100, { count: 4, spread: 1, curve: 0.2 });
  assert.equal(cage.length, 4);
  assert.ok(allFinite(cage.map((b) => b.points)));
});
