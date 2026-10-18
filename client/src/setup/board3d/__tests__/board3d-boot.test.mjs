import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { board3dActive, disposeBoard3d, getBoardScene, iframeFallbackUrl, initializeBoard3d } from '../board3d.js';
import { BOARD3D_FALLBACK_KEY } from '../board-flag.mjs';

const PAGE =
  '<body><div id="board3dHost" hidden><canvas id="board3dCanvas"></canvas></div>' +
  '<iframe id="selfContainer"></iframe><iframe id="oppContainer"></iframe></body>';

const setup = ({ renderer = 'ok', systemState = {}, url = 'http://localhost/?board=3d' } = {}) => {
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
    storage: null,
    mirrorBound: () => false,
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
  it('flag off: reports flag-off and loads nothing', async () => {
    const { host, deps, calls, doc } = setup();
    const result = await initializeBoard3d({ host, requested: false, deps });
    assert.deepEqual(result, { active: false, reason: 'flag-off' });
    assert.equal(calls.imports, 0);
    assert.equal(calls.chat.length, 0);
    assert.equal(doc.body.classList.contains('board3d-active'), false);
    assert.equal(board3dActive(), false);
  });

  it('legacy netcode: falls back with one chat line before loading three', async () => {
    const { host, deps, calls } = setup({ systemState: { serverAuthoritative: false } });
    const result = await initializeBoard3d({ host, requested: true, deps });
    assert.deepEqual(result, { active: false, reason: 'legacy-netcode' });
    assert.equal(calls.imports, 0);
    assert.equal(calls.chat.length, 1);
  });

  it('no WebGL2: falls back with one chat line and leaves the iframe board alone', async () => {
    const { host, deps, calls, doc } = setup({ renderer: null });
    const result = await initializeBoard3d({ host, requested: true, deps });
    assert.deepEqual(result, { active: false, reason: 'no-webgl2' });
    assert.equal(calls.chat.length, 1);
    assert.equal(doc.body.classList.contains('board3d-active'), false);
    assert.equal(host.hidden, true);
    assert.equal(board3dActive(), false);
    assert.equal(getBoardScene(), null);
  });

  it('success: shows the host, marks the body, and sizes camera and layout to the host', async () => {
    const { host, deps, calls, doc } = setup();
    const result = await initializeBoard3d({ host, requested: true, deps });
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
    await initializeBoard3d({ host, requested: true, deps });
    const scene = calls.scenes[0];
    doc.dispatchEvent(new dom.window.CustomEvent('mat-layout-applied', { detail: { target: 'self' } }));
    await flush();
    assert.equal(scene.mats.length, 2);
    assert.ok(scene.layouts.length >= 2);
  });

  it('context lost once rebuilds on a fresh canvas with the last model; twice falls back', async () => {
    const { host, deps, calls, doc } = setup();
    await initializeBoard3d({ host, requested: true, deps });
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
    assert.equal(calls.chat.length, 1);
  });

  // With the mirror bound, the 43 container importers cannot be rebound: reload onto the iframes once.
  const withMirror = (options) => {
    const env = setup(options);
    const stored = new Map();
    env.reloads = [];
    Object.assign(env.deps, {
      mirrorBound: () => true,
      reload: (url) => env.reloads.push(url),
      sessionStorage: { setItem: (key, value) => stored.set(key, value) },
    });
    env.stored = stored;
    return env;
  };
  const loseTwice = async ({ host, deps, calls }) => {
    await initializeBoard3d({ host, requested: true, deps });
    calls.onLost[0]();
    await flush();
    calls.onLost[1]();
    await flush();
    await flush();
  };

  it('a late context-lost-twice with the mirror bound reloads once with board=iframe', async () => {
    const env = withMirror();
    await loseTwice(env);
    assert.deepEqual(env.reloads, ['http://localhost/?board=iframe']);
    assert.equal(env.stored.get(BOARD3D_FALLBACK_KEY), 'context-lost-twice');
    assert.equal(env.calls.chat.length, 0);
    assert.equal(board3dActive(), false);
  });

  it('never reloads again when the URL already has board=iframe', async () => {
    const env = withMirror({ url: 'http://localhost/?e2e=1&board=iframe' });
    await loseTwice(env);
    assert.deepEqual(env.reloads, []);
    assert.equal(env.stored.size, 0);
    assert.equal(env.calls.chat.length, 1);
  });

  it('a legacy-netcode refusal with the mirror bound reloads; flag-off never does', async () => {
    const env = withMirror({ systemState: { serverAuthoritative: false } });
    const result = await initializeBoard3d({ host: env.host, requested: true, deps: env.deps });
    assert.deepEqual(result, { active: false, reason: 'legacy-netcode' });
    assert.deepEqual(env.reloads, ['http://localhost/?board=iframe']);
    const off = withMirror();
    await initializeBoard3d({ host: off.host, requested: false, deps: off.deps });
    assert.deepEqual(off.reloads, []);
  });

  it('iframeFallbackUrl keeps the other query parameters', () => {
    assert.equal(iframeFallbackUrl('http://h/x?e2e=1&board=3d#a'), 'http://h/x?e2e=1&board=iframe#a');
    assert.equal(iframeFallbackUrl('http://h/?board=iframe'), null);
    assert.equal(iframeFallbackUrl('not a url'), null);
  });
});
