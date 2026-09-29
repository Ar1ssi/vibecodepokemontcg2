// Brilliant Stars Build & Battle Box — Bulbapedia "Brilliant Stars Build & Battle Box (TCG)", revision 4390134 (read 2026-09-29).
// The page says six Supporters; the Liepard and Bibarel groups (9 cards) leave four or five places
// in the 23-card Evolution pack, so a box with them has fewer (design 054 A4). Liepard's group attacks
// cost only Colorless (TCGdex swshp-SWSH187, swsh9-090, swsh9-091, swsh9-009, swsh9-011): its Energy
// is its header's Darkness (A3).
export default {
  key: 'brilliant-stars',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Brilliant_Stars_Build_%26_Battle_Box_(TCG)', revision: 4390134 },
  promos: {
    moltres: '1 Moltres SWSHP 185',
    lucario: '1 Lucario SWSHP 186',
    liepard: '1 Liepard SWSHP 187',
    bibarel: '1 Bibarel SWSHP 188',
  },
  groups: {
    moltres: [
      '2 Chimchar BRS 24',
      '2 Monferno BRS 25',
      '2 Infernape BRS 26',
      '1 Moltres BRS 21',
      '1 Magma Basin BRS 144',
    ],
    lucario: [
      '3 Riolu BRS 78',
      '2 Lucario BRS 79',
      '1 Castform BRS 116',
      '1 Energy Recycler BST 124',
      '1 Ultra Ball BRS 150',
    ],
    liepard: [
      '2 Purrloin BRS 90',
      '1 Liepard BRS 91',
      '3 Burmy BRS 9',
      '2 Mothim BRS 11',
      '1 Friends in Galar BRS 140',
    ],
    bibarel: [
      '1 Bidoof BRS 120',
      '1 Bibarel BRS 121',
      '2 Turtwig BRS 6',
      '2 Grotle BRS 7',
      '2 Torterra BRS 8',
      '1 Gloria BRS 141',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { moltres: 'Fire', lucario: 'Fighting', liepard: 'Darkness', bibarel: 'Colorless' },
  trainers: [
    {
      name: 'Supporter cards',
      count: null,
      cards: [
        '0-2 Bruno BST 121',
        "0-2 Korrina's Focus BST 128",
        '0-2 Copycat EVS 143',
        '0-2 Barry BRS 130',
        "0-2 Cynthia's Ambition BRS 138",
        "0-2 Professor's Research BRS 147",
      ],
    },
  ],
};
