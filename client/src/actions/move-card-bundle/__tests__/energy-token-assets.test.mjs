import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  ENERGY_TOKEN_FRONT,
  energyTypeKeyFor,
  getEnergyTokenFront,
  getEnergyTokenSrcForType,
  isDoubleEnergyToken,
  isEnergyCard,
  normalizeEnergyType,
  specialEnergyTokenFor,
} from '../energy-token-assets.mjs';
import { SPECIAL_ENERGY_TOKENS } from '../special-energy-tokens.mjs';

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

  it('gives a Special Energy its own token cut from the card art', () => {
    const card = { name: 'Double Colorless Energy', types: [] };
    assert.equal(getEnergyTokenFront(card), '/src/assets/energy/special/double-colorless-energy.svg');
  });

  it('matches a typed Special Energy in symbol and type-word spellings', () => {
    const src = '/src/assets/energy/special/rocky-f-energy.svg';
    assert.equal(getEnergyTokenFront({ name: 'Rocky {F} Energy' }), src);
    assert.equal(getEnergyTokenFront({ name: 'Rocky Fighting Energy', types: ['Fighting'] }), src);
  });

  it('matches TCGdex spellings of Prism Star, δ and apostrophes', () => {
    assert.match(getEnergyTokenFront({ name: 'Beast Energy ◇' }), /beast-energy-prism-star\.svg$/);
    assert.match(getEnergyTokenFront({ name: 'δ Rainbow Energy' }), /delta-rainbow-energy\.webp$/);
    assert.match(getEnergyTokenFront({ name: "Team Rocket's Energy" }), /team-rocket-s-energy\.svg$/);
  });

  it('keeps basic Metal and Darkness on their type tokens unless marked Special', () => {
    assert.equal(getEnergyTokenFront({ name: 'Metal Energy', type: 'Energy' }), ENERGY_TOKEN_FRONT.metal);
    assert.equal(getEnergyTokenFront({ name: 'Darkness Energy', types: ['Darkness'] }), ENERGY_TOKEN_FRONT.darkness);
    assert.match(
      getEnergyTokenFront({ name: 'Metal Energy', subtype: 'Special Energy' }),
      /special\/metal-energy\./
    );
    assert.match(getEnergyTokenFront({ name: 'Darkness Energy', energyType: 'Special' }), /special\/darkness-energy\./);
  });

  it('flags Special Energy that provides 2 Energy as a two-orb token', () => {
    assert.equal(isDoubleEnergyToken({ name: 'Double Turbo Energy' }), true);
    assert.equal(isDoubleEnergyToken({ name: 'Neo Upper Energy' }), true);
    assert.equal(isDoubleEnergyToken({ name: 'Jet Energy' }), false);
    assert.equal(isDoubleEnergyToken({ name: 'Basic Fire Energy' }), false);
    assert.equal(isDoubleEnergyToken(undefined), false);
  });

  it('has a token for every Special Energy name in the card corpus', () => {
    const corpus = JSON.parse(
      readFileSync(new URL('../../../../../out/pkmn-special-energy-cards.json', import.meta.url), 'utf8')
    );
    const names = [...new Set(corpus.map((row) => row.name))];
    const missing = names.filter((name) => !specialEnergyTokenFor({ name, subtype: row(name) }));
    assert.deepEqual(missing, []);
    function row(name) {
      return corpus.find((r) => r.name === name).subtype;
    }
  });

  it('points every Special Energy token at a file that exists', () => {
    for (const token of SPECIAL_ENERGY_TOKENS) {
      const file = new URL(`../../../..${token.src}`, import.meta.url);
      assert.equal(existsSync(file), true, token.src);
    }
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
    assert.equal(getEnergyTokenFront({ name: 'Made-up Energy', types: [] }), null);
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

  it('normalizes printed type names and cost symbols to canonical keys', () => {
    assert.equal(normalizeEnergyType('Fire'), 'fire');
    assert.equal(normalizeEnergyType('Dark'), 'darkness');
    assert.equal(normalizeEnergyType('{F}'), 'fighting');
    assert.equal(normalizeEnergyType('F'), 'fighting');
    assert.equal(normalizeEnergyType(''), '');
    assert.equal(normalizeEnergyType(undefined), '');
  });

  it('resolves the canonical type key for an Energy card', () => {
    assert.equal(energyTypeKeyFor({ types: ['Fire'] }), 'fire');
    assert.equal(energyTypeKeyFor({ types: ['Dark'] }), 'darkness');
    assert.equal(energyTypeKeyFor({ name: 'Double Colorless Energy', types: [] }), 'colorless');
    assert.equal(energyTypeKeyFor({ name: 'Basic {F} Energy' }), 'fighting');
    assert.equal(energyTypeKeyFor({ name: 'Darkness Energy' }), 'darkness');
  });

  it('returns null from energyTypeKeyFor when no type can be determined', () => {
    assert.equal(energyTypeKeyFor({ name: 'Mystery Energy', types: [] }), null);
    assert.equal(energyTypeKeyFor(undefined), null);
  });
});
