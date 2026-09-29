// Sword & Shield Build & Battle Box — Bulbapedia "Sword & Shield Build & Battle Box (TCG)", revision 4380725 (read 2026-09-29).
export default {
  key: 'sword-shield',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Sword_%26_Shield_Build_%26_Battle_Box_(TCG)', revision: 4380725 },
  promos: {
    rillaboom: '1 Rillaboom SWSHP 6',
    frosmoth: '1 Frosmoth SWSHP 7',
    'galarian-perrserker': '1 Galarian Perrserker SWSHP 8',
    cinccino: '1 Cinccino SWSHP 9',
  },
  groups: {
    rillaboom: [
      '3 Grookey SSH 11',
      '2 Thwackey SSH 13',
      '1 Rillaboom SSH 14',
      '1 Snorlax SSH 140',
      '1 Evolution Incense SSH 163',
      '1 Lucky Egg SSH 167',
    ],
    frosmoth: [
      '2 Sobble SSH 55',
      '2 Drizzile SSH 57',
      '2 Inteleon SSH 58',
      '1 Snom SSH 63',
      '1 Evolution Incense SSH 163',
      '1 Great Ball SSH 164',
    ],
    'galarian-perrserker': [
      '1 Galarian Meowth SSH 127',
      '3 Pawniard SSH 133',
      '3 Bisharp SSH 134',
      '1 Quick Ball SSH 179',
      '1 Rotom Bike SSH 181',
    ],
    cinccino: [
      '1 Minccino SSH 145',
      '3 Galarian Zigzagoon SSH 117',
      '2 Galarian Linoone SSH 118',
      '2 Galarian Obstagoon SSH 119',
      '1 Quick Ball SSH 179',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { rillaboom: 'Grass', frosmoth: 'Water', 'galarian-perrserker': 'Metal', cinccino: 'Colorless' },
  trainers: [
    {
      name: 'Supporter cards',
      count: null,
      cards: [
        '0-2 Hop SSH 165',
        '0-2 Marnie SSH 169',
        '0-2 Poké Kid SSH 173',
        "0-2 Professor's Research (Professor Magnolia) SSH 178", // Bulbapedia: "Professor's Research"
      ],
    },
  ],
};
