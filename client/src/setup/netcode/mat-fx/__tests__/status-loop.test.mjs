import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  LOOP_WINDOWS,
  STATUS_LOOP_PARTS,
  loopPart,
  loopPartStyle,
  loopWindowFor,
  statusLoopBox,
  statusLoopKeys,
} from '../status-loop.mjs';
import { STATUS_CONDITION_KEYS } from '../sfx-cues.mjs';

const near = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;
const css = readFileSync(fileURLToPath(new URL('../../../../css/status-marker.css', import.meta.url)), 'utf8');

test('statusLoopKeys: Poison and Burn stack with the rotation condition, in Checkup order', () => {
  assert.deepEqual(statusLoopKeys({ poisoned: true, burned: true, specialCondition: 'Asleep' }), [
    'poison',
    'burn',
    'sleep',
  ]);
  assert.deepEqual(statusLoopKeys({ specialCondition: 'Confused' }), ['confusion']);
  assert.deepEqual(statusLoopKeys({}), []);
  assert.deepEqual(statusLoopKeys(null), []);
});

test('every condition key has a loop of parts the stylesheet can paint', () => {
  for (const key of Object.values(STATUS_CONDITION_KEYS)) {
    const parts = STATUS_LOOP_PARTS[key];
    assert.ok(parts?.length > 0, `no loop for ${key}`);
    for (const part of parts) {
      assert.ok(['card', 'sky'].includes(part.layer));
      assert.ok(css.includes(`.status-fx-part--${part.sprite} `), `no paint for ${part.sprite}`);
      assert.ok(part.period > 0 && part.w > 0 && part.h > 0, `${key} ${part.sprite}`);
    }
  }
});

test('every window a part can snap to has its keyframes in the sheet', () => {
  for (const k of LOOP_WINDOWS) assert.ok(css.includes(`@keyframes status-fx-life-${k} {`), `life-${k}`);
});

test('loopWindowFor: snaps a particle life to the nearest period / k', () => {
  assert.equal(loopWindowFor(1200, 12000), 10, 'a sleep Z burst: 1.2 s every 12 s');
  assert.equal(loopWindowFor(450, 8000), 16, 'the paralyze zap ring: ~0.45 s every 8 s');
  assert.equal(loopWindowFor(8000, 8000), 1);
  assert.equal(loopWindowFor(200, 8000), 40);
});

test('loopPart: converts the Burned bottom-right flame from the dump', () => {
  const part = loopPart({ sprite: 'mainFire', scale: 0.78, size: 2.79, pos: [3.93, -5.17], period: 600, delay: 350, run: [3, 3], tint: [1, 0.731, 0] });
  assert.ok(near(part.x, 0.463));
  assert.ok(near(part.y, 0.609));
  assert.ok(near(part.w, 0.329));
  assert.equal(part.tint, '255, 186, 0');
  assert.equal(part.layer, 'sky');
});

test('loopPartStyle: places by share of the box, so a corner part stays on the corner of a sideways card', () => {
  const part = loopPart({ sprite: 'z', size: 6.62, pos: [3.31, 0], period: 1000 });
  const { part: style } = loopPartStyle(part);
  assert.match(style, /left: calc\(100% - 0\.5em\)/, 'x = half a card width is the right edge');
  assert.match(style, /--rest: var\(--peak\)/, 'an always-on part rests visible');
});

test('loopPartStyle: a windowed flipbook restarts with every particle', () => {
  const part = loopPart({ sprite: 'lick', size: 1.5, period: 2000, life: 700, fade: true, run: [6, 2] });
  const { part: p, sheet } = loopPartStyle(part);
  assert.match(p, /status-fx-life-3 2000ms linear 0ms infinite backwards/);
  // 2000 / 3 = 666.667 ms per particle: two rows of six.
  assert.match(sheet, /status-fx-step-x 333\.333ms steps\(6\)/);
  assert.match(sheet, /status-fx-step-y 666\.667ms steps\(2\)/);
  assert.match(sheet, /--x-end: -100%/);
});

test('loopPartStyle: a run over part of the sheet bounds its steps, a still cell is just placed', () => {
  const solid = loopPart({ sprite: 'glob2', size: 2, period: 2000, life: 1000, fade: true, run: [4, 1] });
  const { sheet } = loopPartStyle(solid);
  assert.match(sheet, /--y-end: -25%/);
  assert.doesNotMatch(sheet, /status-fx-step-y/, 'one row: no row steps');
  const z = loopPart({ sprite: 'z', cell: 3, size: 2, period: 12000 });
  assert.match(loopPartStyle(z).sheet, /translate: -50% -50%/);
});

test('loopPartStyle: a rim carries its card cut-out', () => {
  const glow = loopPart({ sprite: 'sleepGlow', size: 15, period: 8000, rim: true });
  assert.match(loopPartStyle(glow).part, /--fx-cut: 44\.133% 61\.647%/);
});

test('statusLoopBox: an upright card is its own footprint, offset into the zone', () => {
  const box = statusLoopBox({
    rect: { left: 130, top: 60, width: 90, height: 126 },
    zoneRect: { left: 100, top: 50 },
    rotation: 0,
  });
  assert.deepEqual(box, { left: 30, top: 10, width: 90, height: 126, cardWidth: 90, cardHeight: 126, rotation: 0 });
});

test('statusLoopBox: a sideways card swaps its sides back; a turned-over one does not', () => {
  const rect = { left: 0, top: 0, width: 126, height: 90 };
  for (const rotation of [90, -90, '270']) {
    const box = statusLoopBox({ rect, zoneRect: null, rotation });
    assert.deepEqual([box.cardWidth, box.cardHeight], [90, 126], `rotation ${rotation}`);
    assert.deepEqual([box.width, box.height], [126, 90], 'the footprint stays the measured box');
  }
  const flipped = statusLoopBox({ rect: { left: 0, top: 0, width: 90, height: 126 }, rotation: 180 });
  assert.deepEqual([flipped.cardWidth, flipped.cardHeight, flipped.rotation], [90, 126, 180]);
});

test('statusLoopBox: no box for an unmeasured card', () => {
  assert.equal(statusLoopBox({ rect: { left: 0, top: 0, width: 0, height: 0 } }), null);
  assert.equal(statusLoopBox({ rect: null }), null);
  assert.equal(statusLoopBox({}), null);
});
