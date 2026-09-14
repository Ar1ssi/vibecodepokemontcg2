import test from 'node:test';
import assert from 'node:assert/strict';

const { resolveAttackContext } = await import('../resolve-attack-context.mjs');

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
