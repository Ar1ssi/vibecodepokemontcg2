import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatLayout } from '../board-layout.mjs';
import { tableBounds } from '../table-uv.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { craterBowl, mountainPeaks } from '../stadium-environment-layout.mjs';
import { INTRO_MS, createStadiumEnvironment, strikePath, strikePower } from '../stadium-environment-mesh.js';

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

test('createStadiumEnvironment compiles off the main thread when it can: the mat shows until the programs are ready', async () => {
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
  assert.equal(asyncCompiles[1].target, null, 'meshes compile for the canvas');
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
