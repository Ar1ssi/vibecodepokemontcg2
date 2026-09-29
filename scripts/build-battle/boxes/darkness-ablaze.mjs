// Darkness Ablaze Build & Battle Box — Bulbapedia "Darkness Ablaze Build & Battle Box (TCG)", revision 4389115 (read 2026-09-29).
export default {
  key: 'darkness-ablaze',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Darkness_Ablaze_Build_%26_Battle_Box_(TCG)', revision: 4389115 },
  promos: {
    decidueye: '1 Decidueye SWSHP 35',
    arctozolt: '1 Arctozolt SWSHP 36',
    hydreigon: '1 Hydreigon SWSHP 37',
    kangaskhan: '1 Kangaskhan SWSHP 38',
  },
  groups: {
    decidueye: [
      '1 Rowlet DAA 11',
      '1 Dartrix DAA 12',
      '3 Ducklett DAA 148',
      '2 Swanna DAA 149',
      '1 Quick Ball SSH 179',
      '1 Bird Keeper DAA 159',
    ],
    arctozolt: [
      '2 Dracozolt DAA 65',
      '2 Tapu Koko DAA 61',
      '3 Rare Fossil DAA 167',
      '1 Evolution Incense SSH 163',
      '1 Kabu DAA 163',
    ],
    hydreigon: [
      '3 Deino DAA 108',
      '2 Zweilous DAA 109',
      '2 Hydreigon DAA 110',
      '1 Darkrai DAA 105',
      '1 Piers DAA 165',
    ],
    kangaskhan: [
      '1 Kangaskhan DAA 133',
      '3 Vanillite DAA 45',
      '2 Vanillish DAA 46',
      '2 Vanilluxe DAA 47',
      "1 Pokémon Breeder's Nurturing DAA 166",
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { decidueye: 'Grass', arctozolt: 'Lightning', hydreigon: 'Darkness', kangaskhan: 'Colorless' },
  trainers: [
    {
      name: 'Supporter cards',
      count: null,
      cards: [
        '0-2 Hop SSH 165',
        "0-2 Professor's Research (Professor Magnolia) SSH 178", // Bulbapedia: "Professor's Research"
        '0-2 Dan RCL 158',
        '0-2 Milo RCL 161',
        '0-2 Sonia RCL 167',
      ],
    },
  ],
};
