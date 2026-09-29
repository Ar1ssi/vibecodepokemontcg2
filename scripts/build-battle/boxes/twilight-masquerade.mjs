// Twilight Masquerade Build & Battle Box — Bulbapedia "Twilight Masquerade Build & Battle Box (TCG)", revision 4469589 (read 2026-09-28).
// The Trainer pool's "1-2" minimums (Nemona, Youngster) always come, so Thwackey + Tatsugiri comes
// to 24 cards with the promo, not 23; the deck keeps 40 with one Basic Energy fewer (design 054 A4).
export default {
  key: 'twilight-masquerade',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Twilight_Masquerade_Build_%26_Battle_Box_(TCG)', revision: 4469589 },
  promos: {
    thwackey: '1 Thwackey SVP 115',
    infernape: '1 Infernape SVP 116',
    froslass: '1 Froslass SVP 117',
    tatsugiri: '1 Tatsugiri SVP 118',
  },
  groups: {
    thwackey: [
      '2 Grookey TWM 14',
      '2 Thwackey TWM 15',
      '1 Rillaboom TWM 16',
      '1 Applin TWM 17',
      '1 Dipplin TWM 18',
      '1 Bug Catching Set TWM 143',
      '1 Festival Grounds TWM 149',
      '1 Luminous Energy PAL 191',
    ],
    infernape: [
      '2 Chimchar TWM 31',
      '2 Monferno TWM 32',
      '1 Infernape TWM 33',
      '1 Chi-Yu TWM 39',
      '1 Okidogi TWM 111',
      '1 Luminous Energy PAL 191',
    ],
    froslass: [
      '4 Snorunt TWM 51',
      '2 Glalie TWM 52',
      '1 Froslass TWM 53',
      '1 Munkidori TWM 95',
      '1 Luminous Energy PAL 191',
    ],
    tatsugiri: [
      '3 Flabébé TWM 86',
      '2 Floette TWM 87',
      '2 Florges TWM 88',
      '1 Fezandipiti TWM 96',
      '1 Tatsugiri TWM 131',
      '1 Rescue Board TEF 159',
      '1 Luminous Energy PAL 191',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { thwackey: 'Grass', infernape: 'Fire', froslass: 'Water', tatsugiri: 'Dragon' },
  trainers: [
    {
      name: 'Trainer cards',
      count: null,
      cards: [
        '0-2 Buddy-Buddy Poffin TEF 144',
        '0-1 Caretaker TWM 144',
        '0-1 Community Center TWM 146',
        '0-2 Great Ball PAL 183',
        '0-1 Jacq SVI 175',
        '0-1 Larry PAR 165',
        '1-2 Nemona SVI 180',
        '0-2 Nest Ball SVI 181',
        '0-1 Perrin TWM 160',
        '0-1 Picnicker SVP 114',
        '0-1 Salvatore TEF 160',
        '0-2 Ultra Ball SVI 196',
        '1-2 Youngster SVI 198',
      ],
    },
  ],
};
