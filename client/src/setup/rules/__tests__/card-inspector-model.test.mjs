import test from 'node:test';
import assert from 'node:assert/strict';

const {
  buildInspectorModel,
  dimLevelFor,
  normalizeRetreatSymbols,
  splitDamageLabel,
  isInspectablePokemon,
  rawAbilityOf,
  bandsForFrame,
} = await import('../card-inspector-model.mjs');

const { listAttacks } = await import(
  '../../../../../shared/engine/rules/attack-window.mjs'
);

const ARCANINE = {
  name: 'Arcanine ex',
  supertype: 'Pokémon',
  type: 'Fire',
  types: ['Fire'],
  hp: 280,
  damage: 20,
  evolvesFrom: 'Growlithe',
  stage: 1,
  retreatCost: ['Colorless', 'Colorless', 'Colorless'],
  weakness: { type: 'Water', value: 2 },
  attacks: [
    {
      name: 'Raging Claws',
      cost: ['Fire', 'Fire'],
      damage: '30+',
      text: 'This attack does 10 more damage for each damage counter on this Pokémon.',
    },
    {
      name: 'Bright Flame',
      cost: ['Fire', 'Fire', 'Fire'],
      damage: 250,
      text: 'Discard 2 Fire Energy from this Pokémon.',
    },
  ],
};

const THREE_FIRE = ['Fire', 'Fire', 'Fire'];
const TWO_FIRE = ['Fire', 'Fire'];
const ONE_GRASS = ['Grass'];

// ── dim rule ───────────────────────────────────────────────────────────────

test('dimLevelFor: any payable attack leaves the card unlit', () => {
  assert.equal(dimLevelFor([{ payable: true }, { payable: false }]), 'none');
  assert.equal(dimLevelFor([{ payable: true }]), 'none');
});

test('dimLevelFor: nothing payable dims the whole card', () => {
  assert.equal(dimLevelFor([{ payable: false }, { payable: false }]), 'full');
});

test('dimLevelFor: no attacks is not a failure (E5)', () => {
  assert.equal(dimLevelFor([]), 'none');
});

test('model: 3 Fire → no dim, both attacks actionable', () => {
  const m = buildInspectorModel(ARCANINE, { energyTypes: THREE_FIRE });
  assert.equal(m.dimLevel, 'none');
  assert.deepEqual(
    m.attacks.map((a) => a.recede),
    [false, false]
  );
});

test('model: 2 Fire → card stays lit, only the unpayable attack recedes (E3)', () => {
  const m = buildInspectorModel(ARCANINE, { energyTypes: TWO_FIRE });
  assert.equal(m.dimLevel, 'none');
  assert.equal(m.attacks[0].payable, true);
  assert.equal(m.attacks[1].payable, false);
  assert.deepEqual(
    m.attacks.map((a) => a.recede),
    [false, true]
  );
});

test('model: wrong type → whole card dims, actions stay live (E2)', () => {
  const m = buildInspectorModel(ARCANINE, { energyTypes: ONE_GRASS });
  assert.equal(m.dimLevel, 'full');
  assert.equal(
    m.interactive,
    true,
    'Retreat/Pass Turn must not be disabled by a dim'
  );
});

// ── payability parity: the panel must never disagree with the engine ────────

test('model payability equals listAttacks payability for every energy mix', () => {
  for (const energyTypes of [
    [],
    ONE_GRASS,
    TWO_FIRE,
    THREE_FIRE,
    ['Fire', 'Water'],
  ]) {
    const m = buildInspectorModel(ARCANINE, { energyTypes });
    const window = listAttacks(ARCANINE, { energyTypes });
    assert.deepEqual(
      m.attacks.map((a) => a.payable),
      window.map((w) => w.payable),
      `mismatch for ${JSON.stringify(energyTypes)}`
    );
  }
});

// ── resolved damage ────────────────────────────────────────────────────────

test('splitDamageLabel: printed string keeps both the number and the + suffix', () => {
  assert.deepEqual(splitDamageLabel('30+'), { base: 30, printed: '30+' });
  assert.deepEqual(splitDamageLabel(250), { base: 250, printed: '250' });
  assert.deepEqual(splitDamageLabel(null), { base: null, printed: null });
  assert.deepEqual(splitDamageLabel(''), { base: null, printed: null });
});

test('model: damage is RESOLVED, not printed — "30+" with 2 counters reads 50', () => {
  const m = buildInspectorModel(ARCANINE, {
    energyTypes: THREE_FIRE,
    damageCtx: { attackerDamage: 2 },
  });
  assert.equal(m.attacks[0].damageLabel, 50);
  assert.equal(m.attacks[0].printedLabel, '30+');
});

test('model: undamaged, "30+" resolves to its base', () => {
  const m = buildInspectorModel(ARCANINE, {
    energyTypes: THREE_FIRE,
    damageCtx: { attackerDamage: 0 },
  });
  assert.equal(m.attacks[0].damageLabel, 30);
});

test('model: a fixed-damage attack is unaffected by damage counters', () => {
  const m = buildInspectorModel(ARCANINE, {
    energyTypes: THREE_FIRE,
    damageCtx: { attackerDamage: 2 },
  });
  assert.equal(m.attacks[1].damageLabel, 250);
});

// ── card shape tolerance ───────────────────────────────────────────────────

test('normalizeRetreatSymbols: server array passes through (O4)', () => {
  assert.deepEqual(normalizeRetreatSymbols(['Fire', 'Colorless']), [
    'Fire',
    'Colorless',
  ]);
});

test('normalizeRetreatSymbols: client count fills Colorless, matching what is charged', () => {
  assert.deepEqual(normalizeRetreatSymbols(2), ['Colorless', 'Colorless']);
  assert.deepEqual(normalizeRetreatSymbols('3'), [
    'Colorless',
    'Colorless',
    'Colorless',
  ]);
});

test('normalizeRetreatSymbols: absent or zero is an empty cost', () => {
  assert.deepEqual(normalizeRetreatSymbols(undefined), []);
  assert.deepEqual(normalizeRetreatSymbols([]), []);
  assert.deepEqual(normalizeRetreatSymbols(0), []);
});

test('model: reads singular weakness from a server-hydrated card', () => {
  const m = buildInspectorModel(ARCANINE, { energyTypes: THREE_FIRE });
  assert.deepEqual(m.weakness, { type: 'Water', value: 2 });
  assert.equal(m.resistance, null);
});

test('model: falls back to the plural weaknesses array (createCard shape)', () => {
  const card = {
    ...ARCANINE,
    weakness: undefined,
    weaknesses: [{ type: 'Water', value: '×2' }],
  };
  const m = buildInspectorModel(card, { energyTypes: THREE_FIRE });
  assert.deepEqual(m.weakness, { type: 'Water', value: 2 });
});

test('model: a string multiplier is normalised to a number', () => {
  const card = { ...ARCANINE, weakness: { type: 'Water', value: '×2' } };
  const m = buildInspectorModel(card, { energyTypes: THREE_FIRE });
  assert.equal(m.weakness.value, 2);
});

// ── which cards get chrome ─────────────────────────────────────────────────

test('isInspectablePokemon: Pokémon yes, Energy and Trainer no (E19)', () => {
  assert.equal(isInspectablePokemon(ARCANINE), true);
  assert.equal(
    isInspectablePokemon({ name: 'Basic Fire Energy', type: 'Energy' }),
    false
  );
  assert.equal(
    isInspectablePokemon({
      name: 'Potion',
      supertype: 'Trainer',
      type: 'Item',
    }),
    false
  );
  assert.equal(
    isInspectablePokemon({ name: 'No HP Pokémon', supertype: 'Pokémon' }),
    false
  );
  assert.equal(isInspectablePokemon(null), false);
});

test('model: a non-Pokémon degrades to a plain scan with no chrome', () => {
  const m = buildInspectorModel(
    { name: 'Basic Grass Energy', type: 'Energy' },
    {}
  );
  assert.equal(m.kind, 'plain');
  assert.deepEqual(m.attacks, []);
  assert.equal(m.dimLevel, 'none');
});

test('model: dual type reports types[0] but keeps the full list', () => {
  const card = { ...ARCANINE, types: ['Fire', 'Dragon'] };
  const m = buildInspectorModel(card, { energyTypes: THREE_FIRE });
  assert.equal(m.type, 'Fire');
  assert.deepEqual(m.types, ['Fire', 'Dragon']);
});

// ── geometry ───────────────────────────────────────────────────────────────

test('model: no attacks yields a null band rather than throwing (E5)', () => {
  const card = { ...ARCANINE, attacks: [] };
  const m = buildInspectorModel(card, { energyTypes: THREE_FIRE });
  assert.equal(m.kind, 'pokemon');
  assert.equal(m.bandTopPct, null);
  assert.equal(m.bandHeightPct, null);
  assert.equal(m.dimLevel, 'none');
});

test('model: an ability pushes the attack band down', () => {
  const without = buildInspectorModel(ARCANINE, { energyTypes: THREE_FIRE });
  const withAbility = buildInspectorModel(
    { ...ARCANINE, ability: { name: 'Tera', text: 'Rule box.' } },
    { energyTypes: THREE_FIRE }
  );
  assert.ok(withAbility.bandTopPct > without.bandTopPct);
});

test('bandsForFrame: an unmapped frame falls back to the default, not a crash (E16)', () => {
  assert.equal(
    bandsForFrame('no-such-frame').footH,
    bandsForFrame('default').footH
  );
  assert.equal(bandsForFrame().footH, bandsForFrame('default').footH);
});

// ── read-only and rules-off ────────────────────────────────────────────────

test('model: opponent card is read-only — never dimmed, never actionable (E7)', () => {
  const m = buildInspectorModel(ARCANINE, { energyTypes: [], readOnly: true });
  assert.equal(m.dimLevel, 'none');
  assert.equal(m.interactive, false);
  assert.deepEqual(
    m.attacks.map((a) => a.recede),
    [false, false]
  );
});

test('model: rules off keeps the facts but drops the actions (E18)', () => {
  const m = buildInspectorModel(ARCANINE, {
    energyTypes: THREE_FIRE,
    rulesEnabled: false,
  });
  assert.equal(m.interactive, false);
  assert.equal(m.hp, 280);
  assert.equal(m.attacks.length, 2);
});

test('model: a once-per-turn attack already used recedes without dimming the card', () => {
  const card = {
    ...ARCANINE,
    attacks: [
      {
        name: 'Once',
        cost: ['Fire'],
        damage: 10,
        text: 'Once during your turn, you may do this.',
      },
      ARCANINE.attacks[0],
    ],
  };
  const m = buildInspectorModel(card, {
    energyTypes: THREE_FIRE,
    abilityUsed: true,
    damageCtx: { attackerDamage: 0 },
  });
  assert.equal(m.attacks[0].onceUsed, true);
  assert.equal(m.attacks[0].recede, true);
  assert.equal(
    m.dimLevel,
    'none',
    'a spent once-per-turn attack is not an energy problem'
  );
});

test('model: live HP is max HP with damage reported separately (O5)', () => {
  const m = buildInspectorModel(ARCANINE, { energyTypes: THREE_FIRE });
  assert.equal(m.hp, 280);
  assert.equal(m.damage, 20);
});

test('model: a card with no damage field reports 0, never undefined', () => {
  const m = buildInspectorModel(
    { ...ARCANINE, damage: undefined },
    { energyTypes: THREE_FIRE }
  );
  assert.equal(m.damage, 0);
});

// ── abilities ──────────────────────────────────────────────────────────────

// Charmander from PFL 011/094 — one ability, one attack, no resistance. The reported bug was
// that its "Agile" ability never appeared in the inspector at all.
const CHARMANDER = {
  name: 'Charmander',
  supertype: 'Pokémon',
  type: 'Fire',
  types: ['Fire'],
  hp: 80,
  stage: 'Basic',
  ability: {
    name: 'Agile',
    text: 'If this Pokémon has no Energy attached, it has no Weakness.',
  },
  attacks: [{ name: 'Live Coal', cost: ['Fire'], damage: 20, text: '' }],
  weakness: { type: 'Water', value: 2 },
  retreatCost: ['Colorless', 'Colorless'],
};

test('rawAbilityOf: reads singular ability (client enrichment)', () => {
  assert.equal(rawAbilityOf(CHARMANDER).name, 'Agile');
});

test('rawAbilityOf: reads plural abilities (server hydration)', () => {
  const card = {
    name: 'Charmander',
    abilities: [
      { name: 'Agile', text: 'If this Pokémon has no Energy attached.' },
    ],
  };
  assert.equal(rawAbilityOf(card).name, 'Agile');
});

test('rawAbilityOf: a typed Ability counts', () => {
  const card = {
    abilities: [{ name: 'Tera', text: 'Rule box text.', type: 'Ability' }],
  };
  assert.equal(rawAbilityOf(card).name, 'Tera');
});

test('rawAbilityOf: rule-box text is NOT an ability (Tera ex, Stellar)', () => {
  const card = {
    abilities: [
      {
        name: 'Tera',
        text: 'As long as this Pokémon is on your Bench, prevent all damage.',
        type: 'Tera',
      },
    ],
  };
  assert.equal(rawAbilityOf(card), null);
});

test('rawAbilityOf: an entry with no text is not an ability', () => {
  assert.equal(
    rawAbilityOf({ abilities: [{ name: 'Empty', type: 'Ability' }] }),
    null
  );
  assert.equal(rawAbilityOf(null), null);
});

test('model: the ability is reported with its printed text', () => {
  const m = buildInspectorModel(CHARMANDER, { energyTypes: ['Fire'] });
  assert.equal(m.ability.name, 'Agile');
  assert.equal(m.ability.text, CHARMANDER.ability.text);
  assert.equal(m.ability.usable, true);
});

test('model: no ability leaves the field null rather than an empty object', () => {
  const m = buildInspectorModel(ARCANINE, { energyTypes: THREE_FIRE });
  assert.equal(m.ability, null);
});

test('model: an ability moves the stack up to the ability band', () => {
  const withAbility = buildInspectorModel(CHARMANDER, {
    energyTypes: ['Fire'],
  });
  const without = buildInspectorModel(
    { ...CHARMANDER, ability: undefined },
    { energyTypes: ['Fire'] }
  );
  // The ability band prints ABOVE the attacks, so the stack anchor is higher (smaller pct)
  // than the attack band, and the attack band itself shifts down to make room.
  assert.ok(withAbility.blockTopPct < withAbility.bandTopPct);
  assert.equal(without.blockTopPct, without.bandTopPct);
  assert.ok(withAbility.bandTopPct > without.bandTopPct);
});

test('model: blockTopPct falls back to the attack band with no ability', () => {
  const m = buildInspectorModel(ARCANINE, { energyTypes: THREE_FIRE });
  assert.equal(m.blockTopPct, m.bandTopPct);
});

test('model: an ability-only card still gets a stack', () => {
  const card = { ...CHARMANDER, attacks: [] };
  const m = buildInspectorModel(card, { energyTypes: [] });
  assert.equal(m.ability.name, 'Agile');
  assert.notEqual(m.blockTopPct, null);
  assert.deepEqual(m.attacks, []);
});

test('model: a spent once-per-turn ability recedes but stays readable', () => {
  const card = {
    ...CHARMANDER,
    ability: { name: 'Ember', text: 'Once during your turn, you may do this.' },
  };
  const fresh = buildInspectorModel(card, { energyTypes: ['Fire'] });
  assert.equal(fresh.ability.usable, true);
  assert.equal(fresh.ability.recede, false);

  const spent = buildInspectorModel(card, {
    energyTypes: ['Fire'],
    abilityUsed: true,
  });
  assert.equal(spent.ability.usable, false);
  assert.equal(spent.ability.recede, true);
  assert.match(spent.ability.reason, /once per turn/i);
});

test('model: an ability does not affect the attack dim', () => {
  const card = {
    ...CHARMANDER,
    ability: { name: 'Ember', text: 'Once during your turn, you may do this.' },
  };
  const spent = buildInspectorModel(card, {
    energyTypes: [],
    abilityUsed: true,
  });
  // No payable attack, so the card dims — a spent ability is not what drives it.
  assert.equal(spent.dimLevel, 'full');
});

test('model: an opponent card shows the ability but never fires it (E7)', () => {
  const m = buildInspectorModel(CHARMANDER, {
    energyTypes: ['Fire'],
    readOnly: true,
  });
  assert.equal(m.ability.name, 'Agile');
  assert.equal(m.ability.usable, false);
  assert.equal(
    m.ability.recede,
    false,
    'read-only is not "unpayable" — nothing recedes'
  );
});

test('model: rules off keeps the ability text but drops the action (E18)', () => {
  const m = buildInspectorModel(CHARMANDER, {
    energyTypes: ['Fire'],
    rulesEnabled: false,
  });
  assert.equal(m.ability.text, CHARMANDER.ability.text);
  assert.equal(m.ability.usable, false);
});

// ── bench ──────────────────────────────────────────────────────────────────

test('model: a benched Pokémon cannot attack, but the card does not dim', () => {
  const m = buildInspectorModel(CHARMANDER, {
    energyTypes: ['Fire'],
    zone: 'bench',
  });
  assert.equal(m.attackable, false);
  assert.equal(m.attacks[0].usable, false);
  // The reason is positional, not an energy shortage — so nothing recedes and the card stays lit.
  assert.equal(m.attacks[0].recede, false);
  assert.equal(m.dimLevel, 'none');
  assert.match(m.attacks[0].reason, /benched/i);
});

test('model: a benched Pokémon with no energy still does not dim', () => {
  const m = buildInspectorModel(ARCANINE, { energyTypes: [], zone: 'bench' });
  assert.equal(m.dimLevel, 'none');
  assert.equal(m.attacks[0].payable, false);
});

// Cross-layer regression: passiveCostDiscount used to return 1 for ANY ability text mentioning
// "cost" or "Energy", so Agile ("If this Pokémon has no Energy attached, it has no Weakness") read
// as a -1 cost reduction and made Live Coal ({R}) payable with zero Energy. The panel is faithful
// to the engine by design, so it showed the wrong thing until the rules layer was fixed — this
// asserts the whole path, not just the parser.
test('Agile no longer discounts attacks (fixed in the rules layer)', () => {
  const m = buildInspectorModel(CHARMANDER, { energyTypes: [] });
  assert.equal(
    m.attacks[0].payable,
    false,
    'Live Coal ({R}) needs a Fire Energy'
  );
  assert.equal(m.dimLevel, 'full');
});

test('model: a card without an ability behaves the same as one with an inert ability', () => {
  const m = buildInspectorModel(ARCANINE, { energyTypes: [] });
  assert.equal(m.attacks[0].payable, false);
  assert.equal(m.dimLevel, 'full');
});

test('model: an ability IS usable from the bench', () => {
  const m = buildInspectorModel(CHARMANDER, {
    energyTypes: ['Fire'],
    zone: 'bench',
  });
  assert.equal(m.ability.usable, true);
});

test('model: zone defaults to active', () => {
  assert.equal(buildInspectorModel(CHARMANDER, {}).zone, 'active');
  assert.equal(buildInspectorModel(CHARMANDER, {}).attackable, true);
});
