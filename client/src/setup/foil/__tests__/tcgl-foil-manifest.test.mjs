import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FOIL_UV,
  foilCoverage,
  foilRecordFor,
  materialTextureUrl,
  normalizeCardKey,
  parseFoilManifest,
  textureUrl,
} from '../tcgl-foil-manifest.mjs';

describe('normalizeCardKey', () => {
  it('strips zero-padding from the local number and lowercases', () => {
    assert.equal(normalizeCardKey('sv01-012'), 'sv01-12');
    assert.equal(normalizeCardKey('sv01-12'), 'sv01-12');
    assert.equal(normalizeCardKey('swsh12.5-GG01'), 'swsh12.5-gg1');
    assert.equal(normalizeCardKey('bw11-RC1'), 'bw11-rc1');
    assert.equal(normalizeCardKey('swsh4.5sv-SV001'), 'swsh4.5sv-sv1');
    assert.equal(normalizeCardKey('sv10.5b-001'), 'sv10.5b-1');
  });
  it('keeps a lone zero and set ids holding a dash', () => {
    assert.equal(normalizeCardKey('xyp-XY000'), 'xyp-xy0');
    assert.equal(normalizeCardKey('a-b-07'), 'a-b-7');
  });
  it('returns null for empty or dashless ids', () => {
    assert.equal(normalizeCardKey(''), null);
    assert.equal(normalizeCardKey(null), null);
    assert.equal(normalizeCardKey('sv01'), null);
    assert.equal(normalizeCardKey('sv01-'), null);
  });
});

const manifestJson = () => ({
  v: 1,
  uv: { u0: 0.1, u1: 0.9, v0: 0, v1: 1 },
  shaders: ['TPCi/Cards3D/HoloFoil/SvUltra'],
  materials: ['MAT_Cards3D_SvUltra'],
  cards: {
    'sv01-258': ['sv1_258', 0, 0, 'sv1_en_258', 'sv1_etch_en_258', 'sv1_wp_en_258', '', ''],
    'sv01-1': ['sv1_1', 0, 0, 'sv1_en_001', '', '', '', 'TEX_SVPokeBall'],
    'bad-1': ['x', 5, 0, 'x_en_001', '', '', '', ''],
  },
  flat: ['sv01-2'],
});

describe('parseFoilManifest', () => {
  it('resolves indices and turns empty textures into null', () => {
    const parsed = parseFoilManifest(manifestJson());
    assert.deepEqual(parsed.records.get('sv01-258'), {
      tcglId: 'sv1_258',
      shader: 'TPCi/Cards3D/HoloFoil/SvUltra',
      material: 'MAT_Cards3D_SvUltra',
      front: 'sv1_en_258',
      etch: 'sv1_etch_en_258',
      wp: 'sv1_wp_en_258',
      cf: null,
      cc: null,
    });
    assert.equal(parsed.records.get('sv01-1').cc, 'TEX_SVPokeBall');
    assert.equal(parsed.records.has('bad-1'), false, 'out-of-range shader index is dropped');
    assert.deepEqual(parsed.uv, { u0: 0.1, u1: 0.9, v0: 0, v1: 1 });
    assert.ok(parsed.flat.has('sv01-2'));
  });
  it('throws on a wrong version or a non-object', () => {
    assert.throws(() => parseFoilManifest({ ...manifestJson(), v: 2 }), /version/);
    assert.throws(() => parseFoilManifest(null), /not an object/);
  });
  it('falls back to the default UV window', () => {
    const parsed = parseFoilManifest({ ...manifestJson(), uv: undefined });
    assert.deepEqual(parsed.uv, { ...DEFAULT_FOIL_UV });
  });
});

describe('foilCoverage / foilRecordFor', () => {
  const parsed = parseFoilManifest(manifestJson());
  it('finds a record regardless of zero-padding', () => {
    assert.equal(foilRecordFor(parsed, 'sv01-258')?.tcglId, 'sv1_258');
    assert.equal(foilCoverage(parsed, 'sv01-001'), 'foil');
  });
  it('reports flat and uncovered cards', () => {
    assert.equal(foilCoverage(parsed, 'sv01-002'), 'flat');
    assert.equal(foilRecordFor(parsed, 'sv01-002'), null);
    assert.equal(foilCoverage(parsed, 'base1-4'), null);
  });
  it('returns null without a manifest or id', () => {
    assert.equal(foilCoverage(null, 'sv01-258'), null);
    assert.equal(foilCoverage(parsed, undefined), null);
    assert.equal(foilRecordFor(null, 'sv01-258'), null);
  });
});

describe('textureUrl', () => {
  it('files a texture under its TCG Live set', () => {
    assert.equal(textureUrl('sv1_etch_en_258'), '/src/assets/tcgl-foil/cards/sv1/sv1_etch_en_258.webp');
    assert.equal(textureUrl('swsh12-5a_wp_en_001'), '/src/assets/tcgl-foil/cards/swsh12-5a/swsh12-5a_wp_en_001.webp');
  });
  it('rejects empty or path-like names', () => {
    assert.equal(textureUrl(''), null);
    assert.equal(textureUrl(null), null);
    assert.equal(textureUrl('../x_y'), null);
    assert.equal(textureUrl('nounderscore'), null);
  });
  it('resolves against a remote texture base', () => {
    assert.equal(textureUrl('sv1_wp_en_001', 'https://pub-abc.r2.dev'), 'https://pub-abc.r2.dev/cards/sv1/sv1_wp_en_001.webp');
  });
});

describe('materialTextureUrl', () => {
  it('joins a materials.json path to the texture base', () => {
    assert.equal(materialTextureUrl('tex/FX_T_Spectrum.webp'), '/src/assets/tcgl-foil/tex/FX_T_Spectrum.webp');
    assert.equal(materialTextureUrl('tex/T_Noise_Random.webp', 'https://pub-abc.r2.dev'), 'https://pub-abc.r2.dev/tex/T_Noise_Random.webp');
  });
  it('rejects anything outside tex/', () => {
    for (const bad of [undefined, '', '/src/assets/tcgl-foil/tex/x.webp', 'tex/../x.webp', 'cards/sv1/x.webp', 'https://evil/tex/x.webp']) {
      assert.equal(materialTextureUrl(bad), null, String(bad));
    }
  });
});
