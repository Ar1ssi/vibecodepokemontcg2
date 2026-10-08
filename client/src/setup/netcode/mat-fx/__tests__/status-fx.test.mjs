import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS_APPLY_MS,
  STATUS_CLEAR_LAYERS,
  STATUS_CLEAR_MS,
  STATUS_SPRITES,
  curveTimeOf,
  flipbookKeyframes,
  flipbookOffset,
  spriteLayerKeyframes,
  spriteLayerPose,
  statusApplyPose,
  statusFxFor,
  unityLayer,
} from '../status-fx.mjs';

const CONDITIONS = ['Poisoned', 'Burned', 'Asleep', 'Paralyzed', 'Confused'];
const near = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

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

test('the pop and the clear run on the prefab clocks: Status_Apply 2 s, Status_Remove 1 s', () => {
  assert.equal(STATUS_APPLY_MS, 2000);
  assert.equal(STATUS_CLEAR_MS, 1000);
});

test('every condition plays the shared Status_Apply puff and swipe on top of its intro', () => {
  for (const condition of CONDITIONS) {
    const sprites = statusFxFor(condition).layers.map((l) => l.sprite);
    assert.deepEqual(sprites.slice(-2), ['puff', 'swipe'], condition);
    assert.ok(sprites.length > 2, `${condition} has an intro`);
  }
});

test('every pop and clear layer names a known sheet or shape, valid cells and a slice inside the clock', () => {
  const layers = [...CONDITIONS.flatMap((c) => statusFxFor(c).layers), ...STATUS_CLEAR_LAYERS];
  for (const layer of layers) {
    assert.ok(layer.start >= 0 && layer.end <= 1 && layer.end > layer.start, `${layer.sprite ?? layer.shape} slice`);
    assert.ok(layer.w > 0 && layer.h > 0);
    if (layer.shape) continue;
    const sheet = STATUS_SPRITES[layer.sprite];
    assert.ok(sheet, `unknown sprite ${layer.sprite}`);
    for (const cell of layer.cells ?? []) {
      assert.ok(cell >= 0 && cell < sheet.cols * sheet.rows, `${layer.sprite} cell ${cell}`);
    }
  }
});

test('unityLayer: converts the Burned intro fire from the dump', () => {
  const layer = unityLayer({ sprite: 'burnFire', size: 10.4, scale: 0.78, pos: [0, -1.63], at: 0, life: 750, tint: [1, 0.804, 0.561] }, 2000);
  assert.ok(near(layer.w, 1.225));
  assert.ok(near(layer.y, 0.192), 'below centre');
  assert.equal(layer.end, 0.375);
  assert.equal(layer.tint, '255, 205, 143');
});

test('unityLayer: Sleep is authored upside down, so up = -1 puts its clouds above centre', () => {
  const cloud = unityLayer({ sprite: 'cloud', size: 9.66, pos: [0.06, -10.1], up: -1, at: 0, life: 1450 }, 2000);
  assert.ok(cloud.y < -1.5, 'Cloud_Up floats above the card');
});

test('unityLayer: a rim keeps the card cut out of its glow', () => {
  const rim = unityLayer({ sprite: 'confusionGlow', rim: true, size: 17.08, scale: 0.78, at: 0, life: 350 }, 2000);
  assert.ok(near(rim.cut[0], 100 / rim.w));
  const padded = unityLayer({ sprite: 'poisonRim', rim: [0.16, 0.12], at: 0, life: 1700 }, 2000);
  assert.ok(near(padded.w, 1.16));
  assert.ok(padded.cut[0] < 100 && padded.cut[1] < 100);
});

test('flipbookOffset: walks the grid row by row, as a percent of the sheet', () => {
  assert.deepEqual(flipbookOffset(0, 4, 4), { x: -0, y: -0 });
  assert.deepEqual(flipbookOffset(5, 4, 4), { x: -25, y: -25 });
  assert.deepEqual(flipbookOffset(3, 2, 2), { x: -50, y: -50 });
});

test('curveTimeOf: inverts a piecewise-linear frameOverTime curve', () => {
  const puff = [[0, 0], [0.299, 0.488], [1, 1]];
  assert.equal(curveTimeOf(puff, 0), 0);
  assert.ok(near(curveTimeOf(puff, 0.488), 0.299));
  assert.ok(near(curveTimeOf(puff, 0.744), 0.6495));
  assert.equal(curveTimeOf([[0, 0], [1, 0.8]], 0.9), null, 'never reached');
});

test('flipbookKeyframes: one held keyframe per frame inside the slice, offsets rising 0..1', () => {
  const layer = { cells: [0, 1, 3], start: 0.2, end: 0.8 };
  const frames = flipbookKeyframes(layer, STATUS_SPRITES.zap);
  assert.equal(frames[0].offset, 0, 'holds the first cell before the slice starts');
  assert.equal(frames.at(-1).offset, 1);
  for (let i = 1; i < frames.length; i += 1) assert.ok(frames[i].offset >= frames[i - 1].offset);
  const offsets = frames.slice(1, 4).map((f) => f.offset);
  [0.2, 0.4, 0.6].forEach((want, i) => assert.ok(near(offsets[i], want), `frame ${i}`));
  assert.equal(frames[3].transform, 'translate(-50%, -50%)', 'cell 3 is bottom-right');
});

test('flipbookKeyframes: a frameOverTime curve that stops short skips the frames it never reaches', () => {
  const swipe = { cells: [0, 1, 2, 3, 4, 5], frameCurve: [[0, 0], [1, 0.8]], start: 0, end: 1 };
  const frames = flipbookKeyframes(swipe, STATUS_SPRITES.swipe);
  assert.equal(frames.length, 5 + 1, 'frames 0-4 shown, frame 5 (5/6 > 0.8) never reached, plus the end hold');
});

test('spriteLayerPose: invisible outside its slice, peaks inside, scale and drift ease to their ends', () => {
  const layer = { start: 0.2, end: 0.6, opacity: 0.8, fadeIn: 0.25, fadeOut: 0.25, scale: [0.4, 1], drift: [0.5, -1] };
  assert.equal(spriteLayerPose(layer, 0.1).opacity, 0);
  assert.equal(spriteLayerPose(layer, 0.7).opacity, 0);
  assert.equal(spriteLayerPose(layer, 0.4).opacity, 0.8);
  const end = spriteLayerPose(layer, 0.6);
  assert.ok(near(end.scale, 1));
  assert.deepEqual([end.dx, end.dy], [0.5, -1]);
});

test('spriteLayerKeyframes: a short flash is sampled inside its own slice and hidden around it', () => {
  const flash = { start: 0.4, end: 0.44, w: 1, h: 1, x: 0, y: 0 };
  const frames = spriteLayerKeyframes(flash, 100, 4);
  const inside = frames.filter((f) => f.offset >= 0.4 && f.offset <= 0.44);
  assert.ok(inside.length >= 5, 'every sample lands in the 80 ms slice');
  assert.equal(frames[0].opacity, 0);
  assert.equal(frames[0].easing, 'step-end');
  assert.equal(frames.at(-1).opacity, 0);
  assert.equal(frames.at(-2).offset, 0.44);
  assert.equal(frames.at(-2).opacity, 0, 'cut at the slice end, not faded across the rest of the clock');
});

test('every layer of every pop and the clear has keyframe offsets WAAPI accepts', () => {
  const layers = [...CONDITIONS.flatMap((c) => statusFxFor(c).layers), ...STATUS_CLEAR_LAYERS];
  for (const layer of layers) {
    const runs = [spriteLayerKeyframes(layer, 90)];
    if (!layer.shape) runs.push(flipbookKeyframes(layer, STATUS_SPRITES[layer.sprite]));
    for (const frames of runs) {
      for (let i = 1; i < frames.length; i += 1) {
        assert.ok(frames[i].offset >= frames[i - 1].offset, `${layer.sprite ?? layer.shape} offset ${i}`);
      }
      assert.ok(frames.every((f) => f.offset >= 0 && f.offset <= 1));
    }
  }
});

test('statusApplyPose: label bounces past full size, settles at 1, then fades', () => {
  assert.ok(statusApplyPose(0).labelScale < 1);
  assert.ok(statusApplyPose(0.12).labelScale > 1);
  assert.equal(statusApplyPose(0.5).labelScale, 1);
  assert.equal(statusApplyPose(1).labelOpacity, 0);
  assert.deepEqual(statusApplyPose(-1), statusApplyPose(0));
});

test('the clear is Status_Remove: a green heal, ring expanding, stars thrown outward', () => {
  const ring = STATUS_CLEAR_LAYERS.find((l) => l.shape === 'ring');
  assert.ok(ring.scale[1] > ring.scale[0], 'ring grows (size/life 0.352 -> 1)');
  const stars = STATUS_CLEAR_LAYERS.filter((l) => l.sprite === 'sparkle');
  assert.ok(stars.length >= 12);
  for (const layer of STATUS_CLEAR_LAYERS) {
    const [r, g, b] = layer.tint.split(', ').map(Number);
    assert.ok(g >= r && g >= b, `${layer.sprite ?? layer.shape} is green-led: ${layer.tint}`);
  }
});
