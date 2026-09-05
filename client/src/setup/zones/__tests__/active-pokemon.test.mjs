import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
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
  const img = { attached: false, relative: 0 };
  const zone = {
    array: [
      { type: 'Pokémon', name: 'Pikachu', image: img },
      { type: 'Energy', name: 'Lightning Energy', image: { attached: true, relative: img } },
    ],
  };
  assert.equal(getActivePokemonCard(zone).name, 'Pikachu');
  assert.equal(energiesAttachedToPokemon(zone, img).length, 1);
});
