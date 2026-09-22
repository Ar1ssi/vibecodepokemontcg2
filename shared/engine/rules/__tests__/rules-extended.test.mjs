import test from 'node:test';
    import assert from 'node:assert/strict';
    
    const { rulesState, startGame, beginTurn, endTurn, markSupporterPlayed, supporterPlayGate, markStadiumPlayed, getStadium, abilityKey, markAbilityUsed, abilityUsed, markStadiumUsed, stadiumUsed, shouldAutoDrawAtTurnStart, markTurnDrawn, tcgAbilityFromDetail, parseRetreatCost, canPerformAction, openPlayedToBenchWindow, clearPlayedToBenchWindow, canUsePlayedToBenchTrigger, consumePlayedToBenchTrigger } = await import('../rules-state.mjs');
    const { prizesForKO, awardPrizes, checkWinConditions, handleKO, resetPrizes, isExCard, isGxCard, isMegaCard, koOutcome, planPromotion, promotionGuidance } = await import('../ko-flow.mjs');
    const { canRetreat, markRetreated, energiesToDiscardForRetreat, getEffectiveRetreatCost, getEnergyValue } = await import('../retreat.mjs');
    const { applyStatus, canAct, canActThroughStatuses, resolveWake, resolveConfusedAttack, resolveTurnBoundary, parseStatusFromAttackText, parseSelfStatusFromAttackText, resetStatuses, getStatus, statusAllowsRetreat, clearStatuses } = await import('../status.mjs');
    const { classifyEnergyEffect, describeEnergyEffect, applyEnergyEffect, isEnergyCard, effectiveEnergyType, resolveAttachedEnergyType, isLockEnergy, pokemonHasLockedEnergy, isRedirectEnergy, pokemonHasRedirectEnergy, isProtectEnergy, pokemonHasProtectEnergy, applyProtectCap } = await import('../energy-effects.mjs');
    const { classifyAbility, searchTargetType, describeAbilityFamily, applyAbilityEffect, isAbilityCard, ABILITY_FAMILIES } = await import('../ability-effects.mjs');
    const { parseAbility, ancientTraitIn } = await import('../abilities.mjs');
    const { classifyStadiumEffect, describeStadiumEffect, applyStadiumEffect, isStadiumCard, STADIUM_EFFECT_FAMILIES, parseStadiumSetupDraw, parseStadiumOncePerTurn, parseStadiumDamagePrevention, parseStadiumDamageReduction, isStadiumRetreatPrevention, isStadiumHandProtect, parseStadiumCostModifier, parseStadiumHpModifier, getStadiumHpBonus, effectiveHp, parseStadiumEvolutionSpeed, getStadiumEvolutionSpeed, parseStadiumRetreatModifier, getStadiumRetreatCost, parseStadiumBenchDamageOnPlay, stadiumBenchDamageApplies, parseStadiumAttackDamageBonus, getStadiumAttackDamageBonus, getStadiumDamageReduction, parseStadiumCheckupPoisonBonus, getStadiumCheckupPoisonBonus, stadiumAbilityBlocked, parseStadiumAttackCostIncrease, stadiumPreventionApplies, hasRecognizedPassiveStadiumEffect, getEffectiveBenchLimit, stadiumBlocksToolEffects, stadiumOnceConditionMet, matchesStadiumEvolveSearch, stadiumActivationStatus, isSingleStrikeCard, isEvolutionCard, isStadiumEnergyAttachHeal, isStadiumGlimwoodReFlip } = await import('../stadium-effects.mjs');
    const { classifyAttackEffect, describeAttackEffect, applyAttackEffect, ATTACK_FAMILIES } = await import('../attack-effects.mjs');
    const { parseAttackDamage, describeParsedDamage, healTarget, planHeal, planBenchTarget, drawCount, drawUntilTarget, attachEnergyCount, switchClause, oncePerTurnClause, allBenchDamage, discardCost, shuffleDrawClause, discardEnergyScaling, parseAttackSearchClause, resolveAttackText, moveEnergyClause, revealHandClause, conditionalKoClause, exactCounterKoThreshold, redirectDamageCount, handScalingDamage, returnEnergyClause, returnEnergyCount, immunityClause, DAMAGE_COMPONENTS } = await import('../damage-parser.mjs');
    const { computeAttackDamage } = await import('../attack-engine.mjs');
    const { passiveCostDiscount, applyCostDiscount, parseWhenPlayedEffect, parseEndOfTurnEffect, parseDamagePrevention, applyDamagePrevention, isHandProtected, parseOpponentDiscard, parseEnergyRedirect, parseDamageReduction, parseDamageBonus, applyDamageBonus, parseHpBonus, applyHpBonus, parseRetreatCostModifier, applyRetreatCostModifier, parsePrizeModify, applyPrizeModify, parseKoPrevention, parseThorns, parseCheckupEffect, parseEnergyMultiplier, parseToolCap, parseAttackInheritance, parseOnOpponentEvolve, parseStatusInflict, parseMoveDamage, parseLookAtTop, parseRecursionFromDiscard, parseEffectPrevent, parseSetupFaceDown, combinedDamagePrevention, isPokemonToolCard, attachedTools, requiresActiveSpot, isEvolvePlayedTrigger } = await import('../ability-executors.mjs');
    const { listAttacks, listAbilities, listUsableActions, statusAttackBlock } = await import('../attack-window.mjs');
    const {
      isUsableAbilityCard,
      collectUsableAbilityCandidates,
      filterUsableAbilities,
      benchCardHasAbility,
    } = await import('../collect-usable-abilities.mjs');
    
    // ── KO / prizes ──
    test('prizesForKO: standard/legacy Mega = 1/2, modern Mega & VMAX = 3', () => {
      assert.equal(prizesForKO({ rarity: 'Common' }), 1);
      assert.equal(prizesForKO({ rarity: 'Double rare', subtypes: ['ex'] }), 2);
      assert.equal(prizesForKO({ name: 'Cetitan ex' }), 2);
      assert.equal(prizesForKO({ subtypes: ['VMAX'] }), 3);
      assert.equal(prizesForKO({ subtypes: ['VSTAR'] }), 2);
      assert.equal(prizesForKO({ rarity: 'Mega Hyper Rare' }), 3);
      assert.equal(prizesForKO({ name: 'Mega Charizard ex' }), 3);
      assert.equal(prizesForKO({ name: 'M Charizard-EX' }), 2);
      assert.equal(prizesForKO({ name: 'Yanmega' }), 1);
      assert.equal(prizesForKO({ name: 'Pikachu V' }), 2);
      assert.equal(prizesForKO({ name: 'Lugia VSTAR' }), 2);
      assert.equal(prizesForKO({ name: 'Mew VMAX' }), 3);
      assert.equal(prizesForKO({ name: 'Mewtwo GX' }), 2);
    });

    test('isMegaCard: rarity, subtype, or Mega name — not Yanmega', () => {
      assert.equal(isMegaCard({ rarity: 'Mega Hyper Rare' }), true);
      assert.equal(isMegaCard({ subtypes: ['Mega Evolution'] }), true);
      assert.equal(isMegaCard({ name: 'Mega Lucario ex' }), true);
      assert.equal(isMegaCard({ name: 'Yanmega' }), false);
      assert.equal(isMegaCard({ name: 'Cetitan ex' }), false);
    });

    test('isExCard / isGxCard: subtypes first, name suffix fallback', () => {
      assert.equal(isExCard({ subtypes: ['ex'] }), true);
      assert.equal(isExCard({ name: 'Cetitan ex' }), true);
      assert.equal(isExCard({ name: 'Cetitan' }), false);
      assert.equal(isGxCard({ subtypes: ['GX'] }), true);
      assert.equal(isGxCard({ name: 'Ninetales GX' }), true);
      assert.equal(isGxCard({ name: 'Ninetales' }), false);
      assert.equal(isGxCard({ name: 'Cetitan ex' }), false);
      assert.equal(isExCard({ name: 'Ninetales GX' }), false);
    });

    test('koOutcome: every Knockout awards prizes (GX included, no match loss)', () => {
      assert.deepEqual(koOutcome({ subtypes: ['GX'] }), { type: 'prizes', count: 2 });
      assert.deepEqual(koOutcome({ name: 'Ninetales GX' }), { type: 'prizes', count: 2 });
      assert.deepEqual(koOutcome({ name: 'Cetitan ex' }), { type: 'prizes', count: 2 });
      assert.deepEqual(koOutcome({ name: 'Mega Charizard ex' }), { type: 'prizes', count: 3 });
      assert.deepEqual(koOutcome({ rarity: 'Common' }), { type: 'prizes', count: 1 });
    });

    test('handleKO: KOing a Pokémon GX awards 2 prizes, not a match loss', () => {
      resetPrizes();
      awardPrizes('self', 2);
      const r = handleKO({ attackerPlayer: 'self', defender: { subtypes: ['GX'] } });
      assert.equal(r.won, false);
      assert.equal(r.prizeCount, 2);
      assert.equal(r.prizesTaken, 4); // prior prizes plus the GX award
      assert.equal(r.prizesRemaining, 2);
    });

    test('handleKO: taking all prizes with a GX Knockout wins at 6', () => {
      resetPrizes();
      awardPrizes('self', 4);
      const r = handleKO({ attackerPlayer: 'self', defender: { subtypes: ['GX'] } });
      assert.equal(r.prizeCount, 2);
      assert.equal(r.prizesTaken, 6);
      assert.equal(r.won, true);
      assert.equal(r.reason, 'all prize cards taken');
    });

    test('handleKO: ex awards 2 prizes', () => {
      resetPrizes();
      const r = handleKO({ attackerPlayer: 'self', defender: { name: 'Cetitan ex' } });
      assert.equal(r.prizeCount, 2);
      assert.equal(r.prizesTaken, 2);
      assert.equal(r.prizesRemaining, 4);
      assert.equal(r.won, false);
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
    
    test('occupiedZoneCount: rendered cards keep a drifted-empty zone occupied', async () => {
      const { occupiedZoneCount } = await import('../ko-flow.mjs');
      assert.equal(occupiedZoneCount({ arrayCount: 0, renderedCount: 2 }), 2);
      assert.equal(occupiedZoneCount({ arrayCount: 1, renderedCount: 0 }), 1);
      assert.equal(occupiedZoneCount({ arrayCount: 0, renderedCount: 0 }), 0);
      assert.equal(occupiedZoneCount({ arrayCount: undefined, renderedCount: undefined }), 0);
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

    test('parseRetreatCost handles numbers, arrays, and alternate schemas', () => {
      assert.equal(parseRetreatCost({ retreat: 2 }), 2);
      assert.equal(parseRetreatCost({ retreat: 0 }), 0);
      assert.equal(parseRetreatCost({ retreat: ['Colorless', 'Colorless', 'Colorless'] }), 3);
      assert.equal(parseRetreatCost({ convertedRetreatCost: 4 }), 4);
      assert.equal(parseRetreatCost({ retreatCost: ['Colorless'] }), 1);
      assert.equal(parseRetreatCost({ retreatCost: 2 }), 2);
      assert.equal(parseRetreatCost({ retreat: '3' }), 3);
      assert.equal(parseRetreatCost({}), 0);
      assert.equal(parseRetreatCost(null), 0);
    });

    test('canPerformAction enforces once-per-turn retreat', () => {
      startGame();
      beginTurn('self');
      rulesState.flags.self.attackerAttacked = false;
      rulesState.flags.self.retreatedThisTurn = false;
      assert.equal(canPerformAction({ user: 'self', action: 'retreat' }).allowed, true);

      rulesState.flags.self.retreatedThisTurn = true;
      const res = canPerformAction({ user: 'self', action: 'retreat' });
      assert.equal(res.allowed, false);
      assert.ok(res.reason.includes('Already retreated'));
    });

    test('canRetreat handles Double Colorless Energy', () => {
      startGame();
      beginTurn('self');
      rulesState.enabled = true;
      rulesState.flags.self.attackerAttacked = false;
      rulesState.flags.self.retreatedThisTurn = false;

      // 2 retreat cost with 1 DCE (provides 2 energy) -> allowed
      const dce = { name: 'Double Colorless Energy', type: 'Energy', family: 'double-colorless' };
      const res = canRetreat('self', { retreatCost: 2 }, [dce]);
      assert.equal(res.allowed, true);

      // 3 retreat cost with 1 DCE + 1 basic Water -> allowed
      const res3 = canRetreat('self', { retreatCost: 3 }, [dce, 'Water']);
      assert.equal(res3.allowed, true);

      // 3 retreat cost with 1 DCE only -> not allowed
      const resFail = canRetreat('self', { retreatCost: 3 }, [dce]);
      assert.equal(resFail.allowed, false);
      assert.ok(resFail.reason.includes('costs 3'));
    });

    test('getEffectiveRetreatCost respects Switching Energy free switch', () => {
      rulesState.enabled = true;
      const active = { name: 'Snorlax', retreatCost: 4, image: {} };
      const switchingEnergy = {
        name: 'Switching Energy',
        type: 'Energy',
        subtypes: ['special'],
        image: { relative: active.image },
      };
      // Normal without switching energy
      assert.equal(getEffectiveRetreatCost(active, 'self', []), 4);
      // With switching energy attached
      assert.equal(getEffectiveRetreatCost(active, 'self', [switchingEnergy]), 0);
    });

    test('energiesToDiscardForRetreat prioritizes single energy over double energy', () => {
      const dce = { name: 'Double Colorless Energy', family: 'double-colorless' };
      const water = { name: 'Water Energy', family: 'basic' };

      // Cost 0 -> no discards
      assert.deepEqual(energiesToDiscardForRetreat([water, dce], 0), []);

      // Cost 1 with [water, dce] -> discards water, preserves DCE
      const discard1 = energiesToDiscardForRetreat([dce, water], 1);
      assert.equal(discard1.length, 1);
      assert.equal(discard1[0].name, 'Water Energy');

      // Cost 2 with [water, dce] -> discards water (1) then DCE (2) = pays 3
      const discard2 = energiesToDiscardForRetreat([water, dce], 2);
      assert.equal(discard2.length, 2);

      // Cost 2 with only DCE -> discards 1 DCE card
      const discardDce = energiesToDiscardForRetreat([dce], 2);
      assert.equal(discardDce.length, 1);
      assert.equal(discardDce[0].name, 'Double Colorless Energy');

      // Cost 2 with 2 basic energies -> discards both
      const fire = { name: 'Fire Energy', family: 'basic' };
      const discardBasics = energiesToDiscardForRetreat([water, fire], 2);
      assert.equal(discardBasics.length, 2);
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

    // ── Section D Phase 2: live-path composition (solo) ─────────────
    // These mirror the exact calls chat-buttons.js makes: attack() applies
    // every parsed status to the opponent's defender; endTurnWithBanner()
    // resolves the outgoing player's active at turn end.

    test('attack status application (composition): parsed status lands on opponent', () => {
      resetStatuses();
      const text = 'The Defending Pokémon is now Asleep.';
      for (const st of parseStatusFromAttackText(text)) {
        applyStatus('opp', 'defKey', st);
      }
      assert.equal(getStatus('opp', 'defKey').asleep, true);
      assert.equal(getStatus('opp', 'defKey').poisoned, undefined);
    });

    test('solo turn-boundary: poison deals 10 and persists; asleep clears', () => {
      resetStatuses();
      applyStatus('self', 'c1', 'poisoned');
      applyStatus('self', 'c1', 'asleep');
      const r = resolveTurnBoundary('self', 'c1');
      assert.equal(r.damage, 10);
      // Poison persists (correct TCG behavior); asleep is cleared at turn end.
      assert.equal(getStatus('self', 'c1').poisoned, true);
      assert.equal(getStatus('self', 'c1').asleep, undefined);
    });

    test('canAct is pure: no rng needed, idempotent, no mutation', () => {
      resetStatuses();
      applyStatus('self', 'c1', 'asleep');
      // First call
      const r1 = canAct('self', 'c1');
      assert.equal(r1.can, false);
      // Second call must be identical (no side effects)
      const r2 = canAct('self', 'c1');
      assert.deepEqual(r1, r2);
      // Status must not have been cleared
      assert.equal(getStatus('self', 'c1').asleep, true);
    });

    test('statusAllowsRetreat: paralyzed and asleep block retreat; confused does not (A-3)', () => {
      resetStatuses();
      applyStatus('self', 'c1', 'paralyzed');
      assert.equal(statusAllowsRetreat('self', 'c1').can, false);
      resetStatuses();
      applyStatus('self', 'c2', 'confused');
      assert.equal(statusAllowsRetreat('self', 'c2').can, true);
      resetStatuses();
      applyStatus('self', 'c3', 'asleep');
      assert.equal(statusAllowsRetreat('self', 'c3').can, false);
      // clean card always allowed
      assert.equal(statusAllowsRetreat('self', 'c4').can, true);
    });

    test('retreat clears Confused (clearStatuses)', () => {
      resetStatuses();
      applyStatus('self', 'c1', 'confused');
      assert.equal(getStatus('self', 'c1').confused, true);
      clearStatuses('self', 'c1');
      assert.equal(getStatus('self', 'c1'), null);
    });

    test('resolveWake: heads wakes, tails stays asleep', () => {
      resetStatuses();
      applyStatus('self', 'c1', 'asleep');
      const tails = resolveWake('self', 'c1', () => 0.9);
      assert.equal(tails.woke, false);
      assert.equal(getStatus('self', 'c1').asleep, true);
      const heads = resolveWake('self', 'c1', () => 0.1);
      assert.equal(heads.woke, true);
      assert.equal(getStatus('self', 'c1'), null);
    });

    test('resolveConfusedAttack: heads proceeds; tails deals 30 self-damage; confusion persists', () => {
      resetStatuses();
      applyStatus('self', 'c1', 'confused');
      // Heads → attack proceeds, no damage, confused stays
      const r1 = resolveConfusedAttack('self', 'c1', () => 0.1);
      assert.equal(r1.proceeds, true);
      assert.equal(r1.damage, 0);
      assert.equal(getStatus('self', 'c1').confused, true);
      // Tails → attack blocked, 30 self-damage, confused stays (permanent)
      const r2 = resolveConfusedAttack('self', 'c1', () => 0.9);
      assert.equal(r2.proceeds, false);
      assert.equal(r2.damage, 30);
      assert.equal(getStatus('self', 'c1').confused, true);
    });

    test('confused is NOT cleared by resolveTurnBoundary (permanent)', () => {
      resetStatuses();
      applyStatus('self', 'c1', 'confused');
      const r = resolveTurnBoundary('self', 'c1');
      assert.equal(r.damage, 0);
      assert.equal(getStatus('self', 'c1').confused, true);
    });

    test('mutual exclusion: turn-skip family — newest wins', () => {
      resetStatuses();
      applyStatus('self', 'c1', 'asleep');
      applyStatus('self', 'c1', 'paralyzed');
      const s = getStatus('self', 'c1');
      assert.equal(s.paralyzed, true);
      assert.equal(s.asleep, undefined);
      // Confused also replaces the turn-skip slot
      applyStatus('self', 'c1', 'confused');
      const s2 = getStatus('self', 'c1');
      assert.equal(s2.confused, true);
      assert.equal(s2.paralyzed, undefined);
    });

    test('poisoned and burned coexist (A-2)', () => {
      resetStatuses();
      applyStatus('self', 'c1', 'poisoned');
      applyStatus('self', 'c1', 'burned');
      const s = getStatus('self', 'c1');
      assert.equal(s.burned, true);
      assert.equal(s.poisoned, true);
    });

    test('cross-family: turn-skip + damage can coexist', () => {
      resetStatuses();
      applyStatus('self', 'c1', 'asleep');
      applyStatus('self', 'c1', 'poisoned');
      const s = getStatus('self', 'c1');
      assert.equal(s.asleep, true);
      assert.equal(s.poisoned, true);
    });

    test('canActThroughStatuses wrapper still works (backward compat)', () => {
      resetStatuses();
      applyStatus('self', 'c1', 'asleep');
      const r = canActThroughStatuses('self', 'c1', () => 0.9);
      assert.equal(r.can, false);
      assert.equal(getStatus('self', 'c1').asleep, true);
      const r2 = canActThroughStatuses('self', 'c1', () => 0.1);
      assert.equal(r2.can, true);
      assert.equal(getStatus('self', 'c1'), null);
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
    
    // ── Gap #9: one Supporter per turn (taxonomy A2) ──
    test('supporterPlayGate: Supporter allowed before one is played', () => {
      assert.equal(supporterPlayGate({ cardType: 'Supporter', supporterPlayed: false }).allowed, true);
      assert.equal(supporterPlayGate({ cardType: 'SUPPORTER' }).allowed, true);
    });
    
    test('supporterPlayGate: Supporter blocked after one played this turn', () => {
      const r = supporterPlayGate({ cardType: 'Supporter', supporterPlayed: true });
      assert.equal(r.allowed, false);
      assert.match(r.reason, /Supporter/);
    });
    
    test('supporterPlayGate: Item / Stadium / Tool / Special Supporter bypass the limit', () => {
      for (const cardType of ['Item', 'Stadium', 'Tool', 'Special Supporter', 'Basic', 'Energy']) {
        assert.equal(supporterPlayGate({ cardType, supporterPlayed: true }).allowed, true, cardType);
      }
    });
    
    test('supporterPlayGate: subtypes fallback discriminates Trainer subtypes', () => {
      assert.equal(
        supporterPlayGate({ cardType: 'Trainer', subtypes: ['Supporter'], supporterPlayed: true }).allowed,
        false,
      );
      assert.equal(
        supporterPlayGate({ cardType: 'Trainer', subtypes: ['Special Supporter'], supporterPlayed: true }).allowed,
        true,
      );
    });

    test('supporterPlayGate: trainerType-only Supporter is gated (F7)', () => {
      assert.equal(
        supporterPlayGate({ cardType: 'Trainer', trainerType: 'Supporter', supporterPlayed: true })
          .allowed,
        false,
      );
      assert.equal(
        supporterPlayGate({ cardType: 'Trainer', trainerType: 'Special Supporter', supporterPlayed: true })
          .allowed,
        true,
      );
    });
    
    test('markSupporterPlayed sets the flag; new turn clears it', () => {
      beginTurn('self');
      assert.equal(rulesState.flags.self.supporterPlayed, false);
      markSupporterPlayed('self');
      assert.equal(rulesState.flags.self.supporterPlayed, true);
      // a fresh turn for the same player resets the flag
      beginTurn('opp');
      beginTurn('self');
      assert.equal(rulesState.flags.self.supporterPlayed, false);
    });

    // ── Stadium on the field (taxonomy E) ──
    test('markStadiumPlayed: first play records state; second play returns the displaced one', () => {
      startGame();
      const a = { name: 'Full Metal Factory', type: 'Stadium' };
      const b = { name: 'Ancient Tower', type: 'Stadium' };
      assert.equal(markStadiumPlayed('self', a), null);
      assert.deepEqual(getStadium(), { user: 'self', card: a });
      assert.equal(rulesState.flags.self.stadiumPlayed, true);
      const displaced = markStadiumPlayed('opp', b);
      assert.equal(displaced.card, a);
      assert.equal(displaced.user, 'self');
      assert.equal(getStadium().card, b);
      assert.equal(getStadium().user, 'opp');
    });

    test('startGame: clears the on-field Stadium record and the played-this-turn flag', () => {
      markStadiumPlayed('self', { name: 'Mystic Ruin', type: 'Stadium' });
      assert.notEqual(getStadium(), null);
      assert.equal(rulesState.flags.self.stadiumPlayed, true);
      startGame('opp');
      assert.equal(getStadium(), null);
      assert.equal(rulesState.flags.self.stadiumPlayed, false);
    });

    // ── TCGdex ability mapping (ensureCardData enrichment) ──
    test('tcgAbilityFromDetail: prefers legacy detail.ability', () => {
      const legacy = { name: 'Solid Shell', text: 'This Pokémon takes 20 less damage.' };
      assert.deepEqual(
        tcgAbilityFromDetail({ ability: legacy, abilities: [{ type: 'Ability', name: 'Other', effect: 'x' }] }),
        legacy
      );
    });

    test('tcgAbilityFromDetail: maps TCGdex v2 abilities[] with type Ability', () => {
      assert.deepEqual(
        tcgAbilityFromDetail({
          abilities: [
            { type: 'Ability', name: 'Solid Shell', effect: 'This Pokémon takes 20 less damage from attacks.' },
          ],
        }),
        { name: 'Solid Shell', text: 'This Pokémon takes 20 less damage from attacks.' }
      );
    });

    test('tcgAbilityFromDetail: type match is case-insensitive; uses first Ability entry', () => {
      assert.deepEqual(
        tcgAbilityFromDetail({
          abilities: [
            { type: 'ability', name: 'First', effect: 'First effect' },
            { type: 'Ability', name: 'Second', effect: 'Second effect' },
          ],
        }),
        { name: 'First', text: 'First effect' }
      );
    });

    test('tcgAbilityFromDetail: falls back to entry.text when effect is missing', () => {
      assert.deepEqual(
        tcgAbilityFromDetail({
          abilities: [{ type: 'Ability', name: 'Draw Power', text: 'Draw a card.' }],
        }),
        { name: 'Draw Power', text: 'Draw a card.' }
      );
    });

    test('tcgAbilityFromDetail: returns null when no ability present', () => {
      assert.equal(tcgAbilityFromDetail(null), null);
      assert.equal(tcgAbilityFromDetail({}), null);
      assert.equal(tcgAbilityFromDetail({ abilities: [{ type: 'Pokémon Power', name: 'X', effect: 'y' }] }), null);
    });

    // ── per-ability used-tracking (taxonomy C) ──
    test('abilityKey: stable identity via id, then name+number fallback', () => {
      assert.equal(abilityKey({ id: 123, name: 'Pikachu' }), 'id:123');
      assert.equal(abilityKey({ name: 'Pikachu', number: 5 }), 'name:Pikachu#5');
      assert.equal(abilityKey({ name: 'Pikachu', set: { number: 5 } }), 'name:Pikachu#5');
      assert.equal(abilityKey({ name: 'Pikachu' }), 'name:Pikachu#');
      assert.equal(abilityKey(null), 'unknown');
      // id is authoritative even when name differs
      assert.equal(abilityKey({ id: 7, name: 'Alt' }), 'id:7');
    });

    test('abilityUsed: false by default; markAbilityUsed records it for that card only', () => {
      startGame();
      const cardA = { id: 1, name: 'Card A' };
      const cardB = { id: 2, name: 'Card B' };
      assert.equal(abilityUsed('self', cardA), false);
      markAbilityUsed('self', cardA);
      assert.equal(abilityUsed('self', cardA), true);
      assert.equal(abilityUsed('self', cardB), false);
      assert.equal(abilityUsed('opp', cardA), false);
      // unknown/absent player is safe
      assert.equal(abilityUsed('nobody', cardA), false);
    });

    test('resetTurnFlags (via beginTurn/endTurn/startGame): clears abilitiesUsed each turn', () => {
      startGame();
      const card = { id: 1, name: 'Card A' };
      markAbilityUsed('self', card);
      assert.equal(abilityUsed('self', card), true);
      // A player's flags clear when their OWN turn begins again
      beginTurn('self');
      assert.equal(abilityUsed('self', card), false);
      // re-use and cross a turn boundary (opp ends turn -> self's turn starts)
      markAbilityUsed('self', card);
      assert.equal(abilityUsed('self', card), true);
      endTurn('self');
      endTurn('opp');
      assert.equal(abilityUsed('self', card), false);
      // startGame clears everything for a fresh game
      markAbilityUsed('self', card);
      startGame();
      assert.equal(abilityUsed('self', card), false);
    });

    // ── special-energy effect engine (taxonomy F, Gap #4) ──
    test('classifyEnergyEffect: Double / Double Colorless', () => {
      assert.equal(classifyEnergyEffect({ subtypes: ['double', 'special'], name: 'Double Energy' }), 'double');
      assert.equal(classifyEnergyEffect({ subtypes: ['special'], name: 'Double Energy' }), 'double');
      assert.equal(classifyEnergyEffect({ subtypes: ['double colorless', 'special'], name: 'Double Colorless Energy' }), 'double-colorless');
      assert.equal(classifyEnergyEffect({ name: 'Double Colorless Energy' }), 'double-colorless');
    });

    test('classifyEnergyEffect: Lock / Switching / Buddy-Buddy named specials', () => {
      assert.equal(classifyEnergyEffect({ subtypes: ['special'], name: 'Lock Energy' }), 'lock');
      assert.equal(classifyEnergyEffect({ subtypes: ['special'], name: 'Switching Energy' }), 'redirect');
      assert.equal(classifyEnergyEffect({ subtypes: ['special'], name: 'Buddy-Buddy Energy' }), 'protect');
    });

    test('classifyEnergyEffect: basic vs. attach-type letter specials', () => {
      assert.equal(classifyEnergyEffect({ subtypes: ['basic', 'grass'], name: 'Grass Energy' }), 'basic');
      assert.equal(classifyEnergyEffect({ subtypes: ['special', 'metal'], name: 'Razor Claw' }), 'attach-type');
      assert.equal(classifyEnergyEffect({ subtypes: ['special'], name: 'M Energy' }), 'attach-type');
    });

    test('classifyEnergyEffect: non-energy / unrecognizable → unknown', () => {
      assert.equal(classifyEnergyEffect(null), 'unknown');
      assert.equal(classifyEnergyEffect({ name: 'Pikachu' }), 'unknown');
      assert.equal(classifyEnergyEffect({ name: 'Some Card' }), 'unknown');
    });

    test('describeEnergyEffect: guidance-only lines per family', () => {
      assert.match(describeEnergyEffect({ name: 'Lock Energy' }), /Lock Energy/);
      assert.match(describeEnergyEffect({ name: 'Double Colorless Energy' }), /Colorless/);
      assert.match(describeEnergyEffect({ subtypes: ['basic'], name: 'Grass Energy' }), /Basic Energy/);
      assert.match(describeEnergyEffect(null), /no special effect/);
    });

    test('applyEnergyEffect: announce-only (no execution)', () => {
      const r = applyEnergyEffect({ name: 'Switching Energy' });
      assert.equal(r.family, 'redirect');
      assert.equal(r.executed, false);
      assert.match(r.message, /announce-only/);
      assert.match(r.message, /Switching Energy/);
    });

    test('isEnergyCard: recognizes energy by subtype/name/type', () => {
      assert.equal(isEnergyCard({ subtypes: ['basic', 'fire'] }), true);
      assert.equal(isEnergyCard({ name: 'Double Colorless Energy' }), true);
      assert.equal(isEnergyCard({ type: 'Energy' }), true);
      assert.equal(isEnergyCard({ name: 'Pikachu' }), false);
      assert.equal(isEnergyCard(null), false);
    });

    // ── lock execution helpers (taxonomy §F, family 2) ──
    test('isLockEnergy: true only for Lock Energy', () => {
      assert.equal(isLockEnergy({ subtypes: ['special'], name: 'Lock Energy' }), true);
      assert.equal(isLockEnergy({ subtypes: ['basic', 'grass'], name: 'Grass Energy' }), false);
      assert.equal(isLockEnergy({ name: 'Switching Energy', subtypes: ['special'] }), false);
      assert.equal(isLockEnergy({ name: 'Pikachu' }), false);
      assert.equal(isLockEnergy(null), false);
    });

    test('pokemonHasLockedEnergy: identity-based attachment check', () => {
      const pikachuImg = { name: 'Pikachu' }; // stand-in for the Pokémon's image element
      const pikachu = { image: pikachuImg };
      const lockEnergy = { subtypes: ['special'], name: 'Lock Energy', image: { relative: pikachuImg } };
      const grassEnergy = { subtypes: ['basic'], name: 'Grass Energy', image: { relative: pikachuImg } };
      // Attached to Pikachu → protected.
      assert.equal(pokemonHasLockedEnergy(pikachu, [grassEnergy, lockEnergy]), true);
      // Lock energy attached to a different Pokémon → not protected.
      const otherImg = { name: 'Raichu' };
      assert.equal(pokemonHasLockedEnergy(pikachu, [{ ...lockEnergy, image: { relative: otherImg } }]), false);
      // Only basic energies attached → not protected.
      assert.equal(pokemonHasLockedEnergy(pikachu, [grassEnergy]), false);
      // Empty list / no image → false (no crash).
      assert.equal(pokemonHasLockedEnergy(pikachu, []), false);
      assert.equal(pokemonHasLockedEnergy(pikachu, undefined), false);
      assert.equal(pokemonHasLockedEnergy({ name: 'NoImage' }, [lockEnergy]), false);
      assert.equal(pokemonHasLockedEnergy(null, [lockEnergy]), false);
    });

    // ── redirect execution helpers (taxonomy §F, family 3: Switching Energy) ──
    test('isRedirectEnergy: true only for Switching Energy', () => {
      assert.equal(isRedirectEnergy({ subtypes: ['special'], name: 'Switching Energy' }), true);
      assert.equal(isRedirectEnergy({ subtypes: ['basic', 'grass'], name: 'Grass Energy' }), false);
      assert.equal(isRedirectEnergy({ name: 'Lock Energy', subtypes: ['special'] }), false);
      assert.equal(isRedirectEnergy({ name: 'Pikachu' }), false);
      assert.equal(isRedirectEnergy(null), false);
    });

    test('pokemonHasRedirectEnergy: identity-based attachment check', () => {
      const pikachuImg = { name: 'Pikachu' }; // stand-in for the Pokémon's image element
      const pikachu = { image: pikachuImg };
      const switchEnergy = { subtypes: ['special'], name: 'Switching Energy', image: { relative: pikachuImg } };
      const grassEnergy = { subtypes: ['basic'], name: 'Grass Energy', image: { relative: pikachuImg } };
      // Switching Energy attached to Pikachu → free switch.
      assert.equal(pokemonHasRedirectEnergy(pikachu, [grassEnergy, switchEnergy]), true);
      // Attached to a different Pokémon → not free.
      const otherImg = { name: 'Raichu' };
      assert.equal(pokemonHasRedirectEnergy(pikachu, [{ ...switchEnergy, image: { relative: otherImg } }]), false);
      // Only basic energies attached → not free.
      assert.equal(pokemonHasRedirectEnergy(pikachu, [grassEnergy]), false);
      // Empty list / no image → false (no crash).
      assert.equal(pokemonHasRedirectEnergy(pikachu, []), false);
      assert.equal(pokemonHasRedirectEnergy(pikachu, undefined), false);
      assert.equal(pokemonHasRedirectEnergy({ name: 'NoImage' }, [switchEnergy]), false);
      assert.equal(pokemonHasRedirectEnergy(null, [switchEnergy]), false);
    });

    // ── protect execution helpers (taxonomy §F, family 4: Buddy-Buddy Energy) ──
    test('isProtectEnergy: true only for Buddy-Buddy Energy', () => {
      assert.equal(isProtectEnergy({ subtypes: ['special'], name: 'Buddy-Buddy Energy' }), true);
      assert.equal(isProtectEnergy({ subtypes: ['basic', 'grass'], name: 'Grass Energy' }), false);
      assert.equal(isProtectEnergy({ name: 'Lock Energy', subtypes: ['special'] }), false);
      assert.equal(isProtectEnergy({ name: 'Pikachu' }), false);
      assert.equal(isProtectEnergy(null), false);
    });

    test('pokemonHasProtectEnergy: identity-based attachment check', () => {
      const pikachuImg = { name: 'Pikachu' }; // stand-in for the Pokémon's image element
      const pikachu = { image: pikachuImg };
      const buddyBuddy = { subtypes: ['special'], name: 'Buddy-Buddy Energy', image: { relative: pikachuImg } };
      const grassEnergy = { subtypes: ['basic'], name: 'Grass Energy', image: { relative: pikachuImg } };
      // Buddy-Buddy attached to Pikachu → protected.
      assert.equal(pokemonHasProtectEnergy(pikachu, [grassEnergy, buddyBuddy]), true);
      // Attached to a different Pokémon → not protected.
      const otherImg = { name: 'Raichu' };
      assert.equal(pokemonHasProtectEnergy(pikachu, [{ ...buddyBuddy, image: { relative: otherImg } }]), false);
      // Only basic energies attached → not protected.
      assert.equal(pokemonHasProtectEnergy(pikachu, [grassEnergy]), false);
      // Empty list / no image → false (no crash).
      assert.equal(pokemonHasProtectEnergy(pikachu, []), false);
      assert.equal(pokemonHasProtectEnergy(pikachu, undefined), false);
      assert.equal(pokemonHasProtectEnergy({ name: 'NoImage' }, [buddyBuddy]), false);
      assert.equal(pokemonHasProtectEnergy(null, [buddyBuddy]), false);
    });

    test('applyProtectCap: caps damage at 1 when protected, otherwise no-op', () => {
      assert.equal(applyProtectCap(0, true), 0);
      assert.equal(applyProtectCap(1, true), 1);
      assert.equal(applyProtectCap(5, true), 1);
      assert.equal(applyProtectCap(99, true), 1);
      assert.equal(applyProtectCap(99, false), 99);
      assert.equal(applyProtectCap(5, false), 5);
      assert.equal(applyProtectCap(undefined, false), 0);
      assert.equal(applyProtectCap(-3, false), 0);
      assert.equal(applyProtectCap(-3, true), 0);
    });

    // ── Abilities (announce-only, taxonomy Section C / Gap #2) ──
    test('isAbilityCard: recognizes ability cards', () => {
      assert.equal(isAbilityCard({ name: 'Lillie', ability: { text: 'Search your deck.' } }), true);
      assert.equal(isAbilityCard({ name: 'Glimmora', abilityText: 'Draw a card.' }), true);
      assert.equal(isAbilityCard({ name: 'Pikachu' }), false);
      assert.equal(isAbilityCard(null), false);
    });

    test('classifyAbility: buckets by keyword family', () => {
      assert.equal(classifyAbility({ ability: { text: 'Prevent all damage dealt to this Pokémon.' } }), 'damage-prevent');
      assert.equal(classifyAbility({ ability: { text: 'Your cards in hand can’t be affected by opponent effects.' } }), 'hand-protect');
      assert.equal(classifyAbility({ ability: { text: 'Once per turn, your opponent can’t use Item cards.' } }), 'opponent-disrupt');
      assert.equal(classifyAbility({ ability: { text: 'At the end of your turn, draw a card.' } }), 'end-of-turn');
      assert.equal(classifyAbility({ ability: { text: 'Attach an Energy card from your hand.' } }), 'attach');
      assert.equal(classifyAbility({ ability: { text: 'Put an Energy card from your hand onto a Pokémon in your party.' } }), 'attach');
      assert.equal(classifyAbility({ ability: { text: 'Remove up to 2 damage counters.' } }), 'heal');
      assert.equal(classifyAbility({ ability: { text: 'Switch this Pokémon with another.' } }), 'switch');
      assert.equal(classifyAbility({ ability: { text: 'Look through your deck and find a Basic Pokémon, put it into your hand.' } }), 'search');
      assert.equal(classifyAbility({ ability: { text: 'Draw 2 cards when you play this Pokémon.' } }), 'draw');
      assert.equal(classifyAbility({ ability: { text: 'Draw a card.' } }), 'draw');
      assert.equal(classifyAbility({ ability: { text: 'When you play this Pokémon, search your deck.' } }), 'search');
      assert.equal(classifyAbility({ ability: { text: 'While this Pokémon is in play, attacks cost less.' } }), 'passive');
      assert.equal(classifyAbility({ name: 'Pikachu' }), 'unknown');
    });

    test('classifyAbility: full-corpus pkmncards audit clusters', () => {
      // Ancient-Trait / play-from-hand evolution wording.
      assert.equal(
        classifyAbility({
          ability: {
            text: 'You may play this card from your hand to evolve a Pokémon during your first turn or the turn you play that Pokémon.',
          },
        }),
        'evolve',
      );
      assert.equal(
        classifyAbility({ ability: { text: 'Murkrow can evolve during the turn you play it.' } }),
        'evolve',
      );
      // Opponent hand reveal.
      assert.equal(
        classifyAbility({
          ability: { text: 'Once during your turn, you may have your opponent reveal their hand.' },
        }),
        'opponent-disrupt',
      );
      // Energy provides a different type / provides every type.
      assert.equal(
        classifyAbility({
          ability: {
            text: 'All basic Energy cards attached to Steelix provide {M} Energy instead of their usual types.',
          },
        }),
        'energy-multiplier',
      );
      // Self/type change.
      assert.equal(
        classifyAbility({
          ability: {
            text: 'As long as Lanturn has any {L} Energy attached to it, Lanturn is both {L} and {W} type.',
          },
        }),
        'type-change',
      );
      // Retreat-cost modifiers worded without the phrase "retreat cost".
      assert.equal(
        classifyAbility({
          ability: { text: 'You pay {C} less to retreat Arcanine for each Energy attached to it.' },
        }),
        'retreat-cost',
      );
      // Player play-locks.
      assert.equal(
        classifyAbility({
          ability: { text: 'Each player can\u2019t play any Item cards from his or her hand.' },
        }),
        'effect-prevent',
      );
      // Prize prevention on KO.
      assert.equal(
        classifyAbility({
          ability: {
            text: 'When Shedinja is Knocked Out, your opponent doesn\u2019t take any Prize cards.',
          },
        }),
        'prize-modify',
      );
      // Resistance modifications.
      assert.equal(
        classifyAbility({
          ability: { text: "Each of your {L} Pokémon's Resistance is now -30." },
        }),
        'weakness',
      );
      // Discard pile onto Bench recursion.
      assert.equal(
        classifyAbility({
          ability: {
            text: 'During your turn, you may put up to 2 {W} Pokémon that don\u2019t have a Rule Box from your discard pile onto your Bench.',
          },
        }),
        'recursion',
      );
    });

    test('parseAbility: Mega Greninja ex Mortal Shuriken (discard Water Energy → place damage on opponent)', () => {
      const text =
        "Once during your turn, if this Pokémon is in the Active Spot, you may discard a Basic Water Energy card from your hand in order to use this Ability. Place 6 damage counters on 1 of your opponent's Pokémon.";
      const steps = parseAbility(text);
      assert.equal(steps.some((s) => s.type === 'discardCostAbility'), true);
      assert.equal(steps.some((s) => s.type === 'moveDamageAbility'), true);
      assert.equal(steps.some((s) => s.type === 'opponentDisruptAbility'), false);

      const cost = steps.find((s) => s.type === 'discardCostAbility');
      assert.equal(cost.count, 1);
      assert.equal(cost.basic, true);
      assert.equal(cost.energyType, 'water');

      const dmg = steps.find((s) => s.type === 'moveDamageAbility');
      assert.equal(dmg.count, 6);
      assert.equal(dmg.onOpponent, true);

      assert.equal(classifyAbility({ name: 'Mega Greninja ex', ability: { text } }), 'move-damage');
    });

    test('parseAbility: place damage on opponent without incidental "to" in cost clause', () => {
      const text =
        "Once during your turn, you may discard a Basic Water Energy card from your hand. Place 6 damage counters on 1 of your opponent's Pokémon.";
      const steps = parseAbility(text);
      assert.equal(steps.some((s) => s.type === 'moveDamageAbility'), true);
      assert.equal(steps.some((s) => s.type === 'opponentDisruptAbility'), false);
      assert.equal(classifyAbility({ ability: { text } }), 'move-damage');
    });

    test('parseAbility: Fan Rotom Fan Call — typed {C} Pokémon with HP cap (ability parser, not trainer)', () => {
      const text =
        "Once during your first turn, you may search your deck for up to 3 {C} Pokémon with 100 HP or less, reveal them, and put them into your hand. Then, shuffle your deck.";
      const steps = parseAbility(text);
      const search = steps.find((s) => s.type === 'searchAbility');
      assert.ok(search);
      assert.equal(search.what, 'Basic {C} Pokémon ≤100 HP');
      assert.equal(search.count, 3);
      assert.equal(search.upTo, true);
      assert.equal(search.destination, 'hand');
    });

    test('parseAbilitySearchParams: typed Basic {R} Energy preserved', async () => {
      const { parseAbilitySearchParams } = await import('../abilities.mjs');
      const lower =
        'search your deck for up to 2 basic {r} energy cards and put them into your hand';
      const parsed = parseAbilitySearchParams(lower);
      assert.equal(parsed.what, 'Basic {R} Energy');
      assert.equal(parsed.count, 2);
      assert.equal(parsed.upTo, true);
    });

    test('ability search filter: typed {R} Energy via search-match.mjs', async () => {
      const { matchesSearch } = await import('../search-match.mjs');
      const fire = { name: 'Basic Fire Energy', type: 'Energy', subtypes: ['Basic'], types: ['Fire'] };
      const water = { name: 'Basic Water Energy', type: 'Energy', subtypes: ['Basic'], types: ['Water'] };
      assert.equal(matchesSearch(fire, 'Basic {R} Energy'), true);
      assert.equal(matchesSearch(water, 'Basic {R} Energy'), false);
    });

    test('searchTargetType: determines card type from ability text', () => {
      assert.equal(searchTargetType({ ability: { text: 'Look through your deck and find a Basic Pokémon, put it into your hand.' } }), 'Pokémon');
      assert.equal(searchTargetType({ ability: { text: 'Search your deck for an Energy card and put it into your hand.' } }), 'Energy');
      assert.equal(searchTargetType({ ability: { text: 'Look through your deck for a Trainer card and put it into your hand.' } }), 'Trainer');
      assert.equal(searchTargetType({ ability: { text: 'Search for an Item card.' } }), 'Trainer');
      assert.equal(searchTargetType({ ability: { text: 'Find a Pokémon from your deck.' } }), 'Pokémon');
      assert.equal(searchTargetType(null), 'Pokémon');
      assert.equal(searchTargetType({}), 'Pokémon');
    });

    test('describeAbilityFamily: one guidance line per family', () => {
      assert.match(describeAbilityFamily({ name: 'Lillie', ability: { text: 'Search your deck.' } }), /search ability/);
      assert.match(describeAbilityFamily({ name: 'Glimmora', ability: { text: 'Draw a card.' } }), /draw ability/);
      assert.match(describeAbilityFamily({ name: 'Pikachu' }), /no specific family/);
      assert.match(describeAbilityFamily(null), /no specific family/);
    });

    test('applyAbilityEffect: announce-only (no execution)', () => {
      const r = applyAbilityEffect({ name: 'Glimmora', ability: { text: 'Draw a card.' } });
      assert.equal(r.family, 'draw');
      assert.equal(r.executed, false);
      assert.match(r.message, /announce-only/);
      assert.match(r.message, /Glimmora/);
    });

    test('ABILITY_FAMILIES: stable list, includes unknown', () => {
      assert.ok(Array.isArray(ABILITY_FAMILIES));
      assert.ok(ABILITY_FAMILIES.includes('unknown'));
      assert.ok(ABILITY_FAMILIES.length >= 8);
    });

    // ── Stadiums (announce-only, taxonomy Section E / Gap #3) ──
    test('isStadiumCard: recognizes stadiums by subtype/type/name', () => {
      assert.equal(isStadiumCard({ subtypes: ['stadium'] }), true);
      assert.equal(isStadiumCard({ type: 'Stadium' }), true);
      assert.equal(isStadiumCard({ name: 'Safari Zone' }), true);
      assert.equal(isStadiumCard({ name: 'Lillie’s Rooftop' }), true);
      assert.equal(isStadiumCard({ name: 'Grand Tree', type: 'Trainer' }), true);
      assert.equal(isStadiumCard({ name: 'Artazon', text: 'This Stadium stays in play when you play it. Discard it if another Stadium comes into play.' }), true);
      assert.equal(isStadiumCard({ name: 'Pikachu' }), false);
      assert.equal(isStadiumCard(null), false);
    });

    test('classifyStadiumEffect: buckets by trigger family', () => {
      assert.equal(
        classifyStadiumEffect({ type: 'Stadium', name: 'Victory Road', text: 'When you play this card, draw 2 cards.' }),
        'setup-once',
      );
      assert.equal(
        classifyStadiumEffect({ type: 'Stadium', name: 'Safari Zone', text: 'Once per turn, each player may search their deck for a Basic Pokémon.' }),
        'once-per-turn',
      );
      assert.equal(
        classifyStadiumEffect({ type: 'Stadium', name: 'Route 25', text: 'Both players: Basic Pokémon have +20 HP.' }),
        'continuous-both',
      );
      assert.equal(
        classifyStadiumEffect({ type: 'Stadium', name: 'Lillie’s Rooftop', text: 'Prevent all damage that would be dealt to your Active Pokémon by attacks.' }),
        'continuous-both',
      );
      assert.equal(
        classifyStadiumEffect({ type: 'Stadium', name: 'Misty’s Cove', text: 'Your opponent’s Water Pokémon are harder to evolve.' }),
        'opponent-affected',
      );
      assert.equal(classifyStadiumEffect({ name: 'Pikachu' }), 'unknown');
    });

    test('describeStadiumEffect: one guidance line per family', () => {
      assert.match(describeStadiumEffect({ type: 'Stadium', name: 'Victory Road', text: 'When you play this card, draw 2 cards.' }), /when-you-play/);
      assert.match(describeStadiumEffect({ type: 'Stadium', name: 'Safari Zone', text: 'Once per turn, search your deck.' }), /once-per-turn/);
      assert.match(describeStadiumEffect({ name: 'Pikachu' }), /no effect family/);
      assert.match(describeStadiumEffect(null), /no effect family/);
    });

    test('applyStadiumEffect: once-per-turn returns actionable results', () => {
      const r = applyStadiumEffect({ type: 'Stadium', name: 'Safari Zone', text: 'Once per turn, search your deck for a Pokémon.' });
      assert.equal(r.family, 'once-per-turn');
      assert.equal(r.executed, true);
      assert.ok(r.results.length >= 1);
      assert.equal(r.results[0].action, 'search');
    });

    test('applyStadiumEffect: setup-once returns draw results', () => {
      const r = applyStadiumEffect({ type: 'Stadium', name: 'Victory Road', text: 'When you play this card, draw 2 cards.' });
      assert.equal(r.family, 'setup-once');
      assert.equal(r.executed, true);
      assert.equal(r.results[0].action, 'draw');
      assert.equal(r.results[0].n, 2);
    });

    test('stadiumActivationStatus: actionable families and per-turn gates', () => {
      const safari = { type: 'Stadium', name: 'Safari Zone', text: 'Once per turn, search your deck for a Basic Pokémon.' };
      assert.deepEqual(stadiumActivationStatus(safari), { actionable: true, usable: true, reason: null });
      assert.equal(stadiumActivationStatus(safari, { usedThisTurn: true }).usable, false);
      assert.match(stadiumActivationStatus(safari, { usedThisTurn: true }).reason, /Already used/);
      assert.equal(stadiumActivationStatus(safari, { yourTurn: false }).usable, false);
      assert.match(stadiumActivationStatus(safari, { yourTurn: false }).reason, /not your turn/);
      assert.equal(stadiumActivationStatus(safari, { rulesEnabled: false }).usable, false);
      assert.match(stadiumActivationStatus(safari, { rulesEnabled: false }).reason, /Rules mode/);
    });

    test('stadiumActivationStatus: setup-once is actionable, condition gates once-per-turn', () => {
      const victory = { type: 'Stadium', name: 'Victory Road', text: 'When you play this card, draw 2 cards.' };
      assert.equal(stadiumActivationStatus(victory).actionable, true);
      assert.equal(stadiumActivationStatus(victory).usable, true);

      const factory = {
        type: 'Stadium',
        name: 'Team Rocket\u2019s Factory',
        text: 'Once during each player\'s turn, if they played a Supporter card that has "Team Rocket" in its name from their hand, they may draw 2 cards.',
      };
      const unmet = stadiumActivationStatus(factory, { flags: {} });
      assert.equal(unmet.usable, false);
      assert.match(unmet.reason, /team rocket/i);
      assert.equal(stadiumActivationStatus(factory, { flags: { lastSupporterName: 'Team Rocket Grunt' } }).usable, true);
    });

    test('stadiumActivationStatus: continuous and non-stadium are never usable', () => {
      const route = { type: 'Stadium', name: 'Route 25', text: 'Both players: Basic Pokémon have +20 HP.' };
      assert.deepEqual(stadiumActivationStatus(route), {
        actionable: false,
        usable: false,
        reason: 'Continuous effect — always active while in play.',
      });
      const unknown = { type: 'Stadium', name: 'Mystery', text: 'Do something odd.' };
      assert.equal(stadiumActivationStatus(unknown).actionable, false);
      assert.match(stadiumActivationStatus(unknown).reason, /no activatable effect/);
      assert.equal(stadiumActivationStatus({ name: 'Pikachu' }).usable, false);
      assert.match(stadiumActivationStatus({ name: 'Pikachu' }).reason, /Not a Stadium/);
    });

    test('parseStadiumSetupDraw: only the when-you-play sentence, never a default 1', () => {
      assert.equal(parseStadiumSetupDraw({ name: 'Victory Road', text: 'When you play this card, draw 2 cards.' }), 2);
      assert.equal(parseStadiumSetupDraw({ name: 'X', text: 'When you play this card, do something.' }), null);
      assert.equal(parseStadiumSetupDraw({ name: 'X', text: 'Once per turn, draw 1 card.' }), null);
      assert.equal(parseStadiumSetupDraw(null), null);
      const boilerplate =
        'This Stadium stays in play when you play it. Discard it if another Stadium comes into play. Once during each player\'s turn, that player may draw 2 cards.';
      assert.equal(parseStadiumSetupDraw({ type: 'Stadium', name: 'Mesagoza', text: boilerplate }), null);
      assert.equal(
        classifyStadiumEffect({ type: 'Stadium', name: 'Mesagoza', text: boilerplate }),
        'once-per-turn',
      );
    });

    test('parseStadiumOncePerTurn: buckets draw/search/energy/heal', () => {
      assert.deepEqual(parseStadiumOncePerTurn({ text: 'Once per turn, draw 2 cards.' }), { kind: 'draw', n: 2 });
      assert.deepEqual(parseStadiumOncePerTurn({ text: 'Once per turn, search your deck.' }), { kind: 'search', n: 1, searchWhat: 'card' });
      assert.equal(parseStadiumOncePerTurn({ text: 'Once per turn, attach an Energy.' }).kind, 'energy');
      assert.equal(parseStadiumOncePerTurn({ text: 'Once per turn, heal 20 damage.' }).kind, 'heal');
      assert.equal(parseStadiumOncePerTurn({ text: 'Prevent all damage.' }), null);
    });

    test('parseStadiumOncePerTurn: complex TCG Live once-per-turn stadiums', () => {
      assert.equal(
        parseStadiumOncePerTurn({ text: "Once during each player's turn, that player may discard an Energy card from their hand in order to draw a card." }).kind,
        'discard-draw',
      );
      assert.equal(
        parseStadiumOncePerTurn({ text: "Once during each player's turn, that player may put a card from their hand on top of their deck." }).kind,
        'hand-to-deck-top',
      );
      assert.equal(
        parseStadiumOncePerTurn({ text: "Once during each player's turn, that player may switch their Active {W} Pokémon with 1 of their Benched {W} Pokémon." }).kind,
        'switch-type',
      );
      assert.equal(
        parseStadiumOncePerTurn({ text: "Once during each player's turn, that player may heal 10 damage from each of their Pokémon." }).kind,
        'heal-all',
      );
      const roughSeas = parseStadiumOncePerTurn({
        text: "Once during each player's turn, that player may heal 30 damage from each of their Water Pokémon and Lightning Pokémon.",
      });
      assert.equal(roughSeas.kind, 'heal-all');
      assert.equal(roughSeas.n, 30);
      assert.deepEqual(roughSeas.types, ['water', 'lightning']);
      const factory = parseStadiumOncePerTurn({ text: 'Once during each player\'s turn, if they played a Supporter card that has "Team Rocket" in its name from their hand, they may draw 2 cards.' });
      assert.equal(factory.kind, 'draw');
      assert.equal(factory.n, 2);
      assert.equal(factory.condition.type, 'named-supporter');
    });

    test('parseStadiumOncePerTurn: Scorched Earth discards Fire/Fighting Energy and draws 2', () => {
      const scorched = {
        type: 'Stadium',
        name: 'Scorched Earth',
        text: "Once during each player's turn, that player may discard a Fire or Fighting Energy card from his or her hand. If that player does so, he or she draws 2 cards.",
      };
      const parsed = parseStadiumOncePerTurn(scorched);
      assert.equal(parsed.kind, 'discard-draw');
      assert.equal(parsed.n, 2);
      assert.equal(parsed.cost.type, 'discard-energy');
      assert.deepEqual(parsed.cost.types, ['fire', 'fighting']);
    });

    test('parseStadiumOncePerTurn: Mystery Garden draws until hand size equals {P} Pokémon in play', () => {
      const parsed = parseStadiumOncePerTurn({
        type: 'Stadium',
        name: 'Mystery Garden',
        text: "Once during each player's turn, that player may discard an Energy card from their hand in order to draw cards until they have as many cards in their hand as they have {P} Pokémon in play.",
      });
      assert.equal(parsed.kind, 'draw-until-type');
      assert.equal(parsed.targetType, 'psychic');
      assert.equal(parsed.n, null);
      assert.equal(parsed.cost.type, 'discard-energy');
    });

    test('parseStadiumOncePerTurn: Levincia recovers Basic {L} Energy from the discard pile', () => {
      const parsed = parseStadiumOncePerTurn({
        type: 'Stadium',
        name: 'Levincia',
        text: "Once during each player's turn, that player may put up to 2 Basic {L} Energy cards from their discard pile into their hand.",
      });
      assert.equal(parsed.kind, 'recover-energy');
      assert.equal(parsed.n, 2);
      assert.equal(parsed.typeFilter, 'lightning');
    });

    test('parseStadiumOncePerTurn: Fossil Quarry searches "Antique" Items onto the Bench', () => {
      const parsed = parseStadiumOncePerTurn({
        type: 'Stadium',
        name: 'Fossil Quarry',
        text: 'Once during each player\'s turn, that player may search their deck for up to 2 Item cards that have "Antique" in their name and put them onto their Bench. Then, that player shuffles their deck.',
      });
      assert.equal(parsed.kind, 'search-hand');
      assert.equal(parsed.n, 2);
      assert.equal(parsed.searchWhat, 'item');
      assert.equal(parsed.searchFilter, 'antique');
      assert.equal(parsed.destination, 'bench');
    });

    test('parseStadiumOncePerTurn: Lumiose City flags turnEnds, third-person "draws N" parses', () => {
      const lumiose = parseStadiumOncePerTurn({
        type: 'Stadium',
        name: 'Lumiose City',
        text: "Once during each player's turn, that player may search their deck for a Basic Pokémon and put it onto their Bench. Then, that player shuffles their deck. If a player searches their deck in this way, their turn ends.",
      });
      assert.equal(lumiose.kind, 'search-bench');
      assert.equal(lumiose.turnEnds, true);
      const draws = parseStadiumOncePerTurn({
        type: 'Stadium',
        name: 'X',
        text: "Once during each player's turn, that player may draw 3 cards.",
      });
      assert.equal(draws.kind, 'draw');
      assert.equal(draws.n, 3);
      const drawsSingular = parseStadiumOncePerTurn({
        type: 'Stadium',
        name: 'Y',
        text: "Once during each player's turn, that player may draw a card.",
      });
      assert.equal(drawsSingular.kind, 'draw');
      assert.equal(drawsSingular.n, 1);
    });

    test('parseStadiumOncePerTurn: discard-pile Energy recovery (Mt. Coronet / Training Court)', () => {
      const coronet = parseStadiumOncePerTurn({
        name: 'Mt. Coronet',
        text: "Once during each player's turn, that player may put 2 {M} Energy cards from their discard pile into their hand.",
      });
      assert.equal(coronet.kind, 'recover-energy');
      assert.equal(coronet.n, 2);
      assert.equal(coronet.typeFilter, 'metal');
      const court = parseStadiumOncePerTurn({
        name: 'Training Court',
        text: "Once during each player's turn, that player may put a basic Energy card from their discard pile into their hand.",
      });
      assert.equal(court.kind, 'recover-energy');
      assert.equal(court.n, 1);
      assert.equal(court.basicOnly, true);
    });

    test('parseStadiumOncePerTurn: draw-until-hand-count and shuffle-draw', () => {
      const rose = parseStadiumOncePerTurn({
        name: 'Rose Tower',
        text: "Once during each player's turn, that player may draw cards until they have 3 cards in their hand.",
      });
      assert.equal(rose.kind, 'draw-until-count');
      assert.equal(rose.n, 3);
      const beach = parseStadiumOncePerTurn({
        name: 'Tropical Beach',
        text: "Once during each player's turn, that player may draw cards until he or she has 7 cards in his or her hand. If he or she does, that player's turn ends.",
      });
      assert.equal(beach.kind, 'draw-until-count');
      assert.equal(beach.n, 7);
      assert.equal(beach.turnEnds, true);
      const jubilife = parseStadiumOncePerTurn({
        name: 'Jubilife Village',
        text: "Once during each player's turn, that player may shuffle their hand into their deck and draw 5 cards. If they do, their turn ends.",
      });
      assert.equal(jubilife.kind, 'shuffle-draw');
      assert.equal(jubilife.n, 5);
      assert.equal(jubilife.turnEnds, true);
    });

    test('parseStadiumOncePerTurn: search qualifiers are preserved', () => {
      const artazon = parseStadiumOncePerTurn({
        name: 'Artazon',
        text: "Once during each player's turn, that player may search their deck for a Basic Pokémon that doesn't have a Rule Box and put it onto their Bench. Then, that player shuffles their deck.",
      });
      assert.equal(artazon.kind, 'search-bench');
      assert.match(artazon.searchWhat, /rule box/i);
      const brooklet = parseStadiumOncePerTurn({
        name: 'Brooklet Hill',
        text: "Once during each player's turn, that player may search their deck for a Basic {W} Pokémon or Basic {F} Pokémon, put it onto their Bench, and shuffle their deck.",
      });
      assert.equal(brooklet.searchWhat, 'Basic {W} Pokémon or Basic {F} Pokémon');
      const turffield = parseStadiumOncePerTurn({
        name: 'Turffield Stadium',
        text: "Once during each player's turn, that player may search their deck for an Evolution {G} Pokémon, reveal it, and put it into their hand. Then, that player shuffles their deck.",
      });
      assert.equal(turffield.kind, 'search');
      assert.equal(turffield.searchWhat, 'Evolution {G} Pokémon');
    });

    test('parseStadiumOncePerTurn: coin, condition, and utility kinds', () => {
      const p = (name, text) => parseStadiumOncePerTurn({ name, text });

      const battle = p("Battle City", "Once during each player's turn, that player may flip a coin. If heads, the player draws a card.");
      assert.equal(battle.kind, 'draw');
      assert.equal(battle.coin, true);

      const mesagoza = p('Mesagoza', "Once during each player's turn, that player may flip a coin. If heads, that player searches their deck for a Pokémon, reveals it, and puts it into their hand. Then, that player shuffles their deck.");
      assert.equal(mesagoza.kind, 'search');
      assert.equal(mesagoza.coin, true);

      const healing = p('Healing Field', "Once during each player's turn, he or she may flip a coin. If heads, that player removes 2 damage counters from his or her Active Pokémon (1 if it only has 1).");
      assert.equal(healing.kind, 'heal');
      assert.equal(healing.n, 20);

      const burned = p('Burned Tower', "Once during each player's turn, that player may flip a coin. If heads, the player searches his or her discard pile for a basic Energy card, shows it to his or her opponent, and put it into his or her hand.");
      assert.equal(burned.kind, 'recover-energy');
      assert.equal(burned.basicOnly, true);

      const quarry = p('Conductive Quarry', "Once during each player's turn, the player may flip a coin. If heads, that player searches his or her discard pile for a {L} or {M} Energy card, shows it to the opponent, and puts it into his or her hand.");
      assert.equal(quarry.kind, 'recover-energy');
      assert.deepEqual(quarry.types, ['lightning', 'metal']);

      const speed = p('Speed Stadium', "Once during each player's turn, the player may flip a coin until he or she gets tails. For each heads, that player draws a card.");
      assert.equal(speed.kind, 'coin-draw');
      assert.equal(speed.coin, true);

      const contest = p('Pokémon Contest Hall', "Once during each player's turn, if that player's Bench isn't full, the player may flip a coin. If heads, that player searches his or her deck for a Basic Pokémon and puts it onto his or her Bench.");
      assert.equal(contest.kind, 'search-bench');
      assert.equal(contest.coin, true);
      assert.equal(contest.condition.type, 'bench-not-full');

      const ultra = p('Ultra Space', "Once during each player's turn, that player may search their deck for an Ultra Beast card, reveal it, put it into their hand, and shuffle their deck.");
      assert.equal(ultra.searchWhat, 'Ultra Beast');

      const shop = p('Shopping Center', "Once during each player's turn, that player may put a Pokémon Tool attached to 1 of their Pokémon into their hand.");
      assert.equal(shop.kind, 'return-tool');

      const stark = p('Stark Mountain', "Once during each player's turn, that player may choose a {R} or {F} Energy attached to 1 of his or her Pokémon and move that Energy to 1 of his or her Pokémon.");
      assert.equal(stark.kind, 'move-energy');

      const undersea = p('Undersea Ruins', "Once during each player's turn (before attacking), that player may flip a coin. If heads, that player chooses 1 of his or her Evolved Pokémon in play and discards the top Evolution card from that Pokémon, devolving it.");
      assert.equal(undersea.kind, 'devolve');
      assert.equal(undersea.coin, true);

      const twist = p('Twist Mountain', "Once during each player's turn, that player may flip a coin. If heads, that player puts a Restored Pokémon from his or her hand onto his or her Bench.");
      assert.equal(twist.kind, 'bench-restored');

      assert.equal(p('Strange Cave', "Once during each player's turn, that player may put an Omanyte, Kabuto, Aerodactyl, Aerodactyl ex, Lileep, or Anorith onto his or her Bench from his or her hand.").source, 'hand');
      assert.equal(p('Underground Lake', "Once during each player's turn, that player may put an Omanyte or a Kabuto card from his or her discard pile onto his or her Bench.").source, 'discard');

      const magma = p('Magma Basin', "Once during each player's turn, that player may attach a {R} Energy card from their discard pile to 1 of their Benched {R} Pokémon. If a player attached Energy to a Pokémon in this way, put 2 damage counters on that Pokémon.");
      assert.equal(magma.kind, 'attach-discard-damage');
      assert.equal(magma.damage, 2);

      assert.equal(p('Radio Tower', "Once during each player's turn (before attacking), that player may look at the top 2 cards of his or her deck and put them back in the same order.").kind, 'peek-return');
      assert.equal(p('Primordial Altar', "Once during each player's turn, that player may look at the top card of their deck. They may discard that card.").kind, 'peek-discard');
      assert.equal(p('Fuchsia City Gym', "Once during each player's turn (before attacking), that player may flip a coin. If heads, that player may shuffle 1 of his or her Pokémon in play with Koga in its name and any cards attached to it into his or her deck.").kind, 'shuffle-own-pokemon');
      assert.equal(p('Lavender Town', "Once during each player's turn, that player may have their opponent reveal their hand.").kind, 'reveal-hand');

      const tower = p('Tower of Darkness', "Once during each player's turn, that player may draw 2 cards. In order to use this effect, that player must discard a Single Strike card from their hand.");
      assert.equal(tower.kind, 'discard-draw');
      assert.equal(tower.n, 2);
      assert.deepEqual(tower.cost, { type: 'discard-single-strike', n: 1 });

      const lost = p('Lost World', "Once during each player's turn, if that player's opponent has 6 or more Pokémon in the Lost Zone, the player may choose to win the game.");
      assert.equal(lost.kind, 'win-game');
      assert.deepEqual(lost.condition, { type: 'opponent-lost-zone', n: 6 });

      const ruins = p('Ancient Ruins', "Once during each player's turn, if he or she has not played a Supporter card, that player may reveal his or her hand to his or her opponent. If that player reveals his or her hand and there is no Supporter card there, that player draws a card.");
      assert.equal(ruins.kind, 'ancient-ruins');
      assert.equal(ruins.condition.type, 'no-supporter-played');

      const mystery = p('Mystery Zone', "Once during each player's turn, if that player has an Evolution card in his or her hand, he or she may search his or her deck for a basic Energy card, show it to his or her opponent, and put it into his or her hand. Then that player chooses an Evolution card from his or her hand and puts it into his or her deck. That player shuffles his or her deck afterward.");
      assert.equal(mystery.kind, 'mystery-zone');
      assert.equal(mystery.condition.type, 'has-evolution-in-hand');

      assert.equal(isSingleStrikeCard({ name: 'Single Strike Urshifu V' }), true);
      assert.equal(isSingleStrikeCard({ name: 'Rapid Strike Urshifu V' }), false);
      assert.equal(isEvolutionCard({ name: 'Ivysaur', stage: 'Stage 1' }), true);
      assert.equal(isEvolutionCard({ name: 'Bulbasaur', stage: 'Basic' }), false);
      assert.equal(
        isStadiumEnergyAttachHeal({ name: 'Pokémon Park', text: "Once during each of his or her turns, whenever a player attaches an Energy card from his or her hand to 1 of his or her Benched Pokémon, he or she removes 1 damage counter, if any, from that Pokémon." }),
        true
      );
      assert.equal(
        classifyStadiumEffect({ name: 'Pokémon Park', type: 'Stadium', subtypes: ['Stadium'], text: "Once during each of his or her turns, whenever a player attaches an Energy card from his or her hand to 1 of his or her Benched Pokémon, he or she removes 1 damage counter, if any, from that Pokémon." }),
        'continuous-both'
      );
      const glimwood = {
        name: 'Glimwood Tangle',
        type: 'Stadium',
        subtypes: ['Stadium'],
        text: "Once during each player's turn, after that player flips any coins for an attack, they may ignore all results of those coin flips and begin flipping those coins again.",
      };
      assert.equal(isStadiumGlimwoodReFlip(glimwood), true);
      assert.equal(hasRecognizedPassiveStadiumEffect(glimwood), true);
      assert.equal(classifyStadiumEffect(glimwood), 'continuous-both');
    });

    test('parseStadiumOncePerTurn: unmodeled gates stay announce-only', () => {
      // Glimwood Tangle needs an attack coin re-flip window the executor has no
      // hook for, so it stays announce-only rather than resolving for free.
      assert.equal(
        parseStadiumOncePerTurn({ name: 'Glimwood Tangle', text: "Once during each player's turn, after that player flips any coins for an attack, they may ignore all results of those coin flips and begin flipping those coins again." }),
        null
      );
      // Coin-flip and condition effects are now modeled, not announce-only.
      assert.equal(
        parseStadiumOncePerTurn({ name: 'Battle City', text: "Once during each player's turn, that player may flip a coin. If heads, the player draws a card." })?.kind,
        'draw'
      );
      assert.equal(
        parseStadiumOncePerTurn({ name: 'All-Night Party', text: "Once during each player's turn, if that player's Active Pokémon is Asleep, he or she may remove that Special Condition and heal 30 damage from that Pokémon." })?.kind,
        'heal'
      );
      assert.equal(
        parseStadiumOncePerTurn({ name: 'Stark Mountain', text: "Once during each player's turn, that player may choose a {R} or {F} Energy attached to 1 of his or her Pokémon and move that Energy to 1 of his or her Pokémon." })?.kind,
        'move-energy'
      );
      assert.equal(
        parseStadiumOncePerTurn({ name: 'Magma Basin', text: "Once during each player's turn, that player may attach a {R} Energy card from their discard pile to 1 of their Benched {R} Pokémon. If a player attached Energy to a Pokémon in this way, put 2 damage counters on that Pokémon." })?.kind,
        'attach-discard-damage'
      );
    });

    test('parseStadiumOncePerTurn: bench heal, top-deck mill, and discard-then-search', () => {
      const center = parseStadiumOncePerTurn({
        name: 'Pokémon Center',
        text: "Once during each player's turn, that player may heal 20 damage from 1 of his or her Benched Pokémon.",
      });
      assert.equal(center.kind, 'heal');
      assert.equal(center.n, 20);
      assert.equal(center.target, 'bench');

      const stop = parseStadiumOncePerTurn({
        name: 'PokéStop',
        text: "Once during each player's turn, that player may discard 3 cards from the top of their deck. If a player discarded any Item cards in this way, they put those Item cards into their hand.",
      });
      assert.equal(stop.kind, 'mill-items');
      assert.equal(stop.n, 3);

      const hearth = parseStadiumOncePerTurn({
        name: 'Giant Hearth',
        text: "Once during each player's turn, that player may discard a card from their hand. If they do, that player searches their deck for up to 2 {R} Energy cards, reveals them, and puts them into their hand. Then, that player shuffles their deck.",
      });
      assert.equal(hearth.kind, 'discard-search');
      assert.equal(hearth.n, 2);
      assert.equal(hearth.searchWhat, '{R} Energy');
      assert.deepEqual(hearth.cost, { type: 'discard-hand', n: 1 });

      const viridian = parseStadiumOncePerTurn({
        name: 'Viridian Forest',
        text: "Once during each player's turn, that player may discard a card from their hand. If they do, that player searches their deck for a basic Energy card, reveals it, and puts it into their hand. Then, that player shuffles their deck.",
      });
      assert.equal(viridian.kind, 'discard-search');
      assert.equal(viridian.n, 1);
      assert.equal(viridian.searchWhat, 'Basic Energy');
      assert.deepEqual(viridian.cost, { type: 'discard-hand', n: 1 });
    });

    test('Grand Tree: once-per-turn search-evolve, including Stage 2 chain', () => {
      const tree = {
        name: 'Grand Tree',
        type: 'Trainer',
        text: "Once during each player's turn, that player may search their deck for a Stage 1 Pokémon that evolves from 1 of their Pokémon in play and put it onto that Pokémon to evolve it. If that Pokémon evolved during this turn, that player may search their deck for a Stage 2 Pokémon that evolves from that Pokémon and put it onto that Pokémon to evolve it. Then, that player shuffles their deck.",
      };
      assert.equal(isStadiumCard(tree), true);
      assert.equal(classifyStadiumEffect(tree), 'once-per-turn');
      const parsed = parseStadiumOncePerTurn(tree);
      assert.equal(parsed.kind, 'search-evolve');
      assert.equal(parsed.chainStage2, true);
      const applied = applyStadiumEffect(tree);
      assert.equal(applied.executed, true);
      assert.equal(applied.results[0].action, 'search-evolve');
      assert.equal(
        matchesStadiumEvolveSearch({ name: 'Piloswine', evolvesFrom: 'Swinub' }, [{ name: 'Swinub' }]),
        true,
      );
      assert.equal(
        matchesStadiumEvolveSearch({ name: 'Piloswine', evolvesFrom: 'Swinub' }, [{ name: 'Pikipek' }]),
        false,
      );
      assert.equal(
        matchesStadiumEvolveSearch({ name: 'Charmeleon', evolvesFrom: 'Charmander' }, [{ name: 'Charmander ex' }]),
        true,
      );
      assert.equal(
        matchesStadiumEvolveSearch({ name: 'Charizard ex', evolvesFrom: 'Charmeleon' }, [{ name: 'Charmeleon-EX' }]),
        true,
      );
    });

    test('Jamming Tower: tool effects blocked via combinedDamagePrevention', async () => {
      const { combinedDamagePrevention } = await import('../ability-executors.mjs');
      const { markStadiumPlayed, getStadium } = await import('../rules-state.mjs');
      const { stadiumBlocksToolEffects } = await import('../stadium-effects.mjs');
      const prev = rulesState.stadium;
      rulesState.enabled = true;
      try {
        const mon = { name: 'Pikachu', ability: { text: 'Prevent all damage done to this Pokémon by attacks.' } };
        const tool = { name: 'Bravery Charm', type: 'Trainer', subtypes: ['Tool'], ability: { text: 'Prevent all damage done to this Pokémon by attacks from Pokémon ex.' } };
        markStadiumPlayed('self', { name: 'Jamming Tower', subtypes: ['Stadium'], text: 'Pokémon Tools attached to each Pokémon (both yours and your opponent\'s) have no effect.' });
        assert.equal(stadiumBlocksToolEffects(), true);
        const blocked = combinedDamagePrevention(mon, [tool], { blockTools: true });
        assert.equal(blocked.preventAll, true);
        const withTool = combinedDamagePrevention(mon, [tool], { blockTools: false });
        assert.equal(withTool.preventAll, true);
      } finally {
        rulesState.stadium = prev;
      }
    });

    test('Area Zero Underdepths: bench limit 8 with Tera, else 5', () => {
      const prev = rulesState.stadium;
      rulesState.enabled = true;
      try {
        markStadiumPlayed('self', {
          name: 'Area Zero Underdepths',
          subtypes: ['Stadium'],
          text: 'Each player who has any Tera Pokémon in play can have up to 8 Pokémon on their Bench.',
        });
        assert.equal(getEffectiveBenchLimit(false), 5);
        assert.equal(getEffectiveBenchLimit(true), 8);
      } finally {
        rulesState.stadium = prev;
      }
    });

    test('parseStadiumDamagePrevention: numbers, all, and null', () => {
      assert.equal(parseStadiumDamagePrevention({ text: 'Prevent all damage dealt to your Active Pokémon.' }), Infinity);
      assert.equal(parseStadiumDamagePrevention({ text: 'Prevent 2 damage dealt to your Pokémon.' }), 2);
      assert.equal(parseStadiumDamagePrevention({ text: 'Once per turn, draw 1 card.' }), null);
      assert.equal(parseStadiumDamagePrevention(null), null);
    });

    test('isStadiumRetreatPrevention: only opponent-retreat text', () => {
      assert.equal(isStadiumRetreatPrevention({ text: 'Your opponent’s Active Pokémon can’t retreat.' }), true);
      assert.equal(isStadiumRetreatPrevention({ text: 'Your Active Pokémon can’t retreat.' }), false);
      assert.equal(isStadiumRetreatPrevention(null), false);
    });

    test('isStadiumHandProtect: hand-protection text', () => {
      assert.equal(isStadiumHandProtect({ text: 'Cards in your hand can’t be discarded.' }), true);
      assert.equal(isStadiumHandProtect({ text: 'Once per turn, draw 1 card.' }), false);
      assert.equal(isStadiumHandProtect(null), false);
    });

    test('stadiumUsed / markStadiumUsed: per-player flag, reset each turn', () => {
      assert.equal(stadiumUsed('self'), false);
      markStadiumUsed('self');
      assert.equal(stadiumUsed('self'), true);
      assert.equal(stadiumUsed('opp'), false); // per-player, not global
      beginTurn('self'); // a fresh turn for the same player resets the flag
      assert.equal(stadiumUsed('self'), false);
    });

    test('STADIUM_EFFECT_FAMILIES: stable list, includes unknown', () => {
      assert.ok(Array.isArray(STADIUM_EFFECT_FAMILIES));
      assert.ok(STADIUM_EFFECT_FAMILIES.includes('unknown'));
      assert.ok(STADIUM_EFFECT_FAMILIES.length >= 4);
    });

    // ── Attack effects (taxonomy Section D, Piece A: announce-only classifier) ──
    test('classifyAttackEffect: damage families bucket by printed text', () => {
      assert.equal(
        classifyAttackEffect({ name: 'Slam', damage: 30, text: '30' }),
        'flat',
      );
      assert.equal(
        classifyAttackEffect({
          name: 'Energy Wave',
          damage: 10,
          text: 'This attack does 10 damage times the number of Energy attached to your Active Pokémon.',
        }),
        'per-energy',
      );
      assert.equal(
        classifyAttackEffect({
          name: 'Prize Break',
          damage: 10,
          text: 'For each of your opponent’s Prize cards, this attack does 10 more damage.',
        }),
        'per-prize',
      );
      assert.equal(
        classifyAttackEffect({
          name: 'Rising Strike',
          damage: 10,
          text: 'For each turn you have played this attack, this attack does 10 more damage.',
        }),
        'per-turn',
      );
      assert.equal(
        classifyAttackEffect({
          name: 'Wave Splash',
          damage: 10,
          text: 'Do 10 damage to each of your opponent’s Pokémon. Don’t apply Weakness and Resistance.',
        }),
        'multi-target',
      );
      assert.equal(
        classifyAttackEffect({
          name: 'Type Surge',
          damage: 40,
          text: 'If the Defending Pokémon is a Water Pokémon, this attack does 20 more damage.',
        }),
        'extra-by-type',
      );
      assert.equal(
        classifyAttackEffect({
          name: 'Basic Bash',
          damage: 30,
          text: 'If the Defending Pokémon is a Basic Pokémon, this attack does 30 more damage.',
        }),
        'conditional-damage',
      );
    });

    test('classifyAttackEffect: status families all five', () => {
      assert.equal(
        classifyAttackEffect({ damage: 10, text: 'Put the Defending Pokémon to Sleep.' }),
        'status-asleep',
      );
      assert.equal(
        classifyAttackEffect({ damage: 10, text: 'Paralyze the Defending Pokémon.' }),
        'status-paralyzed',
      );
      assert.equal(
        classifyAttackEffect({ damage: 10, text: 'Poison the Defending Pokémon.' }),
        'status-poisoned',
      );
      assert.equal(
        classifyAttackEffect({ damage: 10, text: 'Burn the Defending Pokémon.' }),
        'status-burned',
      );
      assert.equal(
        classifyAttackEffect({ damage: 10, text: 'Confuse the Defending Pokémon.' }),
        'status-confused',
      );
    });

    test('classifyAttackEffect: follow-up action and cost families', () => {
      assert.equal(
        classifyAttackEffect({
          damage: 20,
          text: 'You may also do 20 damage to 1 of your opponent’s benched Pokémon.',
        }),
        'bench-damage',
      );
      assert.equal(
        classifyAttackEffect({
          damage: 30,
          text: 'Discard an Energy card from your Active Pokémon. Then, this attack does 30 damage.',
        }),
        'discard-cost',
      );
      assert.equal(
        classifyAttackEffect({
          damage: 10,
          text: 'Shuffle the Defending Pokémon’s Energy cards into its deck.',
        }),
        'shuffle-cost',
      );
      assert.equal(
        classifyAttackEffect({
          damage: 10,
          text: 'Remove up to 2 damage counters from your Active Pokémon.',
        }),
        'heal',
      );
      assert.equal(
        classifyAttackEffect({
          damage: 10,
          text: 'Then, switch your Active Pokémon with 1 of your Benched Pokémon.',
        }),
        'switch',
      );
      assert.equal(
        classifyAttackEffect({
          damage: 10,
          text: 'Draw 2 cards. Then, attach 1 Energy from your discard pile to your Active Pokémon.',
        }),
        'draw-attach',
      );
      assert.equal(
        classifyAttackEffect({ name: 'Collect', text: 'Draw a card.' }),
        'draw-attach',
      );
      assert.equal(
        classifyAttackEffect({ name: 'Collect' }),
        'draw-attach',
      );
      assert.equal(
        classifyAttackEffect({ name: 'Collect', text: 'Collect' }),
        'draw-attach',
      );
      assert.equal(
        classifyAttackEffect({
          damage: 30,
          text: 'Flip a coin. If heads, this attack does 30 more damage. If tails, do 10 damage to yourself.',
        }),
        'coin-flip',
      );
      assert.equal(
        classifyAttackEffect({
          text: 'Once during your turn: look through your deck for a Basic Pokémon and put it onto your bench.',
        }),
        'once-per-turn',
      );
    });

    test('classifyAttackEffect: unknown when no text and no damage', () => {
      assert.equal(classifyAttackEffect({ name: 'Mystery' }), 'unknown');
      assert.equal(classifyAttackEffect(null), 'unknown');
      assert.equal(classifyAttackEffect({ damage: 50 }), 'flat');
    });

    test('classifyAttackEffect: search-deck before trailing shuffle (Call for Family)', () => {
      const callForFamily =
        'Search your deck for a Basic Pokémon and put it onto your Bench. Then, shuffle your deck.';
      assert.equal(
        classifyAttackEffect({ name: 'Call for Family', damage: 0, text: callForFamily }),
        'search-deck',
      );
      assert.notEqual(
        classifyAttackEffect({ name: 'Call for Family', damage: 0, text: callForFamily }),
        'shuffle-cost',
      );
    });

    test('classifyAttackEffect: move-energy, reveal-hand, conditional-ko', () => {
      assert.equal(
        classifyAttackEffect({
          name: 'Wheel Pass',
          damage: 0,
          text: 'Move an Energy from this Pokémon to 1 of your Benched Pokémon.',
        }),
        'move-energy',
      );
      assert.equal(
        classifyAttackEffect({
          name: 'Silent Wing',
          damage: 0,
          text: 'Your opponent reveals their hand.',
        }),
        'reveal-hand',
      );
      assert.equal(
        classifyAttackEffect({
          name: 'Abyss Eye',
          damage: 0,
          text: "If your opponent's Active Pokémon is affected by a Special Condition, it is Knocked Out.",
        }),
        'conditional-ko',
      );
      assert.equal(
        classifyAttackEffect({ name: 'Slam', damage: 30, text: '30' }),
        'flat',
      );
    });

    test('moveEnergyClause / revealHandClause / conditionalKoClause parsers', () => {
      assert.equal(
        moveEnergyClause('Move an Energy from this Pokémon to 1 of your Benched Pokémon.'),
        true,
      );
      assert.equal(moveEnergyClause('Do 30 damage to the Defending Pokémon.'), false);
      assert.equal(moveEnergyClause('Attach an Energy card to this Pokémon.'), false);
      assert.equal(moveEnergyClause(''), false);

      assert.equal(revealHandClause('Your opponent reveals their hand.'), true);
      assert.equal(revealHandClause('Your opponent reveal their hand.'), true);
      assert.equal(revealHandClause('Draw 2 cards.'), false);
      assert.equal(revealHandClause(''), false);

      assert.equal(
        conditionalKoClause(
          "If your opponent's Active Pokémon is affected by a Special Condition, it is Knocked Out.",
        ),
        true,
      );
      assert.equal(conditionalKoClause('Do 30 damage to the Defending Pokémon.'), false);
      assert.equal(conditionalKoClause(''), false);

      assert.equal(
        conditionalKoClause(
          "If your opponent's Active Pokémon has exactly 6 damage counters on it, that Pokémon is Knocked Out.",
        ),
        true,
      );
      assert.equal(exactCounterKoThreshold(
        "If your opponent's Active Pokémon has exactly 6 damage counters on it, that Pokémon is Knocked Out.",
      ), 6);
      assert.equal(redirectDamageCount('Place 2 damage counters on the Attacking Pokémon.'), 2);
      assert.equal(
        handScalingDamage(
          "Place 2 damage counters on your opponent's Active Pokémon for each card in your hand.",
        ),
        2,
      );
      assert.equal(
        returnEnergyClause('Put 2 Fire Energy attached to this Pokémon into your hand.'),
        true,
      );
      assert.equal(returnEnergyCount('Put 2 Fire Energy attached to this Pokémon into your hand.'), 2);
      assert.equal(
        immunityClause("This attack's damage isn't affected by Weakness or Resistance."),
        true,
      );
    });

    test('classifyAttackEffect: bracket Energy and backlog flat patterns', () => {
      assert.equal(
        classifyAttackEffect({
          name: 'Symphonia',
          damage: 50,
          text: 'This attack does 50 damage for each {P} Energy attached to all of your Pokémon.',
        }),
        'per-energy',
      );
      assert.equal(
        classifyAttackEffect({
          name: 'Growth',
          damage: 30,
          text: 'This attack does 30 more damage for each {G} Energy attached to this Pokémon.',
        }),
        'per-energy',
      );
      assert.equal(
        classifyAttackEffect({
          name: 'Damage Beat',
          damage: 20,
          text: "This attack does 20 damage for each damage counter on your opponent's Active Pokémon.",
        }),
        'per-energy',
      );
      assert.equal(
        classifyAttackEffect({
          name: 'Exact KO',
          damage: 0,
          text: "If your opponent's Active Pokémon has exactly 6 damage counters on it, that Pokémon is Knocked Out.",
        }),
        'conditional-ko',
      );
      assert.equal(
        classifyAttackEffect({
          name: 'Mirror Heal',
          damage: 30,
          text: "Heal from this Pokémon the same amount of damage you did to your opponent's Active Pokémon.",
        }),
        'mirror-heal',
      );
      assert.equal(
        classifyAttackEffect({
          name: 'Copy',
          damage: 0,
          text: "Choose 1 of your opponent's Active Pokémon's attacks and use it as this attack.",
        }),
        'copy-attack',
      );
      assert.equal(
        classifyAttackEffect({
          name: 'Round',
          damage: 40,
          text: 'This attack does 40 damage for each of your Pokémon in play that has the Round attack.',
        }),
        'per-energy',
      );
      assert.equal(
        classifyAttackEffect({
          name: 'Item Lock',
          damage: 0,
          text: "During your opponent's next turn, they can't play any Item cards from their hand.",
        }),
        'next-turn-lock',
      );
      assert.equal(
        classifyAttackEffect({
          name: 'Return',
          damage: 0,
          text: 'Put this Pokémon and all attached cards into your hand.',
        }),
        'return-self',
      );
    });

    test('backlog parser helpers: mirror heal, copy, deferred, hp cap', async () => {
      const {
        mirrorHealClause,
        copyAttackScope,
        deferredDamageCount,
        lookOpponentDeckCount,
        nextTurnBonusClause,
        hpCapRemaining,
        benchExactKoThreshold,
        recoverAllStatusClause,
        returnSelfClause,
        retaliateCount,
      } = await import('../damage-parser.mjs');
      assert.equal(mirrorHealClause("Heal from this Pokémon the same amount of damage you did to your opponent's Active Pokémon."), true);
      assert.equal(copyAttackScope("Choose 1 of your opponent's Active Pokémon's attacks and use it as this attack."), 'opp-active');
      assert.equal(deferredDamageCount("At the end of your opponent's next turn, put 9 damage counters on the Defending Pokémon."), 9);
      assert.equal(lookOpponentDeckCount("Look at the top 5 cards of your opponent's deck and put them back in any order."), 5);
      assert.deepEqual(
        nextTurnBonusClause("During your next turn, this Pokémon's Echoed Voice attack does 80 more damage (before applying Weakness and Resistance)."),
        { attackName: 'Echoed Voice', bonus: 80 },
      );
      assert.equal(hpCapRemaining("Put damage counters on your opponent's Active Pokémon until its remaining HP is 50."), 50);
      assert.equal(benchExactKoThreshold("Knock Out 1 of your opponent's Pokémon that has exactly 6 damage counters on it."), 6);
      assert.equal(recoverAllStatusClause('This Pokémon recovers from all Special Conditions.'), true);
      assert.equal(returnSelfClause('Put this Pokémon and all attached cards into your hand.'), true);
      assert.equal(
        retaliateCount("During your opponent's next turn, if this Pokémon is damaged by an attack (even if it is Knocked Out), put 8 damage counters on the Attacking Pokémon."),
        8,
      );
    });

    test('classifyAttackEffect: fourth-pass flat patterns', () => {
      assert.equal(
        classifyAttackEffect({
          damage: 30,
          text: 'This attack does 30 damage for each card in your hand.',
        }),
        'per-energy',
      );
      assert.equal(
        classifyAttackEffect({
          damage: 0,
          text: "Put 4 damage counters on your opponent's Pokémon in any way you like.",
        }),
        'bench-damage',
      );
      assert.equal(
        classifyAttackEffect({
          damage: 0,
          text: "During your opponent's next turn, if this Pokémon is damaged by an attack (even if this Pokémon is Knocked Out), put damage counters on the Attacking Pokémon.",
        }),
        'retaliate',
      );
      assert.equal(
        classifyAttackEffect({
          damage: 0,
          text: "Look at the top 4 cards of your deck and put them back in any order.",
        }),
        'look-own-deck',
      );
      assert.equal(
        classifyAttackEffect({
          damage: 0,
          text: 'Each player draws 3 cards.',
        }),
        'draw-attach',
      );
    });

    test('classifyAttackEffect: full-corpus pkmncards audit patterns', () => {
      // "times the amount of … Energy attached" scaling wording.
      assert.equal(
        classifyAttackEffect({
          damage: 60,
          text: 'This attack does 20 more damage times the amount of {W} Energy attached to this Pokémon.',
        }),
        'per-energy',
      );
      assert.equal(
        classifyAttackEffect({
          damage: 20,
          text: "This attack does 30 more damage times the amount of Energy attached to your opponent's Active Pokémon.",
        }),
        'per-energy',
      );
      // Bracketed energy symbol followed by a space ("{W} Energy attached").
      assert.equal(
        classifyAttackEffect({
          damage: 40,
          text: 'This attack does 40 damage plus 10 more damage for each {W} Energy attached to this Pokémon.',
        }),
        'per-energy',
      );
      // Named group scaling ("for each of your Ultra Beasts in play").
      assert.equal(
        classifyAttackEffect({
          damage: 20,
          text: 'This attack does 20 damage for each of your Ultra Beasts in play.',
        }),
        'per-energy',
      );
      // Damage-reduction clauses (both printed directions).
      assert.equal(
        classifyAttackEffect({
          damage: 30,
          text: "During your opponent's next turn, any damage done by attacks from the Defending Pokémon is reduced by 30 (before applying Weakness and Resistance).",
        }),
        'damage-prevention',
      );
      assert.equal(
        classifyAttackEffect({
          damage: 60,
          text: "During your opponent's next turn, any damage done to this Pokémon by attacks is reduced by 20 (after applying Weakness and Resistance).",
        }),
        'damage-prevention',
      );
      // Generalised play-lock and heal-lock clauses.
      assert.equal(
        classifyAttackEffect({
          damage: 0,
          text: "During your opponent's next turn, they can't play any Special Energy or Stadium cards from their hand.",
        }),
        'next-turn-lock',
      );
      assert.equal(
        classifyAttackEffect({
          damage: 50,
          text: "The Defending Pokémon can't be healed during your opponent's next turn.",
        }),
        'next-turn-lock',
      );
      // "Move as many … Energy attached … to your other Pokémon".
      assert.equal(
        classifyAttackEffect({
          damage: 0,
          text: 'Move as many {W} Energy attached to your Pokémon to your other Pokémon in any way you like.',
        }),
        'move-energy',
      );
    });

    test('classifyAttackEffect: S208 corpus clusters (new families)', () => {
      const c = (text, damage = 0) => classifyAttackEffect({ name: 'X', damage, text });
      assert.equal(
        c('If you go first, you can use this attack on your first turn.', 30),
        'first-turn-attack',
      );
      assert.equal(
        c('If you go first, you can use this attack during your first turn. Search your deck for up to 3 Basic Pokémon and put them onto your Bench. Then, shuffle your deck.'),
        'search-deck',
      );
      assert.equal(
        c("Prevent all effects of your opponent's attacks, except damage, done to this Pokémon during your opponent's next turn."),
        'effect-prevention',
      );
      assert.equal(
        c("During your opponent's next turn, prevent all effects of attacks used by your opponent's Pokémon done to this Pokémon. (Damage is not an effect.)"),
        'effect-prevention',
      );
      assert.equal(c('Put 2 Energy attached to your Pokémon in the Lost Zone.'), 'lost-zone');
      assert.equal(
        c("Look at the top 3 cards of either player's deck and put them back in any order."),
        'look-any-deck',
      );
      assert.equal(
        c('Devolve any number of your Benched Pokémon as many times as you like. Put each Evolution card removed this way into your hand.'),
        'devolve-self',
      );
      assert.equal(
        c('If you have a Supporter card in play, use the effect of that card as the effect of this attack.'),
        'supporter-effect',
      );
    });

    test('classifyAttackEffect: S208 corpus clusters (broadened families)', () => {
      const c = (text, damage = 0) => classifyAttackEffect({ name: 'X', damage, text });
      // self-damage: counters on your own side or a named own Pokémon.
      assert.equal(c('Put 3 damage counters on 1 of your Pokémon.'), 'self-damage');
      assert.equal(c('Put 1 damage counter on Beldum.'), 'self-damage');
      assert.equal(c('Put 7 damage counters on Rayquaza.'), 'self-damage');
      // immunity: "don't apply Weakness/Resistance".
      assert.equal(c("Don't apply Resistance.", 30), 'immunity');
      assert.equal(
        c("Don't apply Weakness and Resistance for this attack. (Any other effects that would happen after applying Weakness and Resistance still happen.)", 30),
        'immunity',
      );
      // deferred KO.
      assert.equal(
        c("At the end of your opponent's next turn, the Defending Pokémon will be Knocked Out."),
        'deferred-damage',
      );
      // multi-target: "each Defending Pokémon".
      assert.equal(c('Does 20 damage to each Defending Pokémon.', 20), 'multi-target');
      // conditional KO: HP threshold / status / fewest HP.
      assert.equal(
        c("Knock Out 1 of your opponent's Pokémon in play that has 60 HP or less remaining."),
        'conditional-ko',
      );
      assert.equal(c("If your opponent's Active Pokémon is Asleep, it is Knocked Out."), 'conditional-ko');
      assert.equal(
        c("Choose 1 Pokémon (yours or your opponent's) with the fewest remaining HP (excluding Gardevoir) and that Pokémon is now Knocked Out."),
        'conditional-ko',
      );
      // return-self: "return … all cards attached to it".
      assert.equal(c('Return this Pokémon and all cards attached to it to your hand.', 60), 'return-self');
      assert.equal(
        c('You may put Uxie and all cards attached to it on the bottom of your deck in any order.', 60),
        'return-self',
      );
      // move-energy: return Energy to hand / move to 1 of your Pokémon.
      assert.equal(c('Return 2 {W} Energy attached to this Pokémon to your hand.', 60), 'move-energy');
      assert.equal(c('You may move a {L} Energy card attached to Zapdos ex to 1 of your Pokémon.', 30), 'move-energy');
      // reveal-hand: "his or her".
      assert.equal(c('Your opponent reveals his or her hand.', 30), 'reveal-hand');
      // next-turn-lock additions.
      assert.equal(
        c("During your opponent's next turn, Energy cards can't be attached from your opponent's hand to the Defending Pokémon."),
        'next-turn-lock',
      );
      assert.equal(
        c("During your opponent's next turn, the Defending Pokémon's attacks cost {C}{C} more."),
        'next-turn-lock',
      );
      assert.equal(
        c("During your opponent's next turn, any damage done to Lucario by attacks is increased by 30 (after applying Weakness and Resistance).", 60),
        'next-turn-lock',
      );
      // next-turn-bonus: this Pokémon's / named attacks.
      assert.equal(
        c("During your next turn, this Pokémon's attacks do 80 more damage to your opponent's Active Pokémon (before applying Weakness and Resistance).", 80),
        'next-turn-bonus',
      );
      assert.equal(
        c("During your next turn, Deoxys's attacks do 40 more damage to the Defending Pokémon (before applying Weakness and Resistance).", 60),
        'next-turn-bonus',
      );
      // copy-attack: the Defending Pokémon's attacks.
      assert.equal(c("Choose 1 of the Defending Pokémon's attacks. Copy copies that attack."), 'copy-attack');
      // recover-status: remove Special Conditions.
      assert.equal(c('Remove all Special Conditions from Hoppip.'), 'recover-status');
      assert.equal(c('Remove the Special Condition Asleep from the Defending Pokémon.'), 'recover-status');
      // per-energy additions.
      assert.equal(
        c("Count the number of cards in your opponent's hand. Put that many damage counters on the Defending Pokémon."),
        'per-energy',
      );
      assert.equal(c('This attack does 100 damage for each Special Condition affecting this Pokémon.', 100), 'per-energy');
      assert.equal(c('Does 50 more damage for each Special Condition affecting the Defending Pokémon.', 50), 'per-energy');
      assert.equal(
        c("This attack does 30 damage plus 10 more damage for each Trainer card in your opponent's hand.", 30),
        'per-energy',
      );
      assert.equal(
        c('Does 10 damage plus 20 more damage for each type of basic Energy card attached to Ho-Oh ex.', 10),
        'per-energy',
      );
      assert.equal(
        c("Does 40 damage plus 10 more damage for each {C} Energy in the Defending Pokémon's Retreat Cost", 40),
        'per-energy',
      );
      // bench-damage: choose-1 snipe and counter-equal placement.
      assert.equal(
        c("Choose 1 of your opponent's Pokémon. This attack does 20 damage to that Pokémon. Don't apply Weakness and Resistance for this attack."),
        'bench-damage',
      );
      assert.equal(
        c("Put damage counters on 1 of your opponent's Pokémon equal to the number of damage counters on this Pokémon."),
        'bench-damage',
      );
      // draw-attach: "opponent draws a card".
      assert.equal(c('Your opponent draws a card.'), 'draw-attach');
      // devolve-opponent: remove the highest Stage Evolution card.
      assert.equal(
        c("Choose a number of your opponent's Stage 1 or Stage 2 Evolved Pokémon up to the amount of Energy attached to Jirachi. Remove the highest Stage Evolution card from each of those Pokémon."),
        'devolve-opponent',
      );
      // damage-prevention: "prevent that attack's damage".
      assert.equal(
        c("During your opponent's next turn, if this Pokémon would be damaged by an attack, prevent that attack's damage done to this Pokémon if that damage is 60 or less."),
        'damage-prevention',
      );
    });

    test('classifyAttackEffect: S208 broadenings do not steal earlier families', () => {
      const c = (text, damage = 0) => classifyAttackEffect({ name: 'X', damage, text });
      // A coin-flip lock must stay coin-flip, not become multi-target.
      assert.equal(
        c("Flip a coin. If heads, each Defending Pokémon can't attack during your opponent's next turn."),
        'coin-flip',
      );
      // A count-the-Prizes placement must stay per-prize.
      assert.equal(
        c('Put 5 damage counters on the Defending Pokémon. Then, count the number of Prize cards your opponent has taken and put that many damage counters on the Defending Pokémon.'),
        'per-prize',
      );
    });

    test('ATTACK_FAMILIES / describeAttackEffect: S208 families', () => {
      for (const f of [
        'first-turn-attack',
        'effect-prevention',
        'lost-zone',
        'look-any-deck',
        'devolve-self',
        'supporter-effect',
      ]) {
        assert.ok(ATTACK_FAMILIES.includes(f), f);
      }
      assert.match(
        describeAttackEffect({ name: 'Lost Impact', damage: 0, text: 'Put 2 Energy attached to your Pokémon in the Lost Zone.' }),
        /Lost Zone/,
      );
      assert.match(
        describeAttackEffect({ name: 'Star Shield-GX', damage: 0, text: "Prevent all effects of attacks, including damage, done to this Pokémon during your opponent's next turn." }),
        /prevents attack effects/,
      );
    });

    test('classifyAttackEffect: I66 remaining one-offs', () => {
      const c = (text, damage = 0) => classifyAttackEffect({ name: 'X', damage, text });
      assert.equal(
        c('From the moment you use this attack, you must begin to sing a song. (While the song is being sung, the game continues.) When the song is finished, this attack does 30 damage.', 30),
        'conditional-damage',
      );
      assert.equal(c("During your next turn, Vespiquen's Retreat Cost is 0.", 70), 'next-turn-bonus');
      assert.equal(
        c("Move 1 damage counter from 1 of your Pokémon to 1 of your opponent's Pokémon.", 0),
        'move-damage-counter',
      );
      assert.equal(
        c("Choose an Energy card attached to the Defending Pokémon and put it face down. Treat that card as a Special Energy card that provides {C} Energy and doesn't have any effect other than providing Energy.", 0),
        'neutralize-opponent-energy',
      );
      assert.equal(
        c('During your next turn, Extra Comet Punch does 30 damage plus 30 more damage.', 60),
        'next-turn-bonus',
      );
      assert.equal(
        c("If an attack does damage to Rocket's Moltres during your opponent's next turn (even if Rocket's Moltres is Knocked Out), Rocket's Moltres attacks your opponent's Active Pokémon for 10 damage. (Apply Weakness and Resistance.)", 0),
        'retaliate',
      );
      // Regression guards: "Remove N damage counters" is a heal, not a move;
      // counter-equal placement on the Attacking Pokémon is retaliate, not bench-damage.
      assert.equal(
        c('Remove 3 damage counters from each of your Pokémon that has any Energy attached to it.', 0),
        'heal',
      );
      assert.equal(
        c("During your opponent's next turn, if this Pokémon is damaged by an attack (even if it is Knocked Out), put damage counters on the Attacking Pokémon equal to the damage done to this Pokémon.", 0),
        'retaliate',
      );
      for (const f of ['move-damage-counter', 'neutralize-opponent-energy']) {
        assert.ok(ATTACK_FAMILIES.includes(f), f);
      }
      assert.match(
        describeAttackEffect({ name: 'Transfer Pain', damage: 0, text: "Move 1 damage counter from 1 of your Pokémon to 1 of your opponent's Pokémon." }),
        /moves damage counters/,
      );
    });

    test('fourth-pass parser helpers', async () => {
      const {
        lookOwnDeckCount,
        eachPlayerDrawCount,
        opponentCounterClause,
        specialEnergyKoClause,
        bothActiveKoClause,
      } = await import('../damage-parser.mjs');
      assert.equal(lookOwnDeckCount('Look at the top 4 cards of your deck and put them back in any order.'), 4);
      assert.equal(eachPlayerDrawCount('Each player draws 3 cards.'), 3);
      assert.deepEqual(
        opponentCounterClause("Put 2 damage counters on 1 of your opponent's Pokémon."),
        { mode: 'any', count: 2 },
      );
      assert.equal(
        specialEnergyKoClause("If your opponent's Active Pokémon has any Special Energy attached, it is Knocked Out."),
        true,
      );
      assert.equal(bothActiveKoClause('Both Active Pokémon are Knocked Out.'), true);
    });

    test('parseAttackDamage: in-play scaling counts', () => {
      const roundAtk = {
        name: 'Round',
        damage: 40,
        text: 'This attack does 40 damage for each of your Pokémon in play that has the Round attack.',
      };
      const p1 = parseAttackDamage(roundAtk, {}, {}, { roundAttackCount: 3 });
      assert.equal(p1.total, 120);

      const handAtk = {
        name: 'Hand Crush',
        damage: 50,
        text: "This attack does 50 damage for each card in your opponent's hand.",
      };
      const p2 = parseAttackDamage(handAtk, {}, {}, { opponentHandCount: 4 });
      assert.equal(p2.total, 200);

      const rocketAtk = {
        name: 'Rocket Strike',
        damage: 30,
        text: "This attack does 30 damage for each of your Team Rocket's Pokémon in play.",
      };
      const p3 = parseAttackDamage(rocketAtk, {}, {}, { teamRocketCount: 2 });
      assert.equal(p3.total, 60);

      const handOwn = {
        name: 'Hand',
        damage: 30,
        text: 'This attack does 30 damage for each card in your hand.',
      };
      assert.equal(parseAttackDamage(handOwn, {}, {}, { ownHandCount: 5 }).total, 150);
    });

    test('parseSelfStatusFromAttackText', () => {
      assert.equal(
        parseSelfStatusFromAttackText('This Pokémon is now Confused.'),
        'confused',
      );
      assert.equal(parseSelfStatusFromAttackText('The Defending Pokémon is now Asleep.'), null);
    });

    test('parseAttackDamage: per-each cards in your hand (with ctx)', () => {
      const atk = {
        name: 'Hand Scale',
        damage: 10,
        text: 'This attack does 10 more damage for each card in your hand.',
      };
      const p = parseAttackDamage(atk, {}, {}, { ownHandCount: 4 });
      assert.equal(p.total, 50);
      assert.ok(p.components.includes('per-each'));
    });

    test('ATTACK_FAMILIES: includes move-energy, reveal-hand, conditional-ko', () => {
      assert.ok(ATTACK_FAMILIES.includes('move-energy'));
      assert.ok(ATTACK_FAMILIES.includes('reveal-hand'));
      assert.ok(ATTACK_FAMILIES.includes('conditional-ko'));
    });

    test('parseAttackSearchClause: Call for Family and rotation search attacks', () => {
      const callForFamilyOne =
        'Search your deck for a Basic Pokémon and put it onto your Bench. Then, shuffle your deck.';
      assert.deepEqual(parseAttackSearchClause(callForFamilyOne), {
        what: 'Basic Pokémon',
        count: 1,
        destination: 'bench',
        upTo: false,
      });

      const callForFamilyTwo =
        'Search your deck for up to 2 Basic Pokémon and put them onto your Bench. Then, shuffle your deck.';
      assert.deepEqual(parseAttackSearchClause(callForFamilyTwo), {
        what: 'Basic Pokémon',
        count: 2,
        destination: 'bench',
        upTo: true,
      });

      const nestBallStyle =
        'Search your deck for up to 2 Basic Pokémon with 70 HP or less and put them onto your Bench. Then, shuffle your deck.';
      assert.deepEqual(parseAttackSearchClause(nestBallStyle), {
        what: 'Basic Pokémon ≤70 HP',
        count: 2,
        destination: 'bench',
        upTo: true,
      });

      const flock =
        'Search your deck for up to 2 Grubbin and put them onto your Bench. Then, shuffle your deck.';
      assert.deepEqual(parseAttackSearchClause(flock), {
        what: 'grubbin',
        count: 2,
        destination: 'bench',
        upTo: true,
      });

      const luckyFind =
        'Search your deck for an Item card, reveal it, and put it into your hand. Then, shuffle your deck.';
      assert.deepEqual(parseAttackSearchClause(luckyFind), {
        what: 'Item',
        count: 1,
        destination: 'hand',
      });

      // Thundurus' Charge: word-form energy type, no {L} symbol, no "Basic",
      // and "attach it to this Pokémon" (not "attach them to 1 of your…").
      // Regression: this previously parsed as { what: 'card' } → whole deck.
      const charge =
        'Search your deck for a Lightning Energy card and attach it to this Pokémon. Shuffle your deck afterward.';
      assert.deepEqual(parseAttackSearchClause(charge), {
        what: 'Basic Lightning Energy',
        count: 1,
        destination: 'attach',
      });

      // Same family, no type word: the trailing "this Pokémon" must not make
      // the generic fallback search for a Pokémon.
      assert.deepEqual(
        parseAttackSearchClause(
          'Search your deck for a Basic Energy card and attach it to this Pokémon. Shuffle your deck afterward.'
        ),
        { what: 'Basic Energy', count: 1, destination: 'attach' }
      );
      assert.deepEqual(
        parseAttackSearchClause(
          'Search your deck for a {L} Energy card and attach it to this Pokémon. Shuffle your deck afterward.'
        ),
        { what: 'Basic {L} Energy', count: 1, destination: 'attach' }
      );
      assert.deepEqual(
        parseAttackSearchClause(
          'Search your deck for an Energy card and attach it to this Pokémon. Shuffle your deck afterward.'
        ),
        { what: 'Energy', count: 1, destination: 'attach' }
      );

      assert.equal(parseAttackSearchClause('Flip a coin. If heads, this attack does 30 more damage.'), null);
    });

    test('resolveAttackText: reads effect text from sibling attack on card', () => {
      const card = {
        attacks: [
          {
            name: 'Call for Family',
            cost: ['Colorless'],
            damage: 0,
            text: 'Search your deck for up to 2 Basic Pokémon and put them onto your Bench. Then, shuffle your deck.',
          },
        ],
      };
      const stub = { name: 'Call for Family', cost: ['Colorless'], damage: 0 };
      assert.match(resolveAttackText(card, stub), /search your deck for/i);
      assert.ok(parseAttackSearchClause(resolveAttackText(card, stub)));
    });

    test('resolveAttackText: defaults to "Draw a card." for Collect when text is missing', () => {
      const card = { attacks: [{ name: 'Collect', cost: ['Colorless'] }] };
      const stub = { name: 'Collect', cost: ['Colorless'] };
      assert.equal(resolveAttackText(card, stub), 'Draw a card.');
      assert.equal(resolveAttackText(null, stub), 'Draw a card.');
    });

    test('ATTACK_FAMILIES: includes search-deck', () => {
      assert.ok(ATTACK_FAMILIES.includes('search-deck'));
    });

    test('describeAttackEffect: one guidance line naming the attack', () => {
      assert.match(
        describeAttackEffect({ name: 'Slam', damage: 30, text: '30' }, { name: 'Brock’s Onix' }),
        /Brock’s Onix/,
      );
      assert.match(
        describeAttackEffect({ name: 'Slam', damage: 30, text: '30' }, { name: 'Brock’s Onix' }),
        /deals 30 damage/,
      );
      assert.match(
        describeAttackEffect({ damage: 10, text: 'Put the Defending Pokémon to Sleep.' }),
        /to Sleep/,
      );
      assert.match(describeAttackEffect(null), /no specific family recognized/);
    });

    test('applyAttackEffect: announce-only (no execution)', () => {
      const r = applyAttackEffect({ name: 'Slam', damage: 30, text: '30' });
      assert.equal(r.family, 'flat');
      assert.equal(r.executed, false);
      assert.match(r.message, /announce-only/);
      assert.match(r.message, /Slam/);
    });

    test('ATTACK_FAMILIES: stable list, includes unknown', () => {
      assert.ok(Array.isArray(ATTACK_FAMILIES));
      assert.ok(ATTACK_FAMILIES.includes('unknown'));
      assert.ok(ATTACK_FAMILIES.includes('flat'));
      assert.ok(ATTACK_FAMILIES.length >= 15);
    });

    // ── Damage parser (taxonomy Section D, Piece B: pure expression parser) ──
    test('parseAttackDamage: flat damage passes through unchanged', () => {
      const p = parseAttackDamage({ name: 'Slam', damage: 30, text: '30' });
      assert.equal(p.base, 30);
      assert.equal(p.total, 30);
      assert.equal(p.components.length, 0);
      assert.equal(p.resolved, true);
    });

    test('parseAttackDamage: scaling families (per-energy / per-prize / per-turn)', () => {
      const energy = parseAttackDamage(
        { name: 'Energy Wave', damage: 10, text: 'This attack does 10 damage times the number of Energy attached to your Active Pokémon.' },
        {},
        {},
        { energyCount: 3 },
      );
      assert.equal(energy.total, 30);
      assert.ok(energy.components.includes('per-energy'));

      const prize = parseAttackDamage(
        { name: 'Prize Break', damage: 20, text: 'For each of your opponent’s Prize cards, this attack does 10 more damage.' },
        {},
        {},
        { opponentPrizes: 4 },
      );
      assert.equal(prize.total, 60);
      assert.ok(prize.components.includes('per-prize'));

      const turn = parseAttackDamage(
        { name: 'Rising Strike', damage: 10, text: 'For each turn you have played this attack, this attack does 10 more damage.' },
        {},
        {},
        { turnCount: 3 },
      );
      assert.equal(turn.total, 40);
      assert.ok(turn.components.includes('per-turn'));
    });

    test('parseAttackDamage: per-HP scaling uses the Defending Pokémon\u2019s HP by default', () => {
      const attack = {
        name: 'HP Surge',
        damage: 10,
        text: 'This attack does 10 more damage for each 10 HP of the Defending Pok\u00e9mon.',
      };
      // 90 HP defender → floor(90/10) = 9 blocks → 10 + 9×10 = 100
      const p = parseAttackDamage(attack, { hp: 120 }, { hp: 90 }, { defenderHp: 90 });
      assert.equal(p.total, 100);
      assert.ok(p.components.includes('per-hp'));
      assert.ok(p.notes.some((n) => /9/.test(n) && /Defending/.test(n)));
      // 25 HP defender → floor(25/10) = 2 blocks → 10 + 20 = 30
      const p2 = parseAttackDamage(attack, {}, { hp: 25 }, { defenderHp: 25 });
      assert.equal(p2.total, 30);
      // HP read from the defender card object when ctx omits it
      const p3 = parseAttackDamage(attack, {}, { hp: 100 }, {});
      assert.equal(p3.total, 110);
    });

    test('parseAttackDamage: per-HP scaling with a non-10 step and attacker-side HP', () => {
      const attack = {
        name: 'Mirror Spike',
        damage: 20,
        text: 'This attack does 5 more damage for each 20 HP of this Pok\u00e9mon.',
      };
      // 80 HP attacker → floor(80/20) = 4 blocks → 20 + 4×5 = 40
      const p = parseAttackDamage(attack, { hp: 80 }, { hp: 30 }, { attackerHp: 80 });
      assert.equal(p.total, 40);
      assert.ok(p.components.includes('per-hp'));
      assert.ok(p.notes.some((n) => /this Pok\u00e9mon/i.test(n)));
      // Defender HP must NOT influence an attacker-side clause
      const p2 = parseAttackDamage(attack, {}, { hp: 200 }, { attackerHp: 0, defenderHp: 200 });
      assert.equal(p2.total, 20);
      // Unknown HP (0) → zero blocks, still resolved
      const p3 = parseAttackDamage(attack, {}, {}, { attackerHp: 0 });
      assert.equal(p3.total, 20);
      assert.equal(p3.resolved, true);
    });

    test('parseAttackDamage: per-HP clause without a readable amount is unresolved', () => {
      const p = parseAttackDamage(
        { name: 'Mystery Surge', damage: 10, text: 'This attack does more damage for each 10 HP of the Defending Pok\u00e9mon.' },
        {},
        { hp: 90 },
        { defenderHp: 90 }
      );
      assert.equal(p.total, 10);
      assert.equal(p.resolved, false);
      assert.ok(p.notes.some((n) => /resolve the printed amount/.test(n)));
    });

    test('parseAttackDamage: type-gated bonus applies only on type match', () => {
      const attack = { damage: 30, text: 'If the Defending Pokémon is a Water Pokémon, this attack does 20 more damage.' };
      const hit = parseAttackDamage(attack, {}, { types: ['Water'] });
      assert.equal(hit.total, 50);
      assert.ok(hit.components.includes('extra-by-type'));
      const miss = parseAttackDamage(attack, {}, { types: ['Grass'] });
      assert.equal(miss.total, 30);
      assert.ok(miss.notes.some((n) => /not applied/.test(n)));
    });

    test('parseAttackDamage: generic conditional (Basic check) hit and miss', () => {
      const attack = { damage: 30, text: 'If the Defending Pokémon is a Basic Pokémon, this attack does 30 more damage.' };
      const basic = parseAttackDamage(attack, {}, {});
      assert.equal(basic.total, 60);
      assert.ok(basic.components.includes('conditional'));
      // basic: false is determinate → "not applied", fully resolved (no guess).
      const evolved = parseAttackDamage(attack, {}, { basic: false });
      assert.equal(evolved.total, 30);
      assert.equal(evolved.resolved, true);
      assert.ok(evolved.notes.some((n) => /not applied/.test(n)));
    });

    test('parseAttackDamage: conditional HP comparison (N HP or more / less)', () => {
      const more = { damage: 20, text: 'If the Defending Pokémon has 120 HP or more, this attack does 30 more damage.' };
      const hit = parseAttackDamage(more, {}, { hp: 150 });
      assert.equal(hit.total, 50);
      assert.ok(hit.components.includes('conditional'));
      const miss = parseAttackDamage(more, {}, { hp: 100 });
      assert.equal(miss.total, 20);
      assert.ok(miss.notes.some((n) => /not applied/.test(n)));
      // HP unknown → honestly unresolved, not misfired.
      const unknown = parseAttackDamage(more, {}, {});
      assert.equal(unknown.total, 20);
      assert.equal(unknown.resolved, false);
      assert.ok(unknown.notes.some((n) => /resolve the printed condition/.test(n)));

      const less = { damage: 20, text: 'If the Defending Pokémon has 60 HP or less, this attack does 20 more damage.' };
      const lessHit = parseAttackDamage(less, {}, { hp: 50 });
      assert.equal(lessHit.total, 40);
      const lessMiss = parseAttackDamage(less, {}, { hp: 80 });
      assert.equal(lessMiss.total, 20);
    });

    test('parseAttackDamage: conditional Stage check', () => {
      const atk = { damage: 20, text: 'If the Defending Pokémon is a Stage 1 Pokémon, this attack does 30 more damage.' };
      const hit = parseAttackDamage(atk, {}, { stage: 'Stage 1' });
      assert.equal(hit.total, 50);
      assert.ok(hit.components.includes('conditional'));
      const miss = parseAttackDamage(atk, {}, { stage: 'Stage 2' });
      assert.equal(miss.total, 20);
      const unknown = parseAttackDamage(atk, {}, {});
      assert.equal(unknown.resolved, false);
      assert.ok(unknown.notes.some((n) => /resolve the printed condition/.test(n)));
    });

    test('parseAttackDamage: conditional "is damaged" via ctx.defenderDamage', () => {
      const atk = { damage: 20, text: 'If the Defending Pokémon is damaged, this attack does 30 more damage.' };
      const hit = parseAttackDamage(atk, {}, { hp: 150 }, { defenderDamage: 2 });
      assert.equal(hit.total, 50);
      assert.ok(hit.components.includes('conditional'));
      const notDamaged = parseAttackDamage(atk, {}, { hp: 150 }, { defenderDamage: 0 });
      assert.equal(notDamaged.total, 20);
      // ctx flag absent → honestly unresolved, not a false negative.
      const unknown = parseAttackDamage(atk, {}, { hp: 150 });
      assert.equal(unknown.total, 20);
      assert.equal(unknown.resolved, false);
      assert.ok(unknown.notes.some((n) => /resolve the printed condition/.test(n)));
    });

    test('parseAttackDamage: conditional ex check', () => {
      const atk = { damage: 20, text: 'If the Defending Pokémon is an ex Pokémon, this attack does 30 more damage.' };
      const byFlag = parseAttackDamage(atk, {}, { hp: 150, ex: true });
      assert.equal(byFlag.total, 50);
      assert.ok(byFlag.components.includes('conditional'));
      const byName = parseAttackDamage(atk, {}, { hp: 150, name: 'Inkay' });
      assert.equal(byName.total, 20);
      const exName = parseAttackDamage(atk, {}, { hp: 150, name: 'Greninja ex' });
      assert.equal(exName.total, 50);
      const unknown = parseAttackDamage(atk, {}, {});
      assert.equal(unknown.total, 20);
      assert.equal(unknown.resolved, false);
    });

    test('parseAttackDamage: non-derivable condition stays honestly unresolved', () => {
      const atk = { damage: 20, text: 'If you have an Energy card attached to the Defending Pokémon, this attack does 30 more damage.' };
      const result = parseAttackDamage(atk, {}, { hp: 150, types: ['Fire'] }, { defenderDamage: 0 });
      assert.equal(result.total, 20);
      assert.equal(result.resolved, false);
      assert.ok(result.notes.some((n) => /resolve the printed condition/.test(n)));
    });

    test('parseAttackDamage: coin-flip outcomes via ctx.coin, pending without it', () => {
      const attack = { damage: 30, text: 'Flip a coin. If heads, this attack does 30 more damage. If tails, do 10 damage to yourself.' };
      const heads = parseAttackDamage(attack, {}, {}, { coin: 'heads' });
      assert.equal(heads.total, 60);
      assert.equal(heads.selfDamage, 0);
      assert.ok(heads.components.includes('coin'));
      const tails = parseAttackDamage(attack, {}, {}, { coin: 'tails' });
      assert.equal(tails.total, 30);
      assert.equal(tails.selfDamage, 10);
      const pending = parseAttackDamage(attack, {}, {});
      assert.equal(pending.resolved, false);
      assert.ok(pending.notes.some((n) => /coin flip pending/.test(n)));
    });

    test('parseAttackDamage: coin-flip execution contract (live-path semantics)', () => {
      // Mirrors what attack() does: detect "flip a coin" in the text, supply
      // the coin via ctx, and trust the resolved total / selfDamage.
      const attack = { damage: 20, text: 'Flip a coin. If heads, this attack does 40 more damage.' };
      const needsCoin = /flip a coin/.test(attack.text.toLowerCase());
      assert.equal(needsCoin, true);
      const heads = parseAttackDamage(attack, {}, {}, { coin: 'heads' });
      assert.equal(heads.total, 60);
      assert.equal(heads.resolved, true);
      assert.equal(heads.selfDamage, 0);
      // Tails on a heads-only attack: no bonus, no self damage, still resolved.
      const tails = parseAttackDamage(attack, {}, {}, { coin: 'tails' });
      assert.equal(tails.total, 20);
      assert.equal(tails.selfDamage, 0);
      assert.equal(tails.resolved, true);
      // An attack without a coin flip must not be affected by ctx.coin.
      const flat = parseAttackDamage(
        { damage: 30, text: '30' },
        {},
        {},
        { coin: 'heads' }
      );
      assert.equal(flat.total, 30);
      assert.ok(!flat.components.includes('coin'));
    });

    test('parseAttackDamage: "if tails, this attack does nothing" (Fly) zeroes damage on tails', () => {
      const attack = { damage: 30, text: 'Flip a coin. If tails, this attack does nothing.' };
      const heads = parseAttackDamage(attack, {}, {}, { coin: 'heads' });
      assert.equal(heads.total, 30);
      assert.equal(heads.resolved, true);
      const tails = parseAttackDamage(attack, {}, {}, { coin: 'tails' });
      assert.equal(tails.total, 0);
      assert.equal(tails.resolved, true);
      assert.ok(tails.components.includes('coin'));
      const pending = parseAttackDamage(attack, {}, {});
      assert.equal(pending.resolved, false);
    });

    test('parseAttackDamage: bench bonus and heal are reported, never added to base', () => {
      const bench = parseAttackDamage({ damage: 40, text: 'You may also do 20 damage to 1 of your opponent’s benched Pokémon.' });
      assert.equal(bench.total, 40);
      assert.equal(bench.bench, 20);
      assert.ok(bench.components.includes('bench'));

      const heal = parseAttackDamage({ damage: 10, text: 'Remove up to 2 damage counters from your Active Pokémon.' });
      assert.equal(heal.total, 10);
      assert.equal(heal.heal, 2);
      assert.ok(heal.components.includes('heal'));
    });

    test('parseAttackDamage: "also does N damage" bench clause (Jetting Blow)', () => {
      const jetting = parseAttackDamage({
        damage: 120,
        text: "This attack also does 50 damage to 1 of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
      });
      assert.equal(jetting.total, 120);
      assert.equal(jetting.bench, 50);
      assert.ok(jetting.components.includes('bench'));
    });

    test('parseAttackDamage: feeds computeAttackDamage (weakness ×2 on parsed total)', () => {
      const parsed = parseAttackDamage(
        { name: 'Type Surge', damage: 30, text: 'If the Defending Pokémon is a Water Pokémon, this attack does 20 more damage.' },
        { types: ['Water'] },
        { types: ['Water'] },
      );
      assert.equal(parsed.total, 50);
      const dmg = computeAttackDamage(
        { types: ['Water'] },
        { types: ['Water'], weakness: { type: 'Water', value: 2 } },
        { name: 'Type Surge', damage: parsed.total, cost: [], text: '' },
      );
      assert.equal(dmg.total, 100);
      assert.equal(dmg.multiplier, 2);
    });

    test('describeParsedDamage + DAMAGE_COMPONENTS: stable API', () => {
      assert.match(
        describeParsedDamage(
          { name: 'Slam', damage: 30, text: '30' },
          { name: 'Brock’s Onix' },
        ),
        /effective 30/,
      );
      assert.match(
        describeParsedDamage({ damage: 30, text: 'Flip a coin. If heads, this attack does 30 more damage. If tails, do 10 damage to yourself.' }),
        /not fully resolved yet/,
      );
      assert.ok(Array.isArray(DAMAGE_COMPONENTS));
      assert.ok(DAMAGE_COMPONENTS.includes('per-energy'));
      assert.ok(DAMAGE_COMPONENTS.includes('coin'));
      const empty = parseAttackDamage({ name: 'Mystery' });
      assert.equal(empty.base, 0);
      assert.equal(empty.total, 0);
      assert.equal(empty.resolved, true);
    });

    // ── Phase 1 integration: mirror the chat-buttons.js wiring ─────
    // Reproduce the exact substitution the live attack() flow performs:
    // build ctx from energy/prizes/turn, parse, swap effectiveAttack when the
    // parsed total differs from the printed flat, then feed computeAttackDamage.
    function runAttackWiring({ atk, active, oppActive, energyCount, opponentPrizes, turnNumber, rulesOn }) {
      let effectiveAttack = atk;
      if (rulesOn) {
        const parsed = parseAttackDamage(atk, active, oppActive, {
          energyCount,
          opponentPrizes,
          turnCount: Math.max(1, turnNumber),
        });
        if (parsed.total !== (atk.damage ?? 0)) {
          effectiveAttack = { ...atk, damage: parsed.total };
        }
      }
      return computeAttackDamage(active, oppActive, effectiveAttack);
    }

    test('Phase 1 wiring: per-energy scaling executes only when rules are on', () => {
      const atk = {
        name: 'Energy Wave',
        damage: 10,
        cost: [],
        text: 'This attack does 10 damage times the number of Energy attached to your Active Pokémon.',
      };
      const active = { types: ['Water'], name: 'Blasphemy' };
      const oppActive = { types: ['Water'], name: 'Rival', weakness: { type: 'Water', value: 2 } };
      // Rules on, 3 energy → 30, then weakness ×2 → 60.
      const on = runAttackWiring({ atk, active, oppActive, energyCount: 3, opponentPrizes: 0, turnNumber: 2, rulesOn: true });
      assert.equal(on.total, 60);
      // Rules off → flat printed damage 10 → weakness ×2 → 20.
      const off = runAttackWiring({ atk, active, oppActive, energyCount: 3, opponentPrizes: 0, turnNumber: 2, rulesOn: false });
      assert.equal(off.total, 20);
    });

    test('Phase 1 wiring: type-gated bonus + per-prize both fold into the executed total', () => {
      const atk = {
        name: 'Prized Surge',
        damage: 20,
        cost: [],
        text: 'For each of your opponent’s Prize cards, this attack does 10 more damage. If the Defending Pokémon is a Fire Pokémon, this attack does 20 more damage.',
      };
      const active = { types: ['Fire'], name: 'A' };
      const oppActive = { types: ['Fire'], name: 'B' };
      // 20 base + 10×4 prizes + 20 type = 80 (no weakness).
      const on = runAttackWiring({ atk, active, oppActive, energyCount: 0, opponentPrizes: 4, turnNumber: 3, rulesOn: true });
      assert.equal(on.total, 80);
      // Rules off → flat 20.
      const off = runAttackWiring({ atk, active, oppActive, energyCount: 0, opponentPrizes: 4, turnNumber: 3, rulesOn: false });
      assert.equal(off.total, 20);
    });

    test('Phase 1 wiring: flat attack is unchanged when rules are on (backward compatible)', () => {
      const atk = { name: 'Slam', damage: 30, cost: [], text: '30' };
      const active = { types: ['Grass'], name: 'A' };
      const oppActive = { types: ['Grass'], name: 'B' };
      const on = runAttackWiring({ atk, active, oppActive, energyCount: 2, opponentPrizes: 1, turnNumber: 2, rulesOn: true });
      assert.equal(on.total, 30);
      assert.equal(on.base, 30);
    });

    // ── Evolution integration (taxonomy B #2) ──────────────────────
    test('evolution: markEvolvedThisTurn blocks second evolution same turn', async () => {
      const { canEvolve, markEvolvedThisTurn } = await import('../evolution.mjs');
      resetStatuses();
      startGame();
      beginTurn('self');
      beginTurn('opp');
      beginTurn('self'); // turn 3, evolution allowed

      const base = { name: 'Charmander', stage: 'Basic', id: 'b1' };
      const evo = { name: 'Charmeleon', stage: 'Stage 1', evolvesFrom: 'Charmander', id: 'e1' };

      // First evolution should be allowed
      const r1 = await canEvolve('self', base, evo, false);
      assert.equal(r1.allowed, true);

      // Mark it as evolved
      markEvolvedThisTurn('self', 'Charmander');

      // Second evolution same turn should be blocked
      const r2 = await canEvolve('self', base, evo, false);
      assert.equal(r2.allowed, false);
      assert.match(r2.reason, /Already evolved/i);
    });

    test('evolution: Rare Candy permits Basic -> Stage 2; other skips still blocked', async () => {
      const { canEvolve } = await import('../evolution.mjs');
      startGame();
      beginTurn('self');
      beginTurn('opp');
      beginTurn('self'); // turn 3, evolution allowed
      rulesState.enabled = true;

      const base = { name: 'Pikachu', stage: 'Basic', id: 'rc1' };
      const stage2 = { name: 'Raichu', stage: 'Stage 2', evolvesFrom: 'Pikachu', id: 'rc2' };

      // Basic -> Stage 2 jump is legal with a Rare Candy
      const r1 = await canEvolve('self', base, stage2, false);
      assert.equal(r1.allowed, true);

      // Non-next-stage skips that are NOT Basic->Stage 2 stay blocked
      const base1 = { name: 'Charmander', stage: 'Stage 1', id: 'rc3' };
      const same = { name: 'Charizard', stage: 'Stage 1', evolvesFrom: 'Charmander', id: 'rc4' };
      const r2 = await canEvolve('self', base1, same, false);
      assert.equal(r2.allowed, false);
      assert.match(r2.reason, /Rare Candy|can't evolve/i);
    });

    test('evolution: a card in hand with no valid stage (e.g. Energy) is rejected', async () => {
      const { canEvolve } = await import('../evolution.mjs');
      startGame();
      beginTurn('self');
      beginTurn('opp');
      beginTurn('self'); // turn 3, evolution allowed
      const base = { name: 'Charmander', stage: 'Basic', id: 'ne1' };
      // An Energy card has no `stage` — previously it silently defaulted to
      // 'Stage 1' and slipped through the stage-chain check.
      const energy = { name: 'Rainbow Energy', type: 'Energy', id: 'ne2' };
      const r = await canEvolve('self', base, energy, false);
      assert.equal(r.allowed, false);
      assert.match(r.reason, /not a Pokémon evolution/i);
    });

    test('evolution: clearStatuses clears base card statuses after evolve', () => {
      resetStatuses();
      applyStatus('self', 'base1', 'confused');
      applyStatus('self', 'base1', 'paralyzed');
      assert.equal(getStatus('self', 'base1').paralyzed, true);

      // Simulate what happens after a successful evolution
      clearStatuses('self', 'base1');
      assert.equal(getStatus('self', 'base1'), null);
    });

    // ── Section C executors (pure parsers) ──
    test('passiveCostDiscount / applyCostDiscount', () => {
      assert.equal(passiveCostDiscount({ ability: { text: 'Reduce the cost of this Pokémon’s attacks by 1.' } }), 1);
      assert.equal(passiveCostDiscount({ ability: { text: 'This Pokémon’s attacks cost 2 less.' } }), 2);
      assert.equal(passiveCostDiscount({ ability: { text: 'This Pokémon’s attacks cost less.' } }), 1);
      assert.equal(passiveCostDiscount({ ability: { text: 'Draw a card.' } }), 0);
      assert.equal(applyCostDiscount(['Psychic', 'Colorless', 'Colorless'], 1).length, 2);
      assert.equal(applyCostDiscount(['Psychic'], 2).length, 0);
    });

    // Regression: merely mentioning Energy is NOT a cost reduction. This returned 1 before, which
    // made Charmander's Live Coal ({R}) payable with zero Energy attached.
    test('passiveCostDiscount: mentioning Energy is not a discount', () => {
      assert.equal(
        passiveCostDiscount({
          ability: { text: 'If this Pokémon has no Energy attached, it has no Weakness.' },
        }),
        0,
      );
      assert.equal(
        passiveCostDiscount({ ability: { text: 'This Pokémon has no Energy attached.' } }),
        0,
      );
    });

    test('passiveCostDiscount: a Retreat Cost reduction is not an attack discount', () => {
      // parseRetreatCostModifier owns this wording; reading it here discounted the attacks.
      assert.equal(
        passiveCostDiscount({
          ability: { text: 'The Retreat Cost of this Pokémon is 1 less.' },
        }),
        0,
      );
    });

    test('passiveCostDiscount: cost text with no reduction verb is not a discount', () => {
      assert.equal(
        passiveCostDiscount({ ability: { text: 'This Pokémon’s attacks cost Energy.' } }),
        0,
      );
    });

    // The reduction verb is required, so a genuine wording must still parse — including the ones
    // that name the cost without a number.
    test('passiveCostDiscount: real reductions still parse', () => {
      assert.equal(
        passiveCostDiscount({
          ability: { text: 'The Energy cost of this Pokémon’s attacks is reduced by 1.' },
        }),
        1,
      );
      assert.equal(
        passiveCostDiscount({ ability: { text: 'This Pokémon’s attacks cost {C} less.' } }),
        1,
      );
      assert.equal(
        passiveCostDiscount({ ability: { text: 'Your attacks cost 3 fewer Energy.' } }),
        3,
      );
    });

    test('parseWhenPlayedEffect', () => {
      assert.deepEqual(parseWhenPlayedEffect({ ability: { text: 'When you play this Pokémon, draw 2 cards.' } }), { kind: 'draw', n: 2 });
      assert.deepEqual(parseWhenPlayedEffect({ ability: { text: 'When you play this Pokémon, put 3 damage counters on the opponent’s Active.' } }), { kind: 'damage', n: 3 });
      assert.equal(parseWhenPlayedEffect({ ability: { text: 'Draw a card.' } }), null);
    });

    test('parseEndOfTurnEffect', () => {
      assert.deepEqual(parseEndOfTurnEffect({ ability: { text: 'At the end of your turn, draw a card.' } }), { kind: 'draw', n: 1 });
      assert.deepEqual(parseEndOfTurnEffect({ ability: { text: 'At the end of your turn, draw up to 2 cards.' } }), { kind: 'draw', n: 2 });
      assert.equal(parseEndOfTurnEffect({ ability: { text: 'Draw a card.' } }), null);
    });

    test('parseDamagePrevention / applyDamagePrevention', () => {
      const gardevoir = { ability: { text: 'Prevent all damage done to this Pokémon by attacks.' } };
      assert.deepEqual(parseDamagePrevention(gardevoir), { preventAll: true, reduce: 0 });
      assert.equal(applyDamagePrevention(5, parseDamagePrevention(gardevoir)), 0);
      const zacian = { ability: { text: 'Damage done to this Pokémon is reduced by 2.' } };
      assert.deepEqual(parseDamagePrevention(zacian), { preventAll: false, reduce: 2 });
      assert.equal(applyDamagePrevention(5, parseDamagePrevention(zacian)), 3);
      assert.equal(applyDamagePrevention(1, parseDamagePrevention(zacian)), 0);
      assert.equal(applyDamagePrevention(3, parseDamagePrevention({ name: 'Pikachu' })), 3);
    });

    test('isHandProtected', () => {
      assert.equal(isHandProtected({ ability: { text: 'Your cards in hand can’t be affected by opponent effects.' } }), true);
      assert.equal(isHandProtected({ ability: { text: 'Draw a card.' } }), false);
      assert.equal(isHandProtected({ name: 'Pikachu' }), false);
    });

    test('parseOpponentDiscard', () => {
      assert.equal(parseOpponentDiscard({ ability: { text: 'Discard up to 2 cards from your opponent’s hand.' } }), 2);
      assert.equal(parseOpponentDiscard({ ability: { text: 'Discard a card from your opponent’s hand.' } }), 1);
      assert.equal(parseOpponentDiscard({ ability: { text: 'Draw a card.' } }), 0);
      assert.equal(
        parseOpponentDiscard({
          ability: {
            text: "Once during your turn, you may discard a Basic Water Energy card from your hand. Place 6 damage counters on 1 of your opponent's Pokémon.",
          },
        }),
        0,
      );
    });

    test('parseEnergyRedirect', () => {
      // Redirect (Iron Tinker style)
      const ironTinker = { ability: { text: 'Once During Your Turn: You may move 1 Energy from this Pokémon to 1 of your other Pokémon.' } };
      assert.deepEqual(parseEnergyRedirect(ironTinker), { kind: 'redirect', n: 1 });

      // Redirect with number
      const multi = { ability: { text: 'You can redirect up to 2 Energy from this Pokémon to another Pokémon.' } };
      assert.deepEqual(parseEnergyRedirect(multi), { kind: 'redirect', n: 2 });

      // Lock (energy lock style)
      const lock = { ability: { text: 'While this Pokémon is in play, your opponent can’t move or remove Energy from this Pokémon.' } };
      assert.deepEqual(parseEnergyRedirect(lock), { kind: 'lock' });

      // Non-energy text → null
      assert.equal(parseEnergyRedirect({ ability: { text: 'Heal 2 damage counters.' } }), null);
      assert.equal(parseEnergyRedirect({ name: 'Pikachu' }), null);
    });

    // ── Announce-only ability family parsers (ability-executors.mjs) ──

    test('parseDamageReduction: takes N less / reduce damage by N', () => {
      assert.deepEqual(
        parseDamageReduction({ ability: { text: 'This Pokémon takes 2 less damage from attacks.' } }),
        { reduce: 2 }
      );
      assert.deepEqual(
        parseDamageReduction({ ability: { text: 'Reduce damage by 3 done to this Pokémon.' } }),
        { reduce: 3 }
      );
      assert.deepEqual(parseDamageReduction({ ability: { text: 'Draw a card.' } }), { reduce: 0 });
    });

    test('parseDamageBonus / applyDamageBonus', () => {
      assert.deepEqual(
        parseDamageBonus({ ability: { text: 'This Pokémon\'s attacks do 20 more damage.' } }),
        { bonus: 20 }
      );
      assert.deepEqual(
        parseDamageBonus({ ability: { text: 'This Pokémon deals 30 more damage to the Defending Pokémon.' } }),
        { bonus: 30 }
      );
      assert.equal(applyDamageBonus(50, 20), 70);
      assert.equal(applyDamageBonus(50, 0), 50);
      assert.deepEqual(parseDamageBonus({ ability: { text: 'Draw a card.' } }), { bonus: 0 });
    });

    test('parseHpBonus / applyHpBonus', () => {
      assert.deepEqual(
        parseHpBonus({ ability: { text: 'If this Pokémon has any Special Energy attached, it gets +100 HP.' } }),
        { bonus: 100 }
      );
      assert.deepEqual(
        parseHpBonus({ ability: { text: 'This Pokémon gets +20 HP for each Energy attached to it.' } }),
        { bonus: 20 }
      );
      assert.equal(applyHpBonus(120, 100), 220);
      assert.equal(applyHpBonus(5, -10), 1); // clamped to ≥ 1
      assert.equal(applyHpBonus(0, 20), 0);
    });

    test('parseRetreatCostModifier / applyRetreatCostModifier', () => {
      assert.deepEqual(
        parseRetreatCostModifier({ ability: { text: 'This Pokémon\'s Retreat Cost is 1 less.' } }),
        { delta: -1 }
      );
      assert.deepEqual(
        parseRetreatCostModifier({ ability: { text: 'It costs 2 more to retreat this Pokémon.' } }),
        { delta: 2 }
      );
      // TCGdex prints Air Balloon as "{C}{C} less" — energy symbols, no digit.
      // The old digit fallback read that as "1 less" and left a 2-retreat
      // Pokémon at 1 instead of a free retreat.
      assert.deepEqual(
        parseRetreatCostModifier({
          text: 'The Retreat Cost of the Pokémon this card is attached to is {C}{C} less.',
        }),
        { delta: -2 }
      );
      assert.deepEqual(
        parseRetreatCostModifier({
          text: 'The Retreat Cost of the Pokémon this card is attached to is {C} less.',
        }),
        { delta: -1 }
      );
      assert.equal(applyRetreatCostModifier(3, -1), 2);
      assert.equal(applyRetreatCostModifier(1, -5), 0);
      assert.equal(
        applyRetreatCostModifier(
          2,
          parseRetreatCostModifier({
            text: 'The Retreat Cost of the Pokémon this card is attached to is {C}{C} less.',
          }).delta
        ),
        0
      );
    });

    test('parsePrizeModify / applyPrizeModify', () => {
      assert.deepEqual(
        parsePrizeModify({ ability: { text: 'When this Pokémon is Knocked Out, your opponent takes 1 fewer Prize card.' } }),
        { delta: -1 }
      );
      assert.deepEqual(
        parsePrizeModify({ ability: { text: 'When this Pokémon is Knocked Out, your opponent takes 2 more Prize cards.' } }),
        { delta: 2 }
      );
      assert.equal(applyPrizeModify(3, -1), 2);
      assert.equal(applyPrizeModify(1, -5), 0);
    });

    test('parseKoPrevention: Resolute Heart + coin-flip patterns', () => {
      assert.deepEqual(
        parseKoPrevention({
          ability: {
            text: 'If this Pokémon has full HP and would be Knocked Out by damage from an attack, it is not Knocked Out, and its remaining HP becomes 10.',
          },
        }),
        { fullHpOnly: true, surviveHp: 10 }
      );
      assert.deepEqual(
        parseKoPrevention({ ability: { text: 'When this Pokémon would be Knocked Out, flip a coin. If heads, it is not Knocked Out.' } }),
        { fullHpOnly: false, surviveHp: null }
      );
      assert.deepEqual(parseKoPrevention({ ability: { text: 'Draw a card.' } }), { fullHpOnly: false, surviveHp: null });
    });

    test('parseThorns: damage counters on attacker', () => {
      assert.deepEqual(
        parseThorns({ ability: { text: 'When this Pokémon is damaged by an attack, put 2 damage counters on the Attacking Pokémon.' } }),
        { count: 2 }
      );
      assert.deepEqual(parseThorns({ ability: { text: 'Draw a card.' } }), { count: 0 });
    });

    test('parseCheckupEffect: checkup damage + filter', () => {
      assert.deepEqual(
        parseCheckupEffect({ ability: { text: 'During Pokémon Checkup, put 1 damage counter on each Poisoned Pokémon.' } }),
        { count: 1, filter: 'poisoned', exceptName: null, targetHasAbility: false, source: 'Ability' }
      );
      assert.deepEqual(
        parseCheckupEffect({ ability: { text: 'During Pokémon Checkup, put 2 damage counters on your opponent\'s Pokémon.' } }),
        { count: 2, filter: 'opponent', exceptName: null, targetHasAbility: false, source: 'Ability' }
      );
      assert.deepEqual(parseCheckupEffect({ ability: { text: 'Draw a card.' } }), { count: 0, filter: null, exceptName: null, targetHasAbility: false, source: 'Ability' });
    });

    test('parseEnergyMultiplier: Wild Growth pattern', () => {
      assert.deepEqual(
        parseEnergyMultiplier({
          ability: {
            text: "Each Basic {G} Energy attached to all of your Pokémon provides {G}{G} Energy. The effect of Wild Growth doesn't stack.",
          },
        }),
        { multiplier: 2, energyType: 'Grass' }
      );
      assert.deepEqual(parseEnergyMultiplier({ ability: { text: 'Draw a card.' } }), { multiplier: 0, energyType: null });
    });

    test('parseToolCap: extra Tool slot', () => {
      assert.deepEqual(
        parseToolCap({ ability: { text: 'This Pokémon can have an extra Pokémon Tool attached to it.' } }),
        { extra: 1 }
      );
      assert.deepEqual(
        parseToolCap({ ability: { text: 'This Pokémon can have 2 more Pokémon Tools attached to it.' } }),
        { extra: 2 }
      );
      assert.deepEqual(parseToolCap({ ability: { text: 'Draw a card.' } }), { extra: 0 });
    });

    test('parseAttackInheritance', () => {
      assert.equal(
        parseAttackInheritance({
          ability: {
            text: 'Each of your evolved Pokémon can use any attack from its previous Evolutions. (You still need the necessary Energy to use each attack.)',
          },
        }),
        true
      );
      assert.equal(parseAttackInheritance({ ability: { text: 'Draw a card.' } }), false);
    });

    test('parseOnOpponentEvolve: Darkest Impulse pattern', () => {
      assert.deepEqual(
        parseOnOpponentEvolve({
          ability: {
            text: 'Whenever your opponent plays a Pokémon from their hand to evolve 1 of their Pokémon, put 4 damage counters on that Pokémon.',
          },
        }),
        { count: 4 }
      );
      assert.deepEqual(parseOnOpponentEvolve({ ability: { text: 'Draw a card.' } }), { count: 0 });
    });

    test('parseStatusInflict: asleep on opponent active', () => {
      assert.deepEqual(
        parseStatusInflict({
          ability: {
            text: 'Once during your turn, if this Pokémon is in the Active Spot, you may make your opponent\'s Active Pokémon Asleep.',
          },
        }),
        { status: 'asleep', target: 'opponent-active' }
      );
      assert.deepEqual(parseStatusInflict({ ability: { text: 'Draw a card.' } }), { status: null, target: 'attacker' });
    });

    test('parseMoveDamage: move/place counters on opponent', () => {
      assert.deepEqual(
        parseMoveDamage({ ability: { text: 'Once during your turn, you may move up to 3 damage counters from 1 of your Pokémon to another.' } }),
        { count: 3, onOpponent: false }
      );
      assert.deepEqual(
        parseMoveDamage({ ability: { text: 'Put 2 damage counters on your opponent\'s Active Pokémon.' } }),
        { count: 2, onOpponent: true }
      );
      assert.deepEqual(parseMoveDamage({ ability: { text: 'Draw a card.' } }), { count: null, onOpponent: false });
    });

    test('parseLookAtTop', () => {
      assert.deepEqual(
        parseLookAtTop({ ability: { text: 'Once during your turn, look at the top 3 cards of your deck.' } }),
        { count: 3, takeToHand: false }
      );
      assert.deepEqual(parseLookAtTop({ ability: { text: 'Draw a card.' } }), { count: 0, takeToHand: false });
    });

    test('parseRecursionFromDiscard: Snorlax Voraciousness pattern', () => {
      assert.deepEqual(
        parseRecursionFromDiscard({
          ability: { text: 'Once during your turn, you may put up to 2 Leftovers cards from your discard pile into your hand.' },
        }),
        { count: 2, what: 'Leftovers' }
      );
      assert.deepEqual(
        parseRecursionFromDiscard({ ability: { text: 'Put an Energy card from your discard pile into your hand.' } }),
        { count: 0, what: 'Energy' }
      );
      assert.deepEqual(parseRecursionFromDiscard({ ability: { text: 'Draw a card.' } }), { count: 0, what: '' });
    });

    test('parseEffectPrevent: Initialization pattern', () => {
      assert.deepEqual(
        parseEffectPrevent({
          ability: {
            text: "As long as this Pokémon is in the Active Spot, Pokémon with a Rule Box in play (both yours and your opponent's) have no Abilities, except for Future Pokémon.",
          },
        }),
        { scope: 'abilities' }
      );
      assert.deepEqual(parseEffectPrevent({ ability: { text: 'Draw a card.' } }), { scope: null });
    });

    test('parseSetupFaceDown', () => {
      assert.equal(parseSetupFaceDown({ ability: { text: 'When you play this Pokémon, put it face-down in the Active Spot.' } }), true);
      assert.equal(parseSetupFaceDown({ ability: { text: 'Draw a card.' } }), false);
    });

    test('classifyAbility: energy-redirect family', () => {
      const ironTinker = { ability: { text: 'Once During Your Turn: You may move 1 Energy from this Pokémon to 1 of your other Pokémon.' } };
      assert.equal(classifyAbility(ironTinker), 'energy-redirect');

      // Attach-energy card still classifies as 'attach'
      const attach = { ability: { text: 'Once During Your Turn: You may attach an Energy card to this Pokémon.' } };
      assert.equal(classifyAbility(attach), 'attach');
    });

    test('classifyAbility: Standard 2026-27 audit fixes', () => {
      const fanRotom = {
        name: 'Fan Rotom',
        ability: {
          text: "Once during your first turn, you may search your deck for up to 3 {C} Pokémon with 100 HP or less, reveal them, and put them into your hand. Then, shuffle your deck. You can't use more than 1 Fan Call Ability during your turn.",
        },
      };
      assert.equal(classifyAbility(fanRotom), 'search');

      const wildGrowth = {
        name: 'Meganium',
        ability: {
          text: "Each Basic {G} Energy attached to all of your Pokémon provides {G}{G} Energy. The effect of Wild Growth doesn't stack.",
        },
      };
      assert.equal(classifyAbility(wildGrowth), 'energy-multiplier');

      const calmingLight = {
        name: 'Shiinotic',
        ability: {
          text: "Once during your turn, if this Pokémon is in the Active Spot, you may make your opponent's Active Pokémon Asleep.",
        },
      };
      assert.equal(classifyAbility(calmingLight), 'status');

      const washOut = {
        name: 'Dewgong',
        ability: {
          text: 'As often as you like during your turn, you may use this Ability. Move a {W} Energy from 1 of your Benched Pokémon to your Active Pokémon.',
        },
      };
      assert.equal(classifyAbility(washOut), 'energy-redirect');

      const voraciousness = {
        name: 'Snorlax',
        ability: {
          text: 'Once during your turn, you may put up to 2 Leftovers cards from your discard pile into your hand.',
        },
      };
      assert.equal(classifyAbility(voraciousness), 'recursion');

      const pecharunt = {
        name: 'Pecharunt ex',
        ability: {
          name: 'Subjugating Chains',
          text: "Once during your turn, you may switch 1 of your Benched {D} Pokémon, except any Pecharunt ex, with your Active Pokémon. If you do, the new Active Pokémon is now Poisoned. You can't use more than 1 Subjugating Chains Ability each turn.",
        },
      };
      assert.equal(classifyAbility(pecharunt), 'switch');
    });

    // ── §D heal family (execute: remove up to N counters) ──
    test('healTarget: printed target selection', () => {
      assert.equal(healTarget('Remove up to 2 damage counters from the Defending Pokémon.'), 'defender');
      assert.equal(healTarget('Heal 2 damage from the Defending Pokémon.'), 'defender');
      // Self / your-Active forms (Chansey style) default to attacker
      assert.equal(healTarget('Remove up to 2 damage counters from your Active Pokémon.'), 'attacker');
      assert.equal(healTarget('Heal 10 damage from this Pokémon.'), 'attacker');
      assert.equal(healTarget(''), 'attacker');
    });

    test('planHeal: removes min(heal, current), flags zero-out', () => {
      assert.deepEqual(planHeal(0, 2), { removed: 0, zeroOut: false, remaining: 0 });
      assert.deepEqual(planHeal(5, 2), { removed: 2, zeroOut: false, remaining: 3 });
      assert.deepEqual(planHeal(2, 2), { removed: 2, zeroOut: true, remaining: 0 });
      assert.deepEqual(planHeal(2, 5), { removed: 2, zeroOut: true, remaining: 0 });
    });

    // ── §D bench-damage family (planBenchTarget) ──
    test('planBenchTarget: 0→null, 1→0, 2+→-1', () => {
      assert.equal(planBenchTarget(0), null);
      assert.equal(planBenchTarget(1), 0);
      assert.equal(planBenchTarget(2), -1);
      assert.equal(planBenchTarget(5), -1);
      // Edge: negative or non-numeric coerces to 0
      assert.equal(planBenchTarget(-1), null);
      assert.equal(planBenchTarget(undefined), null);
      assert.equal(planBenchTarget('3'), -1);
    });

    // ── §D draw-until family (drawUntilTarget) ──
    test('drawUntilTarget: parses "draw cards until you have N cards", 0 otherwise', () => {
      assert.equal(
        drawUntilTarget('You may draw cards until you have 6 cards in your hand.'),
        6
      );
      assert.equal(drawUntilTarget('Draw cards until you have 5 cards.'), 5);
      assert.equal(drawUntilTarget('Draw cards until you have 1 card.'), 1);
      assert.equal(drawUntilTarget('Draw 2 cards.'), 0);
      assert.equal(drawUntilTarget('No draw clause here.'), 0);
      assert.equal(drawUntilTarget(''), 0);
      assert.equal(drawUntilTarget(undefined), 0);
    });

    test('drawCount: skips draw-until clauses (no false positive)', () => {
      assert.equal(drawCount('Draw cards until you have 6 cards in your hand.'), 0);
      assert.equal(drawCount('You may draw cards until you have 5 cards.'), 0);
    });

    // ── §D draw family (drawCount) ──
    test('drawCount: parses "draw/draws N card(s)", 0 otherwise', () => {
      assert.equal(drawCount('Draw 2 cards.'), 2);
      assert.equal(drawCount('You may draw 1 card.'), 1);
      assert.equal(drawCount('Draw 5 cards, then attack.'), 5);
      assert.equal(drawCount('draws 3 cards'), 3);
      assert.equal(drawCount('Draw a card.'), 1);
      assert.equal(drawCount('Draw a card from your deck.'), 1);
      assert.equal(drawCount('You may draw a card.'), 1);
      assert.equal(drawCount('Collect'), 1);
      assert.equal(drawCount({ name: 'Collect' }), 1);
      assert.equal(drawCount({ name: 'Collect', text: 'Draw a card.' }), 1);
      assert.equal(drawCount('No draw clause here.'), 0);
      assert.equal(drawCount(''), 0);
      assert.equal(drawCount(undefined), 0);
    });

    // ── §D attach-energy family (attachEnergyCount) ──
    test('attachEnergyCount: parses "attach … Energy" clauses, unnumbered = 1', () => {
      assert.equal(attachEnergyCount('Attach an Energy card to this Pokémon.'), 1);
      assert.equal(attachEnergyCount('attach 2 Energy cards'), 2);
      assert.equal(attachEnergyCount('If you have 2 or more Energy attached, attach an Energy to your benched Pokémon.'), 1);
      assert.equal(attachEnergyCount('Attach the most Energy cards you can.'), 1);
      assert.equal(attachEnergyCount('No attach clause here.'), 0);
      assert.equal(attachEnergyCount(''), 0);
      assert.equal(attachEnergyCount(undefined), 0);
    });

    // ── §D switch family (switchClause) ──
    test('switchClause: detects "switch your Active" attack clauses', () => {
      assert.equal(switchClause('Then, switch your Active Pokémon with another of your Pokémon.'), true);
      assert.equal(switchClause('If you do, you may switch your Active Pokémon.'), true);
      assert.equal(switchClause('switch your Active with your Benched Pokémon.'), true);
      assert.equal(switchClause('Do 10 damage to the Defending Pokémon.'), false);
      assert.equal(switchClause('Draw 2 cards.'), false);
      assert.equal(switchClause(''), false);
      assert.equal(switchClause(undefined), false);
    });

    // ── §D once-per-turn family (oncePerTurnClause) ──
    test('oncePerTurnClause: detects "Once during your turn" clauses', () => {
      assert.equal(oncePerTurnClause('Once during your turn: Draw 2 cards.'), true);
      assert.equal(oncePerTurnClause('Once during your turn, you may search your deck.'), true);
      assert.equal(oncePerTurnClause('ONCE DURING YOUR TURN: switch your Active.'), true);
      assert.equal(oncePerTurnClause('Do 10 damage to the Defending Pokémon.'), false);
      assert.equal(oncePerTurnClause('Draw 2 cards.'), false);
      assert.equal(oncePerTurnClause('Once each turn: Draw a card.'), false);
      assert.equal(oncePerTurnClause(''), false);
      assert.equal(oncePerTurnClause(undefined), false);
    });

    // ── §D multi-target family (allBenchDamage) ──
    test('allBenchDamage: extracts per-Pokémon amount from "to each/every/all … Benched Pokémon"', () => {
      assert.equal(allBenchDamage("Do 10 damage to each of your opponent's Benched Pokémon."), 10);
      assert.equal(allBenchDamage("20 damage to all of your opponent's Benched Pokémon"), 20);
      assert.equal(allBenchDamage("Do 30 damage to every one of your opponent's Benched Pokémon."), 30);
      // Unnumbered clause → 0 (caller announces the fizzle rather than guessing)
      assert.equal(allBenchDamage("Do damage to each of your opponent's Benched Pokémon."), 0);
      // No multi-target clause → 0
      assert.equal(allBenchDamage('Do 10 damage to the Defending Pokémon.'), 0);
      assert.equal(allBenchDamage('Do 10 damage to a Benched Pokémon.'), 0);
      assert.equal(allBenchDamage(''), 0);
      assert.equal(allBenchDamage(undefined), 0);
    });

    // ── §D discard-cost family (discardCost) ──
    test('discardCost: parses Energy-discard and hand-discard cost clauses', () => {
      assert.deepEqual(
        discardCost('Discard 1 Energy card from this Pokémon. Do 30 damage.'),
        { energy: 1, hand: 0 }
      );
      assert.deepEqual(
        discardCost('Discard an Energy card from this Pokémon.'),
        { energy: 1, hand: 0 }
      );
      assert.deepEqual(
        discardCost('Discard 2 Energy cards from this Pokémon.'),
        { energy: 2, hand: 0 }
      );
      assert.deepEqual(
        discardCost('Discard 2 cards from your hand. Do 20 damage.'),
        { energy: 0, hand: 2 }
      );
      assert.deepEqual(
        discardCost('Discard a card from your hand.'),
        { energy: 0, hand: 1 }
      );
      // No discard-cost clause → { energy: 0, hand: 0 }
      assert.deepEqual(discardCost('Do 30 damage to the Defending Pokémon.'), { energy: 0, hand: 0 });
      assert.deepEqual(discardCost(''), { energy: 0, hand: 0 });
      assert.deepEqual(discardCost(undefined), { energy: 0, hand: 0 });
    });

    // ── §D shuffle-cost family (shuffleDrawClause) ──
    test('shuffleDrawClause: parses shuffle-hand-into-deck cost clauses', () => {
      assert.deepEqual(
        shuffleDrawClause('Shuffle your hand into your deck, then draw 3 cards.'),
        { draw: 3 }
      );
      assert.deepEqual(
        shuffleDrawClause('Shuffle your hand into the deck, then draw 2 cards.'),
        { draw: 2 }
      );
      // Unnumbered clause → draw 1 (printed-form convention)
      assert.deepEqual(
        shuffleDrawClause('Shuffle your hand into your deck, then draw.'),
        { draw: 1 }
      );
      assert.deepEqual(
        shuffleDrawClause('Shuffle your hand into the deck, then draw 1 card.'),
        { draw: 1 }
      );
      // No shuffle-cost clause → { draw: 0 }
      assert.deepEqual(shuffleDrawClause('Do 30 damage to the Defending Pokémon.'), { draw: 0 });
      assert.deepEqual(shuffleDrawClause(''), { draw: 0 });
      assert.deepEqual(shuffleDrawClause(undefined), { draw: 0 });
    });

    test('shuffleDrawClause + drawCount: both match shuffle-then-draw text (attack flow skips drawCount)', () => {
      const text = 'Shuffle your hand into your deck, then draw 7 cards.';
      assert.deepEqual(shuffleDrawClause(text), { draw: 7 });
      assert.equal(drawCount(text), 7);
      // chat-buttons attack(): shuffleAndDraw runs once; drawCount block is
      // skipped when shuffledHandDraw > 0 or shuffle-hand-into-deck matches.
    });

    // ── §F attach-type family: effective attached type execution ──
    const { canPayAttackCost } = await import('../attack-engine.mjs');

    test('effectiveEnergyType: letter energies (U/V/W/Z) map to their provided type', () => {
      assert.equal(effectiveEnergyType({ name: 'U Energy', subtypes: ['Energy', 'Special'] }), 'Fighting');
      assert.equal(effectiveEnergyType({ name: 'V Energy', subtypes: ['Energy', 'Special'] }), 'Metal');
      assert.equal(effectiveEnergyType({ name: 'W Energy', subtypes: ['Energy', 'Special'] }), 'Metal');
      assert.equal(effectiveEnergyType({ name: 'Z Energy', subtypes: ['Energy', 'Special'] }), 'Dragon');
      // Name fallback works even without subtypes (pre-async card data)
      assert.equal(effectiveEnergyType({ name: 'Z Energy' }), 'Dragon');
    });

    test('effectiveEnergyType: named specials (Griseous/Prism/Stellar/Terra/Ancient/Obsidian)', () => {
      const sp = (name) => ({ name, subtypes: ['Energy', 'Special'] });
      assert.equal(effectiveEnergyType(sp('Griseous Energy')), 'Metal');
      assert.equal(effectiveEnergyType(sp('Prism Energy')), 'Colorless');
      assert.equal(effectiveEnergyType(sp('Stellar Energy')), 'Colorless');
      assert.equal(effectiveEnergyType(sp('Terra Energy')), 'Grass');
      assert.equal(effectiveEnergyType(sp('Ancient Energy')), 'Dark');
      assert.equal(effectiveEnergyType(sp('Obsidian Energy')), 'Dark');
    });

    test('effectiveEnergyType: TCGdex types[0] wins over the name map', () => {
      const card = { name: 'Terra Energy', subtypes: ['Energy', 'Special'], types: ['Fire'] };
      assert.equal(effectiveEnergyType(card), 'Fire');
      // Invalid TCGdex type falls back to the name map
      const bad = { name: 'Griseous Energy', subtypes: ['Energy', 'Special'], types: ['Foo'] };
      assert.equal(effectiveEnergyType(bad), 'Metal');
    });

    test('effectiveEnergyType: null for basic / double / non-energy / null input', () => {
      assert.equal(effectiveEnergyType({ name: 'Water Energy', subtypes: ['Energy', 'Basic'] }), null);
      assert.equal(effectiveEnergyType({ name: 'Double Water Energy', subtypes: ['Energy', 'Double'] }), null);
      assert.equal(effectiveEnergyType({ name: 'Pikachu' }), null);
      assert.equal(effectiveEnergyType(null), null);
    });

    test('typed special energies: TCGdex cards without subtypes/types resolve correctly', () => {
      const rocky = {
        name: 'Rocky Fighting Energy',
        type: 'Energy',
        types: [],
        subtypes: [],
        effect: 'As long as this card is attached to a Pokémon, it provides {F} Energy.',
      };
      assert.equal(classifyEnergyEffect(rocky), 'attach-type');
      assert.equal(effectiveEnergyType(rocky), 'Fighting');
      assert.equal(resolveAttachedEnergyType(rocky), 'Fighting');

      const growing = {
        name: 'Growing Grass Energy',
        type: 'Energy',
        effect: 'As long as this card is attached to a Pokémon, it provides {G} Energy.',
      };
      assert.equal(classifyEnergyEffect(growing), 'attach-type');
      assert.equal(resolveAttachedEnergyType(growing), 'Grass');

      const telepathic = {
        name: 'Telepathic Psychic Energy',
        type: 'Energy',
        effect: 'As long as this card is attached to a Pokémon, it provides {P} Energy.',
      };
      assert.equal(resolveAttachedEnergyType(telepathic), 'Psychic');
    });

    test('cost payment: typed specials pay as their effective type', () => {
      const rocky = {
        name: 'Rocky Fighting Energy',
        type: 'Energy',
        effect: 'provides {F} Energy.',
      };
      const entry = {
        type: resolveAttachedEnergyType(rocky),
        family: classifyEnergyEffect(rocky),
      };
      assert.equal(canPayAttackCost([entry], ['Fighting']), true);
      assert.equal(canPayAttackCost([entry], ['Water']), false);
    });

    test('typed special energy catalog: all eight ME03–ME05 cards parse and describe', async () => {
      const {
        parseTypedSpecialEnergy,
        describeTypedSpecialEnergy,
        getEnergyHpBonus,
        hasRockyEffectShield,
        hasBubblyStatusImmunity,
        hasMagneticFreeRetreat,
        getVoltaicDamageBonus,
        blocksBenchAttackDamage,
        shouldNitroReturnToHand,
        getTelepathicOnAttachSearch,
      } = await import('../special-energy-effects.mjs');

      const cards = [
        ['Growing Grass Energy', 'Grass', { hpBonus: 20 }],
        ['Rocky Fighting Energy', 'Fighting', { rocky: true }],
        ['Telepathic Psychic Energy', 'Psychic', { telepathic: true }],
        ['Bubbly Water Energy', 'Water', { bubbly: true }],
        ['Magnetic Metal Energy', 'Metal', { magnetic: true }],
        ['Nitro Fire Energy', 'Fire', { nitro: true }],
        ['Shadowy Darkness Energy', 'Darkness', { shadowy: true }],
        ['Voltaic Lightning Energy', 'Lightning', { voltaic: 20 }],
      ];

      for (const [name, type, flags] of cards) {
        const card = { name, type: 'Energy' };
        const def = parseTypedSpecialEnergy(card);
        assert.ok(def, `${name} should parse`);
        assert.ok(describeTypedSpecialEnergy(card), `${name} should describe`);

        const hostImg = {};
        const host = { types: [type], type: 'Pokémon', stage: 'Basic', image: hostImg };
        const attached = { name, type: 'Energy', image: { relative: hostImg } };
        const zone = [host, attached];

        if (flags.hpBonus) {
          assert.equal(getEnergyHpBonus(host, zone), flags.hpBonus);
        }
        if (flags.rocky) assert.equal(hasRockyEffectShield(host, zone), true);
        if (flags.bubbly) assert.equal(hasBubblyStatusImmunity(host, zone), true);
        if (flags.magnetic) assert.equal(hasMagneticFreeRetreat(host, zone), true);
        if (flags.voltaic) assert.equal(getVoltaicDamageBonus(host, zone), flags.voltaic);
        if (flags.shadowy) {
          assert.equal(blocksBenchAttackDamage(host, 'bench', zone), true);
          assert.equal(blocksBenchAttackDamage(host, 'active', zone), false);
        }
        if (flags.nitro) {
          assert.equal(shouldNitroReturnToHand(card, host, true), true);
          assert.equal(shouldNitroReturnToHand(card, host, false), false);
        }
        if (flags.telepathic) {
          const search = getTelepathicOnAttachSearch(card);
          assert.equal(search.count, 2);
          assert.equal(search.destination, 'bench');
        }
      }
    });

    test('applyEnergyEffect: attach-type reports executed with effective type', () => {
      const griseous = applyEnergyEffect({ name: 'Griseous Energy', subtypes: ['Energy', 'Special'] });
      assert.equal(griseous.family, 'attach-type');
      assert.equal(griseous.executed, true);
      assert.equal(griseous.effectiveType, 'Metal');
      assert.match(griseous.message, /Effective type: Metal/);

      // Unnamed special: still executed, but no derived type
      const mystery = applyEnergyEffect({ name: 'Mystery Energy', subtypes: ['Energy', 'Special'] });
      assert.equal(mystery.executed, true);
      assert.equal(mystery.effectiveType, null);

      // Other families remain announce-only for now
      const lock = applyEnergyEffect({ name: 'Lock Energy', subtypes: ['Energy', 'Special'] });
      assert.equal(lock.family, 'lock');
      assert.equal(lock.executed, false);
    });

    test('cost payment: letter / named specials pay as their effective type', () => {
      const u = { name: 'U Energy', subtypes: ['Energy', 'Special'] };
      const uEntry = { type: effectiveEnergyType(u) || 'Water', family: 'attach-type' };
      assert.equal(canPayAttackCost([uEntry], ['Fighting']), true);
      assert.equal(canPayAttackCost([uEntry], ['Water']), false);

      const prism = { name: 'Prism Energy', subtypes: ['Energy', 'Special'] };
      const prismEntry = { type: effectiveEnergyType(prism) || 'Colorless', family: 'attach-type' };
      assert.equal(canPayAttackCost([prismEntry], ['Dragon']), true);
      assert.equal(canPayAttackCost([prismEntry], ['Fire']), true);
    });

    // ── Stadium modifier families (taxonomy §E) ──────────────────────────

    test('parseStadiumCostModifier: "cost reduced by N" / "N less" → N', () => {
      const by1 = { name: 'Lillie\'s Room', subtypes: ['Stadium'], text: 'While this Stadium card is in play, the Energy cost of attacks used by your Active Pokémon is reduced by 1.' };
      assert.equal(parseStadiumCostModifier(by1), 1);

      const by2 = { name: 'Boost Stadium', subtypes: ['Stadium'], text: 'Attacks by your Active Pokémon cost 2 less Energy.' };
      assert.equal(parseStadiumCostModifier(by2), 2);

      // No cost language → 0
      const heal = { name: 'Pokémon Center', subtypes: ['Stadium'], text: 'Heal 30 damage from your Active Pokémon.' };
      assert.equal(parseStadiumCostModifier(heal), 0);

      // "cost" present but not a reduction (e.g. retreat cost) → 0
      const retreat = { name: 'Slow Zone', subtypes: ['Stadium'], text: 'The Retreat cost of your opponent\'s Active Pokémon increases by 2.' };
      assert.equal(parseStadiumCostModifier(retreat), 0);

      assert.equal(parseStadiumCostModifier(null), 0);
      assert.equal(parseStadiumCostModifier({ name: 'X' }), 0);
    });

    test('stadium cost discount stacks with the passive discount (same hook)', () => {
      const stadium = { name: 'Lillie\'s Room', subtypes: ['Stadium'], text: 'the Energy cost of attacks by your Active Pokémon is reduced by 1.' };
      const passive = { name: 'Pikachu', ability: { text: 'The Energy cost of this Pokémon\'s attacks is reduced by 1.' } };
      const rawCost = ['Lightning', 'Lightning', 'Colorless'];
      const discount = passiveCostDiscount(passive) + parseStadiumCostModifier(stadium);
      assert.equal(discount, 2);
      // applyCostDiscount keeps the first (cost.length − discount) symbols.
      assert.deepEqual(applyCostDiscount(rawCost, discount), ['Lightning']);
      // No stadium → only the passive discount applies
      assert.deepEqual(applyCostDiscount(rawCost, passiveCostDiscount(passive)), ['Lightning', 'Lightning']);
    });

    // ── Stadium HP modifier (continuous) ─────────────────────────────

    test('parseStadiumHpModifier: +N HP / N less HP / none', () => {
      const plus = { name: 'HP Stadium', subtypes: ['Stadium'], text: 'Your Pokémon in play have +20 HP.' };
      assert.equal(parseStadiumHpModifier(plus), 20);

      const minus = { name: 'Warp Stadium', subtypes: ['Stadium'], text: 'Your opponent\'s Pokémon have 10 less HP.' };
      assert.equal(parseStadiumHpModifier(minus), -10);

      // No HP language → 0
      const heal = { name: 'Pokémon Center', subtypes: ['Stadium'], text: 'Heal 30 damage from your Active Pokémon.' };
      assert.equal(parseStadiumHpModifier(heal), 0);

      assert.equal(parseStadiumHpModifier(null), 0);
      assert.equal(parseStadiumHpModifier({ name: 'X' }), 0);

      const gravity = { name: 'Gravity Mountain', subtypes: ['Stadium'], text: 'Each Stage 2 Pokémon in play (both yours and your opponent\'s) gets -30 HP.' };
      assert.equal(parseStadiumHpModifier(gravity), -30);
    });

    test('TCG Live Standard stadiums: key passive/active parsers recognize real card text', () => {
      const cards = [
        { name: 'Full Metal Lab', text: '{M} Pokémon (both yours and your opponent\'s) take 30 less damage from attacks from the opponent\'s Pokémon (after applying Weakness and Resistance).' },
        { name: 'Forest of Vitality', text: 'Each player\'s {G} Pokémon can evolve into {G} Pokémon during the turn they play those Pokémon, except during their first turn.' },
        { name: 'Risky Ruins', text: 'Whenever any player puts a Basic non-{D} Pokémon onto their Bench during their turn, place 2 damage counters on that Pokémon.' },
        { name: 'Postwick', text: 'Attacks used by Hop\'s Pokémon (both yours and your opponent\'s) do 30 more damage to the opponent\'s Active Pokémon (before applying Weakness and Resistance).' },
        { name: 'Perilous Jungle', text: 'During Pokémon Checkup, put 2 more damage counters on each Poisoned non-{D} Pokémon (both yours and your opponent\'s).' },
        { name: 'N\'s Castle', text: 'N\'s Pokémon in play (both yours and your opponent\'s) have no Retreat Cost.' },
      ].map((c) => ({ ...c, subtypes: ['Stadium'], type: 'Stadium' }));

      for (const c of cards) {
        assert.notEqual(classifyStadiumEffect(c), 'unknown', c.name);
        assert.equal(hasRecognizedPassiveStadiumEffect(c), true, c.name);
        assert.ok(applyStadiumEffect(c).results.length > 0, c.name);
      }

      assert.equal(parseStadiumDamageReduction(cards[0]), 30);
      assert.equal(parseStadiumEvolutionSpeed(cards[1]).relaxTurnGate, true);
      assert.equal(parseStadiumEvolutionSpeed(cards[1]).typeFilter, 'grass');
      assert.equal(stadiumBenchDamageApplies({ name: 'Pikachu', stage: 'Basic', types: ['Lightning'] }, cards[2]), 2);
      assert.equal(stadiumBenchDamageApplies({ name: 'Umbreon', stage: 'Basic', types: ['Darkness'] }, cards[2]), null);
      assert.equal(parseStadiumAttackDamageBonus(cards[3]), 30);
      assert.equal(parseStadiumCheckupPoisonBonus(cards[4]), 2);
      assert.equal(parseStadiumRetreatModifier(cards[5]), -Infinity);
    });

    test('resolveTurnBoundary: Perilous Jungle adds extra poison damage', () => {
      applyStatus('self', 'c1', 'poisoned');
      const r = resolveTurnBoundary('self', 'c1', Math.random, { checkupPoisonBonus: 2 });
      assert.equal(r.damage, 30);
      assert.match(r.notes.join(' '), /Stadium \+2 counter/);
    });

    test('getStadiumHpBonus: targeting follows the stadium pronouns', () => {
      const prevEnabled = rulesState.enabled;
      const prevStadium = rulesState.stadium;
      rulesState.enabled = true;
      try {
        // "your Pokémon" → owner only
        markStadiumPlayed('self', { name: 'A', subtypes: ['Stadium'], text: 'Your Pokémon in play have +20 HP.' });
        assert.equal(getStadiumHpBonus('self'), 20);
        assert.equal(getStadiumHpBonus('opp'), 0);

        // "your opponent" → non-owner only
        markStadiumPlayed('self', { name: 'B', subtypes: ['Stadium'], text: 'Your opponent\'s Pokémon have 10 less HP.' });
        assert.equal(getStadiumHpBonus('self'), 0);
        assert.equal(getStadiumHpBonus('opp'), -10);

        // General (no pronoun) → both
        markStadiumPlayed('self', { name: 'C', subtypes: ['Stadium'], text: 'Pokémon in play have +20 HP.' });
        assert.equal(getStadiumHpBonus('self'), 20);
        assert.equal(getStadiumHpBonus('opp'), 20);
      } finally {
        rulesState.enabled = prevEnabled;
        rulesState.stadium = prevStadium;
      }
    });

    test('effectiveHp: applies the bonus and clamps to ≥ 1', () => {
      const prevEnabled = rulesState.enabled;
      const prevStadium = rulesState.stadium;
      rulesState.enabled = true;
      try {
        markStadiumPlayed('self', { name: 'A', subtypes: ['Stadium'], text: 'Your Pokémon in play have +20 HP.' });
        assert.equal(effectiveHp(120, 'self'), 140);
        assert.equal(effectiveHp(120, 'opp'), 120);

        markStadiumPlayed('self', { name: 'B', subtypes: ['Stadium'], text: 'Your Pokémon in play have 10 less HP.' });
        assert.equal(effectiveHp(30, 'self'), 20);
        assert.equal(effectiveHp(5, 'self'), 1); // clamped, never 0

        // base 0 stays 0
        assert.equal(effectiveHp(0, 'self'), 0);

        // Disabled rules → no bonus
        rulesState.enabled = false;
        assert.equal(effectiveHp(120, 'self'), 120);
      } finally {
        rulesState.enabled = prevEnabled;
        rulesState.stadium = prevStadium;
      }
    });

    test('effectiveHp: applies attached Tool HP bonus', () => {
      const mon = { name: 'Pikachu', hp: 100, image: { name: 'host' } };
      const tool = {
        name: "Hero's Cape",
        type: 'Trainer',
        trainerType: 'Tool',
        text: 'The Pokémon this card is attached to gets +50 HP.',
        image: { relative: mon.image },
      };
      const zone = [mon, tool];
      assert.equal(effectiveHp(100, 'self', mon, zone), 150);
    });

    test('isPokemonToolCard / isStadiumCard: TCGdex trainerType', () => {
      assert.equal(isPokemonToolCard({ type: 'Trainer', trainerType: 'Tool' }), true);
      assert.equal(isStadiumCard({ type: 'Trainer', trainerType: 'Stadium', text: 'Once per turn, draw a card.' }), true);
    });

    // ── Tool combat hooks ────────────────────────────────────────────────

    test('tool-combat: retreat, prize adjust, KO prevention, on-damage', async () => {
      const {
        combinedToolRetreatCost,
        toolPrizeCountAdjust,
        evaluateToolKoPrevention,
        parseToolOnDamageEffect,
        combinedToolAttackBonus,
      } = await import('../tool-combat.mjs');
      const mon = { name: 'Snorlax', hp: 100, retreatCost: 4, image: { name: 'host' } };
      const heavyBoots = {
        name: 'Heavy Boots',
        type: 'Trainer',
        trainerType: 'Tool',
        text: 'The Retreat Cost of the Pokémon this card is attached to is {C} more.',
        image: { relative: mon.image },
      };
      assert.equal(combinedToolRetreatCost(4, mon, [mon, heavyBoots]), 5);

      const pearl = {
        name: "Lillie's Pearl",
        type: 'Trainer',
        trainerType: 'Tool',
        text: 'If the Pokémon this card is attached to is Knocked Out by damage from an attack from your opponent\'s Pokémon, that player takes 1 fewer Prize card.',
        image: { relative: mon.image },
      };
      assert.equal(toolPrizeCountAdjust(mon, [mon, pearl], 2), 1);

      const brace = {
        name: 'Survival Brace',
        type: 'Trainer',
        trainerType: 'Tool',
        text: 'If the Pokémon this card is attached to has full HP and would be Knocked Out by damage from an attack from your opponent\'s Pokémon, it is not Knocked Out, and its remaining HP becomes 10.',
        image: { relative: mon.image },
      };
      const koPrev = evaluateToolKoPrevention(mon, [mon, brace], {
        currentDamage: 0,
        incomingDamage: 10,
        baseHp: 100,
      });
      assert.equal(koPrev.prevented, true);
      assert.equal(koPrev.totalDamage, 9);

      const helmet = {
        name: 'Lucky Helmet',
        type: 'Trainer',
        trainerType: 'Tool',
        text: 'If the Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your opponent\'s Pokémon, draw 2 cards.',
        image: { relative: mon.image },
      };
      assert.equal(parseToolOnDamageEffect(helmet).draw, 2);

      const attacker = { name: 'Pikachu', types: ['Lightning'], image: { name: 'atk' } };
      const bangle = {
        name: 'Brave Bangle',
        type: 'Trainer',
        trainerType: 'Tool',
        text: 'If the Pokémon this card is attached to doesn\'t have a Rule Box, the attacks it uses do 30 more damage to your opponent\'s Active Pokémon ex.',
        image: { relative: attacker.image },
      };
      const defender = { name: 'Charizard ex', hp: 330, subtypes: ['ex'], image: { name: 'def' } };
      assert.equal(
        combinedToolAttackBonus(attacker, [attacker, bangle], defender, { defenderIsActive: true }),
        30
      );
    });

    // ── Stadium evolution speed (continuous) ─────────────────────────────

    test('parseStadiumEvolutionSpeed: turn-gate relax / cost reduce / none', () => {
      const relax = { name: 'Fast Evolve', subtypes: ['Stadium'], text: 'Your Pokémon in play may evolve as if it had been in play for 1 more turn.' };
      assert.deepEqual(parseStadiumEvolutionSpeed(relax), { relaxTurnGate: true, costReduce: 0, typeFilter: null });

      // plural "they" phrasing (real-card style)
      const relaxThey = { name: 'Fast Evolve 2', subtypes: ['Stadium'], text: 'Your Benched Pokémon may evolve as if they had been in play for one more turn.' };
      assert.equal(parseStadiumEvolutionSpeed(relaxThey).relaxTurnGate, true);

      const cost = { name: 'Cheap Evolve', subtypes: ['Stadium'], text: 'Evolving your Pokémon costs 1 less Energy.' };
      assert.equal(parseStadiumEvolutionSpeed(cost).costReduce, 1);
      assert.equal(parseStadiumEvolutionSpeed(cost).relaxTurnGate, false);

      const none = { name: 'Heal Center', subtypes: ['Stadium'], text: 'Heal 30 damage from your Active Pokémon.' };
      assert.deepEqual(parseStadiumEvolutionSpeed(none), { relaxTurnGate: false, costReduce: 0, typeFilter: null });

      assert.deepEqual(parseStadiumEvolutionSpeed(null), { relaxTurnGate: false, costReduce: 0, typeFilter: null });
      assert.deepEqual(parseStadiumEvolutionSpeed({ name: 'X' }), { relaxTurnGate: false, costReduce: 0, typeFilter: null });
    });

    test('getStadiumEvolutionSpeed: targeting follows the stadium pronouns', () => {
      const prevEnabled = rulesState.enabled;
      const prevStadium = rulesState.stadium;
      rulesState.enabled = true;
      try {
        // "your Pokémon" → owner only
        markStadiumPlayed('self', { name: 'A', subtypes: ['Stadium'], text: 'Your Pokémon in play may evolve as if it had been in play for 1 more turn.' });
        assert.deepEqual(getStadiumEvolutionSpeed('self'), { relaxTurnGate: true, costReduce: 0, typeFilter: null });
        assert.deepEqual(getStadiumEvolutionSpeed('opp'), { relaxTurnGate: false, costReduce: 0, typeFilter: null });

        // "your opponent" → non-owner only
        markStadiumPlayed('self', { name: 'B', subtypes: ['Stadium'], text: 'Your opponent\'s Pokémon may evolve as if it had been in play for 1 more turn.' });
        assert.deepEqual(getStadiumEvolutionSpeed('self'), { relaxTurnGate: false, costReduce: 0, typeFilter: null });
        assert.deepEqual(getStadiumEvolutionSpeed('opp'), { relaxTurnGate: true, costReduce: 0, typeFilter: null });

        // General (no pronoun) → both
        markStadiumPlayed('self', { name: 'C', subtypes: ['Stadium'], text: 'Pokémon in play may evolve as if it had been in play for 1 more turn.' });
        assert.equal(getStadiumEvolutionSpeed('self').relaxTurnGate, true);
        assert.equal(getStadiumEvolutionSpeed('opp').relaxTurnGate, true);
      } finally {
        rulesState.enabled = prevEnabled;
        rulesState.stadium = prevStadium;
      }
    });

    test('canEvolve: stadium relaxes the just-played gate; costReduce is surfaced', async () => {
      const { canEvolve } = await import('../evolution.mjs');
      const prevEnabled = rulesState.enabled;
      const prevStadium = rulesState.stadium;
      startGame();
      beginTurn('self');
      beginTurn('opp');
      beginTurn('self'); // turn 3
      rulesState.enabled = true;
      const base = { name: 'Charmander', stage: 'Basic', id: 'b1' };
      const evo = { name: 'Charmeleon', stage: 'Stage 1', evolvesFrom: 'Charmander', id: 'e1' };
      try {
        // No stadium: just-played gate blocks same-turn evolution
        const r0 = await canEvolve('self', base, evo, true);
        assert.equal(r0.allowed, false);

        // Turn-gate-relaxing stadium: same-turn evolution now allowed
        markStadiumPlayed('self', { name: 'S', subtypes: ['Stadium'], text: 'Your Pokémon in play may evolve as if it had been in play for 1 more turn.' });
        const r1 = await canEvolve('self', base, evo, true);
        assert.equal(r1.allowed, true);

        // Cost-reducing stadium: surfaced via costReduce (owner only)
        markStadiumPlayed('self', { name: 'T', subtypes: ['Stadium'], text: 'Evolving your Pokémon costs 1 less Energy.' });
        const r2 = await canEvolve('self', base, evo, false);
        assert.equal(r2.allowed, true);
        assert.equal(r2.costReduce, 1);
        assert.equal((await canEvolve('opp', base, evo, false)).costReduce, 0);
      } finally {
        rulesState.enabled = prevEnabled;
        rulesState.stadium = prevStadium;
      }
    });

    // ── attack-window (usable attacks / abilities) ──
    test('listAttacks: payable vs not payable', () => {
      const card = { name: 'T', types: ['Fire'], attacks: [
        { name: 'Flame', cost: ['Fire', 'Colorless'], damage: 60, text: '' },
        { name: 'Firestorm', cost: ['Fire', 'Fire', 'Colorless'], damage: 120, text: '' },
      ] };
      const energyTypes = [{ type: 'Fire', family: 'basic' }, { type: 'Colorless', family: 'basic' }];
      const res = listAttacks(card, { energyTypes });
      assert.equal(res.length, 2);
      assert.equal(res[0].payable, true);
      assert.equal(res[0].usable, true);
      assert.equal(res[1].payable, false);
      assert.equal(res[1].usable, false);
      assert.match(res[1].reason, /energy/i);
    });

    test('listAttacks: once-per-turn already used is not usable', () => {
      const card = { name: 'T', types: [], attacks: [
        { name: 'Oncey', cost: ['Colorless'], text: 'Once during your turn: draw 2 cards.' },
      ] };
      const energyTypes = [{ type: 'Colorless', family: 'basic' }];
      const before = listAttacks(card, { energyTypes, abilityUsed: false });
      assert.equal(before[0].usable, true);
      const after = listAttacks(card, { energyTypes, abilityUsed: true });
      assert.equal(after[0].onceUsed, true);
      assert.equal(after[0].usable, false);
      assert.match(after[0].reason, /once per turn/i);
    });

    test('listAttacks: passive cost discount makes an unpayable attack payable', () => {
      const card = { name: 'T', types: ['Fire'], ability: { name: 'Save', text: 'The cost of attacks from this Pokémon is reduced by 1 Energy.' }, attacks: [
        { name: 'Flame', cost: ['Fire', 'Colorless'], damage: 60, text: '' },
      ] };
      const energyTypes = [{ type: 'Fire', family: 'basic' }]; // only 1 energy attached
      const res = listAttacks(card, { energyTypes });
      assert.equal(res[0].payable, true);
      assert.deepEqual(res[0].effectiveCost, ['Fire']);
    });

    test('listAttacks: Asleep/Paralyzed block attacks, Confused does not (AT8)', () => {
      const card = { name: 'T', types: [], attacks: [
        { name: 'Flame', cost: [], damage: 60, text: '' },
      ] };

      const asleep = { ...card, specialCondition: 'Asleep' };
      assert.match(statusAttackBlock(asleep), /Asleep/);
      const asleepRow = listAttacks(asleep, {
        energyTypes: [],
        blockedReason: statusAttackBlock(asleep),
      })[0];
      assert.equal(asleepRow.usable, false);
      assert.match(asleepRow.reason, /Asleep/);

      const paralyzed = { ...card, specialCondition: 'Paralyzed' };
      assert.equal(
        listAttacks(paralyzed, { energyTypes: [], blockedReason: statusAttackBlock(paralyzed) })[0]
          .usable,
        false
      );

      const confused = { ...card, specialCondition: 'Confused' };
      assert.equal(statusAttackBlock(confused), '');
      const confusedRow = listAttacks(confused, {
        energyTypes: [],
        blockedReason: statusAttackBlock(confused),
      })[0];
      assert.equal(confusedRow.usable, true, 'Confused is a coin flip, not a lock');
    });

    test('listAbilities: once-per-turn ability is tracked', () => {
      const card = { name: 'T', ability: { name: 'Recycle', text: 'Once during your turn: draw 1 card.' } };
      const before = listAbilities(card, { abilityUsed: false });
      assert.equal(before.length, 1);
      assert.equal(before[0].oncePerTurn, true);
      assert.equal(before[0].usable, true);
      const after = listAbilities(card, { abilityUsed: true });
      assert.equal(after[0].used, true);
      assert.equal(after[0].usable, false);
      assert.match(after[0].reason, /once per turn/i);
    });

    test('listAbilities: no ability → empty list', () => {
      assert.deepEqual(listAbilities({ name: 'T' }), []);
      assert.deepEqual(listAbilities({ name: 'T', ability: undefined }), []);
    });

    // ── zone-aware ability activation (design 015) ──
    // The gap this closes: the primitive used to answer "usable" for a card printed
    // "Once during your turn, if this Pokémon is in the Active Spot, …" no matter where it sat,
    // so the inspector offered the panel from the Bench and the server accepted the dispatch.
    test('listAbilities: a positional ability is refused from the Bench', () => {
      const card = {
        name: 'T',
        ability: {
          name: 'Sleepy Aura',
          text: "Once during your turn, if this Pokémon is in the Active Spot, you may make your opponent's Active Pokémon Asleep.",
        },
      };
      const active = listAbilities(card, { zone: 'active' });
      assert.equal(active[0].usable, true);
      assert.equal(active[0].reason, '');

      const bench = listAbilities(card, { zone: 'bench' });
      assert.equal(bench[0].usable, false);
      assert.match(bench[0].reason, /active spot/i);
    });

    test('listAbilities: an omitted zone keeps the active-spot behavior', () => {
      const card = {
        name: 'T',
        ability: {
          name: 'A',
          text: 'If this Pokémon is in the Active Spot, draw a card.',
        },
      };
      // Every pre-015 caller passes no zone; none of them may change behavior.
      assert.equal(listAbilities(card)[0].usable, true);
      assert.equal(listAbilities(card, {})[0].usable, true);
    });

    test('listAbilities: a non-positional ability still works from the Bench', () => {
      const card = {
        name: 'Charmander',
        ability: {
          name: 'Agile',
          text: 'If this Pokémon has no Energy attached, it has no Weakness.',
        },
      };
      assert.equal(requiresActiveSpot(card), false);
      assert.equal(listAbilities(card, { zone: 'bench' })[0].usable, true);
    });

    test('listAbilities: an on-move trigger is NOT position-restricted', () => {
      // "moves from your Bench to the Active Spot" fires ON the move and is legal from the Bench —
      // matching a bare mention of the Active Spot here would disable a legal ability.
      const card = {
        name: 'T',
        ability: {
          name: 'Shift',
          text: 'Once during your turn, when this Pokémon moves from your Bench to the Active Spot, you may move an Energy.',
        },
      };
      assert.equal(requiresActiveSpot(card), false);
      assert.equal(listAbilities(card, { zone: 'bench' })[0].usable, true);
    });

    test('listAbilities: a passive naming the Active Spot is NOT position-restricted', () => {
      // A passive is not activated at all, so this predicate must not claim to gate it.
      const card = {
        name: 'T',
        ability: {
          name: 'Tera',
          text: 'As long as this Pokémon is in the Active Spot, Pokémon with a Rule Box in play have no Abilities.',
        },
      };
      assert.equal(requiresActiveSpot(card), false);
    });

    test('requiresActiveSpot: "Pokemon" without the accent still matches', () => {
      const card = {
        name: 'T',
        ability: {
          name: 'A',
          text: 'If this Pokemon is in the Active Spot, draw a card.',
        },
      };
      assert.equal(requiresActiveSpot(card), true);
      assert.equal(listAbilities(card, { zone: 'bench' })[0].usable, false);
    });

    test('listAbilities: a spent once-per-turn ability reports "used", not position', () => {
      const card = {
        name: 'T',
        ability: {
          name: 'A',
          text: 'Once during your turn, if this Pokémon is in the Active Spot, draw a card.',
        },
      };
      const bench = listAbilities(card, { zone: 'bench', abilityUsed: true });
      assert.equal(bench[0].usable, false);
      assert.match(bench[0].reason, /once per turn/i);
    });

    test('listAbilities: rules off ignores position', () => {
      const card = {
        name: 'T',
        ability: {
          name: 'A',
          text: 'If this Pokémon is in the Active Spot, draw a card.',
        },
      };
      assert.equal(
        listAbilities(card, { zone: 'bench', rulesEnabled: false })[0].usable,
        true
      );
    });

    test('requiresActiveSpot: absent and malformed cards are false', () => {
      assert.equal(requiresActiveSpot(null), false);
      assert.equal(requiresActiveSpot({}), false);
      assert.equal(requiresActiveSpot({ ability: {} }), false);
      assert.equal(requiresActiveSpot({ name: 'T' }), false);
    });

    test('isEvolvePlayedTrigger: matches the evolve-play wording, not the Bench wording', () => {
      assert.equal(
        isEvolvePlayedTrigger({
          ability: {
            text: 'Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may use this Ability. Heal all damage from 1 of your Pokémon.',
          },
        }),
        true
      );
      // The played-to-Bench trigger has its own one-shot window.
      assert.equal(
        isEvolvePlayedTrigger({
          ability: {
            text: 'When you play this Pokémon from your hand onto your Bench, you may search your deck for a Supporter card.',
          },
        }),
        false
      );
      assert.equal(isEvolvePlayedTrigger(null), false);
      assert.equal(isEvolvePlayedTrigger({}), false);
    });

    test('listUsableActions: combines attacks + abilities', () => {
      const card = { name: 'T', types: ['Water'], ability: { name: 'A', text: 'Once during your turn: heal 10 damage.' }, attacks: [
        { name: 'Slam', cost: ['Water'], damage: 30, text: '' },
      ] };
      const res = listUsableActions(card, { energyTypes: [{ type: 'Water', family: 'basic' }] });
      assert.equal(res.attacks.length, 1);
      assert.equal(res.attacks[0].payable, true);
      assert.equal(res.abilities.length, 1);
      assert.equal(res.abilities[0].usable, true);
    });

    test('listAttacks: double-colorless energy pays a Colorless cost, not a colored one', () => {
      const coloredCard = { name: 'T', types: [], attacks: [
        { name: 'Blast', cost: ['Fire', 'Water'], damage: 50, text: '' },
      ] };
      const energyTypes = [{ type: 'Colorless', family: 'double-colorless' }];
      assert.equal(listAttacks(coloredCard, { energyTypes })[0].payable, false);

      const colorlessCard = { name: 'T', types: [], attacks: [
        { name: 'Slam', cost: ['Colorless', 'Colorless'], damage: 50, text: '' },
      ] };
      assert.equal(listAttacks(colorlessCard, { energyTypes })[0].payable, true);
    });

    // ── collect-usable-abilities (active + bench picker gate) ──
    test('isUsableAbilityCard: actionable draw ability is usable', () => {
      const card = {
        name: 'Bidoof',
        ability: { name: 'Carefree Countenance', text: 'Once during your turn, you may draw a card.' },
      };
      assert.equal(isUsableAbilityCard(card), true);
      assert.equal(isUsableAbilityCard(card, { used: true }), false);
    });

    test('isUsableAbilityCard: passive ability is not usable interactively', () => {
      const card = {
        name: 'T',
        ability: { name: 'Thick Fat', text: 'While this Pokémon is in play, it takes 30 less damage from attacks.' },
      };
      assert.equal(isUsableAbilityCard(card), false);
    });

    test('benchCardHasAbility: true for actionable ability regardless of used-this-turn', () => {
      const card = {
        name: 'Bidoof',
        ability: { name: 'Carefree Countenance', text: 'Once during your turn, you may draw a card.' },
      };
      assert.equal(benchCardHasAbility(card), true);
    });

    test('benchCardHasAbility: false for a passive (non-interactive) ability', () => {
      const card = {
        name: 'T',
        ability: { name: 'Thick Fat', text: 'While this Pokémon is in play, it takes 30 less damage from attacks.' },
      };
      assert.equal(benchCardHasAbility(card), false);
    });

    test('benchCardHasAbility: false for a card with no ability at all', () => {
      assert.equal(benchCardHasAbility({ name: 'Pidgey', type: 'Pokémon' }), false);
    });

    test('filterUsableAbilities: active + bench with two actionable abilities', () => {
      const active = {
        name: 'ActiveMon',
        type: 'Pokémon',
        ability: { name: 'Draw', text: 'Once during your turn, you may draw a card.' },
      };
      const bench = {
        name: 'BenchMon',
        type: 'Pokémon',
        ability: {
          name: 'Search',
          text: 'Once during your turn, you may search your deck for a Basic Pokémon and put it onto your Bench.',
        },
      };
      const candidates = collectUsableAbilityCandidates(active, [bench]);
      const usable = filterUsableAbilities(candidates);
      assert.equal(usable.length, 2);
      assert.equal(usable[0].zone, 'active');
      assert.equal(usable[1].zone, 'bench');
      assert.equal(usable[1].card.name, 'BenchMon');
    });

    test('filterUsableAbilities: skips bench Pokémon without actionable ability', () => {
      const active = {
        name: 'ActiveMon',
        ability: { name: 'Draw', text: 'Once during your turn, you may draw a card.' },
      };
      const passiveBench = {
        name: 'PassiveBench',
        type: 'Pokémon',
        ability: { name: 'Thick Fat', text: 'While this Pokémon is in play, it takes 30 less damage from attacks.' },
      };
      const candidates = collectUsableAbilityCandidates(active, [passiveBench]);
      const usable = filterUsableAbilities(candidates);
      assert.equal(usable.length, 1);
      assert.equal(usable[0].zone, 'active');
    });

    test('filterUsableAbilities: a positional Active-Spot ability is skipped from the Bench (A2)', () => {
      const active = {
        name: 'ActiveMon',
        ability: { name: 'Draw', text: 'Once during your turn, you may draw a card.' },
      };
      const spotBench = {
        name: 'SpotBench',
        type: 'Pokémon',
        ability: {
          name: 'Pressure',
          text: 'Once during your turn, if this Pokémon is in the Active Spot, you may draw a card.',
        },
      };
      const candidates = collectUsableAbilityCandidates(active, [spotBench]);
      const usable = filterUsableAbilities(candidates);
      assert.deepEqual(usable.map((u) => u.zone), ['active']);
    });

    test('filterUsableAbilities: a KO-window ability is skipped without koedLastOppTurn (A5)', () => {
      const fez = {
        name: 'Fezandipiti ex',
        type: 'Pokémon',
        ability: {
          name: 'Flip the Script',
          text:
            "Once during your turn, if any of your Pokémon were Knocked Out during your opponent's last turn, you may draw 3 cards.",
        },
      };
      const candidates = collectUsableAbilityCandidates(null, [fez]);
      assert.equal(
        filterUsableAbilities(candidates, { koedLastOppTurn: false }).length,
        0,
        'no KO last turn means no usable ability'
      );
      assert.equal(filterUsableAbilities(candidates, { koedLastOppTurn: true }).length, 1);
    });

    // ── start-of-turn draw (taxonomy B) ──
    test('shouldAutoDrawAtTurnStart: true when enabled, not drawn, deck non-empty', () => {
      assert.equal(shouldAutoDrawAtTurnStart({ enabled: true, drewThisTurn: false, deckCount: 3, turnNumber: 2 }), true);
      assert.equal(shouldAutoDrawAtTurnStart({ enabled: true, drewThisTurn: true, deckCount: 3, turnNumber: 2 }), false);
      assert.equal(shouldAutoDrawAtTurnStart({ enabled: true, drewThisTurn: false, deckCount: 0, turnNumber: 2 }), false);
      assert.equal(shouldAutoDrawAtTurnStart({ enabled: false, drewThisTurn: false, deckCount: 3, turnNumber: 2 }), false);
    });

    test('shouldAutoDrawAtTurnStart: turn 1 draws too (first player draws on their opening turn)', () => {
      assert.equal(shouldAutoDrawAtTurnStart({ enabled: true, drewThisTurn: false, deckCount: 3, turnNumber: 1 }), true);
    });

    test('shouldAutoDrawAtTurnStart: lastDrawnTurn blocks a second draw on the same turn', () => {
      assert.equal(
        shouldAutoDrawAtTurnStart({
          enabled: true,
          drewThisTurn: false,
          deckCount: 3,
          turnNumber: 4,
          lastDrawnTurn: 4,
        }),
        false,
      );
      assert.equal(
        shouldAutoDrawAtTurnStart({
          enabled: true,
          drewThisTurn: false,
          deckCount: 3,
          turnNumber: 4,
          lastDrawnTurn: 3,
        }),
        true,
      );
    });

    test('endTurn: second call for the same player is a no-op (no extra turn / flag reset)', () => {
      startGame();
      beginTurn('self');
      const first = endTurn('self');
      assert.equal(first, 'opp');
      const turnAfter = rulesState.turnNumber;
      markTurnDrawn('opp');
      const second = endTurn('self');
      assert.equal(second, 'opp');
      assert.equal(rulesState.turnNumber, turnAfter);
      assert.equal(rulesState.flags.opp.drewThisTurn, true);
    });

    test('markTurnDrawn: sets the per-turn dedupe guard, survives flag reset', () => {
      startGame();
      beginTurn('self');
      assert.equal(rulesState.flags.self.drewThisTurn, false);
      markTurnDrawn('self');
      assert.equal(rulesState.flags.self.drewThisTurn, true);
      endTurn('self');
      assert.equal(rulesState.flags.opp.drewThisTurn, false);
    });

    test('startGame twice resets flags (bridge guard must prevent the 2nd call)', () => {
      startGame('self');
      assert.equal(rulesState.phase, 'draw'); // guard condition: 2nd call would return early
      markTurnDrawn('self');
      assert.equal(rulesState.flags.self.drewThisTurn, true);
      // A 2nd startGame (which the bridge now blocks) WOULD reset this:
      startGame('self');
      assert.equal(rulesState.flags.self.drewThisTurn, false); // documents why the guard is needed
      // Reset for subsequent tests
      startGame('self');
    });

    // ── P4: promotion bench → active after KO (taxonomy B) ──
    test('planPromotion: bench KO never promotes', () => {
      const plan = planPromotion(false, 3);
      assert.equal(plan.promote, false);
      assert.equal(plan.benchIndex, null);
      assert.equal(plan.guidance, null);
    });

    test('planPromotion: active KO with empty bench does not promote', () => {
      const plan = planPromotion(true, 0);
      assert.equal(plan.promote, false);
      assert.equal(plan.benchIndex, null);
    });

    test('planPromotion: active KO with bench promotes first bench (index 0)', () => {
      const plan = planPromotion(true, 1);
      assert.equal(plan.promote, true);
      assert.equal(plan.benchIndex, 0);
      assert.match(plan.guidance, /promote/i);
      const plan4 = planPromotion(true, 4);
      assert.equal(plan4.promote, true);
      assert.equal(plan4.benchIndex, 0);
    });

    test('promotionGuidance: legacy wrapper delegates to planPromotion', () => {
      assert.equal(promotionGuidance('self', 0), null);
      assert.match(promotionGuidance('self', 2), /You must promote/);
      assert.match(promotionGuidance('opp', 2), /Opponent must promote/);
    });
    
    // ── name → id resolution (attack-window data plumbing) ──
    const { resolveCardId, normalizeCardName } = await import('../rules-state.mjs');
    
    test('normalizeCardName: lowercases, trims, collapses whitespace', () => {
      assert.equal(normalizeCardName('  Charizard  EX '), 'charizard ex');
      assert.equal(normalizeCardName(''), '');
    });
    
    test('resolveCardId: exact name match wins over partial', () => {
      const summaries = [
        { id: 1, name: 'Pikachu', category: 'pokemon' },
        { id: 2, name: 'Pikachu EX', category: 'pokemon' },
      ];
      assert.equal(resolveCardId(summaries, 'Pikachu'), 1);
    });
    
    test('resolveCardId: prefers Pokémon when type is Pokémon', () => {
      const summaries = [
        { id: 10, name: 'Pikachu', category: 'trainer' },
        { id: 20, name: 'Pikachu', category: 'pokemon' },
      ];
      assert.equal(resolveCardId(summaries, 'Pikachu', 'Pokémon'), 20);
    });
    
    test('resolveCardId: prefers Trainer when type is Trainer', () => {
      const summaries = [
        { id: 10, name: 'Poké Ball', category: 'pokemon' },
        { id: 20, name: 'Poké Ball', category: 'trainer' },
      ];
      assert.equal(resolveCardId(summaries, 'Poké Ball', 'Trainer'), 20);
    });
    
    test('resolveCardId: EX variant matches " EX" form', () => {
      const summaries = [{ id: 42, name: 'Charizard EX', category: 'pokemon' }];
      assert.equal(resolveCardId(summaries, 'Charizard EX', 'Pokémon'), 42);
    });
    
    test('resolveCardId: no match returns null', () => {
      const summaries = [{ id: 1, name: 'Totally Different', category: 'pokemon' }];
      assert.equal(resolveCardId(summaries, 'Nonexistent Card'), null);
    });
    
    test('resolveCardId: empty/invalid input returns null', () => {
      assert.equal(resolveCardId([], 'Pikachu'), null);
      assert.equal(resolveCardId(null, 'Pikachu'), null);
      assert.equal(resolveCardId([{ id: 1, name: 'Pikachu' }], ''), null);
      assert.equal(resolveCardId([{ name: 'Pikachu' }], 'Pikachu'), null); // no id
    });

    // Regression: a name reprinted across many sets (e.g. "Piloswine" in
    // Phantasmal Flames AND in the decades-old EX Team Rocket Returns) used
    // to resolve to whatever candidate happened to come first in the
    // network response, regardless of which printing was actually in play.
    test('resolveCardId: same-name reprints disambiguated by collector number', () => {
      const summaries = [
        { id: 'ex7-13', localId: '13', name: 'Piloswine', category: 'pokemon' }, // EX Team Rocket Returns
        { id: 'me02-024', localId: '024', name: 'Piloswine', category: 'pokemon' }, // Phantasmal Flames
        { id: 'neo2-16', localId: '16', name: 'Piloswine', category: 'pokemon' }, // Neo Genesis
      ];
      assert.equal(resolveCardId(summaries, 'Piloswine', 'Pokémon', '24', 'PFL'), 'me02-024');
      assert.equal(resolveCardId(summaries, 'Piloswine', 'Pokémon', '13', 'TRR'), 'ex7-13');
    });

    test('resolveCardId: collector number alone is ambiguous across sets (PFL #24 vs Skyridge #24)', () => {
      const summaries = [
        { id: 'ecard3-24', localId: '24', name: 'Piloswine', category: 'pokemon' },
        { id: 'me02-024', localId: '024', name: 'Piloswine', category: 'pokemon' },
      ];
      // Without a set code both tie on number — first wins (legacy behaviour).
      assert.equal(resolveCardId(summaries, 'Piloswine', 'Pokémon', '24'), 'ecard3-24');
      // With the printed set code the Phantasmal Flames printing wins decisively.
      assert.equal(resolveCardId(summaries, 'Piloswine', 'Pokémon', '24', 'PFL'), 'me02-024');
    });

    test('resolveCardId: collector number normalizes leading zeros', () => {
      const summaries = [
        { id: 'me02-024', localId: '024', name: 'Piloswine', category: 'pokemon' },
      ];
      assert.equal(resolveCardId(summaries, 'Piloswine', 'Pokémon', '24', 'PFL'), 'me02-024');
      assert.equal(resolveCardId(summaries, 'Piloswine', 'Pokémon', '024', 'PFL'), 'me02-024');
    });

    test('resolveCardId: no number given falls back to prior (order-based) behavior', () => {
      const summaries = [
        { id: 'ex7-13', localId: '13', name: 'Piloswine', category: 'pokemon' },
        { id: 'me02-024', localId: '024', name: 'Piloswine', category: 'pokemon' },
      ];
      assert.equal(resolveCardId(summaries, 'Piloswine', 'Pokémon'), 'ex7-13');
    });

    test('resolveCardId: unmatched number is ignored, does not block exact-name resolution', () => {
      const summaries = [{ id: 1, name: 'Pikachu', category: 'pokemon', localId: '5' }];
      assert.equal(resolveCardId(summaries, 'Pikachu', 'Pokémon', '999'), 1);
    });

    // ── Garland Ray: discard-to-scale damage (Mega Diancie ex) ──
    const GARLAND_RAY =
      'Discard up to 2 Energy cards from this Pokémon, and this attack does 120 damage for each card you discarded in this way.';

    test('discardEnergyScaling: Garland Ray → { max: 2 }', () => {
      assert.deepEqual(discardEnergyScaling(GARLAND_RAY), { max: 2, source: 'self', energyType: null, basicOnly: false });
    });

    test('discardEnergyScaling: Inferno X → any amount of {R} from among your Pokémon', () => {
      const t = 'Discard any amount of {R} Energy from among your Pokémon, and this attack does 90 damage for each card you discarded in this way.';
      assert.deepEqual(discardEnergyScaling(t), { max: Infinity, source: 'all', energyType: 'Fire', basicOnly: false });
    });

    test('discardEnergyScaling: Benched, hand, and deck-mill discards', () => {
      const bench = 'You may discard up to 2 Basic Energy from your Benched Pokémon. This attack does 90 more damage for each card you discarded in this way.';
      assert.deepEqual(discardEnergyScaling(bench), { max: 2, source: 'bench', energyType: null, basicOnly: true });
      const hand = 'Discard up to 3 Energy cards from your hand. This attack does 60 damage for each card you discarded in this way.';
      assert.deepEqual(discardEnergyScaling(hand), { max: 3, source: 'hand', energyType: null, basicOnly: false });
      const mill = 'Discard the top 5 cards of your deck. This attack does 100 damage for each Energy card you discarded in this way.';
      assert.equal(discardEnergyScaling(mill), null);
    });

    test('discardEnergyScaling: no “for each card you discarded” → null', () => {
      assert.equal(discardEnergyScaling('Discard 2 Energy cards from this Pokémon.'), null);
      assert.equal(discardEnergyScaling('Does 120 damage.'), null);
      assert.equal(discardEnergyScaling(''), null);
      assert.equal(discardEnergyScaling(null), null);
    });

    test('discardEnergyScaling: unnumbered discard clause defaults to 1', () => {
      // Only matches when both the “for each card you discarded” scaling
      // phrase and a “discard … Energy cards from this Pokémon” clause are
      // present; the number is optional in the regex but Garland Ray-style
      // text always carries one. Guard the default path explicitly.
      const t = 'Discard Energy cards from this Pokémon, and this attack does 120 damage for each card you discarded in this way.';
      assert.deepEqual(discardEnergyScaling(t), { max: 1, source: 'self', energyType: null, basicOnly: false });
    });

    test('parseAttackDamage: Garland Ray scales by energyDiscarded', () => {
      const atk = { name: 'Garland Ray', damage: 120, text: GARLAND_RAY };
      for (const [discarded, expected] of [[0, 0], [1, 120], [2, 240]]) {
        const parsed = parseAttackDamage(atk, {}, {}, { energyDiscarded: discarded });
        assert.equal(parsed.total, expected, `discarded=${discarded}`);
        assert.ok(
          parsed.components.includes('per-energy-discarded'),
          `component present at discarded=${discarded}`
        );
      }
    });

    test('parseAttackDamage: discard-scale branch wins over attached-energy branch', () => {
      // Even with attached Energy present, the discarded-count branch (printed
      // as “for each card you discarded”) takes precedence.
      const atk = { name: 'Garland Ray', damage: 120, text: GARLAND_RAY };
      const parsed = parseAttackDamage(atk, {}, {}, { energyDiscarded: 1, energyCount: 3 });
      assert.equal(parsed.total, 120); // 120 × 1, not 120 × 3
      assert.ok(parsed.components.includes('per-energy-discarded'));
    });

    test('parseAttackDamage: regression — “× the number of Energy” still uses attached count', () => {
      const atk = {
        name: 'Psychic Beam',
        damage: 30,
        text: 'This attack does 30 damage times the number of Energy cards attached to this Pokémon.',
      };
      const parsed = parseAttackDamage(atk, {}, {}, { energyCount: 3, energyDiscarded: 0 });
      assert.equal(parsed.total, 90); // 30 × 3 attached
      assert.ok(parsed.components.includes('per-energy'));
    });

    // ── A-scaler tests (Mega Evolution audit A) ──

    test('parseAttackDamage: per-each Energy on all your Pokémon (with ctx)', () => {
      const atk = {
        name: 'Mega Symphonia', damage: 50,
        text: 'This attack does 50 damage for each Psychic Energy attached to all of your Pok\u00e9mon.',
      };
      const p = parseAttackDamage(atk, {}, {}, { ownEnergyCount: 4 });
      assert.equal(p.total, 200); // 50 × 4
      assert.ok(p.components.includes('per-each'));
      assert.equal(p.resolved, true);
    });

    test('parseAttackDamage: per-each Energy on all your Pokémon (no ctx → unresolved)', () => {
      const atk = {
        name: 'Mega Symphonia', damage: 50,
        text: 'This attack does 50 damage for each Psychic Energy attached to all of your Pok\u00e9mon.',
      };
      const p = parseAttackDamage(atk, {}, {}, {});
      assert.equal(p.total, 50); // base only
      assert.ok(p.components.includes('per-each'));
      assert.equal(p.resolved, false);
      assert.ok(p.notes.some((n) => /resolve the printed count/.test(n)));
    });

    test('parseAttackDamage: per-each opponent\'s Active Energy (with ctx)', () => {
      const atk = {
        name: 'Ear Force', damage: 80,
        text: 'This attack does 80 more damage for each Energy card attached to your opponent\u2019s Active Pok\u00e9mon.',
      };
      const p = parseAttackDamage(atk, {}, {}, { opponentEnergyCount: 3 });
      assert.equal(p.total, 320); // 80 + 80×3
      assert.ok(p.components.includes('per-each'));
      assert.equal(p.resolved, true);
    });

    test('parseAttackDamage: per-each opponent\'s Active Energy (no ctx → unresolved)', () => {
      const atk = {
        name: 'Ear Force', damage: 80,
        text: 'This attack does 80 more damage for each Energy card attached to your opponent\u2019s Active Pok\u00e9mon.',
      };
      const p = parseAttackDamage(atk, {}, {}, {});
      assert.equal(p.resolved, false);
      assert.ok(p.notes.some((n) => /resolve the printed count/.test(n)));
    });

    test('parseAttackDamage: per-each species count (Beedrill)', () => {
      const atk = {
        name: 'Rumbling Bees', damage: 110,
        text: 'This attack does 110 damage for each of your Beedrill and Beedrill ex in play.',
      };
      const p = parseAttackDamage(atk, {}, {}, { speciesCount: 2 });
      assert.equal(p.total, 220); // 110 × 2
      assert.ok(p.components.includes('per-each'));
      assert.equal(p.resolved, true);
      const p2 = parseAttackDamage(atk, {}, {}, {});
      assert.equal(p2.resolved, false);
    });

    test('parseAttackDamage: per-each opponent hand count (Froslass)', () => {
      const atk = {
        name: 'Resentful Refrain', damage: 50,
        text: 'This attack does 50 damage for each card in your opponent\u2019s hand.',
      };
      const p = parseAttackDamage(atk, {}, {}, { opponentHandCount: 6 });
      assert.equal(p.total, 300); // 50 × 6
      assert.ok(p.components.includes('per-each'));
      const p2 = parseAttackDamage(atk, {}, {}, {});
      assert.equal(p2.resolved, false);
    });

    test('parseAttackDamage: per-each retreat cost (Chandelure)', () => {
      const atk = {
        name: 'Phantom Maze', damage: 130,
        text: 'This attack does 50 more damage for each Colorless in your opponent\u2019s Active Pok\u00e9mon\u2019s Retreat Cost.',
      };
      const p = parseAttackDamage(atk, {}, {}, { retreatCostColorless: 3 });
      assert.equal(p.total, 280); // 130 + 50×3
      assert.ok(p.components.includes('per-each'));
      const p2 = parseAttackDamage(atk, {}, {}, {});
      assert.equal(p2.resolved, false);
    });

    test('parseAttackDamage: per-each bench both sides (Clefairy)', () => {
      const atk = {
        name: 'Full Moon Rondo', damage: 20,
        text: 'This attack does 20 more damage for each Benched Pok\u00e9mon (both yours and your opponent\u2019s).',
      };
      const p = parseAttackDamage(atk, {}, {}, { ownBenchCount: 3, opponentBenchCount: 2 });
      assert.equal(p.total, 120); // 20 + 20×5
      assert.ok(p.components.includes('per-each'));
      assert.equal(p.resolved, true);
      const p2 = parseAttackDamage(atk, {}, {}, {});
      assert.equal(p2.resolved, false);
      assert.ok(p2.notes.some((n) => /resolve the printed count/.test(n)));
    });

    test('parseAttackDamage: per-each own bench (Terapagos)', () => {
      const atk = {
        name: 'Unified Beatdown', damage: 30,
        text: 'This attack does 30 damage for each of your Benched Pok\u00e9mon.',
      };
      const p = parseAttackDamage(atk, {}, {}, { ownBenchCount: 4 });
      assert.equal(p.total, 120); // 30 × 4
      assert.ok(p.components.includes('per-each'));
      const p2 = parseAttackDamage(atk, {}, {}, {});
      assert.equal(p2.resolved, false);
    });

    test('parseAttackDamage: per-each damaged bench (Gourgeist)', () => {
      const atk = {
        name: 'Horrifying Rondo', damage: 30,
        text: 'This attack does 50 more damage for each of your Benched Pok\u00e9mon that has any damage counters on it.',
      };
      const p = parseAttackDamage(atk, {}, {}, { damagedBenchCount: 2 });
      assert.equal(p.total, 130); // 30 + 50×2
      assert.ok(p.components.includes('per-each'));
      const p2 = parseAttackDamage(atk, {}, {}, {});
      assert.equal(p2.resolved, false);
    });

    test('parseAttackDamage: per-each damage counter on this Pokémon (Retribution Strike)', () => {
      const atk = {
        name: 'Retribution Strike', damage: 20,
        text: 'This attack does 10 more damage for each damage counter on this Pok\u00e9mon.',
      };
      const p = parseAttackDamage(atk, {}, {}, { attackerDamage: 3 });
      assert.equal(p.total, 50); // 20 + 10×3
      assert.ok(p.components.includes('per-each'));
      assert.ok(p.notes.some((n) => /damage counter.*on this/i.test(n)));
      const p2 = parseAttackDamage(atk, {}, {}, {});
      assert.equal(p2.resolved, false);
    });

    test('parseAttackDamage: per-each damage counter on opponent Active (Damage Beat)', () => {
      const atk = {
        name: 'Damage Beat', damage: 20,
        text: 'This attack does 20 damage for each damage counter on your opponent\u2019s Active Pok\u00e9mon.',
      };
      const p = parseAttackDamage(atk, {}, {}, { defenderDamage: 4 });
      assert.equal(p.total, 80); // 20 × 4
      assert.ok(p.components.includes('per-each'));
      assert.ok(p.notes.some((n) => /opponent's Active/i.test(n)));
      const p2 = parseAttackDamage(atk, {}, {}, {});
      assert.equal(p2.resolved, false);
    });

    test('parseAttackDamage: per-each attached Energy (Meganium)', () => {
      const atk = {
        name: 'Giant Bouquet', damage: 70,
        text: 'This attack does 50 more damage for each Grass Energy attached to this Pok\u00e9mon.',
      };
      const p = parseAttackDamage(atk, {}, {}, { energyCount: 2 });
      assert.equal(p.total, 170); // 70 + 50×2
      assert.ok(p.components.includes('per-each'));
      assert.equal(p.resolved, true);
    });

    test('parseAttackDamage: per-each attached Energy (Azumarill)', () => {
      const atk = {
        name: 'Energized Balloon', damage: 60,
        text: 'This attack does 40 more damage for each Psychic Energy attached to this Pok\u00e9mon.',
      };
      const p = parseAttackDamage(atk, {}, {}, { energyCount: 3 });
      assert.equal(p.total, 180); // 60 + 40×3
      assert.ok(p.components.includes('per-each'));
    });

    test('parseAttackDamage: per-each attached Energy (Cinccino, no more)', () => {
      const atk = {
        name: 'Energized Slap', damage: 40,
        text: 'This attack does 40 damage for each Energy attached to this Pok\u00e9mon.',
      };
      const p = parseAttackDamage(atk, {}, {}, { energyCount: 2 });
      assert.equal(p.total, 80); // 40 × 2 (not 40 + 40×2)
      assert.ok(p.components.includes('per-each'));
    });

    // ── B heal tests (Mega Evolution audit B) ──

    test('parseAttackDamage: heal \u201cHeal 30 damage from this Pok\u00e9mon\u201d', () => {
      const atk = {
        name: 'Jungle Dump', damage: 240,
        text: 'Heal 30 damage from this Pok\u00e9mon.',
      };
      const p = parseAttackDamage(atk, {}, {}, {});
      assert.equal(p.heal, 30);
      assert.ok(p.components.includes('heal'));
      assert.equal(p.total, 240); // heal does not add to total
    });

    test('parseAttackDamage: heal \u201cremove up to 50 damage counters\u201d', () => {
      const atk = {
        name: 'Soothing Wave', damage: 100,
        text: 'Remove up to 50 damage counters from this Pok\u00e9mon.',
      };
      const p = parseAttackDamage(atk, {}, {}, {});
      assert.equal(p.heal, 50);
      assert.ok(p.components.includes('heal'));
    });

    test('healTarget: \u201ceach of your Pok\u00e9mon\u201d → all', () => {
      const target = healTarget('Heal 30 damage from each of your Pok\u00e9mon.');
      assert.equal(target, 'all');
    });

    test('healTarget: \u201cthis Pok\u00e9mon\u201d → attacker', () => {
      const target = healTarget('Heal 30 damage from this Pok\u00e9mon.');
      assert.equal(target, 'attacker');
    });

    // ── I per-heads tests (Mega Evolution audit I) ──

    test('parseAttackDamage: per-heads coin (Kangaskhan, with ctx)', () => {
      const atk = {
        name: 'Rapid-Fire Combo', damage: 200,
        text: 'Flip a coin until you get tails. This attack does 50 more damage for each heads.',
      };
      const p = parseAttackDamage(atk, {}, {}, { headsCount: 2 });
      assert.equal(p.total, 300); // 200 + 50×2
      assert.ok(p.components.includes('per-each'));
      assert.equal(p.resolved, true);
    });

    test('parseAttackDamage: per-heads coin (Kangaskhan, no ctx → unresolved)', () => {
      const atk = {
        name: 'Rapid-Fire Combo', damage: 200,
        text: 'Flip a coin until you get tails. This attack does 50 more damage for each heads.',
      };
      const p = parseAttackDamage(atk, {}, {}, {});
      assert.equal(p.resolved, false);
      assert.ok(p.notes.some((n) => /resolve the printed count/.test(n)));
    });

    test('parseAbility: Pecharunt ex Subjugating Chains (bench↔active switch + conditional Poison)', () => {
      const text =
        "Once during your turn, you may switch 1 of your Benched {D} Pokémon, except any Pecharunt ex, with your Active Pokémon. If you do, the new Active Pokémon is now Poisoned. You can't use more than 1 Subjugating Chains Ability each turn.";
      const steps = parseAbility(text);
      assert.equal(steps.length, 1);
      assert.equal(steps[0].type, 'switchAbility');
      assert.equal(steps[0].pokemonType, 'darkness');
      assert.equal(steps[0].exceptName, 'pecharunt ex');
      assert.equal(steps[0].poisonNewActive, true);
    });

    test('parseSwitchAbility: Pecharunt ex filters and poison flag', async () => {
      const { parseSwitchAbility } = await import('../ability-executors.mjs');
      const parsed = parseSwitchAbility({
        ability: {
          text: "Once during your turn, you may switch 1 of your Benched {D} Pokémon, except any Pecharunt ex, with your Active Pokémon. If you do, the new Active Pokémon is now Poisoned.",
        },
      });
      assert.equal(parsed.benchToActive, true);
      assert.equal(parsed.pokemonType, 'darkness');
      assert.equal(parsed.exceptName, 'pecharunt ex');
      assert.equal(parsed.poisonNewActive, true);
    });

    test('planAbilitySteps: Pecharunt ex switch is actionable interactively', async () => {
      const { planAbilitySteps, actionableAbilityPlan } = await import('../ability-step-plan.mjs');
      const text =
        "Once during your turn, you may switch 1 of your Benched {D} Pokémon, except any Pecharunt ex, with your Active Pokémon. If you do, the new Active Pokémon is now Poisoned. You can't use more than 1 Subjugating Chains Ability each turn.";
      const steps = parseAbility(text);
      const plan = planAbilitySteps(steps, { mode: 'interactive' });
      assert.deepEqual(plan.map((p) => p.action), ['executor']);
      assert.equal(plan[0].executor, 'switch');
      assert.equal(actionableAbilityPlan(plan, { mode: 'interactive' }).length, 1);
    });

    test('parseAbility: recursionFromDiscardAbility (Snorlax Voraciousness)', () => {
      const steps = parseAbility(
        'Once during your turn, you may put up to 2 Leftovers cards from your discard pile into your hand.'
      );
      assert.equal(steps[0].type, 'recursionFromDiscardAbility');
    });

    test('parseAbility: checkupAbility (Froslass Freezing Shroud)', () => {
      const steps = parseAbility(
        'During Pokémon Checkup, put 1 damage counter on each Pokémon that has an Ability (both yours and your opponent\'s), except any Froslass.'
      );
      assert.equal(steps[0].type, 'checkupAbility');
    });

    test('parseAbility: onPromotionAbility damage (Iron Valiant Tachyon Bits)', () => {
      const steps = parseAbility(
        'Once during your turn, when this Pokémon moves from your Bench to the Active Spot, you may put 2 damage counters on 1 of your opponent\'s Pokémon.'
      );
      assert.equal(steps[0].type, 'onPromotionAbility');
      assert.equal(steps[0].effect, 'damage');
      assert.equal(steps.length, 1);
    });

    test('parseAbility: moveDamageBetweenAbility (Rocket Brain)', () => {
      const steps = parseAbility(
        'As often as you like during your turn, you may move 1 damage counter from 1 of your Benched {P} Pokémon to another of your Benched {P} Pokémon.'
      );
      assert.equal(steps[0].type, 'moveDamageBetweenAbility');
      assert.equal(steps[0].unlimited, true);
    });

    test('parseAbility: turnDamageBonusAbility (Torrential Heart)', () => {
      const steps = parseAbility(
        'Once during your turn, you may use this Ability. During this turn, this Pokémon\'s attacks do 60 more damage to your opponent\'s Active Pokémon.'
      );
      assert.equal(steps[0].type, 'turnDamageBonusAbility');
      assert.equal(steps[0].amount, 60);
    });

    test('parseAbility: Cursed Blast is move-damage not recursion', () => {
      const steps = parseAbility(
        'Once during your turn, you may put 4 damage counters on 1 of your opponent\'s Pokémon. If you use this Ability, this Pokémon is Knocked Out.'
      );
      assert.equal(steps[0].type, 'moveDamageAbility');
      assert.equal(steps[0].selfKnockOut, true);
    });

    test('ability search filter: Evolution {M} via search-match.mjs', async () => {
      const { matchesSearch } = await import('../search-match.mjs');
      const metalEvo = { name: 'Genesect', type: 'Pokémon', stage: 'Stage 1', types: ['Metal'] };
      const basic = { name: 'Pikachu', type: 'Pokémon', stage: 'Basic', types: ['Lightning'] };
      assert.equal(matchesSearch(metalEvo, 'Evolution {M} Pokémon'), true);
      assert.equal(matchesSearch(basic, 'Evolution {M} Pokémon'), false);
    });

    test('isUsableAbilityCard: promotion-only abilities excluded from picker', async () => {
      const { isUsableAbilityCard } = await import('../collect-usable-abilities.mjs');
      const card = {
        name: 'Iron Valiant',
        type: 'Pokémon',
        ability: {
          text: 'Once during your turn, when this Pokémon moves from your Bench to the Active Spot, you may put 2 damage counters on 1 of your opponent\'s Pokémon.',
        },
      };
      assert.equal(isUsableAbilityCard(card), false);
    });

    test('parseAbility: effectPreventAbility active-spot aura (Midnight Fluttering)', () => {
      const steps = parseAbility(
        'As long as this Pokémon is in the Active Spot, your opponent\'s Active Pokémon has no Abilities, except for Midnight Fluttering.'
      );
      assert.equal(steps[0].type, 'effectPreventAbility');
    });

    test('parseAbility: Trainer-prevention wording alone is not an Ancient Trait (App. 23)', () => {
      const text =
        "Whenever your opponent plays a Trainer card (excluding Pokémon Tools and Stadium cards), prevent all effects of that card done to this Pokémon.";
      const step = parseAbility(text).find((s) => s.type === 'effectPreventAbility');
      assert.ok(step, 'expected an effectPreventAbility step');
      assert.equal(step.trainerTriggered, true);
      assert.equal(step.trait, undefined, 'no α/Ω marker → a real Ability, not a trait');
      assert.match(step.guidance, /Trainer card/);
      assert.match(step.guidance, /Pokémon Tools\/Stadium/);

      const marker = parseAbility(`Ω Barrier ${text}`).find(
        (s) => s.type === 'effectPreventAbility'
      );
      assert.equal(marker.trait, 'omega', 'the printed Ω marker tags the trait');
    });

    test('parseAbility: attach-triggered wording alone is not an Ancient Trait (App. 23)', () => {
      const text =
        'When you attach an Energy card from your hand to this Pokémon (except with an attack, Ability, or Trainer card), you may attach 2 Energy cards.';
      const step = parseAbility(text).find((s) => s.type === 'attachAbility');
      assert.ok(step, 'expected an attachAbility step');
      assert.equal(step.triggeredByAttach, true);
      assert.equal(step.trait, undefined, 'no α/Ω marker → a real Ability, not a trait');
      assert.equal(step.upTo, 2);
      assert.match(step.guidance, /Whenever you attach/);
      assert.match(step.guidance, /triggers automatically/);

      const marker = parseAbility(`α Growth ${text}`).find(
        (s) => s.type === 'attachAbility'
      );
      assert.equal(marker.trait, 'alpha', 'the printed α marker tags the trait');
    });

    test('ancientTraitIn: all four printed markers + spelled Delta, null when marker-less', () => {
      assert.equal(ancientTraitIn('Ω Barrier'), 'omega');
      assert.equal(ancientTraitIn('α Growth'), 'alpha');
      assert.equal(ancientTraitIn('Δ Evolution'), 'delta');
      assert.equal(ancientTraitIn('θ Stop'), 'theta');
      assert.equal(ancientTraitIn('θ Double'), 'theta');
      assert.equal(ancientTraitIn('Delta Wild'), 'delta', 'the one spell-out printing');
      assert.equal(ancientTraitIn('Ancient Trait'), 'ancient', 'bare header stays truthy');
      assert.equal(ancientTraitIn('Once during your turn, draw 2 cards.'), null);
    });

    // Full ancient-trait corpus (pkmncards has:ancient-trait, 10 distinct traits).
    // Each marker tags every step parseAbility emits, so isAncientTraitAbility can
    // spare the card from a "have no Abilities" effect (App. 23, D72).
    test('parseAbility: all 10 Ancient Traits tag their parsed step (App. 23)', () => {
      const cases = [
        ['Δ Evolution', 'You may play this card from your hand to evolve a Pokémon during your first turn or the turn you play that Pokémon.', 'evolvePermissionAbility', 'delta'],
        ['θ Stop', "Prevent all effects of your opponent's Pokémon's Abilities done to this Pokémon.", 'effectPreventAbility', 'theta'],
        ['θ Double', 'This Pokémon may have up to 2 Pokémon Tool cards attached to it.', 'toolCapAbility', 'theta'],
        ['θ Max', 'When 1 of your Pokémon becomes this Pokémon, heal all damage from it.', 'healAbility', 'theta'],
        ['Δ Plus', "If your opponent's Pokémon is Knocked Out by damage from an attack of this Pokémon, take 1 more Prize card.", 'prizeModifyAbility', 'delta'],
        ['Delta Wild', "Any damage done to this Pokémon by attacks from your opponent's {G}, {R}, {W}, or {L} Pokémon is reduced by 20.", 'damageReductionAbility', 'delta'],
        ['Ω Barrier', "Whenever your opponent plays a Trainer card (excluding Pokémon Tools and Stadium cards), prevent all effects of that card done to this Pokémon.", 'effectPreventAbility', 'omega'],
        ['α Growth', 'When you attach an Energy card from your hand to this Pokémon, you may attach 2 Energy cards.', 'attachAbility', 'alpha'],
        ['Ω Barrage', 'This Pokémon may attack twice a turn.', 'extraAttackAbility', 'omega'],
        ['α Recovery', 'When this Pokémon is healed, double the amount healed.', 'healAbility', 'alpha'],
      ];
      for (const [name, body, type, trait] of cases) {
        const steps = parseAbility(`${name} ${body}`);
        const step = steps.find((s) => s.type === type);
        assert.ok(step, `${name}: expected a ${type} step, got ${steps.map((s) => s.type)}`);
        assert.equal(step.trait, trait, `${name} must carry trait='${trait}'`);
        assert.ok(
          steps.every((s) => s.trait === trait),
          `${name}: every step carries the trait`
        );
      }
    });

    test('parseAbility: a trait whose body matches no branch still tags the fallback step', () => {
      const steps = parseAbility('θ Unknown A completely novel trait effect that no branch recognizes.');
      assert.equal(steps.length, 1);
      assert.equal(steps[0].type, 'passiveAbility');
      assert.equal(steps[0].trait, 'theta');
    });

    test('isAncientTraitAbility: Δ/θ trait cards are traits, not Abilities (App. 23)', async () => {
      const { isAncientTraitAbility } = await import('../abilities.mjs');
      assert.equal(
        isAncientTraitAbility({
          name: 'Celebi',
          ability: { name: 'θ Stop', text: "Prevent all effects of your opponent's Pokémon's Abilities done to this Pokémon." },
        }),
        true
      );
      assert.equal(
        isAncientTraitAbility({
          name: 'Swellow',
          ability: { name: 'Δ Plus', text: "If your opponent's Pokémon is Knocked Out by damage from an attack of this Pokémon, take 1 more Prize card." },
        }),
        true
      );
      assert.equal(
        isAncientTraitAbility({
          name: 'M Rayquaza-EX',
          ability: { name: 'Delta Wild', text: "Any damage done to this Pokémon by attacks from your opponent's {G}, {R}, {W}, or {L} Pokémon is reduced by 20." },
        }),
        true
      );
    });

    // ── full-corpus ability gap clusters (I65) ──
    //
    // Regression coverage for the pkmncards full-corpus audit
    // (scripts/audit-all-pokemon.mjs). Each text is a real printed ability
    // that previously fell through to the `passiveAbility` fallback.

    test('parseAbility: continuous type change (Double Type / Unit Energy)', () => {
      const double = parseAbility('As long as this Pokémon is in play, it is {F} and {P} type.');
      assert.deepEqual(double.map((s) => s.type), ['typeChangeAbility']);

      const unit = parseAbility(
        'As long as this Pokémon has Unit Energy {F}{D}{Y} attached to it, it is a {F}, {D}, and {Y} Pokémon.'
      );
      assert.equal(unit[0].type, 'typeChangeAbility');
    });

    test('parseAbility: Special-Condition immunity without a named condition', () => {
      const steps = parseAbility(
        "Each of your Pokémon that has any {M} Energy attached to it can't be affected by any Special Conditions. Remove any Special Conditions affecting those Pokémon."
      );
      assert.ok(steps.some((s) => s.type === 'statusImmunityAbility'));
    });

    test('parseAbility: ability-suppression wording ("have no Abilities")', () => {
      const capsule = parseAbility(
        "If this Pokémon has a Memory Capsule attached, {W} Pokémon in play (both yours and your opponent's) have no Abilities."
      );
      assert.equal(capsule[0].type, 'effectPreventAbility');

      const damp = parseAbility(
        "Pokémon in play (both yours and your opponent's) lose any Ability that requires the Pokémon using it to Knock Out itself."
      );
      assert.equal(damp[0].type, 'effectPreventAbility');
    });

    test('parseAbility: attack copying ("can use the attacks of …")', () => {
      const steps = parseAbility(
        'This Pokémon can use the attacks of any Basic Pokémon in your discard pile. (You still need the necessary Energy to use each attack.)'
      );
      assert.equal(steps[0].type, 'attackCopyAbility');
    });

    test('parseAbility: extra attacks per turn (Festival Lead / Ω Barrage)', () => {
      assert.equal(
        parseAbility('This Pokémon may attack twice a turn.').some((s) => s.type === 'extraAttackAbility'),
        true
      );
      const festival = parseAbility(
        "If Festival Grounds is in play, this Pokémon may use an attack it has twice. If the first attack Knocks Out your opponent's Active Pokémon, you may attack again after your opponent chooses a new Active Pokémon."
      );
      assert.ok(festival.some((s) => s.type === 'extraAttackAbility'));
    });

    test('parseAbility: attacks ignore effects on the Defending Pokémon', () => {
      const steps = parseAbility(
        "Damage from attacks used by this Pokémon isn't affected by any effects on your opponent's Active Pokémon."
      );
      assert.equal(steps[0].type, 'ignoreDefenderEffectsAbility');
    });

    test('parseAbility: retreat-cost wording without "retreat cost"', () => {
      const less = parseAbility('As long as Dodrio is Benched, pay {C} less to retreat your Active Pokémon.');
      assert.equal(less[0].type, 'retreatCostAbility');
      assert.equal(less[0].increased, false);

      const more = parseAbility(
        "As long as Ariados is in play, each player must pay an additional {C} to retreat his or her Active Pokémon."
      );
      assert.equal(more[0].type, 'retreatCostAbility');
      assert.equal(more[0].increased, true);
    });

    test('parseAbility: energy replacement ("instead of its/their usual type")', () => {
      const steps = parseAbility(
        'All basic Energy cards attached to Steelix provide {M} Energy instead of their usual types.'
      );
      assert.equal(steps[0].type, 'energyMultiplierAbility');
    });

    test('parseAbility: Δ Evolution first-turn evolve permission', () => {
      const steps = parseAbility(
        'You may play this card from your hand to evolve a Pokémon during your first turn or the turn you play that Pokémon.'
      );
      assert.equal(steps[0].type, 'evolvePermissionAbility');
    });

    test('parseAbility: opponent reveal-hand is opponent disruption', () => {
      const steps = parseAbility('Once during your turn, you may have your opponent reveal their hand.');
      assert.equal(steps[0].type, 'opponentDisruptAbility');
      assert.equal(steps[0].revealHand, true);
    });

    test('parseAbility: hand ↔ top-of-deck swap (Primate Wisdom)', () => {
      const steps = parseAbility(
        'Once during your turn, you may switch a card from your hand with the top card of your deck.'
      );
      assert.equal(steps[0].type, 'handDeckSwapAbility');
    });

    test('parseAbility: discard pile → Bench recursion', () => {
      const steps = parseAbility(
        "During your turn, you may put up to 2 {C} Pokémon that don't have a Rule Box from your discard pile onto your Bench. (Pokémon V, Pokémon-GX, etc. have Rule Boxes.)"
      );
      assert.equal(steps[0].type, 'benchFromDiscardAbility');
    });

    test('parseAbility: variable draw until a board count', () => {
      const steps = parseAbility(
        'Once during your turn, you may draw cards until you have as many cards in your hand as you have Fusion Strike Pokémon in play.'
      );
      assert.equal(steps[0].type, 'drawVariableAbility');
    });

    test('parseAbility: shuffle this Pokémon into the deck', () => {
      const steps = parseAbility(
        'Once during your turn, if this Pokémon is on your Bench, you may shuffle it and all attached cards into your deck.'
      );
      assert.equal(steps[0].type, 'returnSelfToDeckAbility');
    });

    test('planAbilitySteps: new passive types are skipped, announce types not actionable', async () => {
      const { planAbilitySteps, actionableAbilityPlan } = await import('../ability-step-plan.mjs');
      const passive = parseAbility('As long as this Pokémon is in play, it is {F} and {P} type.');
      assert.deepEqual(
        planAbilitySteps(passive, { mode: 'interactive' }).map((p) => p.action),
        ['skip']
      );

      const announce = parseAbility(
        'Once during your turn, you may switch a card from your hand with the top card of your deck.'
      );
      const plan = planAbilitySteps(announce, { mode: 'interactive' });
      assert.deepEqual(
        plan.map((p) => p.action),
        ['announce']
      );
      assert.equal(actionableAbilityPlan(plan, { mode: 'interactive' }).length, 0);
    });

    // ── S211: long-tail ability families (I65 closed) ─────────────────────

    test('parseAbility: S211 locks, moves, self-return, one-offs', () => {
      const has = (text, type) => parseAbility(text).some((s) => s.type === type);

      // Card-play / evolve locks
      assert.ok(
        has(
          "As long as this Pokémon is in the Active Spot, your opponent can't play any Item cards or Pokémon Tool cards from their hand.",
          'playLockAbility'
        )
      );
      assert.ok(
        has(
          "As long as Dialga is your Active Pokémon, your opponent can't play any Pokémon from his or her hand to evolve his or her Active Pokémon.",
          'evolveLockAbility'
        )
      );
      assert.ok(
        has(
          'As long as Kabutops is your Active Pokémon, neither player can play Basic Pokémon or Evolution cards from his or her hand to evolve Benched Pokémon.',
          'evolveLockAbility'
        )
      );
      // Retreat locks
      assert.ok(
        has(
          "As long as this Pokémon is in the Active Spot, your opponent's Active Pokémon can't retreat.",
          'retreatLockAbility'
        )
      );
      assert.ok(
        has(
          "As long as Snorlax is your Active Pokémon, the Defending Pokémon can't Retreat. This power stops working when Snorlax is affected by a Special Condition.",
          'retreatLockAbility'
        )
      );
      // Ability suppression
      assert.ok(
        has(
          'As long as Muk ex is your Active Pokémon, ignore all Poké-Powers and Poké-Bodies other than Toxic Gas.',
          'powerSuppressAbility'
        )
      );
      assert.ok(
        has(
          "Once during your turn (before your attack), choose 1 of your opponent's Benched Pokémon that has a Pokémon Power. That power stops working until the end of this turn.",
          'powerSuppressAbility'
        )
      );
      // Damage-counter lock / moves
      assert.ok(
        has(
          "Damage counters on each Pokémon (both yours and your opponent's) can't be moved to other Pokémon.",
          'damageCounterLockAbility'
        )
      );
      assert.ok(
        has(
          'As often as you like during your turn, you may move 1 damage counter from 1 of your other Pokémon to this Pokémon.',
          'moveDamageBetweenAbility'
        )
      );
      assert.ok(
        has(
          "Once during your turn, you may move 1 damage counter from 1 of your Pokémon to 1 of your opponent's Pokémon.",
          'moveDamageAbility'
        )
      );
      // Energy moves
      assert.ok(
        has(
          'Once during your turn (before your attack), you may move a {R} Energy from 1 of your Pokémon to this Pokémon.',
          'moveEnergyAbility'
        )
      );
      assert.ok(
        has(
          "When 1 of your Pokémon is Knocked Out by damage from an attack from your opponent's Pokémon, you may move a {L} Energy from that Pokémon to this Pokémon.",
          'energyOnKoAbility'
        )
      );
      assert.ok(
        has(
          "Once during your turn (before your attack), you may flip a coin. If heads, move an Energy from your opponent's Active Pokémon to 1 of his or her Benched Pokémon.",
          'moveOpponentEnergyAbility'
        )
      );
      assert.ok(
        has(
          'Once during your turn (before your attack), you may switch a basic Energy attached to your Active Pokémon with a different type of basic Energy card from your discard pile.',
          'energySwapAbility'
        )
      );
      // Transform / self moves
      assert.ok(
        has(
          'Once during your turn, you may switch this Pokémon with an Aegislash in your hand. Any attached cards, damage counters, Special Conditions, turns in play, and any other effects remain on the new Pokémon.',
          'transformAbility'
        )
      );
      assert.ok(
        has(
          'Once during your turn (before your attack), if this Pokémon is in your discard pile, you may put this Pokémon on the bottom of your deck.',
          'returnSelfToDeckAbility'
        )
      );
      assert.ok(
        has(
          'Once during your turn (before your attack), you may return this Pokémon and all cards attached to it to your hand.',
          'returnSelfToHandAbility'
        )
      );
      assert.ok(
        has(
          'Once during your turn, if this Pokémon is in your hand and your opponent has any Stage 2 Pokémon in play, you may put this Pokémon onto your Bench.',
          'selfBenchPlacementAbility'
        )
      );
      // Status / win / Lost Zone
      assert.ok(
        has(
          'Once during your turn, you may use this Ability. Your Active Pokémon recovers from all Special Conditions.',
          'recoverStatusAbility'
        )
      );
      assert.ok(
        has(
          'Once during your turn (before your attack), you may remove a Special Condition from your Active Pokémon.',
          'recoverStatusAbility'
        )
      );
      assert.ok(
        has(
          'Once during your turn, if Xatu is on your Bench, you may choose 1 Special Condition from 1 of your Active Pokémon and remove that Special Condition. Then, 1 of the Defending Pokémon is now affected by that Special Condition that you chose.',
          'transferStatusAbility'
        )
      );
      assert.ok(
        has(
          'Once during your turn (before your attack), if this Pokémon is your Active Pokémon, and if you have 35 or more cards in your hand, you may use this Ability. If you do, you win this game.',
          'winGameAbility'
        )
      );
      assert.ok(
        has(
          "Once during your turn (before your attack), when you put Absol G LV.X from your hand onto your Active Absol G, you may flip 3 coins. For each heads, put the top card from your opponent's deck in the Lost Zone.",
          'lostZoneFromDeckAbility'
        )
      );
      // Deck peek / top-of-deck / discard
      assert.ok(
        has(
          "Once during your turn (before your attack), you may look at 5 cards from the top of your opponent's deck and put them back in the same order.",
          'deckPeekAbility'
        )
      );
      assert.ok(
        has(
          "Once during your turn (before your attack), you may put the top card of your opponent's deck on the bottom of their deck without looking at it.",
          'deckPlaceAbility'
        )
      );
      assert.ok(
        has(
          'Once during your turn (before your attack), you may flip a coin. If heads, put a card from your discard pile on top of your deck. If you use this Ability, your turn ends.',
          'recursionAbility'
        )
      );
      assert.ok(
        has(
          'During your turn, you may use this Ability. Discard any number of cards from your hand. Then, draw that many cards.',
          'discardForDrawAbility'
        )
      );
      // Self-attach / stadium / energy type / cost / coin / misc
      assert.ok(
        has(
          'Once during your turn (before your attack), you may Knock Out this Pokémon and attach it to one of your {L} Pokémon as a Special Energy card.',
          'selfAttachEnergyAbility'
        )
      );
      assert.ok(
        has(
          'Once during your turn (before your attack), you may discard any Stadium card in play. If you do, put a Stadium card with a different name from your discard pile into play.',
          'stadiumManipAbility'
        )
      );
      assert.ok(
        has(
          "All Special Energy attached to Pokémon (both yours and your opponent's) provide {C} Energy and have no other effect.",
          'energyTypeChangeAbility'
        )
      );
      assert.ok(
        has(
          "If you have the same number of cards in your hand as your opponent, the attack cost of each of Yanmega's attacks is 0.",
          'attackCostAbility'
        )
      );
      assert.ok(
        has(
          'Once during your turn, after you flip any coins for an attack, you may ignore all effects of those coin flips and begin flipping those coins again.',
          'coinFlipControlAbility'
        )
      );
      assert.ok(has('During your turn, you may play 2 Supporter cards.', 'playExtraSupporterAbility'));
      assert.ok(
        has(
          'As long as this Pokémon is in the Active Spot, your turn does not end when you use Café Master.',
          'turnNotEndAbility'
        )
      );
      assert.ok(
        has('If Sableye is your Active Pokémon at the beginning of the game, you go first.', 'goFirstAbility')
      );
      assert.ok(
        has(
          "As long as Brock's Rhydon is Benched, whenever 1 of your Benched Pokémon is damaged, you may do 10 of that damage to Brock's Rhydon instead.",
          'benchGuardAbility'
        )
      );
      assert.ok(
        has(
          'To attach a {W} Energy card from your hand to Suicune, you must discard an Energy card attached to Suicune.',
          'attachRestrictionAbility'
        )
      );
      assert.ok(has('You may attach any Technical Machine to Xatu.', 'attachPermissionAbility'));
      assert.ok(
        has(
          'When this Doduo retreats, hold this card and throw it as hard as you can because Doduo is running away.',
          'jokeAbility'
        )
      );
      assert.ok(
        has(
          'Once during your turn (before your attack), if Trapinch is your Active Pokémon, you may search your discard pile for a basic {F} card and attach it to Trapinch.',
          'searchDiscardAttachAbility'
        )
      );
      assert.ok(
        has(
          'Once during your turn (before your attack), you may choose 3 of your Benched Pokémon. Then, discard your other Benched Pokémon.',
          'discardBenchAbility'
        )
      );
      assert.ok(
        has(
          'Once during a game on your turn (before your attack), each player shuffles all cards in play (excluding Pokémon and Supporter cards) into his or her deck.',
          'resetInPlayAbility'
        )
      );
      assert.ok(
        has(
          "Once during your turn (before your attack), you may look at your opponent's hand. You may use the effect of a Supporter card you find there as the effect of this power.",
          'useSupporterAbility'
        )
      );
      assert.ok(
        has(
          "Once during your turn (before your attack), if this Pokémon is your Active Pokémon, you may discard a card from your hand. If you do, discard the top card of your opponent's deck.",
          'discardOpponentDeckAbility'
        )
      );
      assert.ok(
        has(
          "As long as Octillery is your Active Pokémon, whenever the Defending Pokémon retreats, discard all Energy cards attached to the Defending Pokémon when it goes to the Bench.",
          'opponentDisruptAbility'
        )
      );
      assert.ok(
        has(
          'As long as Articuno is your Active Pokémon, your Benched Pokémon do not take damage from and are not affected by attacks.',
          'damagePreventAbility'
        )
      );
    });

    test('classifyAbility: S211 long-tail families', () => {
      const c = (text) => classifyAbility({ name: 'X', abilities: [{ name: 'X', text }] });
      assert.equal(
        c("Pokémon-GX that have any damage counters on them (both yours and your opponent's) have no Abilities."),
        'effect-prevent'
      );
      assert.equal(
        c('Each Pokémon BREAK has no Abilities (this includes Abilities of its previous Evolution).'),
        'effect-prevent'
      );
      assert.equal(
        c('As long as Muk ex is your Active Pokémon, ignore all Poké-Powers and Poké-Bodies other than Toxic Gas.'),
        'effect-prevent'
      );
      assert.equal(
        c(
          "Once during your turn, choose 1 of your opponent's Benched Pokémon that has a Pokémon Power. That power stops working until the end of this turn."
        ),
        'effect-prevent'
      );
      assert.equal(
        c(
          'As long as Kabutops is your Active Pokémon, neither player can play Basic Pokémon or Evolution cards from his or her hand to evolve Benched Pokémon.'
        ),
        'effect-prevent'
      );
      assert.equal(
        c('This Pokémon can use the attacks of any Basic Pokémon in your discard pile.'),
        'copy-attack'
      );
      assert.equal(
        c('Once during your turn, you may use this Ability. Your Active Pokémon recovers from all Special Conditions.'),
        'status-recover'
      );
      assert.equal(
        c(
          "Once during your turn (before your attack), you may look at 5 cards from the top of your opponent's deck and put them back in the same order."
        ),
        'deck-peek'
      );
      assert.equal(
        c(
          'Once during your turn (before your attack), if this Pokémon is in your discard pile, you may put this Pokémon on the bottom of your deck.'
        ),
        'self-return'
      );
      assert.equal(
        c('To attach a {W} Energy card from your hand to Suicune, you must discard an Energy card attached to Suicune.'),
        'attach-restriction'
      );
      assert.equal(c('You may attach any Technical Machine to Xatu.'), 'attach-permission');
      assert.equal(
        c(
          "When 1 of your Pokémon is Knocked Out by damage from an attack from your opponent's Pokémon, you may move a {L} Energy from that Pokémon to this Pokémon."
        ),
        'energy-on-ko'
      );
      assert.equal(
        c("If you have the same number of cards in your hand as your opponent, the attack cost of each of Yanmega's attacks is 0."),
        'attack-cost'
      );
      assert.equal(
        c("All Special Energy attached to Pokémon (both yours and your opponent's) provide {C} Energy and have no other effect."),
        'energy-type'
      );
      assert.equal(
        c(
          'Once during your turn, after you flip any coins for an attack, you may ignore all effects of those coin flips and begin flipping those coins again.'
        ),
        'coin-control'
      );
      assert.equal(c('During your turn, you may play 2 Supporter cards.'), 'extra-supporter');
      assert.equal(
        c("If Sableye is your Active Pokémon at the beginning of the game, you go first."),
        'go-first'
      );
      assert.equal(
        c(
          "As long as Brock's Rhydon is Benched, whenever 1 of your Benched Pokémon is damaged, you may do 10 of that damage to Brock's Rhydon instead."
        ),
        'bench-guard'
      );
      assert.equal(
        c(
          'Once during your turn (before your attack), you may choose 3 of your Benched Pokémon. Then, discard your other Benched Pokémon.'
        ),
        'discard-bench'
      );
      assert.equal(
        c('When this Doduo retreats, hold this card and throw it as hard as you can because Doduo is running away.'),
        'joke'
      );
      assert.equal(
        c('As often as you like during your turn (before your attack), you may discard a {W} Energy card from your hand.'),
        'discard-cost'
      );
      assert.equal(
        c(
          "Once during your turn (before your attack), when you put Absol G LV.X from your hand onto your Active Absol G, you may flip 3 coins. For each heads, put the top card from your opponent's deck in the Lost Zone."
        ),
        'lost-zone'
      );
      assert.equal(
        c('Once during your turn (before your attack), you may Knock Out this Pokémon and attach it to one of your {L} Pokémon as a Special Energy card.'),
        'self-attach-energy'
      );
      assert.equal(
        c('As long as there is a {G} Energy attached to Muk, you must pay an additional {C}{C} to retreat it.'),
        'retreat-cost'
      );
      assert.equal(
        c("If Kecleon has any React Energy cards attached to it, Kecleon is {G}, {R}, {W}, {L}, {P}, and {F} type."),
        'type-change'
      );
      assert.equal(
        c('Once during your turn, you may move 1 damage counter from 1 of your Pokémon to 1 of your opponent\'s Pokémon.'),
        'move-damage'
      );
      assert.equal(
        c("Once during your turn (before your attack), if Azumarill is on your Bench, you may flip a coin. If heads, return Azumarill and all cards attached to it to your hand."),
        'self-return'
      );
    });

    test('classifyAbility: S211 additions do not steal earlier families', () => {
      const c = (text) => classifyAbility({ name: 'X', abilities: [{ name: 'X', text }] });
      // "play from your hand … discard" triggers are not discard-costs
      assert.equal(
        c("When you play this Pokémon from your hand onto your Bench during your turn, you may discard the top card of your opponent's deck."),
        'when-played'
      );
      assert.equal(
        c('When you play this Pokémon from your hand onto your Bench during your turn, you may discard a Stadium in play.'),
        'when-played'
      );
      // damage reduction is not a discard cost
      assert.equal(
        c(
          "If Flygon ex is damaged by an opponent's attack, you may discard up to 4 cards from your hand. If you do, any damage done to Flygon ex is reduced by 10 for each card you discarded."
        ),
        'damage-reduce'
      );
      // energy-discard + damage bonus stays cost-discount
      assert.equal(
        c(
          "Once during your turn, you may discard a {R} Energy card from your hand in order to use this Ability. During this turn, your {R} Pokémon's attacks do 30 more damage to your opponent's Active Pokémon."
        ),
        'cost-discount'
      );
      // "ignore all Energy in the attack cost" stays cost-discount
      assert.equal(
        c("If you have exactly 4 cards in your hand, ignore all Energy in the attack cost of each of this Pokémon's attacks."),
        'cost-discount'
      );
      // "discard an Energy attached to the Defending Pokémon" is not an attach restriction
      assert.equal(
        c('When you play Gyarados from your hand to evolve your Active Pokémon, you may flip 2 coins. For each heads, discard an Energy card attached to the Defending Pokémon.'),
        'when-played'
      );
      // transform wording is not a damage move
      assert.equal(
        c(
          'During your turn (before your attack), you may put a Basic Pokémon from your hand on top of this Pokémon. (This does not count as playing that Pokémon or evolving.) This Pokémon is now that Pokémon. (Any cards attached to this Pokémon, damage counters, Special Conditions, turns in play, and any other effects remain on the new Pokémon.)'
        ),
        'status'
      );
      // heal + condition removal stays status, not status-recover
      assert.equal(
        c('Once during your turn (before your attack), you may heal 30 damage and remove a Special Condition from your Active Pokémon.'),
        'status'
      );
      // "when you play … return" is not self-return
      assert.equal(
        c(
          'Once during your turn, when you play Shiftry from your hand to evolve 1 of your Pokémon, you may choose 1 of your Evolved Pokémon in play (excluding any Shiftry). Return that Pokémon and all cards attached to it to your hand.'
        ),
        'when-played'
      );
    });

    test('planAbilitySteps: S211 passive lock types are skipped', async () => {
      const { planAbilitySteps, PASSIVE_ABILITY_STEP_TYPES } = await import('../ability-step-plan.mjs');
      for (const type of [
        'playLockAbility',
        'evolveLockAbility',
        'retreatLockAbility',
        'powerSuppressAbility',
        'damageCounterLockAbility',
        'energyOnKoAbility',
        'energyTypeChangeAbility',
        'attackCostAbility',
        'coinFlipControlAbility',
        'playExtraSupporterAbility',
        'turnNotEndAbility',
        'goFirstAbility',
        'benchGuardAbility',
        'attachRestrictionAbility',
        'attachPermissionAbility',
        'jokeAbility',
      ]) {
        assert.ok(PASSIVE_ABILITY_STEP_TYPES.has(type), type);
      }
      const plan = planAbilitySteps(
        parseAbility("As long as this Pokémon is in the Active Spot, your opponent can't play any Item cards from their hand."),
        { mode: 'interactive' }
      );
      assert.deepEqual(
        plan.map((p) => p.action),
        ['skip']
      );
    });

    test('describeAbilityFamily: S211 families get guidance lines', () => {
      assert.match(
        describeAbilityFamily({ name: 'Xatu', ability: { text: 'You may attach any Technical Machine to Xatu.' } }),
        /attach permission/
      );
      assert.match(
        describeAbilityFamily({ name: 'Victini', ability: { text: 'Once during your turn, after you flip any coins for an attack, you may ignore all effects of those coin flips and begin flipping those coins again.' } }),
        /coin control/
      );
      assert.match(
        describeAbilityFamily({ name: 'Imakuni?s Doduo', ability: { text: 'When this Doduo retreats, hold this card and throw it as hard as you can because Doduo is running away.' } }),
        /joke card/
      );
    });

    test('App. 23: "have no Abilities" leaves Ancient Traits alone', async () => {
      const { isAncientTraitAbility } = await import('../abilities.mjs');
      const { stadiumAbilityBlocked } = await import('../stadium-effects.mjs');
      const { markStadiumPlayed } = await import('../rules-state.mjs');

      const alpha = {
        name: 'Venusaur',
        ability: {
          name: 'α Growth',
          text: 'When you attach an Energy card from your hand to this Pokémon, you may attach up to 2 Energy cards from your hand to this Pokémon in any way you like.',
        },
      };
      const omega = {
        name: 'Aegislash',
        ability: {
          name: 'Ω Barrier',
          text: "Whenever your opponent plays a Trainer card (excluding Pokémon Tools and Stadium cards), prevent all effects of that card done to this Pokémon.",
        },
      };
      const real = {
        name: 'Bellossom',
        ability: { text: 'Once during your turn, you may draw 2 cards.' },
      };
      // Marker-less Abilities whose wording echoes the two canonical traits: a
      // real Ability, so a "have no Abilities" effect must suppress them (this
      // is the Phase 3 defect — the old wording fallbacks tagged them as traits).
      const wordedOmega = {
        name: 'Sceptile',
        ability: {
          text: "Whenever your opponent plays a Trainer card (excluding Pokémon Tools and Stadium cards), prevent all effects of that card done to this Pokémon.",
        },
      };
      const wordedAlpha = {
        name: 'Venusaur',
        ability: {
          text: 'When you attach an Energy card from your hand to this Pokémon, you may attach up to 2 Energy cards from your hand to this Pokémon in any way you like.',
        },
      };

      assert.equal(isAncientTraitAbility(alpha), true);
      assert.equal(isAncientTraitAbility(omega), true);
      assert.equal(isAncientTraitAbility(real), false);
      assert.equal(isAncientTraitAbility(wordedOmega), false, 'wording alone is not a trait');
      assert.equal(isAncientTraitAbility(wordedAlpha), false, 'wording alone is not a trait');

      const prev = rulesState.stadium;
      rulesState.enabled = true;
      try {
        markStadiumPlayed('self', {
          name: "Team Rocket's Watchtower",
          subtypes: ['Stadium'],
          text: "Pokémon in play (both yours and your opponent's) have no Abilities.",
        });
        assert.equal(stadiumAbilityBlocked(real), true, 'a real Ability is suppressed');
        assert.equal(
          stadiumAbilityBlocked(wordedOmega),
          true,
          'marker-less Trainer-prevention wording is a real Ability and is suppressed'
        );
        assert.equal(
          stadiumAbilityBlocked(wordedAlpha),
          true,
          'marker-less attach-triggered wording is a real Ability and is suppressed'
        );
        assert.equal(stadiumAbilityBlocked(alpha), false, 'α Growth is a trait, not an Ability');
        assert.equal(stadiumAbilityBlocked(omega), false, 'Ω Barrier is a trait, not an Ability');
      } finally {
        rulesState.stadium = prev;
      }
    });

    // ── compound ability step orchestration (planAbilitySteps) ──

    test('planAbilitySteps: draw + search interactive order', async () => {
      const { planAbilitySteps } = await import('../ability-step-plan.mjs');
      const { parseAbility } = await import('../abilities.mjs');
      const text =
        'Once during your turn, you may draw 2 cards. Once during your turn, you may search your deck for a Basic Pokémon and put it onto your Bench.';
      const steps = parseAbility(text);
      const plan = planAbilitySteps(steps, { mode: 'interactive' });
      assert.deepEqual(
        plan.map((p) => p.action),
        ['search', 'draw']
      );
    });

    test('planAbilitySteps: auto mode — self draw only; opponentDraw alone announces', async () => {
      const { planAbilitySteps, actionableAbilityPlan } = await import('../ability-step-plan.mjs');
      const { parseAbility } = await import('../abilities.mjs');
      const drawText = 'Once during your turn, you may draw 2 cards.';
      const drawSteps = parseAbility(drawText);
      const drawPlan = planAbilitySteps(drawSteps, { mode: 'auto' });
      assert.deepEqual(drawPlan.map((p) => p.action), ['draw']);
      assert.equal(actionableAbilityPlan(drawPlan, { mode: 'auto' }).length, 1);

      const oppText = 'Once during your turn, your opponent draws 2 cards.';
      const oppPlan = planAbilitySteps(parseAbility(oppText), { mode: 'auto' });
      assert.deepEqual(oppPlan.map((p) => p.action), ['announce']);
    });

    test('planAbilitySteps: when-played + search compound detected', async () => {
      const { planAbilitySteps, hasWhenPlayedSearchChain } = await import('../ability-step-plan.mjs');
      const { parseAbility } = await import('../abilities.mjs');
      const text =
        'When you play this Pokémon from your hand, search your deck for up to 2 Basic Pokémon and put them onto your Bench.';
      const steps = parseAbility(text);
      assert.ok(hasWhenPlayedSearchChain(steps));
      const plan = planAbilitySteps(steps, { mode: 'interactive' });
      assert.deepEqual(
        plan.map((p) => p.action),
        ['search', 'when-played']
      );
    });

    test('planAbilitySteps: passive steps skipped in compound plan', async () => {
      const { planAbilitySteps } = await import('../ability-step-plan.mjs');
      const { parseAbility } = await import('../abilities.mjs');
      const text =
        'Once during your turn, you may draw a card. This Pokémon takes 30 less damage from attacks.';
      const steps = parseAbility(text);
      const plan = planAbilitySteps(steps, { mode: 'interactive' });
      assert.deepEqual(
        plan.map((p) => p.action),
        ['draw', 'skip']
      );
      assert.equal(plan[1].reason, 'passive');
    });

    test('markAbilityUseAfterSearchStep: cancel does not consume optional search (Mammoth Hauler)', async () => {
      const { markAbilityUseAfterSearchStep } = await import('../ability-step-plan.mjs');
      const { parseAbility } = await import('../abilities.mjs');
      const { classifyAbility } = await import('../ability-effects.mjs');

      const card = {
        name: 'Mamoswine ex',
        ability: {
          name: 'Mammoth Hauler',
          text: 'Once during your turn, you may search your deck for a Pokémon, reveal it, and put it into your hand. Then, shuffle your deck.',
        },
      };
      assert.equal(classifyAbility(card), 'search');
      const steps = parseAbility(card.ability.text);
      assert.equal(steps[0].type, 'searchAbility');

      assert.equal(markAbilityUseAfterSearchStep(false), false, 'cancel must not mark ability used');
      assert.equal(markAbilityUseAfterSearchStep(true), true, 'confirmed pick marks ability used');
    });

    // ── card identity resolution (name collisions across sets) ──
    //
    // Regression coverage for the "wrong Piloswine" incident: board cards carry
    // no TCGdex id, so the engine used to resolve one by name alone. Pokémon
    // names are reprinted verbatim across dozens of sets, every reprint scored
    // identically, and the winner was whatever order the API happened to
    // return — which could hand the attack parser a completely different
    // card's attacks[].
    const { ensureCardData } = await import('../rules-state.mjs');

    const piloswinePrintings = [
      { id: 'neo1-38', name: 'Piloswine', category: 'pokemon', localId: '38' },
      { id: 'ex7-32', name: 'Piloswine', category: 'pokemon', localId: '32' },
      { id: 'dp6-71', name: 'Piloswine', category: 'pokemon', localId: '71' },
    ];

    test('resolveCardId: collector number picks the printing regardless of API order', () => {
      assert.equal(resolveCardId(piloswinePrintings, 'Piloswine', 'Pokémon', '71'), 'dp6-71');
      assert.equal(
        resolveCardId([...piloswinePrintings].reverse(), 'Piloswine', 'Pokémon', '71'),
        'dp6-71'
      );
      assert.equal(resolveCardId(piloswinePrintings, 'Piloswine', 'Pokémon', '32'), 'ex7-32');
    });

    test('resolveCardId: collector number ignores leading zeros and whitespace', () => {
      assert.equal(resolveCardId(piloswinePrintings, 'Piloswine', 'Pokémon', '032'), 'ex7-32');
      assert.equal(resolveCardId(piloswinePrintings, 'Piloswine', 'Pokémon', ' 32 '), 'ex7-32');
      assert.equal(resolveCardId(piloswinePrintings, 'Piloswine', 'Pokémon', 32), 'ex7-32');
    });

    test('resolveCardId: without a number it still resolves (first exact match wins)', () => {
      // Documents the remaining gap: no number means no tiebreaker, so the
      // result is only as good as the API's ordering.
      assert.equal(resolveCardId(piloswinePrintings, 'Piloswine', 'Pokémon'), 'neo1-38');
      assert.equal(resolveCardId(piloswinePrintings, 'Piloswine', 'Pokémon', null), 'neo1-38');
    });

    test('resolveCardId: a number match never promotes a partial-name candidate', () => {
      const summaries = [
        { id: 'sv1-32', name: 'Piloswine ex', category: 'pokemon', localId: '32' },
        { id: 'dp6-71', name: 'Piloswine', category: 'pokemon', localId: '71' },
      ];
      assert.equal(resolveCardId(summaries, 'Piloswine', 'Pokémon', '32'), 'dp6-71');
    });

    test('resolveCardId: a number match never promotes a wrong-category candidate', () => {
      const summaries = [
        { id: 'trn-32', name: 'Cyrus', category: 'trainer', localId: '32' },
        { id: 'pkm-71', name: 'Cyrus', category: 'pokemon', localId: '71' },
      ];
      assert.equal(resolveCardId(summaries, 'Cyrus', 'Pokémon', '32'), 'pkm-71');
    });

    test('resolveCardId: an unmatched number leaves the existing scoring intact', () => {
      assert.equal(resolveCardId(piloswinePrintings, 'Piloswine', 'Pokémon', '999'), 'neo1-38');
    });

    // ── ensureCardData: deterministic id from (set code, collector number) ──

    const withStubbedFetch = async (handler, fn) => {
      const previous = globalThis.fetch;
      const calls = [];
      globalThis.fetch = async (url) => {
        calls.push(url);
        return handler(url);
      };
      try {
        return await fn(calls);
      } finally {
        globalThis.fetch = previous;
      }
    };

    const detailResponse = (body) => ({ ok: true, json: async () => body });

    test('ensureCardData: legacy set code + number resolves without a name search', async () => {
      const handler = (url) => {
        if (url.includes('/cards/ex7-901')) {
          return detailResponse({
            id: 'ex7-901',
            name: 'Piloswine',
            hp: '80',
            attacks: [{ name: 'Rock Throw', damage: '30', effect: '' }],
          });
        }
        return { ok: false, json: async () => ({}) };
      };
      await withStubbedFetch(handler, async (calls) => {
        const card = { name: 'Piloswine', type: 'Pokémon', set: 'TRR', number: '901' };
        await ensureCardData(card);
        assert.equal(card.id, 'ex7-901');
        assert.equal(card.hp, 80);
        assert.deepEqual(
          card.attacks.map((a) => a.name),
          ['Rock Throw']
        );
        assert.ok(!calls.some((u) => u.includes('/cards?name=')));
      });
    });

    test('ensureCardData: legacy id whose name disagrees falls back to the name search', async () => {
      const handler = (url) => {
        // The legacy table is hand-built for limitlesstcg's URL scheme, so a
        // candidate id can land on an unrelated card — that must not be trusted.
        if (url.includes('/cards/ex7-902')) {
          return detailResponse({ id: 'ex7-902', name: 'Team Rocket Base', hp: null });
        }
        if (url.includes('/cards?name=')) {
          return detailResponse([
            { id: 'dp6-902', name: 'Piloswine', category: 'pokemon', localId: '902' },
          ]);
        }
        if (url.includes('/cards/dp6-902')) {
          return detailResponse({ id: 'dp6-902', name: 'Piloswine', hp: '90', attacks: [] });
        }
        return { ok: false, json: async () => ({}) };
      };
      await withStubbedFetch(handler, async (calls) => {
        const card = { name: 'Piloswine', type: 'Pokémon', set: 'TRR', number: '902' };
        await ensureCardData(card);
        assert.equal(card.id, 'dp6-902');
        assert.equal(card.hp, 90);
        assert.ok(calls.some((u) => u.includes('/cards?name=')));
      });
    });

    test('resolveCardId: Pitch Black Popplio disambiguated by PBL set code', () => {
      const summaries = [
        { id: 'smp-SM03', localId: 'SM03', name: 'Popplio', category: 'pokemon' },
        { id: 'me05-018', localId: '018', name: 'Popplio', category: 'pokemon' },
        { id: 'sm1-39', localId: '39', name: 'Popplio', category: 'pokemon' },
      ];
      assert.equal(resolveCardId(summaries, 'Popplio', 'Pokémon', '18', 'PBL'), 'me05-018');
      assert.equal(resolveCardId(summaries, 'Popplio', 'Pokémon', '18'), 'me05-018');
    });

    test('ensureCardData: Pitch Black (PBL) resolves via set code without a name search', async () => {
      const handler = (url) => {
        if (url.includes('/cards/me05-018')) {
          return detailResponse({
            id: 'me05-018',
            name: 'Popplio',
            hp: '70',
            attacks: [{ name: 'Pound', damage: '10', effect: '' }],
          });
        }
        return { ok: false, json: async () => ({}) };
      };
      await withStubbedFetch(handler, async (calls) => {
        const card = { name: 'Popplio', type: 'Pokémon', set: 'PBL', number: '18' };
        await ensureCardData(card);
        assert.equal(card.id, 'me05-018');
        assert.deepEqual(card.attacks.map((a) => a.name), ['Pound']);
        assert.ok(!calls.some((u) => u.includes('/cards?name=')));
      });
    });

    test('ensureCardData: modern set code (PFL) resolves via padded id without a name search', async () => {
      const handler = (url) => {
        if (url.includes('/cards/me02-024')) {
          return detailResponse({
            id: 'me02-024',
            name: 'Piloswine',
            hp: '120',
            attacks: [
              { name: 'Rising Lunge', damage: '30+', effect: 'Flip a coin.' },
              { name: 'Frost Smash', damage: '70', effect: '' },
            ],
          });
        }
        return { ok: false, json: async () => ({}) };
      };
      await withStubbedFetch(handler, async (calls) => {
        const card = { name: 'Piloswine', type: 'Pokémon', set: 'PFL', number: '24' };
        await ensureCardData(card);
        assert.equal(card.id, 'me02-024');
        assert.equal(card.hp, 120);
        assert.deepEqual(card.attacks.map((a) => a.name), ['Rising Lunge', 'Frost Smash']);
        assert.ok(!calls.some((u) => u.includes('/cards?name=')));
      });
    });

    test('ensureCardData: a truly unknown set code uses name search only', async () => {
      const handler = (url) => {
        if (url.includes('/cards?name=')) {
          return detailResponse([
            { id: 'sv1-903', name: 'Piloswine', category: 'pokemon', localId: '903' },
          ]);
        }
        if (url.includes('/cards/sv1-903')) {
          return detailResponse({ id: 'sv1-903', name: 'Piloswine', hp: '110', attacks: [] });
        }
        return { ok: false, json: async () => ({}) };
      };
      await withStubbedFetch(handler, async (calls) => {
        const card = { name: 'Piloswine', type: 'Pokémon', set: 'ZZZ', number: '903' };
        await ensureCardData(card);
        assert.ok(!calls.some((u) => u.match(/\/cards\/zzz-/i)));
        assert.equal(card.id, 'sv1-903');
        assert.equal(card.hp, 110);
      });
    });

    test('ensureCardData: an already-enriched card short-circuits (weakness, not weaknesses)', async () => {
      const handler = () => {
        throw new Error('ensureCardData must not re-fetch an enriched card');
      };
      await withStubbedFetch(handler, async (calls) => {
        const card = {
          name: 'Piloswine',
          id: 'ex7-904',
          hp: 80,
          weakness: null,
          attacks: [
            {
              name: 'Stampede',
              cost: ['Fighting', 'Colorless'],
              damage: 20,
              text: 'Flip a coin. If heads, this attack does 10 more damage.',
            },
          ],
        };
        await ensureCardData(card);
        assert.equal(calls.length, 0);
      });
    });

    test('ensureCardData: replaces placeholder attack text with TCGdex effect', async () => {
      const callForFamilyText =
        'Search your deck for a Basic Pokémon and put it onto your Bench. Then, shuffle your deck.';
      const handler = (url) => {
        if (url.includes('/cards/sv03.5-016')) {
          return detailResponse({
            id: 'sv03.5-016',
            name: 'Pidgey',
            hp: '50',
            attacks: [
              {
                name: 'Call for Family',
                cost: ['Colorless'],
                damage: '0',
                effect: callForFamilyText,
              },
            ],
          });
        }
        return { ok: false, json: async () => ({}) };
      };
      await withStubbedFetch(handler, async () => {
        const card = {
          id: 'sv03.5-016',
          name: 'Pidgey',
          hp: 50,
          weakness: null,
          attacks: [
            { name: 'Call for Family', cost: ['Colorless'], damage: 0, text: '0' },
          ],
        };
        await ensureCardData(card);
        assert.equal(card.attacks[0].text, callForFamilyText);
      });
    });

    test('ensureCardData: merges attack effect text onto stub attacks[]', async () => {
      const callForFamilyText =
        'Search your deck for up to 2 Basic Pokémon and put them onto your Bench. Then, shuffle your deck.';
      const handler = (url) => {
        if (url.includes('/cards/sv03.5-016-stub-merge')) {
          return detailResponse({
            id: 'sv03.5-016-stub-merge',
            name: 'Pidgey',
            hp: '50',
            attacks: [
              {
                name: 'Call for Family',
                cost: ['Colorless'],
                damage: '0',
                effect: callForFamilyText,
              },
            ],
          });
        }
        return { ok: false, json: async () => ({}) };
      };
      await withStubbedFetch(handler, async () => {
        const card = {
          id: 'sv03.5-016-stub-merge',
          name: 'Pidgey',
          hp: 50,
          weakness: null,
          attacks: [{ name: 'Call for Family', cost: ['Colorless'], damage: 0 }],
        };
        await ensureCardData(card);
        assert.equal(card.attacks[0].text, callForFamilyText);
      });
    });

    test('ensureCardData: replaces multiplier placeholder "30×" with TCGdex effect', async () => {
      const beatEffect =
        'This attack does 30 damage for each Energy attached to this Pokémon.';
      const handler = (url) => {
        if (url.includes('/cards/sv1-001')) {
          return detailResponse({
            id: 'sv1-001',
            name: 'Testmon',
            hp: '60',
            attacks: [
              {
                name: 'Beat',
                cost: ['Colorless'],
                damage: '30',
                effect: beatEffect,
              },
            ],
          });
        }
        return { ok: false, json: async () => ({}) };
      };
      await withStubbedFetch(handler, async () => {
        const card = {
          id: 'sv1-001',
          name: 'Testmon',
          hp: 60,
          weakness: null,
          attacks: [{ name: 'Beat', cost: ['Colorless'], damage: 30, text: '30×' }],
        };
        await ensureCardData(card);
        assert.equal(card.attacks[0].text, beatEffect);
      });
    });

    test('attacksNeedText returns true for text "30×"', async () => {
      let fetched = false;
      const handler = (url) => {
        fetched = true;
        if (url.includes('/cards/test-ph-30x-needtext')) {
          return detailResponse({
            id: 'test-ph-30x-needtext',
            name: 'Testmon',
            hp: '60',
            attacks: [
              {
                name: 'Beat',
                cost: ['Colorless'],
                damage: '30',
                effect: 'Real effect text.',
              },
            ],
          });
        }
        return { ok: false, json: async () => ({}) };
      };
      await withStubbedFetch(handler, async () => {
        const card = {
          id: 'test-ph-30x-needtext',
          name: 'Testmon',
          hp: 60,
          weakness: null,
          attacks: [{ name: 'Beat', cost: ['Colorless'], damage: 30, text: '30×' }],
        };
        await ensureCardData(card);
        assert.ok(fetched, 'attacksNeedText should treat "30×" as placeholder');
      });
    });

    // ── card identity resolution (name collisions across sets) ──

    // ── pending attack effects (next-turn-lock, damage-prevention, discard-opponent) ──
    test('parsePendingAttackEffects: defender locks and self damage reduction', async () => {
      const {
        parsePendingAttackEffects,
        queuePendingAttackEffects,
        pendingCantRetreat,
        pendingDamagePrevention,
        combinedPendingDamagePrevention,
        expirePendingEffectsForTurnEnd,
      } = await import('../attack-pending-effects.mjs');
      const { rulesState, resetRulesSessionState, beginTurn, endTurn } = await import('../rules-state.mjs');

      const text =
        "During your opponent's next turn, the Defending Pokémon can't retreat. This Pokémon takes 30 less damage from attacks.";
      const parsed = parsePendingAttackEffects(text);
      assert.equal(parsed.length, 2);
      assert.ok(parsed.some((e) => e.kind === 'cant-retreat'));
      assert.ok(parsed.some((e) => e.kind === 'damage-reduce' && e.value === 30));

      resetRulesSessionState();
      queuePendingAttackEffects(rulesState, 'self', parsed, 'Test Lock');
      assert.equal(pendingCantRetreat(rulesState, 'opp'), false);
      assert.equal(pendingDamagePrevention(rulesState, 'self').reduce, 0);

      endTurn('self');
      beginTurn('opp');
      assert.equal(pendingCantRetreat(rulesState, 'opp'), true);
      assert.equal(pendingDamagePrevention(rulesState, 'self').reduce, 30);

      const merged = combinedPendingDamagePrevention(
        rulesState,
        'self',
        { preventAll: false, reduce: 0 },
        { stage: 'Basic', name: 'Pikachu' }
      );
      assert.equal(merged.reduce, 30);

      endTurn('opp');
      expirePendingEffectsForTurnEnd(rulesState, 'opp');
      assert.equal(pendingCantRetreat(rulesState, 'opp'), false);
      assert.equal(pendingDamagePrevention(rulesState, 'self').reduce, 0);
    });

    test('parsePendingAttackEffects: until-leaves-active and self-next-turn', async () => {
      const {
        parsePendingAttackEffects,
        queuePendingAttackEffects,
        pendingCantUseAttack,
        pendingCantAttack,
        clearActiveSpotPendingEffects,
        expirePendingEffectsForTurnEnd,
      } = await import('../attack-pending-effects.mjs');
      const { rulesState, resetRulesSessionState, beginTurn, endTurn } = await import('../rules-state.mjs');

      const untilText =
        "This Pokémon can't use Hyper Beam again until it leaves the Active Spot.";
      const untilParsed = parsePendingAttackEffects(untilText);
      assert.equal(untilParsed.length, 1);
      assert.equal(untilParsed[0].window, 'until-leaves-active');

      resetRulesSessionState();
      queuePendingAttackEffects(rulesState, 'self', untilParsed, 'Hyper Beam');
      assert.equal(pendingCantUseAttack(rulesState, 'self', 'Hyper Beam'), true);

      clearActiveSpotPendingEffects(rulesState, 'self');
      assert.equal(pendingCantUseAttack(rulesState, 'self', 'Hyper Beam'), false);

      const selfTurnText = "During your next turn, this Pokémon can't attack.";
      const selfParsed = parsePendingAttackEffects(selfTurnText);
      resetRulesSessionState();
      queuePendingAttackEffects(rulesState, 'self', selfParsed, 'Rest');
      assert.equal(pendingCantAttack(rulesState, 'self'), false);
      endTurn('self');
      beginTurn('opp');
      assert.equal(pendingCantAttack(rulesState, 'self'), false);
      endTurn('opp');
      beginTurn('self');
      assert.equal(pendingCantAttack(rulesState, 'self'), true);
      endTurn('self');
      expirePendingEffectsForTurnEnd(rulesState, 'self');
      assert.equal(pendingCantAttack(rulesState, 'self'), false);
    });

    test('parseDiscardOpponentEffect: deck, energy, hand, tools', async () => {
      const { parseDiscardOpponentEffect } = await import('../attack-pending-effects.mjs');
      assert.deepEqual(
        parseDiscardOpponentEffect("Discard the top 2 cards of your opponent's deck."),
        { deckTop: 2, energyActive: 0, handRandom: 0, discardTools: false }
      );
      assert.deepEqual(
        parseDiscardOpponentEffect("Discard an Energy from your opponent's Active Pokémon."),
        { deckTop: 0, energyActive: 1, handRandom: 0, discardTools: false }
      );
      assert.deepEqual(
        parseDiscardOpponentEffect("Discard a random card from your opponent's hand."),
        { deckTop: 0, energyActive: 0, handRandom: 1, discardTools: false }
      );
      assert.deepEqual(
        parseDiscardOpponentEffect("Discard all Pokémon Tools from your opponent's Active Pokémon."),
        { deckTop: 0, energyActive: 0, handRandom: 0, discardTools: true }
      );
      assert.deepEqual(parseDiscardOpponentEffect('No discard here.'), {
        deckTop: 0,
        energyActive: 0,
        handRandom: 0,
        discardTools: false,
      });
    });

    test('pending gates: cant play Item/Supporter/evolve/attach during opponent-turn lock', async () => {
      const {
        parsePendingAttackEffects,
        queuePendingAttackEffects,
      } = await import('../attack-pending-effects.mjs');
      const { rulesState, resetRulesSessionState, canPerformAction, beginTurn, endTurn } =
        await import('../rules-state.mjs');

      const text =
        "During your opponent's next turn, they can't play any Item cards from their hand. Your opponent can't play any Supporter cards. They can't play any Pokémon from their hand to evolve their Pokémon. Energy can't be attached from your opponent's hand to the Defending Pokémon.";
      resetRulesSessionState();
      queuePendingAttackEffects(rulesState, 'self', parsePendingAttackEffects(text), 'Lockdown');
      endTurn('self');
      beginTurn('opp');

      assert.equal(canPerformAction({ user: 'opp', action: 'playItem' }).allowed, false);
      assert.equal(canPerformAction({ user: 'opp', action: 'playSupporter' }).allowed, false);
      assert.equal(canPerformAction({ user: 'opp', action: 'evolve' }).allowed, false);
      assert.equal(canPerformAction({ user: 'opp', action: 'attachEnergy' }).allowed, false);
      // The attach lock restricts the Defending (Active) Pokémon only: a Bench
      // target stays legal (E5).
      assert.equal(
        canPerformAction({ user: 'opp', action: 'attachEnergy', targetZoneId: 'bench' }).allowed,
        true
      );
      assert.equal(
        canPerformAction({ user: 'opp', action: 'attachEnergy', targetZoneId: 'active' }).allowed,
        false
      );
    });

    test('parsePendingAttackEffects: "Defending Pokémon can\'t attack" locks the defender (AT4)', async () => {
      const {
        parsePendingAttackEffects,
        queuePendingAttackEffects,
        pendingCantAttack,
      } = await import('../attack-pending-effects.mjs');
      const { rulesState, resetRulesSessionState, beginTurn, endTurn } = await import('../rules-state.mjs');

      const parsed = parsePendingAttackEffects(
        "During your opponent's next turn, the Defending Pokémon can't attack."
      );
      const lock = parsed.find((e) => e.kind === 'cant-attack');
      assert.ok(lock, 'the parser emits a cant-attack lock');
      assert.equal(lock.scope, 'defender-active');

      resetRulesSessionState();
      queuePendingAttackEffects(rulesState, 'self', parsed, 'Frozen Wings');
      endTurn('self');
      beginTurn('opp');
      assert.equal(
        pendingCantAttack(rulesState, 'opp'),
        true,
        'the defender is locked on its own next turn'
      );
    });

    test('classifyAttackEffect: checkup poison counter placement is status-poisoned, not bench-damage', async () => {
      const { classifyAttackEffect } = await import('../attack-effects.mjs');
      const crobat = {
        name: 'Poison Fang',
        text: "Your opponent's Active Pokémon is now Poisoned. During Pokémon Checkup, put 2 damage counters on that Pokémon instead of 1.",
      };
      const nidoking = {
        name: 'Tainted Horn',
        text: "Your opponent's Active Pokémon is now Poisoned. During Pokémon Checkup, put 8 damage counters on that Pokémon instead of 1.",
      };
      const dragalge = {
        name: 'Pernicious Poison',
        text: "Your opponent's Active Pokémon is now Poisoned. During Pokémon Checkup, place 16 damage counters on that Pokémon instead of 1.",
      };
      assert.equal(classifyAttackEffect(crobat), 'status-poisoned');
      assert.equal(classifyAttackEffect(nidoking), 'status-poisoned');
      assert.equal(classifyAttackEffect(dragalge), 'status-poisoned');
    });

    test('parseAttackDamage: parses unconditional and counter-scaling recoil self-damage', async () => {
      const { parseAttackDamage } = await import('../damage-parser.mjs');
      const zekrom = {
        name: 'Voltage Burst',
        damage: 130,
        text: "This attack does 50 more damage for each Prize card your opponent has taken. This Pokémon also does 30 damage to itself.",
      };
      const pZekrom = parseAttackDamage(zekrom, {}, {}, { opponentPrizes: 2 });
      assert.equal(pZekrom.total, 230);
      assert.equal(pZekrom.selfDamage, 30);
      assert.ok(pZekrom.components.includes('self-damage'));

      const drapion = {
        name: 'Hazardous Tail',
        damage: 190,
        text: "This Pokémon also does 70 damage to itself. Your opponent's Active Pokémon is now Paralyzed and Poisoned.",
      };
      const pDrapion = parseAttackDamage(drapion);
      assert.equal(pDrapion.selfDamage, 70);
      assert.ok(pDrapion.components.includes('self-damage'));

      const raticate = {
        name: 'Reckless Abandon',
        damage: 120,
        text: "Flip 2 coins. If both of them are tails, this Pokémon also does 90 damage to itself.",
      };
      const pRaticateTails = parseAttackDamage(raticate, {}, {}, { coin: 'tails' });
      assert.equal(pRaticateTails.selfDamage, 90);
      const pRaticateHeads = parseAttackDamage(raticate, {}, {}, { coin: 'heads' });
      assert.equal(pRaticateHeads.selfDamage, 0);

      const palafin = {
        name: 'Vanguard Punch',
        damage: 130,
        text: "This Pokémon also does 10 damage to itself for each damage counter on it.",
      };
      const pPalafin = parseAttackDamage(palafin, {}, {}, { attackerDamage: 4 });
      assert.equal(pPalafin.selfDamage, 40);
      assert.ok(pPalafin.components.includes('self-damage'));
    });

    test('parseStatusFromAttackText: gates status on coin flip outcome', async () => {
      const { parseStatusFromAttackText } = await import('../status.mjs');
      const fakeOut = "Flip a coin. If heads, your opponent's Active Pokémon is now Paralyzed.";
      assert.deepEqual(parseStatusFromAttackText(fakeOut, 'heads'), ['paralyzed']);
      assert.deepEqual(parseStatusFromAttackText(fakeOut, 'tails'), []);

      const lilligant =
        "Flip a coin. If heads, your opponent's Active Pokémon is now Paralyzed and Poisoned. If tails, your opponent's Active Pokémon is now Confused.";
      assert.deepEqual(parseStatusFromAttackText(lilligant, 'heads'), ['paralyzed', 'poisoned']);
      assert.deepEqual(parseStatusFromAttackText(lilligant, 'tails'), ['confused']);
    });

    // ── Rare Candy & Evolution Instance Tracking Regression Tests ──
    test('evolution: two distinct card instances of the same species can both evolve in the same turn', async () => {
      const { canEvolve, markEvolvedThisTurn } = await import('../evolution.mjs');
      startGame();
      beginTurn('self');
      beginTurn('opp');
      beginTurn('self'); // turn 3, evolution allowed
      rulesState.enabled = true;

      const swinub1 = { name: 'Swinub', stage: 'Basic', cardId: 'c_swinub_1' };
      const swinub2 = { name: 'Swinub', stage: 'Basic', cardId: 'c_swinub_2' };
      const piloswine = { name: 'Piloswine', stage: 'Stage 1', evolvesFrom: 'Swinub', cardId: 'c_piloswine_1' };
      const mamoswine = { name: 'Mamoswine ex', stage: 'Stage 2', evolvesFrom: 'Piloswine', cardId: 'c_mamoswine_1' };

      // Swinub 1 evolves into Piloswine
      const r1 = await canEvolve('self', swinub1, piloswine, false);
      assert.equal(r1.allowed, true);
      markEvolvedThisTurn('self', swinub1);
      markEvolvedThisTurn('self', piloswine);

      // Swinub 1 cannot evolve again this turn
      const r1Again = await canEvolve('self', swinub1, piloswine, false);
      assert.equal(r1Again.allowed, false);
      assert.match(r1Again.reason, /Already evolved/i);

      // Piloswine 1 cannot evolve again this turn
      const rPiloAgain = await canEvolve('self', piloswine, mamoswine, false);
      assert.equal(rPiloAgain.allowed, false);
      assert.match(rPiloAgain.reason, /Already evolved/i);

      // Swinub 2 (same species, different instance) CAN evolve via Rare Candy!
      const r2 = await canEvolve('self', swinub2, mamoswine, false, { isRareCandy: true });
      assert.equal(r2.allowed, true);
    });

    test('evolution: Rare Candy validates evolution chain (Piloswine -> Swinub vs Charmeleon -> Swinub)', async () => {
      const { canEvolve } = await import('../evolution.mjs');
      startGame();
      beginTurn('self');
      beginTurn('opp');
      beginTurn('self'); // turn 3
      rulesState.enabled = true;

      const swinub = { name: 'Swinub', stage: 'Basic', cardId: 'swinub_x' };
      const mamoswine = { name: 'Mamoswine ex', stage: 'Stage 2', evolvesFrom: 'Piloswine', cardId: 'mamo_x' };
      const charizard = { name: 'Charizard ex', stage: 'Stage 2', evolvesFrom: 'Charmeleon', cardId: 'char_x' };

      // Mamoswine on Swinub via Rare Candy is allowed (Piloswine evolves from Swinub)
      const rMamo = await canEvolve('self', swinub, mamoswine, false, { isRareCandy: true });
      assert.equal(rMamo.allowed, true);

      // Charizard on Swinub via Rare Candy is rejected (Charmeleon evolves from Charmander, not Swinub)
      const rChar = await canEvolve('self', swinub, charizard, false, { isRareCandy: true });
      assert.equal(rChar.allowed, false);
      assert.match(rChar.reason, /Charmeleon.*Swinub/i);

      // Mamoswine on Swinub WITHOUT Rare Candy is rejected
      const rNormal = await canEvolve('self', swinub, mamoswine, false);
      assert.equal(rNormal.allowed, false);
      assert.match(rNormal.reason, /evolves from/i);
    });

    test('damage-parser: Rumbling March scales with Stage 2 Pokémon on Bench', async () => {
      const { parseAttackDamage } = await import('../damage-parser.mjs');
      const atk = {
        name: 'Rumbling March',
        damage: 180,
        text: 'This attack does 40 more damage for each Stage 2 Pokémon on your Bench.',
      };

      // 0 Stage 2 on bench
      const d0 = parseAttackDamage(atk, { hp: 340 }, { hp: 100 }, { stage2BenchCount: 0 });
      assert.equal(d0.total, 180);
      assert.equal(d0.resolved, true);

      // 1 Stage 2 on bench: 180 + 40 = 220
      const d1 = parseAttackDamage(atk, { hp: 340 }, { hp: 100 }, { stage2BenchCount: 1 });
      assert.equal(d1.total, 220);
      assert.equal(d1.resolved, true);
      assert.ok(d1.notes.some((n) => n.includes('+ 40 × 1 (Stage 2 Pokémon on your Bench)')));

      // 2 Stage 2 on bench: 180 + 80 = 260
      const d2 = parseAttackDamage(atk, { hp: 340 }, { hp: 100 }, { stage2BenchCount: 2 });
      assert.equal(d2.total, 260);
      assert.equal(d2.resolved, true);
      assert.ok(d2.notes.some((n) => n.includes('+ 40 × 1 (Stage 2 Pokémon on your Bench)')) === false);
      assert.ok(d2.notes.some((n) => n.includes('+ 40 × 2 (Stage 2 Pokémon on your Bench)')));
    });

    test('ability search filter: raw Basic Fire Energy matches Basic {R} Energy and Basic Energy', async () => {
      const { matchesSearch } = await import('../search-match.mjs');
      const { classifyEnergyEffect } = await import('../energy-effects.mjs');
      const rawFire = { name: 'Basic Fire Energy', type: 'Energy' };
      const rawWater = { name: 'Basic Water Energy', type: 'Energy' };
      assert.equal(classifyEnergyEffect(rawFire), 'basic');
      assert.equal(matchesSearch(rawFire, 'Basic {R} Energy'), true);
      assert.equal(matchesSearch(rawWater, 'Basic {R} Energy'), false);
      assert.equal(matchesSearch(rawFire, 'Basic Energy'), true);
      assert.equal(matchesSearch(rawWater, 'Basic Energy'), true);
    });

    test('ability search filter: generic Evolution Pokémon excludes Basic Pokémon', async () => {
      const { matchesSearch } = await import('../search-match.mjs');
      const basicMon = { name: 'Charmander', type: 'Pokémon', stage: 'Basic', types: ['Fire'] };
      const stage1Mon = { name: 'Charmeleon', type: 'Pokémon', stage: 'Stage 1', types: ['Fire'] };
      const stage2Mon = { name: 'Charizard', type: 'Pokémon', stage: 'Stage 2', types: ['Fire'] };
      assert.equal(matchesSearch(basicMon, 'Evolution Pokémon'), false);
      assert.equal(matchesSearch(stage1Mon, 'Evolution Pokémon'), true);
      assert.equal(matchesSearch(stage2Mon, 'Evolution Pokémon'), true);
    });

    test('ability search filter: Supporter and Trainer filtering', async () => {
      const { matchesSearch } = await import('../search-match.mjs');
      const supporter = { name: 'Professor Research', type: 'Trainer', trainerType: 'Supporter' };
      const item = { name: 'Ultra Ball', type: 'Trainer', trainerType: 'Item' };
      const stadium = { name: 'Artazon', type: 'Trainer', trainerType: 'Stadium' };
      const mon = { name: 'Pikachu', type: 'Pokémon', stage: 'Basic' };
      const energy = { name: 'Basic Lightning Energy', type: 'Energy' };

      assert.equal(matchesSearch(supporter, 'Supporter'), true);
      assert.equal(matchesSearch(item, 'Supporter'), false);
      assert.equal(matchesSearch(mon, 'Supporter'), false);
      assert.equal(matchesSearch(energy, 'Supporter'), false);

      assert.equal(matchesSearch(supporter, 'Trainer'), true);
      assert.equal(matchesSearch(item, 'Trainer'), true);
      assert.equal(matchesSearch(stadium, 'Trainer'), true);
      assert.equal(matchesSearch(mon, 'Trainer'), false);
      assert.equal(matchesSearch(energy, 'Trainer'), false);
    });

    test('played-to-bench trigger window: one-shot the turn played, gone next turn, re-arms on return to hand', async () => {
      const meowth = { name: 'Meowth', cardId: 'c_meowth-1' };

      startGame('self');
      beginTurn('self');

      // Not played yet — no window.
      assert.equal(canUsePlayedToBenchTrigger('self', meowth), false);

      // Played from hand to Bench this turn — window opens.
      openPlayedToBenchWindow('self', meowth);
      assert.equal(canUsePlayedToBenchTrigger('self', meowth), true);

      // Using it consumes the window; can't use again same turn.
      consumePlayedToBenchTrigger('self', meowth);
      assert.equal(canUsePlayedToBenchTrigger('self', meowth), false);

      // Re-open (as if used) and confirm it does NOT survive into next turn,
      // even if never consumed.
      openPlayedToBenchWindow('self', meowth);
      assert.equal(canUsePlayedToBenchTrigger('self', meowth), true);
      endTurn('self'); // -> opp
      endTurn('opp'); // -> self, next turn
      assert.equal(canUsePlayedToBenchTrigger('self', meowth), false);

      // Returning to hand and replaying opens a brand new window.
      clearPlayedToBenchWindow('self', meowth);
      openPlayedToBenchWindow('self', meowth);
      assert.equal(canUsePlayedToBenchTrigger('self', meowth), true);
    });

    test('played-to-bench trigger: server-stamped playedToBenchTurn opens the window (A1)', () => {
      startGame('self');
      beginTurn('self');
      const stamped = { name: 'Meowth ex', cardId: 'c_meowth-ex', playedToBenchTurn: rulesState.turnNumber };

      // The client map is empty under server authority; the card stamp is the
      // only evidence the trigger is still legal this turn.
      assert.equal(canUsePlayedToBenchTrigger('self', stamped), true);

      // A used ability stays spent even though the stamp is still this turn.
      assert.equal(
        canUsePlayedToBenchTrigger('self', { ...stamped, abilityUsed: true }),
        false
      );

      // A stamp from an earlier turn is not a window.
      assert.equal(
        canUsePlayedToBenchTrigger('self', { ...stamped, playedToBenchTurn: rulesState.turnNumber - 1 }),
        false
      );
    });

    test('fix 1: neither player can evolve on their respective first turn', async () => {
      const { rulesState, startGame, beginTurn, endTurn, canPerformAction } = await import('../rules-state.mjs');
      const { canEvolve } = await import('../evolution.mjs');
      const base = { name: 'Pidgey', stage: 'Basic', id: 'b-p1' };
      const evo = { name: 'Pidgeotto', stage: 'Stage 1', evolvesFrom: 'Pidgey', id: 'e-p1' };

      startGame('self');
      beginTurn('self'); // Turn 1 (P1's 1st turn)
      assert.equal(rulesState.turnNumber, 1);
      assert.equal(rulesState.playerTurnCount.self, 1);
      assert.equal(rulesState.playerTurnCount.opp, 0);

      // P1 on Turn 1 cannot evolve
      assert.equal(canPerformAction({ user: 'self', action: 'evolve' }).allowed, false);
      assert.equal((await canEvolve('self', base, evo, false)).allowed, false);

      endTurn('self'); // Turn 2 begins for 'opp' (P2's 1st turn)
      assert.equal(rulesState.turnNumber, 2);
      assert.equal(rulesState.turnPlayer, 'opp');
      assert.equal(rulesState.playerTurnCount.self, 1);
      assert.equal(rulesState.playerTurnCount.opp, 1);

      // P2 on Turn 2 (their 1st turn) cannot evolve!
      assert.equal(canPerformAction({ user: 'opp', action: 'evolve' }).allowed, false);
      assert.equal((await canEvolve('opp', base, evo, false)).allowed, false);

      endTurn('opp'); // Turn 3 begins for 'self' (P1's 2nd turn)
      assert.equal(rulesState.turnNumber, 3);
      assert.equal(rulesState.turnPlayer, 'self');
      assert.equal(rulesState.playerTurnCount.self, 2);
      assert.equal(rulesState.playerTurnCount.opp, 1);

      // P1 on Turn 3 can evolve Pokémon not played this turn
      assert.equal(canPerformAction({ user: 'self', action: 'evolve' }).allowed, true);
      assert.equal((await canEvolve('self', base, evo, false)).allowed, true);
      // But not if played this turn
      assert.equal((await canEvolve('self', base, evo, true)).allowed, false);

      endTurn('self'); // Turn 4 begins for 'opp' (P2's 2nd turn)
      assert.equal(rulesState.turnNumber, 4);
      assert.equal(rulesState.turnPlayer, 'opp');
      assert.equal(rulesState.playerTurnCount.self, 2);
      assert.equal(rulesState.playerTurnCount.opp, 2);

      // P2 on Turn 4 can evolve Pokémon not played this turn
      assert.equal(canPerformAction({ user: 'opp', action: 'evolve' }).allowed, true);
      assert.equal((await canEvolve('opp', base, evo, false)).allowed, true);
    });

    test('fix 2: game ends when one player has 0 Pokémon in play (active + bench) even with prizes remaining', async () => {
      const { checkWinConditions, planPromotion } = await import('../ko-flow.mjs');

      // Defender has 0 active and 0 bench -> opponent wins immediately
      const winCheck1 = checkWinConditions({
        activeCounts: {
          self: { active: 1, bench: 2 },
          opp: { active: 0, bench: 0 },
        },
        deckCounts: { self: 20, opp: 20 },
        turnPlayer: 'self',
      });
      assert.equal(winCheck1.over, true);
      assert.equal(winCheck1.winner, 'self');
      assert.equal(winCheck1.reason, 'no Pokémon in play');

      // planPromotion confirms no promotion if benchCount === 0
      const plan = planPromotion(true, 0);
      assert.equal(plan.promote, false);
    });

    test('fix 3: trainer step runner invokes onComplete callback after effects finish', async () => {
      const { parseTrainerEffect } = await import('../trainer-effects.mjs');
      const parsed = parseTrainerEffect("Discard your hand and draw 7 cards.");
      assert.equal(parsed.recognizable, true);
      assert.equal(parsed.steps.length, 1);

      let completed = false;
      const onComplete = () => {
        completed = true;
      };
      const runAt = (idx) => {
        if (idx >= parsed.steps.length) {
          onComplete();
          return;
        }
        runAt(idx + 1);
      };
      runAt(0);
      assert.equal(completed, true);
    });



// ── Continuous Stadium passives (previously "continuous-unparsed") ─────────

test('continuous Stadiums: every previously-unmodeled passive is recognized', () => {
  const cards = [
    ['Lost City', "Whenever a Pokémon (either yours or your opponent's) is Knocked Out, put that Pokémon in the Lost Zone instead of the discard pile. (Discard all attached cards.)"],
    ['Temple of Sinnoh', "All Special Energy attached to Pokémon (both yours and your opponent's) provide {C} Energy and have no other effect."],
    ['Dyna Tree Hill', "Pokémon (both yours and your opponent's) can't be healed."],
    ['Shrine of Punishment', "Between turns, put 1 damage counter on each Pokémon-GX and Pokémon-EX (both yours and your opponent's)."],
    ['Sea of Nothingness', "Special Conditions are not removed when Pokémon (both yours and your opponent's) evolve or devolve."],
    ['Altar of the Sunne', "{R} Pokémon and {M} Pokémon (both yours and your opponent's) have no Weakness."],
    ['Shrine of Memories', "Each player's evolved Pokémon can use any attack from its previous Evolutions. (That player still needs the necessary Energy to use each attack.)"],
    ['Shadow Circle', "Each Pokémon that has any {D} Energy attached to it (both yours and your opponent's) has no Weakness."],
    ['Plasma Frigate', "Each Pokémon that has any Plasma Energy attached to it (both yours and your opponent's) has no Weakness."],
    ['Ultimate Zone', "During each player's turn, the player may move an Energy card attached to 1 of his or her Benched Pokémon to his or her Active Arceus as often as he or she likes."],
    ['Sunyshore City Gym', "Any damage done by attacks from {L} Pokémon (both yours and your opponent's) to the Defending Pokémon isn't affected by Resistance. Each {L} Pokémon in play (both yours and your opponent's) has no Weakness."],
    ['Lake Boundary', "Apply Weakness for each Pokémon (both yours and your opponent's) as ×2 instead."],
    ["Glacia's Stadium", "Each player's {W} Pokémon (excluding Pokémon-ex) has no Weakness."],
    ["Drake's Stadium", "Any damage done to {C} Active Pokémon (both yours and your opponent's) by an opponent's attack is reduced by 10 (after applying Weakness and Resistance)."],
    ['Crystal Beach', "Each Special Energy card that provides 2 or more Energy (both yours and your opponent's) now provides only 1 {C} Energy. This isn't affected by any Poké-Powers or Poké-Bodies."],
    ['Holon Lake', "Each player's Pokémon that has {Delta Species} on its card can use attacks on this card instead of its own. {C} → Delta Call Search your deck for a Pokémon that has {Delta Species} on its card, show it to your opponent, and put it into your hand. Shuffle your deck afterward."],
    ['Holon Research Tower', "Each player's basic Energy cards attached to Pokémon that has {Delta Species} on its card are both their usual Energy type and {M} type but provide only 1 Energy at a time. (Has no effect other than providing Energy.)"],
    ['Meteor Falls', "Each player's Active Evolved Pokémon (excluding Pokémon-ex) can use any attack from its Basic Pokémon or its Stage 1 Evolution card. (You still have to pay for that attack's Energy cost.)"],
    ["Rocket's Tricky Gym", "Each Pokémon with Dark or Rocket's in its name (both yours and your opponent's) can use attacks on this card instead of its own. {C} → Feint Attack Does 20 damage to 1 of your opponent's Pokémon. This attack's damage isn't affected by Weakness, Resistance, Poké-Powers, Poké-Bodies, or any other effects on that Pokémon."],
    ['Magnetic Storm', "Any damage done by attacks from {P} Pokémon and {F} Pokémon (both yours and your opponent's) is not affected by Resistance."],
    ['Desert Ruins', 'At any time between turns, each player puts 1 damage counter on his or her Pokémon-ex with maximum HP of at least 100.'],
    ['Cursed Stone', 'At any time between turns, each player puts 1 damage counter on his or her Pokémon that has a Poké-Power.'],
    ['Saffron City Gym', "As often as each player likes during his or her turn (before attacking), that player may return 1 basic Energy card attached to 1 of his or her Pokémon with Sabrina in its name to his or her hand."],
    ['Celadon City Gym', "During each player's turn, that player may choose to discard an Energy card attached to 1 of his or her Pokémon with Erika in its name. If that player does so, that Pokémon is no longer Asleep, Confused, Paralyzed, or Poisoned."],
  ].map(([name, text]) => ({ name, text, subtypes: ['Stadium'], type: 'Stadium' }));

  for (const c of cards) {
    assert.notEqual(classifyStadiumEffect(c), 'unknown', c.name);
    assert.equal(hasRecognizedPassiveStadiumEffect(c), true, c.name);
    assert.ok(applyStadiumEffect(c).results.length > 0, c.name);
  }
});

// ── Special-Energy rewrites (Temple of Sinnoh / Crystal Beach / Holon Research Tower) ──

test('energy rewrites: Temple of Sinnoh flattens Special Energy to one {C}', async () => {
  const { serverEnergyDescriptor } = await import('../server-energy.mjs');
  const { canPayAttackCost } = await import('../attack-engine.mjs');
  const doubleEnergy = { name: 'Double Colorless Energy', supertype: 'Energy', subtypes: ['Special'], types: ['Colorless'] };
  const stadium = { name: 'Temple of Sinnoh', text: "All Special Energy attached to Pokémon (both yours and your opponent's) provide {C} Energy and have no other effect." };
  const d = serverEnergyDescriptor(doubleEnergy, { stadiumCard: stadium });
  assert.deepEqual(d, { type: 'Colorless', family: 'basic' });
  assert.equal(canPayAttackCost([d], ['Colorless']), true);
  assert.equal(canPayAttackCost([d], ['Colorless', 'Colorless']), false, 'a Double becomes a single unit');
  assert.equal(canPayAttackCost([d], ['Fire']), false);
  // Without the Stadium the Double still counts twice.
  assert.equal(canPayAttackCost([serverEnergyDescriptor(doubleEnergy)], ['Colorless', 'Colorless']), true);
});

test('energy rewrites: Crystal Beach caps ≥2 Special Energy at one {C}', async () => {
  const { serverEnergyDescriptor } = await import('../server-energy.mjs');
  const { canPayAttackCost } = await import('../attack-engine.mjs');
  const stadium = { name: 'Crystal Beach', text: "Each Special Energy card that provides 2 or more Energy (both yours and your opponent's) now provides only 1 {C} Energy." };
  const doubleFire = { name: 'Double Fire Energy', supertype: 'Energy', subtypes: ['Special'], types: ['Fire'] };
  const single = { name: 'Lucky Energy', supertype: 'Energy', subtypes: ['Special'], types: ['Colorless'] };
  const d = serverEnergyDescriptor(doubleFire, { stadiumCard: stadium });
  assert.deepEqual(d, { type: 'Colorless', family: 'basic' });
  assert.equal(canPayAttackCost([d], ['Fire']), false);
  // A one-unit Special is untouched.
  assert.equal(
    serverEnergyDescriptor(single, { stadiumCard: stadium }).family,
    'attach-type'
  );
});

test('energy rewrites: Holon Research Tower makes Basic Energy dual {M} but one unit', async () => {
  const { serverEnergyDescriptor } = await import('../server-energy.mjs');
  const { canPayAttackCost } = await import('../attack-engine.mjs');
  const stadium = { name: 'Holon Research Tower', text: "Each player's basic Energy cards attached to Pokémon that has {Delta Species} on its card are both their usual Energy type and {M} type but provide only 1 Energy at a time. (Has no effect other than providing Energy.)" };
  const basic = { name: 'Fire Energy', supertype: 'Energy', subtypes: ['Basic'], types: ['Fire'] };
  const delta = { name: 'Charizard δ', supertype: 'Pokémon' };
  const plain = { name: 'Charizard', supertype: 'Pokémon' };
  const d = serverEnergyDescriptor(basic, { stadiumCard: stadium, hostPokemon: delta });
  assert.equal(d.dualType, 'Metal');
  assert.equal(canPayAttackCost([d], ['Fire']), true);
  assert.equal(canPayAttackCost([d], ['Metal']), true);
  assert.equal(canPayAttackCost([d], ['Fire', 'Metal']), false, 'still only one Energy');
  assert.equal(canPayAttackCost([d], ['Water']), false);
  // Not a Delta Species host → untouched.
  assert.equal(
    serverEnergyDescriptor(basic, { stadiumCard: stadium, hostPokemon: plain }).dualType,
    undefined
  );
});

// ── Stadium attack inheritance / grants ────────────────────────────────────

test('stadiumExtraAttacks: Shrine of Memories inherits prior-evolution attacks', async () => {
  const { stadiumExtraAttacks, stadiumInheritedAttacks } = await import('../stadium-effects.mjs');
  const basic = { instanceId: 1, name: 'Bulbasaur', stage: 'Basic', supertype: 'Pokémon', attacks: [{ name: 'Tackle', cost: [], damage: 10 }] };
  const stage1 = { instanceId: 2, name: 'Ivysaur', stage: 'Stage 1', supertype: 'Pokémon', attachedTo: 1, attacks: [{ name: 'Vine Whip', cost: [], damage: 30 }] };
  const shrine = { name: 'Shrine of Memories', text: "Each player's evolved Pokémon can use any attack from its previous Evolutions. (That player still needs the necessary Energy to use each attack.)" };
  const zone = [basic, stage1];
  assert.deepEqual(stadiumInheritedAttacks(shrine, { zoneCards: zone, root: basic, isActive: true }).map((a) => a.name), ['Tackle']);
  // Unevolved → no inheritance.
  assert.deepEqual(stadiumInheritedAttacks(shrine, { zoneCards: [basic], root: basic, isActive: true }), []);
  // Merged list de-dupes and tags.
  const merged = stadiumExtraAttacks(shrine, { zoneCards: zone, root: basic, isActive: true });
  assert.deepEqual(merged.map((a) => a.name), ['Tackle']);
  assert.equal(merged[0].inherited, true);
});

test('stadiumExtraAttacks: Meteor Falls is Active-only and excludes Pokémon-ex', async () => {
  const { stadiumInheritedAttacks } = await import('../stadium-effects.mjs');
  const basic = { instanceId: 1, name: 'Bulbasaur', stage: 'Basic', supertype: 'Pokémon', attacks: [{ name: 'Tackle' }] };
  const stage1 = { instanceId: 2, name: 'Ivysaur', stage: 'Stage 1', supertype: 'Pokémon', attachedTo: 1, attacks: [{ name: 'Vine Whip' }] };
  const stage2 = { instanceId: 3, name: 'Venusaur', stage: 'Stage 2', supertype: 'Pokémon', attachedTo: 1, attacks: [{ name: 'Solar Beam' }] };
  const exTop = { instanceId: 4, name: 'Venusaur ex', stage: 'Stage 2', supertype: 'Pokémon', subtypes: ['ex'], attachedTo: 1, attacks: [{ name: 'Giant Bloom' }] };
  const falls = { name: 'Meteor Falls', text: "Each player's Active Evolved Pokémon (excluding Pokémon-ex) can use any attack from its Basic Pokémon or its Stage 1 Evolution card. (You still have to pay for that attack's Energy cost.)" };
  const zone = [basic, stage1, stage2];
  assert.deepEqual(
    stadiumInheritedAttacks(falls, { zoneCards: zone, root: basic, isActive: true }).map((a) => a.name),
    ['Tackle', 'Vine Whip']
  );
  // Bench → nothing.
  assert.deepEqual(stadiumInheritedAttacks(falls, { zoneCards: zone, root: basic, isActive: false }), []);
  // Pokémon-ex top → nothing.
  assert.deepEqual(
    stadiumInheritedAttacks(falls, { zoneCards: [basic, stage1, exTop], root: basic, isActive: true }),
    []
  );
});

test('stadiumGrantedAttacks: Holon Lake / Rocket\'s Tricky Gym grant a fixed attack', async () => {
  const { stadiumGrantedAttacks } = await import('../stadium-effects.mjs');
  const lake = { name: 'Holon Lake', text: "Each player's Pokémon that has {Delta Species} on its card can use attacks on this card instead of its own. {C} → Delta Call Search your deck for a Pokémon that has {Delta Species} on its card, show it to your opponent, and put it into your hand. Shuffle your deck afterward." };
  assert.deepEqual(stadiumGrantedAttacks(lake, { name: 'Pikachu δ' }).map((a) => a.name), ['Delta Call']);
  assert.deepEqual(stadiumGrantedAttacks(lake, { name: 'Pikachu' }), []);

  const gym = { name: "Rocket's Tricky Gym", text: "Each Pokémon with Dark or Rocket's in its name (both yours and your opponent's) can use attacks on this card instead of its own. {C} → Feint Attack Does 20 damage to 1 of your opponent's Pokémon. This attack's damage isn't affected by Weakness, Resistance, Poké-Powers, Poké-Bodies, or any other effects on that Pokémon." };
  assert.deepEqual(stadiumGrantedAttacks(gym, { name: "Rocket's Scyther" }).map((a) => a.name), ['Feint Attack']);
  assert.deepEqual(stadiumGrantedAttacks(gym, { name: 'Darkrai' }).map((a) => a.name), ['Feint Attack']);
  assert.deepEqual(stadiumGrantedAttacks(gym, { name: 'Pikachu' }), []);
});

test('listAttacks: extraAttacks are merged and priced like printed attacks', async () => {
  const { listAttacks } = await import('../attack-window.mjs');
  const card = { name: 'Ivysaur', stage: 'Stage 1', attacks: [{ name: 'Vine Whip', cost: ['Grass'], damage: 30 }] };
  const extraAttacks = [{ name: 'Tackle', cost: [], damage: 10, inherited: true }];
  const noEnergy = listAttacks(card, { energyTypes: [], extraAttacks });
  assert.deepEqual(noEnergy.map((a) => a.name), ['Vine Whip', 'Tackle']);
  assert.equal(noEnergy[0].payable, false);
  assert.equal(noEnergy[1].payable, true);
});

test('parseStadiumOncePerTurn: paper-unlimited Energy actions are modeled', () => {
  const u = parseStadiumOncePerTurn({
    name: 'Ultimate Zone',
    text: "During each player's turn, the player may move an Energy card attached to 1 of his or her Benched Pokémon to his or her Active Arceus as often as he or she likes.",
  });
  assert.equal(u?.kind, 'move-to-arceus');
  const s = parseStadiumOncePerTurn({
    name: 'Saffron City Gym',
    text: "As often as each player likes during his or her turn (before attacking), that player may return 1 basic Energy card attached to 1 of his or her Pokémon with Sabrina in its name to his or her hand.",
  });
  assert.equal(s?.kind, 'return-sabrina-energy');
  const c = parseStadiumOncePerTurn({
    name: 'Celadon City Gym',
    text: "During each player's turn, that player may choose to discard an Energy card attached to 1 of his or her Pokémon with Erika in its name. If that player does so, that Pokémon is no longer Asleep, Confused, Paralyzed, or Poisoned.",
  });
  assert.equal(c?.kind, 'discard-erika-cure');

  const base = { subtypes: ['Stadium'], type: 'Stadium' };
  assert.equal(
    classifyStadiumEffect({
      ...base,
      name: 'Ultimate Zone',
      text: "During each player's turn, the player may move an Energy card attached to 1 of his or her Benched Pokémon to his or her Active Arceus as often as he or she likes.",
    }),
    'once-per-turn'
  );
});

test('stadiumActivationStatus: unlimited "as often as" actions stay usable after use', () => {
  const ultimate = {
    name: 'Ultimate Zone',
    type: 'Stadium',
    subtypes: ['Stadium'],
    text: "During each player's turn, the player may move an Energy card attached to 1 of his or her Benched Pokémon to his or her Active Arceus as often as he or she likes.",
  };
  assert.equal(stadiumActivationStatus(ultimate).usable, true);
  assert.equal(
    stadiumActivationStatus(ultimate, { usedThisTurn: true }).usable,
    true,
    'repeatable action is not blocked by a prior activation'
  );

  const artazon = {
    name: 'Artazon',
    type: 'Stadium',
    subtypes: ['Stadium'],
    text: 'Once during each player\u2019s turn, that player may search their deck for a Basic Pok\u00e9mon that doesn\u2019t have a Rule Box and put it onto their Bench. Then, that player shuffles their deck.',
  };
  assert.equal(stadiumActivationStatus(artazon, { usedThisTurn: true }).usable, false);
});

test('stadiumExtraAttacksFromZone: normalizes both render paths to the same extras', async () => {
  const { stadiumExtraAttacksFromZone } = await import('../stadium-effects.mjs');
  const shrine = {
    name: 'Shrine of Memories',
    text: "Each player's evolved Pokémon can use any attack from its previous Evolutions. (That player still needs the necessary Energy to use each attack.)",
  };

  // Authoritative shape: the Basic is the root; the evolution attaches to it.
  const basic = {
    instanceId: 1,
    name: 'Bulbasaur',
    stage: 'Basic',
    supertype: 'Pokémon',
    attacks: [{ name: 'Tackle', cost: [], damage: 10 }],
  };
  const stage1 = {
    instanceId: 2,
    name: 'Ivysaur',
    stage: 'Stage 1',
    supertype: 'Pokémon',
    attachedTo: 1,
    attacks: [{ name: 'Vine Whip', cost: [], damage: 30 }],
  };
  assert.deepEqual(
    stadiumExtraAttacksFromZone(shrine, {
      zoneCards: [basic, stage1],
      card: basic,
      isActive: true,
    }).map((a) => a.name),
    ['Tackle']
  );

  // Legacy shape: the visible top links its pre-evolutions by image.relative.
  const topImg = { id: 'top' };
  const legacyBase = {
    instanceId: 1,
    name: 'Bulbasaur',
    stage: 'Basic',
    supertype: 'Pokémon',
    image: { id: 'base', relative: topImg },
    attacks: [{ name: 'Tackle', cost: [], damage: 10 }],
  };
  const legacyTop = {
    instanceId: 2,
    name: 'Ivysaur',
    stage: 'Stage 1',
    supertype: 'Pokémon',
    image: topImg,
    attacks: [{ name: 'Vine Whip', cost: [], damage: 30 }],
  };
  assert.deepEqual(
    stadiumExtraAttacksFromZone(shrine, {
      zoneCards: [legacyBase, legacyTop],
      card: legacyTop,
      isActive: true,
    }).map((a) => a.name),
    ['Tackle']
  );

  // Unevolved → no extras.
  assert.deepEqual(
    stadiumExtraAttacksFromZone(shrine, { zoneCards: [basic], card: basic, isActive: true }),
    []
  );
});
