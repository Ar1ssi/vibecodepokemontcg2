// Cosmic Eclipse Build & Battle Box — Bulbapedia "Cosmic Eclipse Build & Battle Box (TCG)", revision 4386439 (read 2026-09-29).
export default {
  key: 'cosmic-eclipse',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Cosmic_Eclipse_Build_%26_Battle_Box_(TCG)', revision: 4386439 },
  promos: {
    buzzwole: '1 Buzzwole SMP 218',
    entei: '1 Entei SMP 219',
    phione: '1 Phione SMP 220',
    blacephalon: '1 Blacephalon SMP 221',
  },
  groups: {
    buzzwole: [
      '2 Kricketot CEC 13',
      '2 Kricketune CEC 14',
      '2 Deerling CEC 15',
      '2 Sawsbuck CEC 16',
      '1 Professor Oak’s Setup CEC 201', // Bulbapedia: "Professor Oak's Setup"
    ],
    entei: [
      '3 Tepig CEC 31',
      '2 Pignite CEC 32',
      '2 Emboar CEC 33',
      '1 Roller Skater CEC 203',
      '1 Pokémon Communication TEU 152',
    ],
    phione: [
      '3 Piplup CEC 54',
      '2 Prinplup CEC 55',
      '2 Empoleon CEC 56',
      '1 Draw Energy CEC 209',
      '1 Pokémon Communication TEU 152',
    ],
    blacephalon: [
      '3 Duskull CEC 83',
      '2 Dusclops CEC 84',
      '2 Dusknoir CEC 85',
      '1 Roxie CEC 205',
      '1 Pokémon Communication TEU 152',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { buzzwole: 'Grass', entei: 'Fire', phione: 'Water', blacephalon: 'Psychic' },
  trainers: [
    {
      name: 'Supporter cards',
      count: null,
      cards: [
        '0-2 Blue’s Tactics UNM 188', // Bulbapedia: "Blue's Tactics"
        '0-2 Cynthia UPR 119',
        '0-2 Erika’s Hospitality TEU 140', // Bulbapedia: "Erika's Hospitality"
        '0-2 Lillie UPR 125',
        '0-2 Red’s Challenge UNB 184', // Bulbapedia: "Red's Challenge"
        '0-2 Rosa CEC 204',
        '0-2 Tate & Liza CES 148',
      ],
    },
  ],
};
