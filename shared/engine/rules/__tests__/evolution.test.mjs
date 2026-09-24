import test from 'node:test';
    import assert from 'node:assert/strict';
    
    const { rulesState, startGame, beginTurn } = await import('../rules-state.mjs');
    const { canEvolve, canPlayPokemonFromHand, isRareCandyJump, markEvolvedThisTurn, normalizeStage, cleanPokemonName, pokemonNamesMatch, isModernMegaCard, isLegacyMegaOrPrimalCard, hasMatchingSpiritLink, requiresTurnEndOnEvolve } = await import('../evolution.mjs');
    const { matchesSearch } = await import('../search-match.mjs');
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
      assert.equal(normalizeStage('BREAK'), 'BREAK');
      assert.equal(normalizeStage('Break'), 'BREAK');
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

    test('canPlayPokemonFromHand blocks Restored, BREAK and V-UNION Pokémon', async () => {
      rulesState.enabled = true;
      const restored = await canPlayPokemonFromHand({ name: 'Kabuto', stage: 'Restored' });
      assert.equal(restored.allowed, false);
      assert.ok(restored.reason.includes('Restored'));

      const breakCard = await canPlayPokemonFromHand({ name: 'Snorlax BREAK', stage: 'BREAK' });
      assert.equal(breakCard.allowed, false);
      assert.ok(breakCard.reason.includes('BREAK'));

      const vunion = await canPlayPokemonFromHand({ name: 'Mewtwo V-UNION', stage: 'V-UNION' });
      assert.equal(vunion.allowed, false);
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
    
    test('ability parser: Last Ditch Catch (Meowth) targets Supporter, not Pokémon', () => {
      const steps = parseAbility(
        'When you play this Pokémon from your hand to your Bench, you may search your deck for a Supporter card, reveal it, and put it into your hand. Then shuffle your deck.'
      );
      const search = steps.find((s) => s.type === 'searchAbility');
      assert.equal(search.what, 'Supporter');
      assert.equal(search.destination, 'hand');
      assert.ok(steps.some((s) => s.type === 'whenPlayedAbility'));
    });

    test('ability parser: Last Ditch Catch (Meowth ex) with onto your Bench destination routes to hand', () => {
      const steps = parseAbility(
        'Once during your turn, when you play this Pokémon from your hand onto your Bench, you may use this Ability. Search your deck for a Supporter card, reveal it, and put it into your hand. Then, shuffle your deck. You can\'t use more than 1 Ability that has "Last-Ditch" in its name each turn.'
      );
      const search = steps.find((s) => s.type === 'searchAbility');
      assert.equal(search.what, 'Supporter');
      assert.equal(search.destination, 'hand');
      assert.ok(steps.some((s) => s.type === 'whenPlayedAbility'));
    });

    test('ability parser: Primarina Enriching Melody is an evolve-triggered full heal of a chosen Pokémon', () => {
      const steps = parseAbility(
        'Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may use this Ability. Heal all damage from 1 of your Pokémon.'
      );
      const heal = steps.find((s) => s.type === 'healAbility');
      assert.equal(heal.all, true);
      assert.equal(heal.target, '1 of your Pokémon');
      const trigger = steps.find((s) => s.type === 'whenPlayedAbility');
      assert.equal(trigger.evolve, true);
      // "evolve" here is the trigger condition, not an activated evolve ability.
      assert.equal(steps.some((s) => s.type === 'evolveAbility'), false);
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

    test('cleanPokemonName and pokemonNamesMatch support EX/ex/GX/V variations while preserving distinct species', () => {
      assert.equal(cleanPokemonName('Charizard ex'), 'charizard');
      assert.equal(cleanPokemonName('Charizard-EX'), 'charizard');
      assert.equal(cleanPokemonName('Charizard EX'), 'charizard');
      // VMAX/VSTAR collapse to V, they are not erased (App. 9/13).
      assert.equal(cleanPokemonName('Mewtwo VSTAR'), 'mewtwov');
      assert.equal(cleanPokemonName('Pikachu VMAX'), 'pikachuv');
      assert.equal(cleanPokemonName('Lapras V'), 'laprasv');
      assert.equal(cleanPokemonName('Lugia GX'), 'lugia');
      // Level is not part of the name (p.21).
      assert.equal(cleanPokemonName('Gengar LV.43'), 'gengar');
      assert.equal(cleanPokemonName('Gengar LV.X'), 'gengar');
      assert.equal(cleanPokemonName('Gengar'), 'gengar');
      assert.equal(cleanPokemonName('Flabébé'), 'flabebe');

      // Preserves words beginning with "ex"
      assert.equal(cleanPokemonName('Exeggcute'), 'exeggcute');
      assert.equal(cleanPokemonName('Exeggutor'), 'exeggutor');
      assert.equal(cleanPokemonName('Excadrill'), 'excadrill');
      assert.equal(cleanPokemonName('Exploud'), 'exploud');

      // pokemonNamesMatch correctly equates variants
      assert.equal(pokemonNamesMatch('Charmeleon', 'Charmeleon ex'), true);
      assert.equal(pokemonNamesMatch('Charmander ex', 'Charmander'), true);
      assert.equal(pokemonNamesMatch('Charizard-EX', 'Charizard ex'), true);
      assert.equal(pokemonNamesMatch('Litten', 'Litten ex'), true);

      // Rejects distinct species
      assert.equal(pokemonNamesMatch('Mew', 'Mewtwo'), false);
      assert.equal(pokemonNamesMatch('Exeggcute', 'Exeggutor'), false);
      assert.equal(pokemonNamesMatch('Pikachu', 'Raichu'), false);
      assert.equal(pokemonNamesMatch('', 'Charizard'), false);
    });

    test('pokemonNamesMatch: V-stages and levels follow the rulebook name rules (gap #17)', () => {
      // A VMAX/VSTAR evolves from a V (App. 9/13): same species, but not the Basic.
      assert.equal(pokemonNamesMatch('Lapras VMAX', 'Lapras V'), true);
      assert.equal(pokemonNamesMatch('Lapras VSTAR', 'Lapras V'), true);
      assert.equal(pokemonNamesMatch('Lapras VMAX', 'Lapras'), false);
      assert.equal(pokemonNamesMatch('Pikachu V', 'Pikachu'), false);

      // Level is not part of the name (p.21).
      assert.equal(pokemonNamesMatch('Gengar', 'Gengar LV.43'), true);
      assert.equal(pokemonNamesMatch('Gengar LV.43', 'Gengar LV.X'), true);
    });

    test('normalizeStage supports EX stage strings and MEGA', () => {
      assert.equal(normalizeStage('Stage 1 ex'), 'Stage 1');
      assert.equal(normalizeStage('Stage 2 ex'), 'Stage 2');
      assert.equal(normalizeStage('Basic ex'), 'Basic');
      assert.equal(normalizeStage('Stage 1 EX'), 'Stage 1');
      assert.equal(normalizeStage('Stage 2 EX'), 'Stage 2');
      assert.equal(normalizeStage('Basic EX'), 'Basic');
      assert.equal(normalizeStage('MEGA'), 'Stage 1');
      assert.equal(normalizeStage('Mega'), 'Stage 1');
    });

    test('canEvolve: Basic ex evolves into normal Stage 1', async () => {
      startGame();
      for (let i = 0; i < 4; i++) beginTurn(i % 2 ? 'opp' : 'self');
      rulesState.enabled = true;
      const base = { stage: 'Basic', name: 'Charmander ex', id: 'b_cex' };
      const evo = { stage: 'Stage 1', name: 'Charmeleon', evolvesFrom: 'Charmander', id: 'e_c' };
      const r = await canEvolve('self', base, evo, false);
      assert.equal(r.allowed, true, r.reason);
    });

    test('canEvolve: normal Basic evolves into Stage 1 ex', async () => {
      startGame();
      for (let i = 0; i < 4; i++) beginTurn(i % 2 ? 'opp' : 'self');
      rulesState.enabled = true;
      const base = { stage: 'Basic', name: 'Charmander', id: 'b_c' };
      const evo = { stage: 'Stage 1 ex', name: 'Charmeleon ex', evolvesFrom: 'Charmander', id: 'e_cex' };
      const r = await canEvolve('self', base, evo, false);
      assert.equal(r.allowed, true, r.reason);
    });

    test('canEvolve: Stage 1 ex evolves into Stage 2 ex', async () => {
      startGame();
      for (let i = 0; i < 4; i++) beginTurn(i % 2 ? 'opp' : 'self');
      rulesState.enabled = true;
      const base = { stage: 'Stage 1 ex', name: 'Charmeleon ex', id: 'b_cmex' };
      const evo = { stage: 'Stage 2 ex', name: 'Charizard ex', evolvesFrom: 'Charmeleon', id: 'e_zex' };
      const r = await canEvolve('self', base, evo, false);
      assert.equal(r.allowed, true, r.reason);
    });

    test('canEvolve: Rare Candy supports Basic ex -> Stage 2 ex', async () => {
      startGame();
      for (let i = 0; i < 4; i++) beginTurn(i % 2 ? 'opp' : 'self');
      rulesState.enabled = true;
      const base = { stage: 'Basic', name: 'Charmander ex', id: 'b_cex' };
      const evo = { stage: 'Stage 2', name: 'Charizard ex', evolvesFrom: 'Charmeleon', id: 'e_zex' };
      const r = await canEvolve('self', base, evo, false, { isRareCandy: true });
      assert.equal(r.allowed, true, r.reason);
    });

    test('canEvolve: Rare Candy supports normal Basic -> Stage 2 where evolvesFrom is Stage 1 ex', async () => {
      startGame();
      for (let i = 0; i < 4; i++) beginTurn(i % 2 ? 'opp' : 'self');
      rulesState.enabled = true;
      const base = { stage: 'Basic', name: 'Charmander', id: 'b_c' };
      const evo = { stage: 'Stage 2', name: 'Charizard', evolvesFrom: 'Charmeleon ex', id: 'e_z' };
      const r = await canEvolve('self', base, evo, false, { isRareCandy: true });
      assert.equal(r.allowed, true, r.reason);
    });

    test('canEvolve: Rare Candy supports normal Basic -> Stage 2 ex', async () => {
      startGame();
      for (let i = 0; i < 4; i++) beginTurn(i % 2 ? 'opp' : 'self');
      rulesState.enabled = true;
      const base = { stage: 'Basic', name: 'Charmander', id: 'b_c' };
      const evo = { stage: 'Stage 2 ex', name: 'Charizard ex', evolvesFrom: 'Charmeleon', id: 'e_zex' };
      const r = await canEvolve('self', base, evo, false, { isRareCandy: true });
      assert.equal(r.allowed, true, r.reason);
    });

    test('canEvolve: rejects mismatching EX evolution', async () => {
      startGame();
      for (let i = 0; i < 4; i++) beginTurn(i % 2 ? 'opp' : 'self');
      rulesState.enabled = true;
      const base = { stage: 'Basic', name: 'Squirtle ex', id: 'b_sex' };
      const evo = { stage: 'Stage 1', name: 'Charmeleon', evolvesFrom: 'Charmander', id: 'e_c' };
      const r = await canEvolve('self', base, evo, false);
      assert.equal(r.allowed, false);
      assert.ok(r.reason.includes('evolves from'));
    });

    test('matchesSearch recognizes EX stage variants in search filters', () => {
      const basicEx = { name: 'Miraidon ex', type: 'Pokémon', hp: 220, stage: 'Basic ex' };
      const stage1Ex = { name: 'Charmeleon ex', type: 'Pokémon', hp: 160, stage: 'Stage 1 ex' };
      const stage2Ex = { name: 'Charizard ex', type: 'Pokémon', hp: 330, stage: 'Stage 2 ex' };

      assert.equal(matchesSearch(basicEx, 'Basic Pokémon'), true);
      assert.equal(matchesSearch(basicEx, 'Stage 1 Pokémon'), false);
      assert.equal(matchesSearch(stage1Ex, 'Stage 1 Pokémon'), true);
      assert.equal(matchesSearch(stage1Ex, 'Stage 2 Pokémon'), false);
      assert.equal(matchesSearch(stage2Ex, 'Stage 2 Pokémon'), true);
      assert.equal(matchesSearch(stage2Ex, 'Stage 1 Pokémon'), false);
    });

    // ── Gen 6 Mega Evolution / Primal Reversion turn-end mechanic ──────────
    test('isLegacyMegaOrPrimalCard: recognizes legacy "M "/"Primal " prefixes', () => {
      assert.equal(isLegacyMegaOrPrimalCard({ name: 'M Groudon-EX' }), true);
      assert.equal(isLegacyMegaOrPrimalCard({ name: 'Primal Groudon EX' }), true);
      assert.equal(isLegacyMegaOrPrimalCard({ name: 'Primal Kyogre EX' }), true);
      assert.equal(isLegacyMegaOrPrimalCard({ name: 'Groudon EX' }), false);
      assert.equal(isLegacyMegaOrPrimalCard({ name: 'Marshtomp' }), false);
    });

    test('isLegacyMegaOrPrimalCard: excludes modern (2025+) "Mega X ex" cards', () => {
      assert.equal(isLegacyMegaOrPrimalCard({ name: 'Mega Gardevoir ex' }), false);
      assert.equal(isLegacyMegaOrPrimalCard({ name: 'Mega Lucario ex', rarity: 'Mega Hyper Rare' }), false);
      assert.equal(isModernMegaCard({ name: 'Mega Gardevoir ex' }), true);
      assert.equal(isModernMegaCard({ name: 'M Gardevoir-EX' }), false);
    });

    test('hasMatchingSpiritLink: matches by base species name, ignores unrelated tools', () => {
      const base = {
        name: 'Groudon EX',
        attachedCards: [{ name: 'Groudon Spirit Link', type: 'Trainer' }],
      };
      assert.equal(hasMatchingSpiritLink(base, 'Primal Groudon EX'), true);
      assert.equal(hasMatchingSpiritLink(base, 'Primal Kyogre EX'), false);
      assert.equal(hasMatchingSpiritLink({ name: 'Groudon EX', attachedCards: [] }, 'Primal Groudon EX'), false);
      assert.equal(
        hasMatchingSpiritLink({ name: 'Kyogre EX', attachedCards: [{ name: 'Muscle Band' }] }, 'Primal Kyogre EX'),
        false
      );
    });

    test('requiresTurnEndOnEvolve: ends turn on legacy Primal Reversion without Spirit Link', () => {
      const base = { name: 'Groudon EX', attachedCards: [] };
      const evo = { name: 'Primal Groudon EX' };
      assert.equal(requiresTurnEndOnEvolve(evo, base), true);
    });

    test('requiresTurnEndOnEvolve: no turn-end when matching Spirit Link is attached', () => {
      const base = {
        name: 'Groudon EX',
        attachedCards: [{ name: 'Groudon Spirit Link' }],
      };
      const evo = { name: 'Primal Groudon EX' };
      assert.equal(requiresTurnEndOnEvolve(evo, base), false);
    });

    test('requiresTurnEndOnEvolve: no turn-end for a normal (non-Mega/Primal) evolution', () => {
      const base = { name: 'Charmander', attachedCards: [] };
      const evo = { name: 'Charmeleon' };
      assert.equal(requiresTurnEndOnEvolve(evo, base), false);
    });

    test('requiresTurnEndOnEvolve: no turn-end for modern (2025+) Mega ex evolution', () => {
      const base = { name: 'Gardevoir ex', attachedCards: [] };
      const evo = { name: 'Mega Gardevoir ex', rarity: 'Mega Hyper Rare' };
      assert.equal(requiresTurnEndOnEvolve(evo, base), false);
    });
    
test('Forest of Vitality: a {G} Pokémon played and evolved this turn can evolve again', async () => {
  startGame();
  for (let i = 0; i < 4; i++) beginTurn(i % 2 ? 'opp' : 'self');
  rulesState.enabled = true;
  rulesState.stadium = {
    user: 'opp',
    card: {
      name: 'Forest of Vitality',
      text: "Each player's {G} Pokémon can evolve into {G} Pokémon during the turn they play those Pokémon, except during their first turn.",
    },
  };
  try {
    const ivysaur = { instanceId: 'iv1', stage: 'Stage 1', name: 'Ivysaur', types: ['Grass'] };
    markEvolvedThisTurn('self', ivysaur);
    const venusaur = { stage: 'Stage 2', name: 'Venusaur', evolvesFrom: 'Ivysaur', types: ['Grass'] };
    assert.equal((await canEvolve('self', ivysaur, venusaur, true)).allowed, true);

    const charmeleon = { instanceId: 'ch1', stage: 'Stage 1', name: 'Charmeleon', types: ['Fire'] };
    markEvolvedThisTurn('self', charmeleon);
    const charizard = { stage: 'Stage 2', name: 'Charizard', evolvesFrom: 'Charmeleon', types: ['Fire'] };
    assert.equal((await canEvolve('self', charmeleon, charizard, false)).allowed, false);
  } finally {
    rulesState.stadium = null;
  }
});
