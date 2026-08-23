// Evolution legality: a Pokémon can't evolve (1) on either player's first
    // turn of the game, (2) the same turn it was played to the bench/active,
    // (3) twice in one turn. Rare Candy skips stage 1.
    
    import { rulesState, ensureCardData } from './rules-state.mjs';
    
    export async function canEvolve(player, baseCardInPlay, evolutionCardInHand, wasPlayedThisTurn) {
      if (!rulesState.enabled) return { allowed: true };
    
      if (rulesState.turnNumber <= 1) {
        return { allowed: false, reason: "Can't evolve on the first turn." };
      }
    
      if (wasPlayedThisTurn) {
        return { allowed: false, reason: "That Pokémon was just played this turn — it can't evolve yet." };
      }
    
      await ensureCardData(baseCardInPlay);
      await ensureCardData(evolutionCardInHand);
    
      // stage chain check: evolution must be exactly the next stage (or a
      // legal Rare Candy jump from Basic to Stage 2)
      const baseStage = baseCardInPlay.stage || 'Basic';
      const evoStage = evolutionCardInHand.stage || 'Stage 1';
      const evolvesFrom = String(evolutionCardInHand.evolvesFrom || '').toLowerCase();
      const baseName = String(baseCardInPlay.name || '').toLowerCase();
    
      if (evolvesFrom && baseName && evolvesFrom !== baseName) {
        return { allowed: false, reason: `${evolutionCardInHand.name} evolves from ${evolutionCardInHand.evolvesFrom}, not ${baseCardInPlay.name}.` };
      }
    
      const order = ['Basic', 'Stage 1', 'Stage 2'];
      const baseIdx = order.indexOf(baseStage);
      const evoIdx = order.indexOf(evoStage);
      if (evoIdx !== baseIdx + 1) {
        return { allowed: false, reason: `${evoStage} can't evolve from ${baseStage} directly (needs Rare Candy for a skip).` };
      }
    
      // once per turn per card
      const key = baseName;
      if (rulesState.flags[player]?.evolved?.[key]) {
        return { allowed: false, reason: 'Already evolved that Pokémon this turn.' };
      }
    
      return { allowed: true };
    }
    
    // Rare Candy: Basic -> Stage 2 directly (item, so it also needs the item
    // to be playable — the item rules are handled by trainer guidance)
    export function isRareCandyJump(baseCardInPlay, evolutionCardInHand) {
      const baseStage = baseCardInPlay.stage || 'Basic';
      const evoStage = evolutionCardInHand.stage || 'Stage 1';
      return baseStage === 'Basic' && evoStage === 'Stage 2';
    }
    
    export function markEvolvedThisTurn(player, baseCardName) {
      const f = rulesState.flags[player];
      if (f) f.evolved[baseCardName.toLowerCase()] = true;
    }
    