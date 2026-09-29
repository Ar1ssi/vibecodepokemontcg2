// Lost Thunder Build & Battle Box — Bulbapedia "Lost Thunder Build & Battle Box (TCG)", revision 4379658 (read 2026-09-29).
export default {
  key: 'lost-thunder',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Lost_Thunder_Build_%26_Battle_Box_(TCG)', revision: 4379658 },
  promos: {
    suicune: '1 Suicune SMP 149',
    raikou: '1 Raikou SMP 150',
    giratina: '1 Giratina SMP 151',
    'tapu-lele': '1 Tapu Lele SMP 152',
  },
  groups: {
    suicune: [
      '2 Popplio LOT 64',
      '1 Popplio LOT 65',
      '2 Brionne LOT 66',
      '2 Primarina LOT 67',
      '1 Kahili LOT 179',
      '1 Timer Ball SUM 134',
    ],
    raikou: [
      '3 Mareep LOT 76',
      '2 Flaaffy LOT 77',
      '2 Ampharos LOT 78',
      '1 Professor Elm’s Lecture LOT 188', // Bulbapedia: "Professor Elm's Lecture"
      '1 Timer Ball SUM 134',
    ],
    giratina: [
      '2 Natu LOT 87',
      '2 Xatu LOT 88',
      '1 Poipole LOT 107',
      '1 Naganadel LOT 108',
      '1 Mixed Herbs LOT 184',
      '1 Sightseer LOT 189',
      '1 Nest Ball SUM 123',
    ],
    'tapu-lele': [
      '3 Jigglypuff LOT 133',
      '2 Wigglytuff LOT 134',
      '1 Fairy Charm Grass LOT 174', // Bulbapedia: "Fairy Charm G"
      '1 Fairy Charm Psychic LOT 175', // Bulbapedia: "Fairy Charm P"
      '1 Mina LOT 183',
      '1 Nest Ball SUM 123',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { suicune: 'Water', raikou: 'Lightning', giratina: 'Psychic', 'tapu-lele': 'Fairy' },
  trainers: [
    {
      name: 'Supporter cards',
      count: null,
      cards: [
        '0-2 Copycat CES 127',
        '0-2 Hau CES 132',
        '0-2 Lillie UPR 125',
        '0-2 Looker UPR 126',
        '0-2 Professor Kukui SUM 128',
        '0-2 Tate & Liza CES 148',
        '0-2 TV Reporter CES 149',
        '0-2 Underground Expedition CES 150',
      ],
    },
  ],
};
