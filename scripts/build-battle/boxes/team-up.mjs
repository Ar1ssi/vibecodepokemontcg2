// Team Up Build & Battle Box — Bulbapedia "Team Up Build & Battle Box (TCG)", revision 4380445 (read 2026-09-29).
export default {
  key: 'team-up',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Team_Up_Build_%26_Battle_Box_(TCG)', revision: 4380445 },
  promos: {
    charizard: '1 Charizard SMP 158',
    zapdos: '1 Zapdos SMP 159',
    nidoqueen: '1 Nidoqueen SMP 160',
    jirachi: '1 Jirachi SMP 161',
  },
  groups: {
    charizard: [
      '1 Charmander TEU 12',
      '1 Charmeleon TEU 13',
      '3 Ponyta TEU 17',
      '2 Rapidash TEU 18',
      '1 Erika’s Hospitality TEU 140', // Bulbapedia: "Erika's Hospitality"
      '1 Pokémon Communication TEU 152',
    ],
    zapdos: [
      '3 Blitzle TEU 44',
      '2 Zebstrika TEU 45',
      '1 Emolga TEU 46',
      '1 Farfetch’d TEU 127', // Bulbapedia: "Farfetch'd"
      '1 Switch CES 147',
      '1 Tate & Liza CES 148',
      '1 Pokémon Communication TEU 152',
    ],
    nidoqueen: [
      '1 Nidoran♀ TEU 54',
      '1 Nidorina TEU 55',
      '3 Grimer TEU 62',
      '2 Muk TEU 63',
      '1 Ingo & Emmet TEU 144',
      '1 Pokémon Communication TEU 152',
    ],
    jirachi: [
      '3 Pawniard TEU 104',
      '2 Bisharp TEU 105',
      '1 Farfetch’d TEU 127', // Bulbapedia: "Farfetch'd"
      '1 Escape Board UPR 122',
      '1 Jasmine TEU 145',
      '1 Pokémon Communication TEU 152',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { charizard: 'Fire', zapdos: 'Lightning', nidoqueen: 'Psychic', jirachi: 'Metal' },
  trainers: [
    {
      name: 'Supporter cards',
      count: null,
      cards: [
        '0-2 Copycat CES 127',
        '0-2 Cynthia UPR 119',
        '0-2 Hau CES 132',
        '0-2 Kahili LOT 179',
        '0-2 Lillie UPR 125',
        '0-2 Looker UPR 126',
        '0-2 Professor Kukui SUM 128',
      ],
    },
  ],
};
