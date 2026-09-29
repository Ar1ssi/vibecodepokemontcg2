// Silver Tempest Build & Battle Box — Bulbapedia "Silver Tempest Build & Battle Box (TCG)", revision 4390132 (read 2026-09-29).
// The page says six Trainers; its groups leave none to seven places in the 23-card Evolution pack,
// and the Archeops group (15 cards) makes 24–25 with any other: the deck keeps 40 with fewer Basic
// Energy (design 054 A4). Sunflora's group attacks cost only Colorless (TCGdex swshp-SWSH269,
// swsh12-005, swsh12-006): its Energy is its header's Grass (A3).
export default {
  key: 'silver-tempest',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Silver_Tempest_Build_%26_Battle_Box_(TCG)', revision: 4390132 },
  promos: {
    sunflora: '1 Sunflora SWSHP 269',
    rapidash: '1 Rapidash SWSHP 270',
    kirlia: '1 Kirlia SWSHP 271',
    archeops: '1 Archeops SWSHP 272',
  },
  groups: {
    sunflora: [
      '3 Sunkern SIT 5',
      '2 Sunflora SIT 6',
      '1 Wallace SIT 166',
      '1 Gloria BRS 141',
      '1 Escape Rope BST 125',
    ],
    rapidash: [
      '2 Ponyta SIT 21',
      '1 Rapidash SIT 22',
      '2 Vulpix SIT 17',
      '2 Ninetales SIT 18',
      '1 Magma Basin BRS 144',
    ],
    // The page's "Gardevoir group": the Kirlia promo's line.
    kirlia: [
      '3 Ralts SIT 67',
      '2 Kirlia SIT 68',
      '2 Gardevoir SIT 69',
      '1 Capturing Aroma SIT 153',
      '1 Fog Crystal CRE 140',
    ],
    archeops: [
      '2 Archen SIT 146',
      '2 Archeops SIT 147',
      '2 Rotom SIT 53',
      '2 Zeraora SIT 56',
      '1 Furisode Girl SIT 157',
      '2 Unidentified Fossil SIT 165',
      '2 Lucky Energy CRE 158',
      '2 Treasure Energy EVS 165',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { sunflora: 'Grass', rapidash: 'Fire', kirlia: 'Psychic', archeops: 'Colorless' },
  trainers: [
    {
      name: 'Trainer cards',
      count: null,
      cards: [
        "0-2 Cynthia's Ambition BRS 138",
        '0-2 Gloria BRS 141',
        "0-2 Professor's Research BRS 147",
        '0-2 Ultra Ball BRS 150',
        '0-2 Zisu ASR 159',
        '0-2 Arezu LOR 153',
        '0-2 Bug Catcher FST 226',
        '0-2 Klara CRE 145',
        '0-2 Raihan EVS 152',
      ],
    },
  ],
};
