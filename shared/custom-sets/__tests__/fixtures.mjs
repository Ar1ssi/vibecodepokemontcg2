// A set as the cardback export writes it (design 075): one Pokémon re-made from a print, one Trainer.
// Shared by the schema, server and deck-builder tests (not a test file itself: the suite glob skips it).
export function sampleSet(over = {}) {
  return {
    format: 'ptcg-sim.custom-set-data',
    version: 1,
    id: 'customhbw',
    code: 'HBW',
    name: 'Homebrew Wave 1',
    releaseDate: '2026-10-23',
    cards: [
      {
        id: 'customhbw-001',
        localId: '001',
        category: 'Pokemon',
        name: 'Tyranitar',
        hp: 180,
        types: ['Fighting'],
        stage: 'Stage2',
        evolveFrom: 'Pupitar',
        attacks: [
          { cost: ['Fighting', 'Colorless'], name: 'Bedrock Breaker', damage: '120', effect: 'Discard a Stadium in play.' },
        ],
        abilities: [],
        weaknesses: [{ type: 'Grass', value: '×2' }],
        resistances: [],
        retreat: 4,
        regulationMark: 'D',
        rarity: 'Rare',
        illustrator: 'x',
        image: '/src/assets/custom-sets/customhbw/001',
        legal: { standard: false, expanded: false },
      },
      {
        id: 'customhbw-002',
        localId: '002',
        category: 'Trainer',
        name: 'Bill',
        trainerType: 'Supporter',
        effect: 'Draw 2 cards.',
        image: '/src/assets/custom-sets/customhbw/002',
      },
    ],
    ...over,
  };
}
