// Crimson Invasion Prerelease Kit — Bulbapedia "Crimson Invasion Prerelease Kit (TCG)", revision 4377957 (read 2026-09-29).
export default {
  key: 'crimson-invasion',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Crimson_Invasion_Prerelease_Kit_(TCG)', revision: 4377957 },
  promos: {
    'alolan-raichu': '1 Alolan Raichu SMP 72',
    salazzle: '1 Salazzle SMP 73',
    regirock: '1 Regirock SMP 74',
    registeel: '1 Registeel SMP 75',
  },
  groups: {
    'alolan-raichu': [
      '2 Cacnea CIN 5',
      '2 Cacturne CIN 6',
      '2 Pikachu CIN 30',
      '1 Alolan Raichu CIN 31',
    ],
    salazzle: [
      '2 Gastly CIN 36',
      '2 Haunter CIN 37',
      '2 Gengar CIN 38',
      '1 Salandit CIN 46',
    ],
    regirock: [
      '2 Shellos CIN 29',
      '1 Regirock CIN 53',
      '2 Gastrodon CIN 54',
      '1 Stufful CIN 55',
      '1 Bewear CIN 56',
    ],
    registeel: [
      '3 Karrablast CIN 7',
      '1 Mawile CIN 64',
      '1 Registeel CIN 68',
      '2 Escavalier CIN 69',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { 'alolan-raichu': 'Lightning', salazzle: 'Psychic', regirock: 'Fighting', registeel: 'Metal' },
  trainers: [
    {
      name: 'Supporter cards',
      // Page: "4 in any combination of the Supporter cards ... and 4 Item cards".
      count: 4,
      cards: [
        '0-2 Hau SUM 120',
        '0-2 Lillie SUM 122',
        '0-2 Professor Kukui SUM 128',
        '0-2 Sophocles BUS 123',
      ],
    },
    {
      name: 'Item cards',
      // Page: "one of each Item card plus one additional copy of either Nest Ball or Timer Ball".
      count: 4,
      cards: [
        '1 Great Ball SUM 119',
        '1-2 Nest Ball SUM 123',
        '1-2 Timer Ball SUM 134',
      ],
    },
  ],
};
