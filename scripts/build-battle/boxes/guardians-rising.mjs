// Guardians Rising Prerelease Kit — Bulbapedia "Guardians Rising Prerelease Kit (TCG)", revision 4377956 (read 2026-09-29).
// The Mudsdale group has one card more, so it takes one Item fewer: the Items fill the 23-card pack.
// Not simulated (design 054 A5): the optional Oricorio [Pa'u Style] (GRI 55) that replaces an Item.
export default {
  key: 'guardians-rising',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Guardians_Rising_Prerelease_Kit_(TCG)', revision: 4377956 },
  promos: {
    'alolan-sandslash': '1 Alolan Sandslash SMP 18',
    oricorio: '1 Oricorio SMP 19',
    mudsdale: '1 Mudsdale SMP 20',
    drampa: '1 Drampa SMP 21',
  },
  groups: {
    'alolan-sandslash': [
      '1 Alolan Sandshrew GRI 19',
      '2 Vanillite GRI 33',
      '2 Vanillish GRI 34',
      '2 Vanilluxe GRI 35',
    ],
    oricorio: [
      '2 Petilil GRI 4',
      '2 Lilligant GRI 5',
      '2 Phantump GRI 6',
      '1 Trevenant GRI 7',
    ],
    mudsdale: [
      '2 Gligar GRI 67',
      '2 Gliscor GRI 68',
      '2 Mudbray GRI 75',
      '1 Mudsdale GRI 76',
      '1 Choice Band GRI 121',
    ],
    drampa: [
      '2 Pancham GRI 72',
      '2 Murkrow GRI 78',
      '2 Honchkrow GRI 79',
      '1 Pangoro GRI 82',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { 'alolan-sandslash': 'Water', oricorio: 'Psychic', mudsdale: 'Fighting', drampa: 'Dragon' },
  trainers: [
    {
      name: 'Supporter cards',
      // Page: "4 in any combination of the Supporter cards and up to 4 in any combination of Item cards".
      count: 4,
      cards: [
        '0-2 Hau SUM 120',
        '0-2 Lillie SUM 122',
        '0-2 Professor Kukui SUM 128',
      ],
    },
    {
      name: 'Item cards',
      count: null,
      cards: [
        '0-1 Great Ball SUM 119',
        '0-2 Nest Ball SUM 123',
        '0-2 Timer Ball SUM 134',
      ],
    },
  ],
};
