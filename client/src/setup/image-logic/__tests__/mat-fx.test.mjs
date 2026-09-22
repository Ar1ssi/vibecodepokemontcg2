import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  FX_OFF_STORAGE_KEY,
  fxDisabled,
  motionReduced,
  REDUCE_MOTION_STORAGE_KEY,
  rectForInstance,
  runPose,
} from '../mat-fx.mjs';

const saved = {};
const setGlobal = (key, value) => {
  if (!(key in saved)) saved[key] = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
};
afterEach(() => {
  for (const [key, desc] of Object.entries(saved)) {
    if (desc) Object.defineProperty(globalThis, key, desc);
    else delete globalThis[key];
    delete saved[key];
  }
});

test('motionReduced: ignores the OS reduced-motion query', () => {
  setGlobal('matchMedia', () => ({ matches: true }));
  setGlobal('localStorage', { getItem: () => null });
  assert.equal(motionReduced(), false);
});

test('motionReduced: opt-in localStorage flag; missing or blocked storage -> false', () => {
  setGlobal('localStorage', undefined);
  assert.equal(motionReduced(), false);
  setGlobal('localStorage', { getItem: (k) => (k === REDUCE_MOTION_STORAGE_KEY ? '1' : null) });
  assert.equal(motionReduced(), true);
  setGlobal('localStorage', {
    getItem: () => {
      throw new Error('blocked');
    },
  });
  assert.equal(motionReduced(), false);
});

test('fxDisabled: body.fx-off class or localStorage flag', () => {
  setGlobal('document', undefined);
  assert.equal(fxDisabled(), false);
  setGlobal('document', { body: { classList: { contains: () => true } } });
  assert.equal(fxDisabled(), true);
  setGlobal('document', { body: { classList: { contains: () => false } } });
  setGlobal('localStorage', { getItem: (k) => (k === FX_OFF_STORAGE_KEY ? '1' : null) });
  assert.equal(fxDisabled(), true);
  setGlobal('localStorage', {
    getItem: () => {
      throw new Error('blocked');
    },
  });
  assert.equal(fxDisabled(), false);
});

test('runPose: poses at 0, ticks to 1, removes host, then calls onDone', () => {
  const frames = [];
  setGlobal('requestAnimationFrame', (fn) => frames.push(fn) && frames.length);
  setGlobal('cancelAnimationFrame', () => {});
  const seen = [];
  let removed = 0;
  let done = 0;
  const host = { remove: () => removed++ };
  runPose(host, 100, (t) => seen.push(t), () => done++);
  assert.deepEqual(seen, [0]);
  frames.shift()(1000);
  frames.shift()(1050);
  assert.equal(removed, 0);
  frames.shift()(1200);
  assert.deepEqual(seen, [0, 0, 0.5, 1]);
  assert.equal(removed, 1);
  assert.equal(done, 1);
  assert.equal(frames.length, 0);
});

test('runPose: cancel removes the host without onDone', () => {
  setGlobal('requestAnimationFrame', () => 7);
  let cancelled = null;
  setGlobal('cancelAnimationFrame', (id) => {
    cancelled = id;
  });
  let removed = 0;
  let done = 0;
  const cancel = runPose({ remove: () => removed++ }, 100, () => {}, () => done++);
  cancel();
  assert.equal(cancelled, 7);
  assert.equal(removed, 1);
  assert.equal(done, 0);
});

test('rectForInstance: null for missing, detached, or collapsed elements', () => {
  const el = (over) => ({
    isConnected: true,
    ownerDocument: {},
    getBoundingClientRect: () => ({ left: 5, top: 6, width: 40, height: 60 }),
    ...over,
  });
  const reg = new Map([
    ['ok', { element: el({}) }],
    ['gone', { element: el({ isConnected: false }) }],
    ['tiny', { element: el({ getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1 }) }) }],
  ]);
  assert.deepEqual(rectForInstance('ok', reg), { left: 5, top: 6, width: 40, height: 60 });
  assert.equal(rectForInstance('gone', reg), null);
  assert.equal(rectForInstance('tiny', reg), null);
  assert.equal(rectForInstance('missing', reg), null);
  assert.equal(rectForInstance('ok', null), null);
});
