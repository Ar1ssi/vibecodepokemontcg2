// Lost Origin Build & Battle Box — Bulbapedia "Lost Origin Build & Battle Box (TCG)", revision 4390131 (read 2026-09-29).
// The page says six Trainers; its groups (7–10 cards) leave four to seven places in the 23-card
// Evolution pack, so that many come (design 054 A4).
export default {
  key: 'lost-origin',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Lost_Origin_Build_%26_Battle_Box_(TCG)', revision: 4390131 },
  promos: {
    finneon: '1 Finneon SWSHP 240',
    gengar: '1 Gengar SWSHP 241',
    comfey: '1 Comfey SWSHP 242',
    machamp: '1 Machamp SWSHP 243',
  },
  groups: {
    finneon: [
      '3 Horsea LOR 35',
      '3 Seadra LOR 36',
      '2 Kingdra LOR 37',
      '1 Irida ASR 147',
      '1 Level Ball BST 129',
    ],
    gengar: [
      '1 Gengar LOR 66',
      '3 Hisuian Growlithe LOR 83',
      '2 Hisuian Arcanine LOR 84',
      '1 Grant ASR 144',
      '1 Iscan LOR 158',
    ],
    comfey: [
      '3 Wurmple LOR 6',
      '3 Cascoon LOR 9',
      '2 Dustox LOR 10',
    ],
    machamp: [
      '1 Machop LOR 86',
      '1 Machoke LOR 87',
      '3 Gligar LOR 95',
      '2 Gliscor LOR 96',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { finneon: 'Water', gengar: 'Psychic', comfey: 'Psychic', machamp: 'Fighting' },
  trainers: [
    {
      name: 'Trainer cards',
      count: null,
      cards: [
        "0-2 Cynthia's Ambition BRS 138",
        '0-2 Gloria BRS 141',
        "0-2 Professor's Research BRS 147",
        '0-2 Ultra Ball BRS 150',
        '0-2 Choy ASR 137',
        '0-2 Zisu ASR 159',
        '0-2 Arezu LOR 153',
      ],
    },
  ],
};
