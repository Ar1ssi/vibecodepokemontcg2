import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../../../../../../../shared/engine/rng.mjs';
import { hydrateBoxData } from '../box-data.mjs';
import { drawEvolutionPack, evolutionPairingProblems } from '../pack-opening.mjs';

const card = (id, supertype = 'Pokémon') => ({ id, name: id, supertype, localId: id, rarity: 'Common' });
const box = {
  key: 'test-deck',
  kind: 'evolution-deck',
  packCount: 4,
  decks: ['a', 'b'].map((key) => ({ key, promoId: `promo-${key}` })),
};
const evoData = (energySwaps) =>
  hydrateBoxData({
    kind: 'evolution-deck',
    cards: [card('promo-a'), card('promo-b'), card('a-basic'), card('b-basic'), card('swap-energy', 'Energy')],
    promos: { a: 'promo-a', b: 'promo-b' },
    groups: { a: [{ id: 'a-basic', qty: 17 }], b: [{ id: 'b-basic', qty: 17 }] },
    common: [],
    energySwaps,
    energyNeeds: { a: [['Basic Fire Energy', 1]], b: [['Basic Water Energy', 1]] },
  });

test('a swap row with min and max is sized by its range, as drawEvolutionPack draws it', () => {
  // 1 promo + 17 + 17 = 35 fixed cards; the swap adds 1..6, so 41 is reachable.
  const ranged = evoData([{ when: ['a'], rows: [{ id: 'swap-energy', min: 1, max: 6 }] }]);
  const problems = evolutionPairingProblems({ box, data: ranged });
  assert.ok(
    problems.some((line) => line.endsWith('41 cards, more than 40')),
    problems.join('\n')
  );

  const sizes = new Set(
    Array.from({ length: 40 }, (_, seed) =>
      drawEvolutionPack({ data: ranged, groupKeys: ['a', 'b'], rng: createRng(seed) }).length
    )
  );
  assert.ok(Math.max(...sizes) > 40, 'the opener really draws past 40 for some seed');
});

test('a swap row with a fixed qty is still counted as that qty', () => {
  const fixed = evoData([{ when: ['a'], rows: [{ id: 'swap-energy', qty: 5 }] }]);
  assert.deepEqual(evolutionPairingProblems({ box, data: fixed }), []);
});
