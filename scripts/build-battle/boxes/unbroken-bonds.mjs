// Unbroken Bonds Build & Battle Box — Bulbapedia "Unbroken Bonds Build & Battle Box (TCG)", revision 4380446 (read 2026-09-29).
export default {
  key: 'unbroken-bonds',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Unbroken_Bonds_Build_%26_Battle_Box_(TCG)', revision: 4380446 },
  promos: {
    volcanion: '1 Volcanion SMP 179',
    stakataka: '1 Stakataka SMP 180',
    melmetal: '1 Melmetal SMP 181',
    persian: '1 Persian SMP 182',
  },
  groups: {
    volcanion: [
      '3 Litten UNB 27',
      '2 Torracat UNB 28',
      '2 Incineroar UNB 29',
      '1 Welder UNB 189',
      '1 Pokémon Communication TEU 152',
    ],
    stakataka: [
      '2 Sandshrew UNB 83',
      '2 Sandslash UNB 84',
      '2 Crabrawler UNB 104',
      '2 Crabominable UNB 105',
      '1 Janine UNB 176',
    ],
    melmetal: [
      '3 Riolu UNB 102',
      '2 Lucario UNB 126',
      '1 Meltan UNB 128',
      '1 Green’s Exploration UNB 175', // Bulbapedia: "Green's Exploration"
      '2 Metal Core Barrier UNB 180',
    ],
    persian: [
      '3 Goldeen UNB 48',
      '2 Seaking UNB 49',
      '1 Meowth UNB 147',
      '1 Red’s Challenge UNB 184', // Bulbapedia: "Red's Challenge"
      '2 Escape Board UPR 122',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { volcanion: 'Fire', stakataka: 'Fighting', melmetal: 'Metal', persian: 'Colorless' },
  trainers: [
    {
      name: 'Supporter cards',
      count: null,
      cards: [
        '0-2 Copycat CES 127',
        '0-2 Cynthia UPR 119',
        '0-2 Erika’s Hospitality TEU 140', // Bulbapedia: "Erika's Hospitality"
        '0-2 Hau CES 132',
        '0-2 Kahili LOT 179',
        '0-2 Lillie UPR 125',
        '0-2 Looker UPR 126',
      ],
    },
  ],
};
