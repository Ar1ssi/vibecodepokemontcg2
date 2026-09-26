import test, { describe } from 'node:test';
    import assert from 'node:assert/strict';
    
    const { parseTrainerEffect, describeStep } = await import('../trainer-effects.mjs');
    const { energyMatchesSearchWhat } = await import('../energy-effects.mjs');
    const { matchesSearch, filterSearchMatches, isPokemonCard } = await import('../search-match.mjs');
    
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

    test('Tarragon: combination recursion keeps the count and both type filters', () => {
      const r = parseTrainerEffect(
        'Put up to 4 in any combination of {F} Pokémon and Basic {F} Energy cards from your discard pile into your hand.'
      );
      assert.equal(r.steps[0].type, 'recursion');
      assert.equal(r.steps[0].count, 4);
      assert.equal(r.steps[0].what, 'Fighting Pokémon or Basic {F} Energy');
      // The filter must actually match a Fighting Pokémon / Basic Fighting Energy
      // and reject a Fire pair, not fall back to "every card".
      const fightingMon = { name: 'Machop', supertype: 'Pokémon', hp: 70, types: ['Fighting'] };
      const fightingEnergy = { name: 'Basic Fighting Energy', type: 'Energy', subtypes: ['Basic'], types: ['Fighting'] };
      const fireMon = { name: 'Charmander', supertype: 'Pokémon', hp: 60, types: ['Fire'] };
      const fireEnergy = { name: 'Basic Fire Energy', type: 'Energy', subtypes: ['Basic'], types: ['Fire'] };
      assert.equal(matchesSearch(fightingMon, r.steps[0].what), true);
      assert.equal(matchesSearch(fightingEnergy, r.steps[0].what), true);
      assert.equal(matchesSearch(fireMon, r.steps[0].what), false);
      assert.equal(matchesSearch(fireEnergy, r.steps[0].what), false);
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

    test('Level Ball: search for Pokémon with 90 HP or less', () => {
      const r = parseTrainerEffect("Search your deck for a Pokémon with 90 HP or less, reveal it, and put it into your hand. Then, shuffle your deck.");
      assert.equal(r.steps[0].what, 'Pokémon ≤90 HP');
      assert.equal(r.steps[0].count, 1);
      assert.equal(r.steps[0].destination, 'hand');
    });

    test('Evolution Incense: search for Evolution Pokémon', () => {
      const r = parseTrainerEffect("Search your deck for an Evolution Pokémon, reveal it, and put it into your hand. Then, shuffle your deck.");
      assert.equal(r.steps[0].what, 'Evolution Pokémon');
      assert.equal(r.steps[0].count, 1);
      assert.equal(r.steps[0].destination, 'hand');
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

    test('Guzma (corpus BUS SV84): gust, then switchOwn', () => {
      const r = parseTrainerEffect(
        'Switch 1 of your opponent’s Benched Pokémon with their Active Pokémon. If you do, switch your Active Pokémon with 1 of your Benched Pokémon.'
      );
      assert.deepEqual(
        r.steps.map((s) => s.type),
        ['switchOpponent', 'switchOwn']
      );
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
      assert.deepEqual(r.steps[0].target, { kind: 'fixed', n: 6 });
    });

    test("Iris's Fighting Spirit: 'discard another card' cost + drawUntil", () => {
      const r = parseTrainerEffect("You can use this card only if you discard another card from your hand. Draw cards until you have 6 cards in your hand.");
      assert.equal(r.recognizable, true);
      assert.ok(r.steps.some((s) => s.type === 'discardCost' && s.count === 1));
      assert.ok(r.steps.some((s) => s.type === 'drawUntil' && s.target?.n === 6));
    });

    test("Team Rocket's Ariana: draw until 5 (8 instead for Team Rocket's Pokémon)", () => {
      const r = parseTrainerEffect("Draw cards until you have 5 cards in your hand. If all of your Pokémon in play are Team Rocket’s Pokémon, draw cards until you have 8 cards in your hand instead.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps[0].type, 'drawUntil');
      assert.deepEqual(r.steps[0].target, { kind: 'fixed', n: 5 });
      assert.deepEqual(r.steps[0].bonusTarget, { kind: 'fixed', n: 8 });
      assert.equal(r.steps[0].bonusWhen, 'teamRocketInPlay');
    });

    test('Lillie / Grusha / Cynthia: first-turn, no-Energy and KO-window bonus targets', () => {
      const lillie = parseTrainerEffect("Draw cards until you have 6 cards in your hand. If it's your first turn, draw cards until you have 8 cards in your hand.");
      assert.deepEqual(lillie.steps[0].bonusTarget, { kind: 'fixed', n: 8 });
      assert.equal(lillie.steps[0].bonusWhen, 'firstTurn');

      const grusha = parseTrainerEffect('Draw cards until you have 5 cards in your hand. If none of your Pokémon have any Energy attached, draw cards until you have 7 cards in your hand instead.');
      assert.deepEqual(grusha.steps[0].bonusTarget, { kind: 'fixed', n: 7 });
      assert.equal(grusha.steps[0].bonusWhen, 'noEnergyAttached');

      const cynthia = parseTrainerEffect("Draw cards until you have 5 cards in your hand. If any of your Pokémon were Knocked Out during your opponent's last turn, draw cards until you have 8 cards in your hand instead.");
      assert.deepEqual(cynthia.steps[0].bonusTarget, { kind: 'fixed', n: 8 });
      assert.equal(cynthia.steps[0].bonusWhen, 'koedLastTurn');
    });

    test('Zisu and Battle Reporter: opponent-hand targets', () => {
      const zisu = parseTrainerEffect('Draw cards until you have 1 more card in your hand than your opponent.');
      assert.deepEqual(zisu.steps[0].target, { kind: 'opponentHandPlus', n: 1 });

      const reporter = parseTrainerEffect('Draw cards until you have the same number of cards in your hand as your opponent.');
      assert.deepEqual(reporter.steps[0].target, { kind: 'opponentHand' });
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
      assert.ok(r.steps.some((s) => s.type === 'drawUntil' && s.target?.n === 5));
    });

    test('Mesagoza-style stadium draw-until is passive, not a one-shot drawUntil', () => {
      const r = parseTrainerEffect(
        "This Stadium stays in play when you play it. Once during each player's turn, that player may draw cards until they have 3 cards in their hand."
      );
      assert.equal(r.recognizable, true);
      assert.equal(r.steps.length, 1);
      assert.equal(r.steps[0].type, 'passive');
    });

    test("Team Rocket's Factory: stadium 'once during each player's turn' is passive, NOT a bare draw", () => {
      const r = parseTrainerEffect("Once during each player’s turn, if they played a Supporter card that has “Team Rocket” in its name from their hand this turn, they may draw 2 cards.");
      assert.equal(r.recognizable, true);
      assert.equal(r.steps.length, 1);
      assert.equal(r.steps[0].type, 'passive');
    });

    test('Grand Tree: stadium search-evolve is passive, not a one-shot searchDeck', () => {
      const r = parseTrainerEffect(
        "Once during each player's turn, that player may search their deck for a Stage 1 Pokémon that evolves from 1 of their Pokémon in play and put it onto that Pokémon to evolve it. If that Pokémon evolved during this turn, that player may search their deck for a Stage 2 Pokémon that evolves from that Pokémon and put it onto that Pokémon to evolve it. Then, that player shuffles their deck."
      );
      assert.equal(r.recognizable, true);
      assert.equal(r.steps.length, 1);
      assert.equal(r.steps[0].type, 'passive');
      assert.ok(!r.steps.some((s) => s.type === 'searchDeck'));
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

    test('shuffleDeckAfterSearch: shuffles silently and announces in chat', async () => {
      const { shuffleDeckAfterSearch } = await import('../search-reveal.mjs');
      const messages = [];
      let shuffled = false;
      const append = (_user, msg) => { messages.push(msg); };
      const shuffleZone = () => { shuffled = true; };
      shuffleDeckAfterSearch('self', append, shuffleZone, { sourceName: 'Ultra Ball' });
      assert.equal(shuffled, true);
      assert.match(messages[0], /Ultra Ball — deck shuffled/);
    });

    test('shuffleDeckAfterSearch: message null shuffles without duplicate chat line', async () => {
      const { shuffleDeckAfterSearch } = await import('../search-reveal.mjs');
      const messages = [];
      shuffleDeckAfterSearch('self', (_u, m) => messages.push(m), () => {}, { message: null });
      assert.equal(messages.length, 0);
    });

    test('Firebreather search filter: typed {R} matches Fire only', () => {
      const fire = { name: 'Basic Fire Energy', type: 'Energy', subtypes: ['Basic'], types: ['Fire'] };
      const water = { name: 'Basic Water Energy', type: 'Energy', subtypes: ['Basic'], types: ['Water'] };
      assert.equal(energyMatchesSearchWhat(fire, 'Basic {R} Energy'), true);
      assert.equal(energyMatchesSearchWhat(water, 'Basic {R} Energy'), false);
      assert.equal(energyMatchesSearchWhat(fire, 'Basic Energy'), true);
      assert.equal(energyMatchesSearchWhat(water, 'Basic Energy'), true);
    });

    test('Buddy-Buddy Poffin filter: Basic ≤70 HP includes stubs without hp', () => {
      const stub = { name: 'Pikachu', type: 'Pokémon', stage: 'Basic' };
      const overCap = { name: 'Snorlax', type: 'Pokémon', stage: 'Basic', hp: 90 };
      const underCap = { name: 'Clefairy', type: 'Pokémon', stage: 'Basic', hp: 60 };
      const what = 'Basic Pokémon ≤70 HP';
      assert.equal(matchesSearch(stub, what), true);
      assert.equal(matchesSearch(underCap, what), true);
      assert.equal(matchesSearch(overCap, what), false);
      const pool = filterSearchMatches([stub, overCap, underCap], what);
      assert.deepEqual(pool.map((c) => c.name), ['Pikachu', 'Clefairy']);
    });

    test('Buddy-Buddy Poffin filter: excludes Stage 1 and Stage 2 Pokémon even with low HP', () => {
      const basicUnderCap = { name: 'Charmander', type: 'Pokémon', stage: 'Basic', hp: 70 };
      const stage1UnderCap = { name: 'Magikarp-evo', type: 'Pokémon', stage: 'Stage 1', hp: 60 };
      const stage2 = { name: 'Charizard ex', type: 'Pokémon', stage: 'Stage 2', hp: 330 };
      const what = 'Basic Pokémon ≤70 HP';
      assert.equal(matchesSearch(basicUnderCap, what), true);
      assert.equal(matchesSearch(stage1UnderCap, what), false);
      assert.equal(matchesSearch(stage2, what), false);
    });

    test('Level Ball filter: includes Evolutions and Basics ≤90 HP, excludes >90 HP', () => {
      const basicUnderCap = { name: 'Clefairy', type: 'Pokémon', stage: 'Basic', hp: 60 };
      const evoUnderCap = { name: 'Pidgeotto', type: 'Pokémon', stage: 'Stage 1', hp: 80 };
      const overCap = { name: 'Snorlax', type: 'Pokémon', stage: 'Basic', hp: 150 };
      const evoOverCap = { name: 'Charizard ex', type: 'Pokémon', stage: 'Stage 2', hp: 330 };
      const what = 'Pokémon ≤90 HP';
      assert.equal(matchesSearch(basicUnderCap, what), true);
      assert.equal(matchesSearch(evoUnderCap, what), true);
      assert.equal(matchesSearch(overCap, what), false);
      assert.equal(matchesSearch(evoOverCap, what), false);
      const pool = filterSearchMatches([basicUnderCap, evoUnderCap, overCap, evoOverCap], what);
      assert.deepEqual(pool.map((c) => c.name), ['Clefairy', 'Pidgeotto']);
    });

    test('Evolution Pokémon filter: includes Stage 1 and Stage 2, excludes Basic', () => {
      const basic = { name: 'Pidgey', type: 'Pokémon', stage: 'Basic', hp: 60 };
      const stage1 = { name: 'Pidgeotto', type: 'Pokémon', stage: 'Stage 1', hp: 80 };
      const stage2 = { name: 'Pidgeot', type: 'Pokémon', stage: 'Stage 2', hp: 130 };
      const what = 'Evolution Pokémon';
      assert.equal(matchesSearch(basic, what), false);
      assert.equal(matchesSearch(stage1, what), true);
      assert.equal(matchesSearch(stage2, what), true);
      const pool = filterSearchMatches([basic, stage1, stage2], what);
      assert.deepEqual(pool.map((c) => c.name), ['Pidgeotto', 'Pidgeot']);
    });

    test('Ultra Ball filter: any Pokémon in deck (type on image fallback)', () => {
      const fromImageType = { name: 'Pikachu', image: { type: 'Pokémon' } };
      const energy = { name: 'Basic Fire Energy', type: 'Energy' };
      assert.equal(isPokemonCard(fromImageType), true);
      assert.equal(matchesSearch(fromImageType, 'Pokémon'), true);
      assert.equal(matchesSearch(energy, 'Pokémon'), false);
      const pool = filterSearchMatches([fromImageType, energy], 'Pokémon');
      assert.deepEqual(pool.map((c) => c.name), ['Pikachu']);
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

    test("Poké Pad: search deck for a Pokémon that doesn't have a Rule Box", () => {
      const r = parseTrainerEffect("Search your deck for a Pokémon that doesn't have a Rule Box, reveal it, and put it into your hand. Then, shuffle your deck. (Pokémon ex, Pokémon V, etc. have Rule Boxes.)");
      assert.equal(r.recognizable, true);
      const search = r.steps.find((s) => s.type === 'searchDeck');
      assert.ok(search);
      assert.equal(search.what, 'Pokémon without a Rule Box');
      assert.equal(search.count, 1);
      assert.equal(search.destination, 'hand');
      assert.equal(search.reveal, true);
    });

    test("Poké Pad filter: matchesSearch only matches Pokémon without a Rule Box", () => {
      const standardBasic = { name: 'Pikachu', type: 'Pokémon', hp: 70 };
      const standardStage1 = { name: 'Bibarel', type: 'Pokémon', stage: 'Stage 1', hp: 120 };
      const pokemonEx = { name: 'Charizard ex', type: 'Pokémon', hp: 330 };
      const pokemonV = { name: 'Raikou V', type: 'Pokémon', hp: 200 };
      const pokemonVmax = { name: 'Mew VMAX', type: 'Pokémon', hp: 310 };
      const pokemonMega = { name: 'Mega Lucario ex', type: 'Pokémon', hp: 220 };
      const trainer = { name: 'Nest Ball', type: 'Trainer' };
      const energy = { name: 'Basic Fire Energy', type: 'Energy' };

      const what = 'Pokémon without a Rule Box';
      assert.equal(matchesSearch(standardBasic, what), true);
      assert.equal(matchesSearch(standardStage1, what), true);
      assert.equal(matchesSearch(pokemonEx, what), false);
      assert.equal(matchesSearch(pokemonV, what), false);
      assert.equal(matchesSearch(pokemonVmax, what), false);
      assert.equal(matchesSearch(pokemonMega, what), false);
      assert.equal(matchesSearch(trainer, what), false);
      assert.equal(matchesSearch(energy, what), false);

      const pool = filterSearchMatches(
        [standardBasic, pokemonEx, standardStage1, pokemonV, pokemonVmax, pokemonMega, trainer, energy],
        what
      );
      assert.deepEqual(pool.map((c) => c.name), ['Pikachu', 'Bibarel']);
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

      // Regression: Dawn previously produced a single 3-pick step whose combined
      // "Basic/Stage1/Stage2 Pokémon" filter let the player take 3 Basics — the
      // real card requires one search per named stage, one card each.
      test('Dawn: three separate single-card searches, one per stage', () => {
        const r = parseTrainerEffect(
          'Search your deck for a Basic Pokémon, a Stage 1 Pokémon, and a Stage 2 Pokémon, reveal them, and put them into your hand. Then, shuffle your deck.'
        );
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'searchDeckSequence');
        assert.equal(r.steps[0].stages.length, 3);
        assert.equal(r.steps[0].stages[0].what, 'Basic Pokémon');
        assert.equal(r.steps[0].stages[0].count, 1);
        assert.equal(r.steps[0].stages[1].what, 'Stage 1 Pokémon');
        assert.equal(r.steps[0].stages[1].count, 1);
        assert.equal(r.steps[0].stages[2].what, 'Stage 2 Pokémon');
        assert.equal(r.steps[0].stages[2].count, 1);
      });

      test('Dawn: matchesSearch filters each stage exactly (no cross-stage matches)', () => {
        const basic = { hp: 60, stage: 'Basic', name: 'Turtwig' };
        const stage1 = { hp: 90, stage: 'Stage 1', name: 'Grotle' };
        const stage2 = { hp: 140, stage: 'Stage 2', name: 'Torterra' };
        assert.equal(matchesSearch(basic, 'Basic Pokémon'), true);
        assert.equal(matchesSearch(stage1, 'Basic Pokémon'), false);
        assert.equal(matchesSearch(stage2, 'Basic Pokémon'), false);
        assert.equal(matchesSearch(stage1, 'Stage 1 Pokémon'), true);
        assert.equal(matchesSearch(basic, 'Stage 1 Pokémon'), false);
        assert.equal(matchesSearch(stage2, 'Stage 1 Pokémon'), false);
        assert.equal(matchesSearch(stage2, 'Stage 2 Pokémon'), true);
        assert.equal(matchesSearch(basic, 'Stage 2 Pokémon'), false);
        assert.equal(matchesSearch(stage1, 'Stage 2 Pokémon'), false);
      });

      // Regression: Dive Ball's "a Water Pokémon" fell through to the generic
      // 'Pokémon' filter, so its picker offered every Pokémon in the deck.
      test('Dive Ball: search target keeps the Water type', () => {
        const r = parseTrainerEffect(
          'Search your deck for a Water Pokémon, reveal it, and put it into your hand. Then, shuffle your deck.'
        );
        assert.equal(r.recognizable, true);
        assert.equal(r.steps[0].type, 'searchDeck');
        assert.equal(r.steps[0].what, 'Water Pokémon');
        assert.equal(r.steps[0].count, 1);
        assert.equal(r.steps[0].destination, 'hand');
        assert.equal(r.steps[0].reveal, true);
      });

      test('Dive Ball: matchesSearch only matches Water Pokémon', () => {
        const water = { hp: 70, types: ['Water'], name: 'Squirtle' };
        const fire = { hp: 70, types: ['Fire'], name: 'Charmander' };
        const trainer = { hp: null, supertype: 'Trainer', name: 'Dive Ball' };
        assert.equal(matchesSearch(water, 'Water Pokémon'), true);
        assert.equal(matchesSearch(fire, 'Water Pokémon'), false);
        assert.equal(matchesSearch(trainer, 'Water Pokémon'), false);
        // The untyped fallback is unchanged: a generic Pokémon search still sees all types.
        assert.equal(matchesSearch(water, 'Pokémon'), true);
        assert.equal(matchesSearch(fire, 'Pokémon'), true);
      });

      test('Basic <type> Pokémon search filters both stage and type', () => {
        const r = parseTrainerEffect(
          'Search your deck for up to 2 Basic Psychic Pokémon and put them onto your Bench. Then, shuffle your deck.'
        );
        assert.equal(r.steps[0].what, 'Basic Psychic Pokémon');
        assert.equal(r.steps[0].count, 2);
        assert.equal(r.steps[0].destination, 'bench');
        const ralts = { hp: 60, stage: 'Basic', types: ['Psychic'], name: 'Ralts' };
        const squirtle = { hp: 60, stage: 'Basic', types: ['Water'], name: 'Squirtle' };
        const kirlia = { hp: 80, stage: 'Stage 1', types: ['Psychic'], name: 'Kirlia' };
        assert.equal(matchesSearch(ralts, 'Basic Psychic Pokémon'), true);
        assert.equal(matchesSearch(squirtle, 'Basic Psychic Pokémon'), false);
        assert.equal(matchesSearch(kirlia, 'Basic Psychic Pokémon'), false);
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

      test('fossil Items: named (bench) pick from the look-at window (I132)', () => {
        const fossils = [
          ['Claw Fossil Anorith', 'an Anorith'],
          ['Armor Fossil Shieldon', 'a Shieldon'],
          ['Old Amber Aerodactyl', 'an Aerodactyl'],
          ['Helix Fossil Omanyte', 'an Omanyte'],
          ['Dome Fossil Kabuto', 'a Kabuto'],
          ['Sail Fossil', 'an Amaura'],
          ['Jaw Fossil', 'a Tyrunt'],
          ['Root Fossil Lileep', 'a Lileep'],
          ['Plume Fossil', 'an Archen'],
          ['Cover Fossil', 'a Tirtouga'],
        ];
        for (const [fossil, clause] of fossils) {
          const target = clause.replace(/^an? /, '');
          const r = parseTrainerEffect(
            `Look at the bottom 7 cards of your deck. You may reveal ${clause} you find there and put it onto your Bench. Shuffle the other cards back into your deck.`
          );
          assert.equal(r.recognizable, true, fossil);
          assert.equal(r.steps[0].type, 'lookAtBottom', fossil);
          assert.equal(r.steps[0].pick, `${target} (bench)`, fossil);
          assert.equal(r.steps[0].destination, 'bench', fossil);
        }
      });

      test("Grimsley's Move: typed (bench) pick stays Darkness (I132)", () => {
        const r = parseTrainerEffect(
          "Look at the top 7 cards of your deck and put a {D} Pokémon you find there onto your Bench. Shuffle the other cards and put them on the bottom of your deck. You can't use this card during your first turn."
        );
        assert.equal(r.steps[0].type, 'lookAtTop');
        assert.equal(r.steps[0].pick, 'Darkness Pokémon (bench)');
        assert.equal(r.steps[0].destination, 'bench');
        assert.equal(r.steps[0].restToBottom, true);
      });

      test('bench look-at: generic and typed forms use the (bench) vocabulary (I132)', () => {
        const generic = parseTrainerEffect(
          'Look at the top 5 cards of your deck. You may put a Pokémon you find there onto your Bench. Shuffle the other cards back into your deck.'
        );
        assert.equal(generic.steps[0].pick, 'Pokémon (bench)');
        const typed = parseTrainerEffect(
          'Look at the top 5 cards of your deck and put a {F} Pokémon you find there onto your Bench. Shuffle the other cards back into your deck.'
        );
        assert.equal(typed.steps[0].pick, 'Fighting Pokémon (bench)');
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
    
describe('unconditional draw precedence over passive fallback', () => {
  test("Aroma Lady: leading draw 2 executes, recovery stays passive", () => {
    const r = parseTrainerEffect("Draw 2 cards. If you do, your Active Pokemon recovers from all Special Conditions.");
    assert.equal(r.recognizable, true);
    assert.equal(r.steps[0].type, 'draw');
    assert.equal(r.steps[0].count, 2);
    assert.ok(r.steps.some((s) => s.type === 'passive'));
  });

  test("Buck's Training: leading draw 2 not swallowed by 'more damage'", () => {
    const r = parseTrainerEffect("Draw 2 cards. As long as Buck's Training is next to your Active Pokemon, each of your Active Pokemon's attacks does 10 more damage to the Active Pokemon (before applying Weakness and Resistance).");
    assert.equal(r.recognizable, true);
    assert.equal(r.steps[0].type, 'draw');
    assert.equal(r.steps[0].count, 2);
  });

  test("Professor Kukui: leading draw 2 not swallowed by 'more damage'", () => {
    const r = parseTrainerEffect("Draw 2 cards. During this turn, your Pokemon's attacks do 20 more damage to your opponent's Active Pokemon (before applying Weakness and Resistance).");
    assert.equal(r.recognizable, true);
    assert.equal(r.steps[0].type, 'draw');
    assert.equal(r.steps[0].count, 2);
  });

  test("Emcee's Hype: leading draw 2 + conditional bonus announced", () => {
    const r = parseTrainerEffect("Draw 2 cards. If your opponent has 3 or fewer Prize cards remaining, draw 2 more cards.");
    assert.equal(r.recognizable, true);
    assert.equal(r.steps[0].type, 'draw');
    assert.equal(r.steps[0].count, 2);
    const passive = r.steps.find((s) => s.type === 'passive');
    assert.ok(passive);
    assert.ok(passive.detail.toLowerCase().includes('bonus draw'));
  });

  test("Regression: a leading-draw stadium is still passive, not a one-shot draw", () => {
    const r = parseTrainerEffect("Once during each player's turn, that player may draw cards until they have 3 cards in their hand.");
    assert.equal(r.steps.length, 1);
    assert.equal(r.steps[0].type, 'passive');
  });
});

describe('legacy / unrecognizable template coverage', () => {
  test('Spirit Link: turn-does-not-end is a passive', () => {
    const r = parseTrainerEffect("Your turn does not end if the Pokemon this card is attached to becomes M Aggron-EX.");
    assert.equal(r.recognizable, true);
    assert.equal(r.steps[0].type, 'passive');
    assert.ok(r.steps[0].detail.includes('Spirit Link'));
  });

  test('tool damage reduction wording is passive', () => {
    const r = parseTrainerEffect("Any damage done to the Pokemon this card is attached to by attacks from your opponent's Pokemon is reduced by 40 (after applying Weakness and Resistance).");
    assert.equal(r.recognizable, true);
    assert.equal(r.steps[0].type, 'passive');
  });

  test('Metal Saucer: attach {M} Energy from discard (no "basic" wording)', () => {
    const r = parseTrainerEffect("Attach a {M} Energy card from your discard pile to 1 of your Benched {M} Pokémon.");
    assert.equal(r.recognizable, true);
    assert.equal(r.steps[0].type, 'attachFromDiscard');
    assert.equal(r.steps[0].energy, 'Basic {M} Energy');
    assert.equal(r.steps[0].target, '1 of your Benched {M} Pokémon');
  });

  test('Blacksmith: attach 2 {R} Energy from discard (multi)', () => {
    const r = parseTrainerEffect("Attach 2 {R} Energy cards from your discard pile to 1 of your {R} Pokemon.");
    assert.equal(r.recognizable, true);
    assert.equal(r.steps[0].type, 'attachMultipleFromDiscard');
    assert.equal(r.steps[0].count, 2);
    assert.equal(r.steps[0].energy, 'Basic {R} Energy');
  });

  test('VS Seeker: legacy "search your discard pile … put it into your hand" is recursion', () => {
    const r = parseTrainerEffect("Search your discard pile for a Supporter card, show it to your opponent, and put it into your hand.");
    assert.equal(r.recognizable, true);
    assert.equal(r.steps[0].type, 'recursion');
    assert.equal(r.steps[0].what, 'Supporter');
    assert.equal(r.steps[0].from, 'discard');
  });

  test('Junk Arm: discard cost + legacy recursion for a Trainer card', () => {
    const r = parseTrainerEffect("Discard 2 cards from your hand. Search your discard pile for a Trainer card, show it to your opponent, and put it into your hand.");
    assert.equal(r.recognizable, true);
    assert.equal(r.steps[0].type, 'discardCost');
    assert.equal(r.steps[0].count, 2);
    assert.ok(r.steps.some((s) => s.type === 'recursion' && s.what === 'Trainer'));
  });

  test('Energy Returner: legacy "search your discard pile … shuffle into deck"', () => {
    const r = parseTrainerEffect("Search your discard pile for 4 basic Energy cards, show them to your opponent, and shuffle them into your deck.");
    assert.equal(r.recognizable, true);
    assert.equal(r.steps[0].type, 'shuffleFromDiscard');
    assert.equal(r.steps[0].what, 'Basic Energy');
    assert.equal(r.steps[0].count, 4);
  });
});

describe('coin-flip legacy variants', () => {
  test('Crushing Hammer legacy: heads discards opponent Energy (attached wording)', () => {
    const r = parseTrainerEffect("Flip a coin. If heads, discard an Energy attached to 1 of your opponent's Pokemon.");
    assert.equal(r.recognizable, true);
    assert.equal(r.steps[0].type, 'coinFlip');
    assert.equal(r.steps[0].heads[0].type, 'discardEnergyFromOpponent');
  });

  test("Pokemon Reversal: heads switches the opponent's Bench", () => {
    const r = parseTrainerEffect("Flip a coin. If heads, choose 1 of your opponent's Benched Pokemon, and switch it with your opponent's Active Pokemon.");
    assert.equal(r.steps[0].type, 'coinFlip');
    assert.equal(r.steps[0].heads[0].type, 'switchOpponent');
  });

  test('Super Scoop Up: heads returns your Pokemon to hand', () => {
    const r = parseTrainerEffect("Flip a coin. If heads, return 1 of your Pokemon and all cards attached to it to your hand.");
    assert.equal(r.steps[0].type, 'coinFlip');
    assert.equal(r.steps[0].heads[0].type, 'returnPokemonToHand');
  });

  test('Sleep!: heads puts the Defending Pokemon to Sleep', () => {
    const r = parseTrainerEffect("Flip a coin. If heads, the Defending Pokemon is now Asleep.");
    assert.equal(r.steps[0].type, 'coinFlip');
    assert.equal(r.steps[0].heads[0].type, 'applyStatus');
    assert.deepEqual(r.steps[0].heads[0].conditions, ['Asleep']);
  });

  test('Venture Bomb: damage counters heads/tails (own side wording)', () => {
    const r = parseTrainerEffect("Flip a coin. If heads, put 1 damage counter on 1 of your opponent's Pokemon. If tails, put 1 damage counter on 1 of your Pokemon.");
    assert.equal(r.steps[0].type, 'coinFlip');
    assert.equal(r.steps[0].heads[0].type, 'damageCounters');
    assert.equal(r.steps[0].tails[0].type, 'damageCounters');
  });
});

describe('recurring-wording coverage (batch 2)', () => {
  test('Switch (Item): "switch 1 of your Active" is switchOwn', () => {
    const r = parseTrainerEffect('Switch 1 of your Active Pokémon with 1 of your Benched Pokémon.');
    assert.equal(r.recognizable, true);
    assert.equal(r.steps[0].type, 'switchOwn');
  });

  test('Pokémon Circulator / Repel: opponent switches their Active → switchOpponentOut', () => {
    const r = parseTrainerEffect('Your opponent switches his or her Active Pokémon with 1 of his or her Benched Pokémon.');
    assert.equal(r.steps[0].type, 'switchOpponentOut');
  });

  test('Team Flare Grunt: discard Energy attached to opponent Active', () => {
    const r = parseTrainerEffect("Discard an Energy attached to your opponent's Active Pokémon.");
    assert.equal(r.steps[0].type, 'discardEnergyFromOpponent');
    assert.equal(r.steps[0].energy, 'any Energy');
  });

  test('Enhanced Hammer: discard Special Energy attached to opponent Pokémon', () => {
    const r = parseTrainerEffect("Discard a Special Energy attached to 1 of your opponent's Pokémon.");
    assert.equal(r.steps[0].type, 'discardEnergyFromOpponent');
    assert.equal(r.steps[0].energy, 'Special Energy');
  });

  test('Plumeria: discard-2 cost + discard opponent Energy', () => {
    const r = parseTrainerEffect("Discard 2 cards from your hand. If you do, discard an Energy attached to 1 of your opponent's Pokémon.");
    assert.equal(r.steps[0].type, 'discardCost');
    assert.equal(r.steps[0].count, 2);
    assert.equal(r.steps[1].type, 'discardEnergyFromOpponent');
  });

  test('Poppy: move Energy between own Pokémon → moveEnergy', () => {
    const r = parseTrainerEffect('Move up to 2 Energy from 1 of your Pokémon to another of your Pokémon.');
    assert.equal(r.steps[0].type, 'moveEnergy');
  });

  test('Multi Switch: Bench → Active → moveEnergyToActive count 1', () => {
    const r = parseTrainerEffect('Move an Energy from 1 of your Benched Pokémon to your Active Pokémon.');
    assert.equal(r.steps[0].type, 'moveEnergyToActive');
    assert.equal(r.steps[0].count, 1);
  });

  test('Red Card: opponent shuffles hand into deck, draws 4', () => {
    const r = parseTrainerEffect('Your opponent shuffles his or her hand into his or her deck and draws 4 cards.');
    assert.equal(r.steps[0].type, 'opponentShuffleHandDraw');
    assert.equal(r.steps[0].count, 4);
  });

  test('Imposter Professor Oak: opponent shuffles hand, draws 7', () => {
    const r = parseTrainerEffect('Your opponent shuffles his or her hand into his or her deck, then draws 7 cards.');
    assert.equal(r.steps[0].type, 'opponentShuffleHandDraw');
    assert.equal(r.steps[0].count, 7);
  });

  test('Xerosic: discard a Tool or Special Energy from any Pokémon', () => {
    const r = parseTrainerEffect('Choose a Pokémon Tool or Special Energy card attached to a Pokémon in play (yours or your opponent’s) and discard it.');
    assert.equal(r.steps[0].type, 'discardFromOpponent');
  });

  test('Potion: remove 2 damage counters → healAmount', () => {
    const r = parseTrainerEffect('Remove 2 damage counters from 1 of your Pokémon (remove 1 damage counter if that Pokémon has only 1).');
    assert.equal(r.steps[0].type, 'healAmount');
    assert.equal(r.steps[0].amount, 2);
  });

  test("Bertha's Warmth: remove 5 damage counters from 1 of your Pokémon SP", () => {
    const r = parseTrainerEffect('Remove 5 damage counters from 1 of your Pokémon SP.');
    assert.equal(r.steps[0].type, 'healAmount');
    assert.equal(r.steps[0].amount, 5);
  });

  test('Reactive tools: "damaged by an opponent / Knocked Out by damage" are passive', () => {
    const helmet = parseTrainerEffect("If the Pokémon this card is attached to is your Active Pokémon and is damaged by an opponent's attack (even if that Pokémon is Knocked Out), put 2 damage counters on the Attacking Pokémon.");
    assert.equal(helmet.recognizable, true);
    assert.equal(helmet.steps[0].type, 'passive');
    const punch = parseTrainerEffect("If the Pokémon this card is attached to is Knocked Out by damage from an attack from your opponent's Pokémon, put 4 damage counters on the Attacking Pokémon.");
    assert.equal(punch.steps[0].type, 'passive');
    assert.ok(punch.steps[0].detail.includes('Reactive tool damage'));
  });
});

describe('recurring-wording coverage (batch 3)', () => {
  test('Rare Candy: Stage 1-or-2 evolution wording → evolveStage2', () => {
    const r = parseTrainerEffect('Choose 1 of your Basic Pokémon in play. If you have a Stage 1 or Stage 2 card that evolves from that Pokémon in your hand, put that card on the Basic Pokémon. (This counts as evolving that Pokémon.)');
    assert.equal(r.recognizable, true);
    assert.equal(r.steps[0].type, 'evolveStage2');
    assert.equal(r.steps[0].skipStage, 1);
  });

  test('Pokémon Breeder: matching Basic wording → evolveStage2', () => {
    const r = parseTrainerEffect('Put a Stage 2 Evolution card from your hand on the matching Basic Pokémon. You can play this card only when you would be allowed to evolve that Pokémon anyway.');
    assert.equal(r.steps[0].type, 'evolveStage2');
  });

  test('Startling Megaphone: discard all Tools from each opponent Pokémon', () => {
    const r = parseTrainerEffect("Discard all Pokémon Tool cards attached to each of your opponent's Pokémon.");
    assert.equal(r.steps[0].type, 'discardTools');
    assert.equal(r.steps[0].count, 8);
  });

  test("Cheren's Care: typed put-into-hand → returnPokemonToHand keepAttached", () => {
    const r = parseTrainerEffect('Put 1 of your {C} Pokémon that has any damage counters on it and all attached cards into your hand.');
    assert.equal(r.steps[0].type, 'returnPokemonToHand');
    assert.equal(r.steps[0].keepAttached, true);
  });

  test('Poké Turn: return-1-of-your-Pokémon wording → returnPokemonToHand keepAttached', () => {
    const r = parseTrainerEffect('Return 1 of your Pokémon SP and all cards attached to it to your hand.');
    assert.equal(r.steps[0].type, 'returnPokemonToHand');
    assert.equal(r.steps[0].keepAttached, true);
  });

  test('Super Rod: "back into your deck" + combined Pokémon/basic Energy', () => {
    const r = parseTrainerEffect('Shuffle 3 in any combination of Pokémon and basic Energy cards from your discard pile back into your deck.');
    assert.equal(r.steps[0].type, 'shuffleFromDiscard');
    assert.equal(r.steps[0].count, 3);
    assert.equal(r.steps[0].what, 'Pokémon or Basic Energy');
  });

  test("Pokémon Catcher (legacy): player-chosen gust → switchOpponent", () => {
    const r = parseTrainerEffect("Switch your opponent's Active Pokémon with 1 of his or her Benched Pokémon.");
    assert.equal(r.steps[0].type, 'switchOpponent');
  });
});

describe('new step families (batch 4)', () => {
  test('Revive: own discard Basic → reviveFromDiscard', () => {
    const r = parseTrainerEffect('Put 1 Basic Pokémon card from your discard pile onto your Bench. Put damage counters on that Pokémon equal to half its HP (rounded down to the nearest 10).');
    assert.equal(r.recognizable, true);
    assert.equal(r.steps[0].type, 'reviveFromDiscard');
    assert.equal(r.steps[0].side, 'own');
  });

  test("Echoing Horn: opponent discard Basic → reviveFromDiscard side opponent", () => {
    const r = parseTrainerEffect("Put a Basic Pokémon from your opponent's discard pile onto their Bench.");
    assert.equal(r.steps[0].type, 'reviveFromDiscard');
    assert.equal(r.steps[0].side, 'opponent');
  });

  test('Damage Pump: move counters own → own', () => {
    const r = parseTrainerEffect('Move up to 2 damage counters from 1 of your Pokémon to your other Pokémon in any way you like.');
    assert.equal(r.steps[0].type, 'moveDamageCounters');
    assert.equal(r.steps[0].count, 2);
    assert.equal(r.steps[0].from, 'own');
    assert.equal(r.steps[0].to, 'own');
  });

  test('Agatha: move counters ownActive → opponentActive', () => {
    const r = parseTrainerEffect("Move up to 3 damage counters from your Active Pokémon to your opponent's Active Pokémon.");
    assert.equal(r.steps[0].type, 'moveDamageCounters');
    assert.equal(r.steps[0].from, 'ownActive');
    assert.equal(r.steps[0].to, 'opponentActive');
  });

  test("Grimsley: move counters opponent → opponent", () => {
    const r = parseTrainerEffect("Move up to 3 damage counters from 1 of your opponent's Pokémon to another of their Pokémon.");
    assert.equal(r.steps[0].type, 'moveDamageCounters');
    assert.equal(r.steps[0].from, 'opponent');
    assert.equal(r.steps[0].to, 'opponent');
  });

  test('Hand Scope: bare reveal → lookAtOpponentHand', () => {
    const r = parseTrainerEffect('Your opponent reveals his or her hand.');
    assert.equal(r.steps[0].type, 'lookAtOpponentHand');
  });

  test('Bede: attach a basic Energy from hand', () => {
    const r = parseTrainerEffect('Attach a basic Energy card from your hand to 1 of your Benched Pokémon.');
    assert.equal(r.steps[0].type, 'attachFromHand');
    assert.equal(r.steps[0].count, 1);
    assert.equal(r.steps[0].energy, 'Basic Energy');
    assert.equal(r.steps[0].target, '1 of your Benched Pokémon');
  });

  test('Zinnia: attach up to 2 basic Energy from hand', () => {
    const r = parseTrainerEffect('You can play this card only if 1 of your Pokémon was Knocked Out during your opponent’s last turn. Attach up to 2 basic Energy cards from your hand to 1 of your {N} Pokémon.');
    const step = r.steps.find((s) => s.type === 'attachFromHand');
    assert.ok(step);
    assert.equal(step.count, 2);
    assert.equal(step.energy, 'Basic Energy');
  });

  test('Fighting Cube 01: attach a card that grants an attack', () => {
    const r = parseTrainerEffect("Attach this card to 1 of your {F} Pokémon in play. That Pokémon may use this card's attack instead of its own. At the end of your turn, discard Fighting Cube 01. {F} → Violent Rage : 10× Flip a number of coins equal to the number of damage counters on this Pokémon.");
    assert.equal(r.steps[0].type, 'attachAttackTool');
    assert.equal(r.steps[0].discardAtEndOfTurn, true);
  });

  test('Town Map: turn your Prizes face up', () => {
    const r = parseTrainerEffect('Turn all of your Prize cards face up. (Those Prize cards remain face up for the rest of the game.)');
    assert.equal(r.steps[0].type, 'revealPrizes');
    assert.equal(r.steps[0].scope, 'own');
  });

  test('Here Comes Team Rocket!: all players\' Prizes face up', () => {
    const r = parseTrainerEffect('Each player plays with his or her Prize cards face up for the rest of the game.');
    assert.equal(r.steps[0].type, 'revealPrizes');
    assert.equal(r.steps[0].scope, 'all');
  });

  test('Rotom Dex: count + shuffle Prizes → reshufflePrizes', () => {
    const r = parseTrainerEffect('After counting your Prize cards, shuffle them into your deck. Then, take that many cards from the top of your deck and put them face down as your Prize cards.');
    assert.equal(r.steps[0].type, 'reshufflePrizes');
  });

  test('Peonia: up to 3 Prizes to hand, replace from hand', () => {
    const r = parseTrainerEffect('Put up to 3 Prize cards into your hand. Then, for each Prize card you put into your hand in this way, put a card from your hand face down as a Prize card.');
    assert.equal(r.steps[0].type, 'prizeToHand');
    assert.equal(r.steps[0].count, 3);
    assert.equal(r.steps[0].replace, true);
  });

  test('Gladion: put 1 face-down Prize into hand', () => {
    const r = parseTrainerEffect('Look at your face-down Prize cards and put 1 of them into your hand. Then, shuffle this Gladion into your remaining Prize cards and put them back face down.');
    assert.equal(r.steps[0].type, 'prizeToHand');
    assert.equal(r.steps[0].count, 1);
  });
});

describe('recurring-wording coverage (batch 5)', () => {
  test('Penny: typed Basic put-into-hand → returnPokemonToHand keepAttached', () => {
    const r = parseTrainerEffect('Put 1 of your Basic Pokémon and all attached cards into your hand.');
    assert.equal(r.steps[0].type, 'returnPokemonToHand');
    assert.equal(r.steps[0].keepAttached, true);
  });

  test("Mr. Briney's Compassion: 'return that Pokémon' → returnPokemonToHand", () => {
    const r = parseTrainerEffect('Choose 1 of your Pokémon in play (excluding Pokémon-ex). Return that Pokémon and all cards attached to it to your hand.');
    assert.equal(r.steps[0].type, 'returnPokemonToHand');
    assert.equal(r.steps[0].keepAttached, true);
  });

  test('Super Scoop Up (legacy): coin heads put-to-hand keeps attached', () => {
    const r = parseTrainerEffect('Flip a coin. If heads, put 1 of your Pokémon and all attached cards into your hand.');
    assert.equal(r.steps[0].type, 'coinFlip');
    assert.equal(r.steps[0].heads[0].type, 'returnPokemonToHand');
    assert.equal(r.steps[0].heads[0].keepAttached, true);
  });

  test('Weakness Policy / Windup Arm / Hex Maniac are passive', () => {
    for (const text of [
      'The Pokémon this card is attached to has no Weakness.',
      "The Pokémon this card is attached to can attack even if it's Asleep or Paralyzed.",
      "Until the end of your opponent's next turn, each Pokémon in play, in each player's hand, and in each player's discard pile has no Abilities.",
    ]) {
      const r = parseTrainerEffect(text);
      assert.equal(r.recognizable, true, text);
      assert.equal(r.steps[0].type, 'passive', text);
    }
  });

  test("Professor Birch: 'draw cards from your deck until you have 6' → drawUntil 6", () => {
    const r = parseTrainerEffect('Draw cards from your deck until you have 6 cards in your hand.');
    assert.equal(r.steps[0].type, 'drawUntil');
    assert.deepEqual(r.steps[0].target, { kind: 'fixed', n: 6 });
  });

  test('Switch (legacy own-bench wording) → switchOwn', () => {
    const r = parseTrainerEffect('Switch 1 of your own Benched Pokémon with your Active Pokémon.');
    assert.equal(r.steps[0].type, 'switchOwn');
  });

  test('Gust of Wind → switchOpponent', () => {
    const r = parseTrainerEffect("Choose 1 of your opponent's Benched Pokémon and switch it with his or her Active Pokémon.");
    assert.equal(r.steps[0].type, 'switchOpponent');
  });

  test('Warp Point → switchOpponentOut + switchOwn', () => {
    const r = parseTrainerEffect('Your opponent switches 1 of his or her Defending Pokémon with 1 of his or her Benched Pokémon, if any. You switch 1 of your Active Pokémon with 1 of your Benched Pokémon, if any.');
    assert.deepEqual(r.steps.map((s) => s.type), ['switchOpponentOut', 'switchOwn']);
  });

  test('Energy Removal 2 (coin) vs Energy Removal (unconditional)', () => {
    const coin = parseTrainerEffect("Flip a coin. If heads, choose 1 Energy card attached to 1 of your opponent's Pokémon and discard it.");
    assert.equal(coin.steps[0].type, 'coinFlip');
    assert.equal(coin.steps[0].heads[0].type, 'discardEnergyFromOpponent');
    const plain = parseTrainerEffect("Choose 1 Energy card attached to 1 of your opponent's Pokémon and discard it.");
    assert.equal(plain.steps[0].type, 'discardEnergyFromOpponent');
  });

  test('Field Blower → discardTools', () => {
    const r = parseTrainerEffect("Choose up to 2 in any combination of Pokémon Tool cards and Stadium cards in play (yours or your opponent's) and discard them.");
    assert.equal(r.steps[0].type, 'discardTools');
  });

  test('Hyper Devolution Spray → devolve', () => {
    const r = parseTrainerEffect('Choose 1 of your evolved Pokémon. Take the highest Stage Evolution card from that Pokémon and put it into your hand.');
    assert.equal(r.steps[0].type, 'devolve');
  });

  test('Full Heal / Double Full Heal → clearStatus', () => {
    const one = parseTrainerEffect('Remove all Special Conditions from your Active Pokémon.');
    assert.equal(one.steps[0].type, 'clearStatus');
    assert.equal(one.steps[0].target, 'yourActive');
    const many = parseTrainerEffect('Remove all Special Conditions from each of your Active Pokémon.');
    assert.equal(many.steps[0].target, 'allYourPokémon');
  });

  test('Paint Roller → discardStadium', () => {
    const r = parseTrainerEffect('Discard any Stadium card in play. Then, draw a card.');
    assert.equal(r.steps[0].type, 'discardStadium');
  });

  test('Max Revive → putDiscardOnTop', () => {
    const r = parseTrainerEffect('Put a Pokémon from your discard pile on top of your deck.');
    assert.equal(r.steps[0].type, 'putDiscardOnTop');
  });

  test('Energy Reset → energyToHand', () => {
    const r = parseTrainerEffect('Put as many Energy attached to your Pokémon as you like into your hand.');
    assert.equal(r.steps[0].type, 'energyToHand');
  });

  test("Surprise Box / Return Label → opponent discard moves", () => {
    const box = parseTrainerEffect("Put a card from your opponent's discard pile into their hand.");
    assert.equal(box.steps[0].type, 'opponentDiscardToHand');
    const label = parseTrainerEffect("Put a card from your opponent's discard pile on the bottom of their deck.");
    assert.equal(label.steps[0].type, 'opponentDiscardToDeckBottom');
  });

  test('variableDraw new sources', () => {
    const p = parseTrainerEffect("Draw a card for each of your opponent's Pokémon in play.");
    assert.equal(p.steps[0].source, 'opponentPokemonInPlay');
    const b = parseTrainerEffect("Draw a card for each Benched Pokémon (both yours and your opponent's).");
    assert.equal(b.steps[0].source, 'allBench');
    const l = parseTrainerEffect("Draw a card for each of your opponent's Benched Basic Pokémon.");
    assert.equal(l.steps[0].source, 'opponentBenchBasic');
  });

  test('Yell Horn / Imakuni? apply status to new targets', () => {
    const yell = parseTrainerEffect('Both Active Pokémon are now Confused.');
    assert.equal(yell.steps[0].target, 'bothActiveAll');
    const imakuni = parseTrainerEffect('Your Active Pokémon is now Confused.');
    assert.equal(imakuni.steps[0].target, 'ownActive');
  });
});

describe('recurring-wording coverage (batch 6)', () => {
  test('Pokémon Flute: opponent discard Basic → reviveFromDiscard side opponent', () => {
    const r = parseTrainerEffect("Choose 1 Basic Pokémon card from your opponent's discard pile and put it onto his or her Bench.");
    assert.equal(r.steps[0].type, 'reviveFromDiscard');
    assert.equal(r.steps[0].side, 'opponent');
  });

  test('Recycle: coin heads put a discard card on top of deck', () => {
    const r = parseTrainerEffect('Flip a coin. If heads, put a card in your discard pile on top of your deck.');
    assert.equal(r.steps[0].type, 'coinFlip');
    assert.equal(r.steps[0].heads[0].type, 'putDiscardOnTop');
  });

  test('Mr. Fuji / Cassius → shufflePokemonIntoDeck', () => {
    const fuji = parseTrainerEffect('Choose a Pokémon on your Bench. Shuffle it and any cards attached to it into your deck.');
    assert.equal(fuji.steps[0].type, 'shufflePokemonIntoDeck');
    const cassius = parseTrainerEffect('Shuffle 1 of your Pokémon and all cards attached to it into your deck.');
    assert.equal(cassius.steps[0].type, 'shufflePokemonIntoDeck');
  });

  test("Volo / Giovanni's Exile → discardOwnBenchPokemon", () => {
    const volo = parseTrainerEffect('Discard 1 of your Benched Pokémon V and all attached cards.');
    assert.equal(volo.steps[0].type, 'discardOwnBenchPokemon');
    assert.equal(volo.steps[0].filter, 'V');
    const exile = parseTrainerEffect("Discard up to 2 of your Benched Pokémon that have no damage counters on them and all cards attached to them.");
    assert.equal(exile.steps[0].type, 'discardOwnBenchPokemon');
    assert.equal(exile.steps[0].count, 2);
  });

  test("Karen / Lysandre's Trump Card → shuffleDiscardIntoDeck", () => {
    const karen = parseTrainerEffect('Each player shuffles all Pokémon in his or her discard pile into his or her deck.');
    assert.equal(karen.steps[0].type, 'shuffleDiscardIntoDeck');
    const trump = parseTrainerEffect("Each player shuffles all cards in his or her discard pile into his or her deck (except for Lysandre's Trump Card).");
    assert.equal(trump.steps[0].type, 'shuffleDiscardIntoDeck');
  });

  test("Acerola's Premonition: variableDraw opponentHandTrainer", () => {
    const r = parseTrainerEffect('Your opponent reveals their hand, and you draw a card for each Trainer card you find there.');
    assert.equal(r.steps[0].type, 'variableDraw');
    assert.equal(r.steps[0].source, 'opponentHandTrainer');
  });

  test('Sabrina: move all Energy between two of your Pokémon → moveEnergy', () => {
    const r = parseTrainerEffect('Take all Energy cards attached to 1 of your Pokémon with Sabrina in its name and attach them to another 1 of your Pokémon with Sabrina in its name.');
    assert.equal(r.steps[0].type, 'moveEnergy');
  });

  test('Super Energy Removal: discard up to 2 Energy from an opponent Pokémon', () => {
    const r = parseTrainerEffect("Discard 1 Energy card attached to 1 of your own Pokémon in order to choose 1 of your opponent's Pokémon and up to 2 Energy cards attached to it. Discard those Energy cards.");
    assert.equal(r.steps[0].type, 'discardEnergyFromOpponent');
    assert.equal(r.steps[0].count, 2);
  });

  test('Master Ball: "look at 7 cards from the top" → lookAtTop count 7', () => {
    const r = parseTrainerEffect('Look at 7 cards from the top of your deck. You may choose a Basic Pokémon or Evolution card from those cards, show it to your opponent, and put it into your hand. Shuffle the rest into your deck.');
    assert.equal(r.steps[0].type, 'lookAtTop');
    assert.equal(r.steps[0].count, 7);
  });
});

describe('opponent-hand and mixed coverage (batch 8)', () => {
  test('Alph Lithograph: bare "LOOK AT YOUR OPPONENTS HAND!"', () => {
    const r = parseTrainerEffect('LOOK AT YOUR OPPONENTS HAND!');
    assert.equal(r.steps[0].type, 'lookAtOpponentHand');
  });

  test('Morty: reveal hand, choose 2, shuffle into deck', () => {
    const r = parseTrainerEffect("Your opponent reveals their hand. Choose 2 cards you find there. Your opponent shuffles those cards into their deck.");
    assert.equal(r.steps[0].type, 'opponentHandShuffleDeck');
    assert.equal(r.steps[0].count, 2);
  });

  test("Team Rocket's Evil Deeds: choose a card, shuffle, optional draw", () => {
    const r = parseTrainerEffect("Look at your opponent's hand and choose a card there. Your opponent shuffles that card into his or her deck. Then, your opponent may draw up to 2 cards.");
    assert.equal(r.steps[0].type, 'opponentHandShuffleDeck');
    assert.equal(r.steps[0].count, 1);
    assert.equal(r.steps[0].optionalOpponentDraw, true);
  });

  test("Rocket's Sneak Attack: choose 1 Trainer, what=Trainer", () => {
    const r = parseTrainerEffect("Look at your opponent's hand. If he or she has any Trainer cards, choose 1 of them. Your opponent shuffles that card into his or her deck.");
    assert.equal(r.steps[0].type, 'opponentHandShuffleDeck');
    assert.equal(r.steps[0].what, 'Trainer');
  });

  test('Hooligans Jim & Cas: coin heads → shuffle 3 random cards', () => {
    const r = parseTrainerEffect("Flip a coin. If heads, choose 3 random cards from your opponent's hand. Your opponent reveals those cards and shuffles them into his or her deck.");
    assert.equal(r.steps[0].type, 'coinFlip');
    assert.equal(r.steps[0].heads[0].type, 'opponentHandShuffleDeck');
    assert.equal(r.steps[0].heads[0].count, 3);
  });

  test("The Rocket's Trap: coin heads → shuffle up to 3 cards", () => {
    const r = parseTrainerEffect("Flip a coin. If heads, choose up to 3 cards at random from your opponent's hand (don't look at them). Your opponent shuffles those cards into his or her deck.");
    assert.equal(r.steps[0].heads[0].type, 'opponentHandShuffleDeck');
    assert.equal(r.steps[0].heads[0].count, 3);
    assert.equal(r.steps[0].heads[0].upTo, true);
  });

  test('Life Herb: coin heads → heal 6 + cure', () => {
    const r = parseTrainerEffect("Flip a coin. If heads, choose 1 of your Pok\u00e9mon, and remove all Special Conditions and 6 damage counters from that Pok\u00e9mon (all if there are less than 6).");
    assert.equal(r.steps[0].type, 'coinFlip');
    assert.equal(r.steps[0].heads[0].type, 'healAmount');
    assert.equal(r.steps[0].heads[0].amount, 6);
    assert.equal(r.steps[0].heads[0].cure, true);
  });

  test('Nita: opponent Active Energy to top of deck', () => {
    const r = parseTrainerEffect("You can play this card only if your opponent's Active Pok\u00e9mon is a Basic Pok\u00e9mon. Put an Energy from your opponent's Active Pok\u00e9mon on top of their deck.");
    assert.equal(r.steps[0].type, 'opponentActiveEnergyToDeck');
  });

  test('Bonnie: "Discard that Stadium card" → discardStadium', () => {
    const r = parseTrainerEffect('You can play this card only if there is any Stadium card in play. Discard that Stadium card.');
    assert.equal(r.steps[0].type, 'discardStadium');
  });
});

describe('each-player and hand-to-bench coverage (batch 9)', () => {
  test("Erika's Invitation: Basic from opponent hand to their Bench, switch", () => {
    const r = parseTrainerEffect("Your opponent reveals their hand, and you put a Basic Pok\u00e9mon you find there onto your opponent's Bench. If you put a Pok\u00e9mon onto their Bench in this way, switch in that Pok\u00e9mon to the Active Spot.");
    assert.equal(r.steps[0].type, 'opponentHandToBenchBasic');
    assert.equal(r.steps[0].switchActive, true);
  });

  test('Captivating Poké Puff: any number of Basics to opponent Bench', () => {
    const r = parseTrainerEffect("Your opponent reveals his or her hand. Put any number of Basic Pok\u00e9mon you find there onto your opponent's Bench.");
    assert.equal(r.steps[0].type, 'opponentHandToBenchBasic');
    assert.equal(r.steps[0].anyNumber, true);
  });

  test("Erika's Perfume: look at hand, put any number of Basics on opponent Bench", () => {
    const r = parseTrainerEffect("Look at your opponent's hand. If he or she has any Basic Pok\u00e9mon cards there, you may put any number of them onto your opponent's Bench (as long as there's room).");
    assert.equal(r.steps[0].type, 'opponentHandToBenchBasic');
    assert.equal(r.steps[0].anyNumber, true);
  });

  test('Jessie & James: each player discards 2 (opponent first)', () => {
    const r = parseTrainerEffect('Each player discards 2 cards from their hand. Your opponent discards first.');
    assert.equal(r.steps[0].type, 'eachPlayerDiscardFromHand');
    assert.equal(r.steps[0].count, 2);
    assert.equal(r.steps[0].opponentFirst, true);
  });

  test('Erika: each player may draw up to 3', () => {
    const r = parseTrainerEffect('Each player may draw up to 3 cards. You draw first.');
    assert.equal(r.steps[0].type, 'eachPlayerDraw');
    assert.equal(r.steps[0].count, 3);
  });

  test('Seeker: each player returns 1 Benched Pokémon to hand', () => {
    const r = parseTrainerEffect('Each player returns 1 of his or her Benched Pok\u00e9mon and all cards attached to it to his or her hand. (You return your Pok\u00e9mon first.)');
    assert.equal(r.steps[0].type, 'eachPlayerReturnBench');
  });

  test('Wicke: each player shuffles hand in and redraws', () => {
    const r = parseTrainerEffect('Each player counts the cards in their hand, shuffles those cards into their deck, then draws that many cards.');
    assert.equal(r.steps[0].type, 'eachPlayerShuffleHandDraw');
  });

  test('Hugh: each player normalizes hand to 5', () => {
    const r = parseTrainerEffect('Each player either draws or discard cards until he or she has 5 cards in his or her hand. (Your opponent does this first.)');
    assert.equal(r.steps[0].type, 'eachPlayerHandToFive');
    assert.equal(r.steps[0].count, 5);
    assert.equal(r.steps[0].opponentFirst, true);
  });

  test('Buddy-Buddy Rescue: each player recovers a Pokémon', () => {
    const r = parseTrainerEffect('Each player puts a Pok\u00e9mon from his or her discard pile into his or her hand. (Your opponent chooses first.)');
    assert.equal(r.steps[0].type, 'eachPlayerRecoverPokemon');
  });

  test("Psychic's Third Eye: look at hand + discard-any-then-draw", () => {
    const r = parseTrainerEffect('Your opponent reveals his or her hand. Discard as many cards as you like from your hand. Then, draw that many cards.');
    assert.equal(r.steps[0].type, 'lookAtOpponentHand');
    assert.equal(r.steps[1].type, 'discardAnyThenDraw');
  });

  test('Ghetsis: opponent shuffles Items, you draw that many', () => {
    const r = parseTrainerEffect('Your opponent reveals his or her hand and shuffles all Item cards found there into his or her deck. Then, draw a number of cards equal to the number of Item cards your opponent shuffled into his or her deck.');
    assert.equal(r.steps[0].type, 'opponentHandShuffleItemsDraw');
  });

  test('Tropical Tidal Wave: coin heads/tails discard all Trainer cards in play', () => {
    const r = parseTrainerEffect('Flip a coin. If heads, discard all Trainer and Stadium cards your opponent has in play. If tails, discard all Trainer and Stadium cards you have in play.');
    assert.equal(r.steps[0].type, 'coinFlip');
    assert.equal(r.steps[0].heads[0].type, 'discardAllTrainerInPlay');
    assert.equal(r.steps[0].tails[0].side, 'self');
  });

  test('Here Comes Team Rocket!: each player turns Prizes face up', () => {
    const r = parseTrainerEffect('Each player turns all of his or her Prize cards face up. (Those Prize cards remain face up for the rest of the game.)');
    assert.equal(r.steps[0].type, 'revealPrizes');
    assert.equal(r.steps[0].scope, 'all');
  });
});

describe('legacy mechanisms coverage (batch 10)', () => {
  test('Team Star Grunt: "Energy attached to" opponent Active → opponentActiveEnergyToDeck', () => {
    const r = parseTrainerEffect("Put an Energy attached to your opponent's Active Pok\u00e9mon on top of their deck.");
    assert.equal(r.steps[0].type, 'opponentActiveEnergyToDeck');
  });

  test('Warp Point: both Active switch out', () => {
    const r = parseTrainerEffect("Your opponent switches the Defending Pok\u00e9mon with 1 of his or her Benched Pok\u00e9mon, if any; then you switch your Active Pok\u00e9mon with 1 of your Benched Pok\u00e9mon, if any.");
    assert.equal(r.steps[0].type, 'switchOwn');
    assert.equal(r.steps[1].type, 'switchOpponentOut');
  });

  test('Double Gust: both Active switch out', () => {
    const r = parseTrainerEffect("If you have any Benched Pok\u00e9mon, your opponent chooses 1 of them and switches it with your Active Pok\u00e9mon. Then, if your opponent has any Benched Pok\u00e9mon, choose 1 of them and switch it with his or her Active Pok\u00e9mon.");
    assert.equal(r.steps[0].type, 'switchOwn');
    assert.equal(r.steps[1].type, 'switchOpponentOut');
  });

  test('Random Receiver: reveal-until-Supporter', () => {
    const r = parseTrainerEffect('Reveal cards from the top of your deck until you reveal a Supporter card. Put it into your hand. Shuffle the other cards back into your deck.');
    assert.equal(r.steps[0].type, 'revealUntilCard');
    assert.equal(r.steps[0].what, 'supporter');
  });

  test('Quick Ball: reveal-until-Pokémon', () => {
    const r = parseTrainerEffect('Reveal cards from your deck until you reveal a Pok\u00e9mon. Show that Pok\u00e9mon to your opponent and put it into your hand. Shuffle the other revealed cards back into your deck.');
    assert.equal(r.steps[0].type, 'revealUntilCard');
    assert.equal(r.steps[0].what, 'pok\u00e9mon');
  });

  test('Underground Expedition: look at bottom 4, pick 2', () => {
    const r = parseTrainerEffect('Look at the 4 cards from the bottom of your deck. Choose any 2 cards there and put them into your hand. Put the remaining cards back on the bottom of your deck in any order.');
    assert.equal(r.steps[0].type, 'lookAtBottom');
    assert.equal(r.steps[0].count, 4);
  });

  test('Dusk Ball: look at bottom 7, pick a Pokémon', () => {
    const r = parseTrainerEffect('Look at the 7 cards from the bottom of your deck. Choose 1 Pok\u00e9mon you find there, show it to your opponent, and put it into your hand. Put the remaining cards back on top of your deck. Shuffle your deck afterward.');
    assert.equal(r.steps[0].type, 'lookAtBottom');
    assert.equal(r.steps[0].count, 7);
  });

  test('Hisuian Heavy Ball: look at face-down prizes', () => {
    const r = parseTrainerEffect('Look at your face-down Prize cards. You may reveal a Basic Pok\u00e9mon you find there, put it into your hand, and put this Hisuian Heavy Ball in its place as a face-down Prize card.');
    assert.equal(r.steps[0].type, 'lookAtFaceDownPrize');
    assert.equal(r.steps[0].what, 'Basic');
  });

  test('Channeler / Pokémon Ranger: remove all effects of attacks', () => {
    const channeler = parseTrainerEffect('Remove all effects of attacks on you and each of your Pok\u00e9mon.');
    assert.equal(channeler.steps[0].type, 'clearAttackEffects');
    assert.equal(channeler.steps[0].scope, 'own');
    const ranger = parseTrainerEffect('Remove all effects of attacks on each player and his or her Pok\u00e9mon.');
    assert.equal(ranger.steps[0].scope, 'all');
  });

  test('Alph Lithograph: "SHUFFLE YOUR DECK!" → shuffleDeckOnly', () => {
    const r = parseTrainerEffect('SHUFFLE YOUR DECK!');
    assert.equal(r.steps[0].type, 'shuffleDeckOnly');
  });

  test('Alph Lithograph: return Stadium to hand', () => {
    const r = parseTrainerEffect('RETURN ANY STADIUM CARD IN PLAY TO ITS PLAYERS HAND!');
    assert.equal(r.steps[0].type, 'returnStadiumToHand');
  });

  test('Lt. Surge: put Basic from hand as Active', () => {
    const r = parseTrainerEffect('Put a Basic Pok\u00e9mon card from your hand into play as your Active Pok\u00e9mon. Put your old Active Pok\u00e9mon onto your Bench.');
    assert.equal(r.steps[0].type, 'putHandBasicAsActive');
  });

  test('tool passives: Crystal Shard / Rocky Helmet / Lum Berry recognized as passive', () => {
    const shard = parseTrainerEffect("As long as this card is attached to a Pok\u00e9mon, that Pok\u00e9mon's type is {C}. If that Pok\u00e9mon attacks, discard this card at the end of the turn.");
    assert.equal(shard.steps[0].type, 'passive');
    const helmet = parseTrainerEffect("If the Pok\u00e9mon this card is attached to is your Active Pok\u00e9mon and is damage by an opponent's attack (even if that Pok\u00e9mon is Knocked Out), put 2 damage counters on the Attacking Pok\u00e9mon.");
    assert.equal(helmet.steps[0].type, 'passive');
    const berry = parseTrainerEffect('At the end of each turn, if the Pok\u00e9mon this card is attached to is affected by any Special Conditions, it recovers from all of them, and discard this card.');
    assert.equal(berry.steps[0].type, 'passive');
  });
});

describe('legacy mechanisms coverage (batch 11)', () => {
  test('Moomoo Milk: heal 3 per heads', () => {
    const r = parseTrainerEffect('Choose 1 of your Pok\u00e9mon. Flip 2 coins. For each heads, remove 3 damage counters from that Pok\u00e9mon.');
    assert.equal(r.steps[0].type, 'healPerHeads');
    assert.equal(r.steps[0].perHeads, 3);
  });

  test('Moo-Moo Milk: heal 2 per heads', () => {
    const r = parseTrainerEffect('Choose 1 of your Pok\u00e9mon. Flip 2 coins. Remove 2 damage counters times the number of heads from that Pok\u00e9mon. If the Pok\u00e9mon has fewer damage counters than that, remove all of them.');
    assert.equal(r.steps[0].type, 'healPerHeads');
    assert.equal(r.steps[0].perHeads, 2);
  });

  test('Tropical Wind: coin heal each Active / Sleep each Active', () => {
    const r = parseTrainerEffect('Flip a coin. If heads, remove 2 damage counters from each Active Pok\u00e9mon (remove 1 damage counter if a Pok\u00e9mon has only 1). If tails, each Active Pok\u00e9mon is now Asleep.');
    assert.equal(r.steps[0].type, 'coinFlip');
    assert.equal(r.steps[0].heads[0].type, 'healEachActive');
    assert.equal(r.steps[0].tails[0].target, 'bothActiveAll');
  });

  test("Brock / Erika's Kindness: heal each Pokémon", () => {
    const brock = parseTrainerEffect('Remove 1 damage counter from each of your Pok\u00e9mon that has any damage counters on it.');
    assert.equal(brock.steps[0].type, 'healEachActive');
    assert.equal(brock.steps[0].scope, 'own');
    const erika = parseTrainerEffect("Remove 2 damage counters from each Pok\u00e9mon (yours and your opponent's) with any damage counters on it. If a Pok\u00e9mon has just 1 damage counter, remove it.");
    assert.equal(erika.steps[0].scope, 'all');
  });

  test('Riley / Rival: opponent chooses from the top', () => {
    const riley = parseTrainerEffect('Reveal the top 5 cards of your deck and have your opponent choose 2 of them. Discard the chosen cards and put the remaining cards into your hand.');
    assert.equal(riley.steps[0].type, 'opponentChoosesFromTop');
    assert.equal(riley.steps[0].count, 5);
    assert.equal(riley.steps[0].chosen, 2);
    assert.equal(riley.steps[0].chosenTo, 'discard');
    const rival = parseTrainerEffect('Reveal the top 5 cards of your deck. Your opponent chooses 3 of those cards. Put those cards into your hand and put other 2 cards on top of your deck.');
    assert.equal(rival.steps[0].chosen, 3);
    assert.equal(rival.steps[0].restTo, 'top');
  });

  test('Energy Retrieval / Super Energy Retrieval: trade hand for basic Energy', () => {
    const er = parseTrainerEffect('Trade 1 of the other cards in your hand for up to 2 basic Energy cards from your discard pile.');
    assert.equal(er.steps[0].type, 'discardCost');
    assert.equal(er.steps[0].count, 1);
    assert.equal(er.steps[1].type, 'recursion');
    const ser = parseTrainerEffect('Trade 2 of the other cards in your hand for 4 basic Energy cards from your discard pile. If you have fewer than 4 basic Energy cards there, take all of them.');
    assert.equal(ser.steps[0].count, 2);
  });

  test("Team Rocket's Handiwork: mill 2 per heads", () => {
    const r = parseTrainerEffect("Flip 2 coins. For each heads, discard 2 cards from the top of your opponent's deck.");
    assert.equal(r.steps[0].type, 'millPerHeads');
    assert.equal(r.steps[0].per, 2);
  });

  test('Gym Badge: flip until tails, draw per heads', () => {
    const r = parseTrainerEffect('Flip a coin until you get tails. For each heads, draw a card.');
    assert.equal(r.steps[0].type, 'flipUntilTailsDraw');
  });

  test('Tool Retriever: tools to hand', () => {
    const r = parseTrainerEffect('Choose up to 2 Pok\u00e9mon Tool cards attached to your Pok\u00e9mon and put them into your hand.');
    assert.equal(r.steps[0].type, 'toolsToHand');
    assert.equal(r.steps[0].count, 2);
  });

  test('Switching Cups / Caitlin', () => {
    assert.equal(parseTrainerEffect('Switch a card from your hand with the top card of your deck.').steps[0].type, 'switchHandWithTop');
    const caitlin = parseTrainerEffect('Put as many cards from your hand as you like on the bottom of your deck in any order. Then, draw a card for each card you put on the bottom of your deck.');
    assert.equal(caitlin.steps[0].type, 'putHandBottomThenDraw');
  });

  test('Team Skull Grunt / Sidney: opponent hand discard', () => {
    const grunt = parseTrainerEffect('Your opponent reveals their hand. Discard 2 Energy cards from it.');
    assert.equal(grunt.steps[0].type, 'revealOpponentHandDiscard');
    assert.equal(grunt.steps[0].what, 'Energy');
    const sidney = parseTrainerEffect('Your opponent reveals their hand. Discard up to 2 in any combination of Pok\u00e9mon Tool cards, Special Energy cards, and Stadium cards from it.');
    assert.equal(sidney.steps[0].type, 'revealOpponentHandDiscard');
  });

  test('Fan of Waves / Eneporter: opponent Special Energy', () => {
    const fan = parseTrainerEffect("Put a Special Energy attached to 1 of your opponent's Pok\u00e9mon on the bottom of their deck.");
    assert.equal(fan.steps[0].type, 'sendEnergyToDeckBottom');
    const ene = parseTrainerEffect("Move a Special Energy from 1 of your opponent's Pok\u00e9mon to another of their Pok\u00e9mon.");
    assert.equal(ene.steps[0].type, 'moveEnergyOpponent');
  });

  test('Hypnotoxic Laser: Poison then coin Asleep', () => {
    const r = parseTrainerEffect("Your opponent's Active Pok\u00e9mon is now Poisoned. Flip a coin. If heads, your opponent's Active Pok\u00e9mon is also Asleep.");
    assert.equal(r.steps[0].type, 'applyStatus');
    assert.deepEqual(r.steps[0].conditions, ['Poisoned']);
    assert.equal(r.steps[1].type, 'coinFlip');
  });

  test("Professor Cozmo's Discovery: bottom/top draw", () => {
    const r = parseTrainerEffect('Flip a coin. If heads, draw the bottom 3 cards of your deck. If tails, draw the top 2 cards of your deck.');
    assert.equal(r.steps[0].heads[0].type, 'drawBottom');
    assert.equal(r.steps[0].heads[0].count, 3);
    assert.equal(r.steps[0].tails[0].count, 2);
  });

  test('Maintenance: shuffle N from hand, then draw', () => {
    const r = parseTrainerEffect("Shuffle 2 cards from your hand into your deck. (If you can't shuffle 2 cards into your deck, you can't play this card.) Then, draw a card.");
    assert.equal(r.steps[0].type, 'shuffleHandCardsThenDraw');
    assert.equal(r.steps[0].count, 2);
    assert.equal(r.steps[0].draw, 1);
  });

  test('First Ticket: pre-game passive', () => {
    const r = parseTrainerEffect("Before you flip a coin to decide who goes first in a game, you may play this card. Don't flip that coin, and you go first.");
    assert.equal(r.steps[0].type, 'passive');
  });
});

describe('legacy mechanisms coverage (batch 12)', () => {
  test('Ether / Gutsy Pickaxe: reveal top, attach if Energy', () => {
    const ether = parseTrainerEffect('Reveal the top card of your deck. If that card is a basic Energy card, attach it to 1 of your Pok\u00e9mon. If it is not a basic Energy card, return it to the top of your deck.');
    assert.equal(ether.steps[0].type, 'revealTopEnergy');
    const pick = parseTrainerEffect('Reveal the top card of your deck. If that card is a {F} Energy card, attach it to 1 of your Benched Pok\u00e9mon. If it is not a {F} Energy card, put it into your hand.');
    assert.equal(pick.steps[0].type, 'revealTopEnergy');
    assert.equal(pick.steps[0].toBench, true);
  });

  test('Energy Pickup: coin heads attach basic Energy from discard', () => {
    const r = parseTrainerEffect('Flip a coin. If heads, search your discard pile for a basic Energy card and attach it to 1 of your Pok\u00e9mon.');
    assert.equal(r.steps[0].type, 'coinFlip');
    assert.equal(r.steps[0].heads[0].type, 'attachFromDiscard');
  });

  test('Super Rod / Good Rod: coin recursion / put-on-top', () => {
    const rod = parseTrainerEffect('Flip a coin. If heads, put an Evolution card from your discard pile, if any, into your hand. If tails, put a Basic Pok\u00e9mon card from your discard pile, if any, into your hand.');
    assert.equal(rod.steps[0].heads[0].type, 'recursion');
    assert.equal(rod.steps[0].tails[0].what, 'Basic Pok\u00e9mon');
    const good = parseTrainerEffect('Flip a coin. If heads, search your discard pile for a Pok\u00e9mon, show it to your opponent, and put it on top of your deck. If tails, search your discard pile for a Trainer card, show it to your opponent, and put it on top of your deck.');
    assert.equal(good.steps[0].heads[0].type, 'putDiscardOnTop');
    assert.equal(good.steps[0].tails[0].what, 'Trainer');
  });

  test('Heal Powder: coin heads cure + remove 2', () => {
    const r = parseTrainerEffect('Flip a coin. If heads, your Active Pok\u00e9mon is no longer Asleep, Confused, Paralyzed, or Poisoned and remove 2 damage counters from it.');
    assert.equal(r.steps[0].heads[0].type, 'clearStatus');
    assert.equal(r.steps[0].heads[1].amount, 2);
  });

  test('Lure Ball / Fisherman: recursion counts', () => {
    const lure = parseTrainerEffect('Flip 3 coins. For each heads, choose an Evolution card from your discard pile, show it to your opponent, and put it into your hand.');
    assert.equal(lure.steps[0].type, 'recursion');
    assert.equal(lure.steps[0].count, 3);
    const fish = parseTrainerEffect('Choose 4 basic Energy cards from your discard pile (if there are fewer basic Energy cards than choose, take all of them), show them to your opponent, and put them into your hand.');
    assert.equal(fish.steps[0].type, 'recursion');
    assert.equal(fish.steps[0].count, 4);
  });

  test('Super Energy Removal 2: strip all Energy from an Active', () => {
    const r = parseTrainerEffect('Flip 2 coins. If both are heads, discard all Energy cards attached to the Defending Pok\u00e9mon. If both are tails, discard all Energy cards attached to your Active Pok\u00e9mon. If 1 is heads and 1 is tails, this card does nothing.');
    assert.equal(r.steps[0].type, 'coinFlip');
    assert.equal(r.steps[0].heads[0].type, 'discardAllEnergyFromActive');
    assert.equal(r.steps[0].heads[0].side, 'opponent');
  });

  test('Fervor: look at top 3, take Energy', () => {
    const r = parseTrainerEffect('Show the top 3 cards of your deck to all players. Put any {R} Energy cards there into your hand and discard the rest.');
    assert.equal(r.steps[0].type, 'lookAtTop');
    assert.equal(r.steps[0].count, 3);
  });

  test("Mary's Request: draw 1 plus conditional", () => {
    const r = parseTrainerEffect("Draw a card. If you don't have any Stage 2 Evolved Pok\u00e9mon in play, draw 2 more cards.");
    assert.equal(r.steps[0].type, 'draw');
    assert.equal(r.steps[0].count, 1);
    assert.equal(r.steps[1].type, 'passive');
  });

  test('Oracle: choose 2 to top', () => {
    const r = parseTrainerEffect('Choose 2 cards from your deck and shuffle the rest of your deck. Put the chosen cards on top of your deck in any order.');
    assert.equal(r.steps[0].type, 'searchToTop');
    assert.equal(r.steps[0].count, 2);
  });

  test('Pokémon Center / Pokémon Nurse: heal and discard Energy', () => {
    const center = parseTrainerEffect('Remove all damage counters from all of your own Pok\u00e9mon with damage counters on them, then discard all Energy cards attached to those Pok\u00e9mon.');
    assert.equal(center.steps[0].type, 'healAllOwnAndDiscardEnergy');
    const nurse = parseTrainerEffect('Remove all damage counters from 1 of your Pok\u00e9mon. Then discard all Energy cards attached to it, if any.');
    assert.equal(nurse.steps[0].type, 'healOneDiscardEnergy');
  });

  test("Giovanni's Last Resort: heal 1 then discard hand", () => {
    const r = parseTrainerEffect('Remove all damage counters from 1 of your Pok\u00e9mon with Giovanni in its name. Then discard your hand.');
    assert.equal(r.steps[0].type, 'heal');
    assert.equal(r.steps[1].type, 'discardHandThenDraw');
  });

  test('Koga / Giovanni / Blaine: turn-scoped passives', () => {
    assert.equal(parseTrainerEffect('If an attack from a Pok\u00e9mon with Koga in its name does damage to a Defending Pok\u00e9mon this turn, that Pok\u00e9mon is then Poisoned.').steps[0].type, 'passive');
    assert.equal(parseTrainerEffect('Choose 1 of your Pok\u00e9mon in play with Giovanni in its name. For the rest of your turn, you may evolve that Pok\u00e9mon even if you just played or evolved it this turn or if this is your first turn.').steps[0].type, 'passive');
    assert.equal(parseTrainerEffect('During this turn, instead of attaching your free Energy card, you may instead attach 2 {R} Energy cards to 1 of your Pok\u00e9mon with Blaine in its name.').steps[0].type, 'passive');
  });
});

describe('legacy mechanisms coverage (batch 13)', () => {
  test('Erika / Computer Error: each player draws up to N', () => {
    const erika = parseTrainerEffect('You may draw up to 3 cards, then your opponent may draw up to 3 cards.');
    assert.equal(erika.steps[0].type, 'eachPlayerDraw');
    assert.equal(erika.steps[0].count, 3);
    const error = parseTrainerEffect('You may draw up to 5 cards, then your opponent may draw up to 5 cards. Your turn is over now (you don\u2019t get to attack).');
    assert.equal(error.steps[0].count, 5);
  });

  test('Holon Farmer: discard cost + recycle to top', () => {
    const r = parseTrainerEffect('Discard a card from your hand. If you can\u2019t discard a card from your hand, you can\u2019t play this card. Search your discard pile for 3 basic Energy cards and any combination of 3 Basic Pok\u00e9mon or Evolution cards, show them to your opponent, and put them on top of your deck.');
    assert.equal(r.steps[0].type, 'discardCost');
    assert.equal(r.steps[1].type, 'shuffleFromDiscard');
  });

  test('Holon Lass: discard cost + dig top for Energy', () => {
    const r = parseTrainerEffect('Discard a card from your hand. Count the total number of Prize cards left (both yours and your opponent\u2019s). Look at that many cards from the top of your deck, choose as many Energy cards as you like, show them to your opponent, and put them into your hand.');
    assert.equal(r.steps[0].type, 'discardCost');
    assert.equal(r.steps[1].type, 'lookAtTop');
    assert.equal(r.steps[1].pick, 'Energy');
  });

  test('Poké Healer +: heal 8 and cure', () => {
    const r = parseTrainerEffect('You may play 2 Pok\u00e9 Healer + at the same time. If you play 1 Pok\u00e9 Healer +, remove 1 damage counter and a Special Condition from 1 of your Active Pok\u00e9mon. If you play 2 Pok\u00e9 Healer +, remove 8 damage counters and all Special Conditions from 1 of your Active Pok\u00e9mon.');
    assert.equal(r.steps[0].type, 'healAmount');
    assert.equal(r.steps[0].amount, 8);
    assert.equal(r.steps[0].cure, true);
  });

  test('New Pokédex / Pokédex: rearrange the top', () => {
    assert.equal(parseTrainerEffect('Look at up to 5 cards from the top of your deck and rearrange them as you like.').steps[0].type, 'rearrangeTop');
    assert.equal(parseTrainerEffect('Shuffle your deck. Then, look at up to 5 cards from the top of your deck and rearrange them as you like.').steps[0].type, 'rearrangeTop');
  });

  test('Trash Exchange: shuffle discard in, then mill', () => {
    const r = parseTrainerEffect('Count the number of cards in your discard pile and shuffle them into your deck. Then discard that many cards from the top of your deck.');
    assert.equal(r.steps[0].type, 'shuffleDiscardThenMill');
  });

  test('Tormenting Spray: random Supporter discard', () => {
    const r = parseTrainerEffect('Choose a random card from your opponent\u2019s hand. Your opponent reveals that card. If it\u2019s a Supporter card, discard it.');
    assert.equal(r.steps[0].type, 'discardRandomOpponentHandIfSupporter');
  });
});

describe('Lost Zone cards (batch 14)', () => {
  test('Lost Vacuum: hand card to Lost Zone, then a Tool/Stadium there', () => {
    const r = parseTrainerEffect('You can use this card only if you put another card from your hand in the Lost Zone. Choose a Pok\u00e9mon Tool attached to any Pok\u00e9mon, or any Stadium in play, and put it in the Lost Zone.');
    assert.equal(r.steps[0].type, 'lostZoneCost');
    assert.equal(r.steps[0].count, 1);
    assert.equal(r.steps[1].type, 'toolOrStadiumToLostZone');
  });

  test('Lost Blender: 2 hand cards to the Lost Zone, draw a card', () => {
    const r = parseTrainerEffect('Put 2 cards from your hand in the Lost Zone. If you do, draw a card.');
    assert.equal(r.steps[0].type, 'lostZoneCost');
    assert.equal(r.steps[0].count, 2);
    assert.equal(r.steps[1].type, 'draw');
    assert.equal(r.steps[1].count, 1);
  });

  test('Lost Remover: opponent Special Energy to the Lost Zone', () => {
    const r = parseTrainerEffect("Put 1 Special Energy card attached to 1 of your opponent\u2019s Pok\u00e9mon in the Lost Zone.");
    assert.equal(r.steps[0].type, 'sendEnergyToLostZone');
    assert.equal(r.steps[0].energy, 'Special Energy');
  });

  test('Lysandre Prism Star: per {R} Pokémon, opponent discard to the Lost Zone', () => {
    const r = parseTrainerEffect("For each of your {R} Pok\u00e9mon in play, put a card from your opponent\u2019s discard pile in the Lost Zone.");
    assert.equal(r.steps[0].type, 'opponentDiscardToLostZonePerPokemon');
    assert.equal(r.steps[0].energyType, '{R}');
  });
});

describe('coin-conditional turn ends (I155)', () => {
  test('Tickling Machine: heads sets the hand aside, tails ends the turn', () => {
    const r = parseTrainerEffect(
      'Flip a coin. If heads, your opponent sets aside all the cards in his or her hand face down. Nobody may look at those cards. At the end of your opponent\u2019s next turn, your opponent puts those cards back into his or her hand. If tails, your turn ends immediately (you can\u2019t attack this turn).'
    );
    assert.equal(r.recognizable, true);
    assert.equal(r.steps[0].type, 'coinFlip');
    assert.equal(r.steps[0].heads[0].type, 'opponentHandSetAside');
    assert.equal(r.steps[0].tails[0].type, 'turnEnds');
  });

  test('Minion of Team Rocket: both heads returns a Benched Pokémon, otherwise the turn ends', () => {
    const r = parseTrainerEffect(
      'Flip 2 coins. If both of them are heads, choose 1 of your opponent\u2019s Benched Pok\u00e9mon and return it and all cards attached to it to his or her hand. If 1 or both of them are tails, your turn ends immediately (you can\u2019t attack this turn).'
    );
    assert.equal(r.recognizable, true);
    assert.equal(r.steps[0].type, 'coinFlip');
    assert.equal(r.steps[0].count, 2);
    assert.equal(r.steps[0].headsAtLeast, 2);
    assert.equal(r.steps[0].heads[0].type, 'returnPokemonToHand');
    assert.equal(r.steps[0].heads[0].side, 'opponent');
    assert.equal(r.steps[0].tails[0].type, 'turnEnds');
  });
});

// Audit S&M compound clauses (S6): printed costs and second clauses that had
// no parsed step. Card texts are verbatim from the S&M series corpus.
describe('Audit S&M compound clauses (S6)', () => {
  test('Sophocles / Plumeria: leading hand-discard cost is parsed', () => {
    const sophocles = parseTrainerEffect('Discard 2 cards from your hand. If you do, draw 4 cards.');
    assert.equal(sophocles.steps[0].type, 'discardCost');
    assert.equal(sophocles.steps[0].count, 2);
    assert.equal(sophocles.steps[1].type, 'draw');
    assert.equal(sophocles.steps[1].count, 4);

    const plumeria = parseTrainerEffect(
      'Discard 2 cards from your hand. If you do, discard an Energy from 1 of your opponent\u2019s Pok\u00e9mon.'
    );
    assert.equal(plumeria.steps[0].type, 'discardCost');
    assert.equal(plumeria.steps[1].type, 'discardEnergyFromOpponent');
  });

  test('Crasher Wake / Molayne: typed hand-discard cost keeps its Energy filter', () => {
    const wake = parseTrainerEffect(
      'Discard 2 {W} Energy cards from your hand. If you do, search your deck for up to 2 cards and put them into your hand. Then, shuffle your deck.'
    );
    assert.equal(wake.steps[0].type, 'discardCost');
    assert.equal(wake.steps[0].count, 2);
    assert.deepEqual(wake.steps[0].energyTypes, ['water']);
    assert.equal(wake.steps[0].basicOnly, true);

    const molayne = parseTrainerEffect(
      'You can play this card only if you discard 2 {M} Energy cards from your hand. Shuffle a Trainer card from your discard pile into your deck.'
    );
    assert.equal(molayne.steps[0].type, 'discardCost');
    assert.deepEqual(molayne.steps[0].energyTypes, ['metal']);
  });

  test('Max Potion: heal-all now carries the discard-all-Energy follow-up', () => {
    const r = parseTrainerEffect(
      'Heal all damage from 1 of your Pok\u00e9mon. If you do, discard all Energy from that Pok\u00e9mon.'
    );
    assert.equal(r.steps[0].type, 'healOneDiscardEnergy');
  });

  test('Welder: typed attach from hand plus the gated draw', () => {
    const r = parseTrainerEffect(
      'Attach up to 2 {R} Energy cards from your hand to 1 of your Pok\u00e9mon. If you do, draw 3 cards.'
    );
    assert.equal(r.steps[0].type, 'attachFromHand');
    assert.equal(r.steps[0].handCount, 2);
    assert.deepEqual(r.steps[0].handEnergy, { basic: true, types: ['fire'] });
    assert.equal(r.steps[1].type, 'draw');
    assert.equal(r.steps[1].count, 3);
  });

  test('Switch Raft: switch clause precedes the heal', () => {
    const r = parseTrainerEffect(
      'Switch your Active {W} Pok\u00e9mon with 1 of your Benched Pok\u00e9mon. If you do, heal 30 damage from the Pok\u00e9mon you moved to your Bench.'
    );
    assert.deepEqual(r.steps.map((s) => s.type), ['switchOwn', 'healAmount']);
    assert.equal(r.steps[1].amount, 30);
  });

  test("Tate & Liza stays Choose-1: no unconditional own switch", () => {
    const r = parseTrainerEffect(
      'Choose 1: Shuffle your hand into your deck. Then, draw 5 cards. Switch your Active Pok\u00e9mon with 1 of your Benched Pok\u00e9mon.'
    );
    assert.equal(r.steps.some((s) => s.type === 'switchOwn'), false);
  });

  test('Faba targets the Lost Zone, not the discard pile', () => {
    const r = parseTrainerEffect(
      'Choose a Pok\u00e9mon Tool or Special Energy card attached to 1 of your opponent\u2019s Pok\u00e9mon, or any Stadium card in play, and put it in the Lost Zone.'
    );
    assert.equal(r.steps[0].type, 'toolOrStadiumToLostZone');
    assert.equal(r.steps[0].side, 'opponent');
    assert.equal(r.steps[0].includeSpecialEnergy, true);
    assert.match(describeStep(r.steps[0]), /Special Energy/);
  });

  test('Peeking Red Card: whole-hand shuffle, then draw that many', () => {
    const r = parseTrainerEffect(
      'Your opponent reveals their hand. You may have your opponent count the cards in their hand, shuffle those cards into their deck, then draw that many cards.'
    );
    assert.equal(r.steps[0].type, 'opponentHandShuffleDeck');
    assert.equal(r.steps[0].all, true);
    assert.equal(r.steps[0].drawThatMany, true);
    assert.match(describeStep(r.steps[0]), /whole hand/);
  });

  test('Missing Clover single mode looks at 1 card, not the default 7', () => {
    const r = parseTrainerEffect(
      'You may play 4 Missing Clover cards at once. If you played 1 card, look at the top card of your deck. If you played 4 cards, take a Prize card. (This effect works one time for 4 cards.)'
    );
    assert.equal(r.steps[0].type, 'lookAtTop');
    assert.equal(r.steps[0].count, 1);
  });

  test('Bug Catcher / heads-only draw flips keep their coin gate', () => {
    const bugCatcher = parseTrainerEffect('Draw 2 cards. Flip a coin. If heads, draw 2 more cards.');
    assert.deepEqual(bugCatcher.steps.map((s) => s.type), ['draw', 'coinFlip']);
    assert.equal(bugCatcher.steps[0].count, 2);
    assert.equal(bugCatcher.steps[1].heads[0].count, 2);
    assert.deepEqual(bugCatcher.steps[1].tails, []);

    const headsOnly = parseTrainerEffect('Flip a coin. If heads, draw 2 cards.');
    assert.equal(headsOnly.steps.length, 1);
    assert.equal(headsOnly.steps[0].type, 'coinFlip');
  });

  test("Mars: the random discard follows the draw", () => {
    const r = parseTrainerEffect(
      'Draw 2 cards. If you do, discard a random card from your opponent\u2019s hand.'
    );
    assert.deepEqual(r.steps.map((s) => s.type), [
      'draw',
      'discardRandomOpponentHandIfSupporter',
    ]);
    assert.equal(r.steps[1].any, true);
  });
});
