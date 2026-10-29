import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXIT_MS, INTRO_MS, createEnvironmentTimeline } from '../stadium-environment-timeline.mjs';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);

test('enter: reveals the target over the mat in INTRO_MS, eased out', () => {
  const timeline = createEnvironmentTimeline();
  assert.equal(timeline.setTarget('scorched-earth'), true);
  assert.equal(timeline.play(), INTRO_MS);
  timeline.start(0);
  const mid = timeline.frame(800);
  assert.equal(mid.key, 'scorched-earth');
  assert.equal(mid.under, null);
  near(mid.reveal, 1 - 0.5 ** 3);
  assert.equal(mid.animating, true);
  assert.deepEqual(timeline.frame(INTRO_MS), { key: 'scorched-earth', under: null, reveal: 1, exit: 0, animating: false });
  assert.deepEqual(timeline.current(), { shown: 'scorched-earth', target: 'scorched-earth', phase: null });
});

test('the phase clock waits for start: the frame holds the reveal at 0 until the board is ready', () => {
  const timeline = createEnvironmentTimeline();
  timeline.setTarget('magma-basin');
  timeline.play();
  assert.equal(timeline.frame(5000).reveal, 0);
  timeline.start(5000);
  timeline.start(5400);
  near(timeline.frame(5800).reveal, 1 - 0.5 ** 3);
});

test('exit: the shown board dissolves in EXIT_MS, eased in, then none shows', () => {
  const timeline = createEnvironmentTimeline();
  timeline.setTarget('scorched-earth');
  timeline.settle();
  assert.equal(timeline.setTarget(null), true);
  assert.equal(timeline.play(), EXIT_MS);
  timeline.start(100);
  const mid = timeline.frame(100 + EXIT_MS / 2);
  assert.equal(mid.key, 'scorched-earth');
  assert.equal(mid.reveal, 1);
  near(mid.exit, 0.25);
  assert.deepEqual(timeline.frame(100 + EXIT_MS), { key: null, under: null, reveal: 1, exit: 0, animating: false });
});

test('swap: the incoming board reveals over the outgoing one, which is dropped at the end', () => {
  const timeline = createEnvironmentTimeline();
  timeline.setTarget('scorched-earth');
  timeline.settle();
  timeline.setTarget('surfing-beach');
  assert.equal(timeline.play({ swapReady: true }), INTRO_MS);
  timeline.start(0);
  const mid = timeline.frame(10);
  assert.equal(mid.key, 'surfing-beach');
  assert.equal(mid.under, 'scorched-earth');
  assert.ok(mid.reveal > 0 && mid.reveal < 1);
  assert.deepEqual(timeline.frame(1700), { key: 'surfing-beach', under: null, reveal: 1, exit: 0, animating: false });
});

test('a change the outgoing board cannot underlay reveals over the mat instead', () => {
  const timeline = createEnvironmentTimeline();
  timeline.setTarget('scorched-earth');
  timeline.settle();
  timeline.setTarget('surfing-beach');
  timeline.play({ swapReady: false });
  timeline.start(0);
  assert.equal(timeline.frame(10).under, null);
  assert.equal(timeline.current().phase, 'enter');
});

test('an unchanged target: setTarget answers false and play holds nothing', () => {
  const timeline = createEnvironmentTimeline();
  assert.equal(timeline.setTarget(null), false);
  assert.equal(timeline.play(), 0);
  timeline.setTarget('lumiose-city');
  timeline.settle();
  assert.equal(timeline.setTarget('lumiose-city'), false);
  assert.equal(timeline.play(), 0);
});

test('two changes before the first plan runs: the plan plays to the latest target, the second holds 0', () => {
  const timeline = createEnvironmentTimeline();
  timeline.setTarget('scorched-earth');
  timeline.setTarget('surfing-beach');
  assert.equal(timeline.play(), INTRO_MS);
  assert.equal(timeline.frame(0).key, 'surfing-beach');
  timeline.start(0);
  timeline.frame(INTRO_MS);
  assert.equal(timeline.play(), 0);
});

test('play mid-transition ends the running one where it was headed, then starts the next', () => {
  const timeline = createEnvironmentTimeline();
  timeline.setTarget('scorched-earth');
  timeline.play();
  timeline.start(0);
  timeline.setTarget(null);
  assert.equal(timeline.play(), EXIT_MS);
  const frame = timeline.frame(0);
  assert.equal(frame.key, 'scorched-earth');
  assert.equal(frame.exit, 0);
  assert.equal(timeline.current().phase, 'exit');
});

test('settle mid-reveal snaps to the target, fully shown, nothing animating', () => {
  const timeline = createEnvironmentTimeline();
  timeline.setTarget('scorched-earth');
  timeline.play();
  timeline.start(0);
  timeline.settle();
  assert.deepEqual(timeline.frame(10), { key: 'scorched-earth', under: null, reveal: 1, exit: 0, animating: false });
  timeline.setTarget(null);
  timeline.settle();
  assert.equal(timeline.frame(20).key, null);
});
