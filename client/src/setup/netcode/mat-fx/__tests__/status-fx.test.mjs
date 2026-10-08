import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS_CLEAR_LAYERS,
  STATUS_SPRITES,
  flipbookKeyframes,
  flipbookOffset,
  spriteLayerPose,
  statusApplyPose,
  statusClearPose,
  statusFxFor,
} from '../status-fx.mjs';

const CONDITIONS = ['Poisoned', 'Burned', 'Asleep', 'Paralyzed', 'Confused'];

test('statusFxFor: every engine condition maps, unknown and inherited keys do not', () => {
  for (const condition of CONDITIONS) {
    assert.ok(statusFxFor(condition).label);
  }
  assert.equal(statusFxFor('Frozen'), null);
  assert.equal(statusFxFor(undefined), null);
  assert.equal(statusFxFor('toString'), null);
});

test('statusFxFor: keys are the sound/loop keys, so pop, loop and voice share one palette class', () => {
  assert.deepEqual(
    CONDITIONS.map((c) => statusFxFor(c).key),
    ['poison', 'burn', 'sleep', 'paralyze', 'confusion']
  );
});

test('every pop and clear layer names a known sheet, valid cells and a slice inside the clock', () => {
  const layers = [...CONDITIONS.flatMap((c) => statusFxFor(c).layers), ...STATUS_CLEAR_LAYERS];
  for (const layer of layers) {
    const sheet = STATUS_SPRITES[layer.sprite];
    assert.ok(sheet, `unknown sprite ${layer.sprite}`);
    for (const cell of layer.cells ?? sheet.cells) {
      assert.ok(cell >= 0 && cell < sheet.cols * sheet.rows, `${layer.sprite} cell ${cell}`);
    }
    assert.ok(layer.start >= 0 && layer.end <= 1 && layer.end > layer.start, `${layer.sprite} slice`);
  }
});

test('every condition pop opens on the shared apply poof', () => {
  for (const condition of CONDITIONS) {
    assert.equal(statusFxFor(condition).layers[0].sprite, 'poof');
  }
});

test('flipbookOffset: walks the grid row by row, as a percent of the sheet', () => {
  assert.deepEqual(flipbookOffset(0, 4, 4), { x: -0, y: -0 });
  assert.deepEqual(flipbookOffset(5, 4, 4), { x: -25, y: -25 });
  assert.deepEqual(flipbookOffset(11, 4, 3), { x: -75, y: (-2 * 100) / 3 });
  assert.deepEqual(flipbookOffset(3, 2, 2), { x: -50, y: -50 });
});

test('flipbookKeyframes: one held keyframe per frame inside the slice, offsets rising 0..1', () => {
  const layer = { cells: [0, 1, 3], start: 0.2, end: 0.8 };
  const frames = flipbookKeyframes(layer, STATUS_SPRITES.paralyzeZap);
  assert.equal(frames[0].offset, 0, 'holds the first cell before the slice starts');
  assert.equal(frames.at(-1).offset, 1);
  for (let i = 1; i < frames.length; i += 1) assert.ok(frames[i].offset >= frames[i - 1].offset);
  const offsets = frames.slice(1, 4).map((f) => f.offset);
  [0.2, 0.4, 0.6].forEach((want, i) => assert.ok(Math.abs(offsets[i] - want) < 1e-9, `frame ${i}`));
  assert.equal(frames[3].transform, 'translate(-50%, -50%)', 'cell 3 is bottom-right');
  assert.ok(frames.slice(0, -1).every((f) => f.easing === 'step-end'));
});

test('spriteLayerPose: invisible outside its slice, peaks inside, scale and drift ease to their ends', () => {
  const layer = { start: 0.2, end: 0.6, opacity: 0.8, fadeIn: 0.25, fadeOut: 0.25, scale: [0.4, 1], drift: [0.5, -1] };
  assert.equal(spriteLayerPose(layer, 0.1).opacity, 0);
  assert.equal(spriteLayerPose(layer, 0.7).opacity, 0);
  assert.equal(spriteLayerPose(layer, 0.4).opacity, 0.8);
  assert.ok(spriteLayerPose(layer, 0.21).opacity < 0.8);
  const end = spriteLayerPose(layer, 0.6);
  assert.ok(Math.abs(end.scale - 1) < 1e-9);
  assert.deepEqual([end.dx, end.dy], [0.5, -1]);
  assert.equal(spriteLayerPose(layer, 0).scale, 0.4);
});

test('statusApplyPose: label bounces past full size, settles at 1, then fades', () => {
  assert.ok(statusApplyPose(0).labelScale < 1);
  assert.ok(statusApplyPose(0.12).labelScale > 1);
  assert.equal(statusApplyPose(0.5).labelScale, 1);
  assert.equal(statusApplyPose(0.5).labelOpacity, 1);
  assert.equal(statusApplyPose(1).labelOpacity, 0);
  assert.deepEqual(statusApplyPose(-1), statusApplyPose(0));
});

// ── Design 024 slice 4: recovery ──────────────────────────────────────────

test('statusClearPose: the ring collapses inward and fades in and back out', () => {
  assert.ok(statusClearPose(1).ringScale < statusClearPose(0).ringScale, 'clear contracts');
  assert.equal(statusClearPose(0).ringOpacity, 0);
  assert.equal(statusClearPose(1).ringOpacity, 0);
  assert.ok(statusClearPose(0.2).ringOpacity > 0.8);
});

test('statusClearPose: bounded outside [0,1]', () => {
  for (const t of [-1, 1.5]) {
    const pose = statusClearPose(t);
    assert.ok(Number.isFinite(pose.ringScale));
    assert.ok(pose.ringOpacity >= 0 && pose.ringOpacity <= 1);
  }
});

test('the clear sparkles pop one after another, each its own sheet cell', () => {
  const starts = STATUS_CLEAR_LAYERS.map((l) => l.start);
  assert.deepEqual([...starts].sort((a, b) => a - b), starts);
  assert.equal(new Set(STATUS_CLEAR_LAYERS.map((l) => l.cells[0])).size, STATUS_CLEAR_LAYERS.length);
});
