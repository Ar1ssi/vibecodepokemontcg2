import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAX_DECK_SPRITES,
  POKEMON_SPRITE_CATALOG,
  addDeckSprite,
  deckSpriteImageUrl,
  deckSpriteLabel,
  findPokemonBySlug,
  hasShinySprite,
  normalizeDeckSprites,
  removeDeckSpriteAt,
  searchPokemon,
  toggleDeckSpriteShinyAt,
} from '../core/deck-sprites.mjs';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../..'
);

test('the catalog is unique by slug and dex-ordered', () => {
  assert.ok(POKEMON_SPRITE_CATALOG.length > 1000);
  const slugs = new Set(POKEMON_SPRITE_CATALOG.map((entry) => entry.slug));
  assert.equal(slugs.size, POKEMON_SPRITE_CATALOG.length);
  const indexes = POKEMON_SPRITE_CATALOG.map((entry) => entry.idx);
  assert.deepEqual(indexes, [...indexes].sort((a, b) => Number(a) - Number(b)));
});

// The catalog promises a file for every slug; a partial vendoring run would
// otherwise only show up as broken images in the browser.
test('every catalog entry resolves to sprite files on disk, shiny or not', () => {
  const missing = [];
  for (const entry of POKEMON_SPRITE_CATALOG) {
    for (const shiny of [false, true]) {
      const url = deckSpriteImageUrl({ slug: entry.slug, shiny });
      if (!existsSync(path.join(REPO_ROOT, 'client', url))) missing.push(url);
    }
  }
  assert.deepEqual(missing, []);
});

test('the catalog carries every generation 9 species, 906 to 1025', () => {
  const indexes = new Set(POKEMON_SPRITE_CATALOG.map((entry) => Number(entry.idx)));
  for (let idx = 906; idx <= 1025; idx += 1) assert.ok(indexes.has(idx), String(idx));
  assert.equal(findPokemonBySlug('sprigatito').name, 'Sprigatito');
  assert.equal(findPokemonBySlug('iron-crown').name, 'Iron Crown');
  assert.equal(findPokemonBySlug('pecharunt').idx, '1025');
});

test('a Paldean form sits right after its older species', () => {
  const names = POKEMON_SPRITE_CATALOG.filter((entry) => entry.species === 'Tauros').map(
    (entry) => entry.name
  );
  assert.deepEqual(names, [
    'Tauros',
    'Paldean Tauros',
    'Paldean Tauros (Blaze Breed)',
    'Paldean Tauros (Aqua Breed)',
  ]);
});

test('generation 9 art has no shiny set, so shiny is never stored or shown', () => {
  assert.equal(hasShinySprite('sprigatito'), false);
  assert.equal(hasShinySprite('pikachu'), true);
  assert.equal(hasShinySprite('missingno'), false);
  assert.equal(
    deckSpriteImageUrl({ slug: 'sprigatito', shiny: true }),
    '/src/assets/pokemon/gen9/regular/sprigatito.png'
  );
  assert.equal(deckSpriteLabel({ slug: 'sprigatito', shiny: true }), 'Sprigatito');
  assert.deepEqual(normalizeDeckSprites([{ slug: 'sprigatito', shiny: true }]), [
    { slug: 'sprigatito', shiny: false },
  ]);
  assert.deepEqual(addDeckSprite([], 'sprigatito', true), [{ slug: 'sprigatito', shiny: false }]);
  assert.deepEqual(toggleDeckSpriteShinyAt([{ slug: 'sprigatito' }], 0), [
    { slug: 'sprigatito', shiny: false },
  ]);
});

test('names with awkward characters keep a URL-safe slug', () => {
  for (const [name, slug] of [
    ['Nidoran♀', 'nidoran-f'],
    ['Farfetch’d', 'farfetchd'],
    ['Flabébé', 'flabebe'],
    ['Type: Null', 'type-null'],
  ]) {
    const entry = findPokemonBySlug(slug);
    assert.ok(entry, `${slug} missing from the catalog`);
    assert.match(entry.slug, /^[a-z0-9-]+$/);
    assert.ok(entry.name.length > 0, name);
  }
});

test('sprite urls point at the vendored art and switch on shiny', () => {
  assert.equal(
    deckSpriteImageUrl({ slug: 'pikachu' }),
    '/src/assets/pokemon/gen8/regular/pikachu.png'
  );
  assert.equal(
    deckSpriteImageUrl({ slug: 'pikachu', shiny: true }),
    '/src/assets/pokemon/gen8/shiny/pikachu.png'
  );
});

test('an unknown slug yields no url and no label rather than a broken path', () => {
  assert.equal(deckSpriteImageUrl({ slug: 'missingno' }), '');
  assert.equal(deckSpriteImageUrl({}), '');
  assert.equal(deckSpriteLabel({ slug: 'missingno' }), '');
});

test('labels name the shiny variant', () => {
  assert.equal(deckSpriteLabel({ slug: 'pikachu' }), 'Pikachu');
  assert.equal(
    deckSpriteLabel({ slug: 'pikachu', shiny: true }),
    'Shiny Pikachu'
  );
});

test('normalizing drops malformed entries and keeps the good ones', () => {
  assert.deepEqual(normalizeDeckSprites(undefined), []);
  assert.deepEqual(normalizeDeckSprites('pikachu'), []);
  assert.deepEqual(normalizeDeckSprites([null, 42, { slug: 'nope' }]), []);
  assert.deepEqual(
    normalizeDeckSprites([{ slug: 'pikachu', shiny: 'yes' }, 'eevee']),
    [
      { slug: 'pikachu', shiny: true },
      { slug: 'eevee', shiny: false },
    ]
  );
});

test('normalizing truncates a stored list past the two-sprite cap', () => {
  const stored = ['pikachu', 'eevee', 'snorlax', 'gengar', 'mew'];
  assert.equal(normalizeDeckSprites(stored).length, MAX_DECK_SPRITES);
  assert.deepEqual(
    normalizeDeckSprites(stored).map((sprite) => sprite.slug),
    ['pikachu', 'eevee']
  );
});

test('normalizing de-duplicates by slug, keeping the first shiny choice', () => {
  const sprites = normalizeDeckSprites([
    { slug: 'pikachu', shiny: true },
    { slug: 'pikachu', shiny: false },
  ]);
  assert.deepEqual(sprites, [{ slug: 'pikachu', shiny: true }]);
});

test('adding appends, and refuses duplicates, unknowns and a full strip', () => {
  const one = addDeckSprite([], 'pikachu');
  assert.deepEqual(one, [{ slug: 'pikachu', shiny: false }]);
  assert.deepEqual(addDeckSprite(one, 'pikachu'), one);
  assert.deepEqual(addDeckSprite(one, 'missingno'), one);

  const full = addDeckSprite(addDeckSprite(one, 'eevee'), 'snorlax');
  assert.equal(full.length, MAX_DECK_SPRITES);
  assert.deepEqual(addDeckSprite(full, 'mew'), full);
});

test('adding can start a slot shiny', () => {
  assert.deepEqual(addDeckSprite([], 'gengar', true), [
    { slug: 'gengar', shiny: true },
  ]);
});

test('removing takes the slot at the index and ignores a bad index', () => {
  const sprites = normalizeDeckSprites(['pikachu', 'eevee']);
  assert.deepEqual(
    removeDeckSpriteAt(sprites, 0).map((sprite) => sprite.slug),
    ['eevee']
  );
  assert.deepEqual(removeDeckSpriteAt(sprites, 9), sprites);
  assert.deepEqual(removeDeckSpriteAt(sprites, -1), sprites);
  assert.deepEqual(removeDeckSpriteAt(sprites, 1.5), sprites);
});

test('toggling shiny flips exactly one slot', () => {
  const sprites = normalizeDeckSprites(['pikachu', 'eevee']);
  const toggled = toggleDeckSpriteShinyAt(sprites, 1);
  assert.deepEqual(toggled, [
    { slug: 'pikachu', shiny: false },
    { slug: 'eevee', shiny: true },
  ]);
  assert.deepEqual(toggleDeckSpriteShinyAt(toggled, 1), sprites);
  assert.deepEqual(toggleDeckSpriteShinyAt(sprites, 5), sprites);
});

test('none of the operations mutate the list they are given', () => {
  const sprites = normalizeDeckSprites(['pikachu', 'eevee']);
  const snapshot = structuredClone(sprites);
  addDeckSprite(sprites, 'snorlax');
  removeDeckSpriteAt(sprites, 0);
  toggleDeckSpriteShinyAt(sprites, 0);
  assert.deepEqual(sprites, snapshot);
});

test('search prefers prefix matches and falls back to substrings', () => {
  const results = searchPokemon('char').map((entry) => entry.slug);
  assert.deepEqual(results.slice(0, 3), [
    'charmander',
    'charmeleon',
    'charizard',
  ]);

  const chu = searchPokemon('chu').map((entry) => entry.slug);
  assert.ok(chu.includes('pikachu'));
  assert.ok(chu.includes('raichu'));
});

test('search is case-insensitive and matches slugs as well as names', () => {
  assert.equal(searchPokemon('PIKACHU')[0].slug, 'pikachu');
  assert.equal(searchPokemon('mr-mime')[0].slug, 'mr-mime');
});

test('an empty query lists the start of the dex, a nonsense query lists nothing', () => {
  assert.equal(searchPokemon('')[0].slug, 'bulbasaur');
  assert.deepEqual(searchPokemon('zzzzzz'), []);
});

test('search honours the limit', () => {
  assert.equal(searchPokemon('', 5).length, 5);
  assert.equal(searchPokemon('a', 3).length, 3);
  assert.ok(
    searchPokemon('', 0).length > 0,
    'a bad limit falls back to the default'
  );
});

// --- alternate forms (Mega / Primal / Gigantamax / regional) ---

test('a species is immediately followed by its forms, in catalog order', () => {
  const names = POKEMON_SPRITE_CATALOG.filter(
    (entry) => entry.species === 'Charizard'
  ).map((entry) => entry.name);
  assert.deepEqual(names, [
    'Charizard',
    'Mega Charizard X',
    'Mega Charizard Y',
    'Gigantamax Charizard',
  ]);
});

test('searching a species name returns the species with all of its forms', () => {
  const names = searchPokemon('gengar').map((entry) => entry.name);
  assert.deepEqual(names, ['Gengar', 'Mega Gengar', 'Gigantamax Gengar']);
});

test('the base Pokémon always leads its own forms', () => {
  for (const query of ['meowth', 'growlithe', 'kyogre']) {
    assert.equal(searchPokemon(query)[0].form, null, query);
  }
});

test('regional and Gigantamax forms are reachable by their own wording', () => {
  assert.ok(
    searchPokemon('alolan').some((entry) => entry.slug === 'raichu-alola')
  );
  assert.ok(
    searchPokemon('galarian').some((entry) => entry.slug === 'meowth-galar')
  );
  assert.ok(
    searchPokemon('hisuian').some((entry) => entry.slug === 'growlithe-hisui')
  );
  assert.ok(
    searchPokemon('gigantamax').some((entry) => entry.slug === 'gengar-gmax')
  );
  // "gmax" is how the form is spelled in the slug, so it is searchable too.
  assert.ok(
    searchPokemon('gmax').some((entry) => entry.slug === 'gengar-gmax')
  );
});

test('searching a form keyword collects that form across species', () => {
  const results = searchPokemon('mega', 300);
  const megas = results.filter((entry) => entry.form?.startsWith('mega'));
  assert.ok(megas.length > 20);
  assert.ok(megas.some((entry) => entry.slug === 'gengar-mega'));
  assert.ok(megas.some((entry) => entry.slug === 'charizard-mega-x'));
  // Meganium's own name starts with the query, so the species bucket wins the
  // top of the list — "mega" is a name as well as a form.
  assert.equal(results[0].slug, 'meganium');
});

test('a form carries its own art, regular and shiny', () => {
  assert.equal(
    deckSpriteImageUrl({ slug: 'gengar-mega' }),
    '/src/assets/pokemon/gen8/regular/gengar-mega.png'
  );
  assert.equal(
    deckSpriteImageUrl({ slug: 'charizard-gmax', shiny: true }),
    '/src/assets/pokemon/gen8/shiny/charizard-gmax.png'
  );
});

test('a form can be pinned and labelled like any other Pokémon', () => {
  const sprites = addDeckSprite([], 'meowth-galar', true);
  assert.deepEqual(sprites, [{ slug: 'meowth-galar', shiny: true }]);
  assert.equal(deckSpriteLabel(sprites[0]), 'Shiny Galarian Meowth');
});

test('a species and its form are different slots, not a duplicate', () => {
  const sprites = addDeckSprite(addDeckSprite([], 'gengar'), 'gengar-mega');
  assert.deepEqual(
    sprites.map((sprite) => sprite.slug),
    ['gengar', 'gengar-mega']
  );
});

test('cosmetic-only forms are deliberately absent', () => {
  // Unown letters, Vivillon patterns and Alcremie creams are hundreds of
  // near-identical rows that would bury the species they belong to.
  assert.equal(findPokemonBySlug('unown-b'), null);
  assert.equal(findPokemonBySlug('vivillon-polar'), null);
  assert.equal(findPokemonBySlug('pikachu-libre'), null);
});
