// Build & Battle boxes (design 051). Box contents: pokemon.com news "Get a Pokémon TCG: Mega
// Evolution—Phantasmal Flames Build & Battle Box Early"; promos mep-014…mep-017 (TCGdex).

/** Phantasmal Flames pack slots; rates from tcgprotectors.com 10,000-pack analysis (design 051 § Pack model). */
export const ME_PACK_MODEL = Object.freeze({
  size: 10,
  slots: [
    { pools: ['Common'], count: 4 },
    { pools: ['Uncommon'], count: 3 },
    { count: 1, table: [['reverse', 1]] },
    {
      count: 1,
      table: [
        ['Illustration rare', 0.1097],
        ['Special illustration rare', 0.0125],
        ['reverse', 0.8778],
      ],
    },
    {
      count: 1,
      table: [
        ['Double rare', 0.201],
        ['Ultra Rare', 0.0806],
        ['Mega Hyper Rare', 0.0008],
        ['Rare', 0.7176],
      ],
    },
  ],
});

/** The pack each baked set's boosters roll, keyed by set id (the seam design 054 fills). */
export const PACK_MODELS = Object.freeze({ me02: ME_PACK_MODEL });

/** @returns {object|null} the pack model for `setId`, or null for a set with none. */
export function packModelFor(setId) {
  return Object.hasOwn(PACK_MODELS, setId) ? PACK_MODELS[setId] : null;
}

export const BUILD_BATTLE_BOXES = [
  {
    key: 'phantasmal-flames',
    name: 'Phantasmal Flames Build & Battle Box',
    setId: 'me02',
    packCount: 4,
    packModel: ME_PACK_MODEL,
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
  },
];

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
