// Astral Radiance Build & Battle Box — Bulbapedia "Astral Radiance Build & Battle Box (TCG)", revision 4390135 (read 2026-09-29).
// The page says six Trainers; its groups (9–10 cards) leave two to four places in the 23-card
// Evolution pack, so that many come (design 054 A4).
export default {
  key: 'astral-radiance',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Astral_Radiance_Build_%26_Battle_Box_(TCG)', revision: 4390135 },
  promos: {
    'hisuian-basculegion': '1 Hisuian Basculegion SWSHP 205',
    wyrdeer: '1 Wyrdeer SWSHP 206',
    'hisuian-samurott': '1 Hisuian Samurott SWSHP 207',
    magnezone: '1 Magnezone SWSHP 208',
  },
  groups: {
    'hisuian-basculegion': [
      '3 Hisuian Basculin ASR 43',
      '2 Hisuian Basculegion ASR 44',
      '2 Keldeo ASR 45',
      '1 Evolution Incense SSH 163',
      '1 Irida ASR 147',
      '1 Gloria BRS 141',
    ],
    wyrdeer: [
      '2 Stantler ASR 125',
      '2 Wyrdeer ASR 69',
      '2 Yanma ASR 6',
      '2 Yanmega ASR 7',
      "1 Gardenia's Vigor ASR 143",
    ],
    'hisuian-samurott': [
      '2 Absol ASR 97',
      '2 Oshawott ASR 41',
      '2 Dewott ASR 42',
      '2 Hisuian Samurott ASR 100',
      '1 Dark Patch ASR 139',
      '1 Ultra Ball BRS 150',
    ],
    magnezone: [
      '2 Magnemite ASR 105',
      '2 Magneton ASR 106',
      '2 Magnezone ASR 107',
      '2 Registeel ASR 108',
      '1 Adaman ASR 135',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { 'hisuian-basculegion': 'Water', wyrdeer: 'Psychic', 'hisuian-samurott': 'Darkness', magnezone: 'Metal' },
  trainers: [
    {
      name: 'Trainer cards',
      count: null,
      cards: [
        '0-2 Copycat EVS 143',
        '0-2 Quick Ball FST 237',
        "0-2 Cynthia's Ambition BRS 138",
        "0-2 Professor's Research BRS 147",
        '0-2 Choy ASR 137',
        '0-2 Jubilife Village ASR 148',
        '0-2 Kamado ASR 149',
        '0-2 Zisu ASR 159',
      ],
    },
  ],
};
