// Fates Collide Prerelease Kit — Bulbapedia "Fates Collide Prerelease Kit (TCG)", revision 4373799 (read 2026-09-29).
// The Zygarde group's two "1-2" rows put 7–9 cards in it, so with it the Trainers come to 5–7, not the
// page's six: the pack keeps 23 (design 054 A4). Not simulated (A5): the optional Shuckle (up to 2)
// that replaces a Pokémon with several copies.
export default {
  key: 'fates-collide',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Fates_Collide_Prerelease_Kit_(TCG)', revision: 4373799 },
  promos: {
    moltres: '1 Moltres XYP 127',
    'white-kyurem': '1 White Kyurem XYP 128',
    zygarde: '1 Zygarde XYP 129',
    tyranitar: '1 Tyranitar XYP 130',
  },
  groups: {
    moltres: [
      '3 Fennekin FCO 11',
      '3 Braixen FCO 12',
      '2 Delphox FCO 13',
    ],
    'white-kyurem': [
      '2 Seel FCO 15',
      '2 Dewgong FCO 16',
      '2 Binacle FCO 22',
      '2 Barbaracle FCO 23',
    ],
    zygarde: [
      '3 Riolu FCO 46',
      '2 Lucario FCO 47',
      '1-2 Hawlucha FCO 48',
      '1-2 Carbink FCO 50',
    ],
    tyranitar: [
      '1 Larvitar FCO 40',
      '1 Pupitar FCO 42',
      '3 Vullaby FCO 57',
      '2 Mandibuzz FCO 58',
      '1 Kangaskhan FCO 75',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { moltres: 'Fire', 'white-kyurem': 'Water', zygarde: 'Fighting', tyranitar: 'Darkness' },
  trainers: [
    {
      name: 'Supporter cards',
      // Page: "2-3 in any combination of the Supporter cards and 3-4 in any combination of Item cards".
      count: [2, 3],
      cards: [
        '0-2 Tierno BKP 112',
        '0-2 Shauna FCO 111',
      ],
    },
    {
      name: 'Item cards',
      // Together they fill the 23-card pack: six Trainers, five to seven with the Zygarde group's ranges.
      count: [3, 4],
      cards: [
        '0-2 Great Ball BKP 100',
        "0-2 Professor's Letter BKT 146",
        '0-2 Switch ROS 91',
      ],
    },
  ],
};
