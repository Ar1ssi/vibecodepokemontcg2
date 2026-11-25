// Stadium / Tool / Trainer / Energy parsers read against real printed text from
// out/pkmn-trainer-cards.json (the row is named in each test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  stadiumFilterMatches,
  parseStadiumDamagePreventionDetail,
  parseStadiumHpModifier,
  parseStadiumRetreatModifier,
  parseStadiumCostModifier,
  parseStadiumAttackCostIncrease,
  parseStadiumEvolutionSpeed,
  isEvolutionCard,
} from '../stadium-effects.mjs';
import { parseTmAttachRestriction, tmAttachAllowed, parseGrantedAttacks } from '../tool-attacks.mjs';
import { toolConditionMet } from '../tool-conditions.mjs';
import { reductionForCard, attachedCards, isEvolutionCard as toolIsEvolutionCard } from '../tool-combat.mjs';
import { trainerEndsTurn } from '../trainer-effects.mjs';
import { trainerPlayBlockReason } from '../trainer-play-conditions.mjs';
import { pokemonMatchesEnergyType } from '../special-energy-effects.mjs';
import { cardPrintedText } from '../trainer-card-text.mjs';
import { typeForSymbol, titleTypeForSymbol } from '../energy-symbols.mjs';

const rows = JSON.parse(
  readFileSync(new URL('../../../../out/pkmn-trainer-cards.json', import.meta.url), 'utf8')
);
const printed = (name) => {
  const row = rows.find((r) => r.name === name);
  assert.ok(row, `${name} is in the corpus`);
  return { name, text: row.text };
};

test('Altar of the Sunne (Guardians Rising): "{R} Pokémon and {M} Pokémon" matches Fire and Metal', () => {
  const altar = printed('Altar of the Sunne');
  assert.equal(stadiumFilterMatches({ name: 'Charmander', types: ['Fire'] }, altar), true);
  assert.equal(stadiumFilterMatches({ name: 'Registeel', types: ['Metal'] }, altar), true);
  assert.equal(stadiumFilterMatches({ name: 'Squirtle', types: ['Water'] }, altar), false);
});

test('energy symbol table: one owner, Fire included', () => {
  assert.equal(typeForSymbol('R'), 'fire');
  assert.equal(titleTypeForSymbol('d'), 'Darkness');
  assert.equal(typeForSymbol('x'), null);
  assert.equal(parseStadiumEvolutionSpeed({ text: 'Each {R} Pokémon can evolve during the turn you play it.' }).typeFilter, 'fire');
});

test('Life Forest and Black Market print no damage prevention; the prevention Stadiums keep theirs', () => {
  // Both say "prevent all effects of that card done to this Stadium card", which is not damage.
  assert.equal(parseStadiumDamagePreventionDetail(printed('Life Forest Prism Star')), null);
  assert.equal(parseStadiumDamagePreventionDetail(printed('Black Market Prism Star')), null);
  assert.equal(parseStadiumDamagePreventionDetail(printed('Sky Pillar')).amount, Infinity);
  assert.equal(parseStadiumDamagePreventionDetail(printed('Holon Circle')).zone, 'active');
  assert.deepEqual(parseStadiumDamagePreventionDetail(printed('Neutralization Zone')), {
    amount: Infinity,
    zone: 'any',
    ruleBoxOnly: true,
  });
});

test('Mt. Moon prints "maximum HP less than 70", not an HP modifier; Gravity Mountain is -30', () => {
  assert.equal(parseStadiumHpModifier(printed('Mt. Moon')), 0);
  assert.equal(parseStadiumHpModifier(printed('Gravity Mountain')), -30);
  assert.equal(parseStadiumHpModifier(printed('Lively Stadium')), 30);
});

test('Retreat Cost Stadiums change the retreat cost by the printed {C} count and not the attack cost', () => {
  assert.equal(parseStadiumRetreatModifier(printed('Tower of Waters')), -2);
  assert.equal(parseStadiumRetreatModifier(printed('Phoebe’s Stadium')), -2);
  assert.equal(parseStadiumRetreatModifier(printed('Beach Court')), -1);
  assert.equal(parseStadiumRetreatModifier(printed('Galar Mine')), 2);
  assert.equal(parseStadiumRetreatModifier(printed('Calamitous Wasteland')), 1);
  for (const name of ['Tower of Waters', 'Beach Court', 'Paradise Resort']) {
    assert.equal(parseStadiumCostModifier(printed(name)), 0, `${name} is no attack discount`);
  }
  for (const name of ['Galar Mine', 'Calamitous Wasteland', 'Mount Lanakila']) {
    assert.equal(parseStadiumAttackCostIncrease(printed(name)), 0, `${name} is no attack tax`);
  }
});

test('attack cost Stadiums still read their printed amount', () => {
  assert.equal(parseStadiumAttackCostIncrease(printed('Nighttime Mine')), 1);
  assert.equal(parseStadiumAttackCostIncrease(printed('Pokémon League Headquarters')), 1);
  assert.equal(parseStadiumCostModifier(printed('Dimension Valley')), 1);
});

test('Technical Machine / Cube / Miracle Sphere attach targets are parsed and enforced', () => {
  const water = parseTmAttachRestriction(printed('Water Cube 01').text);
  assert.deepEqual(water, { types: ['water'] });
  assert.equal(tmAttachAllowed(water, { top: { name: 'Squirtle', types: ['Water'] } }), true);
  assert.equal(tmAttachAllowed(water, { top: { name: 'Charmander', types: ['Fire'] } }), false);

  const sphere = parseTmAttachRestriction(printed('Miracle Sphere ⍺').text);
  assert.deepEqual(sphere.types, ['fire', 'lightning', 'fighting']);
  assert.equal(tmAttachAllowed(sphere, { top: { name: 'Charizard', types: ['Fire'] }, evolved: false }), false);
  assert.equal(tmAttachAllowed(sphere, { top: { name: 'Charizard', types: ['Fire'] }, evolved: true }), true);

  assert.equal(parseTmAttachRestriction(printed('Multi Technical Machine 01').text), null);
  // A clause the parser does not know blocks the attach rather than lifting the restriction.
  const unknown = parseTmAttachRestriction('Attach this card to 1 of your Pokémon with a purple tail.');
  assert.equal(tmAttachAllowed(unknown, { top: { name: 'Rattata', types: ['Colorless'] } }), false);
});

test('a granted attack whose cost holds a non-Energy symbol is dropped, not given a cheaper cost', () => {
  const attacks = parseGrantedAttacks({
    name: 'Test Cube',
    text: '{F}{Q} → Slam: 30 Does 30 damage. {F} → Poke: 10 Does 10 damage.',
  });
  assert.deepEqual(attacks.map((a) => a.name), ['Poke']);
  assert.deepEqual(attacks[0].cost, ['Fighting']);
});

test('trainerEndsTurn reads text split into lines (Rotom Bike, Sword & Shield)', () => {
  const { text } = printed('Rotom Bike');
  assert.equal(trainerEndsTurn({ text }), true);
  assert.equal(trainerEndsTurn({ text: ['Draw cards until you have 6 cards in your hand.', 'Your turn ends.'] }), true);
  assert.equal(trainerEndsTurn({ text: '', effect: text }), true);
  assert.equal(cardPrintedText({ text: ' ', effect: 'Draw 2 cards.' }), 'Draw 2 cards.');
  assert.equal(trainerEndsTurn({ text: 'If tails, your turn ends.' }), false);
});

test('trainerPlayBlockReason: a Switch-style card needs a Bench; array-form text is read the same way', () => {
  const switchCard = printed('Switch');
  assert.ok(switchCard.text);
  const block = trainerPlayBlockReason({
    card: { ...switchCard, subtypes: ['Item'], text: [switchCard.text] },
    turnNumber: 3,
    myPrizes: 6,
    opponentPrizes: 6,
    benchCount: 0,
  });
  assert.equal(block, 'No Benched Pokémon to switch with.');
});

test('Tool condition "no Energy attached" counts only Energy attached to this holder (DOM-backed cards)', () => {
  const holderImage = { id: 'holder' };
  const holder = { name: 'Pikachu', image: holderImage, hp: 60 };
  const elsewhere = { name: 'Fire Energy', type: 'Energy', image: { relative: { id: 'other' } } };
  const attachedHere = { name: 'Fire Energy', type: 'Energy', image: { relative: holderImage } };
  const cond = { noEnergyAttached: true };
  assert.equal(toolConditionMet(cond, { holder, zoneCards: [holder, elsewhere] }), true);
  assert.equal(toolConditionMet(cond, { holder, zoneCards: [holder, attachedHere] }), false);
  assert.deepEqual(attachedCards(holder, [holder, elsewhere, attachedHere]), [attachedHere]);
});

test('Thick Scale: the opponent-type list is the only attacker type gate', () => {
  const thickScale = printed('Thick Scale');
  const holder = { name: 'Kyurem', types: ['Dragon'] };
  const hit = (type) => reductionForCard(thickScale, holder, { name: 'Attacker', types: [type] }, { holder });
  assert.equal(hit('Fire'), 50);
  assert.equal(hit('Water'), 50);
  assert.equal(hit('Dragon'), 0);
});

test('Evolution means one thing for Tools and Stadiums (BREAK, TCGdex "Stage1")', () => {
  assert.equal(toolIsEvolutionCard, isEvolutionCard);
  assert.equal(toolIsEvolutionCard({ stage: 'BREAK' }), true);
  assert.equal(toolIsEvolutionCard({ stage: 'Stage1' }), true);
  assert.equal(toolIsEvolutionCard({ stage: 'Basic' }), false);
  assert.equal(toolIsEvolutionCard({ subtypes: ['VMAX'] }), true);
  assert.equal(toolIsEvolutionCard({ name: 'No stage' }), false);
});

test('Special Energy type search: a name is only a stand-in when no types are present', () => {
  // out/pkmn-pokemon-cards.json has "Dark Dragonite" (Team Rocket); its type here is synthetic.
  assert.equal(pokemonMatchesEnergyType({ name: 'Dark Dragonite', types: ['Lightning'] }, 'dark'), false);
  assert.equal(pokemonMatchesEnergyType({ name: 'Dark Dragonite', types: ['Darkness'] }, 'dark'), true);
  assert.equal(pokemonMatchesEnergyType({ name: 'Dark Dragonite' }, 'dark'), true);
});
