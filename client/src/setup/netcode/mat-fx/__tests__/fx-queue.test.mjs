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

test('fx-queue: the default budget (design 063) fits banner + tier-3 move + damage + status; only what follows a knockout collapses', () => {
  const holds = [1600, 1240, 180, 260, 900, 320];
  let next = 0;
  const { queue, clock } = make(() => holds[next++]);
  for (let i = 0; i < holds.length; i += 1) queue.push({ id: i });
  clock.drain();
  // Waits are the PREVIOUS plan's hold: 1600 + 1240 + 180 + 260 = 3280 < 3800 keeps the knockout's 900,
  // which then crosses the budget, so the prize claim's own hold collapses to nothing.
  assert.deepEqual(clock.delays, [1600, 1240, 180, 260, 900, 0]);
});

// A fake clock whose `now` follows the waits it has fired.
const timedClock = () => {
  const clock = fakeClock();
  let elapsed = 0;
  const tick = clock.tick.bind(clock);
  clock.tick = () => {
    if (clock.armed) elapsed += clock.delays[clock.delays.length - 1];
    return tick();
  };
  clock.now = () => elapsed;
  return clock;
};

test('fx-queue: the turn banner waits for an attack move still on screen past its hold', () => {
  const clock = timedClock();
  const started = [];
  const run = (p) => {
    started.push([p.id, clock.now()]);
    return p.timing;
  };
  const queue = createFxQueue({ run, schedule: clock.schedule, cancel: clock.cancel, now: clock.now });
  queue.push({ id: 'attack-banner', timing: 1600 });
  // The move hands over at contact (700) but stays up until 1300.
  queue.push({ id: 'attack', timing: { hold: 700, settle: 1300 } });
  queue.push({ id: 'turn-banner', timing: 260, awaitScenes: true });
  queue.push({ id: 'draw', timing: 0 });
  clock.drain();
  assert.deepEqual(started, [
    ['attack-banner', 0],
    ['attack', 1600],
    ['turn-banner', 2900],
    ['draw', 3160],
  ]);
});

test('fx-queue: a plan that does not await scenes still starts at the hold (contact overlap kept)', () => {
  const clock = timedClock();
  const started = [];
  const run = (p) => {
    started.push([p.id, clock.now()]);
    return p.timing;
  };
  const queue = createFxQueue({ run, schedule: clock.schedule, cancel: clock.cancel, now: clock.now });
  queue.push({ id: 'attack', timing: { hold: 700, settle: 1300 } });
  queue.push({ id: 'status', timing: 260 });
  clock.drain();
  assert.deepEqual(started, [
    ['attack', 0],
    ['status', 700],
  ]);
});

test('fx-queue: waiting out a scene survives a collapsed budget and does not spend it', () => {
  const clock = timedClock();
  const started = [];
  const run = (p) => {
    started.push([p.id, clock.now()]);
    return p.timing;
  };
  const queue = createFxQueue({ run, schedule: clock.schedule, cancel: clock.cancel, now: clock.now, maxQueueMs: 1000 });
  queue.push({ id: 'banner', timing: 1600 });
  queue.push({ id: 'attack', timing: { hold: 700, settle: 1300 } });
  queue.push({ id: 'turn-banner', timing: 260, awaitScenes: true });
  clock.drain();
  // The banner spent the budget, so the move's hold collapses to 0, yet the turn banner
  // still waits for the move to leave the screen.
  assert.deepEqual(started, [
    ['banner', 0],
    ['attack', 1600],
    ['turn-banner', 2900],
  ]);
});

test('fx-queue: clear forgets scenes still on screen', () => {
  const clock = timedClock();
  const started = [];
  const run = (p) => {
    started.push([p.id, clock.now()]);
    return p.timing;
  };
  const queue = createFxQueue({ run, schedule: clock.schedule, cancel: clock.cancel, now: clock.now });
  queue.push({ id: 'attack', timing: { hold: 0, settle: 5000 } });
  queue.clear();
  queue.push({ id: 'turn-banner', timing: 0, awaitScenes: true });
  assert.deepEqual(started, [
    ['attack', 0],
    ['turn-banner', 0],
  ]);
});
