// Design 078: the psychic kit's GPU modifiers. The haze and the lens read through a slow warp
// (distort) so their light ripples, the haze adds a detail layer, a ribbon wavers along itself,
// and every fill burns a drawer's dissolve at the kit's pink-violet edge.
import test from 'node:test';
import assert from 'node:assert/strict';

import { psychic, rippleRings } from '../psychic.js';
import { assertEdged, assertLift, detailed, distorted, drawMods, lit } from './fx-mod-rows.mjs';

test('psychic projectile: haze warped and detailed, ribbon and lens warped, strokes unwarped', () => {
  const rows = drawMods((ctx) => psychic.projectile(ctx, { x: 60, y: 60, r: 20, headingDeg: 0, time: 0.5, seed: 2, tongues: 1 }));
  // haze, ribbon fill, ribbon centre line, lens disc, three lens rings
  assert.equal(rows.length, 7);
  const [haze, ribbon, line, lens, ...rings] = rows;
  assert.ok(distorted(haze) && detailed(haze), 'the haze ripples');
  assert.ok(distorted(ribbon) && !detailed(ribbon), 'the ribbon wavers');
  assert.ok(distorted(lens), 'the lens ripples');
  assert.ok(![line, ...rings].some(distorted), 'strokes hold their shape');
  assertEdged(rows, psychic.palette.hot);
});

test('psychic sigil: every ring and the lens burn at the kit edge', () => {
  assertEdged(
    drawMods((ctx) => psychic.sigil(ctx, 50, 50, 40, 0.5)),
    psychic.palette.hot
  );
});

test('psychic depth: the lens is a lit orb above its haze, its rings lit tubes stacked inner-highest', () => {
  const rows = drawMods((ctx) => psychic.projectile(ctx, { x: 60, y: 60, r: 20, headingDeg: 0, time: 0.5, seed: 2, tongues: 1 }));
  const [haze, ribbon, line, lens, ...rings] = rows;
  assertLift(haze, 0, 'haze on the cloth');
  assert.ok(lit(ribbon) && lit(line) && lit(lens) && rings.every(lit), 'ribbon, line, orb and rings are lit solids');
  assert.ok(!lit(haze));
  assert.ok(ribbon.lift > 0 && line.lift > ribbon.lift, 'the centre line rides on the ribbon');
  assert.ok(lens.lift > ribbon.lift, 'the orb floats above its ribbons');
  assert.ok(rings[0].lift > rings[1].lift && rings[1].lift > rings[2].lift, 'inner rings ride highest');
});

test('psychic depth: the wave bands are lit tubes that sink as they spread', () => {
  const rows = drawMods((ctx) => psychic.sigil(ctx, 50, 50, 40, 0.5));
  const bands = rows.slice(0, rows.length - 4);
  assert.ok(bands.length >= 2 && bands.every(lit));
  const visible = rippleRings(0.5, 40).filter((ring) => ring.alpha > 0);
  bands.forEach((band, i) => assertLift(band, 0.1 * (1.5 - visible[i].radius / 40), `band ${i}`));
});
