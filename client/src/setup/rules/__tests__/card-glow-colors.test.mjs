import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GLOW_RGB,
  TYPE_GLOW,
  glowColorFor,
  glowHexForType,
} from '../card-glow-colors.mjs';

describe('glowColorFor', () => {
  it('tints a Stadium green even though it is also a Trainer', () => {
    const { tone, rgb } = glowColorFor({ type: 'Trainer', subtypes: ['Stadium'] });
    assert.equal(tone, 'stadium');
    assert.deepEqual(rgb, GLOW_RGB.stadium);
  });

  it('tints a Supporter red even though it is also a Trainer', () => {
    const { tone, rgb } = glowColorFor({ type: 'Trainer', subtypes: ['Supporter'] });
    assert.equal(tone, 'supporter');
    assert.deepEqual(rgb, GLOW_RGB.supporter);
  });

  it('tints an Item blue', () => {
    const { tone, rgb } = glowColorFor({ type: 'Trainer', subtypes: ['Item'] });
    assert.equal(tone, 'item');
    assert.deepEqual(rgb, GLOW_RGB.item);
  });

  it('tints a Tool blue, not Supporter/Stadium', () => {
    const { tone, rgb } = glowColorFor({ type: 'Trainer', subtypes: ['Pokémon Tool'] });
    assert.equal(tone, 'item');
    assert.deepEqual(rgb, GLOW_RGB.item);
  });

  it('tints Energy by its type colour', () => {
    const { tone, rgb } = glowColorFor({ type: 'Energy', types: ['Fire'] });
    assert.equal(tone, 'energy-fire');
    assert.deepEqual(rgb, TYPE_GLOW.fire);
  });

  it('resolves a symbol-spelled basic Energy (Basic {F} Energy)', () => {
    const { tone, rgb } = glowColorFor({ type: 'Energy', name: 'Basic {F} Energy' });
    assert.equal(tone, 'energy-fighting');
    assert.deepEqual(rgb, TYPE_GLOW.fighting);
  });

  it('falls back to Colorless grey for an untyped Special Energy', () => {
    const { tone, rgb } = glowColorFor({ type: 'Energy', name: 'Mystery Energy', types: [] });
    assert.equal(tone, 'energy-colorless');
    assert.deepEqual(rgb, TYPE_GLOW.colorless);
  });

  it('leaves a Pokemon cyan (C8)', () => {
    assert.deepEqual(glowColorFor({ type: 'Pokemon', types: ['Fire'] }), {
      tone: 'default',
      rgb: GLOW_RGB.default,
    });
    assert.deepEqual(glowColorFor({ stage: 'Basic', hp: 60 }), {
      tone: 'default',
      rgb: GLOW_RGB.default,
    });
  });

  it('handles a missing card', () => {
    assert.deepEqual(glowColorFor(null), { tone: 'default', rgb: GLOW_RGB.default });
  });
});

describe('glowHexForType (inspector banner parity)', () => {
  it('matches the palette the inspector banner shipped with', () => {
    const expected = {
      Fire: '#c0392b',
      Water: '#2d7dd2',
      Grass: '#3f9b4f',
      Lightning: '#e0a51f',
      Psychic: '#9b59b6',
      Fighting: '#cf6a1c',
      Dark: '#4a4a5e',
      Metal: '#7f8792',
      Dragon: '#5b6ee1',
      Fairy: '#e07fa8',
      Colorless: '#8e8e93',
    };
    for (const [name, hex] of Object.entries(expected)) {
      assert.equal(glowHexForType(name), hex, name);
    }
  });

  it('accepts cost symbols and lower-case spellings', () => {
    assert.equal(glowHexForType('{F}'), '#cf6a1c');
    assert.equal(glowHexForType('dark'), '#4a4a5e');
  });

  it('defaults to Colorless grey for an unknown or absent type', () => {
    assert.equal(glowHexForType('Mystery'), '#8e8e93');
    assert.equal(glowHexForType(undefined), '#8e8e93');
  });
});
