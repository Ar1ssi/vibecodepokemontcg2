// The inspector's retreat tile when the engine's retreat gate throws: the tile stays, greyed, with
// a reason, instead of advertising a retreat that was never verified.
import test from 'node:test';
import assert from 'node:assert/strict';

const { buildInspectorModel } = await import('../card-inspector-model.mjs');

const CARD = {
  name: 'Dreepy',
  supertype: 'Pokémon',
  type: 'Dragon',
  types: ['Dragon'],
  hp: 70,
  stage: 'Basic',
  retreatCost: ['Colorless'],
  attacks: [],
};

test('model: a retreat gate that throws greys the tile instead of offering the retreat', () => {
  // The gate copies the card with a spread, so a getter that throws on its second read fails
  // inside the gate only (the model's own first read passes).
  let reads = 0;
  const card = {
    ...CARD,
    get retreatCost() {
      reads += 1;
      if (reads > 1) throw new Error('gate input unreadable');
      return ['Colorless'];
    },
  };
  const m = buildInspectorModel(card, { energyTypes: [] });
  assert.equal(m.retreatable, true);
  assert.equal(m.retreatUsable, false);
  assert.equal(m.retreatRecede, true);
  assert.match(m.retreatReason, /could not be checked/i);
});
