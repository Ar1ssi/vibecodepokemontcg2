import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { BOX_ART } from '../box-art.generated.mjs';
import { BUILD_BATTLE_BOXES } from '../box-catalog.mjs';

const CLIENT = fileURLToPath(new URL('../../../../../../', import.meta.url));
const onDisk = (src) => existsSync(`${CLIENT}${src}`);

test('every catalog box has vendored Bulbapedia art, and nothing else does', () => {
  assert.deepEqual(Object.keys(BOX_ART).sort(), BUILD_BATTLE_BOXES.map((box) => box.key).sort());
});

test('every vendored render, pack front and face file exists', () => {
  for (const [key, art] of Object.entries(BOX_ART)) {
    assert.ok(onDisk(art.render.src), `${key} render ${art.render.src}`);
    assert.ok(art.render.width > 0 && art.render.height <= 1400, `${key} render size`);
    for (const pack of art.packs || []) assert.ok(onDisk(pack.src), `${key} pack ${pack.src}`);
    for (const face of Object.values(art.faces || {})) assert.ok(onDisk(face.src), `${key} face ${face.src}`);
  }
});

test('every box prints four or five vendored wrappers, each with its source', () => {
  for (const [key, art] of Object.entries(BOX_ART)) {
    if (!art.packs) {
      assert.match(art.note || '', /px wide/, `${key} has no packs and no reason`);
      continue;
    }
    assert.ok(art.packs.length === 4 || art.packs.length === 5, `${key}: ${art.packs.length} packs`);
    assert.equal(new Set(art.packs.map((pack) => pack.key)).size, art.packs.length, `${key} duplicate pack keys`);
    assert.ok(art.packs.every((pack) => pack.source), `${key} pack without a source`);
  }
  // Bulbapedia's Ultra Prism wrappers are 144 px wide; pokesymbols.com's are ≈ 360 px.
  assert.ok(BOX_ART['ultra-prism'].packs.every((pack) => pack.source.startsWith('pokesymbols.com: ')));
  assert.ok(Object.values(BOX_ART).every((art) => art.packs), 'no box is left on procedural fronts');
});

test('pack fronts sit on the 780 : 1426 canvas and measured shapes are plausible', () => {
  for (const [key, art] of Object.entries(BOX_ART)) {
    for (const pack of art.packs || []) {
      const aspect = pack.height / pack.width;
      assert.ok(Math.abs(aspect - 1426 / 780) < 0.01, `${key} ${pack.key} aspect ${aspect}`);
      assert.ok(pack.width <= 780, `${key} ${pack.key} is never upscaled past 780`);
      if (!pack.shape) continue;
      const { sealTopV, sealBottomV, bodyInsetU } = pack.shape;
      assert.ok(sealTopV > 0.03 && sealTopV < 0.2, `${key} ${pack.key} sealTopV ${sealTopV}`);
      assert.ok(sealBottomV > 0.8 && sealBottomV < 0.97, `${key} ${pack.key} sealBottomV ${sealBottomV}`);
      assert.ok(bodyInsetU > 0 && bodyInsetU < 0.15, `${key} ${pack.key} bodyInsetU ${bodyInsetU}`);
    }
  }
});

test('cuboid faces come only from the Mega Evolution camera, with quads inside their crops', () => {
  const withFaces = Object.keys(BOX_ART).filter((key) => BOX_ART[key].faces);
  assert.deepEqual(withFaces.sort(), ['chaos-rising', 'mega-evolution', 'perfect-order', 'pitch-black']);
  for (const key of withFaces) {
    for (const [name, face] of Object.entries(BOX_ART[key].faces)) {
      assert.equal(face.quad.length, 4, `${key} ${name}`);
      for (const { x, y } of face.quad) {
        assert.ok(x >= 0 && x <= face.cropInRender.width && y >= 0 && y <= face.cropInRender.height, `${key} ${name} ${x},${y}`);
      }
    }
  }
});
