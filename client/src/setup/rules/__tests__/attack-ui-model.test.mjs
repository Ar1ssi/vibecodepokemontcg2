import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  attachedEnergyUnits,
  costFulfillment,
  damageOutcome,
  damageReadout,
  statusEffectsFor,
} from '../attack-ui-model.mjs';
import { tapRoute } from '../card-focus-routing.mjs';

const fills = (rows) => rows.map((r) => `${r.type}:${r.filled ? 1 : 0}`).join(' ');

describe('attachedEnergyUnits', () => {
  it('one unit per Energy, a double Energy two, a wildcard every type, a dual unit both', () => {
    const units = attachedEnergyUnits([
      'Fire',
      { type: 'Colorless', family: 'double-colorless' },
      { type: 'Colorless', family: 'attach-type' },
      { type: 'Water', family: 'basic', dualType: 'Lightning' },
    ]);
    assert.deepEqual(units.slice(0, 3), [['fire'], ['colorless'], ['colorless']]);
    assert.equal(units[3].length, 10);
    assert.deepEqual(units[4], ['water', 'lightning']);
  });

  it('a Special Energy whose condition fails provides nothing', () => {
    assert.deepEqual(attachedEnergyUnits([{ type: 'Metal', family: 'special', provides: [] }]), []);
  });
});

describe('costFulfillment (CalculateSatisfiedEnergy_Greedy)', () => {
  it('an empty cost is one filled Empty icon', () => {
    assert.deepEqual(costFulfillment([], []), [{ type: 'empty', filled: true }]);
  });

  it('groups the cost by type in first-seen order', () => {
    assert.equal(fills(costFulfillment(['Fire', 'Colorless', 'Fire'], [])), 'fire:0 fire:0 colorless:0');
  });

  it('typed slots take matching Energy first; surplus typed Energy pays Colorless', () => {
    const rows = costFulfillment(['Fire', 'Colorless', 'Colorless'], [['fire'], ['fire'], ['fire']]);
    assert.equal(fills(rows), 'fire:1 colorless:1 colorless:1');
  });

  it('Energy of a type the cost does not name pays Colorless only', () => {
    assert.equal(fills(costFulfillment(['Fire', 'Colorless'], [['water']])), 'fire:0 colorless:1');
  });

  it('a multi-type unit fills one unmet typed slot; leftovers pay Colorless', () => {
    const rows = costFulfillment(['Fire', 'Water', 'Colorless'], [['fire', 'water'], ['fire', 'water'], ['fire', 'water']]);
    assert.equal(fills(rows), 'fire:1 water:1 colorless:1');
  });

  it('nothing attached leaves every icon empty', () => {
    assert.equal(fills(costFulfillment(['Psychic', 'Colorless'], [])), 'psychic:0 colorless:0');
  });

  it('dark and steel spellings map to darkness and metal', () => {
    assert.equal(fills(costFulfillment(['Darkness', 'Metal'], [['darkness']])), 'darkness:1 metal:0');
  });
});

describe('damageOutcome', () => {
  it('reads Weakness, Resistance, bonus and reduction off the breakdown', () => {
    const weak = damageOutcome({ total: 120, multiplier: 2, flat: 0, resistance: 0 }, { unmodifiedBase: 60 });
    assert.equal(weak.hitWeakness, true);
    assert.equal(weak.reduced || weak.bonus, false);
    const reduced = damageOutcome({ total: 30, multiplier: 1, flat: 0, resistance: 0 }, { unmodifiedBase: 60 });
    assert.equal(reduced.reduced, true);
    assert.equal(reduced.reducedAmount, 30);
    const boosted = damageOutcome({ total: 90, multiplier: 1, flat: 0, resistance: 30 }, { unmodifiedBase: 60 });
    assert.equal(boosted.hitResistance, true);
    assert.equal(boosted.bonus, true);
    assert.equal(boosted.boostedAmount, 60);
  });

  it('a prevented hit is blocked, not reduced', () => {
    const o = damageOutcome({ total: 0, multiplier: 1, flat: 0, resistance: 0, prevented: true }, { unmodifiedBase: 60 });
    assert.equal(o.blocked, true);
    assert.equal(o.reduced, false);
  });

  it('no breakdown is no outcome', () => {
    assert.equal(damageOutcome(null, { unmodifiedBase: 10 }), null);
  });
});

describe('damageReadout (SetAttackDamageValue)', () => {
  const outcome = (over) => ({
    finalMin: 60,
    finalMax: 60,
    unmodifiedBase: 60,
    hitWeakness: false,
    weaknessAmount: 1,
    hitResistance: false,
    resistanceAmount: 0,
    reduced: false,
    reducedAmount: 0,
    bonus: false,
    boostedAmount: 0,
    blocked: false,
    flipUntil: false,
    ...over,
  });

  it('no printed damage hides the tab', () => {
    assert.deepEqual(damageReadout('', null), { text: '', tone: 'plain', mod: null, showTab: false });
    assert.equal(damageReadout(null, outcome()).showTab, false);
  });

  it('an unfinished outcome shows the printed label untinted', () => {
    assert.deepEqual(damageReadout('30+', null), { text: '30+', tone: 'plain', mod: null, showTab: true });
  });

  it('Weakness shows the final number in the weakness ink', () => {
    const r = damageReadout('60', outcome({ finalMin: 120, finalMax: 120, hitWeakness: true, weaknessAmount: 2 }));
    assert.equal(r.text, '120');
    assert.equal(r.tone, 'weakness');
    assert.equal(r.mod, null);
  });

  it('Resistance tints red', () => {
    const r = damageReadout('60', outcome({ finalMin: 30, finalMax: 30, hitResistance: true, resistanceAmount: 30 }));
    assert.equal(r.tone, 'resistance');
  });

  it('a reduction shows the debuff arrow, a bonus the buff arrow', () => {
    assert.equal(damageReadout('60', outcome({ finalMin: 40, finalMax: 40, reduced: true, reducedAmount: 20 })).mod, 'debuff');
    assert.equal(damageReadout('60', outcome({ finalMin: 90, finalMax: 90, bonus: true, boostedAmount: 30 })).mod, 'buff');
  });

  it('a "+" attack that scaled up reads as buffed (unmodified base above the printed number)', () => {
    const r = damageReadout('30+', outcome({ finalMin: 90, finalMax: 90, unmodifiedBase: 90 }));
    assert.equal(r.text, '90');
    assert.equal(r.mod, 'buff');
  });

  it('a range prints min-max', () => {
    assert.equal(damageReadout('10×', outcome({ finalMin: 10, finalMax: 40 })).text, '10-40');
  });

  it('flip-until attacks keep their suffix and fold the modifiers in', () => {
    const base = { flipUntil: true, finalMin: 0, finalMax: 0 };
    assert.equal(damageReadout('20×', outcome({ ...base, hitWeakness: true, weaknessAmount: 2 })).text, '40×');
    assert.equal(
      damageReadout('30+', outcome({ ...base, bonus: true, boostedAmount: 10, hitResistance: true, resistanceAmount: 20 })).text,
      '20+'
    );
    assert.equal(damageReadout('30+', outcome({ ...base, blocked: true })).text, '0');
  });
});

describe('statusEffectsFor', () => {
  const card = {
    instanceId: 1,
    attackMarkers: [
      { kind: 'incomingReduce', amount: 30, untilTurn: 5, sourceAttack: 'iron defense' },
      { kind: 'cantRetreat', untilTurn: 5, sourceAttack: 'block' },
      { kind: 'healLock', untilTurn: 2, sourceAttack: 'old' },
    ],
    specialCondition: 'Asleep',
    attachedCards: [{ name: 'Choice Belt', type: 'Trainer', subtypes: ['Pokémon Tool'], text: 'More damage.' }],
  };

  it('splits live markers by polarity, adds conditions and Tools, drops expired markers', () => {
    const { positive, negative } = statusEffectsFor(card, { turnNumber: 4, zoneCards: [card] });
    assert.deepEqual(positive.map((e) => e.title), ['Iron Defense', 'Choice Belt']);
    assert.match(positive[0].text, /30 less damage/);
    assert.deepEqual(negative.map((e) => e.title), ['Block', 'Asleep']);
  });

  it('a benched Pokémon carries no timed attack effects', () => {
    const { positive, negative } = statusEffectsFor(card, { turnNumber: 4, active: false });
    assert.deepEqual(positive.map((e) => e.kind), ['tool']);
    assert.deepEqual(negative.map((e) => e.kind), ['condition']);
  });

  it("a Tool entry carries the Tool's art when the card has one, as CardDescriptionModalOption shows it", () => {
    const withArt = {
      attachedCards: [{ name: 'Choice Belt', subtypes: ['Pokémon Tool'], src: '/cards/belt.png' }],
    };
    assert.equal(statusEffectsFor(withArt, { turnNumber: 1 }).positive[0].src, '/cards/belt.png');
    assert.equal('src' in statusEffectsFor(card, { turnNumber: 4 }).positive.at(-1), false);
  });

  it('a card with nothing on it has no effects', () => {
    assert.deepEqual(statusEffectsFor({}, { turnNumber: 1 }), { positive: [], negative: [] });
    assert.deepEqual(statusEffectsFor(null), { positive: [], negative: [] });
  });
});

describe('tapRoute (PlayerCardOwner.OnCardClicked)', () => {
  const pokemon = { image: {}, name: 'Pikachu', hp: 60, attacks: [{ name: 'Gnaw' }], type: 'Pokémon' };

  it('own Active opens the overlay', () => {
    assert.equal(tapRoute({ zoneId: 'active', cardUser: 'self', card: pokemon }), 'overlay');
  });

  it('own Bench opens the overlay only with a usable action, else the stack view', () => {
    assert.equal(tapRoute({ zoneId: 'bench', cardUser: 'self', card: pokemon, hasUsableAction: true }), 'overlay');
    assert.equal(tapRoute({ zoneId: 'bench', cardUser: 'self', card: pokemon }), 'stack');
  });

  it("the opponent's Active and Bench open the stack view", () => {
    assert.equal(tapRoute({ zoneId: 'active', cardUser: 'opp', card: pokemon }), 'stack');
    assert.equal(tapRoute({ zoneId: 'bench', cardUser: 'opp', card: pokemon, hasUsableAction: true }), 'stack');
  });

  it('other zones, unresolved cards and non-Pokémon do not route', () => {
    assert.equal(tapRoute({ zoneId: 'hand', cardUser: 'self', card: pokemon }), null);
    assert.equal(tapRoute({ zoneId: 'active', cardUser: 'self', card: null }), null);
    assert.equal(tapRoute({ zoneId: 'active', cardUser: 'self', card: { image: {}, name: 'Fire Energy', type: 'Energy' } }), null);
  });
});
