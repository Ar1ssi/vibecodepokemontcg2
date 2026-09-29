// Ultra Prism Prerelease Kit — Bulbapedia "Ultra Prism Prerelease Kit (TCG)", revision 4377958 (read 2026-09-29).
export default {
  key: 'ultra-prism',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Ultra_Prism_Prerelease_Kit_(TCG)', revision: 4377958 },
  promos: {
    'wash-rotom': '1 Wash Rotom SMP 94',
    lucario: '1 Lucario SMP 95',
    heatran: '1 Heatran SMP 96',
    gumshoos: '1 Gumshoos SMP 97',
  },
  groups: {
    'wash-rotom': [
      '2 Piplup UPR 31',
      '1 Piplup UPR 32',
      '2 Prinplup UPR 33',
      '2 Empoleon UPR 34',
      '1 Shaymin UPR 111',
      '1 Pokémon Fan Club UPR 133',
      '1 Timer Ball SUM 134',
    ],
    lucario: [
      '1 Spiritomb UPR 53',
      '1 Riolu UPR 66',
      '2 Gible UPR 96',
      '2 Gabite UPR 98',
      '2 Garchomp UPR 99',
      '1 Cynthia UPR 119',
      '1 Nest Ball SUM 123',
    ],
    heatran: [
      '1 Magnemite UPR 80',
      '1 Magnemite UPR 81',
      '2 Magneton UPR 82',
      '2 Magnezone UPR 83',
      '1 Heatran UPR 88',
      '1 Looker UPR 126',
      '1 Great Ball SUM 119',
      '1 Timer Ball SUM 134',
    ],
    gumshoos: [
      '2 Electabuzz UPR 43',
      '2 Electivire UPR 44',
      '2 Yungoos UPR 112',
      '1 Gumshoos UPR 113',
      '1 Volkner UPR 135',
      '1 Great Ball SUM 119',
      '1 Nest Ball SUM 123',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { 'wash-rotom': 'Water', lucario: 'Fighting', heatran: 'Metal', gumshoos: 'Colorless' },
  trainers: [
    {
      name: 'Supporter cards',
      count: null,
      cards: [
        '0-2 Hau SUM 120',
        '0-2 Lillie UPR 125',
        '0-2 Professor Kukui SUM 128',
        '0-2 Sophocles BUS 123',
      ],
    },
  ],
};
