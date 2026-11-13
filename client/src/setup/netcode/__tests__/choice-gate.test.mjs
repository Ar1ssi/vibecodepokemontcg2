import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import test from 'node:test';
import { CHOICE_BACKSTOP_MS, createChoiceGate, createKnockoutScenes } from '../choice-gate.mjs';

const flush = () => new Promise((resolve) => setImmediate(resolve));

function fakeClock() {
  let time = 0;
  const timers = [];
  return {
    now: () => time,
    sleep: (ms) => new Promise((resolve) => timers.push({ at: time + ms, resolve })),
    async advance(ms) {
      const end = time + ms;
      for (;;) {
        await flush();
        timers.sort((a, b) => a.at - b.at);
        if (!timers[0] || timers[0].at > end) break;
        const next = timers.shift();
        time = next.at;
        next.resolve();
      }
      time = end;
      await flush();
    },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const openWhenAllowed = (gate) => {
  const state = { opened: false };
  gate().then(() => {
    state.opened = true;
  });
  return state;
};

test('choice gate: waits for the FX queue, then each knockout scene, then the attack scene', async () => {
  const clock = fakeClock();
  const idle = deferred();
  const scenes = [];
  let sceneEnd = 0;
  const gate = createChoiceGate({
    queueIdle: () => idle.promise,
    knockoutScenes: () => scenes,
    attackSceneEndsAt: () => sceneEnd,
    now: clock.now,
    sleep: clock.sleep,
  });

  const choice = openWhenAllowed(gate);
  await clock.advance(2000);
  assert.equal(choice.opened, false, 'the batch is still playing');

  // The knockout plan runs while the queue drains, after the gate was asked.
  const knockout = deferred();
  scenes.push(knockout.promise);
  idle.resolve();
  await clock.advance(0);
  assert.equal(choice.opened, false, 'the knockout card has not landed yet');

  sceneEnd = clock.now() + 300;
  knockout.resolve();
  await clock.advance(299);
  assert.equal(choice.opened, false, 'the attack scene is still ending');
  await clock.advance(1);
  assert.equal(choice.opened, true);
});

test('choice gate: opens at once when nothing is playing', async () => {
  const clock = fakeClock();
  const gate = createChoiceGate({
    queueIdle: () => Promise.resolve(),
    knockoutScenes: () => [],
    attackSceneEndsAt: () => 0,
    now: clock.now,
    sleep: clock.sleep,
  });
  const choice = openWhenAllowed(gate);
  await clock.advance(0);
  assert.equal(choice.opened, true);
});

test('choice gate: a queue that never drains still opens the choice at the backstop', async () => {
  const clock = fakeClock();
  const gate = createChoiceGate({
    queueIdle: () => new Promise(() => {}),
    knockoutScenes: () => [new Promise(() => {})],
    attackSceneEndsAt: () => Number.POSITIVE_INFINITY,
    now: clock.now,
    sleep: clock.sleep,
  });
  const choice = openWhenAllowed(gate);
  await clock.advance(CHOICE_BACKSTOP_MS - 1);
  assert.equal(choice.opened, false);
  await clock.advance(1);
  assert.equal(choice.opened, true, 'the server is waiting on this choice');
});

test('choice gate: a waiter that throws does not keep the choice from opening', async () => {
  const clock = fakeClock();
  const gate = createChoiceGate({
    queueIdle: () => {
      throw new Error('queue gone');
    },
    knockoutScenes: () => [Promise.reject(new Error('scene gone'))],
    attackSceneEndsAt: () => Number.NaN,
    now: clock.now,
    sleep: clock.sleep,
  });
  const choice = openWhenAllowed(gate);
  await clock.advance(0);
  assert.equal(choice.opened, true);
});

// Timer pair for createKnockoutScenes on the fake clock: ids are the entries themselves.
function fakeTimers(clock) {
  return {
    setTimer: (fn, ms) => {
      const entry = { cancelled: false };
      clock.sleep(ms).then(() => {
        if (!entry.cancelled) fn();
      });
      return entry;
    },
    clearTimer: (entry) => {
      if (entry) entry.cancelled = true;
    },
  };
}

const settledFlag = (promise) => {
  const state = { settled: false };
  promise.then(() => {
    state.settled = true;
  });
  return state;
};

test('knockout scenes: a scene settles a scene length after it starts on its hit', async () => {
  const clock = fakeClock();
  const scenes = createKnockoutScenes({ landsMs: 1900, startBackstopMs: 1500, ...fakeTimers(clock) });
  const started = scenes.track();
  const [scene] = scenes.playing();
  const landed = settledFlag(scene);

  await clock.advance(400);
  started();
  await clock.advance(1899);
  assert.equal(landed.settled, false, 'the card is still flying');
  await clock.advance(1);
  assert.equal(landed.settled, true);
  assert.deepEqual(scenes.playing(), [], 'a landed scene is no longer waited on');
});

test('knockout scenes: a scene that never starts settles when the start backstop would land it', async () => {
  const clock = fakeClock();
  const scenes = createKnockoutScenes({ landsMs: 1900, startBackstopMs: 1500, ...fakeTimers(clock) });
  scenes.track();
  const landed = settledFlag(scenes.playing()[0]);

  await clock.advance(3399);
  assert.equal(landed.settled, false);
  await clock.advance(1);
  assert.equal(landed.settled, true);
  assert.deepEqual(scenes.playing(), []);
});
