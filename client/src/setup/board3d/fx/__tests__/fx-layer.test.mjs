import test from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';

import { FX_LAYER, OCCLUDER_LAYER } from '../fx-layers.mjs';
import { createFxLayer } from '../fx-layer.js';

/** A WebGLRenderer stand-in that records what each pass rendered with. */
function fakeRenderer({ width = 800, height = 600 } = {}) {
  const calls = [];
  let current = null;
  const renderer = {
    calls,
    autoClear: true,
    shadowMap: { enabled: true, autoUpdate: true },
    getRenderTarget: () => current,
    setRenderTarget(target) {
      current = target;
      calls.push(['setRenderTarget', target ? 'fx' : 'canvas']);
    },
    getClearAlpha: () => 1,
    getClearColor: (colour) => colour.set(0x123456),
    setClearColor: () => {},
    clear: () => calls.push(['clear']),
    getDrawingBufferSize: (v) => v.set(width, height),
    resetState: () => calls.push(['resetState']),
    render(scene, camera) {
      calls.push([
        'render',
        scene.name || 'scene',
        { mask: camera.layers.mask, override: Boolean(scene.overrideMaterial), shadows: renderer.shadowMap.autoUpdate },
      ]);
    },
  };
  return renderer;
}

class FakeBloom {
  static instances = [];
  constructor(resolution) {
    this.resolution = resolution.clone();
    this.blendMaterial = {};
    this.renders = 0;
    FakeBloom.instances.push(this);
  }
  render() {
    this.renders += 1;
  }
  setSize() {}
  dispose() {
    this.disposed = true;
  }
}

function makeLayer(options = {}) {
  const renderer = fakeRenderer(options);
  const scene = new three.Scene();
  scene.name = 'board3d';
  const camera = new three.PerspectiveCamera();
  const clock = { t: 1000, now() { return this.t; } };
  const layer = createFxLayer({ three, renderer, scene, camera, clock, UnrealBloomPass: FakeBloom, ...options });
  return { layer, renderer, scene, camera, clock };
}

const square = (ctx) => {
  ctx.fillStyle = '#fff';
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillRect(0, 0, 10, 10);
};

test('idle: no entries means no passes at all', () => {
  const { layer, renderer } = makeLayer();
  assert.equal(layer.active(), false);
  assert.equal(layer.render(), false);
  assert.deepEqual(renderer.calls, []);
});

test('an active entry: FX target, card-depth prepass, FX pass, bloom, composite to the canvas', () => {
  const { layer, renderer, camera } = makeLayer();
  const before = camera.layers.mask;
  layer.add({ frame: (_now, canvas) => (square(canvas.ctx), true) });
  assert.equal(layer.render(), true);
  const renders = renderer.calls.filter(([kind]) => kind === 'render');
  assert.equal(renders.length, 3);
  assert.deepEqual(renders[0][2], { mask: 1 << OCCLUDER_LAYER, override: true, shadows: false });
  assert.deepEqual(renders[1][2], { mask: 1 << FX_LAYER, override: false, shadows: false });
  assert.equal(renders[2][1], 'scene', 'the composite scene');
  const targets = renderer.calls.filter(([kind]) => kind === 'setRenderTarget').map(([, which]) => which);
  assert.equal(targets[0], 'fx');
  assert.equal(targets.at(-1), 'canvas');
  assert.equal(FakeBloom.instances.at(-1).renders, 1);
  assert.equal(camera.layers.mask, before, 'camera layers restored');
  assert.equal(renderer.shadowMap.autoUpdate, true, 'shadow updates restored');
  assert.equal(renderer.autoClear, true);
});

test('the bloom composite adds light without writing alpha', () => {
  const { layer } = makeLayer();
  layer.add({ frame: () => true });
  layer.render();
  const blend = FakeBloom.instances.at(-1).blendMaterial;
  assert.equal(blend.blending, three.CustomBlending);
  assert.deepEqual([blend.blendSrcAlpha, blend.blendDstAlpha], [three.ZeroFactor, three.OneFactor]);
});

test('without UnrealBloomPass the FX still render, unbloomed', () => {
  const { layer, renderer } = makeLayer({ UnrealBloomPass: null });
  layer.add({ frame: () => true });
  layer.render();
  assert.equal(renderer.calls.filter(([kind]) => kind === 'render').length, 3);
});

test('motion reduced skips the bloom only', () => {
  const { layer, renderer } = makeLayer({ motionReduced: () => true });
  const count = FakeBloom.instances.length;
  layer.add({ frame: () => true });
  layer.render();
  assert.equal(renderer.calls.filter(([kind]) => kind === 'render').length, 3);
  const bloom = FakeBloom.instances.slice(count)[0];
  assert.equal(bloom.renders, 0);
});

test('an entry that finishes or throws is dropped; the others keep drawing', () => {
  const { layer } = makeLayer();
  const warn = console.warn;
  console.warn = () => {};
  try {
    let frames = 0;
    layer.add({ frame: () => false });
    layer.add({
      frame: () => {
        throw new Error('bad scene');
      },
    });
    layer.add({ frame: () => (frames += 1) < 3 });
    layer.render();
    assert.equal(layer.active(), true);
    layer.render();
    layer.render();
    assert.equal(layer.active(), false);
  } finally {
    console.warn = warn;
  }
});

test('entries record on the shared recorder each frame; the canvas mesh sits on the FX layer', () => {
  const { layer, clock } = makeLayer();
  const seen = [];
  layer.add({ frame: (now, canvas) => (seen.push(now), square(canvas.ctx), true) });
  layer.render();
  clock.t = 1016;
  layer.render();
  assert.deepEqual(seen, [1000, 1016]);
  assert.equal(layer.canvas.recording().runs.length, 1);
  const mesh = layer.group.children[0];
  const fx = new three.Layers();
  fx.set(FX_LAYER);
  assert.ok(mesh.layers.test(fx));
  assert.equal(mesh.visible, true);
});

test('impacts join the pass and keep it active; resetState follows their raw GL', () => {
  const { layer, renderer } = makeLayer();
  const drawn = [];
  layer.setImpacts({ active: () => true, draw: (frame) => drawn.push(frame.target), detach() {} });
  assert.equal(layer.active(), true);
  layer.render();
  assert.equal(drawn.length, 1);
  assert.ok(renderer.calls.some(([kind]) => kind === 'resetState'));
});

test('resize follows the drawing buffer; dispose drops entries and frees the bloom', () => {
  const { layer, renderer } = makeLayer();
  layer.add({ frame: () => true });
  layer.render();
  renderer.getDrawingBufferSize = (v) => v.set(1024, 768);
  layer.render();
  const bloom = FakeBloom.instances.at(-1);
  assert.deepEqual([bloom.resolution.x, bloom.resolution.y], [1024, 768]);
  let detached = false;
  layer.setImpacts({ active: () => false, draw() {}, detach: () => (detached = true) });
  layer.dispose();
  assert.equal(layer.active(), false);
  assert.equal(bloom.disposed, true);
  assert.equal(detached, true);
  assert.equal(layer.render(), false);
});
