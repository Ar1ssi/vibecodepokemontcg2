// Chilling Reign Build & Battle Box — Bulbapedia "Chilling Reign Build & Battle Box (TCG)", revision 4389651 (read 2026-09-29).
export default {
  key: 'chilling-reign',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Chilling_Reign_Build_%26_Battle_Box_(TCG)', revision: 4389651 },
  promos: {
    cinderace: '1 Cinderace SWSHP 112',
    inteleon: '1 Inteleon SWSHP 113',
    cresselia: '1 Cresselia SWSHP 114',
    passimian: '1 Passimian SWSHP 115',
  },
  groups: {
    cinderace: [
      '3 Scorbunny CRE 26',
      '3 Raboot CRE 27',
      '2 Cinderace CRE 28',
      '1 Bird Keeper DAA 159',
    ],
    inteleon: [
      '3 Sobble CRE 41',
      '3 Drizzile CRE 42',
      '2 Inteleon CRE 43',
    ],
    cresselia: [
      '3 Ralts CRE 59',
      '3 Kirlia CRE 60',
      '2 Gardevoir CRE 61',
      '1 Fog Crystal CRE 140',
    ],
    passimian: [
      '3 Diglett CRE 76',
      '2 Dugtrio CRE 77',
      '1 Level Ball BST 129',
      '1 Glimwood Tangle DAA 162',
      '1 Rapid Strike Energy BST 140',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { cinderace: 'Fire', inteleon: 'Water', cresselia: 'Psychic', passimian: 'Fighting' },
  trainers: [
    {
      name: 'Supporter cards',
      count: null,
      cards: [
        '0-2 Poké Kid SSH 173',
        "0-2 Professor's Research (Professor Magnolia) SSH 178", // Bulbapedia: "Professor's Research"
        '0-2 Sonia RCL 167',
        '0-2 Bruno BST 121',
        "0-2 Korrina's Focus BST 128",
        '0-2 Avery CRE 130',
      ],
    },
  ],
};
