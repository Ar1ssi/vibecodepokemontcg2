import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENERGY_TOKEN_FRONT,
  getEnergyTokenFront,
  getEnergyTokenSrcForType,
  isEnergyCard,
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

  it('resolves a cost-symbol name (Limitless decklist spelling)', () => {
    const card = { name: 'Basic {F} Energy', type: 'Energy' };
    assert.equal(getEnergyTokenFront(card), ENERGY_TOKEN_FRONT.fighting);
  });

  it('resolves every cost symbol to its token', () => {
    const bySymbol = {
      '{G}': 'grass',
      '{R}': 'fire',
      '{W}': 'water',
      '{L}': 'lightning',
      '{P}': 'psychic',
      '{F}': 'fighting',
      '{D}': 'darkness',
      '{M}': 'metal',
      '{N}': 'dragon',
      '{C}': 'colorless',
      '{Y}': 'fairy',
    };
    for (const [symbol, type] of Object.entries(bySymbol)) {
      assert.equal(
        getEnergyTokenFront({ name: `Basic ${symbol} Energy` }),
        ENERGY_TOKEN_FRONT[type],
        symbol
      );
    }
  });

  it('resolves a bare cost symbol passed as a type (attack costs)', () => {
    assert.equal(getEnergyTokenSrcForType('{F}'), ENERGY_TOKEN_FRONT.fighting);
    assert.equal(getEnergyTokenSrcForType('Fighting'), ENERGY_TOKEN_FRONT.fighting);
  });

  it('prefers a type word in the name over a cost symbol elsewhere in it', () => {
    const card = { name: 'Rocky Fighting Energy {C}' };
    assert.equal(getEnergyTokenFront(card), ENERGY_TOKEN_FRONT.fighting);
  });

  it('treats a card whose name ends in Energy as Energy even with no type', () => {
    assert.equal(isEnergyCard({ name: 'Rocky Fighting Energy', type: '' }), true);
    assert.equal(isEnergyCard({ name: 'Basic {F} Energy', type: 'Energy' }), true);
  });

  it('does not treat Pokemon or Trainers as Energy', () => {
    assert.equal(isEnergyCard({ name: 'Energy Retrieval', type: 'Trainer' }), false);
    assert.equal(isEnergyCard({ name: 'Pikachu', type: 'Pokemon' }), false);
    assert.equal(isEnergyCard(undefined), false);
    assert.equal(isEnergyCard({}), false);
  });
});
