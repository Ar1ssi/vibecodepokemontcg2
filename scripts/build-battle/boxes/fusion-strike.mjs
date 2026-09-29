// Fusion Strike Build & Battle Box — Bulbapedia "Fusion Strike Build & Battle Box (TCG)", revision 4390133 (read 2026-09-29).
// The page says six Supporters; the Deoxys group (9 cards) leaves five places in the 23-card
// Evolution pack, so a box with it has five (design 054 A4).
export default {
  key: 'fusion-strike',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Fusion_Strike_Build_%26_Battle_Box_(TCG)', revision: 4390133 },
  promos: {
    oricorio: '1 Oricorio SWSHP 168',
    pyukumuku: '1 Pyukumuku SWSHP 169',
    deoxys: '1 Deoxys SWSHP 170',
    latias: '1 Latias SWSHP 171',
  },
  groups: {
    oricorio: [
      '3 Dreepy FST 128',
      '2 Drakloak FST 129',
      '2 Dragapult FST 130',
      '1 Fog Crystal CRE 140',
    ],
    pyukumuku: [
      '3 Shelmet FST 13',
      '3 Accelgor FST 14',
      '1 Level Ball BST 129',
      '1 Fusion Strike Energy FST 244',
    ],
    deoxys: [
      '3 Meloetta FST 124',
      '1 Smeargle FST 209',
      '1 Chili & Cilan & Cress FST 227',
      "1 Elesa's Sparkle FST 233",
      '3 Fusion Strike Energy FST 244',
    ],
    latias: [
      '3 Latios FST 194',
      '2 Latias FST 193',
      '1 Quick Ball FST 237',
      '1 Training Court RCL 169',
      '1 Fusion Strike Energy FST 244',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { oricorio: 'Fire', pyukumuku: 'Water', deoxys: 'Psychic', latias: 'Dragon' },
  trainers: [
    {
      name: 'Supporter cards',
      count: null,
      cards: [
        "0-2 Professor's Research (Professor Magnolia) SSH 178", // Bulbapedia: "Professor's Research"
        '0-2 Sonia RCL 167',
        '0-2 Bruno BST 121',
        "0-2 Korrina's Focus BST 128",
        '0-2 Copycat EVS 143',
        '0-2 Shauna FST 240',
      ],
    },
  ],
};
