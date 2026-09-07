import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  countBenchPokemon,
  energiesAttachedToPokemon,
  getActivePokemonCard,
  pokemonEnergyHostImage,
} from '../active-pokemon.mjs';

test('getActivePokemonCard returns evolved card when stack present', () => {
  const baseImg = { attached: false, relative: null };
  const evoImg = { attached: false, relative: null };
  baseImg.relative = evoImg;

  const zone = {
    array: [
      { type: 'Pokémon', name: 'Pikachu', image: baseImg },
      { type: 'Pokémon', name: 'Raichu', image: evoImg },
      { type: 'Energy', name: 'Lightning Energy', image: { attached: true, relative: evoImg } },
    ],
  };

  assert.equal(getActivePokemonCard(zone).name, 'Raichu');
  assert.equal(
    energiesAttachedToPokemon(zone, pokemonEnergyHostImage(zone)).length,
    1
  );
});

test('getActivePokemonCard returns sole Pokémon when not evolved', () => {
  const img = { attached: false, relative: null };
  const zone = {
    array: [
      { type: 'Pokémon', name: 'Pikachu', image: img },
      { type: 'Energy', name: 'Lightning Energy', image: { attached: true, relative: img } },
    ],
  };
  assert.equal(getActivePokemonCard(zone).name, 'Pikachu');
  assert.equal(energiesAttachedToPokemon(zone, img).length, 1);
  assert.equal(countBenchPokemon(zone), 1);
});

test('countBenchPokemon: 4 bench Pokémon + attached Energy counts as 4', () => {
  const hostImg = { attached: false, relative: null };
  const zone = {
    array: [
      { type: 'Pokémon', name: 'Pikachu', image: hostImg },
      { type: 'Pokémon', name: 'Eevee', image: { attached: false, relative: null } },
      { type: 'Pokémon', name: 'Squirtle', image: { attached: false, relative: null } },
      { type: 'Pokémon', name: 'Bulbasaur', image: { attached: false, relative: null } },
      { type: 'Energy', name: 'Lightning Energy', image: { attached: true, relative: hostImg } },
    ],
  };
  assert.equal(countBenchPokemon(zone), 4);
});

test('canAddToBench: 4 bench Pokémon + attached Energy still has one open slot', async () => {
  const { canAddToBench } = await import('../../rules/ko-flow.mjs');
  const hostImg = { attached: false, relative: null };
  const zone = {
    array: [
      { type: 'Pokémon', name: 'Pikachu', image: hostImg },
      { type: 'Pokémon', name: 'Eevee', image: { attached: false, relative: null } },
      { type: 'Pokémon', name: 'Squirtle', image: { attached: false, relative: null } },
      { type: 'Pokémon', name: 'Bulbasaur', image: { attached: false, relative: null } },
      { type: 'Energy', name: 'Lightning Energy', image: { attached: true, relative: hostImg } },
    ],
  };
  assert.equal(canAddToBench(countBenchPokemon(zone), 5).allowed, true);
  assert.equal(canAddToBench(zone.array.length, 5).allowed, false);
});
