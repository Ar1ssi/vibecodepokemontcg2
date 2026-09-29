// Stellar Crown Build & Battle Box — Bulbapedia "Stellar Crown Build & Battle Box (TCG)", revision 4289510 (read 2026-09-28).
// The page's groups run 10–13 cards, so a pairing comes to 22–26 with the promo, not 23; the deck
// keeps 40 with fewer (or more) Basic Energy (design 054 A4). Ledian's and Bouffalant's attacks cost
// only Colorless (TCGdex sv07-002, sv07-003, svp-133; sv07-118, sv07-119, svp-136): Ledian takes its
// header's Grass, Bouffalant's header is Colorless, so its partner group's Energy fills the deck (A3).
export default {
  key: 'stellar-crown',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Stellar_Crown_Build_%26_Battle_Box_(TCG)', revision: 4289510 },
  promos: {
    ledian: '1 Ledian SVP 133',
    crabominable: '1 Crabominable SVP 134',
    drifblim: '1 Drifblim SVP 135',
    bouffalant: '1 Bouffalant SVP 136',
  },
  groups: {
    ledian: [
      '4 Ledyba SCR 2',
      '2-3 Ledian SCR 3',
      '1 Cycling Road MEW 157',
      '1 Bug Catching Set TWM 143',
      '1 Youngster SVI 198',
      '1 Rika PAR 172',
    ],
    crabominable: [
      '3 Crabrawler SCR 87',
      '2 Crabominable SCR 42',
      '2 Veluza SCR 45',
      '4 Kofu SCR 138',
      '2 Reversal Energy PAL 192',
    ],
    drifblim: [
      '4 Drifloon SCR 60',
      '3 Drifblim SCR 61',
      '1 Lacey SCR 139',
      "1 Lana's Aid TWM 155",
      '1 Moonlit Hill PAF 81',
      '1 Nest Ball SVI 181',
    ],
    bouffalant: [
      '3 Fan Rotom SCR 118',
      '3 Bouffalant SCR 119',
      '2 Artazon PAL 171',
      '2 Jet Energy PAL 190',
      '1 Bravery Charm PAL 173',
      '1 Nemona SVI 180',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { ledian: 'Grass', crabominable: 'Water', drifblim: 'Psychic', bouffalant: 'Colorless' },
};
