import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOX_FACE_TEXTURES,
  BOX_PROPORTIONS,
  PROCEDURAL_FACES,
  PRODUCT_ART,
  packArtSrc,
  productArt,
} from '../box-textures.mjs';
import { PACK_ARTS } from '../unboxing.mjs';

const ALL_FACES = ['front', 'back', 'left', 'right', 'top', 'bottom'];

test('productArt("phantasmal-flames") carries the Build & Battle scene constants', () => {
  assert.deepEqual(productArt('phantasmal-flames'), {
    proportions: { width: 1, height: 1.45, depth: 0.65 },
    lid: 'hinged',
    faces: BOX_FACE_TEXTURES,
    proceduralFaces: ['right', 'back', 'top', 'bottom'],
    packArts: ['charizard', 'gengar', 'heracross', 'lopunny'],
    packArtSrc,
    logoUrl: 'https://assets.tcgdex.net/en/me/me02/logo.webp',
    keyArtUrl: 'https://assets.tcgdex.net/en/me/me02/125/high.webp',
  });
  const art = productArt('phantasmal-flames');
  assert.equal(art.proportions, BOX_PROPORTIONS);
  assert.equal(art.proceduralFaces, PROCEDURAL_FACES);
  assert.equal(art.packArts, PACK_ARTS);
  assert.equal(art.packArtSrc('gengar'), 'src/assets/build-battle/packs/me02-gengar.webp');
});

test('productArt returns null for an unknown or non-string key', () => {
  for (const key of ['nope', '', 'toString', '__proto__', undefined, null, 42]) {
    assert.equal(productArt(key), null, String(key));
  }
});

test('the Phantasmal Flames ETB is a lift-lid box drawn fully in CSS until textures exist', () => {
  const art = productArt('phantasmal-flames-etb');
  assert.equal(art.lid, 'lift');
  assert.deepEqual(art.faces, {});
  assert.deepEqual([...art.proceduralFaces].sort(), [...ALL_FACES].sort());
  assert.deepEqual(art.proportions, { width: 1, height: 0.76, depth: 0.36 });
  assert.equal(art.keyArtUrl, 'https://assets.tcgdex.net/en/me/me02/013/high.webp');
  assert.equal(art.logoUrl, 'https://assets.tcgdex.net/en/me/me02/logo.webp');
});

test('every product names each face exactly once, as a texture or as procedural', () => {
  for (const [key, art] of Object.entries(PRODUCT_ART)) {
    const named = [...Object.keys(art.faces), ...art.proceduralFaces].sort();
    assert.deepEqual(named, [...ALL_FACES].sort(), key);
    assert.ok(['hinged', 'lift'].includes(art.lid), key);
    assert.equal(art.proportions.width, 1, key);
    assert.ok(art.packArts.length > 0, key);
    assert.ok(Object.isFrozen(art), key);
  }
});
