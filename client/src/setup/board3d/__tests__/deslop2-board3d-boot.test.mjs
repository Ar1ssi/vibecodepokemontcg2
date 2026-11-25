import { afterEach, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { disposeBoard3d, initializeBoard3d } from '../board3d.js';

afterEach(() => disposeBoard3d());

it('two concurrent initializeBoard3d calls build one scene and share the result', async () => {
  const dom = new JSDOM('<body><div id="board3dHost" hidden><canvas></canvas></div></body>', {
    url: 'http://localhost/',
  });
  const doc = dom.window.document;
  const host = doc.getElementById('board3dHost');
  const scenes = [];
  const renderers = [];
  const deps = {
    document: doc,
    window: dom.window,
    systemState: async () => ({}),
    matSpec: () => ({ mode: 'one-player', src: null, profile: 'sim', scale: 1 }),
    chat: () => {},
    importThree: async () => ({}),
    loadModules: async () => ({
      createTextureCache: () => ({ acquire: async () => ({}), release: () => {} }),
      createSceneClock: () => ({ start: () => {}, stop: () => {}, dispose: () => {} }),
      createBoardScene: () => {
        const scene = {
          applyModel: () => {},
          setMat: () => {},
          setLayout: () => {},
          setCamera: () => {},
          setViewport: () => {},
          invalidate: () => {},
          inspect: () => ({}),
          dispose: () => {},
        };
        scenes.push(scene);
        return scene;
      },
      RoomEnvironment: null,
    }),
    createRenderer: ({ canvas }) => {
      const gl = { renderer: {}, canvas, syncPixelRatio: () => true, dispose: () => {} };
      renderers.push(gl);
      return gl;
    },
  };
  const [first, second] = await Promise.all([initializeBoard3d({ host, deps }), initializeBoard3d({ host, deps })]);
  assert.deepEqual(first, { active: true, reason: null });
  assert.deepEqual(second, first);
  assert.equal(scenes.length, 1);
  assert.equal(renderers.length, 1);
});
