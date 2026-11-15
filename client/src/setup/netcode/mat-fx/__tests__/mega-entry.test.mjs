import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MEGA_BURST_MS,
  MEGA_COMET_TAIL,
  MEGA_ENTRY_MS,
  MEGA_HIT_STOP_MS,
  MEGA_HOLD_MS,
  MEGA_PALETTE,
  MEGA_SHELL_RADIUS,
  buildMegaScene,
  megaCardPose,
  megaCometPose,
  megaMotePose,
  megaPiecePose,
  megaPoolPose,
  megaShellPose,
  megaSparklePose,
  megaStrain,
  megaWispPose,
} from '../mega-entry.mjs';

const RELEASE_MS = MEGA_BURST_MS + MEGA_HIT_STOP_MS;
const finite = (pose) => Object.values(pose).every((v) => Number.isFinite(v));
const CARD_CORNER = Math.hypot(0.358, 0.5);

test('the timeline: burst on the sample peak, a short hit stop, hold into the dissipation', () => {
  assert.equal(MEGA_BURST_MS, 1350);
  assert.ok(MEGA_HIT_STOP_MS >= 40 && MEGA_HIT_STOP_MS <= 80);
  assert.ok(MEGA_HOLD_MS > RELEASE_MS && MEGA_HOLD_MS < MEGA_ENTRY_MS);
  assert.ok(MEGA_ENTRY_MS - RELEASE_MS > MEGA_BURST_MS * 0.8, 'dissipation is the longest phase');
  assert.ok(MEGA_SHELL_RADIUS > CARD_CORNER, 'the shell clears the card corners');
  for (const key of ['deep', 'body', 'hot', 'rim']) {
    assert.ok(MEGA_PALETTE[key].length === 3 && MEGA_PALETTE[key].every((v) => v >= 0 && v <= 255), key);
    assert.ok(Math.min(...MEGA_PALETTE[key]) < 200, `${key} keeps its hue (no white stop)`);
  }
});

test('buildMegaScene: seeded and complete', () => {
  const scene = buildMegaScene(4);
  assert.deepEqual(buildMegaScene(4), scene);
  assert.notDeepEqual(buildMegaScene(5).pieces[0], scene.pieces[0]);
  assert.equal(scene.comets.length, 3);
  assert.ok(scene.comets.some((c) => c.warm) && scene.comets.some((c) => !c.warm), 'orange and blue');
  assert.ok(scene.comets.some((c) => c.spin > 0) && scene.comets.some((c) => c.spin < 0), 'they turn both ways');
  assert.ok(scene.pieces.length >= 12 && scene.sparkles.length >= 20 && scene.motes.length >= 10 && scene.wisps.length >= 4);
  for (const piece of scene.pieces) assert.ok(piece.lift > 0 && piece.lift < 1 && piece.up > 0 && piece.speed > 0);
});

test('megaCardPose: braces, swells, holds at the burst, slams and settles to rest', () => {
  assert.deepEqual(megaCardPose(0), { lift: 0, scale: 1, yawDeg: 0, x: 0, y: 0, rim: 0 });
  assert.ok(megaCardPose(190).scale < 1, 'it dips as it braces');
  const swollen = megaCardPose(MEGA_BURST_MS);
  assert.ok(swollen.scale > 1.05 && swollen.lift > 0.2 && swollen.rim === 1);
  assert.deepEqual(megaCardPose(RELEASE_MS - 1), swollen, 'the hit stop holds the pose');
  assert.deepEqual([swollen.yawDeg, swollen.x, swollen.y], [0, 0, 0], 'still at the burst');
  const landed = megaCardPose(RELEASE_MS + 120);
  assert.ok(Math.abs(landed.lift) < 1e-9 && landed.scale < 1, 'it lands squashed');
  const rest = megaCardPose(MEGA_ENTRY_MS);
  assert.ok(Math.abs(rest.scale - 1) < 0.005 && rest.lift === 0 && rest.rim < 1e-9, 'frame 7 is frame 1');
  let shook = 0;
  for (let ms = 0; ms <= MEGA_ENTRY_MS; ms += 10) {
    const pose = megaCardPose(ms);
    assert.ok(finite(pose) && pose.lift >= 0 && pose.rim >= 0 && pose.rim <= 1 && Math.abs(pose.x) < 0.02 && Math.abs(pose.y) < 0.02);
    if (pose.x !== 0) shook += 1;
  }
  assert.ok(shook > 5, 'it shakes under the strain');
});

test('megaShellPose: closes, spins up, cracks, holds, is eaten away after the release', () => {
  assert.equal(megaShellPose(0), null);
  assert.equal(megaShellPose(350), null, 'no shell while the card ignites');
  const young = megaShellPose(420);
  assert.ok(young.radius < MEGA_SHELL_RADIUS * 0.7 && young.alpha > 0 && young.crack === 0);
  const whole = megaShellPose(950);
  assert.ok(Math.abs(whole.radius - MEGA_SHELL_RADIUS) < 0.01 && whole.alpha === 1 && whole.thickness === 1 && whole.dissolve === 0);
  const strained = megaShellPose(MEGA_BURST_MS);
  assert.ok(strained.crack === 1 && strained.heat === 1 && strained.radius > whole.radius);
  assert.deepEqual(megaShellPose(RELEASE_MS - 1), strained, 'held through the hit stop');
  const breaking = megaShellPose(RELEASE_MS + 80);
  assert.ok(breaking.dissolve > 0 && breaking.dissolve < 1 && breaking.radius > strained.radius, 'it swells as it breaks');
  assert.equal(megaShellPose(RELEASE_MS + 170), null);
  let lastTurn = -1;
  let lastRate = 0;
  for (let ms = 380; ms <= MEGA_BURST_MS; ms += 20) {
    const pose = megaShellPose(ms);
    assert.ok(finite(pose));
    const rate = pose.turn - lastTurn;
    if (lastTurn >= 0) assert.ok(rate >= lastRate - 1e-9, 'it only spins faster');
    lastRate = lastTurn >= 0 ? rate : 0;
    lastTurn = pose.turn;
  }
});

test('megaStrain and megaPoolPose: strain rises into the burst; the pool flares there and dies', () => {
  assert.equal(megaStrain(900), 0);
  assert.equal(megaStrain(MEGA_BURST_MS), 1);
  assert.equal(megaPoolPose(0).alpha, 0);
  assert.ok(megaPoolPose(800).alpha > 0.4);
  assert.equal(megaPoolPose(MEGA_BURST_MS).alpha, 1);
  assert.ok(megaPoolPose(MEGA_ENTRY_MS).alpha < 1e-9);
});

test('megaMotePose: a streak drawn into the card, over before the shell is whole', () => {
  for (const mote of buildMegaScene(2).motes) {
    assert.equal(megaMotePose(mote, mote.lag), null);
    const early = megaMotePose(mote, mote.lag + 40);
    const late = megaMotePose(mote, mote.lag + 330);
    assert.ok(finite(early) && finite(late) && Math.hypot(late.x, late.y) < Math.hypot(early.x, early.y));
    assert.equal(megaMotePose(mote, 900), null);
  }
});

test('megaCometPose: spirals in to a ring outside the shell; one unbroken tail; flung off at the burst', () => {
  for (const comet of buildMegaScene(9).comets) {
    assert.equal(megaCometPose(comet, 0, 100), null);
    const far = megaCometPose(comet, 0, 180);
    const ringed = megaCometPose(comet, 0, 1100);
    const spanOf = (p) => Math.hypot(p.x, p.y, p.z - 0.22);
    assert.ok(spanOf(far) > 1.5, 'it comes from wide of the card');
    assert.ok(Math.abs(spanOf(ringed) - MEGA_SHELL_RADIUS * 1.1) < 0.02, 'it closes onto a ring just outside the shell');
    // At its fastest the tail still overlaps point to point.
    const head = megaCometPose(comet, 0, MEGA_BURST_MS - 10);
    const next = megaCometPose(comet, 1, MEGA_BURST_MS - 10);
    assert.ok(Math.hypot(head.x - next.x, head.y - next.y, head.z - next.z) < head.size, 'no gap between tail points');
    const tailEnd = megaCometPose(comet, MEGA_COMET_TAIL - 1, 1100);
    assert.ok(tailEnd.alpha < 0.01 && tailEnd.size < ringed.size, 'the tail thins to nothing');
    const flung = megaCometPose(comet, 0, RELEASE_MS + 200);
    assert.ok(Math.hypot(flung.x, flung.y) > Math.hypot(ringed.x, ringed.y) && flung.alpha < ringed.alpha);
    assert.equal(megaCometPose(comet, 0, RELEASE_MS + 380), null);
    for (let ms = 130; ms < RELEASE_MS + 380; ms += 25) assert.ok(megaCometPose(comet, 3, ms).z >= 0.03, 'never under the cloth');
  }
});

test('megaPiecePose: thrown from the shell, out and up; it falls back and dissolves', () => {
  for (const piece of buildMegaScene(6).pieces) {
    assert.equal(megaPiecePose(piece, RELEASE_MS - 1), null);
    const first = megaPiecePose(piece, RELEASE_MS);
    const startOut = Math.hypot(first.x, first.y);
    assert.ok(startOut <= MEGA_SHELL_RADIUS + 1e-9, 'it starts on the shell');
    let last = first;
    let peak = first.z;
    for (let ms = RELEASE_MS; ms <= MEGA_ENTRY_MS; ms += 10) {
      const pose = megaPiecePose(piece, ms);
      if (!pose) break;
      assert.ok(finite(pose) && pose.z > 0 && pose.size > 0 && pose.dissolve >= last.dissolve);
      peak = Math.max(peak, pose.z);
      last = pose;
    }
    assert.ok(peak > first.z && Math.hypot(last.x, last.y) > startOut && last.z < peak, 'it has risen, gone outward and come back down');
    assert.equal(megaPiecePose(piece, MEGA_ENTRY_MS), null, 'nothing is left when the scene ends');
  }
});

test('sparkles and wisps leave the shell after the burst and are gone by the end', () => {
  const scene = buildMegaScene(3);
  for (const sparkle of scene.sparkles) {
    assert.equal(megaSparklePose(sparkle, RELEASE_MS), null);
    const mid = megaSparklePose(sparkle, RELEASE_MS + 150);
    assert.ok(mid && finite(mid) && mid.alpha > 0);
    assert.equal(megaSparklePose(sparkle, MEGA_ENTRY_MS), null);
  }
  for (const wisp of scene.wisps) {
    assert.equal(megaWispPose(wisp, RELEASE_MS), null);
    const early = megaWispPose(wisp, RELEASE_MS + 100);
    const late = megaWispPose(wisp, RELEASE_MS + 700);
    assert.ok(late.radius > early.radius && late.dissolve > early.dissolve, 'smoke swells and thins; it never shrinks');
    assert.equal(megaWispPose(wisp, RELEASE_MS + 800), null);
  }
});
