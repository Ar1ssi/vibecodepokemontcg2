import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TERA_PALETTE, TERA_TYPE_RGB, teraGemColours, teraPaletteFor, teraPaletteForCard } from '../tera-palette.mjs';

const isRgb = (c) => Array.isArray(c) && c.length === 3 && c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255);
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

test('teraPaletteFor: crystal tones from the type, by any spelling of it', () => {
  const fire = teraPaletteFor('Fire');
  assert.notDeepEqual(fire.ice, TERA_PALETTE.ice);
  assert.deepEqual(teraPaletteFor('R'), fire, 'the energy letter names the same type');
  assert.deepEqual(fire.white, TERA_PALETTE.white, 'white is the same for every type');
  for (const type of Object.keys(TERA_TYPE_RGB)) {
    const palette = teraPaletteFor(type);
    for (const key of ['deep', 'ice', 'cyan', 'white']) assert.ok(isRgb(palette[key]), `${type}.${key}`);
    assert.ok(luma(palette.deep) < luma(palette.cyan), `${type}: deep is the shadow`);
    assert.ok(luma(palette.cyan) <= luma(palette.ice), `${type}: ice is the paler body`);
  }
});

test('teraPaletteFor: Colorless and unknown types keep the icy default', () => {
  for (const type of ['Colorless', 'Shadow', '', null, undefined, 7]) assert.equal(teraPaletteFor(type), TERA_PALETTE, String(type));
});

test('teraPaletteForCard: the first printed type; a card without one is icy', () => {
  assert.deepEqual(teraPaletteForCard({ types: ['Grass', 'Fire'] }), teraPaletteFor('Grass'));
  for (const card of [null, undefined, {}, { types: [] }, { types: 'Fire' }]) assert.equal(teraPaletteForCard(card), TERA_PALETTE);
});

test('teraGemColours: deep root, saturated body, a hot tone that is never white', () => {
  for (const type of [...Object.keys(TERA_TYPE_RGB), 'Colorless']) {
    const palette = teraPaletteFor(type);
    const gem = teraGemColours(palette);
    for (const key of ['deep', 'body', 'hot']) assert.ok(isRgb(gem[key]), `${type}.${key}`);
    assert.ok(luma(gem.deep) < luma(gem.body) && luma(gem.body) < luma(gem.hot), `${type}: deep < body < hot`);
    assert.deepEqual(gem.body, palette.cyan);
    assert.ok(Math.min(...gem.hot) < 250, `${type}: the hot tone keeps its hue`);
  }
  assert.deepEqual(teraGemColours(), teraGemColours(TERA_PALETTE));
});
