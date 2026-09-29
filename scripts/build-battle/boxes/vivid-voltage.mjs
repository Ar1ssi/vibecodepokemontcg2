// Vivid Voltage Build & Battle Box — Bulbapedia "Vivid Voltage Build & Battle Box (TCG)", revision 4389649 (read 2026-09-29).
export default {
  key: 'vivid-voltage',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Vivid_Voltage_Build_%26_Battle_Box_(TCG)', revision: 4389649 },
  promos: {
    charizard: '1 Charizard SWSHP 66',
    donphan: '1 Donphan SWSHP 67',
    snorlax: '1 Snorlax SWSHP 68',
    lugia: '1 Lugia SWSHP 69',
  },
  groups: {
    charizard: [
      '3 Charmander VIV 23',
      '2 Charmeleon VIV 24',
      '2 Charizard VIV 25',
      '1 Leon VIV 154', // page: VIV 182, the full-art print (TCGdex swsh4-182 Ultra Rare); its prose calls the box's Leon the non-holo version of the holo print, swsh4-154 (design 054 D9)
    ],
    donphan: [
      '2 Phanpy VIV 86',
      '1 Donphan VIV 87',
      '2 Wooper VIV 83',
      '2 Quagsire VIV 84',
      '1 Hitmontop VIV 88',
      '1 Bea VIV 147', // page: VIV 180, the full-art print (TCGdex swsh4-180 Ultra Rare); the regular print is swsh4-147 (design 054 D9)
    ],
    snorlax: [
      '3 Pikipek VIV 143',
      '2 Trumbeak VIV 144',
      '2 Toucannon VIV 145',
      '1 Evolution Incense SSH 163',
      '1 Bird Keeper DAA 159',
    ],
    lugia: [
      '2 Cramorant VIV 40',
      '4 Arrokuda VIV 41',
      '1 Quick Ball SSH 179',
      '2 Nessa VIV 157',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { charizard: 'Fire', donphan: 'Fighting', snorlax: 'Colorless', lugia: 'Water' },
  trainers: [
    {
      name: 'Supporter cards',
      count: null,
      cards: [
        '0-2 Hop SSH 165',
        "0-2 Professor's Research (Professor Magnolia) SSH 178", // Bulbapedia: "Professor's Research"
        '0-2 Dan RCL 158',
        '0-2 Sonia RCL 167',
        '0-2 Allister VIV 146', // page: VIV 179, the full-art print (TCGdex swsh4-179 Ultra Rare); Evolving Skies' page lists VIV 146 (design 054 D9)
        '0-2 Opal VIV 158', // page: VIV 184, the full-art print (TCGdex swsh4-184 Ultra Rare); the regular print is swsh4-158 (design 054 D9)
      ],
    },
  ],
};
