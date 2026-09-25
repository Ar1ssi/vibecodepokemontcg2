// Audit SE13d / SE14: printings whose text the parser under-read. Texts are copied
// from out/pkmn-special-energy-cards.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSpecialEnergyEffects,
  planSpecialEnergyTriggers,
  specialEnergyProvision,
  getSpecialEnergyAttackBonus,
  getSpecialEnergyAttackPenalty,
  getSpecialEnergyDamageReduction,
  hasSpecialEnergyEffectShield,
  discardsAtEndOfTurn,
  failedSpecialEnergyRestriction,
} from '../special-energy-parse.mjs';
import { computeAttackDamage } from '../attack-engine.mjs';

const UNIT_UPR_170 =
  "This card provides {C} Energy. While this card is attached to a Pokémon, it provides {G}, {R}, and {W} Energy but provides only 1 Energy at a time.";
const BLEND_DRX_117 =
  "This card provides {C} Energy. When this card is attached to a Pokémon, this card provides {G}, {R}, {P}, or {D} Energy but provides only 1 Energy at a time.";
const RAPID =
  "This card can only be attached to a Rapid Strike Pokémon. If this card is attached to anything other than a Rapid Strike Pokémon, discard this card. As long as this card is attached to a Pokémon, it provides 2 in any combination of {W} Energy and {F} Energy.";
const SUPER_BOOST =
  "This card provides {C} Energy. While this card is attached to a Stage 2 Pokémon, it provides every type of Energy but provides only 1 Energy at a time. If you have 3 or more Stage 2 Pokémon in play, it provides every type of Energy but provides 4 Energy at a time.";
const FULL_HEAL_TR =
  "If you play this card from your hand, the Pokémon you attach it to is no longer Asleep, Confused, Paralyzed, or Poisoned. Full Heal Energy provides {C} energy. (Doesn’t count as a basic Energy card.)";
const RAINBOW_TR =
  "Attach Rainbow Energy to 1 of your Pokémon. While in play, Rainbow Energy counts as every type of basic Energy but only provides 1 Energy at a time. (Doesn’t count as a basic Energy card when not in play.) When you attach this card from your hand to 1 of your Pokémon, it does 10 damage to that Pokémon. (Don’t apply Weakness and Resistance.)";
const DARK_UF =
  "If the Pokémon Darkness Energy is attached to attack, the attack does 10 more damage to the Active Pokémon (before applying Weakness and Resistance). Ignore this effect unless the Attacking Pokémon is {D} or has Dark in its name. Darkness Energy provides {D} Energy. (Doesn’t count as a basic Energy card.)";
const DARK_AQ =
  "If the Pokémon Darkness Energy is attached to damages the Defending Pokémon (after applying Weakness and Resistance), the attack does 10 more damage to the Defending Pokémon. At the end of every turn, put 1 damage counter on the Pokémon Darkness Energy is attached to, unless it’s {D} or has Dark in its name. Darkness Energy provides {D} Energy. (Doesn’t count as a basic Energy card.)";
const METAL_AQ =
  "Damage done to the Pokémon Metal Energy is attached to is reduced by 10 (after applying Weakness and Resistance). If the Pokémon Metal Energy is attached to isn’t {M}, whenever it damages a Pokémon, reduce that damage by 10 (before applying Weakness and Resistance). Metal Energy provides {M} Energy. (Doesn’t count as a basic Energy card.)";
const METAL_EX =
  "Damage done by attacks to the Pokémon Metal Energy is attached to is reduced by 10 (after applying Weakness and Resistance). If the Pokémon Metal Energy is attached to isn’t {M}, whenever it damages a Pokémon by an attack, reduce that damage by 10 (after applying Weakness and Resistance). Metal Energy provides {M} Energy. (Doesn’t count as a basic Energy card.)";
const HOLON_GL_DF =
  "Holon Energy GL provides {C} Energy. If the Pokémon that Holon Energy GL is attached to also has a basic {G} Energy card attached to it, that Pokémon can’t be affected by any Special Conditions. If the Pokémon that Holon Energy GL is attached to also has a basic {L} Energy card attached to it, damage done to that Pokémon by attacks from your opponent’s Pokémon-ex is reduced by 10. Ignore these effects if Holon Energy GL is attached to Pokémon-ex.";
const HOLON_GL_DS =
  "Holon Energy GL provides {C} Energy. If the Pokémon that Holon Energy GL is attached to also has a basic {G} Energy card attached to it, that Pokémon can’t be affected by any Special Conditions. If the Pokémon that Holon Energy GL is attached to also has a basic {L} Energy card attached to it, damage done by your opponent’s Pokémon-ex is reduced by 10. Ignore these effects if Holon Energy GL is attached to Pokémon-ex.";
const HOLON_WP_DS =
  "Holon Energy WP provides {C} Energy. If the Pokémon that Holon Energy WP is attached to also has a basic {W} Energy card attached to it, prevent all effects, excluding damage, done to that Pokémon by your opponent’s Pokémon. If the Pokémon that Holon Energy WP is attached to also has a basic {P} Energy card attached to it, that Pokémon’s Retreat Cost is 0. Ignore these effects if Holon Energy WP is attached to Pokémon-ex.";
const RECYCLE_N1 =
  "Recycle Energy provides {C} Energy. (Doesn’t count as a basic Energy card.) If this card is put into your discard pile from play, return it to your hand.";
const R_ENERGY =
  "R Energy can be attached only to a Pokémon that has Dark or Rocket’s in its name. While in play, R Energy provides 2 {D} Energy. (Doesn’t count as a basic Energy card.) If the Pokémon R Energy is attached to attacks, the attack does 10 more damage to the Active Pokémon (before applying Weakness and Resistance). When your turn ends, discard R Energy.";
const MIRACLE =
  "You can’t have more than 1 Miracle Energy in your deck. Attach Miracle Energy to 1 of your Shining or Light Pokémon. At the end of your turn, discard Miracle Energy. While in play, Miracle Energy counts as every type of Energy but provides only 2 Energy at a time.";
const DOUBLE_RAINBOW_MA =
  "Double Rainbow Energy can be attached only to an Evolved Pokémon (excluding Pokémon-ex). While in play, Double Rainbow Energy provides every type of Energy but provides 2 Energy at a time. (Doesn’t count as a basic Energy when not in play and has no effect other than providing Energy.) Damage done to your opponent’s Pokémon by the Pokémon Double Rainbow Energy is attached to is reduced by 10 (after applying Weakness and Resistance). When the Pokémon Double Rainbow Energy is attached to is no longer an Evolved Pokémon, discard Double Rainbow Energy.";

const card = (name, text) => ({ name, text, type: 'Energy', subtypes: ['Special'] });
const steps = (name, text) => parseSpecialEnergyEffects(card(name, text)).steps;
const hostWith = (host, energies, basics = []) => {
  const zone = [host];
  energies.forEach((e, i) => zone.push({ ...e, instanceId: 500 + i, attachedTo: host.instanceId }));
  basics.forEach((name, i) => zone.push({ name, type: 'Energy', subtypes: ['Basic'], instanceId: 600 + i, attachedTo: host.instanceId }));
  return zone;
};

test('SE14: Unit and Blend Energy read their own printing, not the first one by name', () => {
  assert.deepEqual(parseSpecialEnergyEffects(card('Unit Energy {', UNIT_UPR_170)).provides[0].energyTypes, ['Grass', 'Fire', 'Water']);
  assert.deepEqual(parseSpecialEnergyEffects(card('Blend Energy {', BLEND_DRX_117)).provides[0].energyTypes, ['Grass', 'Fire', 'Psychic', 'Dark']);
});

test('SE14: Rapid Strike provides 2; Super Boost provides {C} off a Stage 2', () => {
  assert.equal(parseSpecialEnergyEffects(card('Rapid Strike Energy', RAPID)).provides[0].count, 2);
  const superBoost = card('Super Boost Energy Prism Star', SUPER_BOOST);
  assert.deepEqual(specialEnergyProvision(superBoost, { host: { name: 'Pikachu', stage: 'Basic' } }), ['Colorless']);
});

test('SE14: Team Rocket Full Heal and Rainbow Energy on-attach effects', () => {
  assert.deepEqual(
    planSpecialEnergyTriggers(card('Full Heal Energy', FULL_HEAL_TR), { trigger: 'attach', fromZone: 'hand' }),
    [{ action: 'clearStatus', conditions: ['Asleep', 'Confused', 'Paralyzed', 'Poisoned'] }]
  );
  assert.deepEqual(
    planSpecialEnergyTriggers(card('Rainbow Energy', RAINBOW_TR), { trigger: 'attach', fromZone: 'hand' }),
    [{ action: 'addDamage', count: 1, target: 'host' }]
  );
});

test('SE14: Darkness Energy bonuses — Unseen Forces parses, Aquapolis applies to any host', () => {
  const darkHost = { name: 'Umbreon', types: ['Darkness'], instanceId: 1 };
  assert.equal(getSpecialEnergyAttackBonus(darkHost, hostWith(darkHost, [card('Darkness Energy', DARK_UF)])), 10);
  const fireHost = { name: 'Charmander', types: ['Fire'], instanceId: 1 };
  const aquapolis = hostWith(fireHost, [card('Darkness Energy', DARK_AQ)]);
  assert.equal(getSpecialEnergyAttackBonus(fireHost, aquapolis), 0, 'not a before-W/R bonus');
  assert.equal(getSpecialEnergyAttackBonus(fireHost, aquapolis, { afterWR: true }), 10);
});

test('review: Aquapolis Darkness adds its 10 after Weakness, and only when the attack damages', () => {
  const attacker = { name: 'Umbreon', types: ['Darkness'], instanceId: 1 };
  const zone = hostWith(attacker, [card('Darkness Energy', DARK_AQ)]);
  const weak = { name: 'Espeon', types: ['Psychic'], hp: 200, weakness: { type: 'Darkness', value: 2 }, instanceId: 20 };
  assert.equal(
    computeAttackDamage(attacker, weak, { name: 'Bite', damage: 20 }, { attackerZoneCards: zone, defenderZoneCards: [weak] }).total,
    50
  );
  const resists = { name: 'Espeon', types: ['Psychic'], hp: 200, resistance: { type: 'Darkness', value: -30 }, instanceId: 20 };
  assert.equal(
    computeAttackDamage(attacker, resists, { name: 'Bite', damage: 20 }, { attackerZoneCards: zone, defenderZoneCards: [resists] }).total,
    0
  );
});

test('SE14: old Metal Energy reduces incoming damage on any host and cuts a non-{M} host’s own damage', () => {
  const fireHost = { name: 'Charmander', types: ['Fire'], instanceId: 1 };
  const metalHost = { name: 'Steelix', types: ['Metal'], instanceId: 1 };
  for (const text of [METAL_AQ, METAL_EX]) {
    const zone = hostWith(fireHost, [card('Metal Energy', text)]);
    assert.equal(getSpecialEnergyDamageReduction(fireHost, zone, { afterWR: true }), 10);
    const penalty =
      getSpecialEnergyAttackPenalty(fireHost, zone) + getSpecialEnergyAttackPenalty(fireHost, zone, { afterWR: true });
    assert.equal(penalty, 10);
    const metalZone = hostWith(metalHost, [card('Metal Energy', text)]);
    assert.equal(getSpecialEnergyAttackPenalty(metalHost, metalZone) + getSpecialEnergyAttackPenalty(metalHost, metalZone, { afterWR: true }), 0);
  }
});

test('SE14: Holon GL ex reduction needs a basic {L}; Holon WP DS shields effects', () => {
  const host = { name: 'Pikachu δ', types: ['Metal'], instanceId: 1 };
  const exAttacker = { name: 'Rayquaza ex', subtypes: ['ex'] };
  for (const text of [HOLON_GL_DF, HOLON_GL_DS]) {
    const withL = hostWith(host, [card('Holon Energy GL', text)], ['Lightning Energy']);
    const withG = hostWith(host, [card('Holon Energy GL', text)], ['Grass Energy']);
    // EX-era timing: after Weakness and Resistance (I175).
    assert.equal(getSpecialEnergyDamageReduction(host, withL, { attacker: exAttacker, afterWR: true }), 10);
    assert.equal(getSpecialEnergyDamageReduction(host, withL, { attacker: exAttacker, afterWR: false }), 0);
    assert.equal(getSpecialEnergyDamageReduction(host, withG, { attacker: exAttacker, afterWR: true }), 0);
    // "Ignore these effects if Holon Energy GL is attached to Pokémon-ex" (I173).
    const exHost = { name: 'Mightyena ex', subtypes: ['ex'], types: ['Metal'], instanceId: 1 };
    const exWithL = hostWith(exHost, [card('Holon Energy GL', text)], ['Lightning Energy']);
    assert.equal(getSpecialEnergyDamageReduction(exHost, exWithL, { attacker: exAttacker, afterWR: true }), 0);
  }
  const exHost = { name: 'Mightyena ex', subtypes: ['ex'], types: ['Metal'], instanceId: 1 };
  assert.equal(hasSpecialEnergyEffectShield(exHost, hostWith(exHost, [card('Holon Energy WP', HOLON_WP_DS)], ['Water Energy'])), false);
  const wp = hostWith(host, [card('Holon Energy WP', HOLON_WP_DS)], ['Water Energy']);
  assert.equal(hasSpecialEnergyEffectShield(host, wp), true);
});

test('SE14: Recycle N1 returns to hand, R Energy discards at end of turn, Miracle is Shining/Light only', () => {
  assert.deepEqual(planSpecialEnergyTriggers(card('Recycle Energy', RECYCLE_N1), { trigger: 'discard' }), [{ action: 'returnToHand' }]);
  assert.equal(discardsAtEndOfTurn(card('R Energy', R_ENERGY)), true);
  const miracle = card('Miracle Energy', MIRACLE);
  assert.deepEqual(failedSpecialEnergyRestriction(miracle, { name: 'Pikachu', subtypes: ['Basic'] }, [], { atAttach: true }), {
    kind: 'shiningOrLight',
    discardIfNot: false,
  });
  assert.equal(failedSpecialEnergyRestriction(miracle, { name: 'Shining Mew', subtypes: ['Basic'] }, [], { atAttach: true }), null);
});

test('SE13d: Double Rainbow MA 88 lowers damage after Weakness', () => {
  const attacker = { name: 'Blaziken', types: ['Fire'], instanceId: 1 };
  const zone = hostWith(attacker, [card('Double Rainbow Energy', DOUBLE_RAINBOW_MA)]);
  const defender = { name: 'Bulbasaur', types: ['Grass'], hp: 200, weakness: { type: 'Fire', value: 2 } };
  // Before W/R the penalty would give (30 - 10) × 2 = 40; after W/R it is 30 × 2 - 10 = 50.
  assert.equal(computeAttackDamage(attacker, defender, { name: 'Flare', damage: 30 }, { attackerZoneCards: zone }).total, 50);
});

test('I173: Heal Energy does nothing on attach to a Pokémon-ex', () => {
  const HEAL =
    'Heal Energy provides {C} Energy. When you attach this card from your hand to 1 of your Pokémon, remove 1 damage counter and all Special Conditions from that Pokémon. If Heal Energy is attached to Pokémon-ex, Heal Energy has no effect other than providing Energy.';
  const heal = card('Heal Energy', HEAL);
  const plain = planSpecialEnergyTriggers(heal, { trigger: 'attach', fromZone: 'hand', host: { name: 'Pikachu', instanceId: 1 } });
  assert.ok(plain.length > 0);
  const onEx = planSpecialEnergyTriggers(heal, { trigger: 'attach', fromZone: 'hand', host: { name: 'Mightyena ex', subtypes: ['ex'], instanceId: 1 } });
  assert.deepEqual(onEx, []);
});
