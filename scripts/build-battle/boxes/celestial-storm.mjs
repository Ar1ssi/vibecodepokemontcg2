// Celestial Storm Build & Battle Box — Bulbapedia "Celestial Storm Build & Battle Box (TCG)", revision 4379300 (read 2026-09-29).
export default {
  key: 'celestial-storm',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Celestial_Storm_Build_%26_Battle_Box_(TCG)', revision: 4379300 },
  promos: {
    kyogre: '1 Kyogre SMP 129',
    manectric: '1 Manectric SMP 130',
    celesteela: '1 Celesteela SMP 131',
    delcatty: '1 Delcatty SMP 132',
  },
  groups: {
    kyogre: [
      '1 Mudkip CES 32',
      '2 Mudkip CES 33',
      '2 Marshtomp CES 34',
      '2 Swampert CES 35',
      '1 The Masked Royal CES 139',
      '1 Timer Ball SUM 134',
    ],
    manectric: [
      '2 Chinchou CES 49',
      '2 Lanturn CES 50',
      '2 Electrike CES 51',
      '1 Manectric CES 52',
      '1 Great Ball SUM 119',
      '1 Nest Ball SUM 123',
    ],
    celesteela: [
      '3 Beldum CES 92',
      '2 Metang CES 94',
      '2 Metagross CES 95',
      '1 Switch CES 147',
      '1 Tate & Liza CES 148',
      '1 Timer Ball SUM 134',
    ],
    delcatty: [
      '2 Gulpin CES 57',
      '2 Swalot CES 58',
      '2 Skitty CES 120',
      '1 Delcatty CES 121',
      '1 Apricorn Maker CES 124',
      '1 Great Ball SUM 119',
      '1 Nest Ball SUM 123',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { kyogre: 'Water', manectric: 'Lightning', celesteela: 'Metal', delcatty: 'Colorless' },
  trainers: [
    {
      name: 'Supporter cards',
      count: null,
      cards: [
        '0-2 Bill’s Maintenance CES 126', // Bulbapedia: "Bill's Maintenance"
        '0-2 Copycat CES 127',
        '0-2 Hau CES 132',
        '0-2 TV Reporter CES 149',
        '0-2 Underground Expedition CES 150',
      ],
    },
  ],
};
