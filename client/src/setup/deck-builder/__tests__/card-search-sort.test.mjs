import test from 'node:test';
import assert from 'node:assert/strict';

import { applyLocalControls } from '../core/card-search.mjs';

const sample = [
  {
    id: 'b',
    name: 'Bulbasaur',
    image: 'https://example.com/tcg/bulba.png',
    set: { releaseDate: '2023-01-01', name: 'Set B' },
  },
  {
    id: 'a',
    name: 'Abra',
    image: 'https://example.com/tcg/abra.png',
    set: { releaseDate: '2024-01-01', name: 'Set A' },
  },
  {
    id: 'c',
    name: 'Charmander',
    image: 'https://example.com/tcgp/charmander.png',
    set: { releaseDate: '2022-01-01', name: 'Set C' },
  },
];

const sameNameSample = [
  {
    id: 'pikachu-old',
    name: 'Pikachu',
    image: 'https://example.com/tcg/pikachu-old.png',
    set: { releaseDate: '2021-01-01', name: 'Old Set' },
  },
  {
    id: 'pikachu-new',
    name: 'Pikachu',
    image: 'https://example.com/tcg/pikachu-new.png',
    set: { releaseDate: '2024-01-01', name: 'New Set' },
  },
  {
    id: 'pikachu-mid',
    name: 'Pikachu',
    image: 'https://example.com/tcg/pikachu-mid.png',
    set: { releaseDate: '2023-01-01', name: 'Mid Set' },
  },
];

test('applyLocalControls sorts by name ascending', () => {
  const results = applyLocalControls(sample, { sortBy: 'name', sortDirection: 'asc', cardType: 'all' });
  assert.deepEqual(results.map((c) => c.name), ['Abra', 'Bulbasaur', 'Charmander']);
});

test('applyLocalControls sorts by name descending', () => {
  const results = applyLocalControls(sample, { sortBy: 'name', sortDirection: 'desc', cardType: 'all' });
  assert.deepEqual(results.map((c) => c.name), ['Charmander', 'Bulbasaur', 'Abra']);
});

test('applyLocalControls sorts by release date descending', () => {
  const results = applyLocalControls(sample, { sortBy: 'releaseDate', sortDirection: 'desc', cardType: 'all' });
  assert.deepEqual(results.map((c) => c.name), ['Abra', 'Bulbasaur', 'Charmander']);
});

test('applyLocalControls sorts by release date ascending', () => {
  const results = applyLocalControls(sample, { sortBy: 'releaseDate', sortDirection: 'asc', cardType: 'all' });
  assert.deepEqual(results.map((c) => c.name), ['Charmander', 'Bulbasaur', 'Abra']);
});

test('applyLocalControls filters tcg and pocket locally', () => {
  const tcg = applyLocalControls(sample, { sortBy: 'name', sortDirection: 'asc', cardType: 'tcg' });
  const pocket = applyLocalControls(sample, { sortBy: 'name', sortDirection: 'asc', cardType: 'pocket' });
  assert.deepEqual(tcg.map((c) => c.name), ['Abra', 'Bulbasaur']);
  assert.deepEqual(pocket.map((c) => c.name), ['Charmander']);
});

test('name asc tie-break uses earlier release dates first', () => {
  const results = applyLocalControls(sameNameSample, { sortBy: 'name', sortDirection: 'asc', cardType: 'all' });
  assert.deepEqual(results.map((c) => c.id), ['pikachu-old', 'pikachu-mid', 'pikachu-new']);
});

test('name desc tie-break uses later release dates first', () => {
  const results = applyLocalControls(sameNameSample, { sortBy: 'name', sortDirection: 'desc', cardType: 'all' });
  assert.deepEqual(results.map((c) => c.id), ['pikachu-new', 'pikachu-mid', 'pikachu-old']);
});

test('applyLocalControls sorts by HP, Pokémon first in both directions', () => {
  const cards = [
    { id: 'nest', name: 'Nest Ball', hp: null, set: {} },
    { id: 'pika', name: 'Pikachu', hp: 60, set: {} },
    { id: 'zard', name: 'Charizard ex', hp: 330, set: {} },
  ];
  const desc = applyLocalControls(cards, { sortBy: 'hp', sortDirection: 'desc' });
  assert.deepEqual(desc.map((card) => card.id), ['zard', 'pika', 'nest']);
  const asc = applyLocalControls(cards, { sortBy: 'hp', sortDirection: 'asc' });
  assert.deepEqual(asc.map((card) => card.id), ['pika', 'zard', 'nest']);
});

test('applyLocalControls sorts collector numbers the way they read', () => {
  const set = { id: 'swsh12', releaseDate: '2022-11-11' };
  const cards = [
    { id: 'tg', name: 'A', number: 'TG12', set },
    { id: 'n100', name: 'B', number: '100', set },
    { id: 'n9', name: 'C', number: '9', set },
  ];
  const asc = applyLocalControls(cards, { sortBy: 'number', sortDirection: 'asc' });
  assert.deepEqual(asc.map((card) => card.id), ['n9', 'n100', 'tg']);
});

test('applyLocalControls no longer truncates by visible count', () => {
  const results = applyLocalControls(sample, { sortBy: 'name', sortDirection: 'asc', cardType: 'all', visibleCount: 1 });
  assert.deepEqual(results.map((c) => c.name), ['Abra', 'Bulbasaur', 'Charmander']);
});
