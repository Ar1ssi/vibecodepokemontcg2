import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AMBIENT_FRAME_MS, createFramePacer } from '../frame-pacer.mjs';

// A display ticking every `tickMs`; the test advances it one tick at a time.
const setup = ({ tickMs = 1000 / 60 } = {}) => {
  let time = 0;
  let queued = [];
  const drawn = [];
  const pacer = createFramePacer({
    onFrame: (kind) => drawn.push({ kind, at: time }),
    requestFrame: (fn) => {
      queued.push(fn);
      return queued.length;
    },
    cancelFrame: () => {
      queued = [];
    },
    now: () => time,
  });
  const tick = (count = 1) => {
    for (let i = 0; i < count; i += 1) {
      time += tickMs;
      const run = queued;
      queued = [];
      for (const fn of run) fn();
    }
  };
  return { pacer, drawn, tick, queued: () => queued.length };
};

describe('createFramePacer', () => {
  it('draws a change on the next frame, once however often it was asked for', () => {
    const { pacer, drawn, tick } = setup();
    pacer.invalidate();
    pacer.invalidate();
    tick();
    assert.deepEqual(drawn.map((f) => f.kind), ['change']);
    tick(3);
    assert.equal(drawn.length, 1, 'nothing asked for, nothing drawn');
  });

  it('holds ambient-only frames to the ambient rate on a 60 Hz display', () => {
    const { pacer, drawn, tick } = setup();
    pacer.invalidate();
    tick();
    for (let i = 0; i < 60; i += 1) {
      pacer.invalidateAmbient();
      tick();
    }
    const ambient = drawn.filter((f) => f.kind === 'ambient');
    assert.ok(ambient.length >= 28 && ambient.length <= 31, `about 30 ambient frames a second, got ${ambient.length}`);
    for (let i = 1; i < drawn.length; i += 1) {
      assert.ok(drawn[i].at - drawn[i - 1].at >= AMBIENT_FRAME_MS - 4, 'no two ambient frames closer than the ambient interval');
    }
  });

  it('holds ambient frames on a 144 Hz display too', () => {
    const { pacer, drawn, tick } = setup({ tickMs: 1000 / 144 });
    pacer.invalidateAmbient();
    for (let i = 0; i < 144; i += 1) {
      tick();
      pacer.invalidateAmbient();
    }
    assert.ok(drawn.length >= 27 && drawn.length <= 31, `about 30 frames a second, got ${drawn.length}`);
  });

  it('a change during an ambient wait draws on the very next frame', () => {
    const { pacer, drawn, tick } = setup();
    pacer.invalidate();
    tick();
    pacer.invalidateAmbient();
    tick();
    assert.equal(drawn.length, 1, 'the ambient frame is not due yet');
    pacer.invalidate();
    tick();
    assert.deepEqual(drawn.map((f) => f.kind), ['change', 'change']);
  });

  it('keeps a frame pending while an ambient frame waits, and none once drawn', () => {
    const { pacer, tick } = setup();
    pacer.invalidate();
    tick();
    pacer.invalidateAmbient();
    assert.equal(pacer.pending(), true);
    tick(2);
    assert.equal(pacer.pending(), false);
  });

  it('dispose cancels the pending frame and ignores later requests', () => {
    const { pacer, drawn, tick, queued } = setup();
    pacer.invalidate();
    pacer.dispose();
    assert.equal(queued(), 0);
    pacer.invalidate();
    pacer.invalidateAmbient();
    tick(3);
    assert.deepEqual(drawn, []);
  });

  it('needs onFrame and requestFrame', () => {
    assert.throws(() => createFramePacer({ requestFrame: () => 1 }), TypeError);
    assert.throws(() => createFramePacer({ onFrame: () => {} }), TypeError);
  });
});
