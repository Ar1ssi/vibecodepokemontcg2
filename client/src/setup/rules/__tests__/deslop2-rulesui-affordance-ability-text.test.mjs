// action-affordances reads a card's ability text through the engine's cardAbilityText, so a card
// attached as a Tool answers with its Tool effect rather than its own printed Ability.
// Wording from the Last-Ditch Catch / Enriching Melody rows used in action-affordances.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';

const { isPlayedToBenchTriggerCard } = await import('../action-affordances.mjs');

const WHEN_PLAYED =
  'When you play this Pokémon from your hand onto your Bench, you may search your deck for a Supporter card, reveal it, and put it into your hand. Then shuffle your deck.';

test('isPlayedToBenchTriggerCard: reads the plural abilities[] shape of a server stamp', () => {
  assert.equal(
    isPlayedToBenchTriggerCard({ abilities: [{ name: 'Last-Ditch Catch', text: WHEN_PLAYED }] }),
    true
  );
});

test('isPlayedToBenchTriggerCard: a Pokémon attached as a Tool has no trigger of its own', () => {
  assert.equal(
    isPlayedToBenchTriggerCard({
      ability: { name: 'Last-Ditch Catch', text: WHEN_PLAYED },
      asTool: { text: 'The Pokémon this card is attached to takes 10 less damage.' },
      attachedTo: 7,
    }),
    false
  );
});
