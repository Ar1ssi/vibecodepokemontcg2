import test from 'node:test';
    import assert from 'node:assert/strict';
    
    const { rulesState, startGame, beginTurn } = await import('../rules-state.mjs');
    const { canEvolve, isRareCandyJump, markEvolvedThisTurn, normalizeStage } = await import('../evolution.mjs');
    const { parseAbility } = await import('../abilities.mjs');
    
    test('no evolving on turn 1', async () => {
      startGame();
      beginTurn('self'); // turn 1
      rulesState.enabled = true;
      const r = await canEvolve('self', { stage: 'Basic', name: 'Gastly' }, { stage: 'Stage 1', name: 'Haunter', evolvesFrom: 'Gastly' }, false);
      assert.equal(r.allowed, false);
      assert.ok(r.reason.includes('first turn'));
    });
    
    test('legal evolution on turn 2+', async () => {
      startGame();
      beginTurn('self');
      beginTurn('opp');
      beginTurn('self'); // turn 3
      rulesState.enabled = true;
      const r = await canEvolve('self', { stage: 'Basic', name: 'Gastly' }, { stage: 'Stage 1', name: 'Haunter', evolvesFrom: 'Gastly' }, false);
      assert.equal(r.allowed, true);
    });
    
    test('no evolving a just-played Pokemon', async () => {
      startGame();
      for (let i = 0; i < 4; i++) beginTurn(i % 2 ? 'opp' : 'self');
      rulesState.enabled = true;
      const r = await canEvolve('self', { stage: 'Basic', name: 'Gastly' }, { stage: 'Stage 1', name: 'Haunter', evolvesFrom: 'Gastly' }, true);
      assert.equal(r.allowed, false);
      assert.ok(r.reason.includes('just played'));
    });
    
    test('evolution chain must match', async () => {
      startGame();
      for (let i = 0; i < 4; i++) beginTurn(i % 2 ? 'opp' : 'self');
      rulesState.enabled = true;
      const r = await canEvolve('self', { stage: 'Basic', name: 'Gastly' }, { stage: 'Stage 1', name: 'Haunter', evolvesFrom: 'Litwick' }, false);
      assert.equal(r.allowed, false);
      assert.ok(r.reason.includes('evolves from'));
    });
    
    test('no skipping stages without rare candy', async () => {
      startGame();
      for (let i = 0; i < 4; i++) beginTurn(i % 2 ? 'opp' : 'self');
      rulesState.enabled = true;
      // Stage 2 onto Basic: rejected either by the evolvesFrom chain check
      // (Gengar evolves from Haunter, not Gastly) or the stage-order check.
      const r = await canEvolve('self', { stage: 'Basic', name: 'Gastly' }, { stage: 'Stage 2', name: 'Gengar', evolvesFrom: 'Haunter' }, false);
      assert.equal(r.allowed, false);
      assert.ok(r.reason.includes('evolves from') || r.reason.includes('Rare Candy'));
    });
    
    test('once per turn per Pokemon', async () => {
      startGame();
      for (let i = 0; i < 4; i++) beginTurn(i % 2 ? 'opp' : 'self');
      rulesState.enabled = true;
      markEvolvedThisTurn('self', 'Gastly');
      const r = await canEvolve('self', { stage: 'Basic', name: 'Gastly' }, { stage: 'Stage 1', name: 'Haunter', evolvesFrom: 'Gastly' }, false);
      assert.equal(r.allowed, false);
      assert.ok(r.reason.includes('Already evolved'));
    });
    
    test('rare candy jump detection', () => {
      assert.equal(isRareCandyJump({ stage: 'Basic' }, { stage: 'Stage 2' }), true);
      assert.equal(isRareCandyJump({ stage: 'Basic' }, { stage: 'Stage 1' }), false);
      assert.equal(isRareCandyJump({ stage: 'Stage 1' }, { stage: 'Stage 2' }), false);
    });
    
    test('TCGdex-style stage strings: Basic -> Stage1 allowed', async () => {
      startGame();
      for (let i = 0; i < 4; i++) beginTurn(i % 2 ? 'opp' : 'self');
      rulesState.enabled = true;
      // TCGdex returns 'Stage1' (no space) — must parse as a next-stage evolution
      const r = await canEvolve('self', { name: 'Gastly' }, { stage: 'Stage1', name: 'Haunter', evolvesFrom: 'Gastly' }, false);
      assert.equal(r.allowed, true, r.reason);
    });
    
    test('TCGdex-style stage strings: Basic -> Stage2 still only via Rare Candy path', async () => {
      startGame();
      for (let i = 0; i < 4; i++) beginTurn(i % 2 ? 'opp' : 'self');
      rulesState.enabled = true;
      const r = await canEvolve('self', { name: 'Gastly' }, { stage: 'Stage2', name: 'Gengar', evolvesFrom: 'Haunter' }, false);
      assert.equal(r.allowed, false);
      assert.ok(r.reason.includes('evolves from') || r.reason.includes('Rare Candy'));
    });
    
    test('normalizeStage canonicalizes variants', () => {
      assert.equal(normalizeStage('Basic'), 'Basic');
      assert.equal(normalizeStage('Stage 1'), 'Stage 1');
      assert.equal(normalizeStage('Stage1'), 'Stage 1');
      assert.equal(normalizeStage('STAGE 2'), 'Stage 2');
      assert.equal(normalizeStage('stage2'), 'Stage 2');
      assert.equal(normalizeStage(null), null);
      assert.equal(normalizeStage(undefined), null);
    });
    
    test('isRareCandyJump with TCGdex-style stage strings', () => {
      assert.equal(isRareCandyJump({ stage: 'Basic' }, { stage: 'Stage2' }), true);
      assert.equal(isRareCandyJump({ stage: 'Basic' }, { stage: 'Stage1' }), false);
    });
    
    test('rules disabled allows all evolution', async () => {
      rulesState.enabled = false;
      const r = await canEvolve('self', { stage: 'Basic', name: 'Gastly' }, { stage: 'Stage 1', name: 'Haunter', evolvesFrom: 'Gastly' }, true);
      assert.equal(r.allowed, true);
    });
    
    // ── abilities ──
    test('ability parser: search', () => {
      const steps = parseAbility('Once during your turn, you may search your deck for a card.');
      assert.ok(steps.length > 0);
      assert.equal(steps[0].type, 'searchAbility');
    });
    
    test('ability parser: draw', () => {
      const steps = parseAbility('Once during your turn, you may draw 2 cards.');
      assert.equal(steps[0].count, 2);
    });
    
    test('ability parser: unknown -> passive', () => {
      const steps = parseAbility("Prevent all effects of your opponent's abilities.");
      assert.equal(steps[0].type, 'passiveAbility');
    });
    