// Design 091 slice 4: engine-check reads Stadiums with the Stadium layer (a Stadium the engine runs is no
// gap) and a "… Pokémon on your Bench" count is not a Bench placement. Card texts: the customhb gap drafts
// (.agent/scratch/customhb-card-drafts.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineCheck } from '../engine-check.mjs';

const stadium = (localId, name, effect) => ({ id: `customdrft-${localId}`, localId, name, category: 'Trainer', trainerType: 'Stadium', effect });
const SET = {
  id: 'customdrft',
  name: 'Drafts',
  cards: [
    stadium(
      '001',
      'Lost Shrine',
      "Whenever a Pokémon (either yours or your opponent's) is Knocked Out, put that Pokémon in the Lost Zone instead of the discard pile. (Discard all attached cards.)"
    ),
    stadium(
      '002',
      'Proving Grounds',
      'Whenever either player plays a Pokémon from his or her hand to evolve 1 of his or her Pokémon, put 2 damage counters on that Pokémon.'
    ),
    stadium('003', 'Quiet Ruins', "Special Energy attached to Pokémon (both yours and your opponent's) provide only {C} Energy and have no other effect."),
    {
      id: 'customdrft-004',
      localId: '004',
      name: "Ranger's Luxio",
      category: 'Pokemon',
      types: ['Lightning'],
      stage: 'Basic',
      hp: 100,
      abilities: [],
      attacks: [
        {
          cost: ['Lightning', 'Colorless'],
          name: 'Capture Spark',
          damage: '30+',
          effect: "This attack does 30 more damage for each Ranger's Pokémon on your Bench.",
        },
      ],
    },
  ],
};

test('engine-check: Stadiums the Stadium layer runs are no gap; an unreadable one still is', () => {
  const { findings } = engineCheck(SET);
  assert.deepEqual(
    findings.map((f) => f.name),
    ['Quiet Ruins']
  );
});
