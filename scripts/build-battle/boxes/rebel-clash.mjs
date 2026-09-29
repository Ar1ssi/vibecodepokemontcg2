// Rebel Clash Build & Battle Box — Bulbapedia "Rebel Clash Build & Battle Box (TCG)", revision 4389114 (read 2026-09-29).
// The page gives four Supporters, five with the Flapple or Coalossal group; with both the 23-card
// Evolution pack leaves six places, so six come (design 054 A4).
export default {
  key: 'rebel-clash',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Rebel_Clash_Build_%26_Battle_Box_(TCG)', revision: 4389114 },
  promos: {
    flapple: '1 Flapple SWSHP 22',
    luxray: '1 Luxray SWSHP 23',
    coalossal: '1 Coalossal SWSHP 24',
    garbodor: '1 Garbodor SWSHP 25',
  },
  groups: {
    flapple: [
      '1 Applin RCL 20',
      '2 Caterpie RCL 1',
      '2 Metapod RCL 2',
      '2 Butterfree RCL 3',
      '1 Turffield Stadium RCL 170',
    ],
    luxray: [
      '3 Shinx RCL 60',
      '3 Luxio RCL 61',
      '2 Luxray RCL 62',
      '1 Speed Lightning Energy RCL 173', // Bulbapedia: "Speed L Energy"
    ],
    coalossal: [
      '1 Rolycoly RCL 105',
      '1 Carkol RCL 106',
      '3 Barboach RCL 99',
      '2 Whiscash RCL 100',
      '1 Quick Ball SSH 179',
    ],
    garbodor: [
      '1 Trubbish RCL 117',
      '3 Impidimp RCL 123',
      '2 Morgrem RCL 124',
      '2 Grimmsnarl RCL 125',
      '1 Evolution Incense SSH 163',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { flapple: 'Grass', luxray: 'Lightning', coalossal: 'Fighting', garbodor: 'Darkness' },
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
