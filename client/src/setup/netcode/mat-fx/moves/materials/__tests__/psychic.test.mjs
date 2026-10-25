// Design 076: the psychic kit's GPU modifiers. The haze and the lens read through a slow warp
// (distort) so their light ripples, the haze adds a detail layer, a ribbon wavers along itself,
// and every fill burns a drawer's dissolve at the kit's pink-violet edge.
import test from 'node:test';
import assert from 'node:assert/strict';

import { psychic } from '../psychic.js';
import { assertEdged, detailed, distorted, drawMods } from './fx-mod-rows.mjs';

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
