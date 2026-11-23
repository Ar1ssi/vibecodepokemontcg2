// The custom-set engine check (oracle classifiers) reads the HB fossil-league parts the rules
// engine runs (shared/engine/__tests__/customhb-fossil-league.test.mjs) as running. Card text
// source: the user's set.json records, verbatim, from cardback — Lugia ex customhb-872, Bastiodon
// customhb-874 / customhb-875, Archeops customhb-881, Carracosta customhb-888, Relicanth customhb-890.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineCheck } from '../engine-check.mjs';

const pokemon = (localId, name, abilities, attacks = []) => ({
  id: `customhb-${localId}`,
  localId,
  name,
  category: 'Pokemon',
  abilities: abilities.map(([abilityName, effect]) => ({ type: 'Ability', name: abilityName, effect })),
  attacks,
});

const RECORDS = [
  pokemon('872', 'Lugia ex', [
    [
      'Silver Sparkle',
      "If Lugia ex is your Active Pokémon and is damaged by an opponent's attack (even if Lugia ex is Knocked Out), flip a coin. If heads, choose an Energy card attached to the Attacking Pokémon and return it to your opponent's hand.",
    ],
  ]),
  pokemon('874', 'Bastiodon', [
    [
      'Ancient Bulwark',
      "As long as this Pokémon is on your Bench, prevent all damage done to each of your Pokémon by attacks from your opponent's Pokémon that have 2 or less Energy attached.",
    ],
  ]),
  pokemon('875', 'Bastiodon', [
    [
      'Primal Fortress',
      "Your Pokémon take 30 less damage from attacks from your opponent's Pokémon V (after applying Weakness and Resistance).",
    ],
  ]),
  pokemon('881', 'Archeops', [
    [
      'Ancient Wing',
      "Once during your turn, if this Pokémon is in the Active Spot, you may devolve 1 of your opponent's Evolved Pokémon by putting the highest Stage Evolution card on it into your opponent's hand.",
    ],
  ]),
  pokemon('888', 'Carracosta', [
    [
      'Primal Knowledge',
      "Attacks used by your Pokémon do 30 more damage to your opponent's Active Evolution Pokémon (before applying Weakness and Resistance).",
    ],
  ]),
  pokemon(
    '890',
    'Relicanth',
    [
      [
        'Antique Search',
        'Once during your turn, you may use this Ability. Search your deck for an Item that has“Antique” in its name and put it onto your Bench. Then, shuffle your deck.',
      ],
    ],
    [
      {
        cost: ['Colorless'],
        name: 'Fossil Beatdown',
        damage: '10+',
        effect: 'This attack does 20 more damage for each of your Benched Pokémon that has "Antique" in its name.',
      },
    ]
  ),
];

test('the engine check reads every fossil-league Ability and attack as one the engine runs', () => {
  const { findings, parts } = engineCheck({ name: 'customhb fossil league', cards: RECORDS });
  assert.equal(parts, 7);
  assert.deepEqual(
    findings.map((f) => `${f.card.localId} ${f.name}: ${f.verdict} (${f.detail})`),
    []
  );
});
