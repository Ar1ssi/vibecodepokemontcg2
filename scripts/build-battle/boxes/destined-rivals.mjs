// Destined Rivals Build & Battle Box — Bulbapedia "Destined Rivals Build & Battle Box (TCG)", revision 4334896 (read 2026-09-28).
// The page's groups are larger than an Evolution pack allows: every pairing comes to 26–28 cards
// with the promo, not 23; the deck keeps 40 with 12–14 Basic Energy (design 054 A4).
export default {
  key: 'destined-rivals',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Destined_Rivals_Build_%26_Battle_Box_(TCG)', revision: 4334896 },
  promos: {
    'ethans-typhlosion': "1 Ethan's Typhlosion DRI 34",
    'mistys-gyarados': "1 Misty's Gyarados DRI 49",
    'team-rockets-mimikyu': "1 Team Rocket's Mimikyu DRI 87",
    'team-rockets-tyranitar': "1 Team Rocket's Tyranitar DRI 96",
  },
  groups: {
    'ethans-typhlosion': [
      "4 Ethan's Cyndaquil DRI 32",
      "2 Ethan's Quilava DRI 33",
      "2 Ethan's Typhlosion DRI 34",
      "2 Ethan's Adventure DRI 165",
      '1 Rare Candy SVI 191',
      "1 Professor's Research JTG 155",
    ],
    'mistys-gyarados': [
      "3 Misty's Staryu DRI 46",
      "2 Misty's Starmie DRI 47",
      "1 Misty's Magikarp DRI 48",
      "1 Misty's Gyarados DRI 49",
      "1 Misty's Lapras DRI 50",
      '1 Nest Ball SVI 181',
      '1 Great Ball PAL 183',
      '1 Super Rod PAL 188',
      '1 Surfer SSP 187',
      "1 Brock's Scouting JTG 146",
    ],
    'team-rockets-mimikyu': [
      "4 Team Rocket's Koffing DRI 125",
      "2 Team Rocket's Weezing DRI 126",
      "2 Team Rocket's Murkrow DRI 127",
      "1 Team Rocket's Archer DRI 170",
      "1 Team Rocket's Proton DRI 177",
      '1 Switch SVI 194',
      '1 Ultra Ball SVI 196',
      "1 Team Rocket's Energy DRI 182",
    ],
    'team-rockets-tyranitar': [
      "4 Team Rocket's Larvitar DRI 94",
      "2 Team Rocket's Pupitar DRI 95",
      "2 Team Rocket's Tyranitar DRI 96",
      "2 Team Rocket's Great Ball DRI 175",
      '1 Lacey SCR 139',
      '0-1 Rare Candy SVI 191',
      "2 Team Rocket's Energy DRI 182",
    ],
  },
  // The group headers' type: the Energy fallback when a group's attacks name no type (design 054 A3).
  groupTypes: { 'ethans-typhlosion': 'Fire', 'mistys-gyarados': 'Water', 'team-rockets-mimikyu': 'Psychic', 'team-rockets-tyranitar': 'Fighting' },
  trainers: [
    {
      name: 'Trainer cards',
      count: null,
      cards: [
        '0-2 Youngster SVI 198',
        '0-2 Buddy-Buddy Poffin TEF 144',
      ],
    },
  ],
};
