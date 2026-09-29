// Paradox Rift Build & Battle Box — Bulbapedia "Paradox Rift Build & Battle Box (TCG)", revision 3901031 (read 2026-09-28).
export default {
  key: 'paradox-rift',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Paradox_Rift_Build_%26_Battle_Box_(TCG)', revision: 3901031 },
  promos: {
    'chi-yu': '1 Chi-Yu SVP 57',
    'iron-bundle': '1 Iron Bundle SVP 58',
    xatu: '1 Xatu SVP 59',
    aegislash: '1 Aegislash SVP 60',
  },
  groups: {
    'chi-yu': [
      '1 Magby PAR 19',
      '1 Iron Moth PAR 28',
      '3 Chi-Yu PAR 29',
      '1 Elekid PAR 59',
      '1 Clavell PAL 177',
      '1 Mela PAR 167',
      '1 Parasol Lady PAR 169',
      '1 Ultra Ball SVI 196',
      '1 Earthen Vessel PAR 163',
    ],
    'iron-bundle': [
      '3 Wimpod PAR 47',
      '3 Golisopod PAR 49',
      '1 Iron Bundle PAR 56',
      '1 Nemona SVI 180',
      "1 Bill's Transfer MEW 156",
      '1 Larry PAR 165',
      '1 Nest Ball SVI 181',
    ],
    xatu: [
      '2 Natu PAR 71',
      '1 Xatu PAR 72',
      '2 Flittle PAR 80',
      '2 Espathra PAR 81',
      '1 Jacq SVI 175',
      '1 Youngster SVI 198',
      '1 Tulip PAR 181',
      '1 Mesagoza SVI 178',
    ],
    aegislash: [
      '3 Honedge PAR 130',
      '2 Doublade PAR 132',
      '2 Aegislash PAR 134',
      '1 Jacq SVI 175',
      '1 Youngster SVI 198',
      '1 Rika PAR 172',
      '1 Rare Candy SVI 191',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { 'chi-yu': 'Fire', 'iron-bundle': 'Water', xatu: 'Psychic', aegislash: 'Metal' },
};
