import test from 'node:test';
import assert from 'node:assert/strict';

const {
  parseSpecialEnergyEffects,
  describeSpecialEnergyStep,
  describeSpecialEnergyEffects,
  planSpecialEnergyTriggers,
  isSpecialEnergyCard,
  getSpecialEnergyHpBonus,
  getSpecialEnergyAttackBonus,
  getSpecialEnergyAttackPenalty,
  getSpecialEnergyDamageReduction,
  hasSpecialEnergyFreeRetreat,
  getSpecialEnergyRetreatReduction,
  getSpecialEnergyStatusImmunity,
  hasSpecialEnergyNoWeakness,
  hasSpecialEnergyEffectShield,
  hasSpecialEnergyAbilityShield,
  blocksSpecialEnergyBenchDamage,
} = await import('../special-energy-parse.mjs');
const { computeAttackDamage } = await import('../attack-engine.mjs');
const { effectiveHp } = await import('../stadium-effects.mjs');

const energy = (name, text, extra = {}) => ({ name, subtype: 'Special Energy', text, type: 'Energy', ...extra });
const typesOf = (card) => parseSpecialEnergyEffects(card).steps.map((s) => s.type);

test('isSpecialEnergyCard: distinguishes special from basic energy', () => {
  assert.equal(isSpecialEnergyCard({ name: 'Growing {', subtype: 'Special Energy' }), true);
  assert.equal(isSpecialEnergyCard({ name: 'Double Turbo Energy', subtypes: ['Special'] }), true);
  assert.equal(isSpecialEnergyCard({ name: 'Grass Energy', subtypes: ['Basic'] }), false);
  assert.equal(isSpecialEnergyCard({ name: 'Pikachu' }), false);
  assert.equal(isSpecialEnergyCard(null), false);
});

test('parseSpecialEnergyEffects: simple provision + damage bonus', () => {
  const card = energy(
    'Voltaic {',
    'As long as this card is attached to a Pokémon, it provides {L} Energy. Attacks used by the {L} Pokémon this card is attached to do 20 more damage to your opponent’s Active Pokémon (before applying Weakness and Resistance).'
  );
  const parsed = parseSpecialEnergyEffects(card);
  assert.deepEqual(parsed.provides[0], { type: 'provide', energyTypes: ['Lightning'], count: 1 });
  assert.ok(parsed.steps.some((s) => s.type === 'damageBonus' && s.amount === 20 && s.hostType === 'Lightning'));
});

test('parseSpecialEnergyEffects: HP bonus, free retreat, no weakness', () => {
  assert.deepEqual(typesOf(energy('Growing {', 'As long as this card is attached to a Pokémon, it provides {G} Energy. The {G} Pokémon this card is attached to gets +20 HP.')), ['provide', 'hpBonus']);
  assert.ok(typesOf(energy('Magnetic {', 'provides {M} Energy. The {M} Pokémon this card is attached to has no Retreat Cost.')).includes('freeRetreat'));
  assert.ok(typesOf(energy('Coating {', 'provides {M} Energy. The {M} Pokémon this card is attached to has no Weakness.')).includes('noWeakness'));
});

test('parseSpecialEnergyEffects: status immunity and effect shields', () => {
  assert.ok(typesOf(energy('Bubbly {', 'provides {W} Energy. The {W} Pokémon this card is attached to recovers from all Special Conditions and can’t be affected by any Special Conditions.')).includes('statusImmunity'));
  assert.ok(typesOf(energy('Mist Energy', 'This card provides {C} Energy. Prevent all effects of attacks used by your opponent’s Pokémon done to the Pokémon this card is attached to.')).includes('effectShield'));
  assert.ok(typesOf(energy('Fusion Strike Energy', 'This card can only be attached to a Fusion Strike Pokémon. If this card is attached to anything other than a Fusion Strike Pokémon, discard this card. As long as this card is attached to a Pokémon, it provides every type of Energy but provides only 1 Energy at a time. Prevent all effects of your opponent’s Pokémon’s Abilities done to the Pokémon this card is attached to.')).includes('abilityShield'));
});

test('parseSpecialEnergyEffects: on-attach triggers', () => {
  assert.ok(typesOf(energy('Enriching Energy', 'This card provides {C} Energy. When you attach this card from your hand to a Pokémon, draw 4 cards.')).includes('onAttachDraw'));
  assert.ok(typesOf(energy('Telepathic {', 'provides {P} Energy. When you attach this card from your hand to a {P} Pokémon, search your deck for up to 2 Basic {P} Pokémon and put them onto your Bench. Then, shuffle your deck.')).includes('onAttachSearch'));
  assert.ok(typesOf(energy('Medical Energy', 'This card provides {C} Energy. When you attach this card from your hand to 1 of your Pokémon, heal 30 damage from that Pokémon.')).includes('onAttachHeal'));
  assert.ok(typesOf(energy('Jet Energy', 'provides {C} Energy. When you attach this card from your hand to 1 of your Benched Pokémon, switch that Pokémon with your Active Pokémon.')).includes('onAttachSwitch'));
});

test('parseSpecialEnergyEffects: discard / knockout / prize lifecycles', () => {
  assert.ok(typesOf(energy('Recycle Energy', 'This card provides {C} Energy. If this card is discarded from play, put it into your hand instead of the discard pile.')).includes('onDiscardReturnToHand'));
  assert.ok(typesOf(energy('Boomerang Energy', 'provides {C} Energy. If this card is discarded by an effect of an attack used by the Pokémon this card is attached to, attach this card from your discard pile to that Pokémon after attacking.')).includes('onDiscardReattach'));
  assert.ok(typesOf(energy('Rescue Energy', 'Rescue Energy provides {C} Energy. If the Pokémon this card is attached to is Knocked Out by damage from an attack, put that Pokémon back into your hand.')).includes('onKnockoutReturnToHand'));
  assert.ok(typesOf(energy('Legacy Energy', 'provides every type of Energy but provides only 1 Energy at a time. If the Pokémon this card is attached to is Knocked Out by damage from an attack from your opponent’s Pokémon, that player takes 1 fewer Prize card.')).includes('prizeReduction'));
  assert.ok(typesOf(energy('Gift Energy', 'provides {C} Energy. If the Pokémon this card is attached to is Knocked Out by damage from an attack from your opponent’s Pokémon, draw cards until you have 7 cards in your hand.')).includes('onKnockoutDraw'));
});

test('parseSpecialEnergyEffects: conditional provisions', () => {
  const twin = parseSpecialEnergyEffects(energy('Twin Energy', 'As long as this card is attached to a Pokémon that isn’t a Pokémon V or a Pokémon-GX, it provides {C}{C} Energy. If this card is attached to a Pokémon V or a Pokémon-GX, it provides {C} Energy instead.'));
  assert.equal(twin.provides.length, 2);
  assert.equal(twin.provides[0].count, 2);
  assert.equal(twin.provides[0].condition, 'notVOrGx');
  assert.equal(twin.provides[1].condition, 'isVOrGx');

  const multi = parseSpecialEnergyEffects(energy('Multi Energy', 'Attach Multi Energy to 1 of your Pokémon. While in play, Multi Energy provides every type of Energy but provides only 1 Energy at a time. Multi Energy provides {C} Energy when attached to a Pokémon that already has Special Energy cards attached to it.'));
  assert.ok(multi.provides.some((s) => s.energyTypes.includes('Any')));
  assert.ok(multi.provides.some((s) => s.condition === 'otherSpecial'));
});

test('parseSpecialEnergyEffects: attach restrictions', () => {
  const strike = parseSpecialEnergyEffects(energy('Rapid Strike Energy', 'This card can only be attached to a Rapid Strike Pokémon. If this card is attached to anything other than a Rapid Strike Pokémon, discard this card. As long as this card is attached to a Pokémon, it provides 2 in any combination of {W} Energy and {F} Energy.'));
  assert.deepEqual(strike.steps[0], { type: 'attachRestriction', kind: 'rapidStrike', discardIfNot: true });

  const typed = parseSpecialEnergyEffects(energy('Strong Energy', 'This card can only be attached to {F} Pokémon. This card provides {F} Energy only while this card is attached to a {F} Pokémon. The attacks of the {F} Pokémon this card is attached to do 20 more damage to your opponent’s Active Pokémon.'));
  assert.ok(typed.steps.some((s) => s.type === 'attachRestriction' && s.kind === 'type' && s.hostType === 'Fighting'));
});

test('parseSpecialEnergyEffects: non-energy card yields no steps', () => {
  const parsed = parseSpecialEnergyEffects({ name: 'Pikachu', text: 'Attack.' });
  assert.equal(parsed.steps.length, 0);
  assert.equal(describeSpecialEnergyEffects({ name: 'Pikachu', text: '' }), 'Pikachu: no special effect recognized.');
});

test('describeSpecialEnergyStep: guidance text per step type', () => {
  assert.match(describeSpecialEnergyStep({ type: 'provide', energyTypes: ['Any'], count: 1 }), /every type/);
  assert.match(describeSpecialEnergyStep({ type: 'damageBonus', amount: 20, hostType: 'Lightning' }), /\+20 damage/);
  assert.match(describeSpecialEnergyStep({ type: 'onAttachSearch', what: 'Basic Psychic Pokémon', count: 2, destination: 'bench' }), /search 2 Basic Psychic Pokémon/);
});

// ── execution helpers ─────────────────────────────────────────────────────
function hostWith(typesArr, attachedCards) {
  const img = {};
  const host = { name: 'Host', type: 'Pokémon', stage: 'Basic', types: typesArr, image: img };
  const attached = attachedCards.map((c) => ({ ...c, image: { relative: img } }));
  return { host, zone: [host, ...attached] };
}

test('getSpecialEnergyHpBonus: sums attached +HP modifiers', () => {
  const { host, zone } = hostWith(['Grass'], [energy('Growing {', 'provides {G} Energy. The {G} Pokémon this card is attached to gets +20 HP.')]);
  assert.equal(getSpecialEnergyHpBonus(host, zone), 20);
});

test('effectiveHp: includes special-energy +HP bonus', () => {
  const { host, zone } = hostWith(['Grass'], [energy('Growing {', 'provides {G} Energy. The {G} Pokémon this card is attached to gets +20 HP.')]);
  host.hp = 100;
  assert.equal(effectiveHp(100, 'self', host, zone), 120);
});

test('getSpecialEnergyAttackBonus: host-type gated bonus', () => {
  const { host, zone } = hostWith(['Lightning'], [energy('Voltaic {', 'provides {L} Energy. Attacks used by the {L} Pokémon this card is attached to do 20 more damage to your opponent’s Active Pokémon.')]);
  assert.equal(getSpecialEnergyAttackBonus(host, zone), 20);
  const wrongType = hostWith(['Water'], [energy('Voltaic {', 'provides {L} Energy. Attacks used by the {L} Pokémon this card is attached to do 20 more damage to your opponent’s Active Pokémon.')]);
  assert.equal(getSpecialEnergyAttackBonus(wrongType.host, wrongType.zone), 0);
});

test('getSpecialEnergyAttackPenalty / getSpecialEnergyDamageReduction', () => {
  const turbo = hostWith(['Colorless'], [energy('Double Turbo Energy', 'provides {C}{C} Energy. The attacks of the Pokémon this card is attached to do 20 less damage to your opponent’s Pokémon (before applying Weakness and Resistance).')]);
  assert.equal(getSpecialEnergyAttackPenalty(turbo.host, turbo.zone), 20);

  const metal = hostWith(['Metal'], [energy('Metal Energy', 'Damage done by attacks to the Pokémon that Metal Energy is attached to is reduced by 10 (after applying Weakness and Resistance). Metal Energy provides {M} Energy.')]);
  assert.equal(getSpecialEnergyDamageReduction(metal.host, metal.zone, { afterWR: true }), 10);
});

test('retreat / status / shield helpers', () => {
  const magnetic = hostWith(['Metal'], [energy('Magnetic {', 'provides {M} Energy. The {M} Pokémon this card is attached to has no Retreat Cost.')]);
  assert.equal(hasSpecialEnergyFreeRetreat(magnetic.host, magnetic.zone), true);

  const mystery = hostWith(['Psychic'], [energy('Mystery Energy', 'provides {P} Energy. The Retreat Cost of the Pokémon this card is attached to is {C}{C} less.')]);
  assert.equal(getSpecialEnergyRetreatReduction(mystery.host, mystery.zone), 2);

  const bubbly = hostWith(['Water'], [energy('Bubbly {', 'provides {W} Energy. The {W} Pokémon this card is attached to recovers from all Special Conditions and can’t be affected by any Special Conditions.')]);
  assert.ok(getSpecialEnergyStatusImmunity(bubbly.host, bubbly.zone).includes('Asleep'));

  const coating = hostWith(['Metal'], [energy('Coating {', 'provides {M} Energy. The {M} Pokémon this card is attached to has no Weakness.')]);
  assert.equal(hasSpecialEnergyNoWeakness(coating.host, coating.zone), true);

  const mist = hostWith(['Water'], [energy('Mist Energy', 'provides {C} Energy. Prevent all effects of attacks used by your opponent’s Pokémon done to the Pokémon this card is attached to.')]);
  assert.equal(hasSpecialEnergyEffectShield(mist.host, mist.zone), true);

  const fusion = hostWith(['Fighting'], [energy('Fusion Strike Energy', 'provides every type of Energy. Prevent all effects of your opponent’s Pokémon’s Abilities done to the Pokémon this card is attached to.')]);
  assert.equal(hasSpecialEnergyAbilityShield(fusion.host, fusion.zone), true);

  const shadowy = hostWith(['Dark'], [energy('Shadowy {', 'provides {D} Energy. As long as the {D} Pokémon this card is attached to is on your Bench, prevent all damage done to it by attacks from your opponent’s Pokémon.')]);
  assert.equal(blocksSpecialEnergyBenchDamage(shadowy.host, 'bench', shadowy.zone), true);
  assert.equal(blocksSpecialEnergyBenchDamage(shadowy.host, 'active', shadowy.zone), false);
});

test('planSpecialEnergyTriggers: attach plans per effect', () => {
  const { host, zone } = hostWith(['Psychic'], []);
  const plan = (card, fromZone = 'hand') =>
    planSpecialEnergyTriggers(card, { trigger: 'attach', host, zoneArray: zone, fromZone });

  assert.deepEqual(plan(energy('Enriching Energy', 'provides {C} Energy. When you attach this card from your hand to a Pokémon, draw 4 cards.')), [
    { action: 'draw', count: 4 },
  ]);
  assert.deepEqual(plan(energy('Medical Energy', 'provides {C} Energy. When you attach this card from your hand to 1 of your Pokémon, heal 30 damage from that Pokémon.')), [
    { action: 'heal', amount: 30 },
  ]);
  assert.deepEqual(plan(energy('Rainbow Energy', 'provides {C} Energy. When you attach this card from your hand to 1 of your Pokémon, put 1 damage counter on that Pokémon.')), [
    { action: 'addDamage', count: 1, target: 'host' },
  ]);
  assert.deepEqual(plan(energy('Recover Energy', 'Recover Energy provides {C} Energy. When you attach this card from your hand to 1 of your Pokémon, remove all Special Conditions from that Pokémon.')), [
    { action: 'clearStatus' },
  ]);
  assert.deepEqual(plan(energy('Bounce Energy', 'This card provides {C}{C} Energy. When you play this card from your hand and attach it to 1 of your Pokémon, return a basic Energy card attached to that Pokémon to your hand.')), [
    { action: 'returnBasicEnergy' },
  ]);
  assert.deepEqual(
    plan(
      energy(
        'Retro Energy',
        'This card provides {C} Energy. When you play this card from your hand and attach it to 1 of your Evolved Pokémon, you may remove up to 2 damage counters from that Pokémon and discard the top card from it. (This counts as devolving it.)'
      )
    ),
    [{ action: 'devolve', count: 2 }]
  );

  const search = plan(energy('Telepathic {', 'provides {P} Energy. When you attach this card from your hand to a {P} Pokémon, search your deck for up to 2 Basic {P} Pokémon and put them onto your Bench.'));
  assert.equal(search.length, 1);
  assert.equal(search[0].action, 'search');
  assert.equal(search[0].count, 2);

  // From discard is not an attach trigger.
  assert.deepEqual(plan(energy('Enriching Energy', 'provides {C} Energy. When you attach this card from your hand to a Pokémon, draw 4 cards.'), 'discard'), []);
});

test('planSpecialEnergyTriggers: discard / knockout / evolve / endTurn', () => {
  assert.deepEqual(
    planSpecialEnergyTriggers(energy('Recycle Energy', 'provides {C} Energy. If this card is discarded from play, put it into your hand instead of the discard pile.'), { trigger: 'discard' }),
    [{ action: 'returnToHand' }]
  );
  assert.deepEqual(
    planSpecialEnergyTriggers(energy('Boomerang Energy', 'provides {C} Energy. If this card is discarded by an effect of an attack used by the Pokémon this card is attached to, attach this card from your discard pile to that Pokémon after attacking.'), { trigger: 'discard', attackExecuting: true }),
    [{ action: 'reattach' }]
  );
  // Reattach is an attack-effect trigger: no plan when discarded by a non-attack effect.
  assert.deepEqual(
    planSpecialEnergyTriggers(energy('Boomerang Energy', 'provides {C} Energy. If this card is discarded by an effect of an attack used by the Pokémon this card is attached to, attach this card from your discard pile to that Pokémon after attacking.'), { trigger: 'discard', attackExecuting: false }),
    []
  );

  const { host, zone } = hostWith(['Water'], []);
  assert.deepEqual(
    planSpecialEnergyTriggers(energy('Splash Energy', 'This card provides {W} Energy only while this card is attached to a {W} Pokémon. If the {W} Pokémon this card is attached to is Knocked Out by damage from an opponent’s attack, put that Pokémon into your hand.'), { trigger: 'knockout', host, zoneArray: zone }),
    [{ action: 'returnToHand' }]
  );
  // Wrong host type: gated trigger does not fire.
  const wrong = hostWith(['Fire'], []);
  assert.deepEqual(
    planSpecialEnergyTriggers(energy('Splash Energy', 'This card provides {W} Energy only while this card is attached to a {W} Pokémon. If the {W} Pokémon this card is attached to is Knocked Out by damage from an opponent’s attack, put that Pokémon into your hand.'), { trigger: 'knockout', host: wrong.host, zoneArray: wrong.zone }),
    []
  );
  assert.deepEqual(
    planSpecialEnergyTriggers(energy('Gift Energy', 'provides {C} Energy. If the Pokémon this card is attached to is Knocked Out by damage from an attack from your opponent’s Pokémon, draw cards until you have 7 cards in your hand.'), { trigger: 'knockout' }),
    [{ action: 'drawUntil', until: 7 }]
  );

  assert.deepEqual(
    planSpecialEnergyTriggers(energy('Regenerative Energy', 'provides {C} Energy. Whenever you play a Pokémon from your hand to evolve the Pokémon V this card is attached to, heal 100 damage from that Pokémon.'), { trigger: 'evolve' }),
    [{ action: 'heal', amount: 100 }]
  );

  const darkHost = hostWith(['Dark'], []);
  const fireHost = hostWith(['Fire'], []);
  const legacy = energy('Darkness Energy', 'If the Pokémon Darkness Energy is attached to damages the Defending Pokémon (after applying Weakness and Resistance), the attack does 10 more damage. At the end of every turn, put 1 damage counter on the Pokémon Darkness Energy is attached to, unless it’s {D} or has Dark in its name. Darkness Energy provides {D} Energy.');
  assert.deepEqual(planSpecialEnergyTriggers(legacy, { trigger: 'endTurn', host: fireHost.host, zoneArray: fireHost.zone }), [
    { action: 'addDamage', count: 1, target: 'host' },
  ]);
  assert.deepEqual(planSpecialEnergyTriggers(legacy, { trigger: 'endTurn', host: darkHost.host, zoneArray: darkHost.zone }), []);

  assert.deepEqual(
    planSpecialEnergyTriggers(
      energy(
        'Spiky Energy',
        "As long as this card is attached to a Pokémon, it provides {C} Energy. If the Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your opponent's Pokémon (even if this Pokémon is Knocked Out), put 2 damage counters on the Attacking Pokémon."
      ),
      { trigger: 'damaged' }
    ),
    [{ action: 'addDamage', count: 2, target: 'attacker', against: null }]
  );
});

test('computeAttackDamage: applies special-energy bonus, penalty and reduction', () => {
  const defender = { name: 'Defender', types: ['Colorless'], weakness: null, resistance: null, image: {} };
  const attackerImg = {};
  const attacker = { name: 'Attacker', types: ['Lightning'], image: attackerImg };
  const bonusEnergy = energy('Voltaic {', 'provides {L} Energy. Attacks used by the {L} Pokémon this card is attached to do 20 more damage to your opponent’s Active Pokémon.', { image: { relative: attackerImg } });

  const boosted = computeAttackDamage(attacker, defender, { damage: '50', cost: [] }, {
    attackerZoneCards: [attacker, bonusEnergy],
    defenderZoneCards: [defender],
  });
  assert.equal(boosted.specialEnergyBonus, 20);
  assert.equal(boosted.total, 70);

  const turboEnergy = energy('Double Turbo Energy', 'provides {C}{C} Energy. The attacks of the Pokémon this card is attached to do 20 less damage to your opponent’s Pokémon.', { image: { relative: attackerImg } });
  const penalized = computeAttackDamage(attacker, defender, { damage: '50', cost: [] }, {
    attackerZoneCards: [attacker, turboEnergy],
    defenderZoneCards: [defender],
  });
  assert.equal(penalized.specialEnergyPenalty, 20);
  assert.equal(penalized.total, 30);

  const metalImg = {};
  const metalDefender = { name: 'Metal Defender', types: ['Metal'], weakness: null, resistance: null, image: metalImg };
  const metalEnergy = energy('Metal Energy', 'Damage done by attacks to the Pokémon that Metal Energy is attached to is reduced by 10 (after applying Weakness and Resistance). Metal Energy provides {M} Energy.', { image: { relative: metalImg } });
  const reduced = computeAttackDamage(attacker, metalDefender, { damage: '50', cost: [] }, {
    attackerZoneCards: [attacker],
    defenderZoneCards: [metalDefender, metalEnergy],
  });
  assert.equal(reduced.specialEnergyReduction, 10);
  assert.equal(reduced.total, 40);
});
