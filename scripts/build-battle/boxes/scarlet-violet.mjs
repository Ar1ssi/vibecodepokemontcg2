// Scarlet & Violet Build & Battle Box — Bulbapedia "Scarlet & Violet Build & Battle Box (TCG)", revision 4423065 (read 2026-09-28).
export default {
  key: 'scarlet-violet',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Scarlet_%26_Violet_Build_%26_Battle_Box_(TCG)', revision: 4423065 },
  promos: {
    quaquaval: '1 Quaquaval SVP 5',
    pawmot: '1 Pawmot SVP 6',
    hawlucha: '1 Hawlucha SVP 7',
    revavroom: '1 Revavroom SVP 8',
  },
  groups: {
    quaquaval: [
      '1 Bruxish SVI 51',
      '3 Quaxly SVI 52',
      '2 Quaxwell SVI 53',
      '1 Quaquaval SVI 54',
    ],
    pawmot: [
      '3 Pawmi SVI 74',
      '3 Pawmo SVI 75',
      '2 Pawmot SVI 76',
      '1 Rare Candy SVI 191',
    ],
    hawlucha: [
      '3 Scatterbug SVI 8',
      '2 Spewpa SVI 9',
      '1 Vivillon SVI 10',
      '1 Hawlucha SVI 118',
    ],
    revavroom: [
      '2 Dondozo SVI 61',
      '3 Tatsugiri SVI 62',
      '1 Varoom SVI 140',
      '1 Revavroom SVI 142',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { quaquaval: 'Water', pawmot: 'Lightning', hawlucha: 'Fighting', revavroom: 'Metal' },
  trainers: [
    {
      name: 'Trainer cards',
      count: null,
      cards: [
        '0-2 Jacq SVI 175',
        '0-2 Mesagoza SVI 178',
        '0-2 Nemona SVI 180',
        '0-2 Nest Ball SVI 181',
        '0-2 Poké Ball SVI 185',
        "0-2 Professor's Research SVI 189",
        "0-2 Professor's Research SVI 190",
        '0-2 Switch SVI 194',
        '0-2 Ultra Ball SVI 196',
        '0-2 Youngster SVI 198',
      ],
    },
  ],
};
