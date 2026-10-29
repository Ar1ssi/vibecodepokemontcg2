// Design 078: the water kit's GPU modifiers. A sheet wavers along its axis (distort), a drop and
// the spray carry a second noise layer (detail), and every fill burns a drawer's dissolve at the
// kit's pale-cyan foam edge; the caller's fxMod comes back untouched.
import test from 'node:test';
import assert from 'node:assert/strict';

import { water } from '../water.js';
import { assertEdged, assertLift, detailed, distorted, drawMods, lit } from './fx-mod-rows.mjs';

const SHEET = Object.freeze({ x: 50, y: 50, angleDeg: -90, length: 80, width: 30, time: 0.4, seed: 3 });
const rad = (deg) => (deg * Math.PI) / 180;

test('water sheet: the sheet fill wavers along its axis; glint and shed drops stay unwarped', () => {
  const rows = drawMods((ctx) => water.tongue(ctx, SHEET));
  assert.equal(rows.length, 3, 'sheet, edge glint, drops');
  assert.ok(distorted(rows[0]), 'the sheet wavers');
  assert.ok(Math.abs(rows[0].distort.angle - rad(-90)) < 1e-6, 'flowing toward the tip');
  assert.ok(!rows.slice(1).some(distorted), 'glint and drops hold still');
  assertEdged(rows, water.palette.hot);
});

test('water drop and spray: a slow detail layer over the body and the mist', () => {
  const drop = drawMods((ctx) => water.body(ctx, 50, 50, 20, 1, 1));
  assert.ok(detailed(drop[0]) && distorted(drop[0]), 'the drop body');
  assert.ok(!drop.slice(1).some(detailed), 'rim and specular stay clean');
  assertEdged(drop, water.palette.hot);
  const spray = drawMods((ctx) => water.glow(ctx, 50, 50, 40, 1));
  assert.ok(detailed(spray[0]), 'the spray');
});

test('water withPalette burns its edge in the new palette', () => {
  const tinted = water.withPalette({ ...water.palette, hot: [10, 20, 30] });
  assertEdged(
    drawMods((ctx) => tinted.body(ctx, 50, 50, 20, 1, 1)),
    [10, 20, 30]
  );
});

test('water depth: a drop is a glossy lit sphere floating off the cloth; a sheet is a lit tube just above it', () => {
  const [drop, rim, specular] = drawMods((ctx) => water.body(ctx, 50, 50, 20, 1, 1));
  assert.ok(lit(drop) && drop.volume.spec >= 0.8, 'glossy');
  assertLift(drop, 0.1, 'drop');
  assertLift(rim, 0.1, 'rim with it');
  assertLift(specular, 0.1, 'specular with it');
  const [sheet, glint, drops] = drawMods((ctx) => water.tongue(ctx, SHEET));
  assert.ok(lit(sheet) && detailed(sheet));
  assert.ok(sheet.lift > 0 && glint.lift > sheet.lift && drops.lift > glint.lift);
  assertLift(drawMods((ctx) => water.glow(ctx, 50, 50, 40, 1))[0], 0, 'spray on the cloth');
});
