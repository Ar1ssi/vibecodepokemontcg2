// Sun & Moon Prerelease Kit — Bulbapedia "Sun & Moon Prerelease Kit (TCG)", revision 4377568 (read 2026-09-29).
export default {
  key: 'sun-moon',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Sun_%26_Moon_Prerelease_Kit_(TCG)', revision: 4377568 },
  promos: {
    shiinotic: '1 Shiinotic SMP 10',
    bruxish: '1 Bruxish SMP 11',
    passimian: '1 Passimian SMP 12',
    oranguru: '1 Oranguru SMP 13',
  },
  groups: {
    shiinotic: [
      '3 Caterpie SUM 1',
      '2 Metapod SUM 2',
      '2 Butterfree SUM 3',
      '1 Morelull SUM 16',
    ],
    bruxish: [
      '2 Shellder SUM 33',
      '2 Cloyster SUM 34',
      '2 Chinchou SUM 49',
      '2 Lanturn SUM 50',
    ],
    passimian: [
      '3 Makuhita SUM 67',
      '2 Hariyama SUM 68',
      '2 Passimian SUM 73',
      '1 Great Ball SUM 119',
    ],
    oranguru: [
      '3 Zubat SUM 54',
      '2 Golbat SUM 55',
      '2 Crobat SUM 56',
      '1 Great Ball SUM 119',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { shiinotic: 'Grass', bruxish: 'Water', passimian: 'Fighting', oranguru: 'Colorless' },
  trainers: [
    {
      name: 'Supporter cards',
      // Page: "4 in any combination of the Supporter cards and 2 in any combination of Item cards".
      count: 4,
      cards: [
        '0-2 Hau SUM 120',
        '0-2 Ilima SUM 121',
        '0-2 Lillie SUM 122',
        '0-2 Professor Kukui SUM 128',
      ],
    },
    {
      name: 'Item cards',
      // The Passimian and Oranguru groups' Great Ball comes on top of these two.
      count: 2,
      cards: [
        '0-2 Nest Ball SUM 123',
        '0-2 Timer Ball SUM 134',
      ],
    },
  ],
};
