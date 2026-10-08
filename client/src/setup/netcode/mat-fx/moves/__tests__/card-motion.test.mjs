import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTACKER_MOTIONS,
  ATTACKER_REST,
  DEFENDER_MOTIONS,
  DEFENDER_REST,
  KNOCK_MS,
  MOTION_PARAMS,
  attackerEndMs,
  attackerPose,
  defenderEndMs,
  defenderPose,
  springHome,
} from '../card-motion.mjs';
import { checkAgainst } from '../param-kinds.mjs';

const SCENE = { contactMs: 1000, durationMs: 1900 };
const sweep = (fn, to = 2600, step = 5) => {
  const out = [];
  for (let ms = 0; ms <= to; ms += step) out.push([ms, fn(ms)]);
  return out;
};
// -0 and 0 are the same pose; deepEqual tells them apart.
const norm = (pose) => Object.fromEntries(Object.entries(pose).map(([k, v]) => [k, typeof v === 'number' ? v + 0 : v]));
const finiteValues = (pose) => Object.values(pose).every((v) => typeof v === 'boolean' || Number.isFinite(v));

test('every attacker preset is the rest pose at ms 0 and after its last beat, finite throughout', () => {
  for (const name of Object.keys(ATTACKER_MOTIONS)) {
    const opts = { ...SCENE, params: {} };
    assert.deepEqual(norm(attackerPose(name, 0, opts)), ATTACKER_REST, `${name} at 0`);
    const end = attackerEndMs(name, SCENE);
    assert.deepEqual(norm(attackerPose(name, end + 1, opts)), ATTACKER_REST, `${name} after ${end}`);
    for (const [ms, pose] of sweep((t) => attackerPose(name, t, opts))) {
      assert.ok(finiteValues(pose), `${name} at ${ms}`);
    }
  }
});

test('every defender preset is the rest pose at ms 0 and after its last beat, finite throughout', () => {
  for (const name of Object.keys(DEFENDER_MOTIONS)) {
    const opts = { ...SCENE, params: {} };
    assert.deepEqual({ ...norm(defenderPose(name, 0, opts)), cold: false }, { ...DEFENDER_REST, cold: false }, `${name} at 0`);
    const end = defenderEndMs(name, { ...SCENE, params: {} });
    const after = defenderPose(name, end + 1, opts);
    assert.equal(after.heat, 0, `${name} heat after ${end}`);
    assert.equal(after.along, 0, `${name} along after ${end}`);
    assert.equal(after.lift, 0, `${name} lift after ${end}`);
    for (const [ms, pose] of sweep((t) => defenderPose(name, t, opts))) {
      assert.ok(finiteValues(pose), `${name} at ${ms}`);
    }
  }
});

test('unknown motions are the rest pose', () => {
  assert.equal(attackerPose('nope', 400, SCENE), ATTACKER_REST);
  assert.equal(defenderPose('nope', 400, SCENE), DEFENDER_REST);
  assert.equal(attackerEndMs('nope', SCENE), 0);
  assert.equal(defenderEndMs('nope', SCENE), 0);
});

test('rear-lurch reproduces the accepted Fire Blast beats', () => {
  const opts = { ...SCENE, params: { rear: 0.14, lurch: 0.4, glow: 1 } };
  const at = (ms) => attackerPose('rear-lurch', ms, opts);
  assert.ok(Math.abs(at(559.9).along + 0.14) < 1e-3, 'rear at the end of the wind-up');
  assert.ok(Math.abs(at(699.9).along - 0.26) < 1e-3, 'lurch at the end of the thrust');
  assert.ok(Math.abs(at(559.9).scale - 1.05) < 1e-3);
  assert.ok(at(300).glow > 0 && at(300).glow < 0.7);
  assert.equal(at(1200).along, 0);
});

test('knock peaks at its strength within 80 ms of contact and settles', () => {
  const opts = { ...SCENE, params: { strength: 0.3, heat: 1 } };
  const along = (ms) => defenderPose('knock', ms, opts).along;
  const peak = Math.max(...sweep(along, 1080, 2).filter(([ms]) => ms >= 1000).map(([, v]) => v));
  assert.ok(Math.abs(peak - 0.3) < 1e-3, `peak ${peak}`);
  assert.ok(Math.abs(along(1000 + KNOCK_MS + 5)) < 1e-9);
});

test('tremble is zero before 0.82 c and grows into contact', () => {
  const opts = { ...SCENE, params: {} };
  for (const ms of [0, 400, 819]) {
    const p = defenderPose('knock', ms, opts);
    assert.equal(p.across, 0);
    assert.equal(p.wobble, 0);
  }
  const amp = (from, to) =>
    Math.max(
      ...sweep((ms) => Math.abs(defenderPose('knock', ms, opts).across), to, 1)
        .filter(([ms]) => ms >= from)
        .map(([, v]) => v)
    );
  assert.ok(amp(950, 999) > amp(830, 880));
  assert.ok(amp(950, 999) <= 0.012 + 1e-9);
});

test('heat fades monotonically after contact for the heat-carrying presets', () => {
  for (const name of ['knock', 'stagger']) {
    const opts = { ...SCENE, params: { heat: 1 } };
    let last = Infinity;
    for (let ms = 1000; ms <= 1700; ms += 10) {
      const heat = defenderPose(name, ms, opts).heat;
      assert.ok(heat <= last + 1e-12, `${name} at ${ms}`);
      last = heat;
    }
    assert.equal(defenderPose(name, 1000, opts).heat, 1);
  }
});

test('stagger squashes once per hit', () => {
  for (const hits of [2, 3, 4]) {
    const opts = { ...SCENE, params: { hits, gapMs: 90, strength: 0.4 } };
    const dips = sweep((ms) => defenderPose('stagger', ms, opts).scaleAlong, 1800, 2).map(([, v]) => v);
    let peaks = 0;
    for (let i = 1; i < dips.length - 1; i += 1) {
      if (dips[i] < 0.9 && dips[i] <= dips[i - 1] && dips[i] < dips[i + 1]) peaks += 1;
    }
    assert.equal(peaks, hits, `${hits} hits`);
  }
});

test('stagger travels up to its total strength and ends at rest', () => {
  const opts = { ...SCENE, params: { hits: 3, gapMs: 90, strength: 0.4 } };
  const peak = Math.max(...sweep((ms) => defenderPose('stagger', ms, opts).along, 1700, 2).map(([, v]) => v));
  assert.ok(Math.abs(peak - 0.4) < 1e-3, `peak ${peak}`);
  assert.equal(defenderEndMs('stagger', { ...SCENE, params: { hits: 3, gapMs: 90 } }), 1000 + 180 + 650);
});

test('float lifts up the screen (positive lift), holds through the beat and drops', () => {
  const opts = { ...SCENE, params: { lift: 0.15 } };
  assert.equal(defenderPose('float', 1200, opts).lift, 0.15);
  assert.ok(defenderPose('float', 850, opts).lift > 0);
  assert.ok(defenderPose('float', 1899, opts).lift < 0.01);
  assert.equal(defenderPose('float', 1901, opts).lift, 0);
});

test('freeze flags a cold tint that fades over 900 ms', () => {
  const opts = { ...SCENE, params: {} };
  assert.equal(defenderPose('freeze', 1000, opts).cold, true);
  assert.ok(Math.abs(defenderPose('freeze', 1000, opts).heat - 0.8) < 1e-9);
  assert.equal(defenderPose('freeze', 1900, opts).heat, 0);
});

test('sink presses the card flat and settles', () => {
  const opts = { ...SCENE, params: {} };
  assert.ok(defenderPose('sink', 1100, opts).scaleAlong < 0.97);
  assert.equal(defenderPose('sink', 1500, opts).scaleAlong, 1);
});

test('lunge reach stops where its leading edge meets the defender (lane length - 0.9 h)', () => {
  const along = (laneH) => attackerPose('lunge', 999, { ...SCENE, params: {}, laneH }).along;
  assert.ok(Math.abs(along(5) - 0.9) < 0.01, 'long lane: the 0.9 h cap');
  assert.ok(Math.abs(along(1.2) - 0.3) < 0.01, 'close Actives: lane - 0.9 h');
  assert.ok(Math.abs(along(0.5) - 0) < 0.01, 'overlapping: no reach');
});

test('dash passes the defender, then returns along an arc', () => {
  const opts = { ...SCENE, params: {}, laneH: 4 };
  const pass = attackerPose('dash', 1000 + 0.15 * 1000 - 1, opts).along;
  assert.ok(pass > 0.9 + 0.2, `overshoot ${pass}`);
  const arc = Math.max(...sweep((ms) => Math.abs(attackerPose('dash', ms, opts).across), 1700, 5).map(([, v]) => v));
  assert.ok(arc > 0.3);
  assert.equal(attackerPose('dash', 1701, opts).along, 0);
});

test('spin turns the card a full turn per `turns` and ends upright', () => {
  const one = attackerPose('spin', 1299, { ...SCENE, params: { turns: 1 } }).tilt;
  const two = attackerPose('spin', 1299, { ...SCENE, params: { turns: 2 } }).tilt;
  assert.ok(Math.abs(one - 360) < 1);
  assert.ok(Math.abs(two - 720) < 1);
  assert.equal(attackerPose('spin', 1300, { ...SCENE, params: {} }).tilt, 0);
});

test('none pulses its glow when asked and otherwise stays still', () => {
  assert.equal(attackerPose('none', 500, { ...SCENE, params: {} }).glow, 0);
  assert.ok(attackerPose('none', 950, { ...SCENE, params: { glow: 1 } }).glow > 0.99);
});

test('springHome starts at 1 and decays', () => {
  assert.equal(springHome(0), 1);
  assert.ok(Math.abs(springHome(1)) < 1e-9);
});

test('motion param schemas reject bad values and unknown keys', () => {
  const schema = MOTION_PARAMS.attacker['rear-lurch'];
  assert.deepEqual(checkAgainst(schema, { rear: 0.14 }, 'a'), []);
  assert.equal(checkAgainst(schema, { rear: 9 }, 'a').length, 1);
  assert.equal(checkAgainst(MOTION_PARAMS.defender.stagger, { hits: 1 }, 'd').length, 1);
  assert.equal(checkAgainst(MOTION_PARAMS.defender.knock, { nope: 1 }, 'd').length, 1);
});

// ---- design 065 slice 4 ----------------------------------------------------------

test('lunge strikes 2: two local maxima of along in [0.4 c, c], the last at c', () => {
  const c = SCENE.contactMs;
  const opts = { ...SCENE, params: { strikes: 2 }, laneH: 2.4 };
  const series = [];
  for (let ms = 0.4 * c; ms <= c; ms += 5) series.push(attackerPose('lunge', ms, opts).along);
  const peaks = [];
  for (let i = 0; i < series.length; i += 1) {
    const left = i === 0 ? -Infinity : series[i - 1];
    const right = i === series.length - 1 ? -Infinity : series[i + 1];
    if (series[i] > left && series[i] >= right) peaks.push(i);
  }
  assert.equal(peaks.length, 2, JSON.stringify(peaks));
  assert.equal(peaks[1], series.length - 1, 'the last strike lands at contact');
  // strikes 1 is 063's lunge.
  for (let ms = 0; ms <= 1600; ms += 10) {
    assert.deepEqual(attackerPose('lunge', ms, { ...SCENE, params: { strikes: 1 }, laneH: 2.4 }), attackerPose('lunge', ms, { ...SCENE, params: {}, laneH: 2.4 }));
  }
});

test('warp shrinks to 0.15 by 0.3 c, hides, reappears short of the defender at contact, then springs home', () => {
  const c = SCENE.contactMs;
  const opts = { ...SCENE, params: {}, laneH: 2.4 };
  assert.equal(attackerPose('warp', 0.5 * c, opts).scale, 0.15);
  assert.equal(attackerPose('warp', 0.5 * c, opts).glow, 0);
  const strike = attackerPose('warp', c, opts);
  assert.ok(Math.abs(strike.along - 1.5) < 1e-9 && strike.scale === 1);
  assert.equal(attackerEndMs('warp', SCENE), 1.5 * c);
});

test('rear-lurch hold delays the thrust by hold ms', () => {
  const c = SCENE.contactMs;
  const thrustStart = (hold) => {
    const opts = { ...SCENE, params: { hold } };
    const rest = attackerPose('rear-lurch', 0.56 * c - 1, opts).along;
    for (let ms = 0.56 * c; ms < 2 * c; ms += 1) if (attackerPose('rear-lurch', ms, opts).along > rest + 1e-6) return ms;
    return null;
  };
  assert.equal(thrustStart(200) - thrustStart(0), 200);
  assert.equal(attackerEndMs('rear-lurch', { ...SCENE, params: { hold: 200 } }), 1.2 * c + 200);
  assert.deepEqual(norm(attackerPose('rear-lurch', 1.2 * c + 201, { ...SCENE, params: { hold: 200 } })), ATTACKER_REST);
});

test('stagger lead 450: the first knock lands 450 ms before contact, the last at contact', () => {
  const c = SCENE.contactMs;
  const opts = { ...SCENE, params: { hits: 3, lead: 450 } };
  const before = defenderPose('stagger', c - 452, opts);
  const first = defenderPose('stagger', c - 440, opts);
  assert.ok(before.scaleAlong === 1 && before.along === 0, 'nothing before the first knock');
  assert.ok(first.along > 0 && first.scaleAlong < 1, 'the first knock is landing');
  const last = defenderPose('stagger', c + 50, opts);
  assert.ok(last.along > first.along, 'the last knock lands at contact');
  assert.equal(defenderEndMs('stagger', { ...SCENE, params: { hits: 3, lead: 450 } }), c + 650);
  assert.deepEqual(checkAgainst(MOTION_PARAMS.defender.stagger, { lead: 450 }, 'x'), []);
});
