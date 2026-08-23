import test from 'node:test';
    import assert from 'node:assert/strict';
    
    const { rulesState, startGame, beginTurn } = await import('../rules-state.mjs');
    const { prizesForKO, awardPrizes, checkWinConditions, handleKO, resetPrizes } = await import('../ko-flow.mjs');
    const { canRetreat, markRetreated, energiesToDiscardForRetreat } = await import('../retreat.mjs');
    const { applyStatus, canActThroughStatuses, resolveTurnBoundary, parseStatusFromAttackText, resetStatuses } = await import('../status.mjs');
    
    // ── KO / prizes ──
    test('prizesForKO: standard = 1, ex = 2, VMAX = 3', () => {
      assert.equal(prizesForKO({ rarity: 'Common' }), 1);
      assert.equal(prizesForKO({ rarity: 'Double rare', subtypes: ['ex'] }), 2);
      assert.equal(prizesForKO({ subtypes: ['VMAX'] }), 3);
      assert.equal(prizesForKO({ rarity: 'Mega Hyper Rare' }), 2);
    });
    
    test('awardPrizes counts to 6 and triggers win', () => {
      resetPrizes();
      let r = awardPrizes('self', 2);
      assert.equal(r.total, 2);
      r = awardPrizes('self', 2);
      assert.equal(r.total, 4);
      assert.equal(r.won, false);
      r = awardPrizes('self', 2);
      assert.equal(r.won, true);
      assert.equal(r.remaining, 0);
    });
    
    test('handleKO packages prize info', () => {
      resetPrizes();
      const r = handleKO({ attackerPlayer: 'self', defender: { rarity: 'Double rare', subtypes: ['ex'] } });
      assert.equal(r.prizeCount, 2);
      assert.equal(r.prizesTaken, 2);
      assert.equal(r.prizesRemaining, 4);
    });
    
    test('checkWinConditions: deck-out loses', () => {
      const r = checkWinConditions({ activeCounts: { self: { active: 1, bench: 2 }, opp: { active: 1, bench: 2 } }, deckCounts: { self: 0, opp: 30 }, turnPlayer: 'self' });
      assert.equal(r.over, true);
      assert.equal(r.winner, 'opp');
      assert.equal(r.reason, 'deck-out');
    });
    
    test('checkWinConditions: no pokemon loses', () => {
      const r = checkWinConditions({ activeCounts: { self: { active: 0, bench: 0 }, opp: { active: 1, bench: 0 } }, deckCounts: { self: 10, opp: 10 }, turnPlayer: 'self' });
      assert.equal(r.over, true);
      assert.equal(r.winner, 'opp');
    });
    
    // ── retreat ──
    test('retreat blocked after attacking', () => {
      startGame();
      beginTurn('self');
      rulesState.enabled = true;
      rulesState.flags.self.attackerAttacked = true;
      const r = canRetreat('self', { retreatCost: 1 }, ['Water']);
      assert.equal(r.allowed, false);
    });
    
    test('retreat once per turn', () => {
      startGame();
      beginTurn('self');
      rulesState.enabled = true;
      rulesState.flags.self.attackerAttacked = false;
      rulesState.flags.self.retreatedThisTurn = false;
      assert.equal(canRetreat('self', { retreatCost: 1 }, ['Water']).allowed, true);
      markRetreated('self');
      assert.equal(canRetreat('self', { retreatCost: 1 }, ['Water']).allowed, false);
    });
    
    test('retreat needs energy payment', () => {
      startGame();
      beginTurn('self');
      rulesState.enabled = true;
      rulesState.flags.self.attackerAttacked = false;
      rulesState.flags.self.retreatedThisTurn = false;
      const r = canRetreat('self', { retreatCost: 2 }, ['Water']);
      assert.equal(r.allowed, false);
      assert.ok(r.reason.includes('energy'));
    });
    
    // ── statuses ──
    test('paralyzed blocks attacking; asleep coin flip', () => {
      resetStatuses();
      applyStatus('self', 'card1', 'paralyzed');
      assert.equal(canActThroughStatuses('self', 'card1').can, false);
      // asleep with fixed rng: 0.9 -> stays asleep
      applyStatus('self', 'card2', 'asleep');
      const r = canActThroughStatuses('self', 'card2', () => 0.9);
      assert.equal(r.can, false);
    });
    
    test('poison does 10 at turn boundary; burn 20', () => {
      resetStatuses();
      applyStatus('self', 'c1', 'poisoned');
      const r1 = resolveTurnBoundary('self', 'c1');
      assert.equal(r1.damage, 10);
      applyStatus('self', 'c2', 'burned');
      const r2 = resolveTurnBoundary('self', 'c2', () => 0.9); // flip fails
      assert.equal(r2.damage, 20);
    });
    
    test('burn heals on heads', () => {
      resetStatuses();
      applyStatus('self', 'c1', 'burned');
      const r = resolveTurnBoundary('self', 'c1', () => 0.1); // flip succeeds
      assert.equal(r.damage, 0);
      assert.ok(r.notes.some(n => n.includes('healed')));
    });
    
    test('parseStatusFromAttackText finds keywords', () => {
      const found = parseStatusFromAttackText('The Defending Pokémon is now Asleep and Poisoned.');
      assert.deepEqual(found.sort(), ['asleep', 'poisoned']);
    });
    
    // ── energy typing (mirror of the bridge's NAME_TO_TYPE) ──
    test('energy name mapping covers all basic types', () => {
      const NAME_TO_TYPE = {
        'grass energy': 'Grass', 'fire energy': 'Fire', 'water energy': 'Water',
        'lightning energy': 'Lightning', 'psychic energy': 'Psychic',
        'fighting energy': 'Fighting', 'darkness energy': 'Darkness',
        'metal energy': 'Metal', 'dragon energy': 'Dragon', 'fairy energy': 'Fairy',
      };
      assert.equal(NAME_TO_TYPE['darkness energy'], 'Darkness');
      assert.equal(Object.keys(NAME_TO_TYPE).length, 10);
    });
    
    