// Journey Together Build & Battle Box — Bulbapedia "Journey Together Build & Battle Box (TCG)", revision 4332587 (read 2026-09-28).
// Iono's Kilowattrel + Lillie's Ribombee comes to 24 cards with the promo, not 23; the deck keeps 40
// with one Basic Energy fewer (design 054 A4).
export default {
  key: 'journey-together',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Journey_Together_Build_%26_Battle_Box_(TCG)', revision: 4332587 },
  promos: {
    'ns-darmanitan': "1 N's Darmanitan SVP 181",
    'ionos-kilowattrel': "1 Iono's Kilowattrel SVP 182",
    'lillies-ribombee': "1 Lillie's Ribombee SVP 183",
    'hops-snorlax': "1 Hop's Snorlax SVP 184",
  },
  groups: {
    'ns-darmanitan': [
      "2 N's Darumaka JTG 26",
      "2 N's Darmanitan JTG 27",
      '1 Nest Ball SVI 181',
      "1 N's PP Up JTG 153",
      '1 Boomerang Energy TWM 166',
    ],
    'ionos-kilowattrel': [
      "2 Iono's Wattrel JTG 54",
      "1 Iono's Kilowattrel JTG 55",
      '2 Noibat JTG 127',
      '2 Noivern JTG 128',
      '1 Levincia JTG 150',
    ],
    'lillies-ribombee': [
      '2 Shelmet JTG 12',
      '2 Accelgor JTG 13',
      "1 Lillie's Cutiefly JTG 66",
      "1 Lillie's Pearl JTG 151",
      '2 Luminous Energy PAL 191',
    ],
    'hops-snorlax': [
      "2 Hop's Corviknight JTG 108",
      "2 Hop's Rookidee JTG 133",
      "2 Hop's Corvisquire JTG 134",
      "1 Hop's Choice Band JTG 148",
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { 'ns-darmanitan': 'Fire', 'ionos-kilowattrel': 'Lightning', 'lillies-ribombee': 'Psychic', 'hops-snorlax': 'Colorless' },
  common: [
    '1 Ultra Ball SVI 196',
    '1 Jet Energy PAL 190',
    '1 Earthen Vessel PAR 163',
    '1 Technical Machine: Evolution PAR 178',
    '1 Drayton SSP 174',
    '1 Surfer SSP 187',
    "1 Iris's Fighting Spirit JTG 149",
  ],
  trainers: [
    {
      name: 'Trainer cards',
      count: null,
      cards: [
        '0-1 Arven SVI 166',
        '0-1 Exp. Share SVI 174',
        '0-1 Nemona SVI 180',
        '0-1 Youngster SVI 198',
        '0-1 Buddy-Buddy Poffin TEF 144',
        '0-1 Lacey SCR 139',
        "0-1 Brock's Scouting JTG 146",
      ],
    },
  ],
};
