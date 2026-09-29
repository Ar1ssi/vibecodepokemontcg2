// Burning Shadows Prerelease Kit — Bulbapedia "Burning Shadows Prerelease Kit (TCG)", revision 4377955 (read 2026-09-29).
export default {
  key: 'burning-shadows',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Burning_Shadows_Prerelease_Kit_(TCG)', revision: 4377955 },
  promos: {
    seviper: '1 Seviper SMP 46',
    crabominable: '1 Crabominable SMP 47',
    zygarde: '1 Zygarde SMP 48',
    bewear: '1 Bewear SMP 49',
  },
  groups: {
    seviper: [
      '2 Croagunk BUS 54',
      '2 Toxicroak BUS 55',
      '2 Espurr BUS 59',
      '2 Meowstic BUS 60',
    ],
    crabominable: [
      '2 Rhyhorn BUS 65',
      '2 Rhydon BUS 66',
      '2 Rhyperior BUS 67',
      '1 Crabrawler BUS 73',
      '1 Escape Rope BUS 114',
    ],
    zygarde: [
      '2 Alolan Rattata BUS 81',
      '2 Alolan Raticate BUS 82',
      '2 Hoothoot BUS 106',
      '1 Noctowl BUS 107',
      '1 Weakness Policy BUS 126',
    ],
    bewear: [
      '2 Oddish BUS 4',
      '2 Gloom BUS 5',
      '2 Vileplume BUS 6',
      '1 Stufful BUS 110',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { seviper: 'Psychic', crabominable: 'Fighting', zygarde: 'Dragon', bewear: 'Colorless' },
  trainers: [
    {
      name: 'Supporter cards',
      // Page: "4 in any combination of the Supporter cards and 2-3 in any combination of Item cards".
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
