import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AURA_PULSE_MS,
  HIT_RECOIL_MS,
  hitRecoilPose,
  HIT_DRESSING,
  LUNGE_IMPACT,
  SCREEN_SHAKE_MAX_PX,
  auraPulsePose,
  hitDressingFor,
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
  screenShakeKeyframes,
  easingTimeFor,
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

test('screenShakeKeyframes: the WAAPI shake as timed px offsets (design 074 D6)', () => {
  const keys = screenShakeKeyframes(6, 360);
  assert.equal(keys.length, 13);
  // A damped sine: keyframe i sits at fraction i/12 of the decay.
  keys.slice(0, 12).forEach((key, i) => {
    const f = i / 12;
    const decay = (1 - f) ** 2;
    assert.ok(Math.abs(key.x - 6 * Math.cos(f * Math.PI * 5) * decay) < 1e-9, `key ${i} x`);
    assert.ok(Math.abs(key.y - 6 * 0.6 * Math.sin(f * Math.PI * 4) * decay) < 1e-9, `key ${i} y`);
  });
  assert.ok(Math.abs(keys[0].x) > Math.abs(keys[4].x));
  assert.equal(keys[0].ms, 0);
  assert.equal(keys.at(-1).ms, 360);
  assert.deepEqual([keys.at(-1).x, keys.at(-1).y], [0, 0]);
  for (let i = 1; i < keys.length; i += 1) assert.ok(keys[i].ms > keys[i - 1].ms);
  // cubic-bezier(0.2, 0.6, 0.4, 1) front-loads progress: half the keys land before 30% of the time.
  assert.ok(keys[6].ms < 0.3 * 360, `${keys[6].ms}`);
});

test('easingTimeFor: inverts a cubic-bezier easing (linear is the identity)', () => {
  assert.ok(Math.abs(easingTimeFor(0.5, [0, 0, 1, 1]) - 0.5) < 1e-6);
  assert.equal(easingTimeFor(0), 0);
  assert.equal(easingTimeFor(1), 1);
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

test('hitDressingFor: every family has a dressing, unknown or missing falls back to the default', () => {
  const families = ['slash', 'punch', 'dash', 'beam', 'projectile', 'burst', 'quake', 'splash', 'wind', 'electric', 'ghost', 'chime', 'roar', 'charge'];
  assert.equal(Object.keys(HIT_DRESSING).length, families.length + 1);
  for (const family of families) {
    assert.equal(hitDressingFor(family), HIT_DRESSING[family], family);
    assert.notEqual(hitDressingFor(family), HIT_DRESSING.default, family);
  }
  for (const family of [undefined, null, 'nope', 'toString', '']) {
    assert.equal(hitDressingFor(family), HIT_DRESSING.default, String(family));
  }
});

test('hitDressingFor: the default is the current hit and punch / quake / roar add a ring', () => {
  assert.deepEqual(HIT_DRESSING.default, { ring: false, flashScale: 1, shakeMul: 1, slash: true });
  for (const family of ['punch', 'dash', 'quake', 'roar']) assert.equal(hitDressingFor(family).ring, true, family);
  assert.equal(hitDressingFor('beam').slash, false);
});

test('hitDressingFor: a heavier shake multiplier still clamps at the table-shake maximum', () => {
  const amount = 400 * hitDressingFor('quake').shakeMul;
  assert.equal(screenShakeAmplitude(amount), SCREEN_SHAKE_MAX_PX);
  assert.ok(screenShakeAmplitude(60 * 1.5) > screenShakeAmplitude(60));
});

test('auraPulsePose: a ring that swells off the attacker and fades out', () => {
  assert.equal(auraPulsePose(0).opacity, 0);
  assert.ok(auraPulsePose(0.2).opacity > 0.99);
  assert.ok(auraPulsePose(1).opacity < 0.01);
  assert.ok(auraPulsePose(1).scale > auraPulsePose(0).scale);
  assert.deepEqual(auraPulsePose(-4), auraPulsePose(0));
  assert.deepEqual(auraPulsePose(9), auraPulsePose(1));
  assert.ok(AURA_PULSE_MS > 0);
});

test('hitRecoilPose: rests at both ends and peaks at 0.12 card heights early', () => {
  assert.equal(hitRecoilPose(0).along, 0);
  assert.ok(Math.abs(hitRecoilPose(1).along) < 1e-9);
  assert.ok(Math.abs(hitRecoilPose(0.18).along - 0.12) < 1e-9);
  for (let t = 0; t <= 1; t += 0.05) {
    const { along } = hitRecoilPose(t);
    assert.ok(along >= 0 && along <= 0.12 + 1e-9, `t=${t} along=${along}`);
  }
  assert.equal(hitRecoilPose(-1).along, 0);
  assert.ok(HIT_RECOIL_MS > 0);
});
