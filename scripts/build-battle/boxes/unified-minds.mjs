// Unified Minds Build & Battle Box — Bulbapedia "Unified Minds Build & Battle Box (TCG)", revision 4380723 (read 2026-09-29).
// The page says four Supporters; its groups (8 cards) leave six places in the 23-card Evolution
// pack, so six come (design 054 A4).
export default {
  key: 'unified-minds',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Unified_Minds_Build_%26_Battle_Box_(TCG)', revision: 4380723 },
  promos: {
    amoonguss: '1 Amoonguss SMP 202',
    'tapu-fini': '1 Tapu Fini SMP 203',
    necrozma: '1 Necrozma SMP 204',
    terrakion: '1 Terrakion SMP 205',
  },
  groups: {
    amoonguss: [
      '1 Shroomish UNM 5',
      '1 Breloom UNM 108',
      '3 Foongus UNM 13',
      '2 Amoonguss UNM 14',
      '1 Pokémon Communication TEU 152',
    ],
    'tapu-fini': [
      '1 Audino UNM 177',
      '3 Snorunt UNM 37',
      '2 Froslass UNM 38',
      '1 U-Turn Board UNM 211',
      '1 Pokémon Communication TEU 152',
    ],
    necrozma: [
      '1 Necrozma UNM 101',
      '3 Cubone UNM 105',
      '2 Alolan Marowak UNM 75',
      '1 Recycle Energy UNM 212',
      '1 Chip-Chip Ice Axe UNB 165',
    ],
    terrakion: [
      '1 Tauros UNM 164',
      '3 Meditite UNM 109',
      '2 Medicham UNM 110',
      '2 Karate Belt UNM 201',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { amoonguss: 'Grass', 'tapu-fini': 'Water', necrozma: 'Psychic', terrakion: 'Fighting' },
  trainers: [
    {
      name: 'Supporter cards',
      count: null,
      cards: [
        '0-2 Professor Elm’s Lecture LOT 188', // Bulbapedia: "Professor Elm's Lecture"
        '0-2 Lillie UPR 125',
        '0-2 Cynthia UPR 119',
        '0-2 Looker UPR 126',
        '0-2 Hau CES 132',
        '0-2 Hiker CES 133',
        '0-2 Kahili LOT 179',
        '0-2 Green’s Exploration UNB 175', // Bulbapedia: "Green's Exploration"
        '0-2 Blue’s Tactics UNM 188', // Bulbapedia: "Blue's Tactics"
        '0-2 Bug Catcher UNM 189',
      ],
    },
  ],
};
