import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { board3dActive, disposeBoard3d, getBoardScene, initializeBoard3d } from '../board3d.js';

const PAGE =
  '<body><div id="board3dHost" hidden><canvas id="board3dCanvas"></canvas></div></body>';

const setup = ({ renderer = 'ok', systemState = {}, url = 'http://localhost/' } = {}) => {
  const dom = new JSDOM(PAGE, { url });
  const doc = dom.window.document;
  const host = doc.getElementById('board3dHost');
  Object.defineProperty(host, 'clientWidth', { value: 1920 });
  Object.defineProperty(host, 'clientHeight', { value: 1080 });

  const calls = { imports: 0, chat: [], renderers: [], scenes: [], onLost: [] };
  const fakeScene = () => {
    const scene = {
      applied: [],
      mats: [],
      layouts: [],
      cameras: [],
      viewports: [],
      disposed: false,
      applyModel: (model) => scene.applied.push(model),
      setMat: (spec) => scene.mats.push(spec),
      setLayout: (layout) => scene.layouts.push(layout),
      setCamera: (desc) => scene.cameras.push(desc),
      setViewport: (size) => scene.viewports.push(size),
      invalidate: () => {},
      inspect: () => ({ model: scene.applied.at(-1) ?? null }),
      dispose: () => {
        scene.disposed = true;
      },
    };
    calls.scenes.push(scene);
    return scene;
  };
  const deps = {
    document: doc,
    window: dom.window,
    systemState: () => systemState,
    matSpec: () => ({ mode: 'one-player', src: null, profile: 'sim', scale: 1 }),
    chat: (message) => calls.chat.push(message),
    importThree: async () => {
      calls.imports += 1;
      return {};
    },
    loadModules: async () => {
      calls.imports += 1;
      return {
        createTextureCache: () => ({ acquire: async () => ({}), release: () => {} }),
        createSceneClock: () => ({ start: () => {}, stop: () => {}, dispose: () => {} }),
        createBoardScene: fakeScene,
        RoomEnvironment: null,
      };
    },
    createRenderer: ({ canvas, onLost }) => {
      calls.onLost.push(onLost);
      if (renderer === null) return null;
      const gl = { renderer: {}, canvas, disposed: false, dispose: () => (gl.disposed = true) };
      calls.renderers.push(gl);
      return gl;
    },
  };
  return { dom, doc, host, deps, calls };
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

afterEach(() => disposeBoard3d());

describe('initializeBoard3d', () => {
  it('no host: reports no-host to the console only and loads nothing', async () => {
    const { deps, calls, doc } = setup();
    const errors = [];
    const original = console.error;
    console.error = (...args) => errors.push(args.join(' '));
    try {
      const result = await initializeBoard3d({ host: null, deps });
      assert.deepEqual(result, { active: false, reason: 'no-host' });
    } finally {
      console.error = original;
    }
    assert.equal(calls.imports, 0);
    assert.equal(calls.chat.length, 0);
    assert.equal(errors.length, 1);
    assert.equal(doc.body.classList.contains('board3d-active'), false);
    assert.equal(board3dActive(), false);
  });

  it('legacy netcode: reports with one chat line before loading three', async () => {
    const { host, deps, calls } = setup({ systemState: { serverAuthoritative: false } });
    const result = await initializeBoard3d({ host, deps });
    assert.deepEqual(result, { active: false, reason: 'legacy-netcode' });
    assert.equal(calls.imports, 0);
    assert.deepEqual(calls.chat, ['3D board unavailable: legacy-netcode; this browser needs WebGL2']);
  });

  it('no WebGL2: reports with one chat line and shows no board', async () => {
    const { host, deps, calls, doc } = setup({ renderer: null });
    const result = await initializeBoard3d({ host, deps });
    assert.deepEqual(result, { active: false, reason: 'no-webgl2' });
    assert.deepEqual(calls.chat, ['3D board unavailable: no-webgl2; this browser needs WebGL2']);
    assert.equal(doc.body.classList.contains('board3d-active'), false);
    assert.equal(host.hidden, true);
    assert.equal(board3dActive(), false);
    assert.equal(getBoardScene(), null);
  });

  it('success: shows the host, marks the body, and sizes camera and layout to the host', async () => {
    const { host, deps, calls, doc } = setup();
    const result = await initializeBoard3d({ host, deps });
    assert.deepEqual(result, { active: true, reason: null });
    assert.equal(doc.body.classList.contains('board3d-active'), true);
    assert.equal(host.hidden, false);
    assert.equal(board3dActive(), true);
    const scene = calls.scenes[0];
    assert.equal(getBoardScene(), scene);
    assert.deepEqual(scene.viewports.at(-1), { w: 1920, h: 1080 });
    assert.equal(scene.cameras.at(-1).viewport.w, 1920);
    assert.ok(Math.abs(scene.layouts.at(-1).depth - 540 * 0.84) < 1e-9);
    assert.equal(scene.mats.length, 1);
    assert.equal(calls.chat.length, 0);
  });

  it('a mat change re-reads the mat and relays out', async () => {
    const { host, deps, calls, doc, dom } = setup();
    await initializeBoard3d({ host, deps });
    const scene = calls.scenes[0];
    doc.dispatchEvent(new dom.window.CustomEvent('mat-layout-applied', { detail: { target: 'self' } }));
    await flush();
    assert.equal(scene.mats.length, 2);
    assert.ok(scene.layouts.length >= 2);
  });

  it('collapsing the side menu relays out the board at the full viewport width, and back', async () => {
    const { host, deps, calls, doc } = setup();
    await initializeBoard3d({ host, deps });
    const scene = calls.scenes[0];
    assert.ok(Math.abs(scene.layouts.at(-1).half.w - 1920 * 0.755) < 1e-9);

    doc.body.classList.add('side-menu-collapsed');
    await flush();
    assert.equal(scene.layouts.at(-1).half.w, 1920);

    const relayouts = scene.layouts.length;
    doc.body.classList.add('dark-mode-1');
    await flush();
    assert.equal(scene.layouts.length, relayouts, 'an unrelated class change does not relayout');

    doc.body.classList.remove('side-menu-collapsed');
    await flush();
    assert.ok(Math.abs(scene.layouts.at(-1).half.w - 1920 * 0.755) < 1e-9);
  });

  it('context lost once rebuilds on a fresh canvas with the last model; twice gives up', async () => {
    const { host, deps, calls, doc } = setup();
    await initializeBoard3d({ host, deps });
    const first = calls.scenes[0];
    const model = { version: 7 };
    first.applyModel(model);
    const oldCanvas = host.querySelector('canvas');

    calls.onLost[0]();
    await flush();
    assert.equal(first.disposed, true);
    assert.equal(calls.renderers[0].disposed, true);
    const second = calls.scenes[1];
    assert.ok(second, 'scene rebuilt');
    assert.notEqual(host.querySelector('canvas'), oldCanvas);
    assert.equal(host.querySelector('canvas').id, 'board3dCanvas');
    assert.deepEqual(second.applied, [model]);
    assert.equal(board3dActive(), true);
    assert.equal(calls.chat.length, 0);

    calls.onLost[1]();
    await flush();
    assert.equal(second.disposed, true);
    assert.equal(board3dActive(), false);
    assert.equal(getBoardScene(), null);
    assert.equal(doc.body.classList.contains('board3d-active'), false);
    assert.equal(host.hidden, true);
    assert.deepEqual(calls.chat, ['3D board unavailable: context-lost-twice; this browser needs WebGL2']);
  });

  it('a load failure reports load-failed with one chat line and leaves the URL alone', async () => {
    const { host, deps, calls, dom } = setup();
    deps.importThree = async () => {
      throw new Error('offline');
    };
    const warn = console.warn;
    console.warn = () => {};
    try {
      const result = await initializeBoard3d({ host, deps });
      assert.deepEqual(result, { active: false, reason: 'load-failed' });
    } finally {
      console.warn = warn;
    }
    assert.deepEqual(calls.chat, ['3D board unavailable: load-failed; this browser needs WebGL2']);
    assert.equal(dom.window.location.href, 'http://localhost/');
    assert.equal(board3dActive(), false);
  });

  it('syncs the board mirror at once and again once tweens settle, with no rendered frame', async () => {
    const { host, deps } = setup();
    const syncs = [];
    const loadModules = deps.loadModules;
    deps.loadModules = async () => {
      const modules = await loadModules();
      const createBoardScene = modules.createBoardScene;
      return {
        ...modules,
        createBoardScene: (args) => Object.assign(createBoardScene(args), { rects: () => ({ n: syncs.length }) }),
        boardMirror: { observe: () => () => {}, uiState: () => undefined, sync: (model, rects) => syncs.push(rects) },
      };
    };
    await initializeBoard3d({ host, deps });
    await flush();
    assert.equal(syncs.length, 1);
    await new Promise((resolve) => setTimeout(resolve, 450));
    assert.equal(syncs.length, 2);
    disposeBoard3d();
    await new Promise((resolve) => setTimeout(resolve, 450));
    assert.equal(syncs.length, 2);
  });
});

describe('camera preset (design 074 H3)', () => {
  const withPreset = (deps, initial) => {
    const state = { preset: initial, listeners: new Set() };
    const loadModules = deps.loadModules;
    deps.loadModules = async () => ({
      ...(await loadModules()),
      cameraPreset: {
        current: () => state.preset,
        subscribe: (listener) => {
          state.listeners.add(listener);
          return () => state.listeners.delete(listener);
        },
      },
    });
    const change = (preset) => {
      state.preset = preset;
      for (const listener of state.listeners) listener(preset);
    };
    return { state, change };
  };

  it('defaults to the 12° tilt camera when no preset is offered', async () => {
    const { host, deps, calls } = setup();
    await initializeBoard3d({ host, deps });
    assert.equal(calls.scenes[0].cameras.at(-1).tiltDeg, 12);
  });

  it('starts on the stored preset and snaps to the other one when the setting changes', async () => {
    const { host, deps, calls } = setup();
    const preset = withPreset(deps, 'tcgl');
    await initializeBoard3d({ host, deps });
    const scene = calls.scenes[0];
    assert.equal(scene.cameras.at(-1).fov, 20);
    assert.equal(scene.cameras.at(-1).tiltDeg, 0);

    preset.change('tilt12');
    assert.equal(scene.cameras.at(-1).tiltDeg, 12);
    preset.change('tcgl');
    assert.equal(scene.cameras.at(-1).fov, 20);

    const count = scene.cameras.length;
    preset.change('tcgl');
    assert.equal(scene.cameras.length, count, 'an unrelated settings change does not relayout');

    disposeBoard3d();
    assert.equal(preset.state.listeners.size, 0, 'the subscription is released with the board');
  });
});
