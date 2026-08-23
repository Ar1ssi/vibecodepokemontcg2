// Mulligan flow: after setup, each player's opening hand must contain at
    // least one Basic Pokémon. A player without one reshuffles and redraws;
    // their opponent then draws a bonus card for each mulligan taken.
    
    import { ensureCardData } from './rules-state.mjs';
    
    // Does this hand contain a Basic Pokémon? (card.stage is on enriched data;
    // for unenriched cards we check the name-independent API data)
    export async function handHasBasic(hand = []) {
      for (const card of hand) {
        await ensureCardData(card);
        if ((card.stage || 'Basic') === 'Basic' && card.hp) {
          return true;
        }
      }
      return false;
    }
    
    // Evaluate both players' hands post-setup. Returns guidance steps.
    export async function evaluateMulligans({ selfHand = [], oppHand = [] } = {}) {
      const selfOk = await handHasBasic(selfHand);
      const oppOk = await handHasBasic(oppHand);
    
      const steps = [];
      if (!selfOk) {
        steps.push({ player: 'self', mulligan: true, guidance: 'No Basic Pokémon in your hand — shuffle it back into your deck, redraw 7, and your opponent draws a bonus card.' });
      }
      if (!oppOk) {
        steps.push({ player: 'opp', mulligan: true, guidance: "Opponent has no Basic Pokémon — they mulligan and redraw; you may draw a bonus card." });
      }
      if (steps.length === 0) {
        steps.push({ player: 'both', mulligan: false, guidance: 'Both hands contain a Basic Pokémon — no mulligans.' });
      }
      return steps;
    }
    
    // Bonus draws owed to a player (one per opponent mulligan)
    export function bonusDrawsOwed(opponentMulliganCount) {
      return Math.max(0, opponentMulliganCount);
    }
    