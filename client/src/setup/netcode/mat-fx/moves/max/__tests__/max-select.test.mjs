import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gmaxMoveFor, maxAttackKind, maxMoveFor, typedMaxMoveFor, withMaxSpec } from '../max-select.mjs';
import { GMAX_MOVE_BY_SPECIES, MAX_MOVES, MAX_MOVE_BY_TYPE } from '../max-moves.mjs';
import { speciesFor } from '../../move-select.mjs';
import { slugFor } from '../../signature/signature-select.mjs';

// Cards from out/pkmn-pokemon-cards.json (name · set number · attacks).
const vmax = (name, types, attacks) => ({ supertype: 'Pokémon', name, subtypes: ['VMAX'], types, attacks: attacks.map((n) => ({ name: n })) });
const PIKACHU = vmax('Pikachu VMAX', ['Lightning'], ['Tail Charge', 'G-Max Thunder']); // SWSH Promos SWSH286
const GENGAR = vmax('Gengar VMAX', ['Psychic'], ['Fear and Panic', 'G-Max Swallow Up']); // Fusion Strike 271
const MEW = vmax('Mew VMAX', ['Psychic'], ['Cross Fusion Strike', 'Max Miracle']); // 30th Celebration 114
const ZERAORA = vmax('Zeraora VMAX', ['Lightning'], ['Reactive Pulse', 'Max Fist']); // Crown Zenith GG42
const MACHAMP = vmax('Machamp VMAX', ['Fighting'], ['Revenge Buster', 'G-Max Chi Strike']); // Astral Radiance 194
const SINGLE = vmax('Single Strike Urshifu VMAX', ['Fighting'], ['Beatdown', 'G-Max One Blow']); // Brilliant Stars TG29
const RAPID = vmax('Rapid Strike Urshifu VMAX', ['Fighting'], ['Gale Thrust', 'G-Max Rapid Flow']); // Brilliant Stars TG30
const RAYQUAZA = vmax('Rayquaza VMAX', ['Dragon'], ['Max Burst']); // Crown Zenith 102

const pick = (card, attackName, seed = 0) =>
  maxMoveFor(card, { attackName, slug: slugFor(card), species: speciesFor(card), seed });

test('maxAttackKind: "Max …" and "G-Max …" names only', () => {
  assert.equal(maxAttackKind('Max Miracle'), 'max');
  assert.equal(maxAttackKind('G-Max Volt Tackle'), 'gmax');
  assert.equal(maxAttackKind('G-MAX  One  Blow'), 'gmax');
  assert.equal(maxAttackKind('Maximum Belt'), null);
  assert.equal(maxAttackKind('Tail Charge'), null);
  assert.equal(maxAttackKind(''), null);
  assert.equal(maxAttackKind(undefined), null);
});

test('a G-Max attack plays its species\' G-Max Move, whatever the card calls it', () => {
  assert.deepEqual(pick(PIKACHU, 'G-Max Thunder'), { move: 'g-max-volt-crash', kind: 'gmax' });
  assert.deepEqual(pick(GENGAR, 'G-Max Swallow Up'), { move: 'g-max-terror', kind: 'gmax' });
  assert.deepEqual(pick(MACHAMP, 'G-Max Chi Strike'), { move: 'g-max-chi-strike', kind: 'gmax' });
});

test('the two Urshifu forms play their own G-Max Moves', () => {
  assert.deepEqual(pick(SINGLE, 'G-Max One Blow'), { move: 'g-max-one-blow', kind: 'gmax' });
  assert.deepEqual(pick(RAPID, 'G-Max Rapid Flow'), { move: 'g-max-rapid-flow', kind: 'gmax' });
});

test('a Max attack plays the Max Move of the species\' own type', () => {
  assert.deepEqual(pick(MEW, 'Max Miracle'), { move: 'max-mindstorm', kind: 'max' });
  assert.deepEqual(pick(ZERAORA, 'Max Fist'), { move: 'max-lightning', kind: 'max' });
  assert.deepEqual(pick(RAYQUAZA, 'Max Burst'), { move: 'max-wyrmwind', kind: 'max' });
});

test('a VMAX\'s other attacks, and every non-VMAX card, play no Max Move', () => {
  assert.equal(pick(PIKACHU, 'Tail Charge'), null);
  assert.equal(pick(MEW, 'Cross Fusion Strike'), null);
  const pikachuV = { supertype: 'Pokémon', name: 'Pikachu V', subtypes: ['Basic', 'V'], types: ['Lightning'] };
  assert.equal(pick(pikachuV, 'Max Fist'), null);
  assert.equal(maxMoveFor(null, { attackName: 'Max Fist' }), null);
  assert.equal(maxMoveFor({ supertype: 'Trainer', name: 'Max Potion' }, { attackName: 'Max Potion' }), null);
});

test('a VMAX known only by its stage counts', () => {
  const card = { supertype: 'Pokémon', name: 'Snorlax', stage: 'VMAX', types: ['Colorless'] };
  assert.deepEqual(maxMoveFor(card, { attackName: 'Max Fall', species: speciesFor(card) }), { move: 'max-strike', kind: 'max' });
});

test('a G-Max attack on a species with no G-Max form falls back to its typed Max Move', () => {
  const galarMeowth = vmax('Galarian Meowth VMAX', ['Metal'], ['G-Max Claw']);
  assert.equal(gmaxMoveFor(galarMeowth, 'meowth-galar'), null);
  assert.deepEqual(pick(galarMeowth, 'G-Max Claw'), { move: 'max-steelspike', kind: 'max' });
});

test('gmaxMoveFor: from the sprite slug, else from the card name', () => {
  assert.equal(gmaxMoveFor({ name: 'Appletun VMAX' }, 'appletun'), 'g-max-sweetness');
  assert.equal(gmaxMoveFor({ name: 'Coalossal VMAX' }, null), 'g-max-volcalith');
  assert.equal(gmaxMoveFor({ name: 'Charizard' }, null), 'g-max-wildfire');
  assert.equal(gmaxMoveFor({ name: 'Mew VMAX' }, 'mew'), null);
});

test('a dual-type species plays either type\'s Max Move, the same on both clients for one seed', () => {
  const lapras = vmax('Lapras VMAX', ['Water'], ['Max Wave']);
  const species = { atk: 85, spa: 85, types: ['water', 'ice'] };
  const moves = new Set([0, 1, 2, 3].map((seed) => typedMaxMoveFor(lapras, species, seed)));
  assert.deepEqual([...moves].sort(), ['max-geyser', 'max-hailstorm']);
  assert.equal(typedMaxMoveFor(lapras, species, 7), typedMaxMoveFor(lapras, species, 7));
});

test('typedMaxMoveFor: no species falls back on the printed type', () => {
  assert.equal(typedMaxMoveFor({ types: ['Fire'] }, null), 'max-flare');
  assert.equal(typedMaxMoveFor({ types: ['Metal'] }, null), 'max-steelspike');
  assert.equal(typedMaxMoveFor({ types: [] }, null), 'max-strike');
});

test('withMaxSpec: a pick plays only when its spec has shipped', () => {
  const specs = { 'max-flare': { id: 'max-flare' } };
  assert.deepEqual(withMaxSpec({ move: 'max-flare', kind: 'max' }, specs), { move: 'max-flare', kind: 'max', spec: specs['max-flare'] });
  assert.equal(withMaxSpec({ move: 'max-geyser', kind: 'max' }, specs), null);
  assert.equal(withMaxSpec(null, specs), null);
});

test('the catalogue: 18 Max Moves, one per type, and 33 G-Max Moves, each with a name and type', () => {
  assert.equal(Object.keys(MAX_MOVE_BY_TYPE).length, 18);
  assert.equal(Object.keys(GMAX_MOVE_BY_SPECIES).length, 33);
  const ids = [...Object.values(MAX_MOVE_BY_TYPE), ...Object.values(GMAX_MOVE_BY_SPECIES)];
  assert.equal(new Set(ids).size, 51);
  assert.deepEqual(Object.keys(MAX_MOVES).sort(), [...ids].sort());
  for (const [type, id] of Object.entries(MAX_MOVE_BY_TYPE)) assert.equal(MAX_MOVES[id].vgType, type, id);
});
