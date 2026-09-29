// Temporal Forces Build & Battle Box — Bulbapedia "Temporal Forces Build & Battle Box (TCG)", revision 4044848 (read 2026-09-28).
export default {
  key: 'temporal-forces',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Temporal_Forces_Build_%26_Battle_Box_(TCG)', revision: 4044848 },
  promos: {
    feraligatr: '1 Feraligatr SVP 89',
    metang: '1 Metang SVP 90',
    koraidon: '1 Koraidon SVP 91',
    miraidon: '1 Miraidon SVP 92',
  },
  groups: {
    feraligatr: [
      '2 Feraligatr TEF 41',
      '2 Croconaw TEF 40',
      '3 Totodile TEF 39',
      '1 Relicanth TEF 84',
      '1 Buddy-Buddy Poffin TEF 144',
      '1 Jacq SVI 175',
      '1 Youngster SVI 198',
    ],
    metang: [
      '2 Metagross TEF 115',
      '2 Metang TEF 114',
      '3 Beldum TEF 113',
      '1 Buddy-Buddy Poffin TEF 144',
      "1 Morty's Conviction TEF 155",
      '1 Jacq SVI 175',
      '1 Youngster SVI 198',
    ],
    koraidon: [
      '3 Koraidon TEF 119',
      '2 Flutter Mane TEF 78',
      '2 Great Tusk TEF 96',
      '1 Ancient Booster Energy Capsule TEF 140',
      "1 Explorer's Guidance TEF 147",
      "1 Professor Sada's Vitality PAR 170",
      '1 Ultra Ball SVI 196',
    ],
    miraidon: [
      '3 Miraidon TEF 121',
      '4 Iron Thorns TEF 62',
      "1 Ciphermaniac's Codebreaking TEF 145",
      '1 Future Booster Energy Capsule TEF 149',
      '1 Techno Radar PAR 180',
      '1 Miriam SVI 179',
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { feraligatr: 'Water', metang: 'Metal', koraidon: 'Dragon', miraidon: 'Dragon' },
  // Page: "One basic Energy card will be replaced with a Luminous Energy if the Koraidon or Miraidon
  // group is present."
  energySwaps: [{ when: ['koraidon', 'miraidon'], cards: ['1 Luminous Energy PAL 191'] }],
};
