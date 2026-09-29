// Battle Styles Build & Battle Box — Bulbapedia "Battle Styles Build & Battle Box (TCG)", revision 4389650 (read 2026-09-29).
export default {
  key: 'battle-styles',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Battle_Styles_Build_%26_Battle_Box_(TCG)', revision: 4389650 },
  promos: {
    cherrim: '1 Cherrim SWSHP 88',
    octillery: '1 Octillery SWSHP 89',
    houndoom: '1 Houndoom SWSHP 90',
    bronzong: '1 Bronzong SWSHP 91',
  },
  groups: {
    cherrim: [
      '2 Cherubi BST 7',
      '2 Cherrim BST 8',
      '2 Tapu Bulu BST 16',
      '1 Drampa BST 119',
      '1 Level Ball BST 129',
    ],
    octillery: [
      '1 Remoraid BST 36',
      '1 Octillery BST 37',
      '3 Mienfoo BST 76',
      '2 Mienshao BST 77',
      "1 Korrina's Focus BST 128",
      '1 Rapid Strike Energy BST 140',
    ],
    houndoom: [
      '2 Houndour BST 95',
      '2 Houndoom BST 96',
      '2 Stonjourner BST 84',
      '1 Bruno BST 121',
      '2 Single Strike Energy BST 141',
    ],
    bronzong: [
      '1 Bronzor BST 101',
      '2 Zubat BST 89',
      '2 Golbat BST 90',
      '2 Crobat BST 91',
      '1 Indeedee BST 120',
      '1 Quick Ball SSH 179',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { cherrim: 'Grass', octillery: 'Water', houndoom: 'Darkness', bronzong: 'Metal' },
  trainers: [
    {
      name: 'Supporter cards',
      count: null,
      cards: [
        '0-2 Hop SSH 165',
        "0-2 Professor's Research (Professor Magnolia) SSH 178", // Bulbapedia: "Professor's Research"
        '0-2 Dan RCL 158',
        '0-2 Sonia RCL 167',
        '0-2 Allister VIV 146', // page: VIV 179, the full-art print (TCGdex swsh4-179 Ultra Rare); Evolving Skies' page lists VIV 146 (design 054 D9)
        '0-2 Opal VIV 158', // page: VIV 184, the full-art print (TCGdex swsh4-184 Ultra Rare); the regular print is swsh4-158 (design 054 D9)
      ],
    },
  ],
};
