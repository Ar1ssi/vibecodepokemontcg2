// Build & Battle boxes and the Prerelease Kits they grew out of (designs 051, 054). The catalog is
// eager and small: names, promos, kinds, skins. Card data lives in per-set and per-box modules
// that `box-data.mjs` loads on demand. Every box's contents come from its Bulbapedia page
// (`sources.box`); promos are TCGdex ids.

/**
 * @typedef {'xy'|'sm'|'swsh'|'sv'|'me'} Era
 * @typedef {'fixed-decks'|'evolution-pack'|'evolution-deck'} BoxKind
 *   fixed-decks: one of four 40-card decks (Mega Evolution →); evolution-pack: a 23-card Evolution
 *   pack of the promo's group, one other group and random Trainers (Fates Collide → Fusion Strike);
 *   evolution-deck: the same pack plus Basic Energy to 40 cards (Brilliant Stars → Destined Rivals).
 * @typedef {{key: string, name: string, promoId: string, energy: string|null, sprites: string[]}} BoxDeck
 *   `energy` is the deck's (fixed) or the group's main Basic Energy; null when it has none.
 * @typedef {{keyArtCardId: string|null, palette: Era, packArtCardIds: string[],
 *   vendored: {box: boolean, packs: boolean}}} BoxSkin
 */

export const BOX_KINDS = Object.freeze(['fixed-decks', 'evolution-pack', 'evolution-deck']);

export const BUILD_BATTLE_ERA_NAMES = Object.freeze({
  xy: 'XY',
  sm: 'Sun & Moon',
  swsh: 'Sword & Shield',
  sv: 'Scarlet & Violet',
  me: 'Mega Evolution',
});

// Where each era's pack anatomy was read (design 054 § Research 5).
const PACK_SOURCES = Object.freeze({
  xy: 'https://www.pokebeach.com/2017/01/sun-moon-booster-packs-reintroducing-11-cards-new-reverse-holo-style',
  sm: 'https://www.pokebeach.com/2017/01/sun-moon-booster-packs-reintroducing-11-cards-new-reverse-holo-style',
  swsh: 'https://bulbapedia.bulbagarden.net/wiki/Booster_pack_(TCG)',
  sv: 'https://www.pokebeach.com/2023/03/scarlet-violet-booster-pack-configuration-finally-revealed-major-exciting-changes',
  me: 'https://tcgprotectors.com/blogs/pokemon-blog/phantasmal-flames-pull-rates-10000-packs-analyzed-hits-or-misses',
});

const BULBAPEDIA_WIKI = 'https://bulbapedia.bulbagarden.net/wiki/';

// Pack count, Energy count and pack art follow from the kind; the skin defaults to procedural art
// over the four promos. Key art (the box front): an ME box shows the Special Illustration Rare of
// the Pokémon on its set's first Mega Hyper Rare, as 051 chose me02-125 (TCGdex rarities).
function defineBox({ key, name, era, kind, decks, skin = {}, page, ...rest }) {
  return Object.freeze({
    key,
    name,
    shortName: name.replace(/ (Build & Battle Box|Prerelease Kit)$/, ''),
    era,
    kind,
    packCount: 4,
    energyCount: kind === 'evolution-deck' ? 17 : 0,
    ...rest,
    decks: Object.freeze(decks.map((deck) => Object.freeze({ ...deck, sprites: [...deck.sprites] }))),
    skin: Object.freeze({
      keyArtCardId: skin.keyArtCardId ?? null,
      palette: skin.palette ?? era,
      packArtCardIds: skin.packArtCardIds ?? decks.map((deck) => deck.promoId),
      vendored: Object.freeze({ box: Boolean(skin.vendored?.box), packs: Boolean(skin.vendored?.packs) }),
    }),
    sources: Object.freeze({
      box: `${BULBAPEDIA_WIKI}${encodeURIComponent(page.replace(/ /g, '_'))}`,
      packs: PACK_SOURCES[era],
    }),
  });
}

/** Every box, in release order. */
export const BUILD_BATTLE_BOXES = Object.freeze([
  // ── Mega Evolution: four fixed 40-card decks per box ──
  defineBox({
    key: 'mega-evolution',
    name: 'Mega Evolution Build & Battle Box',
    page: 'Mega Evolution Build & Battle Box (TCG)',
    era: 'me',
    setId: 'me01',
    promoSetId: 'mep',
    kind: 'fixed-decks',
    packModelKey: 'me',
    skin: { keyArtCardId: 'me01-178' },
    decks: [
      { key: 'meganium', name: 'Meganium', promoId: 'mep-001', energy: 'Basic Grass Energy', sprites: ['meganium', 'exeggutor'] },
      { key: 'inteleon', name: 'Inteleon', promoId: 'mep-002', energy: 'Basic Water Energy', sprites: ['inteleon', 'frosmoth'] },
      { key: 'alakazam', name: 'Alakazam', promoId: 'mep-003', energy: 'Basic Psychic Energy', sprites: ['alakazam', 'grumpig'] },
      { key: 'lunatone', name: 'Lunatone', promoId: 'mep-004', energy: 'Basic Fighting Energy', sprites: ['lunatone', 'garganacl'] },
    ],
  }),
  defineBox({
    key: 'phantasmal-flames',
    name: 'Phantasmal Flames Build & Battle Box',
    page: 'Phantasmal Flames Build & Battle Box (TCG)',
    era: 'me',
    setId: 'me02',
    promoSetId: 'mep',
    kind: 'fixed-decks',
    packModelKey: 'me',
    skin: { keyArtCardId: 'me02-125', vendored: { box: true, packs: true } },
    decks: [
      {
        key: 'ceruledge',
        name: 'Ceruledge',
        promoId: 'mep-014',
        energy: 'Basic Fire Energy',
        sprites: ['ceruledge', 'charcadet'],
      },
      {
        key: 'zacian',
        name: 'Zacian',
        promoId: 'mep-015',
        energy: 'Basic Psychic Energy',
        sprites: ['zacian', 'alcremie'],
      },
      {
        key: 'flygon',
        name: 'Flygon',
        promoId: 'mep-016',
        energy: 'Basic Fighting Energy',
        sprites: ['flygon', 'gliscor'],
      },
      {
        key: 'toxtricity',
        name: 'Toxtricity',
        promoId: 'mep-017',
        energy: 'Basic Darkness Energy',
        sprites: ['toxtricity', 'krookodile'],
      },
    ],
  }),
  defineBox({
    key: 'perfect-order',
    name: 'Perfect Order Build & Battle Box',
    page: 'Perfect Order Build & Battle Box (TCG)',
    era: 'me',
    setId: 'me03',
    promoSetId: 'mep',
    kind: 'fixed-decks',
    packModelKey: 'me',
    skin: { keyArtCardId: 'me03-120' },
    decks: [
      { key: 'serperior', name: 'Serperior', promoId: 'mep-064', energy: 'Basic Grass Energy', sprites: ['serperior', 'shaymin'] },
      { key: 'barbaracle', name: 'Barbaracle', promoId: 'mep-065', energy: 'Basic Fighting Energy', sprites: ['barbaracle', 'landorus'] },
      { key: 'tyrantrum', name: 'Tyrantrum', promoId: 'mep-066', energy: 'Basic Fighting Energy', sprites: ['tyrantrum', 'hawlucha'] },
      { key: 'doublade', name: 'Doublade', promoId: 'mep-067', energy: 'Basic Metal Energy', sprites: ['doublade', 'klefki'] },
    ],
  }),
  defineBox({
    key: 'chaos-rising',
    name: 'Chaos Rising Build & Battle Box',
    page: 'Chaos Rising Build & Battle Box (TCG)',
    era: 'me',
    setId: 'me04',
    promoSetId: 'mep',
    kind: 'fixed-decks',
    packModelKey: 'me',
    skin: { keyArtCardId: 'me04-116' },
    decks: [
      { key: 'delphox', name: 'Delphox', promoId: 'mep-074', energy: 'Basic Fire Energy', sprites: ['delphox', 'ninetales'] },
      { key: 'ampharos', name: 'Ampharos', promoId: 'mep-075', energy: 'Basic Lightning Energy', sprites: ['ampharos', 'emolga'] },
      { key: 'crobat', name: 'Crobat', promoId: 'mep-076', energy: 'Basic Darkness Energy', sprites: ['crobat', 'qwilfish'] },
      { key: 'goodra', name: 'Goodra', promoId: 'mep-077', energy: 'Basic Psychic Energy', sprites: ['goodra', 'meowstic'] },
    ],
  }),
  defineBox({
    key: 'pitch-black',
    name: 'Pitch Black Build & Battle Box',
    page: 'Pitch Black Build & Battle Box (TCG)',
    era: 'me',
    setId: 'me05',
    promoSetId: 'mep',
    kind: 'fixed-decks',
    packModelKey: 'me',
    skin: { keyArtCardId: 'me05-116' },
    decks: [
      { key: 'miraidon', name: 'Miraidon', promoId: 'mep-082', energy: 'Basic Lightning Energy', sprites: ['miraidon', 'vikavolt'] },
      { key: 'slowbro', name: 'Slowbro', promoId: 'mep-083', energy: 'Basic Psychic Energy', sprites: ['slowbro', 'silvally'] },
      { key: 'dhelmise', name: 'Dhelmise', promoId: 'mep-084', energy: 'Basic Psychic Energy', sprites: ['dhelmise', 'banette'] },
      { key: 'bastiodon', name: 'Bastiodon', promoId: 'mep-085', energy: 'Basic Metal Energy', sprites: ['bastiodon', 'skarmory'] },
    ],
  }),
]);

export const DEFAULT_BOX_KEY = 'phantasmal-flames';

/** The eras in release order, each with its boxes' keys in release order. */
export const BUILD_BATTLE_ERAS = Object.freeze(
  Object.entries(BUILD_BATTLE_ERA_NAMES).map(([key, name]) =>
    Object.freeze({
      key,
      name,
      boxKeys: Object.freeze(BUILD_BATTLE_BOXES.filter((box) => box.era === key).map((box) => box.key)),
    })
  )
);

export const BASIC_ENERGY_LABELS = [
  'Basic Grass Energy',
  'Basic Fire Energy',
  'Basic Water Energy',
  'Basic Lightning Energy',
  'Basic Psychic Energy',
  'Basic Fighting Energy',
  'Basic Darkness Energy',
  'Basic Metal Energy',
];

/** @returns {object|null} the box with this key, or null for an unknown key. */
export function getBuildBattleBox(key) {
  return BUILD_BATTLE_BOXES.find((box) => box.key === key) || null;
}

/** @returns {object[]} the era's boxes in release order ([] for an unknown era). */
export function boxesForEra(era) {
  return BUILD_BATTLE_BOXES.filter((box) => box.era === era);
}
