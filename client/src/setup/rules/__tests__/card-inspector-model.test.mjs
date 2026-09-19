import test from 'node:test';
import assert from 'node:assert/strict';

const {
  buildInspectorModel,
  dimLevelFor,
  normalizeRetreatSymbols,
  splitDamageLabel,
  isInspectablePokemon,
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
