import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

// Design 071: the stage's control flow with fake stage factories (node has no WebGL): show/hide/show,
// the build race, coin swap ordering, the degrade paths and reduced motion. Pixels are the user's
// localhost check.
const dom = new JSDOM('<div id="stage"></div>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;

// A manual animation-frame queue: `runFrames(n)` plays n frames, each a fixed 16 ms after the last.
let frameQueue = [];
let frameNow = 1000;
globalThis.requestAnimationFrame = (callback) => {
  frameQueue.push(callback);
  return frameQueue.length;
};
globalThis.cancelAnimationFrame = () => {
  frameQueue = [];
};
const runFrames = (count) => {
  for (let index = 0; index < count; index += 1) {
    const pending = frameQueue;
    frameQueue = [];
    frameNow += 16;
    for (const callback of pending) callback(frameNow);
  }
};

const warns = [];
console.warn = (...args) => warns.push(args);

const scene = JSON.parse(
  fs.readFileSync(new URL('../../../../../assets/deckbox/scene.json', import.meta.url), 'utf8')
);
const { initializeCustomizeStage } = await import('../customize-stage.js');

const selection = (over = {}) => ({
  boxAtlasUrl: '/src/assets/deckbox/atlases/db_a.webp',
  boxName: 'Box A',
  sleeveUrl: null,
  sleeveName: 'Classic Pokémon card back',
  coin: { id: 'coin-a' },
  coinName: 'Coin A',
  ...over,
});

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** Fake stage factories that record what the stage asks of them. */
const fakeStages = ({ failObjects = false, failCoin = false, holdCoin = false, frameThrows = false } = {}) => {
  const log = { objects: [], coins: [], disposed: { objects: 0, coin: 0 }, atlases: [], coinCalls: [], renders: 0 };
  const coinGates = [];
  const stages = {
    radius: 1.7,
    loadScene: async () => scene,
    createObjectStage: async () => {
      if (failObjects) throw new Error('no WebGL2');
      const object = {
        setBoxAtlas: async (url) => log.atlases.push(url),
        setSleeveTexture: async () => {},
        setPose: () => {},
        render: () => {
          log.renders += 1;
          if (frameThrows) throw new Error('lost');
        },
        resize: () => {},
        dispose: () => {
          log.disposed.objects += 1;
        },
      };
      log.objects.push(object);
      return object;
    },
    createCoinStage: async () => {
      if (failCoin) throw new Error('coin stage failed');
      const coin = {
        setCoin: (value) => {
          log.coinCalls.push(value?.id ?? null);
          if (!holdCoin) return Promise.resolve();
          const gate = deferred();
          coinGates.push({ gate, id: value?.id ?? null });
          return gate.promise;
        },
        draw: () => {},
        resize: () => {},
        dispose: () => {
          log.disposed.coin += 1;
        },
      };
      log.coins.push(coin);
      return coin;
    },
  };
  return { stages, log, coinGates };
};

const mount = () => {
  const panelEl = document.getElementById('stage');
  panelEl.innerHTML = '';
  panelEl.className = '';
  return panelEl;
};

const make = (options = {}) => {
  const fakes = fakeStages(options);
  const steps = [];
  let current = selection();
  const panelEl = mount();
  const stage = initializeCustomizeStage({
    panelEl,
    getSelection: () => current,
    onStep: (slot, dir) => steps.push([slot, dir]),
    loadStages: async () => fakes.stages,
  });
  return { panelEl, stage, steps, setSelection: (next) => { current = next; }, ...fakes };
};

const settle = async () => {
  for (let index = 0; index < 10; index += 1) await new Promise((resolve) => setImmediate(resolve));
};

test('a missing panel yields no stage', () => {
  assert.equal(initializeCustomizeStage({ panelEl: null, getSelection: selection, onStep: () => {} }), null);
});

test('starts hidden on Preview All', () => {
  const { panelEl } = make();
  assert.equal(panelEl.hidden, true);
  assert.equal(panelEl.querySelector('[data-mode="all"]').classList.contains('active'), true);
  assert.equal(panelEl.querySelector('[data-mode="focused"]').classList.contains('active'), false);
});

test('show builds both stages once and applies the selection; hide disposes both', async () => {
  const { panelEl, stage, log } = make();
  stage.show();
  stage.show();
  await settle();
  assert.equal(log.objects.length, 1);
  assert.equal(log.coins.length, 1);
  assert.deepEqual(log.atlases, ['/src/assets/deckbox/atlases/db_a.webp']);
  assert.deepEqual(log.coinCalls, ['coin-a']);
  runFrames(2);
  assert.ok(log.renders >= 2, 'the loop renders while shown');
  assert.equal(panelEl.hidden, false);

  stage.hide();
  stage.hide();
  assert.deepEqual(log.disposed, { objects: 1, coin: 1 }, 'a double hide disposes once');
  assert.equal(panelEl.hidden, true);
  const rendersAtHide = log.renders;
  runFrames(3);
  assert.equal(log.renders, rendersAtHide, 'no drawing after hide');
});

test('show, hide, show builds a fresh pair and never leaks the first', async () => {
  const { stage, log } = make();
  stage.show();
  await settle();
  stage.hide();
  stage.show();
  await settle();
  assert.equal(log.objects.length, 2);
  assert.deepEqual(log.disposed, { objects: 1, coin: 1 });
  stage.hide();
  assert.deepEqual(log.disposed, { objects: 2, coin: 2 });
});

test('a hide that lands mid-build disposes what the build made and draws nothing', async () => {
  const { stage, log } = make();
  stage.show();
  stage.hide();
  await settle();
  assert.deepEqual(log.disposed, { objects: log.objects.length, coin: log.coins.length });
  assert.equal(log.renders, 0);
});

test('coin swaps run in order: the last pick is the last coin set', async () => {
  const { stage, setSelection, log, coinGates } = make({ holdCoin: true });
  stage.show();
  await settle();
  assert.deepEqual(log.coinCalls, ['coin-a']);

  setSelection(selection({ coin: { id: 'coin-b' } }));
  stage.refresh();
  setSelection(selection({ coin: { id: 'coin-c' } }));
  stage.refresh();
  assert.deepEqual(log.coinCalls, ['coin-a'], 'later swaps wait for the one in flight');

  coinGates[0].gate.resolve();
  await settle();
  coinGates[1].gate.resolve();
  await settle();
  coinGates[2].gate.resolve();
  await settle();
  assert.deepEqual(log.coinCalls, ['coin-a', 'coin-b', 'coin-c']);
});

test('an unchanged selection touches no stage; a changed box is pushed once', async () => {
  const { stage, setSelection, log } = make();
  stage.show();
  await settle();
  stage.refresh();
  assert.equal(log.atlases.length, 1);
  setSelection(selection({ boxAtlasUrl: '/src/assets/deckbox/atlases/db_b.webp' }));
  stage.refresh();
  stage.refresh();
  assert.equal(log.atlases.length, 2);
});

test('the toggle and setView flip the mode; the arrows report the focused category', async () => {
  const { panelEl, stage, steps } = make();
  stage.show();
  await settle();
  panelEl.querySelector('[data-mode="focused"]').click();
  assert.equal(panelEl.querySelector('[data-mode="focused"]').getAttribute('aria-pressed'), 'true');
  stage.setView('coin');
  panelEl.querySelector('[data-dir="-1"]').click();
  panelEl.querySelector('[data-dir="1"]').click();
  assert.deepEqual(steps, [['coin', -1], ['coin', 1]]);
  panelEl.querySelector('[data-mode="all"]').click();
  assert.equal(panelEl.querySelector('[data-mode="all"]').classList.contains('active'), true);
  stage.hide();
});

test('an unknown view is ignored', () => {
  const { panelEl, stage, steps } = make();
  stage.setView('mat');
  panelEl.querySelector('[data-dir="1"]').click();
  assert.deepEqual(steps, [['box', 1]], 'the view stays on its default');
});

test('the caption names the focused item, or all three in Preview All', async () => {
  const { panelEl, stage } = make();
  stage.show();
  await settle();
  const caption = () => panelEl.querySelector('.customize-stage-caption').textContent;
  assert.match(caption(), /Deck Box: Box A .* Card Sleeve: .* Coin: Coin A/);
  stage.setView('box');
  stage.refresh();
  assert.equal(caption(), 'Box A');
  stage.hide();
});

test('an object stage that cannot start marks the panel unavailable, logs, and leaves no stage behind', async () => {
  warns.length = 0;
  const { panelEl, stage, log } = make({ failObjects: true });
  stage.show();
  await settle();
  assert.equal(panelEl.classList.contains('is-unavailable'), true);
  assert.ok(warns.length <= 1, 'one warning per page at most');
  assert.equal(log.coins.length, 0, 'the coin stage is not built after the objects failed');
  assert.doesNotThrow(() => stage.refresh());
  assert.doesNotThrow(() => stage.hide());
});

test('a coin stage that cannot start disposes the object stage it already made', async () => {
  const { panelEl, stage, log } = make({ failCoin: true });
  stage.show();
  await settle();
  assert.equal(panelEl.classList.contains('is-unavailable'), true);
  assert.equal(log.disposed.objects, 1);
});

test('an exception in a frame stops the loop and marks the panel unavailable', async () => {
  const { panelEl, stage, log } = make({ frameThrows: true });
  stage.show();
  await settle();
  runFrames(1);
  assert.equal(panelEl.classList.contains('is-unavailable'), true);
  const rendersAfterFailure = log.renders;
  runFrames(5);
  assert.equal(log.renders, rendersAfterFailure, 'the loop is not rescheduled');
  stage.hide();
});

test('with reduced motion the layout snaps: no slide to tween', async () => {
  globalThis.localStorage = { getItem: (key) => (key === 'ptcg-reduce-motion' ? '1' : null) };
  try {
    const { stage, log } = make();
    stage.show();
    await settle();
    stage.setView('sleeve');
    assert.doesNotThrow(() => runFrames(1));
    assert.ok(log.renders >= 1);
    stage.hide();
  } finally {
    delete globalThis.localStorage;
  }
});
