import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LUNGE_IMPACT,
  attackAngleDeg,
  createImpactQueue,
  hitFlashPose,
  slashPose,
  stackOffset,
  attackBannerText,
  classifyDamagePlan,
  damagePopPose,
  lungePoseFor,
  screenShakeAmplitude,
  screenShakeOffsets,
  shakePose,
  targetRingPose,
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
  const windUp = pose(LUNGE_IMPACT * 0.4);
  assert.ok(windUp.y > 0, 'pulls back away from the defender first');
  assert.ok(windUp.scale > 1, 'lifts during the wind-up');
  const peak = pose(LUNGE_IMPACT);
  assert.ok(peak.y < 0);
  assert.ok(Math.abs(peak.y) >= Math.abs(pose(0.8).y));
  assert.ok(Math.abs(peak.x) < 1e-9);
  assert.ok(-peak.y <= 64 + 1e-9);
  const end = pose(1);
  assert.ok(Math.abs(end.y) < 1e-9);
  assert.equal(lungePoseFor(from, from), null);
});

test('stackOffset: later numbers on the same card sit higher (edge 7)', () => {
  assert.equal(stackOffset(0, 100), -0);
  assert.ok(stackOffset(2, 100) < stackOffset(1, 100));
  assert.equal(stackOffset('junk', 100), -0);
});

test('hitFlashPose / slashPose: peak early, gone at the end', () => {
  assert.equal(hitFlashPose(0.08).opacity, 1);
  assert.equal(hitFlashPose(1).opacity, 0);
  assert.equal(slashPose(0).scaleX, 0);
  assert.equal(slashPose(0.35).scaleX, 1);
  assert.equal(slashPose(1).opacity, 0);
});

test('attackAngleDeg: straight up is -90', () => {
  const from = { left: 0, top: 200, width: 40, height: 60 };
  const to = { left: 0, top: 0, width: 40, height: 60 };
  assert.equal(attackAngleDeg(from, to), -90);
});

const fakeTimers = () => {
  const queue = [];
  return {
    setTimer: (fn, ms) => queue.push({ fn, ms }),
    runNext() {
      const next = queue.shift();
      next.fn();
      return next.ms;
    },
    get size() {
      return queue.length;
    },
  };
};

test('impact queue: hits without an attack fire on the next tick (edge 4)', () => {
  const timers = fakeTimers();
  const q = createImpactQueue(timers);
  const seen = [];
  q.add((ctx) => seen.push(['a', ctx]));
  q.add((ctx) => seen.push(['b', ctx]));
  assert.equal(timers.size, 1);
  assert.equal(timers.runNext(), 0);
  assert.deepEqual(seen, [['a', null], ['b', null]]);
});

test('impact queue: an attack later in the same batch delays hits to contact, with its context', () => {
  const timers = fakeTimers();
  const q = createImpactQueue(timers);
  const seen = [];
  q.add((ctx) => seen.push(ctx));
  q.strikeIn(200, { direction: -90 });
  timers.runNext();
  assert.deepEqual(seen, []);
  assert.equal(timers.runNext(), 200);
  assert.deepEqual(seen, [{ direction: -90 }]);
});

test('impact queue: an attack with no hits does not delay the next batch (edge 3)', () => {
  const timers = fakeTimers();
  const q = createImpactQueue(timers);
  q.strikeIn(200, { direction: 0 });
  timers.runNext();
  assert.equal(timers.size, 0);
  const seen = [];
  q.add((ctx) => seen.push(ctx));
  assert.equal(timers.runNext(), 0);
  assert.deepEqual(seen, [null]);
});

// ── Design 024 slice 2: attack banner + targeting ring ─────────────────────

test('attackBannerText: the attack names the banner, the attacker the subtitle', () => {
  assert.deepEqual(attackBannerText('Thunderbolt', 'Pikachu'), {
    title: 'Thunderbolt',
    sub: 'Pikachu',
  });
});

test('attackBannerText: no attack name means no banner at all', () => {
  assert.equal(attackBannerText('', 'Pikachu'), null);
  assert.equal(attackBannerText('   ', 'Pikachu'), null);
  assert.equal(attackBannerText(undefined, 'Pikachu'), null);
  assert.equal(attackBannerText(null, null), null);
});

test('attackBannerText: an unknown attacker still banners, with an empty subtitle', () => {
  assert.deepEqual(attackBannerText('Tackle', undefined), { title: 'Tackle', sub: '' });
  assert.deepEqual(attackBannerText('  Tackle  ', '  Rattata '), { title: 'Tackle', sub: 'Rattata' });
});

test('targetRingPose: fades in, shrinks onto the card, and ends invisible', () => {
  const start = targetRingPose(0);
  const end = targetRingPose(1);
  assert.equal(start.opacity, 0);
  assert.equal(end.opacity, 0);
  assert.ok(targetRingPose(0.2).opacity > 0.5, 'visible while the banner reads');
  assert.ok(end.scale < targetRingPose(0.2).scale, 'the ring closes in on the target');
});

test('targetRingPose: opacity and scale stay finite and bounded across the run', () => {
  for (let t = -0.5; t <= 1.5; t += 0.05) {
    const pose = targetRingPose(t);
    assert.ok(Number.isFinite(pose.scale) && pose.scale > 0, `bad scale at ${t}`);
    assert.ok(pose.opacity >= 0 && pose.opacity <= 1, `opacity out of range at ${t}`);
  }
});

test('targetRingPose: pulses rather than shrinking monotonically', () => {
  // Two visible pulses are what make it read as "targeting", not "closing".
  const scales = [];
  for (let t = 0; t <= 1; t += 0.05) scales.push(targetRingPose(t).scale);
  const rises = scales.filter((s, i) => i > 0 && s > scales[i - 1]).length;
  assert.ok(rises >= 2, 'the ring grows again at least twice');
});
