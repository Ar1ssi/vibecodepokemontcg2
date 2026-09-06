import test, { describe } from 'node:test';
    import assert from 'node:assert/strict';
    
    const { parseTrainerEffect, describeStep } = await import('../trainer-effects.mjs');
    const { energyMatchesSearchWhat } = await import('../energy-effects.mjs');
    
    test("Professor's Research: discard hand, draw 7", () => {
      const r = parseTrainerEffect("Discard your hand and draw 7 cards.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'discardHandThenDraw');
      assert.equal(r.steps[0].count, 7);
    });
    
    test("Lillie's Determination: shuffle hand, draw 6 (8 at 6 prizes)", () => {
      const r = parseTrainerEffect("Shuffle your hand into your deck. Then, draw 6 cards. If you have exactly 6 Prize cards remaining, draw 8 cards instead.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'shuffleHandThenDraw');
      assert.equal(r.steps[0].count, 6);
      assert.equal(r.steps[0].bonusCount, 8);
    });
    
    test('Arven: search Item + Tool', () => {
      const r = parseTrainerEffect("Search your deck for an Item card and a Pokémon Tool card, reveal them, and put them into your hand. Then, shuffle your deck.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'searchDeck');
      assert.equal(r.steps[0].what, 'Item + Pokémon Tool');
    });
    
    test('Nest Ball: search Basic to bench', () => {
      const r = parseTrainerEffect("Search your deck for a Basic Pokémon and put it onto your Bench. Then, shuffle your deck.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].destination, 'bench');
    });
    
    test('Ultra Ball: discard cost before search', () => {
      const r = parseTrainerEffect("You can use this card only if you discard 2 other cards from your hand.\n\nSearch your deck for a Pokémon, reveal it, and put it into your hand. Then, shuffle your deck.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'discardCost');
      assert.equal(r.steps[0].count, 2);
      assert.equal(r.steps[1].type, 'searchDeck');
    });

    test('Generalized discard cost: any N other cards', () => {
      const r = parseTrainerEffect("You can use this card only if you discard 3 other cards from your hand.\n\nSearch your deck for a Pokémon, reveal it, and put it into your hand. Then, shuffle your deck.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'discardCost');
      assert.equal(r.steps[0].count, 3);
      assert.equal(r.steps[1].type, 'searchDeck');
    });

    // Older Ultra Ball wording (sm3.5-68, the variant resolved by name at
    // runtime) — the wording that previously produced no discardCost step,
    // so the discard-cost picker in rules-bridge.js never opened.
    test('Ultra Ball sm3.5-68: older "Discard 2 cards from your hand. If you do, search…" still yields discardCost first', () => {
      const r = parseTrainerEffect("Discard 2 cards from your hand. If you do, search your deck for a Pokémon, reveal it, and put it into your hand. Then, shuffle your deck.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'discardCost');
      assert.equal(r.steps[0].count, 2);
      assert.equal(r.steps[1].type, 'searchDeck');
      assert.equal(r.steps[1].what, 'Pokémon');
    });
    
    test("Boss's Orders: switch opponent", () => {
      const r = parseTrainerEffect("Switch in 1 of your opponent's Benched Pokémon to the Active Spot.");
      assert.equal(r.steps[0].type, 'switchOpponent');
    });
    
    test('Switch: switch own', () => {
      const r = parseTrainerEffect("Switch your Active Pokémon with 1 of your Benched Pokémon.");
      assert.equal(r.steps[0].type, 'switchOwn');
    });
    
    test('Pokégear: look at top 7 for Supporter', () => {
      const r = parseTrainerEffect("Look at the top 7 cards of your deck. You may reveal a Supporter card you find there and put it into your hand. Shuffle the rest.");
      assert.equal(r.steps[0].type, 'lookAtTop');
      assert.equal(r.steps[0].count, 7);
      assert.equal(r.steps[0].pick, 'Supporter');
    });
    
    test('Night Stretcher: recursion from discard', () => {
      const r = parseTrainerEffect("Put a Pokémon or a Basic Energy card from your discard pile into your hand.");
      assert.equal(r.steps[0].type, 'recursion');
      assert.equal(r.steps[0].what, 'Pokémon or Basic Energy');
    });
    
    test("Wally's Compassion: heal Mega Evolution ex", () => {
      const r = parseTrainerEffect("Heal all damage from 1 of your Mega Evolution Pokémon ex. If you healed any damage in this way, put all Energy attached to that Pokémon into your hand.");
      assert.equal(r.steps[0].type, 'heal');
    });
    
    test('Wondrous Patch: attach Psychic energy from discard', () => {
      const r = parseTrainerEffect("Attach a Basic {P} Energy card from your discard pile to 1 of your Benched {P} Pokémon.");
      assert.equal(r.steps[0].type, 'attachFromDiscard');
      assert.equal(r.steps[0].energy, 'Basic {P} Energy');
      assert.equal(r.steps[0].target, '1 of your Benched {P} Pokémon');
      assert.ok(describeStep(r.steps[0]).includes('Basic {P} Energy'));
      assert.ok(!describeStep(r.steps[0]).includes('Energy Energy'));
    });

    test('Wondrous Patch: website renders energy with spaces ({ P }) — still Psychic', () => {
      const r = parseTrainerEffect("Attach a Basic { P } Energy card from your discard pile to 1 of your Benched { P } Pokémon.");
      assert.equal(r.steps[0].type, 'attachFromDiscard');
      assert.equal(r.steps[0].energy, 'Basic {P} Energy');
      assert.equal(r.steps[0].target, '1 of your Benched {P} Pokémon');
    });

    test('Glass Trumpet: attach Basic Energy to up to 2 Benched {C} Pokémon', () => {
      const r = parseTrainerEffect("Choose up to 2 of your Benched { C } Pokémon and attach a Basic Energy card from your discard pile to each of them.");
      assert.equal(r.steps[0].type, 'attachFromDiscard');
      assert.equal(r.steps[0].energy, 'Basic Energy');
      assert.equal(r.steps[0].target, 'up to 2 of your Benched {C} Pokémon');
    });

    test("N's PP Up: attach Basic Energy to Benched N's Pokémon (curly apostrophe)", () => {
      const r = parseTrainerEffect("Attach a Basic Energy card from your discard pile to 1 of your Benched N’s Pokémon.");
      assert.equal(r.steps[0].type, 'attachFromDiscard');
      assert.equal(r.steps[0].energy, 'Basic Energy');
      assert.equal(r.steps[0].target, "1 of your Benched N's Pokémon");
    });
    
    test('Iono: both shuffle', () => {
      const r = parseTrainerEffect("Each player shuffles their hand and puts it on the bottom of their deck.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'ionoShuffle');
    });
    
    test('Iono PAL 185: "Each player shuffles the cards in their hand into their deck"', () => {
      const r = parseTrainerEffect('Each player shuffles the cards in their hand into their deck.');
      assert.equal(r.recognizable, true);
      assert.equal(r.steps.length, 1);
      assert.equal(r.steps[0].type, 'ionoShuffle');
      assert.ok(describeStep(r.steps[0]).toLowerCase().includes('shuffle'));
    });
    
    test('Buddy-Buddy Poffin: 2 basics ≤70HP', () => {
      const r = parseTrainerEffect("Search your deck for up to 2 Basic Pokémon with 70 HP or less and put them onto your Bench. Then, shuffle your deck.");
      assert.equal(r.steps[0].what, 'Basic Pokémon ≤70 HP');
      assert.equal(r.steps[0].count, 2);
    });
    
    test('Air Balloon: passive tool', () => {
      const r = parseTrainerEffect("The Retreat Cost of the Pokémon this card is attached to is {C}{C} less.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'passive');
    });
    
    test('describeStep gives human guidance', () => {
      const s = describeStep({ type: 'discardHandThenDraw', count: 7 });
      assert.ok(s.includes('7'));
    });

    test('Bare draw: standalone "Draw 2 cards."', () => {
      const r = parseTrainerEffect('Draw 2 cards.');
      assert.equal(r.recognizable, true);
      assert.equal(r.steps.length, 1);
      assert.equal(r.steps[0].type, 'draw');
      assert.equal(r.steps[0].count, 2);
    });

    test('Bare draw: singular "Draw 1 card."', () => {
      const r = parseTrainerEffect('Draw 1 card.');
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'draw');
      assert.equal(r.steps[0].count, 1);
    });

    test('Bare draw: "Then, draw 3 cards."', () => {
      const r = parseTrainerEffect('Then, draw 3 cards.');
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'draw');
      assert.equal(r.steps[0].count, 3);
    });

    test('Regression: "search… then draw" keeps the search step (not bare draw)', () => {
      const r = parseTrainerEffect('Search your deck for a Pokémon, reveal it, and put it into your hand. Then, draw 1 card.');
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'searchDeck');
      assert.equal(r.steps[0].destination, 'hand');
    });

    test('Regression: discard-hand-then-draw is not shadowed by bare draw', () => {
      const r = parseTrainerEffect('Discard your hand and draw 5 cards.');
      assert.equal(r.steps[0].type, 'discardHandThenDraw');
      assert.equal(r.steps[0].count, 5);
      assert.equal(r.steps.length, 1);
    });

    test('Regression: shuffle-hand-then-draw is not shadowed by bare draw', () => {
      const r = parseTrainerEffect('Shuffle your hand into your deck. Then, draw 6 cards. If you have exactly 6 Prize cards remaining, draw 8 cards instead.');
      assert.equal(r.steps[0].type, 'shuffleHandThenDraw');
      assert.equal(r.steps[0].count, 6);
    });

    test('describeStep draw: plural and singular', () => {
      assert.ok(describeStep({ type: 'draw', count: 2 }).includes('2 cards'));
      assert.ok(describeStep({ type: 'draw', count: 1 }).includes('1 card'));
    });

    // Compound effects — the parser must now handle multi-step effects
    test('Compound: look at top then draw (Grimsley\'s Move style)', () => {
      const r = parseTrainerEffect("Look at the top 5 cards of your deck. You may reveal a Darkness-type Pokémon and put it onto your Bench. Shuffle the rest. Then, draw 2 cards.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps.length, 2);
      assert.equal(r.steps[0].type, 'lookAtTop');
      assert.equal(r.steps[0].count, 5);
      assert.equal(r.steps[1].type, 'draw');
      assert.equal(r.steps[1].count, 2);
    });

    test('Compound: switch opponent then draw', () => {
      const r = parseTrainerEffect("Switch in 1 of your opponent's Benched Pokémon to the Active Spot. Then, draw 2 cards.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps.length, 2);
      assert.equal(r.steps[0].type, 'switchOpponent');
      assert.equal(r.steps[1].type, 'draw');
      assert.equal(r.steps[1].count, 2);
    });

    test('Compound: switch own then draw', () => {
      const r = parseTrainerEffect("Switch your Active Pokémon with 1 of your Benched Pokémon. Then, draw 1 card.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps.length, 2);
      assert.equal(r.steps[0].type, 'switchOwn');
      assert.equal(r.steps[1].type, 'draw');
      assert.equal(r.steps[1].count, 1);
    });

    test('Compound: heal then draw', () => {
      const r = parseTrainerEffect("Heal all damage from your Pokémon. Then, draw 2 cards.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps.length, 2);
      assert.equal(r.steps[0].type, 'heal');
      assert.equal(r.steps[1].type, 'draw');
      assert.equal(r.steps[1].count, 2);
    });

    test('Compound: recursion then draw', () => {
      const r = parseTrainerEffect("Put a Pokémon or a Basic Energy card from your discard pile into your hand. Then, draw 1 card.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps.length, 2);
      assert.equal(r.steps[0].type, 'recursion');
      assert.equal(r.steps[1].type, 'draw');
      assert.equal(r.steps[1].count, 1);
    });

    test('Compound: search then draw (explicit trailing draw)', () => {
      const r = parseTrainerEffect("Search your deck for a Pokémon, reveal it, and put it into your hand. Then, shuffle your deck. Then, draw 2 cards.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps.length, 2);
      assert.equal(r.steps[0].type, 'searchDeck');
      assert.equal(r.steps[1].type, 'draw');
      assert.equal(r.steps[1].count, 2);
    });

    test('Compound: attach from discard then draw', () => {
      const r = parseTrainerEffect("Attach a basic Energy card from your discard pile to 1 of your Benched Pokémon. Then, draw 1 card.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps.length, 2);
      assert.equal(r.steps[0].type, 'attachFromDiscard');
      assert.equal(r.steps[1].type, 'draw');
      assert.equal(r.steps[1].count, 1);
    });

    // Regression: appendTrailingDraw must match a draw clause that is NOT
    // the last clause in the text (the old regex was anchored to $ and
    // silently dropped these).
    test('Compound: look at top, draw in the middle (draw not at end of string)', () => {
      const r = parseTrainerEffect("Look at the top 5 cards of your deck. You may reveal a Supporter card and put it into your hand. Then, draw 2 cards. Shuffle the rest.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps.length, 2);
      assert.equal(r.steps[0].type, 'lookAtTop');
      assert.equal(r.steps[1].type, 'draw');
      assert.equal(r.steps[1].count, 2);
    });

    test('Compound: search, draw in the middle (draw not at end of string)', () => {
      const r = parseTrainerEffect("Search your deck for a Pokémon, reveal it, and put it into your hand. Then, draw 1 card. Shuffle your deck.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps.length, 2);
      assert.equal(r.steps[0].type, 'searchDeck');
      assert.equal(r.steps[1].type, 'draw');
      assert.equal(r.steps[1].count, 1);
    });

    // ── Edge-case audit fixes (pkmncards.com Mega Evolution trainers) ──

    test("Boss's Orders: curly apostrophe still parses switchOpponent", () => {
      const r = parseTrainerEffect("Switch in 1 of your opponent’s Benched Pokémon to the Active Spot.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'switchOpponent');
    });

    test('Buddy-Buddy Poffin: 2 basics ≤70HP go to BENCH (not hand)', () => {
      const r = parseTrainerEffect("Search your deck for up to 2 Basic Pokémon with 70 HP or less and put them onto your Bench. Then, shuffle your deck.");
      assert.equal(r.steps[0].type, 'searchDeck');
      assert.equal(r.steps[0].what, 'Basic Pokémon ≤70 HP');
      assert.equal(r.steps[0].count, 2);
      assert.equal(r.steps[0].destination, 'bench');
    });

    test("Iris's Fighting Spirit: draw until you have 6", () => {
      const r = parseTrainerEffect("Draw cards until you have 6 cards in your hand.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'drawUntil');
      assert.equal(r.steps[0].target, 6);
    });

    test("Iris's Fighting Spirit: 'discard another card' cost + drawUntil", () => {
      const r = parseTrainerEffect("You can use this card only if you discard another card from your hand. Draw cards until you have 6 cards in your hand.");
      assert.equal(r.recognizable, true);
      assert.ok(r.steps.some((s) => s.type === 'discardCost' && s.count === 1));
      assert.ok(r.steps.some((s) => s.type === 'drawUntil' && s.target === 6));
    });

    test("Team Rocket's Ariana: draw until 5 (8 instead)", () => {
      const r = parseTrainerEffect("Draw cards until you have 5 cards in your hand. If all of your Pokémon in play are Team Rocket’s Pokémon, draw cards until you have 8 cards in your hand instead.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'drawUntil');
      assert.equal(r.steps[0].target, 5);
      assert.equal(r.steps[0].bonusTarget, 8);
    });

    test('Pokémon Center Lady: heal 60 + cure', () => {
      const r = parseTrainerEffect("Heal 60 damage from 1 of your Pokémon, and it recovers from all Special Conditions.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'healAmount');
      assert.equal(r.steps[0].amount, 60);
      assert.equal(r.steps[0].target, '1 of your Pokémon');
      assert.equal(r.steps[0].cure, true);
      assert.ok(describeStep(r.steps[0]).includes('60 damage'));
    });

    test('Jumbo Ice Cream: heal 80 from Active', () => {
      const r = parseTrainerEffect("Heal 80 damage from your Active Pokémon that has 3 or more Energy attached.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'healAmount');
      assert.equal(r.steps[0].amount, 80);
      assert.equal(r.steps[0].target, 'Active Pokémon');
    });

    test("Team Rocket's Archer: ionoShuffle + own draw 5 + opponent draw 3", () => {
      const r = parseTrainerEffect("Each player shuffles their hand into their deck. Then, you draw 5 cards, and your opponent draws 3 cards.");
      assert.equal(r.recognizable, true);
      assert.ok(r.steps.some((s) => s.type === 'ionoShuffle'));
      assert.ok(r.steps.some((s) => s.type === 'draw' && s.count === 5));
      assert.ok(r.steps.some((s) => s.type === 'opponentDraw' && s.count === 3));
    });

    test("Team Rocket's Giovanni: switch own then switch opponent (curly apostrophes)", () => {
      const r = parseTrainerEffect("Switch your Active Team Rocket’s Pokémon with 1 of your Benched Team Rocket’s Pokémon. If you do, switch in 1 of your opponent’s Benched Pokémon to the Active Spot.");
      assert.equal(r.recognizable, true);
      assert.ok(r.steps.some((s) => s.type === 'switchOwn'));
      assert.ok(r.steps.some((s) => s.type === 'switchOpponent'));
    });

    test('Surfer: switch own + draw until 5 (conditional trailing)', () => {
      const r = parseTrainerEffect("Switch your Active Pokémon with 1 of your Benched Pokémon. If you do, draw cards until you have 5 cards in your hand.");
      assert.equal(r.recognizable, true);
      assert.ok(r.steps.some((s) => s.type === 'switchOwn'));
      assert.ok(r.steps.some((s) => s.type === 'drawUntil' && s.target === 5));
    });

    test("Team Rocket's Factory: stadium 'once during each player's turn' is passive, NOT a bare draw", () => {
      const r = parseTrainerEffect("Once during each player’s turn, if they played a Supporter card that has “Team Rocket” in its name from their hand this turn, they may draw 2 cards.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps.length, 1);
      assert.equal(r.steps[0].type, 'passive');
    });

    test('Canari: discard 1 cost + search up to 4 Pokémon', () => {
      const r = parseTrainerEffect("You can use this card only if you discard another card from your hand. Search your deck for up to 4 { L } Pokémon, reveal them, and put them into your hand. Then, shuffle your deck.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'discardCost');
      assert.equal(r.steps[0].count, 1);
      assert.ok(r.steps.some((s) => s.type === 'searchDeck' && s.what === 'Pokémon' && s.count === 4));
    });

    test('Firebreather: search up to 7 Basic {R} Energy (not generic "card")', () => {
      const r = parseTrainerEffect("Search your deck for up to 7 Basic { R } Energy cards, reveal them, and put them into your hand. Then, shuffle your deck.");
      assert.equal(r.recognizable, true);
      const search = r.steps.find((s) => s.type === 'searchDeck');
      assert.ok(search);
      assert.equal(search.what, 'Basic {R} Energy');
      assert.equal(search.count, 7);
      assert.equal(search.upTo, true);
      assert.equal(search.reveal, true);
      assert.ok(!r.steps.some((s) => s.what === 'Basic Energy'), 'must not collapse to generic Basic Energy');
    });

    test('announceDiscardPick: always broadcasts picked discard card', async () => {
      const { announceDiscardPick } = await import('../search-reveal.mjs');
      const messages = [];
      const append = (_user, msg) => { messages.push(msg); };
      announceDiscardPick('self', 'Super Rod', [{ name: 'Pikachu' }], append);
      assert.equal(messages.length, 1);
      assert.match(messages[0], /Revealed \(Super Rod\): Pikachu/);
    });

    test('maybeAnnounceSearchReveal: skips when effect has no reveal', async () => {
      const { maybeAnnounceSearchReveal } = await import('../search-reveal.mjs');
      let called = 0;
      const append = () => { called++; };
      maybeAnnounceSearchReveal('self', 'Ultra Ball', [{ name: 'Pikachu' }], append, {
        sourceText: 'Search your deck for a Pokémon and put it into your hand.',
      });
      assert.equal(called, 0);
    });

    test('maybeAnnounceSearchReveal: announces when effect text includes reveal', async () => {
      const { maybeAnnounceSearchReveal } = await import('../search-reveal.mjs');
      const messages = [];
      const append = (_user, msg) => { messages.push(msg); };
      maybeAnnounceSearchReveal('self', 'Firebreather', [{ name: 'Basic Fire Energy' }], append, {
        sourceText: 'Search your deck for up to 7 Basic {R} Energy cards, reveal them, and put them into your hand.',
      });
      assert.equal(messages.length, 1);
      assert.match(messages[0], /Revealed \(Firebreather\): Basic Fire Energy/);
    });

    test('Firebreather search filter: typed {R} matches Fire only', () => {
      const fire = { name: 'Basic Fire Energy', type: 'Energy', subtypes: ['Basic'], types: ['Fire'] };
      const water = { name: 'Basic Water Energy', type: 'Energy', subtypes: ['Basic'], types: ['Water'] };
      assert.equal(energyMatchesSearchWhat(fire, 'Basic {R} Energy'), true);
      assert.equal(energyMatchesSearchWhat(water, 'Basic {R} Energy'), false);
      assert.equal(energyMatchesSearchWhat(fire, 'Basic Energy'), true);
      assert.equal(energyMatchesSearchWhat(water, 'Basic Energy'), true);
    });

    test('typed bench search: up to 3 {C} Pokémon with 100 HP or less', () => {
      const r = parseTrainerEffect(
        'Search your deck for up to 3 { C } Pokémon with 100 HP or less and put them onto your Bench. Then, shuffle your deck.'
      );
      assert.equal(r.recognizable, true);
      const search = r.steps.find((s) => s.type === 'searchDeck');
      assert.ok(search);
      assert.equal(search.what, 'Basic {C} Pokémon ≤100 HP');
      assert.equal(search.count, 3);
      assert.equal(search.destination, 'bench');
      assert.equal(search.upTo, true);
    });

    test('Fighting Gong: or-clause "Basic Energy or Basic Pokémon" (not plain Pokémon)', () => {
      const r = parseTrainerEffect("Search your deck for a Basic { F } Energy card or a Basic { F } Pokémon, reveal it, and put it into your hand. Then, shuffle your deck.");
      assert.equal(r.recognizable, true);
      assert.ok(r.steps.some((s) => s.type === 'searchDeck' && s.what === 'Basic Energy or Basic Pokémon'));
    });

    test("Team Rocket's Proton: search up to 3 Basic Pokémon", () => {
      const r = parseTrainerEffect("Search your deck for up to 3 Basic Team Rocket’s Pokémon, reveal them, and put them into your hand. Then, shuffle your deck.");
      assert.equal(r.recognizable, true);
      assert.ok(r.steps.some((s) => s.type === 'searchDeck' && s.what === "Basic Team Rocket's Pokémon" && s.count === 3));
    });

    test('describeStep: drawUntil and opponentRead wording', () => {
      assert.ok(describeStep({ type: 'drawUntil', target: 6 }).includes('6'));
      assert.ok(describeStep({ type: 'opponentDraw', count: 3 }).includes('3'));
      assert.ok(describeStep({ type: 'healAmount', amount: 60, target: '1 of your Pokémon', cure: true }).includes('Special Conditions'));
    });

    // ── new guided action step types ──────────────────────────────────────
    test('Rare Candy: evolveStage2 (skip Stage 1)', () => {
      const r = parseTrainerEffect("Choose 1 of your Basic Pokémon in play. If you have a Stage 2 card in your hand that evolves from that Pokémon, put that card onto the Basic Pokémon to evolve it, skipping the Stage 1.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'evolveStage2');
      assert.equal(r.steps[0].skipStage, 1);
      assert.ok(describeStep(r.steps[0]).includes('skipping the Stage 1'));
    });

    test('Energy Switch: moveEnergy', () => {
      const r = parseTrainerEffect('Move a Basic Energy from 1 of your Pokémon to another of your Pokémon.');
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'moveEnergy');
    });

    test('Strange Timepiece: devolve', () => {
      const r = parseTrainerEffect('Devolve 1 of your evolved { P } Pokémon by putting any number of Evolution cards on it into your hand.');
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'devolve');
      assert.ok(r.steps[0].target.includes('{P}'));
    });

    test('Tool Scrapper: discardTools', () => {
      const r = parseTrainerEffect('Choose up to 2 Pokémon Tools attached to Pokémon (yours or your opponent’s) and discard them.');
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'discardTools');
      assert.equal(r.steps[0].count, 2);
    });

    test('Blowtorch: discardFromOpponent', () => {
      const r = parseTrainerEffect('You can use this card only if you discard a Basic { R } Energy card from your hand. Discard a Pokémon Tool or Special Energy card from 1 of your opponent’s Pokémon, or discard a Stadium in play.');
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'discardFromOpponent');
    });

    test('Repel: switchOpponentOut (not switchOpponent)', () => {
      const r = parseTrainerEffect('Switch out your opponent’s Active Pokémon to the Bench. (Your opponent chooses the new Active Pokémon.)');
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'switchOpponentOut');
    });

    // ── passive / turn-scoped / conditional effects (recognized, not stepped) ──
    test("Black Belt's Training: passive damage boost", () => {
      const r = parseTrainerEffect('During this turn, attacks used by your Pokémon do 40 more damage to your opponent’s Active Pokémon ex.');
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'passive');
      assert.ok(r.steps[0].detail.includes('damage boost'));
    });

    test('Premium Power Pro: passive damage boost', () => {
      const r = parseTrainerEffect('During this turn, attacks used by your { F } Pokémon do 30 more damage to your opponent’s Active Pokémon.');
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'passive');
    });

    test('Iron Defender: passive damage reduction', () => {
      const r = parseTrainerEffect('During your opponent’s next turn, all of your { M } Pokémon take 30 less damage from attacks from your opponent’s Pokémon.');
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'passive');
      assert.ok(r.steps[0].detail.includes('damage reduction'));
    });

    test("Acerola's Mischief: passive protect-from-ex", () => {
      const r = parseTrainerEffect('Choose 1 of your Pokémon in play. During your opponent’s next turn, prevent all damage from and effects of attacks done to that Pokémon by your opponent’s Pokémon ex.');
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'passive');
    });

    test('Anthea & Concordia: passive bonus prize', () => {
      const r = parseTrainerEffect('During this turn, if your opponent’s Active Pokémon is Knocked Out by damage from an attack used by your N’s Pokémon, take 3 more Prize cards.');
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'passive');
      assert.ok(r.steps[0].detail.includes('prize'));
    });

    test('Stadiums & tools: recognized as passive', () => {
      const texts = [
        'Each player’s { G } Pokémon can evolve into { G } Pokémon during the turn they play those Pokémon, except during their first turn.',
        'Prevent all damage counters from being placed on Benched Pokémon (both yours and your opponent’s).',
        'Confused Pokémon (both yours and your opponent’s) don’t recover from that Special Condition when they evolve or devolve.',
        'Attacks used by each Tera Pokémon in play cost { C } more.',
        '{ C } Pokémon in play (both yours and your opponent’s) have no Abilities.',
        'Pokémon Tools attached to each Pokémon (both yours and your opponent’s) have no effect.',
        'The Pokémon this card is attached to takes 30 less damage from attacks from your opponent’s Pokémon that have an Ability.',
        'If you have more Prize cards remaining than your opponent, attacks used by the Pokémon this card is attached to cost { C } less.',
        'Attacks used by the Pikachu ex this card is attached to do 50 more damage to your opponent’s Active Pokémon ex.',
        'The { N } Pokémon this card is attached to takes 50 less damage from attacks from your opponent’s { G } Pokémon.',
      ];
      for (const t of texts) {
        const r = parseTrainerEffect(t);
        assert.equal(r.recognizable, true, `expected recognizable: ${t}`);
        assert.equal(r.steps[0].type, 'passive', `expected passive: ${t}`);
      }
    });

    test('describeStep: new action types produce non-empty guidance', () => {
      assert.ok(describeStep({ type: 'evolveStage2' }).length > 0);
      assert.ok(describeStep({ type: 'moveEnergy' }).length > 0);
      assert.ok(describeStep({ type: 'devolve', target: '1 of your evolved {P} Pokémon' }).includes('Devolve'));
      assert.ok(describeStep({ type: 'discardTools', count: 2 }).includes('2'));
      assert.ok(describeStep({ type: 'switchOpponentOut' }).includes('opponent'));
      assert.ok(describeStep({ type: 'passive', detail: 'Custom detail.' }).includes('Custom detail.'));
    });

    describe('misparse fixes', () => {
      test('Picnicker: coin flip draw 4 / draw 2', () => {
        const r = parseTrainerEffect('Flip a coin. If heads, draw 4 cards. If tails, draw 2 cards.');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'coinFlip');
        assert.equal(r.steps[0].heads.type, 'draw');
        assert.equal(r.steps[0].heads.count, 4);
        assert.equal(r.steps[0].tails.type, 'draw');
        assert.equal(r.steps[0].tails.count, 2);
        assert.ok(describeStep(r.steps[0]).includes('heads'));
      });

      test('Kofu: put hand on bottom then draw 4', () => {
        const r = parseTrainerEffect(
          "Put 2 cards from your hand on the bottom of your deck in any order. If you put 2 cards on the bottom of your deck in this way, draw 4 cards. (If you can't put 2 cards from your hand on the bottom of your deck, you can't use this card.)"
        );
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'putHandOnBottom');
        assert.equal(r.steps[0].count, 2);
        assert.equal(r.steps[1].type, 'draw');
        assert.equal(r.steps[1].count, 4);
        assert.ok(describeStep(r.steps[0]).includes('bottom'));
      });

      test('Special Red Card: opponent shuffle hand + draw with prize gate', () => {
        const r = parseTrainerEffect(
          "You can use this card only if your opponent has 3 or fewer Prize cards remaining.\n\nYour opponent shuffles their hand and puts it on the bottom of their deck. If they put any cards on the bottom of their deck in this way, they draw 3 cards."
        );
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'opponentShuffleHandDraw');
        assert.equal(r.steps[0].count, 3);
        assert.equal(r.steps[0].prizeCondition, 'opponentPrizes<=3');
        assert.ok(describeStep(r.steps[0]).includes('opponent'));
      });

      test("Misty's Vitality: search Basic {W} Energy and attach", () => {
        const r = parseTrainerEffect(
          'Search your deck for up to 4 Basic {W} Energy cards and attach them to 1 of your Pokémon. Then, shuffle your deck. Your turn ends.'
        );
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'searchDeck');
        assert.equal(r.steps[0].what, 'Basic {W} Energy');
        assert.equal(r.steps[0].count, 4);
        assert.equal(r.steps[0].destination, 'attach');
        assert.ok(describeStep(r.steps[0]).includes('attach'));
      });

      test("Colress's Tenacity: Stadium + Energy search", () => {
        const r = parseTrainerEffect(
          'Search your deck for a Stadium card and an Energy card, reveal them, and put them into your hand. Then, shuffle your deck.'
        );
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'searchDeck');
        assert.equal(r.steps[0].what, 'Stadium + Energy');
        assert.equal(r.steps[0].count, 2);
      });

      test('Poké Ball: coin flip heads search', () => {
        const r = parseTrainerEffect(
          'Flip a coin. If heads, search your deck for a Pokémon, reveal it, and put it into your hand. Then, shuffle your deck.'
        );
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'coinFlip');
        assert.equal(r.steps[0].heads.type, 'searchDeck');
        assert.equal(r.steps[0].heads.what, 'Pokémon');
        assert.equal(r.steps[0].tails, null);
      });

      test("Team Rocket's Great Ball: coin flip Evolution vs Basic search", () => {
        const r = parseTrainerEffect(
          "Flip a coin. If heads, search your deck for an Evolution Team Rocket's Pokémon, reveal it, and put it into your hand. If tails, search your deck for a Basic Team Rocket's Pokémon, reveal it, and put it into your hand. Then, shuffle your deck."
        );
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'coinFlip');
        assert.equal(r.steps[0].heads.what, "Evolution Team Rocket's Pokémon");
        assert.equal(r.steps[0].tails.what, "Basic Team Rocket's Pokémon");
      });
    });
    describe('draw shuffle status families', () => {
      test('Awakening Drum: variableDraw ancientInPlay', () => {
        const r = parseTrainerEffect('Draw a card for each of your Ancient Pokémon in play.');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps.length, 1);
        assert.equal(r.steps[0].type, 'variableDraw');
        assert.equal(r.steps[0].source, 'ancientInPlay');
        assert.equal(r.steps[0].per, 'card');
        assert.ok(describeStep(r.steps[0]).includes('Ancient'));
      });

      test("Morty's Conviction: variableDraw opponentBench + discardCost", () => {
        const r = parseTrainerEffect("You can use this card only if you discard another card from your hand.\n\nDraw a card for each of your opponent's Benched Pokémon.");
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'discardCost');
        assert.equal(r.steps[0].count, 1);
        assert.equal(r.steps[1].type, 'variableDraw');
        assert.equal(r.steps[1].source, 'opponentBench');
      });

      test('Emma: variableDraw opponentHandPokemon', () => {
        const r = parseTrainerEffect('Your opponent reveals their hand, and you draw a card for each Pokémon you find there.');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'variableDraw');
        assert.equal(r.steps[0].source, 'opponentHandPokemon');
        assert.ok(describeStep(r.steps[0]).includes('revealed hand'));
      });

      test("Jett: variableDraw opponentMegaExInPlay", () => {
        const r = parseTrainerEffect("Draw a card for each of your opponent's Mega Evolution Pokémon ex in play.");
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'variableDraw');
        assert.equal(r.steps[0].source, 'opponentMegaExInPlay');
      });

      test('Brassius: countShuffleDrawPlus', () => {
        const r = parseTrainerEffect('Count the cards in your hand, shuffle those cards into your deck, then draw that many cards plus 1.');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps.length, 1);
        assert.equal(r.steps[0].type, 'countShuffleDrawPlus');
        assert.ok(describeStep(r.steps[0]).includes('plus 1'));
      });

      test('Energy Recycler: shuffleFromDiscard Basic Energy', () => {
        const r = parseTrainerEffect('Shuffle up to 5 Basic Energy cards from your discard pile into your deck.');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'shuffleFromDiscard');
        assert.equal(r.steps[0].what, 'Basic Energy');
        assert.equal(r.steps[0].count, 5);
      });

      test('Sacred Ash: shuffleFromDiscard Pokémon', () => {
        const r = parseTrainerEffect('Shuffle up to 5 Pokémon from your discard pile into your deck.');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'shuffleFromDiscard');
        assert.equal(r.steps[0].what, 'Pokémon');
        assert.equal(r.steps[0].count, 5);
      });

      test('Great Haul Net: shuffleFromDiscard with choices', () => {
        const r = parseTrainerEffect('Choose 1 or both:\n• Shuffle up to 3 {W} Pokémon from your discard pile into your deck.\n• Shuffle up to 3 Basic {W} Energy cards from your discard pile into your deck.');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'shuffleFromDiscard');
        assert.ok(Array.isArray(r.steps[0].choices));
        assert.equal(r.steps[0].choices.length, 2);
        assert.equal(r.steps[0].choices[0].what, '{W} Pokémon');
        assert.equal(r.steps[0].choices[0].count, 3);
        assert.equal(r.steps[0].choices[1].what, 'Basic {W} Energy');
        assert.ok(describeStep(r.steps[0]).includes('Choose 1 or both'));
      });

      test('Dangerous Laser: applyStatus opponentActive Burned+Confused', () => {
        const r = parseTrainerEffect("Your opponent's Active Pokémon is now Burned and Confused.");
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'applyStatus');
        assert.equal(r.steps[0].target, 'opponentActive');
        assert.deepEqual(r.steps[0].conditions, ['Burned', 'Confused']);
        assert.ok(describeStep(r.steps[0]).includes('Burned'));
      });

      test('Dark Bell: applyStatus bothActiveNonDark Confused', () => {
        const r = parseTrainerEffect('Both Active non-{D} Pokémon are now Confused.');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'applyStatus');
        assert.equal(r.steps[0].target, 'bothActiveNonDark');
        assert.deepEqual(r.steps[0].conditions, ['Confused']);
        assert.ok(describeStep(r.steps[0]).includes('non-{D}'));
      });

      test('Regression: variableDraw is not shadowed by bare draw', () => {
        const r = parseTrainerEffect('Draw a card for each of your Ancient Pokémon in play.');
        assert.notEqual(r.steps[0].type, 'draw');
      });
    });

    describe('near-miss audit fixes', () => {
      test('Briar: singular "take 1 more Prize card" is passive', () => {
        const r = parseTrainerEffect(
          "You can use this card only if your opponent has exactly 2 Prize cards remaining.\n\nDuring this turn, if your opponent's Active Pokémon is Knocked Out by damage from an attack used by your Tera Pokémon, take 1 more Prize card."
        );
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'passive');
        assert.ok(r.steps[0].detail.includes('prize'));
      });

      test("Lisia's Appeal: Benched Basic Pokémon switchOpponent", () => {
        const r = parseTrainerEffect(
          "Switch in 1 of your opponent's Benched Basic Pokémon to the Active Spot. If you do, the new Active Pokémon is now Confused."
        );
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'switchOpponent');
        assert.ok(describeStep(r.steps[0]).includes('Benched'));
      });

      test('Bravery Charm: +50 HP passive tool', () => {
        const r = parseTrainerEffect('The Basic Pokémon this card is attached to gets +50 HP.');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'passive');
        assert.ok(r.steps[0].detail.includes('HP'));
      });

      test("Hero's Cape: +100 HP passive tool", () => {
        const r = parseTrainerEffect('The Pokémon this card is attached to gets +100 HP.');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'passive');
        assert.ok(r.steps[0].detail.includes('HP'));
      });

      test("Cynthia's Power Weight: +70 HP passive tool", () => {
        const r = parseTrainerEffect("The Cynthia's Pokémon this card is attached to gets +70 HP.");
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'passive');
        assert.ok(r.steps[0].detail.includes('HP'));
      });

      test('Ancient Booster Energy Capsule: +60 HP and Special Condition immunity passive', () => {
        const r = parseTrainerEffect(
          "The Ancient Pokémon this card is attached to gets +60 HP, recovers from all Special Conditions, and can't be affected by any Special Conditions."
        );
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'passive');
        assert.ok(
          r.steps[0].detail.includes('HP') || r.steps[0].detail.includes('Special Condition'),
          `expected HP or Special Condition detail, got: ${r.steps[0].detail}`
        );
      });

      test('Dusk Ball: lookAtBottom 7 for Pokémon to hand', () => {
        const r = parseTrainerEffect(
          'Look at the bottom 7 cards of your deck. You may reveal a Pokémon you find there and put it into your hand. Shuffle the other cards back into your deck.'
        );
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'lookAtBottom');
        assert.equal(r.steps[0].count, 7);
        assert.equal(r.steps[0].pick, 'Pokémon');
        assert.equal(r.steps[0].destination, 'hand');
        assert.ok(describeStep(r.steps[0]).includes('bottom'));
        assert.ok(describeStep(r.steps[0]).includes('7'));
      });
    });

    describe('hand energy coin families', () => {
      test('Eri: revealOpponentHandDiscard up to 2 Items', () => {
        const r = parseTrainerEffect('Your opponent reveals their hand, and you discard up to 2 Item cards you find there.');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'revealOpponentHandDiscard');
        assert.equal(r.steps[0].what, 'Item');
        assert.equal(r.steps[0].count, 2);
        assert.ok(describeStep(r.steps[0]).includes('Item'));
      });

      test('Ortega: opponentHandBottom with optional opponent draw', () => {
        const r = parseTrainerEffect("Your opponent reveals their hand, and you choose a card you find there and put it on the bottom of their deck. If you put a card on the bottom of your opponent's deck in this way, your opponent may draw a card.");
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'opponentHandBottom');
        assert.equal(r.steps[0].what, 'card');
        assert.equal(r.steps[0].optionalOpponentDraw, true);
        assert.ok(describeStep(r.steps[0]).includes('may draw'));
      });

      test('Energy Swatter: opponentHandBottom Energy only', () => {
        const r = parseTrainerEffect('Your opponent reveals their hand, and you choose an Energy card you find there and put it on the bottom of their deck.');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'opponentHandBottom');
        assert.equal(r.steps[0].what, 'Energy');
        assert.equal(r.steps[0].optionalOpponentDraw, undefined);
      });

      test("Xerosic's Machinations: opponentDiscardUntil count 3", () => {
        const r = parseTrainerEffect('Your opponent discards cards from their hand until they have 3 cards in their hand.');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'opponentDiscardUntil');
        assert.equal(r.steps[0].count, 3);
      });

      test('Hand Trimmer: eachPlayerDiscardUntil count 5 opponent first', () => {
        const r = parseTrainerEffect('Each player discards cards from their hand until they have 5 cards in their hand. Your opponent discards first. (If a player has 5 or fewer cards in their hand, they do not discard.)');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'eachPlayerDiscardUntil');
        assert.equal(r.steps[0].count, 5);
        assert.equal(r.steps[0].opponentFirst, true);
        assert.ok(describeStep(r.steps[0]).includes('opponent first'));
      });

      test('Meddling Memo: opponentCountShuffleDraw', () => {
        const r = parseTrainerEffect('Your opponent counts the cards in their hand, shuffles those cards, and puts them on the bottom of their deck. If they do, they draw that many cards.');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'opponentCountShuffleDraw');
        assert.ok(describeStep(r.steps[0]).includes('counts'));
      });

      test('Enhanced Hammer: discardEnergyFromOpponent Special Energy', () => {
        const r = parseTrainerEffect("Discard a Special Energy from 1 of your opponent's Pokémon.");
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'discardEnergyFromOpponent');
        assert.equal(r.steps[0].energy, 'Special Energy');
        assert.equal(r.steps[0].scope, '1 Pokémon');
      });

      test('Rust Syndicate Grunt: discardEnergyFromOpponent any Energy', () => {
        const r = parseTrainerEffect("You can use this card only if any of your Pokémon were Knocked Out during your opponent's last turn.\n\nDiscard an Energy from 1 of your opponent's Pokémon.");
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'discardEnergyFromOpponent');
        assert.equal(r.steps[0].energy, 'any Energy');
        assert.equal(r.steps[0].scope, '1 Pokémon');
      });

      test('Giacomo: discardEnergyFromOpponent each Pokémon Special Energy', () => {
        const r = parseTrainerEffect("Discard a Special Energy from each of your opponent's Pokémon.");
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'discardEnergyFromOpponent');
        assert.equal(r.steps[0].energy, 'Special Energy');
        assert.equal(r.steps[0].scope, 'each Pokémon');
      });

      test('Chill Teaser Toy: discardEnergyFromOpponent returnToHand', () => {
        const r = parseTrainerEffect("You can use this card only if you go second, and only during your first turn.\n\nPut an Energy attached to 1 of your opponent's Pokémon into their hand.");
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'discardEnergyFromOpponent');
        assert.equal(r.steps[0].action, 'returnToHand');
        assert.ok(describeStep(r.steps[0]).includes('into their hand'));
      });

      test('Crushing Hammer: coinFlip heads discard energy from opponent', () => {
        const r = parseTrainerEffect("Flip a coin. If heads, discard an Energy from 1 of your opponent's Pokémon.");
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'coinFlip');
        assert.equal(r.steps[0].heads[0].type, 'discardEnergyFromOpponent');
        assert.equal(r.steps[0].heads[0].energy, 'any Energy');
        assert.deepEqual(r.steps[0].tails, []);
        assert.ok(describeStep(r.steps[0]).includes('discard Energy'));
      });

      test("Team Rocket's Venture Bomb: coinFlip heads/tails damage", () => {
        const r = parseTrainerEffect("Flip a coin. If heads, put 2 damage counters on 1 of your opponent's Pokémon. If tails, put 2 damage counters on your Active Pokémon.");
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'coinFlip');
        assert.equal(r.steps[0].heads[0].type, 'damageCounters');
        assert.equal(r.steps[0].heads[0].count, 2);
        assert.equal(r.steps[0].tails[0].type, 'damageCounters');
        assert.equal(r.steps[0].tails[0].target, 'your Active Pokémon');
        assert.ok(describeStep(r.steps[0]).includes('heads'));
        assert.ok(describeStep(r.steps[0]).includes('tails'));
      });

      test('Hole-Digging Shovel: millSelf discard top 2', () => {
        const r = parseTrainerEffect('Discard the top 2 cards of your deck.');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'millSelf');
        assert.equal(r.steps[0].count, 2);
        assert.ok(describeStep(r.steps[0]).includes('top 2'));
      });

      test('Regression: Eri is not shadowed by variableDraw (Emma)', () => {
        const eri = parseTrainerEffect('Your opponent reveals their hand, and you discard up to 2 Item cards you find there.');
        assert.equal(eri.steps[0].type, 'revealOpponentHandDiscard');
        const emma = parseTrainerEffect('Your opponent reveals their hand, and you draw a card for each Pokémon you find there.');
        assert.equal(emma.steps[0].type, 'variableDraw');
      });
    });

    describe('complex trainer families', () => {
      const FOSSIL_TEXT =
        "Play this card as if it were a 60-HP Basic {C} Pokémon. This card can't be affected by any Special Conditions and can't retreat.\n\nAt any time during your turn, you may discard this card from play.";

      test('Fossil items: fossilItem (8-card family)', () => {
        const r = parseTrainerEffect(FOSSIL_TEXT);
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'fossilItem');
        assert.equal(r.steps[0].hp, 60);
        assert.ok(describeStep(r.steps[0]).includes('60-HP'));
      });

      test("N's Plan: moveEnergyToActive count 2 (distinct from moveEnergy)", () => {
        const r = parseTrainerEffect('Move up to 2 Energy from your Benched Pokémon to your Active Pokémon.');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'moveEnergyToActive');
        assert.equal(r.steps[0].count, 2);
        assert.ok(describeStep(r.steps[0]).includes('Active'));
      });

      test('Philippe: attachMultipleFromDiscard typed Metal Energy', () => {
        const r = parseTrainerEffect('Attach up to 2 Basic {M} Energy cards from your discard pile to 1 of your {M} Pokémon.');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'attachMultipleFromDiscard');
        assert.equal(r.steps[0].count, 2);
        assert.equal(r.steps[0].energy, 'Basic {M} Energy');
        assert.equal(r.steps[0].target, '1 of your {M} Pokémon');
      });

      test('Scoop Up Cyclone: returnPokemonToHand keepAttached', () => {
        const r = parseTrainerEffect('Put 1 of your Pokémon and all attached cards into your hand.');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'returnPokemonToHand');
        assert.equal(r.steps[0].keepAttached, true);
        assert.ok(describeStep(r.steps[0]).includes('all attached cards'));
      });

      test("Professor Turo's Scenario: returnPokemonToHand discard attached", () => {
        const r = parseTrainerEffect('Put 1 of your Pokémon in play into your hand. (Discard all cards attached to that Pokémon.)');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'returnPokemonToHand');
        assert.equal(r.steps[0].keepAttached, false);
      });

      test("Ogre's Mask: swapWithDiscard Ogerpon ex", () => {
        const r = parseTrainerEffect('Choose a Pokémon ex in your discard pile that has "Ogerpon" in its name, and switch it with 1 of your Pokémon ex in play that has "Ogerpon" in its name. Any attached cards, damage counters, Special Conditions, turns in play, and any other effects remain on the new Pokémon.');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'swapWithDiscard');
        assert.equal(r.steps[0].filter, 'Pokémon ex (Ogerpon)');
      });

      test('Transformation Tome: swapWithDiscard Basic Pokémon', () => {
        const r = parseTrainerEffect('Choose a Basic Pokémon in your discard pile and switch it with 1 of your Basic Pokémon in play. Any attached cards, damage counters, Special Conditions, turns in play, and any other effects remain on the new Pokémon.');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'swapWithDiscard');
        assert.equal(r.steps[0].filter, 'Basic Pokémon');
      });

      test('Megaton Blower: massDiscardAttached', () => {
        const r = parseTrainerEffect("Discard all Pokémon Tools and Special Energy from all of your opponent's Pokémon, and discard a Stadium in play.");
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'massDiscardAttached');
        assert.ok(describeStep(r.steps[0]).includes('Stadium'));
      });

      test('Ruffian: discardToolAndSpecialEnergy', () => {
        const r = parseTrainerEffect("Discard a Pokémon Tool and a Special Energy from 1 of your opponent's Pokémon.");
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'discardToolAndSpecialEnergy');
      });

      test("Roxie's Performance: passive can't retreat", () => {
        const r = parseTrainerEffect("During your opponent's next turn, their Poisoned Pokémon can't retreat. (This includes newly Poisoned Pokémon.)");
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'passive');
        assert.ok(r.steps[0].detail.includes('Retreat restriction'));
      });

      test('Redeemable Ticket: reshufflePrizes', () => {
        const r = parseTrainerEffect('Count your Prize cards, shuffle them, and put them on the bottom of your deck. Then, take that many cards from the top of your deck and put them face down as your Prize cards.');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'reshufflePrizes');
      });

      test("Lillie's Pearl: passive fewer prize on KO", () => {
        const r = parseTrainerEffect("If the Lillie's Pokémon this card is attached to is Knocked Out by damage from an attack from your opponent's Pokémon, that player takes 1 fewer Prize card.");
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'passive');
        assert.ok(r.steps[0].detail.includes('Fewer Prize'));
      });

      test('Accompanying Flute: revealOpponentDeckBench', () => {
        const r = parseTrainerEffect("Reveal the top 5 cards of your opponent's deck. You may choose any number of Basic Pokémon you find there and put those Pokémon onto their Bench. Your opponent shuffles the other cards back into their deck.");
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'revealOpponentDeckBench');
        assert.equal(r.steps[0].count, 5);
      });

      test('Survival Brace: passive KO prevention', () => {
        const r = parseTrainerEffect("If the Pokémon this card is attached to has full HP and would be Knocked Out by damage from an attack from your opponent's Pokémon, it is not Knocked Out, and its remaining HP becomes 10. Then, discard this card.");
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'passive');
        assert.ok(r.steps[0].detail.includes('KO prevention'));
      });

      test('Core Memory: passive grant attack', () => {
        const r = parseTrainerEffect('The Mega Zygarde ex this card is attached to can use the attack on this card. (You still need the necessary Energy to use this attack.)');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'passive');
        assert.ok(r.steps[0].detail.includes('Grants an attack'));
      });

      test('Technical Machine: Fluorite: passive grant attack', () => {
        const r = parseTrainerEffect('The Pokémon this card is attached to can use the attack on this card. (You still need the necessary Energy to use this attack.) If this card is attached to 1 of your Pokémon, discard it at the end of your turn.');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'passive');
        assert.ok(r.steps[0].detail.includes('Grants an attack'));
      });

      test('Sparkling Crystal: passive cost reduction', () => {
        const r = parseTrainerEffect('When the Tera Pokémon this card is attached to uses an attack, that attack costs 1 Energy less. (The Energy can be of any type.)');
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'passive');
        assert.ok(r.steps[0].detail.includes('cost reduction'));
      });

      test("Team Rocket's Bother-Bot: opponentPrizeHandSwap", () => {
        const r = parseTrainerEffect("Turn 1 of your opponent's face-down Prize cards face up and choose a random card from your opponent's hand. Your opponent reveals that card. You may have your opponent switch those cards. (That Prize card remains face up for the rest of the game.)");
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'opponentPrizeHandSwap');
        assert.ok(describeStep(r.steps[0]).includes('face up'));
      });

      test('describeStep: complex trainer families produce non-empty guidance', () => {
        assert.ok(describeStep({ type: 'fossilItem', hp: 60 }).length > 0);
        assert.ok(describeStep({ type: 'moveEnergyToActive', count: 2 }).includes('2'));
        assert.ok(describeStep({ type: 'attachMultipleFromDiscard', count: 2, energy: 'Basic {M} Energy', target: '1 of your {M} Pokémon' }).includes('{M}'));
        assert.ok(describeStep({ type: 'returnPokemonToHand', keepAttached: true }).includes('attached'));
        assert.ok(describeStep({ type: 'swapWithDiscard', filter: 'Basic Pokémon' }).includes('Basic'));
        assert.ok(describeStep({ type: 'massDiscardAttached' }).includes('Tools'));
        assert.ok(describeStep({ type: 'discardToolAndSpecialEnergy' }).includes('Tool'));
        assert.ok(describeStep({ type: 'reshufflePrizes' }).includes('Prize'));
        assert.ok(describeStep({ type: 'revealOpponentDeckBench', count: 5 }).includes('5'));
        assert.ok(describeStep({ type: 'opponentPrizeHandSwap' }).includes('Prize'));
      });
    });
    