// KO & prize flow: knockouts award prize cards, track the prize count,
    // and detect win conditions (all prizes taken / no Pokémon left / deck-out).
    
    import { rulesState } from './rules-state.mjs';
    
    // prize state per player (prizes they have TAKEN, 0..6)
    export const prizeState = {
      self: { taken: 0 },
      opp: { taken: 0 },
    };
    
    export function resetPrizes() {
      prizeState.self.taken = 0;
      prizeState.opp.taken = 0;
    }
    
    // How many prizes does knocking out this card award?
    // Modern rules: ex Pokémon give 2 prizes; V/VMAX/VSTAR gave 1-3; standard 1.
    export function prizesForKO(card = {}) {
      const rarity = String(card.rarity || '').toLowerCase();
      const subtypes = Array.isArray(card.subtypes) ? card.subtypes.map(s => String(s).toLowerCase()) : [];
      if (rarity.includes('double rare') || subtypes.includes('ex')) return 2;
      if (subtypes.includes('vmax')) return 3;
      if (subtypes.includes('vstar') || subtypes.includes('v')) return 2;
      if (rarity.includes('mega')) return 2;
      return 1;
    }
    
    // Award prizes to the attacking player. Returns the new count and whether
    // the game is now won.
    export function awardPrizes(player, count = 1) {
      prizeState[player].taken += count;
      const total = prizeState[player].taken;
      return { total, won: total >= 6, remaining: Math.max(0, 6 - total) };
    }
    
    // ── win detection ────────────────────────────────────────────────────
    export function checkWinConditions({ activeCounts, deckCounts, turnPlayer }) {
      // deck-out: the player who must draw but can't loses
      if (deckCounts && deckCounts[turnPlayer] === 0) {
        return { over: true, winner: turnPlayer === 'self' ? 'opp' : 'self', reason: 'deck-out' };
      }
      // no Pokémon in play (active + bench empty) = loss for that player
      if (activeCounts) {
        for (const p of ['self', 'opp']) {
          if ((activeCounts[p]?.active || 0) + (activeCounts[p]?.bench || 0) === 0) {
            return { over: true, winner: p === 'self' ? 'opp' : 'self', reason: 'no Pokémon in play' };
          }
        }
      }
      return { over: false };
    }
    
    // Called when the attack engine reports a KO. Handles prize award + any
    // win check. Returns an announcement payload for the UI.
    export function handleKO({ attackerPlayer, defender, defenderBoard }) {
      const prizeCount = prizesForKO(defender);
      const award = awardPrizes(attackerPlayer, prizeCount);
      return {
        prizeCount,
        prizesTaken: award.total,
        prizesRemaining: award.remaining,
        won: award.won,
      };
    }
    
    // ── bench limits & promotion ──────────────────────────────────────────
    export const BENCH_LIMIT = 5;
    
    export function canAddToBench(currentBenchCount) {
      if (currentBenchCount >= BENCH_LIMIT) {
        return { allowed: false, reason: `Bench is full (${BENCH_LIMIT}).` };
      }
      return { allowed: true };
    }
    
    // After a KO, the defending player must promote a bench Pokémon to active.
    // Returns guidance text for the announcement.
    export function promotionGuidance(defenderPlayer, benchCount) {
      if (benchCount === 0) {
        return null; // no promotion possible — win condition handled elsewhere
      }
      return `${defenderPlayer === 'self' ? 'You' : 'Opponent'} must promote a benched Pokémon to Active.`;
    }
    