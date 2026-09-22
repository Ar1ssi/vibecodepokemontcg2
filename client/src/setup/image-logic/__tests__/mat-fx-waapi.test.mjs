import { test } from 'node:test';
import assert from 'node:assert/strict';
import { animateFrames, removeWhen, sampleKeyframes } from '../mat-fx.mjs';

test('sampleKeyframes: n+1 frames, offsets 0..1, pose mapped', () => {
  const frames = sampleKeyframes((t) => ({ v: t * 2 }), (p) => ({ opacity: p.v }), 4);
  assert.equal(frames.length, 5);
  assert.deepEqual(frames.map((f) => f.offset), [0, 0.25, 0.5, 0.75, 1]);
  assert.equal(frames[4].opacity, 2);
  assert.equal(sampleKeyframes(() => ({}), () => ({}), 0).length, 3);
});

test('animateFrames: without WAAPI applies the final frame and resolves (edge 1)', async () => {
  const el = { style: {} };
  await animateFrames(el, [{ opacity: 0, offset: 0 }, { opacity: 1, transform: 'scale(2)', offset: 1 }], {
    duration: 100,
  });
  assert.equal(el.style.opacity, '1');
  assert.equal(el.style.transform, 'scale(2)');
  assert.equal(el.style.offset, undefined);
});

test('animateFrames: a cancelled animation still resolves', async () => {
  const el = { animate: () => ({ finished: Promise.reject(new Error('AbortError')) }) };
  await animateFrames(el, [], { duration: 10 });
});

test('removeWhen: removes once after all settle', async () => {
  let removed = 0;
  const host = { remove: () => (removed += 1) };
  let release;
  const gate = new Promise((r) => (release = r));
  removeWhen(host, [gate, Promise.resolve()], 5000);
  await Promise.resolve();
  assert.equal(removed, 0);
  release();
  await gate;
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(removed, 1);
});

test('removeWhen: backstop removes a host whose animation never finishes (edge 2)', async () => {
  let removed = 0;
  const host = { remove: () => (removed += 1) };
  removeWhen(host, [new Promise(() => {})], 5);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(removed, 1);
});
