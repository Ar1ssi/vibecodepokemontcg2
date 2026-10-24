// Team Plasma-era passive Abilities (B&W Plasma Storm / Freeze / Blast). Each card's Ability text
// is the corpus row named in its test (out/pkmn-pokemon-cards.json, set + number). Team Plasma
// membership is the printed marker: a card whose printing the generated table lists as Team Plasma
// (card-markers.generated.mjs) answers hasCardMarker(card, 'Team Plasma').
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  abilityDamageBonus,
  abilityDamagePrevention,
  abilityWeaknessOverride,
  abilityRetreatCost,
  abilityExtraTypes,
  abilityCopiedTypes,
  abilityIgnoresResistance,
} from '../ability-combat.mjs';
import { computeAttackDamage } from '../attack-engine.mjs';
import { hasCardMarker } from '../card-markers.mjs';

let nextId = 1;
const mon = (name, extra = {}) => ({
  instanceId: nextId++,
  name,
  type: 'Pokémon',
  supertype: 'Pokémon',
  stage: 'Basic',
  subtypes: ['Basic'],
  types: ['Colorless'],
  hp: 100,
  abilities: [],
  ...extra,
});
const ability = (name, text) => ({ name, type: 'Ability', text });
const energy = (name, type, extra = {}) => ({
  instanceId: nextId++,
  name,
  type: 'Energy',
  supertype: 'Energy',
  types: [type],
  ...extra,
});

// Table printings (card-markers.generated.mjs): Glaceon Plasma Freeze 23 and Klinklang Plasma
// Storm 90 are Team Plasma. Test partners carry the printing, not a Plasma name.
const teamPlasmaPartner = (extra = {}) => mon('Partner', { tcgId: 'bw9-23', types: ['Water'], ...extra });

test('table printing answers Team Plasma without a Plasma name', () => {
  assert.equal(hasCardMarker(teamPlasmaPartner(), 'Team Plasma'), true);
  assert.equal(hasCardMarker(mon('Partner'), 'Team Plasma'), false);
});

// Deoxys-EX, Plasma Freeze 111 and 53 (Ability Power Connect): "Your Team Plasma Pokémon's attacks
// (excluding Deoxys-EX) do 10 more damage to the Active Pokémon (before applying Weakness and
// Resistance)." Deoxys-EX's own printing is bw9-111 (Team Plasma), excluded by name.
test('Deoxys-EX Power Connect (Plasma Freeze 111 / 53): +10 to other Team Plasma attackers, not itself', () => {
  const deoxys = mon('Deoxys-EX', {
    tcgId: 'bw9-111',
    abilities: [
      ability(
        'Power Connect',
        "Your Team Plasma Pokémon's attacks (excluding Deoxys-EX) do 10 more damage to the Active Pokémon (before applying Weakness and Resistance)."
      ),
    ],
  });
  const partner = teamPlasmaPartner();
  const plain = mon('Plain', { types: ['Fire'] });
  const defender = mon('Defender', { types: ['Grass'] });
  const ctx = { sideCards: [deoxys, partner, plain], isActive: true };
  assert.equal(abilityDamageBonus(partner, defender, ctx), 10);
  assert.equal(abilityDamageBonus(deoxys, defender, ctx), 0, 'Deoxys-EX is excluded by name');
  assert.equal(abilityDamageBonus(plain, defender, ctx), 0, 'not a Team Plasma Pokémon');
});

// Klinklang, Plasma Storm 90 (Ability Plasma Steel): "Prevent all damage done to your {M} Pokémon by
// attacks from your opponent's Pokémon-EX." (The brief's "Team Plasma with Plasma Energy" wording is
// not the printed text: the filter is the Metal type.)
test('Klinklang Plasma Steel (Plasma Storm 90): prevents damage to Metal Pokémon from an opposing Pokémon-EX only', () => {
  const klinklang = mon('Klinklang', {
    tcgId: 'bw8-90',
    types: ['Metal'],
    abilities: [
      ability(
        'Plasma Steel',
        "Prevent all damage done to your {M} Pokémon by attacks from your opponent's Pokémon-EX."
      ),
    ],
  });
  const metal = mon('Metal Partner', { types: ['Metal'] });
  const fire = mon('Fire Partner', { types: ['Fire'] });
  const exAttacker = mon('Charizard ex', { types: ['Fire'], subtypes: ['Basic', 'ex'] });
  const basicAttacker = mon('Charmander', { types: ['Fire'] });
  const ctx = { sideCards: [klinklang, metal, fire] };
  assert.equal(abilityDamagePrevention(metal, exAttacker, ctx).preventAll, true);
  assert.equal(abilityDamagePrevention(metal, basicAttacker, ctx).preventAll, false, 'attacker is not a Pokémon-EX');
  assert.equal(abilityDamagePrevention(fire, exAttacker, ctx).preventAll, false, 'defender is not Metal');
});

// Machamp, Plasma Blast 49 (Ability Badge of Discipline): "The damage of each of your {F} Pokémon's
// attacks isn't affected by Resistance."
test('Machamp Badge of Discipline (Plasma Blast 49): a Fighting attacker ignores Resistance', () => {
  const machamp = mon('Machamp', {
    types: ['Fighting'],
    abilities: [
      ability(
        'Badge of Discipline',
        "The damage of each of your {F} Pokémon's attacks isn't affected by Resistance."
      ),
    ],
  });
  const fighter = mon('Fighter', { types: ['Fighting'] });
  const water = mon('Water', { types: ['Water'] });
  const resistantDefender = mon('Resistant', {
    types: ['Colorless'],
    hp: 100,
    resistance: { type: 'Fighting', value: -20 },
  });
  const ctx = { sideCards: [machamp, fighter, water] };
  assert.equal(abilityIgnoresResistance(fighter, ctx), true);
  assert.equal(abilityIgnoresResistance(water, ctx), false);

  const attack = { name: 'Punch', damage: '60' };
  const withAbility = computeAttackDamage(fighter, resistantDefender, attack, {
    ignoreResistance: abilityIgnoresResistance(fighter, ctx),
  });
  const withoutAbility = computeAttackDamage(fighter, resistantDefender, attack, {});
  assert.equal(withAbility.total, 60, 'Resistance is not applied');
  assert.equal(withoutAbility.total, 40, 'Resistance is applied without the Ability');
});

// Mesprit, Plasma Blast 37 (Ability Mental Shroud): "If you have Uxie and Azelf in play, each of your
// Pokémon has no Weakness."
test('Mesprit Mental Shroud (Plasma Blast 37): no Weakness for your side only while Uxie and Azelf are in play', () => {
  const mesprit = mon('Mesprit', {
    abilities: [
      ability('Mental Shroud', 'If you have Uxie and Azelf in play, each of your Pokémon has no Weakness.'),
    ],
  });
  const uxie = mon('Uxie');
  const azelf = mon('Azelf');
  const defender = mon('Defender', { types: ['Water'] });
  const withBoth = { sideCards: [defender, mesprit, uxie, azelf] };
  const missingAzelf = { sideCards: [defender, mesprit, uxie] };
  assert.deepEqual(abilityWeaknessOverride(defender, withBoth), { none: true });
  assert.equal(abilityWeaknessOverride(defender, missingAzelf), null);
});

// Lucario, Plasma Storm 78 (Ability Dual Armor): "If this Pokémon has any {M} Energy attached to it,
// this Pokémon's type is both {F} and {M}."
test('Lucario Dual Armor (Plasma Storm 78): adds Metal while a Metal Energy is attached', () => {
  const lucario = mon('Lucario', {
    types: ['Fighting'],
    abilities: [
      ability(
        'Dual Armor',
        "If this Pokémon has any {M} Energy attached to it, this Pokémon's type is both {F} and {M}."
      ),
    ],
  });
  const metalEnergy = energy('Metal Energy', 'Metal', { attachedTo: lucario.instanceId });
  assert.deepEqual(abilityExtraTypes(lucario, { sideCards: [lucario, metalEnergy] }), ['Metal']);
  assert.deepEqual(abilityExtraTypes(lucario, { sideCards: [lucario] }), [], 'no Metal Energy attached');
});

// Kecleon, Plasma Freeze 94 (Ability Color Change): "As long as this Pokémon is your Active
// Pokémon, this Pokémon is the same type as the your opponent's Active Pokémon."
test('Kecleon Color Change (Plasma Freeze 94): takes the opposing Active type while Active', () => {
  const kecleon = mon('Kecleon', {
    types: ['Colorless'],
    abilities: [
      ability(
        'Color Change',
        "As long as this Pokémon is your Active Pokémon, this Pokémon is the same type as the your opponent's Active Pokémon."
      ),
    ],
  });
  const waterActive = mon('Opp Active', { types: ['Water'] });
  assert.deepEqual(
    abilityCopiedTypes(kecleon, { sideActive: [kecleon], opponentActive: [waterActive] }),
    ['Water']
  );
  assert.equal(
    abilityCopiedTypes(kecleon, { sideActive: [], sideBench: [kecleon], opponentActive: [waterActive] }),
    null,
    'on the Bench the types are its own'
  );
});

// Glaceon, Plasma Freeze 23 (Ability Freeze Zone): "The Retreat Cost of each of your Team Plasma
// Pokémon in play is {C}{C} less."
test('Glaceon Freeze Zone (Plasma Freeze 23): cuts 2 from each Team Plasma Pokémon retreat cost', () => {
  const glaceon = mon('Glaceon', {
    tcgId: 'bw9-23',
    abilities: [
      ability('Freeze Zone', 'The Retreat Cost of each of your Team Plasma Pokémon in play is {C}{C} less.'),
    ],
  });
  const partner = teamPlasmaPartner({ retreatCost: ['Colorless', 'Colorless', 'Colorless'] });
  const plain = mon('Plain', { types: ['Fire'] });
  const ctx = { sideActive: [partner], sideBench: [glaceon, plain], sideCards: [partner, glaceon, plain] };
  assert.equal(abilityRetreatCost(partner, ctx), -2);
  assert.equal(abilityRetreatCost(plain, { ...ctx, sideActive: [plain], sideBench: [glaceon, partner] }), 0);
});
