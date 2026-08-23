import test from 'node:test';
    import assert from 'node:assert/strict';
    
    const { rulesState, canPerformAction, startGame, beginTurn, endTurn } = await import('../rules-state.mjs');
    const { computeAttackDamage, canPayAttackCost } = await import('../attack-engine.mjs');
    
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
    