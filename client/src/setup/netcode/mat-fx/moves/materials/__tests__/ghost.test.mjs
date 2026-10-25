// Design 076: the ghost kit's GPU modifiers. Wisps, shadow puffs, the haze and the ball's rim
// glow waver (distort, drifting up); wisps and haze add a vapour detail layer; every fill burns
// a drawer's dissolve at the kit's violet edge.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ghost } from '../ghost.js';
import { assertEdged, detailed, distorted, drawMods } from './fx-mod-rows.mjs';

test('ghost wisp: outer and inner passes waver as vapour; the dark core line holds', () => {
  const rows = drawMods((ctx) => ghost.tongue(ctx, { x: 50, y: 50, angleDeg: -90, length: 80, width: 30, time: 0.4, seed: 3 }));
  assert.equal(rows.length, 3, 'outer, inner, core line');
  assert.ok(rows.slice(0, 2).every((row) => distorted(row) && detailed(row)));
  assert.ok(!distorted(rows[2]) && !detailed(rows[2]));
  assertEdged(rows, ghost.palette.hot);
});

test('ghost shadow puff and ball: puff fills and rim glow waver; the dark sphere stays solid', () => {
  const puff = drawMods((ctx) => ghost.glow(ctx, 50, 50, 40, 1));
  assert.equal(puff.length, 2);
  assert.ok(puff.every(distorted));
  const ball = drawMods((ctx) => ghost.body(ctx, 50, 50, 30, 1, 0));
  // rim glow, dark sphere, ragged edge stroke
  assert.equal(ball.length, 3);
  assert.ok(distorted(ball[0]), 'the rim glow');
  assert.ok(!distorted(ball[1]) && !distorted(ball[2]));
  assertEdged([...puff, ...ball], ghost.palette.hot);
});
