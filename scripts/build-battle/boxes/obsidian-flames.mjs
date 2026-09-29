// Obsidian Flames Build & Battle Box — Bulbapedia "Obsidian Flames Build & Battle Box (TCG)", revision 4044849 (read 2026-09-28).
export default {
  key: 'obsidian-flames',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Obsidian_Flames_Build_%26_Battle_Box_(TCG)', revision: 4044849 },
  promos: {
    palafin: '1 Palafin SVP 36',
    cleffa: '1 Cleffa SVP 37',
    togekiss: '1 Togekiss SVP 38',
    mawile: '1 Mawile SVP 39',
  },
  groups: {
    palafin: [
      '3 Finizen OBF 60',
      '3 Palafin OBF 62',
      '1 Bonsly OBF 110',
      '1 Clavell PAL 177',
      '1 Great Ball PAL 183',
      '1 Switch SVI 194',
    ],
    cleffa: [
      '4 Numel OBF 31',
      '3 Camerupt OBF 32',
      '1 Nemona SVI 180',
      '1 Ryme OBF 194',
      '1 Nest Ball SVI 181',
    ],
    togekiss: [
      '3 Togepi OBF 83',
      '2 Togetic OBF 84',
      '2 Togekiss OBF 85',
      '1 Jacq SVI 175',
      '1 Rare Candy SVI 191',
      '1 Ultra Ball SVI 196',
      '1 Artazon PAL 171',
    ],
    mawile: [
      '3 Toxel OBF 71',
      '2 Toxtricity OBF 72',
      '1 Solrock OBF 93',
      '1 Audino OBF 173',
      '1 Nest Ball SVI 181',
      '1 Miriam SVI 179',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { palafin: 'Water', cleffa: 'Psychic', togekiss: 'Psychic', mawile: 'Metal' },
  trainers: [
    {
      name: 'Trainer cards',
      count: null,
      cards: [
        "0-2 Professor's Research SVI 189",
        "0-2 Professor's Research SVI 190",
        '0-2 Youngster SVI 198',
      ],
    },
  ],
};
