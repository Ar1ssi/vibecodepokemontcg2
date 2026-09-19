import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderAttachedForCarousel } from '../carousel-order.mjs';

const pokemon = (name, stage) => ({ name, stage, supertype: 'Pokémon' });
const tool = (name) => ({
  name,
  supertype: 'Trainer',
  trainerType: 'Tool',
});
const energy = (name, type) => ({
  name,
  supertype: 'Energy',
  types: [type],
});

// The candidate array is laid out with the index increasing to the LEFT, so the returned
// array is the reverse of the on-screen left-to-right order.
test('attached cards come back energy, tool, then evolution line', () => {
  const ordered = orderAttachedForCarousel([
    pokemon('Charmander', 'Basic'),
    tool('Rocky Helmet'),
    pokemon('Charmeleon', 'Stage 1'),
    energy('Fire Energy', 'Fire'),
  ]);

  assert.deepEqual(
    ordered.map((c) => c.name),
    ['Fire Energy', 'Rocky Helmet', 'Charmander', 'Charmeleon']
  );
});

test('the clicked card appended last is the leftmost slide, so the line reads highest stage first', () => {
  const main = pokemon('Charizard', 'Stage 2');
  const candidates = [
    ...orderAttachedForCarousel([
      pokemon('Charmander', 'Basic'),
      energy('Fire Energy', 'Fire'),
      tool('Rocky Helmet'),
      pokemon('Charmeleon', 'Stage 1'),
    ]),
    main,
  ];

  // Reversing the candidate array gives the on-screen left-to-right order.
  assert.deepEqual(
    [...candidates].reverse().map((c) => c.name),
    ['Charizard', 'Charmeleon', 'Charmander', 'Rocky Helmet', 'Fire Energy']
  );
});

test('unknown trainers group with tools and empty input is safe', () => {
  const ordered = orderAttachedForCarousel([
    { name: 'Rare Candy', supertype: 'Trainer' },
    energy('Water Energy', 'Water'),
  ]);
  assert.deepEqual(
    ordered.map((c) => c.name),
    ['Water Energy', 'Rare Candy']
  );
  assert.deepEqual(orderAttachedForCarousel(), []);
});

test('same-stage cards keep their incoming order', () => {
  const ordered = orderAttachedForCarousel([
    pokemon('Pikachu', 'Basic'),
    pokemon('Raichu', 'Stage 1'),
    pokemon('Voltorb', 'Basic'),
  ]);
  assert.deepEqual(
    ordered.map((c) => c.name),
    ['Pikachu', 'Voltorb', 'Raichu']
  );
});
