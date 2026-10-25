import test from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';

import {
  CARD_FX_FRAGMENT,
  CARD_FX_REST,
  CARD_FX_VERTEX,
  CHAR_REACH,
  DISSOLVE,
  burnAt,
  cardFxValuesAt,
  dissolveThreshold,
  rimEdgeAt,
  unitRgb,
} from '../card-mesh-fx.mjs';
import {
  burningCopyOf,
  createBurningDepthMaterial,
  createCardFxUniforms,
  createCardGlowTwin,
  injectCardBurn,
} from '../card-mesh-fx.js';
import { FX_LAYER } from '../fx/fx-layers.mjs';
import { createCardArtMaterial } from '../../gl/card-art-material.js';

test('cardFxValuesAt: clamped values inside the run, rest before, after and on bad values', () => {
  const fx = { at: (ms) => ({ dissolve: ms / 100, rim: 2 }), ms: 200 };
  assert.deepEqual(cardFxValuesAt(fx, 50), { dissolve: 0.5, rim: 1 });
  assert.deepEqual(cardFxValuesAt(fx, 150), { dissolve: 1, rim: 1 });
  assert.equal(cardFxValuesAt(fx, -1), CARD_FX_REST);
  assert.equal(cardFxValuesAt(fx, 200), CARD_FX_REST, 'over at ms');
  assert.deepEqual(cardFxValuesAt({ at: () => ({ dissolve: NaN }), ms: 10 }, 1), { dissolve: 0, rim: 0 });
  assert.deepEqual(cardFxValuesAt({ at: () => null, ms: 10 }, 1), { dissolve: 0, rim: 0 });
  assert.equal(cardFxValuesAt(null, 1), CARD_FX_REST);
});

test('dissolve 0 leaves every texel untouched, 1 cuts every texel', () => {
  for (const noise of [0, 0.01, 0.3, 0.99, 1]) {
    assert.deepEqual(burnAt(noise, 0), { cut: false, ember: 0, char: 0 }, `noise ${noise} at rest`);
    assert.equal(burnAt(noise, 1).cut, noise < 1, `noise ${noise} at 1`);
  }
  // Even the smallest amount leaves noise 1 (the last texel) whole.
  assert.ok(dissolveThreshold(1e-4) < 0);
  assert.equal(dissolveThreshold(0), -CHAR_REACH * DISSOLVE.width);
  assert.equal(dissolveThreshold(1), 1);
});

test('the burn front: cut, then the ember line, then the char ring, then the whole card', () => {
  const amount = 0.5;
  const t = dissolveThreshold(amount);
  const w = DISSOLVE.width;
  assert.equal(burnAt(t - 0.01, amount).cut, true);
  const ember = burnAt(t + 0.001, amount);
  assert.ok(ember.ember > 0.99 && ember.char > 0.99, 'at the hole: full ember over full char');
  const charred = burnAt(t + 1.5 * w, amount);
  assert.equal(charred.ember, 0);
  assert.ok(charred.char > 0 && charred.char < 1);
  assert.deepEqual(burnAt(t + CHAR_REACH * w + 0.01, amount), { cut: false, ember: 0, char: 0 });
});

test('the cut grows with the amount', () => {
  const cutShare = (amount) => {
    let cut = 0;
    for (let i = 0; i <= 100; i++) if (burnAt(i / 100, amount).cut) cut += 1;
    return cut;
  };
  let last = -1;
  for (const amount of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    const now = cutShare(amount);
    assert.ok(now >= last, `amount ${amount}`);
    last = now;
  }
  assert.equal(cutShare(0), 0);
  assert.equal(cutShare(1), 100);
});

test('rimEdgeAt: brightest at the outline, fading inward, 0 with no rim', () => {
  assert.equal(rimEdgeAt(0, 1, 100), 1);
  assert.ok(rimEdgeAt(5, 1, 100) < rimEdgeAt(1, 1, 100));
  assert.ok(rimEdgeAt(40, 1, 100) < 0.01, 'the card middle stays clear');
  assert.equal(rimEdgeAt(0, 0, 100), 0);
  assert.equal(rimEdgeAt(0, 0.5, 100), 0.5);
});

test('unitRgb: 0–255 to 0–1, a bad colour gives the fallback', () => {
  assert.deepEqual(unitRgb([255, 0, 51]), [1, 0, 0.2]);
  assert.deepEqual(unitRgb(null, [0, 255, 0]), [0, 1, 0]);
  assert.deepEqual(unitRgb([1, 2], [255, 255, 255]), [1, 1, 1]);
});

/** Runs a material's onBeforeCompile on the built-in shader it would compile from. */
const compiled = (material, libName) => {
  const lib = three.ShaderLib[libName];
  const shader = {
    uniforms: three.UniformsUtils.clone(lib.uniforms),
    vertexShader: lib.vertexShader,
    fragmentShader: lib.fragmentShader,
  };
  material.onBeforeCompile(shader, null);
  return shader;
};

test('the plain card art material is untouched (same program as before design 076)', () => {
  const material = createCardArtMaterial(three);
  assert.equal(material.customProgramCacheKey(), 'card-art-lod-bias');
  const shader = compiled(material, 'basic');
  assert.ok(!shader.fragmentShader.includes('uCardDissolve'));
});

test('injectCardBurn: keeps the LOD bias, adds the cut and the ember to its own program', () => {
  const uniforms = createCardFxUniforms(three);
  const material = injectCardBurn(createCardArtMaterial(three), uniforms);
  assert.equal(material.customProgramCacheKey(), 'card-art-lod-bias+card-burn');
  const shader = compiled(material, 'basic');
  assert.ok(shader.fragmentShader.includes('texture2D( map, vMapUv, -0.75 )'), 'LOD bias kept');
  assert.ok(shader.fragmentShader.includes(CARD_FX_FRAGMENT.cut.trim()));
  assert.ok(shader.fragmentShader.indexOf(CARD_FX_FRAGMENT.tint.trim()) < shader.fragmentShader.indexOf('#include <opaque_fragment>'));
  assert.ok(shader.vertexShader.includes(CARD_FX_VERTEX.body.trim()));
  assert.equal(shader.uniforms.uCardDissolve, uniforms.uCardDissolve, 'the card’s own uniform objects');
});

test('the edge walls and the shadow depth burn with the faces', () => {
  const uniforms = createCardFxUniforms(three);
  const rim = burningCopyOf(three, new three.MeshStandardMaterial({ color: 0xe8e2d4 }), uniforms, createCardArtMaterial);
  assert.ok(rim.isMeshStandardMaterial);
  assert.ok(compiled(rim, 'standard').fragmentShader.includes('cardBurnK()'));
  const depth = createBurningDepthMaterial(three, uniforms);
  const depthShader = compiled(depth, 'depth');
  assert.ok(depthShader.fragmentShader.includes(CARD_FX_FRAGMENT.cut.trim()));
  assert.ok(!depthShader.fragmentShader.includes('outgoingLight *='), 'no tint where there is no light');
});

test('burningCopyOf: an art copy shares the texture, is opaque and never the shared material', () => {
  const map = new three.Texture();
  const base = createCardArtMaterial(three, { map });
  base.transparent = true;
  base.opacity = 0.6;
  const copy = burningCopyOf(three, base, createCardFxUniforms(three), createCardArtMaterial);
  assert.notEqual(copy, base);
  assert.equal(copy.map, map);
  assert.equal(copy.transparent, false);
  assert.equal(copy.opacity, 1);
});

test('the glow twin: a burn’s on the FX layer only, a rim’s in the board pass; additive, no depth write', () => {
  const geometry = new three.PlaneGeometry(1, 1);
  const twin = createCardGlowTwin(three, geometry, createCardFxUniforms(three));
  const fxOnly = new three.Layers();
  fxOnly.set(FX_LAYER);
  const board = new three.Layers();
  assert.ok(twin.layers.test(fxOnly));
  assert.ok(!twin.layers.test(board), 'not in the board pass');
  assert.equal(twin.material.depthWrite, false);
  assert.equal(twin.material.blendDst, three.OneFactor);
  assert.equal(twin.castShadow, false);
  const rimOnly = createCardGlowTwin(three, geometry, createCardFxUniforms(three), { bloom: false });
  assert.ok(rimOnly.layers.test(board), 'a rim draws in the board pass');
  assert.ok(!rimOnly.layers.test(fxOnly), 'never bloomed');
});
