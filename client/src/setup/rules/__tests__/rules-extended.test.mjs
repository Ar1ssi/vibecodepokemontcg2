import test from 'node:test';
    import assert from 'node:assert/strict';
    
    const { rulesState, startGame, beginTurn, endTurn, markSupporterPlayed, supporterPlayGate, markStadiumPlayed, getStadium, abilityKey, markAbilityUsed, abilityUsed, markStadiumUsed, stadiumUsed, shouldAutoDrawAtTurnStart, markTurnDrawn } = await import('../rules-state.mjs');
    const { prizesForKO, awardPrizes, checkWinConditions, handleKO, resetPrizes, isExCard, isGxCard, koOutcome, planPromotion, promotionGuidance } = await import('../ko-flow.mjs');
    const { canRetreat, markRetreated, energiesToDiscardForRetreat } = await import('../retreat.mjs');
    const { applyStatus, canAct, canActThroughStatuses, resolveWake, resolveConfusedAttack, resolveTurnBoundary, parseStatusFromAttackText, resetStatuses, getStatus, statusAllowsRetreat, clearStatuses } = await import('../status.mjs');
    const { classifyEnergyEffect, describeEnergyEffect, applyEnergyEffect, isEnergyCard, effectiveEnergyType, isLockEnergy, pokemonHasLockedEnergy, isRedirectEnergy, pokemonHasRedirectEnergy, isProtectEnergy, pokemonHasProtectEnergy, applyProtectCap } = await import('../energy-effects.mjs');
    const { classifyAbility, searchTargetType, describeAbilityFamily, applyAbilityEffect, isAbilityCard, ABILITY_FAMILIES } = await import('../ability-effects.mjs');
    const { classifyStadiumEffect, describeStadiumEffect, applyStadiumEffect, isStadiumCard, STADIUM_EFFECT_FAMILIES, parseStadiumSetupDraw, parseStadiumOncePerTurn, parseStadiumDamagePrevention, isStadiumRetreatPrevention, isStadiumHandProtect, parseStadiumCostModifier, parseStadiumHpModifier, getStadiumHpBonus, effectiveHp, parseStadiumEvolutionSpeed, getStadiumEvolutionSpeed } = await import('../stadium-effects.mjs');
    const { classifyAttackEffect, describeAttackEffect, applyAttackEffect, ATTACK_FAMILIES } = await import('../attack-effects.mjs');
    const { parseAttackDamage, describeParsedDamage, healTarget, planHeal, planBenchTarget, drawCount, attachEnergyCount, switchClause, oncePerTurnClause, allBenchDamage, discardCost, shuffleDrawClause, discardEnergyScaling, DAMAGE_COMPONENTS } = await import('../damage-parser.mjs');
    const { computeAttackDamage } = await import('../attack-engine.mjs');
    const { passiveCostDiscount, applyCostDiscount, parseWhenPlayedEffect, parseEndOfTurnEffect, parseDamagePrevention, applyDamagePrevention, isHandProtected, parseOpponentDiscard, parseEnergyRedirect } = await import('../ability-executors.mjs');
    const { listAttacks, listAbilities, listUsableActions } = await import('../attack-window.mjs');
    
    // ── KO / prizes ──
    test('prizesForKO: standard = 1, ex = 3 (2 extra), VMAX = 3', () => {
      assert.equal(prizesForKO({ rarity: 'Common' }), 1);
      assert.equal(prizesForKO({ rarity: 'Double rare', subtypes: ['ex'] }), 3);
      assert.equal(prizesForKO({ name: 'Cetitan ex' }), 3);
      assert.equal(prizesForKO({ subtypes: ['VMAX'] }), 3);
      assert.equal(prizesForKO({ subtypes: ['VSTAR'] }), 2);
      assert.equal(prizesForKO({ rarity: 'Mega Hyper Rare' }), 2);
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

    test('koOutcome: GX = match loss, otherwise prize counts', () => {
      assert.deepEqual(koOutcome({ subtypes: ['GX'] }), { type: 'matchLoss' });
      assert.deepEqual(koOutcome({ name: 'Cetitan ex' }), { type: 'prizes', count: 3 });
      assert.deepEqual(koOutcome({ rarity: 'Common' }), { type: 'prizes', count: 1 });
    });

    test('handleKO: KOing a Pokémon GX wins the match immediately (no prizes taken)', () => {
      resetPrizes();
      awardPrizes('self', 2);
      const r = handleKO({ attackerPlayer: 'self', defender: { subtypes: ['GX'] } });
      assert.equal(r.won, true);
      assert.equal(r.prizeCount, 0);
      assert.equal(r.prizesTaken, 2); // prior prizes unaffected
      assert.match(r.reason, /GX/);
    });

    test('handleKO: ex awards 3 prizes', () => {
      resetPrizes();
      const r = handleKO({ attackerPlayer: 'self', defender: { name: 'Cetitan ex' } });
      assert.equal(r.prizeCount, 3);
      assert.equal(r.prizesTaken, 3);
      assert.equal(r.prizesRemaining, 3);
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
      assert.equal(r.prizeCount, 3);
      assert.equal(r.prizesTaken, 3);
      assert.equal(r.prizesRemaining, 3);
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

    test('statusAllowsRetreat: only paralyzed blocks retreat; confused does not', () => {
      resetStatuses();
      applyStatus('self', 'c1', 'paralyzed');
      assert.equal(statusAllowsRetreat('self', 'c1').can, false);
      resetStatuses();
      applyStatus('self', 'c2', 'confused');
      assert.equal(statusAllowsRetreat('self', 'c2').can, true);
      resetStatuses();
      applyStatus('self', 'c3', 'asleep');
      assert.equal(statusAllowsRetreat('self', 'c3').can, true);
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

    test('mutual exclusion: damage family — newest wins', () => {
      resetStatuses();
      applyStatus('self', 'c1', 'poisoned');
      applyStatus('self', 'c1', 'burned');
      const s = getStatus('self', 'c1');
      assert.equal(s.burned, true);
      assert.equal(s.poisoned, undefined);
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
      const displaced = markStadiumPlayed('opp', b);
      assert.equal(displaced.card, a);
      assert.equal(displaced.user, 'self');
      assert.equal(getStadium().card, b);
      assert.equal(getStadium().user, 'opp');
    });

    test('startGame: clears the on-field Stadium record', () => {
      markStadiumPlayed('self', { name: 'Mystic Ruin', type: 'Stadium' });
      assert.notEqual(getStadium(), null);
      startGame('opp');
      assert.equal(getStadium(), null);
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
        'unknown', // prevention effect: no trigger keyword → unknown (guidance says read text)
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

    test('parseStadiumSetupDraw: parses draw N or falls back to 1', () => {
      assert.equal(parseStadiumSetupDraw({ name: 'Victory Road', text: 'When you play this card, draw 2 cards.' }), 2);
      assert.equal(parseStadiumSetupDraw({ name: 'X', text: 'When you play this card, do something.' }), 1);
      assert.equal(parseStadiumSetupDraw({ name: 'X', text: 'Once per turn, draw 1 card.' }), null);
      assert.equal(parseStadiumSetupDraw(null), null);
    });

    test('parseStadiumOncePerTurn: buckets draw/search/energy/heal', () => {
      assert.deepEqual(parseStadiumOncePerTurn({ text: 'Once per turn, draw 2 cards.' }), { kind: 'draw', n: 2 });
      assert.deepEqual(parseStadiumOncePerTurn({ text: 'Once per turn, search your deck.' }), { kind: 'search', n: 1 });
      assert.equal(parseStadiumOncePerTurn({ text: 'Once per turn, attach an Energy.' }).kind, 'energy');
      assert.equal(parseStadiumOncePerTurn({ text: 'Once per turn, heal 20 damage.' }).kind, 'heal');
      assert.equal(parseStadiumOncePerTurn({ text: 'Prevent all damage.' }), null);
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

    test('classifyAbility: energy-redirect family', () => {
      const ironTinker = { ability: { text: 'Once During Your Turn: You may move 1 Energy from this Pokémon to 1 of your other Pokémon.' } };
      assert.equal(classifyAbility(ironTinker), 'energy-redirect');

      // Attach-energy card still classifies as 'attach'
      const attach = { ability: { text: 'Once During Your Turn: You may attach an Energy card to this Pokémon.' } };
      assert.equal(classifyAbility(attach), 'attach');
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

    // ── §D draw family (drawCount) ──
    test('drawCount: parses "draw/draws N card(s)", 0 otherwise', () => {
      assert.equal(drawCount('Draw 2 cards.'), 2);
      assert.equal(drawCount('You may draw 1 card.'), 1);
      assert.equal(drawCount('Draw 5 cards, then attack.'), 5);
      assert.equal(drawCount('draws 3 cards'), 3);
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

    // ── Stadium evolution speed (continuous) ─────────────────────────────

    test('parseStadiumEvolutionSpeed: turn-gate relax / cost reduce / none', () => {
      const relax = { name: 'Fast Evolve', subtypes: ['Stadium'], text: 'Your Pokémon in play may evolve as if it had been in play for 1 more turn.' };
      assert.deepEqual(parseStadiumEvolutionSpeed(relax), { relaxTurnGate: true, costReduce: 0 });

      // plural "they" phrasing (real-card style)
      const relaxThey = { name: 'Fast Evolve 2', subtypes: ['Stadium'], text: 'Your Benched Pokémon may evolve as if they had been in play for one more turn.' };
      assert.equal(parseStadiumEvolutionSpeed(relaxThey).relaxTurnGate, true);

      const cost = { name: 'Cheap Evolve', subtypes: ['Stadium'], text: 'Evolving your Pokémon costs 1 less Energy.' };
      assert.equal(parseStadiumEvolutionSpeed(cost).costReduce, 1);
      assert.equal(parseStadiumEvolutionSpeed(cost).relaxTurnGate, false);

      const none = { name: 'Heal Center', subtypes: ['Stadium'], text: 'Heal 30 damage from your Active Pokémon.' };
      assert.deepEqual(parseStadiumEvolutionSpeed(none), { relaxTurnGate: false, costReduce: 0 });

      assert.deepEqual(parseStadiumEvolutionSpeed(null), { relaxTurnGate: false, costReduce: 0 });
      assert.deepEqual(parseStadiumEvolutionSpeed({ name: 'X' }), { relaxTurnGate: false, costReduce: 0 });
    });

    test('getStadiumEvolutionSpeed: targeting follows the stadium pronouns', () => {
      const prevEnabled = rulesState.enabled;
      const prevStadium = rulesState.stadium;
      rulesState.enabled = true;
      try {
        // "your Pokémon" → owner only
        markStadiumPlayed('self', { name: 'A', subtypes: ['Stadium'], text: 'Your Pokémon in play may evolve as if it had been in play for 1 more turn.' });
        assert.deepEqual(getStadiumEvolutionSpeed('self'), { relaxTurnGate: true, costReduce: 0 });
        assert.deepEqual(getStadiumEvolutionSpeed('opp'), { relaxTurnGate: false, costReduce: 0 });

        // "your opponent" → non-owner only
        markStadiumPlayed('self', { name: 'B', subtypes: ['Stadium'], text: 'Your opponent\'s Pokémon may evolve as if it had been in play for 1 more turn.' });
        assert.deepEqual(getStadiumEvolutionSpeed('self'), { relaxTurnGate: false, costReduce: 0 });
        assert.deepEqual(getStadiumEvolutionSpeed('opp'), { relaxTurnGate: true, costReduce: 0 });

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

    test('listAttacks: double-colorless energy pays any 2 symbols', () => {
      const card = { name: 'T', types: [], attacks: [
        { name: 'Blast', cost: ['Fire', 'Water'], damage: 50, text: '' },
      ] };
      const energyTypes = [{ type: 'Colorless', family: 'double-colorless' }];
      const res = listAttacks(card, { energyTypes });
      assert.equal(res[0].payable, true);
    });

    // ── start-of-turn draw (taxonomy B) ──
    test('shouldAutoDrawAtTurnStart: true when enabled, not drawn, deck non-empty', () => {
      assert.equal(shouldAutoDrawAtTurnStart({ enabled: true, drewThisTurn: false, deckCount: 3 }), true);
      assert.equal(shouldAutoDrawAtTurnStart({ enabled: true, drewThisTurn: true, deckCount: 3 }), false);
      assert.equal(shouldAutoDrawAtTurnStart({ enabled: true, drewThisTurn: false, deckCount: 0 }), false);
      assert.equal(shouldAutoDrawAtTurnStart({ enabled: false, drewThisTurn: false, deckCount: 3 }), false);
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

    // ── Garland Ray: discard-to-scale damage (Mega Diancie ex) ──
    const GARLAND_RAY =
      'Discard up to 2 Energy cards from this Pokémon, and this attack does 120 damage for each card you discarded in this way.';

    test('discardEnergyScaling: Garland Ray → { max: 2 }', () => {
      assert.deepEqual(discardEnergyScaling(GARLAND_RAY), { max: 2 });
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
      assert.deepEqual(discardEnergyScaling(t), { max: 1 });
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

    