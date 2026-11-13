// Design 089 D5: the pose maths of the gap effects (board-fx.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attackFailText,
  blockPose,
  blockSpark,
  blockTagText,
  enterDust,
  enterPose,
  fizzlePose,
  fizzlePuff,
  healMote,
  healPose,
  powerFlarePose,
  powerGlint,
  prizeClaimPose,
  prizeClaimStarAngles,
  prizePulsePose,
  tagPose,
} from '../board-fx.mjs';

const TIMES = Array.from({ length: 41 }, (_, i) => i / 40);
const unit = (value, label) => assert.ok(value >= 0 && value <= 1, `${label}: ${value}`);

test('every layer starts and ends invisible, and its alpha stays in [0, 1]', () => {
  const layers = {
    'block plate': (t) => blockPose(t).plate.alpha,
    'block cells': (t) => blockPose(t).cells.alpha * 2,
    'block sheen': (t) => blockPose(t).sheen.alpha,
    'block ring': (t) => blockPose(t).ring.alpha,
    'block spark': (t) => blockSpark(t, 2, 7, 5).alpha * (blockPose(t).sparks.travel > 0 ? 1 : 0),
    'fizzle puff': (t) => fizzlePuff(t, 1, 6, 5).alpha,
    'heal glow': (t) => healPose(t).glow.alpha,
    'heal ring': (t) => healPose(t).ring.alpha,
    'heal mote': (t) => Math.max(0, healMote(t, 3, 11, 5).alpha),
    'enter ring': (t) => enterPose(t).ring.alpha,
    'enter dust': (t) => enterDust(t, 2, 7, 5).alpha,
    'prize pulse': (t) => prizePulsePose(t, 2, 6).alpha,
    'prize claim halo': (t) => prizeClaimPose(t).halo,
    'prize claim edge': (t) => prizeClaimPose(t).edge,
    'prize claim rise': (t) => prizeClaimPose(t).rise,
    'power halo': (t) => powerFlarePose(t).halo.alpha,
    'power edge': (t) => powerFlarePose(t).edge.alpha,
    'power sheen': (t) => powerFlarePose(t).sheen.alpha,
    'power glint': (t) => powerGlint(t, 3, 8, 5).alpha,
    tag: (t) => tagPose(t).opacity,
  };
  for (const [name, alphaAt] of Object.entries(layers)) {
    for (const t of TIMES) unit(alphaAt(t), `${name} at ${t}`);
    assert.ok(alphaAt(0) < 0.02, `${name} starts invisible`);
    assert.ok(alphaAt(1) < 0.02, `${name} ends invisible`);
    assert.ok(Math.max(...TIMES.map(alphaAt)) > 0.3, `${name} shows in between`);
  }
});

test('the shield snaps on larger than the card and settles on it; its ring leaves; its glint crosses once', () => {
  assert.ok(blockPose(0).plate.scale > 1.2);
  assert.ok(Math.abs(blockPose(0.3).plate.scale - 1) < 0.03);
  assert.ok(blockPose(0.6).ring.scale > blockPose(0.1).ring.scale + 0.3);
  assert.equal(blockPose(0.05).sheen.sweep, 0);
  assert.equal(blockPose(0.5).sheen.sweep, 1);
});

test('the power flare beats twice, and a glint crosses the card with each beat', () => {
  const halo = TIMES.map((t) => powerFlarePose(t).halo.alpha);
  const peaks = halo.filter((value, i) => i > 0 && i < halo.length - 1 && value > halo[i - 1] && value >= halo[i + 1]);
  assert.equal(peaks.length, 2);
  assert.ok(powerFlarePose(0.3).sheen.sweep > powerFlarePose(0.1).sheen.sweep);
  assert.ok(powerFlarePose(0.5).sheen.sweep < powerFlarePose(0.3).sheen.sweep, 'the second glint starts over');
});

test('sparks, puffs, motes and dust are thrown the same way for the same seed, differently for another', () => {
  for (const sample of [blockSpark, fizzlePuff, healMote, enterDust, powerGlint]) {
    assert.deepEqual(sample(0.5, 2, 7, 9), sample(0.5, 2, 7, 9), sample.name);
    assert.notDeepEqual(sample(0.5, 2, 7, 9), sample(0.5, 2, 7, 10), sample.name);
  }
});

test('a heal mote rises off the card and shrinks as it goes', () => {
  const early = healMote(0.2, 0, 11, 3);
  const late = healMote(0.5, 0, 11, 3);
  assert.ok(late.rise > early.rise);
  assert.ok(late.size < early.size);
});

test('a failed attack sags and comes back; a landing card drops its height and settles at its size', () => {
  assert.ok(fizzlePose(0.16).droop.scale < 0.98);
  assert.equal(fizzlePose(1).droop.scale, 1);
  assert.ok(Math.abs(fizzlePose(1).droop.yawDeg) < 1e-9);
  assert.ok(enterPose(0).drop.lift > 0.1);
  assert.equal(enterPose(0.3).drop.lift, 0);
  assert.ok(Math.abs(enterPose(1).drop.scale - 1) < 1e-9);
});

test('the Prize pulse lights the slots one after another, a glint crossing each', () => {
  assert.ok(prizePulsePose(0.15, 0, 6).alpha > prizePulsePose(0.15, 5, 6).alpha);
  assert.ok(prizePulsePose(0.75, 5, 6).alpha > prizePulsePose(0.75, 0, 6).alpha);
  assert.ok(prizePulsePose(0.4, 0, 6).sweep > prizePulsePose(0.1, 0, 6).sweep);
});

test('the tags and the failed-attack banner say why', () => {
  assert.equal(blockTagText(), 'No damage');
  assert.equal(blockTagText({ survived: true }), 'Survived');
  assert.equal(blockTagText({ retreat: true }), "Can't retreat");
  assert.deepEqual(attackFailText('Thunder', 'prevented'), { title: 'Thunder', sub: 'Attack prevented' });
  assert.deepEqual(attackFailText(undefined, 'confused'), { title: 'Confused', sub: 'Hurt itself in confusion' });
  assert.deepEqual(attackFailText('  ', 'nothing-to-copy'), { title: 'Attack', sub: 'Nothing to copy' });
  assert.deepEqual(attackFailText('Hit', 'unknown'), { title: 'Hit', sub: 'Attack failed' });
});

test('design 089: the Prize claim lights the row at once (its peak is early) and its glint only moves forward', () => {
  const peakAt = (key) => TIMES.reduce((best, t) => (prizeClaimPose(t)[key] > prizeClaimPose(best)[key] ? t : best), 0);
  assert.ok(peakAt('edge') <= 0.15, `the edge snaps on: ${peakAt('edge')}`);
  assert.ok(peakAt('halo') <= 0.2, `the halo follows: ${peakAt('halo')}`);
  let last = -1;
  for (const t of TIMES) {
    const { sweep } = prizeClaimPose(t);
    assert.ok(sweep >= last, `sweep at ${t}`);
    unit(sweep, `sweep at ${t}`);
    last = sweep;
  }
  assert.deepEqual(prizeClaimPose(-3), prizeClaimPose(0));
  assert.deepEqual(prizeClaimPose(9), prizeClaimPose(1));
});

test('design 089: the claim throws a star to each side of the row per card taken, none along it', () => {
  assert.deepEqual(prizeClaimStarAngles(0), []);
  assert.deepEqual(prizeClaimStarAngles('junk'), []);
  assert.deepEqual(prizeClaimStarAngles(1), [0, Math.PI]);
  for (const count of [1, 2, 3, 6]) {
    const angles = prizeClaimStarAngles(count);
    assert.equal(angles.length, count * 2);
    assert.equal(angles.filter((a) => Math.cos(a) > 0).length, count, 'half to each side');
    for (const angle of angles) assert.ok(Math.abs(Math.cos(angle)) > 0.3, `sideways, not along the column: ${angle}`);
  }
});
