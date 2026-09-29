// Evolving Skies Build & Battle Box — Bulbapedia "Evolving Skies Build & Battle Box (TCG)", revision 4389652 (read 2026-09-29).
export default {
  key: 'evolving-skies',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Evolving_Skies_Build_%26_Battle_Box_(TCG)', revision: 4389652 },
  promos: {
    flaaffy: '1 Flaaffy SWSHP 122',
    'galarian-articuno': '1 Galarian Articuno SWSHP 123',
    'galarian-zapdos': '1 Galarian Zapdos SWSHP 124',
    'galarian-moltres': '1 Galarian Moltres SWSHP 125',
  },
  groups: {
    flaaffy: [
      '2 Mareep EVS 54',
      '2 Flaaffy EVS 55',
      '1 Emolga EVS 57',
      '2 Regieleki EVS 60',
      '1 Stormy Mountains EVS 161',
    ],
    'galarian-articuno': [
      '3 Fletchling EVS 138',
      '2 Fletchinder EVS 139',
      '2 Talonflame EVS 140',
      '1 Evolution Incense SSH 163',
    ],
    'galarian-zapdos': [
      '2 Smeargle EVS 128',
      '1 Tropius EVS 6',
      '2 Gossifleur EVS 15',
      '2 Eldegoss EVS 16',
      '1 Level Ball BST 129',
      '1 Raihan EVS 152',
    ],
    'galarian-moltres': [
      '3 Zorua EVS 102',
      '3 Zoroark EVS 103',
      '1 Evolution Incense SSH 163',
      '1 Quick Ball SSH 179',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { flaaffy: 'Lightning', 'galarian-articuno': 'Psychic', 'galarian-zapdos': 'Fighting', 'galarian-moltres': 'Darkness' },
  trainers: [
    {
      name: 'Supporter cards',
      count: null,
      cards: [
        '0-2 Poké Kid SSH 173',
        "0-2 Professor's Research (Professor Magnolia) SSH 178", // Bulbapedia: "Professor's Research"
        '0-2 Milo RCL 161',
        '0-2 Sonia RCL 167',
        '0-2 Allister VIV 146',
        '0-2 Bruno BST 121',
        "0-2 Korrina's Focus BST 128",
        '0-2 Copycat EVS 143',
        "0-2 Zinnia's Resolve EVS 164",
      ],
    },
  ],
};
