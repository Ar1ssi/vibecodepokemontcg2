// Surging Sparks Build & Battle Box — Bulbapedia "Surging Sparks Build & Battle Box (TCG)", revision 4307995 (read 2026-09-28).
// Chien-Pao + Magneton comes to 24–25 cards with the promo, not 23; the deck keeps 40 with fewer
// Basic Energy (design 054 A4).
export default {
  key: 'surging-sparks',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Surging_Sparks_Build_%26_Battle_Box_(TCG)', revision: 4307995 },
  promos: {
    'gouging-fire': '1 Gouging Fire SVP 151',
    'chien-pao': '1 Chien-Pao SVP 152',
    magneton: '1 Magneton SVP 153',
    indeedee: '1 Indeedee SVP 154',
  },
  groups: {
    'gouging-fire': [
      '2 Gouging Fire SSP 38',
      '1 Koraidon SSP 116',
      '1 Mela PAR 167',
      '1 Surfer SSP 187',
      '1 Earthen Vessel PAR 163',
      '1 Powerglass SFA 63',
      '1 Artazon PAF 76',
      '2 Luminous Energy PAL 191',
    ],
    'chien-pao': [
      '3 Quaxly SSP 50',
      '2 Quaxwell SSP 51',
      '2 Quaquaval SSP 52',
      '1 Arven OBF 186',
      '1 Drayton SSP 174',
      '1 Buddy-Buddy Poffin TEF 144',
      '1 Rare Candy PAF 89',
      '1 Ultra Ball PAF 91',
    ],
    magneton: [
      '2 Magnemite SSP 58',
      '2 Magneton SSP 59',
      '2 Magnezone SSP 60',
      '1 Tapu Koko SSP 65',
      '1 Lacey SCR 139',
      '0-1 Buddy-Buddy Poffin TEF 144',
      '1 Rare Candy PAF 89',
      '2 Reversal Energy PAL 192',
    ],
    indeedee: [
      '2 Rellor SSP 13',
      '2 Rabsca SSP 14',
      '1 Wo-Chien SSP 15',
      '2 Snorlax SSP 144',
      '1 Dusk Ball SSP 175',
      '1 Ultra Ball SVI 196',
      // Page note: "This group of the kit is guaranteed to have one of either regular print of the
      // Professor's Research card" (SVI 189 or SVI 190, each listed 0-1).
      "1 Professor's Research SVI 189/190",
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { 'gouging-fire': 'Fire', 'chien-pao': 'Water', magneton: 'Lightning', indeedee: 'Psychic' },
  trainers: [
    {
      name: 'Trainer cards',
      count: null,
      cards: [
        "0-2 Explorer's Guidance TEF 147",
        '0-2 Lucky Helmet TWM 158',
        '0-2 Nest Ball SVI 181',
        '0-2 Night Stretcher SFA 61',
        '0-2 Switch SVI 194',
        '0-2 Technical Machine: Evolution PAR 178',
        '0-2 Vitality Band SVI 197',
      ],
    },
  ],
};
