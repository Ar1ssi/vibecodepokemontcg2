// Steam Siege Prerelease Kit — Bulbapedia "Steam Siege Prerelease Kit (TCG)", revision 4373798 (read 2026-09-29).
export default {
  key: 'steam-siege',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Steam_Siege_Prerelease_Kit_(TCG)', revision: 4373798 },
  promos: {
    yanmega: '1 Yanmega XYP 144',
    volcanion: '1 Volcanion XYP 145',
    clawitzer: '1 Clawitzer XYP 146',
    hoopa: '1 Hoopa XYP 147',
  },
  groups: {
    yanmega: [
      '2 Tangela STS 1',
      '2 Tangrowth STS 2',
      '2 Yanma STS 6',
      '1 Yanmega STS 7',
    ],
    volcanion: [
      '2 Ponyta STS 16',
      '2 Rapidash STS 17',
      '2 Litleo STS 22',
      '1 Pyroar STS 23',
    ],
    clawitzer: [
      '3 Oshawott STS 30',
      '2 Dewott STS 31',
      '2 Samurott STS 32',
      '1 Clauncher STS 33',
    ],
    hoopa: [
      '3 Nidoran♂ STS 43',
      '2 Nidorino STS 44',
      '2 Nidoking STS 45',
      '1 Level Ball AOR 76',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { yanmega: 'Grass', volcanion: 'Fire', clawitzer: 'Water', hoopa: 'Psychic' },
  trainers: [
    {
      name: 'Supporter cards',
      // Page: "6-8 Trainer Cards ... 3-4 in any combination of the Supporter cards and 3-4 in any combination of Item cards".
      count: [3, 4],
      cards: [
        '0-2 Tierno BKP 112',
        '0-2 Shauna FCO 111',
        "0-2 Giovanni's Scheme BKT 138",
      ],
    },
    {
      name: 'Item cards',
      // The Hoopa group's Level Ball comes on top of these.
      count: [3, 4],
      cards: [
        '0-2 Great Ball BKP 100',
        "0-2 Professor's Letter BKT 146",
        '0-2 Switch ROS 91',
      ],
    },
  ],
};
