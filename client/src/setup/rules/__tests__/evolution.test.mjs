import test from 'node:test';
    import assert from 'node:assert/strict';
    
    const { rulesState, startGame, beginTurn } = await import('../rules-state.mjs');
    const { canEvolve, canPlayPokemonFromHand, isRareCandyJump, markEvolvedThisTurn, normalizeStage } = await import('../evolution.mjs');
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

    test('canPlayPokemonFromHand blocks Stage 1 and Stage 2', async () => {
      rulesState.enabled = true;
      const s1 = await canPlayPokemonFromHand({ name: 'Haunter', stage: 'Stage 1' });
      assert.equal(s1.allowed, false);
      assert.ok(s1.reason.includes('Stage 1'));

      const s2 = await canPlayPokemonFromHand({ name: 'Gengar', stage: 'Stage2' });
      assert.equal(s2.allowed, false);
      assert.ok(s2.reason.includes('Stage 2'));
    });

    test('canPlayPokemonFromHand allows Basic Pokémon', async () => {
      rulesState.enabled = true;
      const basic = await canPlayPokemonFromHand({ name: 'Gastly', stage: 'Basic' });
      assert.equal(basic.allowed, true);
    });

    test('canPlayPokemonFromHand skipped when rules off', async () => {
      rulesState.enabled = false;
      const r = await canPlayPokemonFromHand({ name: 'Haunter', stage: 'Stage 1' });
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
    
    test('ability parser: effect prevention', () => {
      const steps = parseAbility("Prevent all effects of your opponent's abilities.");
      assert.equal(steps[0].type, 'effectPreventAbility');
    });

    test('ability parser: unknown -> passive', () => {
      const steps = parseAbility('A completely novel mechanic.');
      assert.equal(steps[0].type, 'passiveAbility');
    });

    test('ability parser: discard pile to hand (Voraciousness)', () => {
      const steps = parseAbility(
        'Once during your turn, you may put up to 2 Leftovers cards from your discard pile into your hand.'
      );
      assert.equal(steps[0].type, 'recursionFromDiscardAbility');
      assert.equal(steps[0].upTo, 2);
    });

    test('ability parser: checkup damage (Freezing Shroud)', () => {
      const steps = parseAbility(
        'During Pokémon Checkup, put 1 damage counter on each Pokémon that has an Ability (both yours and your opponent\'s), except any Froslass.'
      );
      assert.equal(steps[0].type, 'checkupAbility');
      assert.equal(steps[0].count, 1);
    });

    test('ability parser: attack inheritance (Memory Dive)', () => {
      const steps = parseAbility(
        'Each of your evolved Pokémon can use any attack from its previous Evolutions. (You still need the necessary Energy to use each attack.)'
      );
      assert.equal(steps[0].type, 'attackInheritanceAbility');
    });

    test('ability parser: opponent evolve trigger (Darkest Impulse)', () => {
      const steps = parseAbility(
        'Whenever your opponent plays a Pokémon from their hand to evolve 1 of their Pokémon, put 4 damage counters on that Pokémon.'
      );
      assert.equal(steps[0].type, 'onOpponentEvolveAbility');
      assert.equal(steps[0].count, 4);
    });

    test('ability parser: energy multiplier provides (Wild Growth)', () => {
      const steps = parseAbility(
        'Each Basic {G} Energy attached to all of your Pokémon provides {G}{G} Energy. The effect of Wild Growth doesn\'t stack.'
      );
      assert.equal(steps[0].type, 'energyMultiplierAbility');
    });

    test('ability parser: unlimited energy move (Wash Out)', () => {
      const steps = parseAbility(
        'As often as you like during your turn, you may use this Ability. Move a {W} Energy from 1 of your Benched Pokémon to your Active Pokémon.'
      );
      assert.equal(steps[0].type, 'moveEnergyAbility');
      assert.equal(steps[0].unlimited, true);
    });

    test('ability parser: promotion energy move (Lustrous Assist)', () => {
      const steps = parseAbility(
        'Once during your turn, when your Mega Latias ex moves from your Bench to the Active Spot, you may use this Ability. Move any amount of Energy from your Benched Pokémon to your Active Pokémon.'
      );
      assert.equal(steps[0].type, 'onPromotionAbility');
      assert.equal(steps[0].effect, 'moveEnergy');
    });

    test('ability parser: promotion damage (Tachyon Bits)', () => {
      const steps = parseAbility(
        'Once during your turn, when this Pokémon moves from your Bench to the Active Spot, you may put 2 damage counters on 1 of your opponent\'s Pokémon.'
      );
      assert.equal(steps[0].type, 'onPromotionAbility');
      assert.equal(steps[0].effect, 'damage');
      assert.equal(steps[0].count, 2);
    });

    test('ability parser: asleep status (Calming Light)', () => {
      const steps = parseAbility(
        'Once during your turn, if this Pokémon is in the Active Spot, you may make your opponent\'s Active Pokémon Asleep.'
      );
      assert.equal(steps[0].type, 'statusAbility');
      assert.equal(steps[0].target, 'opponent');
    });

    test('ability parser: full-HP KO prevention (Resolute Heart)', () => {
      const steps = parseAbility(
        'If this Pokémon has full HP and would be Knocked Out by damage from an attack, it is not Knocked Out, and its remaining HP becomes 10.'
      );
      assert.equal(steps[0].type, 'koPreventionAbility');
      assert.equal(steps[0].fullHp, true);
    });

    test('ability parser: gets +HP bonus (Expanding Body)', () => {
      const steps = parseAbility('If this Pokémon has any Special Energy attached, it gets +100 HP.');
      assert.equal(steps[0].type, 'hpBonusAbility');
      assert.equal(steps[0].bonus, 100);
    });

    test('ability parser: active-spot ability suppression (Initialization)', () => {
      const steps = parseAbility(
        'As long as this Pokémon is in the Active Spot, Pokémon with a Rule Box in play (both yours and your opponent\'s) have no Abilities, except for Future Pokémon.'
      );
      assert.equal(steps[0].type, 'effectPreventAbility');
    });

    test('ability parser: first-turn attacks (Debut Performance pattern)', () => {
      const steps = parseAbility('If you go first, this Pokémon can use attacks during your first turn.');
      assert.equal(steps[0].type, 'firstTurnAttackAbility');
    });
    