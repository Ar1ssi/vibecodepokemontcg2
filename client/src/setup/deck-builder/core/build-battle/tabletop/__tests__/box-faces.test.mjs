import test from 'node:test';
import assert from 'node:assert/strict';

import { BOX_ART } from '../../box-art.generated.mjs';
import { BOX_FACE_QUADS, boxFaceQuads } from '../box-faces.mjs';

const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const span = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

// Clockwise on screen (y down) from top-left, and convex: every turn bends the same way.
function assertQuad(quad, [width, height], label) {
  assert.equal(quad.length, 4, label);
  for (let i = 0; i < 4; i += 1) {
    const turn = cross(quad[i], quad[(i + 1) % 4], quad[(i + 2) % 4]);
    assert.ok(turn > 0, `${label}: corner ${i + 1} turns the wrong way`);
  }
  for (const { x, y } of quad) {
    assert.ok(x >= -0.03 * width && x <= 1.03 * width && y >= -0.03 * height && y <= 1.03 * height, `${label}: (${x}, ${y}) off the render`);
  }
  const [tl, tr, br, bl] = quad;
  assert.ok(tl.x < tr.x && bl.x < br.x && tl.y < bl.y && tr.y < br.y, `${label}: corners out of order`);
}

test('every box render has measured faces, on the render as vendored', () => {
  assert.deepEqual(Object.keys(BOX_FACE_QUADS).sort(), Object.keys(BOX_ART).sort());
  for (const [key, art] of Object.entries(BOX_ART)) {
    const quads = boxFaceQuads(key);
    assert.deepEqual(quads.size, [art.render.width, art.render.height], key);
  }
  assert.equal(boxFaceQuads('nope'), null);
  assert.equal(boxFaceQuads(undefined), null);
});

test('each face is a convex clockwise quad and the fronts keep a box front\'s proportions', () => {
  for (const [key, quads] of Object.entries(BOX_FACE_QUADS)) {
    assertQuad(quads.front, quads.size, `${key} front`);
    assert.ok(!(quads.left && quads.right), `${key}: one side at most`);
    const side = quads.left || quads.right;
    if (side) assertQuad(side, quads.size, `${key} side`);
    const [tl, tr, br, bl] = quads.front;
    const ratio = (span(tl, tr) + span(bl, br)) / (span(tl, bl) + span(tr, br));
    // The real front is 87.6 × 127 mm (0.69); a render's perspective squeezes it a little.
    assert.ok(ratio > 0.5 && ratio < 0.85, `${key}: front ratio ${ratio.toFixed(2)}`);
  }
});
