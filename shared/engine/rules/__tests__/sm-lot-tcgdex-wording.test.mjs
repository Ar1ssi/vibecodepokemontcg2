// SM-LOT audit: the game reads TCGdex card text, which spells Energy symbols as type words
// ("Retreat Cost is Colorless more", "any Water Energy", "GrassGrass") and drops "during your
// turn" from some when-played triggers. Each case is the TCGdex text of the printing named.
import test from 'node:test';
import assert from 'node:assert/strict';
import { abilityRetreatCost } from '../ability-combat.mjs';
import { cardAbilityText } from '../ability-executors.mjs';
import { resolveAbilitySteps } from '../../effects/ability.mjs';

let nextId = 1;
const mon = (name, text) => ({
  instanceId: nextId++,
  name,
  type: 'Pokémon',
  stage: 'Basic',
  subtypes: ['Basic'],
  types: ['Colorless'],
  hp: 100,
  abilities: text ? [{ name: 'Ability', text }] : [],
});

test('passive Ability text reads TCGdex type words as Energy symbols', () => {
  // TCGdex sm3.5-3 Venusaur Jungle Totem; sm6-21 Froakie Frubbles.
  assert.match(
    cardAbilityText(mon('Venusaur', 'Each basic Grass Energy attached to your Pokémon provides GrassGrass Energy.')),
    /each basic \{g\} energy attached to your pokémon provides \{g\}\{g\} energy/
  );
  assert.match(
    cardAbilityText(mon('Froakie', 'If this Pokémon has any Water Energy attached to it, it has no Retreat Cost.')),
    /has any \{w\} energy attached/
  );
});

test('Alolan Dugtrio Tangling Hair (TCGdex sm1-87) adds Colorless to the opponent Active Retreat Cost', () => {
  const target = mon('Target');
  const dugtrio = mon('Alolan Dugtrio', 'Your opponent’s Active Pokémon’s Retreat Cost is Colorless more.');
  const ctx = { sideCards: [target], opponentSideCards: [dugtrio], zone: 'active', isActive: true };
  assert.equal(abilityRetreatCost(target, ctx), 1);
});

test('Rhyperior Toppling Wind (TCGdex sm3-67) plans its mill without "during your turn"', () => {
  const { steps } = resolveAbilitySteps(
    'When you play this Pokémon from your hand to evolve 1 of your Pokémon, you may discard the top 3 cards of your opponent’s deck.',
    { selfName: 'Rhyperior' }
  );
  assert.ok(steps.length > 0 && steps.every((s) => s.type !== 'whenPlayedAbility'), JSON.stringify(steps));
});

test('Switch (sm3.5-67) and Counter Catcher (sm4-120) get the text TCGdex leaves blank', async () => {
  const { withPrintedStageFix } = await import('../rules-state.mjs');
  const { parseTrainerEffect } = await import('../trainer-effects.mjs');
  const sw = withPrintedStageFix({ id: 'sm3.5-67', name: 'Switch', effect: '' });
  assert.equal(sw.effect, 'Switch your Active Pokémon with 1 of your Benched Pokémon.');
  assert.ok(parseTrainerEffect(sw.effect).recognizable);
  const cc = withPrintedStageFix({ id: 'sm4-120', name: 'Counter Catcher', effect: '' });
  const parsed = parseTrainerEffect(cc.effect);
  assert.ok(parsed.recognizable && parsed.playCondition, JSON.stringify(parsed));
  // A filled text from TCGdex is kept.
  assert.equal(withPrintedStageFix({ id: 'sm3.5-67', effect: 'Fixed upstream.' }).effect, 'Fixed upstream.');
});
