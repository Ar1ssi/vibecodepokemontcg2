import test from 'node:test';
import assert from 'node:assert/strict';

const { resolveAttackContext } = await import('../resolve-attack-context.mjs');
const { specialEnergyBoard } = await import('../special-energy-parse.mjs');

const basicFireEnergy = { name: 'Fire Energy', type: 'Energy', subtypes: ['Basic'], types: ['Fire'] };
const basicWaterEnergy = { name: 'Water Energy', type: 'Energy', subtypes: ['Basic'], types: ['Water'] };
const stadiumWithDiscount = {
  name: 'Cost Cutter Stadium',
  text: 'Attacks used by your Pokémon cost 1 less.',
};

test('no active card: attachedEnergyCards empty, stadium/ability defaults hold', async () => {
  const result = await resolveAttackContext({
    activeCard: null,
    attachedEnergyCards: [],
    ensureCardData: async () => {},
    stadiumCard: null,
    abilityUsed: () => false,
  });
  assert.deepEqual(result.energyTypes, []);
  assert.equal(result.stadiumCostModifier, 0);
  assert.equal(result.abilityUsedFlag, false);
  assert.deepEqual(result.priorAttacks, []);
  assert.equal(result.inheritsAttacks, false);
});

test('attachedEnergyCards empty: energyTypes stays empty', async () => {
  const result = await resolveAttackContext({
    activeCard: { name: 'Pikachu' },
    attachedEnergyCards: [],
    ensureCardData: async () => {},
    stadiumCard: null,
    abilityUsed: () => false,
  });
  assert.deepEqual(result.energyTypes, []);
});

test('ensureCardData rejecting for one energy card: skip it, keep going', async () => {
  const result = await resolveAttackContext({
    activeCard: { name: 'Pikachu' },
    attachedEnergyCards: [basicFireEnergy, basicWaterEnergy],
    ensureCardData: async (card) => {
      if (card === basicFireEnergy) throw new Error('not loaded yet');
    },
    stadiumCard: null,
    abilityUsed: () => false,
  });
  assert.equal(result.energyTypes.length, 2);
  assert.equal(result.energyTypes[0].type, 'Fire');
  assert.equal(result.energyTypes[1].type, 'Water');
});

test('stadiumCard null: stadiumCostModifier is 0', async () => {
  const result = await resolveAttackContext({
    activeCard: { name: 'Pikachu' },
    attachedEnergyCards: [],
    ensureCardData: async () => {},
    stadiumCard: null,
    abilityUsed: () => false,
  });
  assert.equal(result.stadiumCostModifier, 0);
});

test('normal 2-energy case with a cost-modifier stadium', async () => {
  const active = { name: 'Charizard' };
  const result = await resolveAttackContext({
    activeCard: active,
    attachedEnergyCards: [basicFireEnergy, basicFireEnergy],
    ensureCardData: async () => {},
    stadiumCard: stadiumWithDiscount,
    abilityUsed: (card) => card === active,
  });
  assert.equal(result.energyTypes.length, 2);
  assert.deepEqual(result.energyTypes.map((e) => e.type), ['Fire', 'Fire']);
  assert.equal(result.energyTypes[0].family, 'basic');
  assert.equal(result.stadiumCostModifier, 1);
  assert.equal(result.abilityUsedFlag, true);
  assert.deepEqual(result.priorAttacks, []);
});

test('stadiumEnergyRewrites: Temple of Sinnoh flattens a Double to one {C} (E4)', async () => {
  const doubleColorless = {
    name: 'Double Colorless Energy',
    supertype: 'Energy',
    subtypes: ['Special'],
    types: ['Colorless'],
  };
  const temple = {
    name: 'Temple of Sinnoh',
    text: "All Special Energy attached to Pokémon (both yours and your opponent's) provide {C} Energy and have no other effect.",
  };

  const result = await resolveAttackContext({
    activeCard: { name: 'Pikachu' },
    attachedEnergyCards: [doubleColorless],
    ensureCardData: async () => {},
    stadiumCard: temple,
    abilityUsed: () => false,
  });

  assert.deepEqual(result.energyTypes, [{ type: 'Colorless', family: 'basic' }]);
});

test('priorAttacks is always [] even when inheritance text is present (I43)', async () => {
  const active = {
    name: 'Gengar',
    evolvesFrom: 'Haunter',
    text: 'This Pokémon can use the attacks of its previous Evolutions.',
  };
  const result = await resolveAttackContext({
    activeCard: active,
    attachedEnergyCards: [],
    ensureCardData: async () => {},
    stadiumCard: null,
    abilityUsed: () => false,
  });
  assert.deepEqual(result.priorAttacks, []);
  assert.equal(result.inheritsAttacks, true);
});

// I176: the preview must price conditional Special Energy with the same attached
// cards and board facts the server's energyProvisionContext supplies.
const reversalEnergy = {
  name: 'Reversal Energy',
  type: 'Energy',
  subtypes: ['Special'],
  text: 'As long as this card is attached to a Pokémon, it provides {C} Energy. If you have more Prize cards remaining than your opponent, and if this card is attached to an Evolution Pokémon that doesn’t have a Rule Box (Pokémon ex, Pokémon V, etc. have Rule Boxes), this card provides every type of Energy but provides only 3 Energy at a time.',
};
const luminousEnergy = {
  name: 'Luminous Energy',
  type: 'Energy',
  subtypes: ['Special'],
  text: 'As long as this card is attached to a Pokémon, it provides every type of Energy but provides only 1 Energy at a time. If the Pokémon this card is attached to has any other Special Energy attached, this card provides {C} Energy instead.',
};
const stageOneHost = { name: 'Raichu', type: 'Pokémon', stage: 'Stage 1', types: ['Lightning'] };

const providesOf = async (energies, board) => {
  const result = await resolveAttackContext({
    activeCard: stageOneHost,
    attachedEnergyCards: energies,
    ensureCardData: async () => {},
    stadiumCard: null,
    abilityUsed: () => false,
    board,
  });
  return result.energyTypes.map((e) => e.provides);
};

test('Reversal Energy provides 3 of any type when the board says the player trails (I176)', async () => {
  const board = specialEnergyBoard({ ownPrizes: 5, opponentPrizes: 2 });
  assert.deepEqual(await providesOf([reversalEnergy], board), [['Wildcard', 'Wildcard', 'Wildcard']]);
  const even = specialEnergyBoard({ ownPrizes: 2, opponentPrizes: 2 });
  assert.deepEqual(await providesOf([reversalEnergy], even), [['Colorless']]);
});

test('Luminous Energy beside another Special Energy provides only {C} (I176)', async () => {
  const [, luminous] = await providesOf([reversalEnergy, luminousEnergy], {});
  assert.deepEqual(luminous, ['Colorless']);
  const [alone] = await providesOf([luminousEnergy], {});
  assert.deepEqual(alone, ['Wildcard']);
});

test('Crystal Energy beside a basic Fire copies Fire even when cards carry no instanceId (I176)', async () => {
  const crystal = { name: 'Crystal Energy', type: 'Energy', subtypes: ['Special'] };
  const [, provided] = await providesOf([basicFireEnergy, crystal], {});
  assert.deepEqual(provided, ['Fire']);
});

test('specialEnergyBoard counts Stage 2 Pokémon and leaves unknown prize counts undefined', () => {
  const board = specialEnergyBoard({
    ownPrizes: 3,
    inPlayPokemon: [
      { name: 'Gardevoir', stage: 'Stage 2' },
      { name: 'Kirlia', subtypes: ['Stage 1'] },
      { name: 'Gallade', subtypes: ['Stage 2'] },
      null,
    ],
  });
  assert.deepEqual(board, { ownPrizes: 3, opponentPrizes: undefined, ownStage2InPlay: 2 });
});
