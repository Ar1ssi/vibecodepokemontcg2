import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFxQueue } from '../fx-queue.mjs';

// Fake clock: `schedule` records the callback and its delay; `tick()` runs the
// single armed timer. The queue never arms more than one at a time.
const fakeClock = () => {
  let armed = null;
  let nextId = 1;
  const delays = [];
  return {
    delays,
    schedule: (fn, ms) => {
      delays.push(ms);
      armed = { id: nextId, fn };
      return nextId++;
    },
    cancel: () => {
      armed = null;
    },
    tick() {
      const current = armed;
      armed = null;
      current?.fn();
      return !!current;
    },
    drain(limit = 50) {
      let n = 0;
      while (this.tick() && n < limit) n += 1;
      return n;
    },
    get armed() {
      return armed;
    },
  };
};

const make = (run, over = {}) => {
  const clock = fakeClock();
  const queue = createFxQueue({ run, schedule: clock.schedule, cancel: clock.cancel, ...over });
  return { queue, clock };
};

test('fx-queue: the first plan runs synchronously on push', () => {
  const ran = [];
  const { queue } = make((p) => {
    ran.push(p.id);
    return 100;
  });
  queue.push({ id: 'a' });
  assert.deepEqual(ran, ['a']);
  assert.equal(queue.pending(), 0);
});

test('fx-queue: later plans wait for the previous hold, in arrival order', () => {
  const ran = [];
  const { queue, clock } = make((p) => {
    ran.push(p.id);
    return p.hold;
  });
  queue.push({ id: 'a', hold: 100 });
  queue.push({ id: 'b', hold: 50 });
  queue.push({ id: 'c', hold: 0 });

  assert.deepEqual(ran, ['a'], 'b and c wait');
  assert.equal(queue.pending(), 2);
  clock.tick();
  assert.deepEqual(ran, ['a', 'b']);
  clock.tick();
  assert.deepEqual(ran, ['a', 'b', 'c']);
  assert.deepEqual(clock.delays, [100, 50, 0], 'each wait is the PREVIOUS plan’s hold');
});

test('fx-queue: holds collapse to 0 once the budget is spent, and the queue drains', () => {
  const ran = [];
  const { queue, clock } = make(
    (p) => {
      ran.push(p.id);
      return 100;
    },
    { maxQueueMs: 250 }
  );
  for (let i = 0; i < 8; i += 1) queue.push({ id: i });
  clock.drain();

  assert.equal(ran.length, 8, 'every plan still played');
  assert.equal(queue.pending(), 0);
  // 100 + 100 + 100 reaches 300 >= 250, so every later wait is 0.
  assert.deepEqual(clock.delays, [100, 100, 100, 0, 0, 0, 0, 0]);
});

test('fx-queue: the budget resets once the queue goes idle', () => {
  const { queue, clock } = make(() => 100, { maxQueueMs: 150 });
  queue.push({ id: 'a' });
  queue.push({ id: 'b' });
  clock.drain();
  assert.equal(queue.pending(), 0);

  clock.delays.length = 0;
  queue.push({ id: 'c' });
  queue.push({ id: 'd' });
  assert.deepEqual(clock.delays, [100], 'full hold again after idling');
});

test('fx-queue: a throwing run does not wedge the chain', () => {
  const ran = [];
  const { queue, clock } = make((p) => {
    ran.push(p.id);
    if (p.id === 'a') throw new Error('effect blew up');
    return 40;
  });
  queue.push({ id: 'a' });
  queue.push({ id: 'b' });
  clock.drain();
  assert.deepEqual(ran, ['a', 'b']);
});

test('fx-queue: a non-numeric hold paces as 0', () => {
  const { queue, clock } = make(() => undefined);
  queue.push({ id: 'a' });
  queue.push({ id: 'b' });
  assert.deepEqual(clock.delays, [0]);
  clock.drain();
  assert.equal(queue.pending(), 0);
});

test('fx-queue: clear drops pending plans without running them', () => {
  const ran = [];
  const { queue, clock } = make((p) => {
    ran.push(p.id);
    return 500;
  });
  queue.push({ id: 'a' });
  queue.push({ id: 'b' });
  queue.clear();

  assert.deepEqual(ran, ['a'], 'b never ran');
  assert.equal(queue.pending(), 0);
  assert.equal(clock.armed, null);
});

test('fx-queue: a cleared queue accepts new work', () => {
  const ran = [];
  const { queue } = make((p) => ran.push(p.id));
  queue.push({ id: 'a' });
  queue.clear();
  queue.push({ id: 'b' });
  assert.deepEqual(ran, ['a', 'b']);
});

test('fx-queue: falsy pushes are ignored', () => {
  const ran = [];
  const { queue } = make((p) => ran.push(p));
  queue.push(null);
  queue.push(undefined);
  assert.deepEqual(ran, []);
  assert.equal(queue.pending(), 0);
});

test('fx-queue: an effect that clears the queue mid-run does not restart it', () => {
  // A real case: an effect dispatches `game-restarted`, whose listener clears.
  // The clear has to survive the `step` call it happened inside — otherwise
  // that call arms a fresh timer on top of the stop it was just asked for.
  const ran = [];
  let queue;
  const clock = fakeClock();
  queue = createFxQueue({
    run: (p) => {
      ran.push(p.id);
      if (p.id === 'b') queue.clear();
      return 100;
    },
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
  queue.push({ id: 'a' });
  queue.push({ id: 'b' });
  queue.push({ id: 'c' });
  clock.tick(); // runs 'b', which clears

  assert.deepEqual(ran, ['a', 'b'], 'c was dropped by the clear');
  assert.equal(queue.pending(), 0);
  assert.equal(clock.armed, null, 'the stop was not overwritten by a fresh timer');
});

test('fx-queue: an effect that pushes mid-run does not orphan a timer', () => {
  const ran = [];
  let queue;
  const clock = fakeClock();
  queue = createFxQueue({
    run: (p) => {
      ran.push(p.id);
      if (p.id === 'a') queue.push({ id: 'nested' });
      return 50;
    },
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
  queue.push({ id: 'a' });
  clock.drain();

  assert.deepEqual(ran, ['a', 'nested']);
  assert.equal(queue.pending(), 0);
  assert.equal(clock.armed, null, 'no leftover timer to fire a phantom step');
});

test('fx-queue: a blocking plan (coin ceremony) keeps its hold past the budget and does not spend it', () => {
  const { queue, clock } = make((p) => p.hold, { maxQueueMs: 1000 });
  queue.push({ id: 'banner', hold: 1200 });
  queue.push({ id: 'coin', hold: 3500, blocking: true });
  queue.push({ id: 'draw', hold: 300 });
  clock.drain();
  // The banner used up the budget; the ceremony still holds, the draw after it collapses.
  assert.deepEqual(clock.delays, [1200, 3500, 0]);

  const fresh = make((p) => p.hold, { maxQueueMs: 1000 });
  fresh.queue.push({ id: 'wait', hold: 3500, blocking: true });
  fresh.queue.push({ id: 'draw', hold: 600 });
  fresh.clock.drain();
  assert.deepEqual(fresh.clock.delays, [3500, 600], 'the wait left the budget for what follows it');
});
