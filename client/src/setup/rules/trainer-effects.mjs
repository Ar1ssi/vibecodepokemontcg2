// Trainer/Supporter effect parser: converts printed card text into
    // structured effect steps the rules engine can guide a player through.
    // Grounded in the actual text of the Mega Battle starter decks.
    
    // Effect step vocabulary:
    //   { type: 'draw', count: N }
    //   { type: 'shuffleHandThenDraw', count: N, bonusCount: M, bonusWhen: 'prizes==6' }
    //   { type: 'discardHandThenDraw', count: N }
    //   { type: 'searchDeck', what: 'Item+Tool' | 'Basic Pokemon' | 'Pokemon' | ... , destination: 'hand'|'bench', count: N }
    //   { type: 'lookAtTop', count: N, pick: 'Supporter'|'Dark Pokemon', destination: 'hand'|'bench' }
    //   { type: 'switchOwn' }
    //   { type: 'switchOpponent' }
    //   { type: 'discardCost', count: N }
    //   { type: 'recursion', what: 'Pokemon|Energy', from: 'discard' }
    //   { type: 'heal', target: 'Mega Evolution ex' }
    //   { type: 'attachFromDiscard', energyType: 'Psychic', target: 'Bench Psychic' }
    
    export function parseTrainerEffect(text = '') {
      const lower = text.toLowerCase();
      const steps = [];
    
      // discard-hand-then-draw (Professor's Research)
      if (lower.includes('discard your hand and draw')) {
        const m = lower.match(/draw (\d+) cards?/);
        steps.push({ type: 'discardHandThenDraw', count: m ? Number(m[1]) : 7 });
        return { steps, recognizable: true };
      }
    
      // shuffle hand then draw (Lillie's Determination)
      if (lower.includes('shuffle your hand into your deck')) {
        const m = lower.match(/draw (\d+) cards?/);
        const b = lower.match(/draw (\d+) cards? instead/);
        steps.push({
          type: 'shuffleHandThenDraw',
          count: m ? Number(m[1]) : 6,
          bonusCount: b ? Number(b[1]) : null,
          bonusWhen: 'prizesRemaining==6',
        });
        return { steps, recognizable: true };
      }
    
      // search deck → hand
      if (lower.includes('search your deck for')) {
        let what = 'card';
        let count = 1;
        let destination = 'hand';
        if (lower.includes('item card and a pokémon tool card')) what = 'Item + Pokémon Tool';
        else if (lower.includes('basic pokémon, a stage 1 pokémon, and a stage 2 pokémon')) { what = 'Basic/Stage1/Stage2 Pokémon'; count = 3; }
        else if (lower.includes('up to 2 basic pokémon')) { what = 'Basic Pokémon ≤70 HP'; count = 2; }
        else if (lower.includes('basic pokémon') && lower.includes('onto your bench')) { what = 'Basic Pokémon'; destination = 'bench'; }
        else if (lower.includes('mega evolution pokémon ex')) what = 'Mega Evolution Pokémon ex';
        else if (lower.includes('pokémon')) what = 'Pokémon';
        steps.push({ type: 'searchDeck', what, count, destination });
        const costMatch = lower.match(/discard (\d+) other cards/);
        if (costMatch) {
          steps.unshift({ type: 'discardCost', count: Number(costMatch[1]) });
        }
        return { steps, recognizable: true };
      }
    
      // bare draw (standalone, e.g. "Draw 2 cards." / "Then, draw 3 cards.")
      // placed after the search branch so "search… then draw" cards keep
      // their search step (the picker is the interactive part)
      if (/draw (\d+) cards?/.test(lower)) {
        const m = lower.match(/draw (\d+) cards?/);
        steps.push({ type: 'draw', count: Number(m[1]) });
        return { steps, recognizable: true };
      }

      // look at top N (Pokégear, Grimsley's Move)
      if (lower.includes('look at the top')) {
        const m = lower.match(/top (\d+) cards?/);
        let pick = 'any';
        if (lower.includes('supporter card')) pick = 'Supporter';
        else if (lower.includes('onto your bench')) pick = 'Darkness Pokémon (bench)';
        steps.push({
          type: 'lookAtTop',
          count: m ? Number(m[1]) : 7,
          pick,
          destination: lower.includes('onto your bench') ? 'bench' : 'hand',
        });
        return { steps, recognizable: true };
      }
    
      // switches
      if (lower.includes("switch in 1 of your opponent's benched pokémon")) {
        steps.push({ type: 'switchOpponent' });
        return { steps, recognizable: true };
      }
      if (lower.includes('switch your active pokémon with 1 of your benched pokémon')) {
        steps.push({ type: 'switchOwn' });
        return { steps, recognizable: true };
      }
    
      // recursion from discard (Night Stretcher)
      if (lower.includes('from your discard pile into your hand')) {
        let what = 'card';
        if (lower.includes('pokémon or a basic energy')) what = 'Pokémon or Basic Energy';
        steps.push({ type: 'recursion', what, from: 'discard' });
        return { steps, recognizable: true };
      }
    
      // heal (Wally's Compassion)
      if (lower.includes('heal all damage')) {
        steps.push({ type: 'heal', target: lower.includes('mega evolution') ? 'Mega Evolution Pokémon ex' : 'Pokémon' });
        return { steps, recognizable: true };
      }
    
      // attach from discard (Wondrous Patch)
      if (lower.includes('attach a basic') && lower.includes('from your discard pile')) {
        steps.push({ type: 'attachFromDiscard', energyType: lower.includes('{p}') ? 'Psychic' : 'Energy', target: 'Bench' });
        return { steps, recognizable: true };
      }
    
      // both players shuffle hands to bottom (Iono)
      if (lower.includes('each player shuffles their hand')) {
        steps.push({ type: 'ionoShuffle' });
        return { steps, recognizable: true };
      }
    
      // tool/stadium passive effects — recognized but not stepped
      if (lower.includes('retreat cost') || lower.includes('whenever any player') || lower.includes('is damaged by an attack')) {
        return { steps: [{ type: 'passive' }], recognizable: true };
      }
    
      return { steps: [], recognizable: false };
    }
    
    // Human-readable guidance for each step — this is what gets announced.
    export function describeStep(step) {
      switch (step.type) {
        case 'draw': return `Draw ${step.count} card${step.count > 1 ? 's' : ''}.`;
        case 'discardHandThenDraw': return `Discard your hand, then draw ${step.count} cards.`;
        case 'shuffleHandThenDraw': return `Shuffle your hand into the deck, then draw ${step.count} cards${step.bonusCount ? ` (${step.bonusCount} if 6 prizes left)` : ''}.`;
        case 'searchDeck': return `Search your deck for ${step.count > 1 ? step.count + ' ' : ''}${step.what} → ${step.destination === 'bench' ? 'put on Bench' : 'add to hand'}, then shuffle.`;
        case 'lookAtTop': return `Look at the top ${step.count} cards; take a ${step.pick} to ${step.destination === 'bench' ? 'Bench' : 'hand'}, shuffle the rest.`;
        case 'switchOpponent': return "Choose 1 of your opponent's Benched Pokémon to switch into the Active Spot.";
        case 'switchOwn': return 'Switch your Active Pokémon with 1 of your Benched Pokémon.';
        case 'discardCost': return `Discard ${step.count} other cards from your hand (cost).`;
        case 'recursion': return `Put a ${step.what} from your discard pile into your hand.`;
        case 'heal': return `Heal all damage from your ${step.target}.`;
        case 'attachFromDiscard': return `Attach a basic ${step.energyType} Energy from your discard pile to 1 of your benched ${step.energyType} Pokémon.`;
        case 'ionoShuffle': return 'Both players shuffle hands to the bottom of their decks and draw fresh hands.';
        case 'passive': return 'Passive effect — stays in play.';
        default: return '';
      }
    }
    