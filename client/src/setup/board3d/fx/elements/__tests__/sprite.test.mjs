import test from 'node:test';
import assert from 'node:assert/strict';

import { SPRITE_FLOATS, flipbookGrid, normalizeSprite, packSprite, spriteBucketKey } from '../sprite.mjs';

test('flipbookGrid reads AxB from the name; the image aspect picks the orientation', () => {
  assert.deepEqual(flipbookGrid('TEX_VFX_Flame_2x2.webp'), { cols: 2, rows: 2 });
  assert.deepEqual(flipbookGrid('T_VFX Splash_1x4.webp', 1024, 256), { cols: 4, rows: 1 }, 'wide image: 4 across');
  assert.deepEqual(flipbookGrid('T_VFX Splash_1x4.webp', 256, 1024), { cols: 1, rows: 4 }, 'tall image: 4 down');
  assert.deepEqual(flipbookGrid('FX_T_Lightning_SubUV_1x8.webp', 1024, 1024), { cols: 1, rows: 8 }, 'square image: name order');
  assert.deepEqual(flipbookGrid('TEX_VFX_Dot_Glow.webp'), { cols: 1, rows: 1 });
  assert.deepEqual(flipbookGrid(undefined), { cols: 1, rows: 1 });
});

test('normalizeSprite fills defaults and refuses what cannot draw', () => {
  const sprite = normalizeSprite({ texture: 't.webp', at: { x: 1, y: 2 }, size: 10 });
  assert.equal(sprite.z, 0);
  assert.equal(sprite.height, 10);
  assert.equal(sprite.blend, 'add');
  assert.equal(sprite.channel, 'r');
  assert.deepEqual(sprite.colour, [1, 1, 1]);
  assert.equal(sprite.alpha, 1);
  for (const bad of [
    null,
    { at: { x: 0, y: 0 }, size: 1 },
    { texture: 't', at: { x: NaN, y: 0 }, size: 1 },
    { texture: 't', at: { x: 0, y: 0 }, size: 0 },
    { texture: 't', at: { x: 0, y: 0 }, size: 5, alpha: 0 },
  ]) {
    assert.equal(normalizeSprite(bad), null, JSON.stringify(bad));
  }
  const odd = normalizeSprite({ texture: 't', at: { x: 0, y: 0 }, size: 5, alpha: 3, dissolve: -1, blend: 'x', channel: 'q', colour: [2, -1, 'a'] });
  assert.equal(odd.alpha, 1);
  assert.equal(odd.dissolve, 0);
  assert.equal(odd.blend, 'add');
  assert.equal(odd.channel, 'r');
  assert.deepEqual(odd.colour, [1, 1, 1], 'a non-numeric channel drops the colour');
});

test('packSprite writes the three attribute vec4s in order; the bucket key splits texture, blend, channel', () => {
  const sprite = normalizeSprite({ texture: 't', at: { x: 1, y: 2, z: 3 }, size: 4, aspect: 2, rotation: 90, colour: [0.5, 2, 1], alpha: 0.5, frame: 3.7, dissolve: 0.25, blend: 'over', channel: 'rgba' });
  const out = new Float32Array(SPRITE_FLOATS * 2);
  packSprite(sprite, out, 1);
  const row = [...out.subarray(SPRITE_FLOATS)].map((v) => Math.round(v * 1000) / 1000);
  assert.deepEqual(row, [1, 2, 3, 4, 8, 1.571, 3, 0.25, 0.5, 2, 1, 0.5]);
  assert.equal(spriteBucketKey(sprite), 't|over|rgba');
});
