// Evolution legality: a Pokémon can't evolve (1) on either player's first
    // turn of the game, (2) the same turn it was played to the bench/active,
    // (3) twice in one turn. Rare Candy skips stage 1.
    
    import { rulesState, ensureCardData } from './rules-state.mjs';
    import { getStadiumEvolutionSpeed } from './stadium-effects.mjs';
    
    export async function canEvolve(player, baseCardInPlay, evolutionCardInHand, wasPlayedThisTurn) {
      if (!rulesState.enabled) return { allowed: true };
    
      if (rulesState.turnNumber <= 1) {
        return { allowed: false, reason: "Can't evolve on the first turn." };
      }
    
      // Stadium evolution-speed modifier ("as if it had been in play for 1
      // more turn") relaxes the just-played gate; "costs N less Energy" is
      // surfaced as `costReduce` for the cost layer (no live charge site yet).
      const evoSpeed = getStadiumEvolutionSpeed(player, baseCardInPlay);
      if (wasPlayedThisTurn && !evoSpeed.relaxTurnGate) {
        return { allowed: false, reason: "That Pokémon was just played this turn — it can't evolve yet." };
      }
    
      await ensureCardData(baseCardInPlay);
      await ensureCardData(evolutionCardInHand);
    
      // stage chain check: evolution must be exactly the next stage (or a
      // legal Rare Candy jump from Basic to Stage 2)
      const baseStage = normalizeStage(baseCardInPlay.stage) || 'Basic';
      const evoStage = normalizeStage(evolutionCardInHand.stage);
      // A card in hand that has no valid stage (e.g. a misclassified Energy
      // card) is not a Pokémon evolution — reject it instead of silently
      // defaulting to 'Stage 1' and mis-evaluating the stage chain.
      if (!evoStage) {
        return {
          allowed: false,
          reason: `${evolutionCardInHand.name} is not a Pokémon evolution card (no valid stage).`,
        };
      }
      const evolvesFrom = String(evolutionCardInHand.evolvesFrom || '').toLowerCase();
      const baseName = String(baseCardInPlay.name || '').toLowerCase();
    
      if (evolvesFrom && baseName && evolvesFrom !== baseName) {
        return { allowed: false, reason: `${evolutionCardInHand.name} evolves from ${evolutionCardInHand.evolvesFrom}, not ${baseCardInPlay.name}.` };
      }
    
      const order = ['Basic', 'Stage 1', 'Stage 2'];
      const baseIdx = order.indexOf(baseStage);
      const evoIdx = order.indexOf(evoStage);
      // Basic -> Stage 2 is only legal with a Rare Candy (item) — the item's
      // own play rules are trainer guidance; here we permit the stage skip.
      const rareCandyJump = isRareCandyJump(baseCardInPlay, evolutionCardInHand);
      if (evoIdx !== baseIdx + 1 && !rareCandyJump) {
        return { allowed: false, reason: `${evoStage} can't evolve from ${baseStage} directly (needs Rare Candy for a skip).` };
      }
    
      // once per turn per card
      const key = baseName;
      if (rulesState.flags[player]?.evolved?.[key]) {
        return { allowed: false, reason: 'Already evolved that Pokémon this turn.' };
      }
    
      return { allowed: true, costReduce: evoSpeed.costReduce };
    }
    
    // Stage strings vary by source: local card data uses 'Stage 1' while
    // TCGdex can return 'Stage1' (and case can differ). Canonicalize to the
    // 'Basic' | 'Stage 1' | 'Stage 2' forms used by the stage-order check.
    export function normalizeStage(stage) {
      const s = String(stage || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (s === 'basic') return 'Basic';
      if (s === 'stage1') return 'Stage 1';
      if (s === 'stage2') return 'Stage 2';
      return null;
    }
    
    // Rare Candy: Basic -> Stage 2 directly (item, so it also needs the item
    // to be playable — the item rules are handled by trainer guidance)
    export function isRareCandyJump(baseCardInPlay, evolutionCardInHand) {
      const baseStage = normalizeStage(baseCardInPlay.stage) || 'Basic';
      const evoStage = normalizeStage(evolutionCardInHand.stage) || 'Stage 1';
      return baseStage === 'Basic' && evoStage === 'Stage 2';
    }
    
    export function markEvolvedThisTurn(player, baseCardName) {
      const f = rulesState.flags[player];
      if (f) f.evolved[baseCardName.toLowerCase()] = true;
    }
    