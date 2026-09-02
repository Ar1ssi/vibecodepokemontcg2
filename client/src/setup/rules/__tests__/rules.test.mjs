import test from 'node:test';
    import assert from 'node:assert/strict';
    
    const { rulesState, canPerformAction, startGame, beginTurn, endTurn, markAttacked } = await import('../rules-state.mjs');
    const { computeAttackDamage, canPayAttackCost, expandEnergyEntries } = await import('../attack-engine.mjs');
const { classifyEnergyEffect } = await import('../energy-effects.mjs');
    
    test('weakness doubles damage', () => {
      const result = computeAttackDamage({ types: ['Water'] }, { weakness: { type: 'Water', value: 2 } }, { damage: 60 });
      assert.equal(result.total, 120);
    });
    
    test('resistance reduces damage', () => {
      const result = computeAttackDamage({ types: ['Fire'] }, { resistance: { type: 'Fire', value: -30 } }, { damage: 90 });
      assert.equal(result.total, 60);
    });
    
    test('weakness multiplier no match = base damage', () => {
      const result = computeAttackDamage({ types: ['Grass'] }, { weakness: { type: 'Fire', value: 2 }, resistance: null }, { damage: 50 });
      assert.equal(result.total, 50);
    });
    
    test('damage floors at 0', () => {
      const result = computeAttackDamage({ types: ['Water'] }, { resistance: { type: 'Water', value: -60 } }, { damage: 30 });
      assert.equal(result.total, 0);
    });
    
    test('legacy flat weakness (+20) applies when value < 2', () => {
      const result = computeAttackDamage({ types: ['Psychic'] }, { weakness: { type: 'Psychic', value: 20 } }, { damage: 40 });
      assert.equal(result.total, 60);
    });
    
    test('energy cost: exact match', () => {
      assert.equal(canPayAttackCost(['Water', 'Water'], ['Water', 'Water']), true);
      assert.equal(canPayAttackCost(['Water', 'Fire'], ['Water', 'Water']), false);
    });
    
    test('energy cost: colorless flexibility', () => {
      assert.equal(canPayAttackCost(['Fire'], ['Colorless']), true);
      assert.equal(canPayAttackCost([], ['Colorless']), false);
      assert.equal(canPayAttackCost(['Fire', 'Water'], ['Water', 'Colorless']), true);
    });
    
    test('turn flow alternates players', () => {
      startGame();
      assert.equal(rulesState.phase, 'draw');
      beginTurn('self');
      assert.equal(rulesState.turnPlayer, 'self');
      assert.equal(rulesState.phase, 'main');
      const next = endTurn('self');
      assert.equal(next, 'opp');
      assert.equal(rulesState.turnPlayer, 'opp');
    });
    
    test('gating: viewDeck denied in rules mode', () => {
      rulesState.enabled = true;
      rulesState.phase = 'main';
      rulesState.turnPlayer = 'self';
      assert.equal(canPerformAction({ user: 'self', action: 'viewDeck' }).allowed, false);
    });
    
    test('gating: moveCard denied when not your turn', () => {
      rulesState.enabled = true;
      rulesState.phase = 'main';
      rulesState.turnPlayer = 'self';
      assert.equal(canPerformAction({ user: 'opp', action: 'moveCard' }).allowed, false);
    });
    
    test('gating: energy once per turn', () => {
      rulesState.enabled = true;
      rulesState.phase = 'main';
      rulesState.turnPlayer = 'self';
      rulesState.flags.self.energyAttached = false;
      assert.equal(canPerformAction({ user: 'self', action: 'attachEnergy' }).allowed, true);
      rulesState.flags.self.energyAttached = true;
      assert.equal(canPerformAction({ user: 'self', action: 'attachEnergy' }).allowed, false);
    });
    
    test('gating: disabled rules allow everything', () => {
      rulesState.enabled = false;
      assert.equal(canPerformAction({ user: 'opp', action: 'moveCard' }).allowed, true);
    });
    
    test('gating: no attacking on turn 1 (modern rule)', () => {
      rulesState.enabled = true;
      rulesState.phase = 'main';
      rulesState.turnPlayer = 'self';
      rulesState.turnNumber = 1;
      rulesState.flags.self.attackerAttacked = false;
      const check = canPerformAction({ user: 'self', action: 'attack' });
      assert.equal(check.allowed, false);
      assert.ok(check.reason.includes("turn 1"));
    
      // turn 2+ is fine
      rulesState.turnNumber = 2;
      const check2 = canPerformAction({ user: 'self', action: 'attack' });
      assert.equal(check2.allowed, true);
    });

    test('loadRulesEnabled: ON by default when no preference is stored', async () => {
      const { loadRulesEnabled, RULES_STORAGE_KEY } = await import('../rules-state.mjs');
      const storage = {};
      const previous = globalThis.localStorage;
      globalThis.localStorage = {
        getItem: (k) => (k in storage ? storage[k] : null),
        setItem: (k, v) => {
          storage[k] = String(v);
        },
        removeItem: (k) => {
          delete storage[k];
        },
      };
      try {
        // missing key (first run) → rules mode ON by default
        assert.equal(loadRulesEnabled(), true);
        // explicit solo "off" preference is respected
        storage[RULES_STORAGE_KEY] = '0';
        assert.equal(loadRulesEnabled(), false);
        // explicit "on" stays on
        storage[RULES_STORAGE_KEY] = '1';
        assert.equal(loadRulesEnabled(), true);
      } finally {
        if (previous === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previous;
      }
    });

    test('attacking ends the turn: markAttacked sets phase to attack', () => {
      rulesState.enabled = true;
      rulesState.phase = 'main';
      rulesState.turnPlayer = 'self';
      rulesState.flags.self.attackerAttacked = false;
      markAttacked('self');
      assert.equal(rulesState.phase, 'attack');
      assert.equal(rulesState.flags.self.attackerAttacked, true);
    });

    test('endTurn advances turn, resets next player flags, phase back to main', () => {
      rulesState.enabled = true;
      rulesState.phase = 'attack';
      rulesState.turnPlayer = 'self';
      rulesState.turnNumber = 3;
      rulesState.flags.self.attackerAttacked = true;
      rulesState.flags.opp.attackerAttacked = true;
      const next = endTurn('self');
      assert.equal(next, 'opp');
      assert.equal(rulesState.turnPlayer, 'opp');
      assert.equal(rulesState.turnNumber, 4);
      assert.equal(rulesState.phase, 'main');
      assert.equal(rulesState.flags.opp.attackerAttacked, false);
    });

    test('gating: cannot attack twice in one turn', () => {
      rulesState.enabled = true;
      rulesState.phase = 'main';
      rulesState.turnPlayer = 'self';
      rulesState.turnNumber = 2;
      rulesState.flags.self.attackerAttacked = false;
      assert.equal(canPerformAction({ user: 'self', action: 'attack' }).allowed, true);
      markAttacked('self');
      const check = canPerformAction({ user: 'self', action: 'attack' });
      assert.equal(check.allowed, false);
      assert.ok(check.reason.toLowerCase().includes('attacked'));
    });

    // --- Taxonomy §F: Double / Double Colorless energy cost counting ---

    test('expandEnergyEntries: legacy strings expand 1:1', () => {
      assert.deepEqual(expandEnergyEntries(['Fire']), ['Fire']);
      assert.deepEqual(expandEnergyEntries(['Fire', 'Water', 'Colorless']), ['Fire', 'Water', 'Colorless']);
      assert.deepEqual(expandEnergyEntries([]), []);
    });

    test('expandEnergyEntries: double energy expands to 2 of its type', () => {
      assert.deepEqual(expandEnergyEntries([{ type: 'Fire', family: 'double' }]), ['Fire', 'Fire']);
      assert.deepEqual(expandEnergyEntries([{ type: 'Colorless', family: 'double-colorless' }]), ['Colorless', 'Colorless']);
    });

    test('expandEnergyEntries: mixed arrays', () => {
      const out = expandEnergyEntries(['Water', { type: 'Lightning', family: 'double' }]);
      assert.deepEqual(out, ['Water', 'Lightning', 'Lightning']);
    });

    test('double energy pays 2 of its type', () => {
      assert.equal(canPayAttackCost([{ type: 'Fire', family: 'double' }], ['Fire', 'Fire']), true);
      assert.equal(canPayAttackCost([{ type: 'Fire', family: 'basic' }], ['Fire', 'Fire']), false);
    });

    test('double energy can also cover a Colorless symbol', () => {
      assert.equal(canPayAttackCost([{ type: 'Fire', family: 'double' }], ['Fire', 'Colorless']), true);
    });

    test('double energy cannot pay a different type', () => {
      assert.equal(canPayAttackCost([{ type: 'Fire', family: 'double' }], ['Fire', 'Water']), false);
    });

    test('double-colorless energy pays any two symbols', () => {
      assert.equal(canPayAttackCost([{ type: 'Colorless', family: 'double-colorless' }], ['Fire', 'Water']), true);
      assert.equal(canPayAttackCost([{ type: 'Colorless', family: 'double-colorless' }], ['Fire', 'Fire', 'Water']), false);
    });

    test('Colorless cost symbol is a wildcard (legacy strings)', () => {
      assert.equal(canPayAttackCost(['Colorless', 'Colorless'], ['Fire', 'Water']), true);
      assert.equal(canPayAttackCost(['Colorless'], ['Fire']), true);
    });

    test('classifyEnergyEffect feeds the correct family into cost payment', () => {
      const family = classifyEnergyEffect({ name: 'Double Colorless Energy', subtypes: ['Energy', 'Special'] });
      assert.equal(family, 'double-colorless');
      assert.equal(canPayAttackCost([{ type: 'Colorless', family }], ['Grass', 'Metal']), true);
      const dfamily = classifyEnergyEffect({ name: 'Double Fire Energy', subtypes: ['Energy', 'Special'] });
      assert.equal(dfamily, 'double');
      assert.equal(canPayAttackCost([{ type: 'Fire', family: dfamily }], ['Fire', 'Fire']), true);
    });
    