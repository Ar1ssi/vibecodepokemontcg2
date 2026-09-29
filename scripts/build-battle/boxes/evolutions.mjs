// Evolutions Prerelease Kit — Bulbapedia "Evolutions Prerelease Kit (TCG)", revision 4373426 (read 2026-09-29).
// The page's 8-card groups and "3 Supporter cards and 2 Item cards" make 22, but it names a 23-card
// Evolution pack: the Items fill the pack, so three come (design 054 A4).
export default {
  key: 'evolutions',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Evolutions_Prerelease_Kit_(TCG)', revision: 4373426 },
  promos: {
    charizard: '1 Charizard EVO 11',
    gyarados: '1 Gyarados EVO 34',
    mewtwo: '1 Mewtwo EVO 51',
    machamp: '1 Machamp EVO 59',
  },
  groups: {
    charizard: [
      '1 Charmander EVO 9',
      '1 Charmeleon EVO 10',
      '2 Vulpix EVO 14',
      '2 Ninetales EVO 15',
      '1 Growlithe EVO 17',
      '1 Arcanine EVO 18',
    ],
    gyarados: [
      '3 Poliwag EVO 23',
      '2 Poliwhirl EVO 24',
      '2 Poliwrath EVO 25',
      '1 Magikarp EVO 33',
    ],
    mewtwo: [
      '3 Nidoran♂ EVO 43',
      '2 Nidorino EVO 44',
      '2 Nidoking EVO 45',
      '1 Mew EVO 53',
    ],
    machamp: [
      '2 Diglett EVO 55',
      '2 Dugtrio EVO 56',
      '1 Machop EVO 57',
      '1 Machoke EVO 58',
      '1 Hitmonchan EVO 62',
      '1 Level Ball AOR 76',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { charizard: 'Fire', gyarados: 'Water', mewtwo: 'Psychic', machamp: 'Fighting' },
  trainers: [
    {
      name: 'Supporter cards',
      // Page: "at least one Tierno was provided. Only 3 in any combination of the Supporter cards".
      count: 3,
      cards: [
        '1-2 Tierno BKP 112',
        '0-2 Shauna FCO 111',
        "0-2 Professor Birch's Observations PRC 134",
      ],
    },
    {
      name: 'Item cards',
      count: null,
      cards: [
        '0-2 Great Ball BKP 100',
        "0-2 Professor's Letter BKT 146",
      ],
    },
  ],
};
