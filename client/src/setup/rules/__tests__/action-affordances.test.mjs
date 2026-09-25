import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeActionAffordances,
  isPlayedToBenchTriggerCard,
  isEvolvePlayedTriggerCard,
} from '../action-affordances.mjs';

const pikachu = (attacks) => ({
  name: 'Pikachu',
  type: 'Pokémon',
  types: ['Lightning'],
  attacks,
});

test('attackAvailable: true when any attack is payable', async () => {
  const card = pikachu([
    { name: 'Thundershock', cost: ['Lightning'], damage: 30, text: '' },
    { name: 'Big Shock', cost: ['Lightning', 'Lightning', 'Lightning'], damage: 90, text: '' },
  ]);
  const res = await computeActionAffordances({
    activeCard: card,
    attachedEnergyCards: [{ type: 'Energy', name: 'Basic Lightning Energy' }],
  });
  assert.equal(res.attackAvailable, true);
});

test('attackAvailable: false when no attack cost is covered', async () => {
  const card = pikachu([{ name: 'Big Shock', cost: ['Lightning', 'Lightning'], damage: 90, text: '' }]);
  const res = await computeActionAffordances({
    activeCard: card,
    attachedEnergyCards: [{ type: 'Energy', name: 'Basic Lightning Energy' }],
  });
  assert.equal(res.attackAvailable, false);
});

test('attackAvailable: once-per-turn attack already used is not available', async () => {
  const card = pikachu([
    { name: 'Oncey', cost: ['Lightning'], text: 'Once during your turn: draw 2 cards.' },
  ]);
  const energy = [{ type: 'Energy', name: 'Basic Lightning Energy' }];
  const before = await computeActionAffordances({ activeCard: card, attachedEnergyCards: energy });
  assert.equal(before.attackAvailable, true);
  const after = await computeActionAffordances({
    activeCard: card,
    attachedEnergyCards: energy,
    isAbilityUsed: () => true,
  });
  assert.equal(after.attackAvailable, false);
});

test('attackAvailable: no Active is never available', async () => {
  const res = await computeActionAffordances({ activeCard: null });
  assert.equal(res.attackAvailable, false);
  assert.equal(res.abilityAvailable, false);
  assert.deepEqual(res.usableAbilities, []);
});

test('abilityAvailable: active + bench actionable abilities are returned with zone/index', async () => {
  const active = {
    ...pikachu([{ name: 'Zap', cost: ['Lightning'], text: '' }]),
    ability: { name: 'Pick Up', text: 'Once during your turn: draw 1 card.' },
  };
  const benchMon = {
    name: 'Eevee',
    type: 'Pokémon',
    types: ['Colorless'],
    ability: { name: 'Energy Notice', text: 'Once during your turn, you may attach a basic Energy card from your hand to 1 of your Pokémon.' },
  };
  const res = await computeActionAffordances({
    activeCard: active,
    attachedEnergyCards: [],
    benchCards: [benchMon, { name: 'Poke Ball', type: 'Trainer' }],
  });
  assert.equal(res.abilityAvailable, true);
  assert.deepEqual(
    res.usableAbilities.map((a) => [a.zone, a.index, a.card.name]),
    [
      ['active', 0, 'Pikachu'],
      ['bench', 0, 'Eevee'],
    ]
  );
});

test('abilityAvailable: a spent ability drops out via the merged predicate', async () => {
  const active = {
    ...pikachu([]),
    ability: { name: 'Pick Up', text: 'Once during your turn: draw 1 card.' },
  };
  const res = await computeActionAffordances({
    activeCard: active,
    isAbilityUsed: () => true,
  });
  assert.equal(res.abilityAvailable, false);
});

test('abilityAvailable: a hand-activated ability is returned with zone hand (I155)', async () => {
  const active = { ...pikachu([]), ability: { name: 'Pick Up', text: 'Once during your turn: draw 1 card.' } };
  const luxray = {
    name: 'Luxray',
    type: 'Pokémon',
    ability: {
      name: 'Swelling Flash',
      text: 'Once during your turn, if this Pokémon is in your hand and you have more Prize cards remaining than your opponent, you may put this Pokémon onto your Bench.',
    },
  };
  const res = await computeActionAffordances({
    activeCard: active,
    handCards: [luxray, { name: 'Poke Ball', type: 'Trainer' }],
  });
  assert.deepEqual(
    res.usableAbilities.map((a) => [a.zone, a.index, a.card.name]),
    [
      ['active', 0, 'Pikachu'],
      ['hand', 0, 'Luxray'],
    ]
  );
});

test('ensureCardData failures are swallowed and the scan still answers', async () => {
  const active = {
    name: 'Unknown',
    type: 'Pokémon',
    types: ['Colorless'],
    attacks: [{ name: 'Tackle', cost: ['Colorless'], text: '' }],
  };
  const res = await computeActionAffordances({
    activeCard: active,
    attachedEnergyCards: [{ type: 'Energy', name: 'Basic Colorless Energy' }],
    ensureCardData: async () => {
      throw new Error('network down');
    },
  });
  assert.equal(res.attackAvailable, true);
});

test('isPlayedToBenchTriggerCard: matches when-played wording only', () => {
  assert.equal(
    isPlayedToBenchTriggerCard({
      ability: {
        name: 'Last-Ditch Catch',
        text: 'When you play this Pokémon from your hand onto your Bench, you may search your deck for a Supporter card, reveal it, and put it into your hand. Then shuffle your deck.',
      },
    }),
    true
  );
  assert.equal(
    isPlayedToBenchTriggerCard({ ability: { name: 'Pick Up', text: 'Once during your turn: draw 1 card.' } }),
    false
  );
  assert.equal(isPlayedToBenchTriggerCard(undefined), false);
});

test('isEvolvePlayedTriggerCard: matches the evolve-play wording only', () => {
  const primarina = {
    ability: {
      name: 'Enriching Melody',
      text: 'Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may use this Ability. Heal all damage from 1 of your Pokémon.',
    },
  };
  assert.equal(isEvolvePlayedTriggerCard(primarina), true);
  // The evolve trigger must not be read as a played-to-Bench trigger (the two
  // have different one-shot gates).
  assert.equal(isPlayedToBenchTriggerCard(primarina), false);
  assert.equal(isEvolvePlayedTriggerCard(undefined), false);
});
