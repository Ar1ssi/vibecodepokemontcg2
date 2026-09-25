import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  cardSpriteFor,
  itemSpriteForName,
  pokemonSpriteForName,
  resolveDisplaySprites,
} from '../core/card-sprites.mjs';

const CLIENT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..'
);
const slugOf = (name) => pokemonSpriteForName(name)?.slug ?? null;

test('rule-box suffixes are stripped down to the species', () => {
  assert.equal(slugOf('Pikachu ex'), 'pikachu');
  assert.equal(slugOf('Mewtwo-EX'), 'mewtwo');
  assert.equal(slugOf('Lugia VSTAR'), 'lugia');
  assert.equal(slugOf('Mew V'), 'mew');
  assert.equal(slugOf('Gardevoir LV.X'), 'gardevoir');
});

test('owner and decorative prefixes are stripped', () => {
  assert.equal(slugOf("Team Rocket's Mewtwo ex"), 'mewtwo');
  assert.equal(slugOf("Ethan's Ho-Oh ex"), 'ho-oh');
  assert.equal(slugOf("Misty's Psyduck"), 'psyduck');
  assert.equal(slugOf('Radiant Charizard'), 'charizard');
  assert.equal(slugOf('Shining Magikarp'), 'magikarp');
  assert.equal(slugOf('Dark Dragonite'), 'dragonite');
});

test('Mega, Primal, Gigantamax and regional forms map to their form sprite', () => {
  assert.equal(slugOf('Mega Charizard X ex'), 'charizard-mega-x');
  assert.equal(slugOf('Mega Charizard Y ex'), 'charizard-mega-y');
  assert.equal(slugOf('M Gardevoir-EX'), 'gardevoir-mega');
  assert.equal(slugOf('Mega Lucario ex'), 'lucario-mega');
  assert.equal(slugOf('Primal Kyogre-EX'), 'kyogre-primal');
  assert.equal(slugOf('Charizard VMAX'), 'charizard-gmax');
  assert.equal(slugOf('Galarian Zapdos V'), 'zapdos-galar');
  assert.equal(slugOf('Alolan Vulpix'), 'vulpix-alola');
  assert.equal(slugOf('Hisuian Zoroark VSTAR'), 'zoroark-hisui');
});

test('a form with no sprite falls back to the base species', () => {
  assert.equal(slugOf('Mew VMAX'), 'mew');
  assert.equal(slugOf('Mega Pikachu ex'), 'pikachu');
  assert.equal(slugOf('Galarian Pikachu'), 'pikachu');
});

test('generation 9 species and their named forms resolve', () => {
  assert.equal(slugOf("Iono's Bellibolt ex"), 'bellibolt');
  assert.equal(slugOf('Iron Hands ex'), 'iron-hands');
  assert.equal(slugOf('Chien-Pao ex'), 'chien-pao');
  assert.equal(slugOf('Paldean Wooper'), 'wooper-paldea');
  assert.equal(slugOf('Paldean Clodsire ex'), 'clodsire');
  assert.equal(slugOf('Bloodmoon Ursaluna ex'), 'ursaluna-bloodmoon');
  assert.equal(slugOf('Teal Mask Ogerpon ex'), 'ogerpon');
  assert.equal(slugOf('Wellspring Mask Ogerpon ex'), 'ogerpon-wellspring-mask');
  assert.equal(slugOf('Terapagos ex'), 'terapagos-terastal');
  assert.equal(slugOf('Palafin ex'), 'palafin-hero');
  assert.equal(slugOf('Palafin'), 'palafin');
});

test('Legends: Z-A and Mega Dimension Megas resolve, including Z Megas', () => {
  assert.equal(slugOf('Mega Dragonite ex'), 'dragonite-mega');
  assert.equal(slugOf('Mega Raichu X ex'), 'raichu-mega-x');
  assert.equal(slugOf('Mega Lucario Z ex'), 'lucario-mega-z');
  assert.equal(slugOf('Mega Lucario ex'), 'lucario-mega');
  assert.equal(slugOf('Mega Scovillain ex'), 'scovillain-mega');
  assert.equal(slugOf('Mega Floette ex'), 'floette-mega');
});

test('a Paldean Tauros card picks its breed from the card type', () => {
  const taurosOf = (types) =>
    cardSpriteFor({ name: 'Paldean Tauros', supertype: 'Pokémon', types })
      ?.slug;
  assert.equal(taurosOf(['Fighting']), 'tauros-paldea');
  assert.equal(taurosOf(['Fire']), 'tauros-paldea-blaze');
  assert.equal(taurosOf(['Water']), 'tauros-paldea-aqua');
  assert.equal(taurosOf(undefined), 'tauros-paldea');
});

test('descriptive prefixes the rules do not know still find the species', () => {
  assert.equal(slugOf('Armored Mewtwo'), 'mewtwo');
  assert.equal(slugOf('Single Strike Urshifu VMAX'), 'urshifu-gmax');
});

test('transform-form card names resolve to their form sprite', () => {
  assert.equal(slugOf('Black Kyurem ex'), 'kyurem-black');
  assert.equal(slugOf('Black Kyurem-EX'), 'kyurem-black');
  assert.equal(slugOf('White Kyurem-GX'), 'kyurem-white');
  assert.equal(slugOf('Dawn Wings Necrozma-GX'), 'necrozma-dawn');
  assert.equal(slugOf('Dusk Mane Necrozma-GX'), 'necrozma-dusk');
  assert.equal(slugOf('Ultra Necrozma'), 'necrozma-ultra');
  assert.equal(slugOf('Fan Rotom'), 'rotom-fan');
  assert.equal(slugOf('Heat Rotom'), 'rotom-heat');
  assert.equal(slugOf('Origin Forme Dialga V'), 'dialga-origin');
  assert.equal(slugOf('Origin Forme Palkia VSTAR'), 'palkia-origin');
  assert.equal(slugOf('Ice Rider Calyrex VMAX'), 'calyrex-ice-rider');
  assert.equal(slugOf('Shadow Rider Calyrex V'), 'calyrex-shadow-rider');
  assert.equal(slugOf('Ash-Greninja-EX'), 'greninja-ash');
  assert.equal(slugOf('Hoopa Unbound'), 'hoopa-unbound');
});

test('castform and deoxys card wordings resolve through aliases', () => {
  assert.equal(slugOf('Sunny Castform'), 'castform-sunny');
  assert.equal(slugOf('Rain Castform'), 'castform-rainy');
  assert.equal(slugOf('Castform Rain Form'), 'castform-rainy');
  assert.equal(slugOf('Castform Rainy Form'), 'castform-rainy');
  assert.equal(slugOf('Snow-cloud Castform'), 'castform-snowy');
  assert.equal(slugOf('Castform Snow-Cloud Form'), 'castform-snowy');
  assert.equal(slugOf('Castform Sunny Form'), 'castform-sunny');
  assert.equal(slugOf('Deoxys Attack Forme'), 'deoxys-attack');
  assert.equal(slugOf('Deoxys Defense Forme'), 'deoxys-defense');
  assert.equal(slugOf('Deoxys Speed Forme'), 'deoxys-speed');
  // The base look; the alias lands on the base sprite.
  assert.equal(slugOf('Deoxys Normal Forme'), 'deoxys');
});

test('strike-style Urshifu VMAX picks the matching Gigantamax form', () => {
  assert.equal(
    slugOf('Rapid Strike Urshifu VMAX'),
    'urshifu-rapid-strike-gmax'
  );
  assert.equal(slugOf('Single Strike Urshifu VMAX'), 'urshifu-gmax');
  // pokesprite has no regular Rapid Strike art, so the plain V falls to base.
  assert.equal(slugOf('Rapid Strike Urshifu V'), 'urshifu');
});

test('Arceus and Silvally pick their type form from the card types', () => {
  const arceusOf = (types) =>
    cardSpriteFor({ name: 'Arceus', supertype: 'Pokémon', types })?.slug;
  assert.equal(arceusOf(['Grass']), 'arceus-grass');
  assert.equal(arceusOf(['Darkness']), 'arceus-dark');
  assert.equal(arceusOf(['Metal']), 'arceus-steel');
  assert.equal(arceusOf(['Lightning']), 'arceus-electric');
  assert.equal(arceusOf(['Dragon']), 'arceus-dragon');
  // Colorless is the base look; the TCG never prints the missing types.
  assert.equal(arceusOf(['Colorless']), 'arceus');
  assert.equal(arceusOf(['Bug']), 'arceus');
  assert.equal(arceusOf(undefined), 'arceus');

  const silvallyOf = (types) =>
    cardSpriteFor({ name: 'Silvally-GX', supertype: 'Pokémon', types })?.slug;
  assert.equal(silvallyOf(['Grass']), 'silvally-grass');
  assert.equal(silvallyOf(['Colorless']), 'silvally');
});

test('Eternatus VMAX resolves to Eternamax, the plain V to base', () => {
  assert.equal(slugOf('Eternatus VMAX'), 'eternatus-eternamax');
  assert.equal(slugOf('Eternatus V'), 'eternatus');
});

test('names with punctuation and gender symbols match', () => {
  assert.equal(slugOf("Farfetch'd"), 'farfetchd');
  assert.equal(slugOf('Mr. Mime'), 'mr-mime');
  assert.equal(slugOf('Nidoran♀'), 'nidoran-f');
  assert.equal(slugOf('Flabébé'), 'flabebe');
  assert.equal(slugOf('Type: Null'), 'type-null');
});

test('unknown or empty names give no sprite', () => {
  assert.equal(pokemonSpriteForName(''), null);
  assert.equal(pokemonSpriteForName(undefined), null);
  assert.equal(pokemonSpriteForName('Missingno'), null);
});

test('item Trainers map to their pokesprite item icon', () => {
  assert.equal(itemSpriteForName('Great Ball')?.path, 'ball/great');
  assert.equal(itemSpriteForName('Ultra Ball')?.path, 'ball/ultra');
  assert.equal(itemSpriteForName('Poké Ball')?.path, 'ball/poke');
  assert.equal(itemSpriteForName('Rare Candy')?.path, 'medicine/rare-candy');
  assert.equal(itemSpriteForName('Float Stone')?.path, 'hold-item/float-stone');
  // No Choice Belt art in pokesprite: the override borrows Choice Band.
  assert.equal(itemSpriteForName('Choice Belt')?.path, 'hold-item/choice-band');
  assert.equal(itemSpriteForName('Exp. Share')?.path, 'key-item/exp-share');
  assert.equal(itemSpriteForName('Super Rod')?.path, 'key-item/super-rod');
  assert.equal(itemSpriteForName("Boss's Orders"), null);
  assert.equal(itemSpriteForName(''), null);
});

test('item icons resolve to files vendored on disk', () => {
  for (const name of [
    'Great Ball',
    'Rare Candy',
    'Choice Belt',
    'Super Rod',
    'VS Seeker',
  ]) {
    const sprite = cardSpriteFor({
      name,
      supertype: 'Trainer',
      subtypes: ['Item'],
    });
    assert.ok(sprite, name);
    assert.ok(existsSync(path.join(CLIENT_ROOT, sprite.url)), sprite.url);
  }
});

test('cardSpriteFor routes by supertype and skips Supporters, Stadiums and Energy', () => {
  assert.deepEqual(
    cardSpriteFor({ name: 'Charizard ex', supertype: 'Pokémon' }),
    {
      kind: 'pokemon',
      slug: 'charizard',
      url: '/src/assets/pokemon/gen8/regular/charizard.png',
      label: 'Charizard',
    }
  );
  assert.deepEqual(
    cardSpriteFor({
      name: 'Great Ball',
      supertype: 'Trainer',
      subtypes: ['Item'],
    }),
    {
      kind: 'item',
      url: '/src/assets/items/ball/great.png',
      label: 'Great Ball',
    }
  );
  assert.equal(
    cardSpriteFor({
      name: 'Rare Candy',
      supertype: 'Trainer',
      subtypes: ['Supporter'],
    }),
    null
  );
  assert.equal(
    cardSpriteFor({
      name: 'Artazon',
      supertype: 'Trainer',
      subtypes: ['Stadium'],
    }),
    null
  );
  assert.equal(
    cardSpriteFor({
      name: 'Rare Candy',
      supertype: 'Trainer',
      trainerType: 'Supporter',
    }),
    null
  );
  assert.equal(
    cardSpriteFor({
      name: 'Rare Candy',
      supertype: 'Trainer',
      trainerType: 'Item',
    })?.label,
    'Rare Candy'
  );
  assert.equal(
    cardSpriteFor({ name: 'Fire Energy', supertype: 'Energy' }),
    null
  );
  assert.equal(cardSpriteFor(null), null);
});

function deckOf(...entries) {
  const cards = {};
  for (const [name, count, supertype = 'Pokémon'] of entries) {
    cards[name] = { cards: [{ data: { name, supertype }, count }] };
  }
  return cards;
}

test('display sprites fill empty slots from the deck, most copies first', () => {
  const cards = deckOf(
    ['Pidgeot ex', 2],
    ['Charizard ex', 3],
    ['Rare Candy', 4, 'Trainer']
  );
  assert.deepEqual(resolveDisplaySprites([], cards), [
    { slug: 'charizard', shiny: false, auto: true },
    { slug: 'pidgeot', shiny: false, auto: true },
  ]);
});

test('chosen sprites come first and are never duplicated by the fill', () => {
  const cards = deckOf(['Charizard ex', 3], ['Pidgeot ex', 2]);
  assert.deepEqual(
    resolveDisplaySprites([{ slug: 'charizard', shiny: true }], cards),
    [
      { slug: 'charizard', shiny: true },
      { slug: 'pidgeot', shiny: false, auto: true },
    ]
  );
});

test('copies of one species across card names add up', () => {
  const cards = deckOf(['Charmander', 3], ['Pikachu', 2], ['Pikachu ex', 2]);
  assert.equal(resolveDisplaySprites([], cards)[0].slug, 'pikachu');
});

test('a deck with no Pokémon and no choice shows no sprites', () => {
  assert.deepEqual(
    resolveDisplaySprites([], deckOf(['Rare Candy', 4, 'Trainer'])),
    []
  );
  assert.deepEqual(resolveDisplaySprites(undefined, undefined), []);
});

test('an old three-sprite choice shows only the first two', () => {
  assert.deepEqual(
    resolveDisplaySprites(
      ['pikachu', 'eevee', 'mew'],
      deckOf(['Snorlax', 4])
    ).map((sprite) => sprite.slug),
    ['pikachu', 'eevee']
  );
});
