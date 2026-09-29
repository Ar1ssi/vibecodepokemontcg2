// Paldea Evolved Build & Battle Box — Bulbapedia "Paldea Evolved Build & Battle Box (TCG)", revision 4044850 (read 2026-09-28).
export default {
  key: 'paldea-evolved',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Paldea_Evolved_Build_%26_Battle_Box_(TCG)', revision: 4044850 },
  promos: {
    baxcalibur: '1 Baxcalibur SVP 19',
    tinkaton: '1 Tinkaton SVP 20',
    murkrow: '1 Murkrow SVP 21',
    pelipper: '1 Pelipper SVP 22',
  },
  groups: {
    baxcalibur: [
      '3 Frigibax PAL 58',
      '2 Arctibax PAL 59',
      '1 Baxcalibur PAL 60',
      '1 Paldean Tauros PAL 41',
      '1 Nest Ball SVI 181',
      '1 Dendra PAL 179',
      '1 Superior Energy Retrieval PAL 189',
    ],
    tinkaton: [
      '3 Tinkatink PAL 100',
      '2 Tinkatuff PAL 103',
      '1 Tinkaton PAL 105',
      '1 Nemona SVI 180',
      '1 Artazon PAL 171',
      '1 Super Rod PAL 188',
      '1 Luminous Energy PAL 191',
    ],
    murkrow: [
      '3 Murkrow PAL 131',
      '4 Flamigo PAL 170',
      // Page: each print "0-1 — Can be either SVI 189 or SVI 190": one Professor's Research, either print.
      "1 Professor's Research SVI 189/190",
      '1 Ultra Ball SVI 196',
      '1 Clavell PAL 177',
    ],
    pelipper: [
      '2 Wingull PAL 158',
      '1 Pelipper PAL 159',
      '3 Nymble PAL 20',
      '2 Lokix PAL 21',
      '1 Jacq SVI 175',
      "1 Boss's Orders PAL 172",
      '1 Grusha PAL 184',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { baxcalibur: 'Water', tinkaton: 'Psychic', murkrow: 'Darkness', pelipper: 'Colorless' },
  trainers: [
    {
      name: 'Trainer cards',
      count: null,
      cards: [
        '0-2 Youngster SVI 198',
        '0-2 Great Ball PAL 183',
      ],
    },
  ],
};
