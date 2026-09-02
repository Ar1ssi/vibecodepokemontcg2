import test from 'node:test';
    import assert from 'node:assert/strict';
    
    // stub fetch so ensureCardData works deterministically in tests
    globalThis.fetch = async (url) => {
      const id = url.split('/cards/')[1];
      const data = {
        'basic-1': { hp: 70, stage: 'Basic' },
        'stage1-1': { hp: 110, stage: 'Stage 1', evolvesFrom: 'Basicmon' },
        'trainer-1': { stage: null },  // trainer: no hp
      };
      return {
        ok: true,
        json: async () => data[id] || {},
      };
    };
    
    const { evaluateMulligans, handHasBasic, bonusDrawsOwed } = await import('../mulligan.mjs');
    const { rulesState } = await import('../rules-state.mjs');
    
    test('hand with a Basic Pokemon is legal', async () => {
      const ok = await handHasBasic([{ id: 'basic-1' }]);
      assert.equal(ok, true);
    });
    
    test('hand of only Stage 1s requires mulligan', async () => {
      const ok = await handHasBasic([{ id: 'stage1-1' }, { id: 'stage1-1' }]);
      assert.equal(ok, false);
    });
    
    test('trainer-only hand requires mulligan', async () => {
      const ok = await handHasBasic([{ id: 'trainer-1' }]);
      assert.equal(ok, false);
    });
    
    test('evaluateMulligans reports both OK hands', async () => {
      const steps = await evaluateMulligans({ selfHand: [{ id: 'basic-1' }], oppHand: [{ id: 'basic-1' }] });
      assert.equal(steps.length, 1);
      assert.equal(steps[0].mulligan, false);
    });
    
    test('evaluateMulligans flags bad self hand', async () => {
      const steps = await evaluateMulligans({ selfHand: [{ id: 'trainer-1' }], oppHand: [{ id: 'basic-1' }] });
      assert.equal(steps.length, 1);
      assert.equal(steps[0].player, 'self');
      assert.equal(steps[0].mulligan, true);
    });
    
    test('bonus draws: one per opponent mulligan', () => {
      assert.equal(bonusDrawsOwed(0), 0);
      assert.equal(bonusDrawsOwed(2), 2);
    });

    test('mulligansResolved starts false', () => {
      assert.equal(rulesState.mulligansResolved, false);
    });

    test('markMulligansResolved sets flag to true', async () => {
      const { markMulligansResolved } = await import('../rules-state.mjs');
      markMulligansResolved();
      assert.equal(rulesState.mulligansResolved, true);
    });

    test('startGame resets mulligansResolved to false', async () => {
      const { markMulligansResolved, startGame } = await import('../rules-state.mjs');
      markMulligansResolved();
      assert.equal(rulesState.mulligansResolved, true);
      startGame('self');
      assert.equal(rulesState.mulligansResolved, false);
    });
    