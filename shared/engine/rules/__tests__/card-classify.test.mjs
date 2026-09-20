import test from 'node:test';
    import assert from 'node:assert/strict';

    const {
      isExCard,
      isGxCard,
      isTagTeamCard,
      isVUnionCard,
      isVmaxCard,
      isVstarCard,
      isVCard,
      isTeraCard,
      isMegaCard,
      isModernMegaCard,
      isLegacyMegaCard,
      isPrismStarCard,
      isAceSpecCard,
      isRadiantCard,
      isLegendCard,
      isTeamFlareHyperGearCard,
      isBasicEnergy,
      isRuleBoxPokemon,
      prizesForKO,
    } = await import('../card-classify.mjs');

    const card = (props) => ({ name: '', supertype: 'Pokémon', ...props });

    // ── individual subtypes ────────────────────────────────────────────────
    test('isExCard: subtype wins, name "-EX"/"ex" suffix falls back', () => {
      assert.equal(isExCard(card({ subtypes: ['ex'] })), true);
      assert.equal(isExCard(card({ name: 'Cetitan ex' })), true);
      assert.equal(isExCard(card({ name: 'Pikachu ex' })), true);
      assert.equal(isExCard(card({ name: 'M Venusaur-EX' })), true);
      assert.equal(isExCard(card({ name: 'Cetitan' })), false);
    });

    test('isExCard / isGxCard: the suffix needs a separator ("Toxapex" is not ex)', () => {
      assert.equal(isExCard(card({ name: 'Toxapex' })), false);
      assert.equal(isExCard(card({ name: 'Slowkingex' })), false);
      assert.equal(isExCard(card({ name: 'Pikachu ex' })), true);
      assert.equal(isExCard(card({ name: 'Mewtwo-EX' })), true);
      assert.equal(isGxCard(card({ name: 'Thwackgx' })), false);
      assert.equal(isGxCard(card({ name: 'Ninetales-GX' })), true);
    });

    test('isGxCard: subtype wins, name "GX" suffix falls back', () => {
      assert.equal(isGxCard(card({ subtypes: ['GX'] })), true);
      assert.equal(isGxCard(card({ name: 'Ninetales GX' })), true);
      assert.equal(isGxCard(card({ name: 'Ninetales' })), false);
      assert.equal(isGxCard(card({ name: 'Cetitan ex' })), false);
    });

    test('isTagTeamCard: subtype, or "<A> & <B>-GX" name fallback', () => {
      assert.equal(isTagTeamCard(card({ subtypes: ['TAG TEAM'] })), true);
      assert.equal(isTagTeamCard(card({ name: 'Pikachu & Zekrom-GX' })), true);
      assert.equal(isTagTeamCard(card({ name: 'Reshiram & Charizard-GX' })), true);
      assert.equal(isTagTeamCard(card({ name: 'Ninetales GX' })), false);
      assert.equal(isTagTeamCard(card({ name: 'Zekrom-GX' })), false);
    });

    test('isVUnionCard: subtype, or name ending "V-UNION"', () => {
      assert.equal(isVUnionCard(card({ subtypes: ['V-UNION'] })), true);
      assert.equal(isVUnionCard(card({ name: 'Mewtwo V-UNION' })), true);
      assert.equal(isVUnionCard(card({ name: 'Mewtwo' })), false);
    });

    test('isVmaxCard / isVstarCard: subtype or name suffix', () => {
      assert.equal(isVmaxCard(card({ subtypes: ['VMAX'] })), true);
      assert.equal(isVmaxCard(card({ name: 'Lapras VMAX' })), true);
      assert.equal(isVmaxCard(card({ name: 'Lapras' })), false);
      assert.equal(isVstarCard(card({ subtypes: ['VSTAR'] })), true);
      assert.equal(isVstarCard(card({ name: 'Lugia VSTAR' })), true);
      assert.equal(isVstarCard(card({ name: 'Lugia V' })), false);
    });

    test('isVCard: V, VMAX, VSTAR and V-UNION all count as Pokémon V', () => {
      assert.equal(isVCard(card({ subtypes: ['V'] })), true);
      assert.equal(isVCard(card({ name: 'Pikachu V' })), true);
      assert.equal(isVCard(card({ name: 'Lapras VMAX' })), true);
      assert.equal(isVCard(card({ name: 'Lugia VSTAR' })), true);
      assert.equal(isVCard(card({ name: 'Mewtwo V-UNION' })), true);
      assert.equal(isVCard(card({ name: 'Lapras' })), false);
    });

    test('isTeraCard: subtype, Tera rule text, or name marker', () => {
      assert.equal(isTeraCard(card({ subtypes: ['Tera'] })), true);
      assert.equal(isTeraCard(card({ ability: { text: 'Tera Rule: ...' } })), true);
      assert.equal(isTeraCard(card({ name: 'Tera Charizard ex' })), true);
      assert.equal(isTeraCard(card({ name: 'Charizard ex' })), false);
    });

    test('isMegaCard: modern "Mega X ex" and legacy "M X-EX"', () => {
      assert.equal(isMegaCard(card({ name: 'Mega Lucario ex' })), true);
      assert.equal(isMegaCard(card({ name: 'M Lucario-EX' })), true);
      assert.equal(isMegaCard(card({ rarity: 'Mega Hyper Rare' })), true);
      assert.equal(isMegaCard(card({ name: 'Yanmega' })), false);
      assert.equal(isMegaCard(card({ name: 'Cetitan ex' })), false);
    });

    test('M Venusaur-EX is a (legacy) Mega, not a modern Mega', () => {
      const legacy = card({ name: 'M Venusaur-EX' });
      assert.equal(isMegaCard(legacy), true);
      assert.equal(isLegacyMegaCard(legacy), true);
      assert.equal(isModernMegaCard(legacy), false);

      const modern = card({ name: 'Mega Venusaur ex' });
      assert.equal(isMegaCard(modern), true);
      assert.equal(isModernMegaCard(modern), true);
      assert.equal(isLegacyMegaCard(modern), false);
    });

    test('isPrismStarCard: subtype or the diamond marker', () => {
      assert.equal(isPrismStarCard(card({ subtypes: ['Prism Star'] })), true);
      assert.equal(isPrismStarCard(card({ name: '\u25c7 Solgaleo' })), true);
      assert.equal(isPrismStarCard(card({ name: 'Solgaleo' })), false);
    });

    test('isAceSpecCard: subtype only', () => {
      assert.equal(isAceSpecCard(card({ subtypes: ['ACE SPEC'] })), true);
      assert.equal(isAceSpecCard(card({ name: 'Computer Search' })), false);
    });

    test('isRadiantCard: subtype or "Radiant " name prefix', () => {
      assert.equal(isRadiantCard(card({ subtypes: ['Radiant'] })), true);
      assert.equal(isRadiantCard(card({ name: 'Radiant Greninja' })), true);
      assert.equal(isRadiantCard(card({ name: 'Greninja' })), false);
    });

    test('isLegendCard: subtype or LEGEND name marker', () => {
      assert.equal(isLegendCard(card({ subtypes: ['LEGEND'] })), true);
      assert.equal(isLegendCard(card({ name: 'Lugia LEGEND' })), true);
      assert.equal(isLegendCard(card({ name: 'Lugia' })), false);
      assert.equal(isLegendCard(card({ name: 'Legendary Beast' })), false);
    });

    test('isTeamFlareHyperGearCard: name marker or subtype (App. 24)', () => {
      assert.equal(
        isTeamFlareHyperGearCard(card({ name: 'Head Ringer Team Flare Hyper Gear' })),
        true
      );
      assert.equal(
        isTeamFlareHyperGearCard(card({ name: 'Jamming Net Team Flare Hyper Gear' })),
        true
      );
      assert.equal(isTeamFlareHyperGearCard(card({ subtypes: ['Team Flare Hyper Gear'] })), true);
      assert.equal(isTeamFlareHyperGearCard(card({ name: 'Bravery Charm' })), false);
      assert.equal(isTeamFlareHyperGearCard(card({ name: 'Team Flare Grunt' })), false);
    });

    test('isBasicEnergy: Basic Energy only, never Special Energy', () => {
      assert.equal(
        isBasicEnergy({ supertype: 'Energy', subtypes: ['Basic'] }),
        true
      );
      assert.equal(
        isBasicEnergy({ supertype: 'Energy', subtypes: ['Basic', 'Water'] }),
        true
      );
      assert.equal(
        isBasicEnergy({ supertype: 'Energy', subtypes: ['Special'] }),
        false
      );
      assert.equal(isBasicEnergy({ supertype: 'Trainer' }), false);
      assert.equal(isBasicEnergy({ name: 'Water Energy' }), false);
    });

    // ── rule box ───────────────────────────────────────────────────────────
    test('isRuleBoxPokemon: true for every rule-box subtype, false otherwise', () => {
      assert.equal(isRuleBoxPokemon(card({ subtypes: ['ex'] })), true);
      assert.equal(isRuleBoxPokemon(card({ subtypes: ['GX'] })), true);
      assert.equal(isRuleBoxPokemon(card({ subtypes: ['V'] })), true);
      assert.equal(isRuleBoxPokemon(card({ subtypes: ['VMAX'] })), true);
      assert.equal(isRuleBoxPokemon(card({ subtypes: ['VSTAR'] })), true);
      assert.equal(isRuleBoxPokemon(card({ subtypes: ['Tera'] })), true);
      assert.equal(isRuleBoxPokemon(card({ subtypes: ['Radiant'] })), true);
      assert.equal(isRuleBoxPokemon(card({ subtypes: ['Prism Star'] })), true);
      assert.equal(isRuleBoxPokemon(card({ subtypes: ['ACE SPEC'] })), true);
      assert.equal(isRuleBoxPokemon(card({ subtypes: ['TAG TEAM'] })), true);
      assert.equal(isRuleBoxPokemon(card({ subtypes: ['V-UNION'] })), true);
      assert.equal(isRuleBoxPokemon(card({ subtypes: ['LEGEND'] })), true);
      assert.equal(isRuleBoxPokemon(card({ name: 'Pikachu' })), false);
      assert.equal(isRuleBoxPokemon(card({ name: 'Eevee', rarity: 'Common' })), false);
      assert.equal(isRuleBoxPokemon(card({ name: 'Toxapex' })), false);
      assert.equal(isRuleBoxPokemon(null), false);
    });

    test('Toxapex is not an ex: 1 prize, not a Rule Box', () => {
      const toxapex = card({ name: 'Toxapex', hp: 130 });
      assert.equal(isExCard(toxapex), false);
      assert.equal(isRuleBoxPokemon(toxapex), false);
      assert.equal(prizesForKO(toxapex), 1);
    });

    test('isRuleBoxPokemon: name-fallback TAG TEAM and V-UNION are included', () => {
      assert.equal(isRuleBoxPokemon(card({ name: 'Pikachu & Zekrom-GX' })), true);
      assert.equal(isRuleBoxPokemon(card({ name: 'Mewtwo V-UNION' })), true);
    });

    test('Lapras VMAX is a rule-box Pokémon, Lapras is not', () => {
      assert.equal(isRuleBoxPokemon(card({ name: 'Lapras VMAX' })), true);
      assert.equal(isRuleBoxPokemon(card({ name: 'Lapras' })), false);
    });

    // ── prize table ────────────────────────────────────────────────────────
    test('prizesForKO: 3 for VMAX / TAG TEAM / V-UNION / modern Mega', () => {
      assert.equal(prizesForKO(card({ subtypes: ['VMAX'] })), 3);
      assert.equal(prizesForKO(card({ name: 'Lapras VMAX' })), 3);
      assert.equal(prizesForKO(card({ name: 'Pikachu & Zekrom-GX' })), 3);
      assert.equal(prizesForKO(card({ subtypes: ['TAG TEAM'] })), 3);
      assert.equal(prizesForKO(card({ name: 'Mewtwo V-UNION' })), 3);
      assert.equal(prizesForKO(card({ subtypes: ['V-UNION'] })), 3);
    });

    // Gen 9 Mega Evolution Pokémon ex (2025 Mega Evolution Series) give up 3
    // prizes; Gen 6 XY Mega Evolution Pokémon-EX give up 2 (rulebook, App. 1
    // vs. App. 14). Regression: Mega Greninja ex (Chaos Rising) awarded 2.
    test('prizesForKO: 3 for modern Mega ex, 2 for legacy Mega-EX', () => {
      assert.equal(prizesForKO(card({ name: 'Mega Greninja ex' })), 3);
      assert.equal(
        prizesForKO(
          card({ name: 'Mega Greninja ex', subtypes: ['Mega Evolution', 'ex'], rarity: 'Double Rare' })
        ),
        3
      );
      assert.equal(prizesForKO(card({ name: 'Mega Venusaur ex' })), 3);
      assert.equal(prizesForKO(card({ rarity: 'Mega Hyper Rare' })), 3);
      assert.equal(prizesForKO(card({ name: 'M Venusaur-EX' })), 2);
      assert.equal(prizesForKO(card({ name: 'M Lucario-EX' })), 2);
      assert.equal(prizesForKO(card({ name: 'Primal Kyogre-EX' })), 2);
    });

    // Legacy names must never classify as modern when the card data carries a
    // "MEGA" subtype token (TCGdex uses `stage: "MEGA"`, which importers can
    // surface as a subtype) — the printed name wins.
    test('legacy Mega-EX name overrides a mega subtype token', () => {
      const legacyWithSubtype = card({ name: 'M Lucario-EX', subtypes: ['MEGA', 'EX'] });
      assert.equal(isModernMegaCard(legacyWithSubtype), false);
      assert.equal(isLegacyMegaCard(legacyWithSubtype), true);
      assert.equal(prizesForKO(legacyWithSubtype), 2);
    });

    test('prizesForKO: 2 for ex / GX / V / VSTAR / LEGEND / Double Rare', () => {
      assert.equal(prizesForKO(card({ subtypes: ['ex'] })), 2);
      assert.equal(prizesForKO(card({ name: 'Cetitan ex' })), 2);
      assert.equal(prizesForKO(card({ name: 'Mewtwo GX' })), 2);
      assert.equal(prizesForKO(card({ name: 'Pikachu V' })), 2);
      assert.equal(prizesForKO(card({ name: 'Lugia VSTAR' })), 2);
      assert.equal(prizesForKO(card({ name: 'Lugia LEGEND' })), 2);
      assert.equal(prizesForKO(card({ rarity: 'Double rare' })), 2);
    });

    test('prizesForKO: 1 for an ordinary Pokémon', () => {
      assert.equal(prizesForKO(card({ name: 'Yanmega' })), 1);
      assert.equal(prizesForKO(card({ name: 'Lapras' })), 1);
      assert.equal(prizesForKO(card({ name: 'Pikachu' })), 1);
    });

    test('tricky pair: Lapras VMAX awards a different prize count than Lapras', () => {
      assert.notEqual(
        prizesForKO(card({ name: 'Lapras VMAX' })),
        prizesForKO(card({ name: 'Lapras' }))
      );
    });
