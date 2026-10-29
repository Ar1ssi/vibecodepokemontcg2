import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatLayout } from '../board-layout.mjs';
import { tableBounds } from '../table-uv.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { craterBowl, mountainPeaks } from '../stadium-environment-layout.mjs';
import {
  AMBIENT_FPS,
  EXIT_MS,
  INTRO_MS,
  PLATE_MAX_PIXELS,
  PREPARE_TIMEOUT_MS,
  createStadiumEnvironment,
  plateScale,
  strikePath,
  strikePower,
} from '../stadium-environment-mesh.js';

// The no-mat profile the board draws by default, at the board width board3d.js lays out beside the
// sidebox (0.755 of 1920).
const layout = flatLayout(getMatLayout(NO_MAT_LAYOUT_ID), { w: 1449.6, h: 540 });
const bowl = craterBowl(layout);
const peaks = mountainPeaks(layout, bowl);
const table = tableBounds(layout);

test('strikePower: a full first stroke, two fainter return strokes, nothing outside the strike', () => {
  assert.equal(strikePower(0), 1);
  assert.equal(strikePower(-0.01), 0);
  assert.equal(strikePower(0.61), 0);
  assert.equal(strikePower(Number.NaN), 0);
  assert.ok(strikePower(0.13) > strikePower(0.125), 'the first return stroke flares');
  assert.ok(strikePower(0.27) > strikePower(0.265), 'the second return stroke flares');
  assert.ok(strikePower(0.13) < 1 && strikePower(0.27) < 1);
});

test('strikePath falls onto a summit from over the crater, or arcs low over the cloud sea inside the table', () => {
  const summits = [peaks.left, peaks.right];
  let onPeaks = 0;
  let arcs = 0;
  for (let index = 0; index < 300; index += 1) {
    for (const slot of [0, 1]) {
      const path = strikePath(index, slot, { bowl, peaks }, table);
      if (!path) continue;
      assert.deepEqual(strikePath(index, slot, { bowl, peaks }, table), path, 'the same strike every frame');
      const summit = summits.find((peak) => peak.x === path.to.x && peak.y === path.to.y);
      if (summit) {
        onPeaks += 1;
        assert.equal(path.to.z, summit.h);
        assert.ok(path.from.z > summit.h, 'from the storm above');
        const fromCentre = Math.hypot(path.from.x - bowl.x, path.from.y - bowl.y);
        assert.ok(fromCentre < Math.hypot(summit.x - bowl.x, summit.y - bowl.y), 'from the crater side of the peak');
        continue;
      }
      arcs += 1;
      for (const end of [path.from, path.to]) {
        assert.ok(end.x > table.x && end.x < table.x + table.w && end.y > table.y && end.y < table.y + table.h, 'over the table');
        assert.ok(Math.hypot(end.x - bowl.x, end.y - bowl.y) >= bowl.rim + 90, 'out over the cloud sea');
        assert.ok(end.z > 0, 'above the cloud sea');
      }
    }
  }
  assert.ok(onPeaks > 0 && arcs > 0, `${onPeaks} peak strikes, ${arcs} arcs`);
});

test('strikePath is null without a mountain, and arcs need the table', () => {
  assert.equal(strikePath(0, 0, { bowl: null, peaks }, table), null);
  for (let index = 0; index < 50; index += 1) {
    const path = strikePath(index, 0, { bowl, peaks: { left: null, right: null } }, null);
    assert.equal(path, null);
  }
});

test('plateScale: CSS-pixel size at most, never more than PLATE_MAX_PIXELS', () => {
  assert.equal(plateScale(1280, 720, 1), 1);
  assert.equal(plateScale(2560, 1440, 2), 0.5 * 1 <= Math.sqrt(PLATE_MAX_PIXELS / (2560 * 1440)) ? 0.5 : Math.sqrt(PLATE_MAX_PIXELS / (2560 * 1440)));
  for (const [width, height, ratio] of [[1920, 1080, 1], [3840, 2160, 2], [5120, 2880, 1.5]]) {
    const scale = plateScale(width, height, ratio);
    assert.ok(scale <= 1 / ratio + 1e-9 && width * height * scale * scale <= PLATE_MAX_PIXELS + 1);
  }
  assert.equal(plateScale(0, 0, 0), 1, 'a zero canvas does not divide by zero');
});

test('drawPlate redraws the plate only when it is stale: a time step, a camera, a canvas size', async () => {
  const three = await import('../../../vendor/three/three.module.min.js');
  const drawn = [];
  let target = null;
  let size = [1920, 1080];
  const renderer = {
    extensions: { has: () => true },
    compile: () => {},
    shadowMap: { autoUpdate: true },
    getRenderTarget: () => target,
    setRenderTarget: (next) => {
      target = next;
    },
    render: () => drawn.push(target),
    getPixelRatio: () => 1,
    getDrawingBufferSize: (out) => out.set(...size),
  };
  const parent = new three.Group();
  const environment = createStadiumEnvironment({ three, renderer, parent, isHidden: () => true });
  const scene = new three.Scene();
  const camera = new three.PerspectiveCamera();
  environment.setLayout(layout);
  environment.setKey('perilous-jungle');
  environment.update(1000, camera);
  environment.update(3000, camera);
  const frame = (now) => {
    drawn.length = 0;
    environment.update(now, camera);
    environment.drawPlate(scene, camera);
    return drawn.map((drawnTarget) => (drawnTarget ? 'plate' : 'canvas')).join(',');
  };
  const step = 1000 / AMBIENT_FPS;
  const later = 3000 + INTRO_MS + 10.2 * step;
  assert.equal(frame(later), 'plate,canvas', 'the first frame draws the plate');
  assert.equal(frame(later + step * 0.3), 'canvas', 'a frame inside the same time step lays the plate again');
  assert.equal(frame(later + step * 1.2), 'plate,canvas', 'the next time step draws it');
  camera.position.x += 5;
  assert.equal(frame(later + step * 1.3), 'plate,canvas', 'a moved camera draws it');
  size = [1000, 500];
  assert.equal(frame(later + step * 1.4), 'plate,canvas', 'a resized canvas draws it');
  assert.equal(target, null, 'the previous render target is restored');
  assert.equal(renderer.shadowMap.autoUpdate, true, 'and the shadow flag');
  environment.dispose();
});

test('createStadiumEnvironment starts the reveal on the frame after the one that compiles its shaders', async () => {
  const three = await import('../../../vendor/three/three.module.min.js');
  let compiles = 0;
  const renderer = {
    extensions: { has: () => true },
    compile: () => {
      compiles += 1;
    },
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    render: () => {},
    getDrawingBufferSize: (target) => target.set(1920, 1080),
  };
  const environment = createStadiumEnvironment({ three, renderer, parent: new three.Group(), isHidden: () => true });
  const camera = new three.PerspectiveCamera();
  const reveal = environment.cutout.uniforms.uReveal;
  environment.setLayout(layout);
  environment.setKey('perilous-jungle');
  assert.equal(environment.update(1000, camera), true, 'the compile frame asks for another');
  assert.equal(compiles, 1);
  assert.equal(reveal.value, 0, 'nothing shows while it compiles');
  // The compile held the screen for 2 s; the reveal starts with this, the next frame.
  assert.equal(environment.update(3000, camera), true);
  assert.equal(reveal.value, 0);
  environment.update(3000 + INTRO_MS / 2, camera);
  assert.ok(reveal.value > 0.5 && reveal.value < 1, `halfway through the reveal at ${reveal.value}`);
  assert.equal(environment.update(3000 + INTRO_MS, camera), false, 'revealed');
  assert.equal(compiles, 1, 'compiled once');
  environment.dispose();
});

test('createStadiumEnvironment compiles with compileAsync when it can: the mat shows until the programs are ready', async () => {
  const three = await import('../../../vendor/three/three.module.min.js');
  const asyncCompiles = [];
  let syncCompiles = 0;
  let renders = 0;
  let boundTarget = null;
  let needsRender = 0;
  const renderer = {
    extensions: { has: () => true },
    compile: () => {
      syncCompiles += 1;
    },
    compileAsync: (scene) => {
      let resolve;
      const promise = new Promise((done) => {
        resolve = done;
      });
      asyncCompiles.push({ scene, target: boundTarget, resolve });
      return promise;
    },
    getRenderTarget: () => boundTarget,
    setRenderTarget: (target) => {
      boundTarget = target;
    },
    render: () => {
      renders += 1;
    },
    getDrawingBufferSize: (target) => target.set(1920, 1080),
  };
  const parent = new three.Group();
  const environment = createStadiumEnvironment({
    three,
    renderer,
    parent,
    isHidden: () => true,
    onNeedsRender: () => {
      needsRender += 1;
    },
  });
  const camera = new three.PerspectiveCamera();
  const reveal = environment.cutout.uniforms.uReveal;
  environment.setLayout(layout);
  environment.setKey('magma-basin');
  const holder = parent.getObjectByName('board3d-stadium-env-magma-basin');
  assert.equal(holder.visible, false, 'hidden until its programs are ready');
  assert.equal(environment.update(1000, camera), false, 'nothing animates while it compiles');
  assert.equal(environment.update(1100, camera), false);
  assert.equal(asyncCompiles.length, 2, 'the bake passes and the meshes, once');
  assert.ok(asyncCompiles[0].target?.isWebGLRenderTarget, 'bake passes compile for a render target');
  assert.ok(asyncCompiles[1].target?.isWebGLRenderTarget, 'meshes compile for the plate, as they draw');
  assert.equal(renders, 0, 'no bake before the programs are ready');
  assert.equal(syncCompiles, 0);
  assert.equal(reveal.value, 0);
  const asked = needsRender;
  for (const compile of asyncCompiles) compile.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(holder.visible, true, 'shown once ready');
  assert.equal(needsRender, asked + 1, 'asks for the frame that bakes and starts the reveal');
  assert.equal(environment.update(5000, camera), true, 'the reveal runs');
  assert.ok(renders >= 3, 'baked its passes');
  environment.update(5000 + INTRO_MS / 2, camera);
  assert.ok(reveal.value > 0.5 && reveal.value < 1, `halfway through the reveal at ${reveal.value}`);
  assert.equal(syncCompiles, 0, 'never compiled on the main thread');
  environment.dispose();
});

// A board's own beforeRender draws its palms' shadows each frame; its dispose frees the target (Surfing Beach).
test('a board with a beforeRender hook draws it each frame and disposes what it owns', async () => {
  const three = await import('../../../vendor/three/three.module.min.js');
  const drawn = [];
  let target = null;
  const renderer = {
    extensions: { has: () => true },
    compile: () => {},
    getRenderTarget: () => target,
    setRenderTarget: (next) => {
      target = next;
    },
    getClearColor: (colour) => colour,
    getClearAlpha: () => 1,
    setClearColor: () => {},
    clear: () => {},
    render: () => drawn.push(target),
    getDrawingBufferSize: (size) => size.set(1920, 1080),
  };
  const environment = createStadiumEnvironment({ three, renderer, parent: new three.Group(), isHidden: () => true });
  const camera = new three.PerspectiveCamera();
  environment.setLayout(layout);
  environment.setKey('surfing-beach');
  environment.update(1000, camera);
  const before = drawn.length;
  environment.update(3000, camera);
  const shadowPasses = drawn.slice(before).filter((drawnTarget) => drawnTarget?.texture);
  assert.equal(shadowPasses.length, 1, 'the palm shadows are drawn once a frame');
  assert.equal(target, null, 'the previous render target is restored');
  let disposed = 0;
  shadowPasses[0].addEventListener('dispose', () => {
    disposed += 1;
  });
  environment.dispose();
  assert.equal(disposed, 1, 'the shadow target is freed with the environment');
});

/**
 * A renderer whose compileAsync calls wait until the test settles them, and an environment on it
 * (magma-basin and steel-shelter boards), for the races round a pending compile.
 */
const pendingCompiles = async ({ throwFirst = false, lost = false } = {}) => {
  const three = await import('../../../vendor/three/three.module.min.js');
  const compiles = [];
  let calls = 0;
  let target = null;
  const renderer = {
    extensions: { has: () => true },
    getContext: () => ({ isContextLost: () => lost }),
    compile: () => {},
    compileAsync: (scene) => {
      calls += 1;
      if (throwFirst && calls === 1) throw new Error('unresolved #include');
      return new Promise((resolve) => {
        compiles.push({ scene, resolve });
      });
    },
    getRenderTarget: () => target,
    setRenderTarget: (next) => {
      target = next;
    },
    render: () => {},
    getDrawingBufferSize: (size) => size.set(1920, 1080),
  };
  const parent = new three.Group();
  const state = { needsRender: 0 };
  const environment = createStadiumEnvironment({
    three,
    renderer,
    parent,
    isHidden: () => true,
    onNeedsRender: () => {
      state.needsRender += 1;
    },
  });
  environment.setLayout(layout);
  const holder = (key) => parent.getObjectByName(`board3d-stadium-env-${key}`);
  const settle = async () => {
    for (const compile of compiles.splice(0)) compile.resolve();
    await macrotask();
  };
  const materialsOf = (key) => {
    const list = [];
    holder(key).traverse((object) => object.material && list.push(object.material));
    return list;
  };
  return { three, environment, holder, settle, compiles, state, materialsOf, camera: new three.PerspectiveCamera() };
};

/** Lets every pending promise chain run (setImmediate: tests mock setTimeout only). */
const macrotask = () => new Promise((resolve) => setImmediate(resolve));

test('a board whose compile ends after another board was chosen stays hidden; the chosen one shows', async () => {
  const { environment, holder, settle, compiles, camera } = await pendingCompiles();
  environment.setKey('magma-basin');
  environment.update(1000, camera);
  environment.setKey('steel-shelter');
  environment.update(1100, camera);
  assert.equal(compiles.length, 4, 'both boards compiling');
  await settle();
  assert.equal(holder('magma-basin').visible, false, 'the board no longer chosen stays hidden');
  assert.equal(holder('steel-shelter').visible, true);
  environment.dispose();
});

test('a board taken away while it compiles stays hidden once the compile ends', async () => {
  const { environment, holder, settle, camera } = await pendingCompiles();
  environment.setKey('magma-basin');
  environment.update(1000, camera);
  environment.setKey(null);
  await settle();
  assert.equal(holder('magma-basin').visible, false);
  assert.equal(environment.active(), false);
  environment.dispose();
});

test('dispose while a compile runs: materials stay until it ends, then go; no frame is asked for', async () => {
  const { environment, holder, settle, state, camera } = await pendingCompiles();
  environment.setKey('magma-basin');
  environment.update(1000, camera);
  const materials = [];
  holder('magma-basin').traverse((object) => object.material && materials.push(object.material));
  let disposedCount = 0;
  for (const material of materials) material.addEventListener('dispose', () => (disposedCount += 1));
  const asked = state.needsRender;
  environment.dispose();
  assert.equal(disposedCount, 0, 'kept while three still polls them');
  await settle();
  assert.equal(disposedCount, materials.length, 'released once the compile ended');
  assert.equal(state.needsRender, asked, 'no frame asked for after dispose');
});

test('a compile that never ends (a lost context) shows the board after PREPARE_TIMEOUT_MS', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { environment, holder, state, camera } = await pendingCompiles();
  environment.setKey('magma-basin');
  environment.update(1000, camera);
  const asked = state.needsRender;
  t.mock.timers.tick(PREPARE_TIMEOUT_MS - 1);
  await macrotask();
  assert.equal(holder('magma-basin').visible, false, 'still waiting');
  t.mock.timers.tick(1);
  await macrotask();
  assert.equal(holder('magma-basin').visible, true, 'shown anyway');
  assert.equal(state.needsRender, asked + 1);
  environment.dispose();
});

test('a compile that ends after the timeout changes nothing more: one frame asked for, still shown', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { environment, holder, settle, state, camera } = await pendingCompiles();
  environment.setKey('magma-basin');
  environment.update(1000, camera);
  const asked = state.needsRender;
  t.mock.timers.tick(PREPARE_TIMEOUT_MS);
  await macrotask();
  await settle();
  assert.equal(holder('magma-basin').visible, true);
  assert.equal(state.needsRender, asked + 1, 'one frame, from the timeout');
  environment.dispose();
});

test('dispose while a compile never ends: materials are released after PREPARE_TIMEOUT_MS', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { environment, materialsOf, camera } = await pendingCompiles();
  environment.setKey('magma-basin');
  environment.update(1000, camera);
  const materials = materialsOf('magma-basin');
  let released = 0;
  for (const material of materials) material.addEventListener('dispose', () => (released += 1));
  environment.dispose();
  t.mock.timers.tick(PREPARE_TIMEOUT_MS - 1);
  await macrotask();
  assert.equal(released, 0, 'kept while three may still poll them');
  t.mock.timers.tick(1);
  await macrotask();
  assert.equal(released, materials.length, 'released anyway');
});

test('a bake compile that throws still compiles the meshes, and the board shows once they are ready', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const { environment, holder, settle, compiles, camera } = await pendingCompiles({ throwFirst: true });
  environment.setKey('magma-basin');
  environment.update(1000, camera);
  assert.equal(compiles.length, 1, 'the meshes compile though the bake passes threw');
  assert.equal(console.warn.mock.callCount(), 1);
  assert.equal(holder('magma-basin').visible, false);
  await settle();
  assert.equal(holder('magma-basin').visible, true);
  environment.dispose();
});

test('a lost context skips compileAsync (it would poll for ever) and shows the board at once', async () => {
  const { environment, holder, compiles, camera } = await pendingCompiles({ lost: true });
  environment.setKey('magma-basin');
  environment.update(1000, camera);
  await macrotask();
  assert.equal(compiles.length, 0);
  assert.equal(holder('magma-basin').visible, true);
  environment.dispose();
});

test('a board compiles for the last camera when a frame comes without one', async () => {
  const { environment, compiles, camera } = await pendingCompiles();
  environment.setKey('steel-shelter');
  environment.update(1000);
  assert.equal(compiles.length, 0, 'no camera seen yet');
  environment.update(1100, camera);
  environment.setKey('magma-basin');
  environment.update(1200);
  assert.equal(compiles.length, 4, 'the second board compiled for the camera seen before');
  environment.dispose();
});

/** An environment on a stub renderer that compiles at once, and a frame helper that draws the plate. */
const transitions = async ({ motionReduced = () => false } = {}) => {
  const three = await import('../../../vendor/three/three.module.min.js');
  const clears = [];
  let target = null;
  const renderer = {
    extensions: { has: () => true },
    compile: () => {},
    shadowMap: { autoUpdate: true },
    getRenderTarget: () => target,
    setRenderTarget: (next) => {
      target = next;
    },
    getClearColor: (colour) => colour,
    getClearAlpha: () => 1,
    setClearColor: (colour, alpha) => clears.push(alpha),
    clear: () => {},
    render: () => {},
    getPixelRatio: () => 1,
    getDrawingBufferSize: (size) => size.set(1920, 1080),
  };
  const environment = createStadiumEnvironment({
    three,
    renderer,
    parent: new three.Group(),
    isHidden: () => true,
    motionReduced,
  });
  const scene = new three.Scene();
  const camera = new three.PerspectiveCamera();
  environment.setLayout(layout);
  const frame = (now) => {
    const animating = environment.update(now, camera);
    if (environment.active()) environment.drawPlate(scene, camera);
    return animating;
  };
  /** Shows `key` fully revealed, its plate drawn: compile frame, reveal start, reveal end. */
  const show = (key, at) => {
    environment.setKey(key);
    frame(at);
    frame(at + 100);
    frame(at + 100 + INTRO_MS);
  };
  return { environment, frame, show, clears, uniforms: environment.cutout.uniforms };
};

test('exit: a shown board dissolves for EXIT_MS, then the mat returns', async () => {
  const { environment, frame, show, uniforms } = await transitions();
  show('scorched-earth', 1000);
  assert.equal(environment.setTarget(null), true);
  assert.equal(environment.play(), EXIT_MS);
  assert.equal(environment.active(), true, 'still drawn while it dissolves');
  assert.equal(frame(5000), true);
  assert.equal(uniforms.uExit.value, 0, 'the dissolve starts with this frame');
  frame(5000 + EXIT_MS / 2);
  assert.ok(uniforms.uExit.value > 0 && uniforms.uExit.value < 1, `dissolving at ${uniforms.uExit.value}`);
  assert.equal(uniforms.uCutoutOn.value, 1);
  assert.equal(frame(5000 + EXIT_MS), false, 'dissolved');
  assert.equal(environment.active(), false);
  assert.equal(uniforms.uCutoutOn.value, 0, 'the mat shows again');
  environment.dispose();
});

test('swap: the incoming board reveals over the outgoing plate, whose scene stays cut out of the mat', async () => {
  const { environment, frame, show, clears, uniforms } = await transitions();
  show('scorched-earth', 1000);
  const outgoingMin = uniforms.uMin.value.clone();
  const outgoingSize = uniforms.uSize.value.clone();
  environment.setTarget('stormy-mountains');
  assert.equal(environment.play(), INTRO_MS);
  assert.equal(uniforms.uUnderOn.value, 1, 'the outgoing scene keeps the mat cut');
  assert.deepEqual(uniforms.uUnderMin.value.toArray(), outgoingMin.toArray());
  assert.deepEqual(uniforms.uUnderSize.value.toArray(), outgoingSize.toArray());
  clears.length = 0;
  frame(9000);
  frame(9100);
  assert.ok(clears.includes(0), 'the incoming plate clears to transparent over the outgoing one');
  frame(9100 + INTRO_MS / 2);
  assert.ok(uniforms.uReveal.value > 0.5 && uniforms.uReveal.value < 1);
  assert.equal(uniforms.uUnderOn.value, 1);
  assert.equal(frame(9100 + INTRO_MS), false, 'revealed');
  assert.equal(uniforms.uUnderOn.value, 0, 'the outgoing plate is dropped');
  assert.equal(environment.active(), true);
  environment.dispose();
});

test('a swap before the outgoing board has drawn a settled plate reveals over the mat', async () => {
  const { environment, frame, uniforms } = await transitions();
  environment.setKey('scorched-earth');
  frame(1000);
  frame(1100);
  environment.setTarget('stormy-mountains');
  assert.equal(environment.play(), INTRO_MS);
  assert.equal(uniforms.uUnderOn.value, 0);
  environment.dispose();
});

test('settle mid-swap: the incoming board fully shown, no under plate, nothing animating', async () => {
  const { environment, frame, show, uniforms } = await transitions();
  show('scorched-earth', 1000);
  environment.setTarget('stormy-mountains');
  environment.play();
  frame(9000);
  environment.settle();
  assert.equal(uniforms.uUnderOn.value, 0);
  frame(9050);
  assert.equal(frame(9100), false);
  assert.equal(uniforms.uReveal.value, 1);
  environment.dispose();
});

test('reduced motion: play settles at once and holds nothing', async () => {
  const { environment, frame, uniforms } = await transitions({ motionReduced: () => true });
  environment.setTarget('scorched-earth');
  assert.equal(environment.play(), 0);
  frame(1000);
  assert.equal(frame(1100), false, 'no reveal runs');
  assert.equal(uniforms.uReveal.value, 1);
  environment.setTarget(null);
  assert.equal(environment.play(), 0);
  assert.equal(environment.active(), false);
  environment.dispose();
});
