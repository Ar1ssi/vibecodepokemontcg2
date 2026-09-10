import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENERGY_TOKEN_FRONT,
  getEnergyTokenFront,
} from '../energy-token-assets.mjs';

describe('energy token assets', () => {
  it('maps every type to its cropped token image', () => {
    assert.match(ENERGY_TOKEN_FRONT.fire, /tokens\/fire\.png$/);
    assert.match(ENERGY_TOKEN_FRONT.water, /tokens\/water\.png$/);
    assert.match(ENERGY_TOKEN_FRONT.colorless, /tokens\/colorless\.png$/);
    assert.match(ENERGY_TOKEN_FRONT.fairy, /tokens\/fairy\.png$/);
  });

  it('resolves from card.types', () => {
    const card = { name: 'Basic Fire Energy', types: ['Fire'] };
    assert.equal(getEnergyTokenFront(card), ENERGY_TOKEN_FRONT.fire);
  });

  it('is case-insensitive on card.types', () => {
    const card = { name: 'x', types: ['GRASS'] };
    assert.equal(getEnergyTokenFront(card), ENERGY_TOKEN_FRONT.grass);
  });

  it('maps Dark to the darkness coin', () => {
    assert.equal(getEnergyTokenFront({ name: 'x', types: ['Dark'] }), ENERGY_TOKEN_FRONT.darkness);
  });

  it('falls back to the card name when types is missing (Special Energy)', () => {
    const card = { name: 'Double Colorless Energy', types: [] };
    assert.equal(getEnergyTokenFront(card), ENERGY_TOKEN_FRONT.colorless);
  });

  it('falls back to the card name when types is absent entirely', () => {
    const card = { name: 'Darkness Energy' };
    assert.equal(getEnergyTokenFront(card), ENERGY_TOKEN_FRONT.darkness);
  });

  it('resolves Fairy too (now that a token asset exists for it)', () => {
    const card = { name: 'Basic Fairy Energy', types: ['Fairy'] };
    assert.equal(getEnergyTokenFront(card), ENERGY_TOKEN_FRONT.fairy);
  });

  it('returns null for a completely unmapped card', () => {
    assert.equal(getEnergyTokenFront({ name: 'Mystery Energy', types: [] }), null);
  });

  it('handles a missing card gracefully', () => {
    assert.equal(getEnergyTokenFront(undefined), null);
  });
});
