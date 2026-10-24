import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOCAL_FOIL_TEXTURE_BASE, customFoilSets, resolveFoilTextureBase } from '../tcgl-foil-config.mjs';

test('FOIL_TEXTURE_URL wins, without its trailing slash', () => {
  assert.deepEqual(resolveFoilTextureBase({ envUrl: 'https://pub-abc.r2.dev/', localTexturesPresent: true }), {
    textureBase: 'https://pub-abc.r2.dev',
    error: null,
  });
  assert.equal(resolveFoilTextureBase({ envUrl: ' https://foil.example.com/v1// ' }).textureBase, 'https://foil.example.com/v1');
});

test('without FOIL_TEXTURE_URL, local textures or nothing', () => {
  assert.deepEqual(resolveFoilTextureBase({ localTexturesPresent: true }), {
    textureBase: LOCAL_FOIL_TEXTURE_BASE,
    error: null,
  });
  assert.deepEqual(resolveFoilTextureBase({ envUrl: '   ' }), { textureBase: null, error: null });
  assert.deepEqual(resolveFoilTextureBase(), { textureBase: null, error: null });
});

test('an unusable FOIL_TEXTURE_URL is reported and falls back to local textures', () => {
  for (const envUrl of ['pub-abc.r2.dev', 'ftp://foil.example.com', 'https://foil.example.com/?x=1', 'javascript:alert(1)']) {
    const { textureBase, error } = resolveFoilTextureBase({ envUrl, localTexturesPresent: true });
    assert.equal(textureBase, LOCAL_FOIL_TEXTURE_BASE, envUrl);
    assert.match(error, /FOIL_TEXTURE_URL/, envUrl);
  }
  assert.equal(resolveFoilTextureBase({ envUrl: 'nope' }).textureBase, null);
});

test('only custom sets with a foil.json are listed for the client', () => {
  const present = new Set(['customhb/foil.json']);
  assert.deepEqual(
    customFoilSets(['customdemo', 'customhb'], (file) => present.has(file)),
    [{ setId: 'customhb', url: '/src/assets/custom-sets/customhb/foil.json' }]
  );
  assert.deepEqual(customFoilSets([], () => true), []);
});
