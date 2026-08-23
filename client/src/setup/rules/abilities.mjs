// Pokémon ability parser: structured guidance for the starter decks'
    // abilities, same style as the Trainer effect parser.
    
    export function parseAbility(text = '') {
      const lower = text.toLowerCase();
      const steps = [];
    
      if (lower.includes('once during your turn') && lower.includes('search your deck')) {
        steps.push({ type: 'searchAbility', guidance: 'Once during your turn: search your deck as the ability describes (deck unlocks while resolving).' });
      }
      if (lower.includes('draw') && lower.includes('cards')) {
        const m = lower.match(/draw (\d+) cards?/);
        if (m) steps.push({ type: 'drawAbility', count: Number(m[1]), guidance: `Once during your turn: draw ${m[1]} cards.` });
      }
      if (lower.includes('switch') && lower.includes('active')) {
        steps.push({ type: 'switchAbility', guidance: 'Once during your turn: switch as described.' });
      }
      if (lower.includes('heal')) {
        steps.push({ type: 'healAbility', guidance: 'Once during your turn: heal as described.' });
      }
      if (lower.includes('attach') && lower.includes('energy')) {
        steps.push({ type: 'attachAbility', guidance: 'Once during your turn: attach energy as described.' });
      }
      if (steps.length === 0 && text) {
        steps.push({ type: 'passiveAbility', guidance: 'Passive ability — always active while in play.' });
      }
      return steps;
    }
    
    export function describeAbilityStep(step) {
      return step.guidance || '';
    }
    