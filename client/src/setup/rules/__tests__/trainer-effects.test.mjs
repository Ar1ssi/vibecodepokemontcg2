import test from 'node:test';
    import assert from 'node:assert/strict';
    
    const { parseTrainerEffect, describeStep } = await import('../trainer-effects.mjs');
    
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
      assert.equal(r.steps[0].energyType, 'Psychic');
    });
    
    test('Iono: both shuffle', () => {
      const r = parseTrainerEffect("Each player shuffles their hand and puts it on the bottom of their deck.");
      assert.equal(r.steps[0].type, 'ionoShuffle');
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
    