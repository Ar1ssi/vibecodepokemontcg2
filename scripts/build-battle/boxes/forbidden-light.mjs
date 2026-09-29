// Forbidden Light Build & Battle Box — Bulbapedia "Forbidden Light Build & Battle Box (TCG)", revision 4379025 (read 2026-09-29).
export default {
  key: 'forbidden-light',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Forbidden_Light_Build_%26_Battle_Box_(TCG)', revision: 4379025 },
  promos: {
    pheromosa: '1 Pheromosa SMP 115',
    xurkitree: '1 Xurkitree SMP 116',
    malamar: '1 Malamar SMP 117',
    lycanroc: '1 Lycanroc SMP 118',
  },
  groups: {
    pheromosa: [
      '3 Scatterbug FLI 5',
      '2 Spewpa FLI 7',
      '2 Vivillon FLI 8',
      '1 Furfrou FLI 99',
      '1 Nest Ball SUM 123',
    ],
    xurkitree: [
      '2 Magnemite FLI 34',
      '2 Magneton FLI 35',
      '2 Magnezone FLI 36',
      '1 Furfrou FLI 99',
      '1 Great Ball SUM 119',
      '1 Timer Ball SUM 134',
    ],
    malamar: [
      '2 Uxie FLI 41',
      '2 Mesprit FLI 42',
      '2 Inkay FLI 50',
      '1 Malamar FLI 51',
      '1 Mysterious Treasure FLI 113',
      '1 Nest Ball SUM 123',
    ],
    lycanroc: [
      '2 Croagunk FLI 63',
      '2 Toxicroak FLI 64',
      '2 Rockruff FLI 75',
      '1 Lycanroc FLI 76',
      '0-1 Judge FLI 108',
      '1 Timer Ball SUM 134',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { pheromosa: 'Grass', xurkitree: 'Lightning', malamar: 'Psychic', lycanroc: 'Fighting' },
  trainers: [
    {
      name: 'Supporter cards',
      count: null,
      cards: [
        '0-2 Hau SUM 120',
        '0-2 Lillie UPR 125',
        '0-2 Looker UPR 126',
        '0-2 Professor Kukui SUM 128',
        '0-2 Sophocles BUS 123',
      ],
    },
  ],
};
