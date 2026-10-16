import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { board3dActive, disposeBoard3d, getBoardScene, initializeBoard3d } from '../board3d.js';

const PAGE =
  '<body><div id="board3dHost" hidden><canvas id="board3dCanvas"></canvas></div>' +
  '<iframe id="selfContainer"></iframe><iframe id="oppContainer"></iframe></body>';

const setup = ({ renderer = 'ok', systemState = {} } = {}) => {
  const dom = new JSDOM(PAGE, { url: 'http://localhost/?board=3d' });
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
});
