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
    
    // Card-class helpers (subtypes from TCGdex, with a name-suffix fallback
    // because `subtypes` only exists after the async `ensureCardData` loads).
    export function isExCard(card = {}) {
      const subtypes = Array.isArray(card.subtypes) ? card.subtypes.map(s => String(s).toLowerCase()) : [];
      if (subtypes.includes('ex')) return true;
      return String(card.name || '').toLowerCase().endsWith('ex');
    }

    export function isGxCard(card = {}) {
      const subtypes = Array.isArray(card.subtypes) ? card.subtypes.map(s => String(s).toLowerCase()) : [];
      if (subtypes.includes('gx')) return true;
      return String(card.name || '').toLowerCase().endsWith('gx');
    }

    // How many prizes does knocking out this card award?
    // Modern rules: ex gives 2 EXTRA prizes (3 total when KO'd); VMAX = 3;
    // V/VSTAR = 2; standard = 1. (GX doesn't award prizes — see `koOutcome`.)
    export function prizesForKO(card = {}) {
      const rarity = String(card.rarity || '').toLowerCase();
      const subtypes = Array.isArray(card.subtypes) ? card.subtypes.map(s => String(s).toLowerCase()) : [];
      if (isExCard(card) || rarity.includes('double rare')) return 3;
      if (subtypes.includes('vmax')) return 3;
      if (subtypes.includes('vstar') || subtypes.includes('v')) return 2;
      if (rarity.includes('mega')) return 2;
      return 1;
    }

    // Special KO outcome for a card, per official rules.
    //  - GX: the player who had the GX LOSES the match when it is KO'd.
    //  - everything else: award `count` prize cards (ex = 3, see prizesForKO).
    // Returns { type: 'matchLoss' } | { type: 'prizes', count: number }
    export function koOutcome(card = {}) {
      if (isGxCard(card)) return { type: 'matchLoss' };
      return { type: 'prizes', count: prizesForKO(card) };
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
      const outcome = koOutcome(defender);
      // GX rule: KO'ing the opponent's Pokémon GX wins the match immediately
      // (no prizes are taken for the GX knockout itself).
      if (outcome.type === 'matchLoss') {
        const taken = prizeState[attackerPlayer]?.taken || 0;
        return {
          prizeCount: 0,
          prizesTaken: taken,
          prizesRemaining: Math.max(0, 6 - taken),
          won: true,
          reason: 'opponent Pokémon GX was Knocked Out',
        };
      }
      const prizeCount = outcome.count;
      const award = awardPrizes(attackerPlayer, prizeCount);
      return {
        prizeCount,
        prizesTaken: award.total,
        prizesRemaining: award.remaining,
        won: award.won,
        reason: award.won ? 'all prize cards taken' : undefined,
      };
    }
    
    // ── bench limits & promotion ──────────────────────────────────────────
    export const BENCH_LIMIT = 5;
    
    export function canAddToBench(currentBenchCount, limit = BENCH_LIMIT) {
      if (currentBenchCount >= limit) {
        return { allowed: false, reason: `Bench is full (${limit}).` };
      }
      return { allowed: true };
    }
    
    // After a KO of the active Pokémon, the defending player must promote a
    // bench Pokémon to active. Returns a plan object for the UI to execute.
    // - activeKilled: the active Pokémon was KO'd (true) vs. a bench Pokémon (false).
    // - benchCount: how many Pokémon are currently on the bench.
    // Returns { promote: boolean, benchIndex: number|null, guidance: string|null }
    export function planPromotion(activeKilled, benchCount) {
      if (!activeKilled) {
        // Bench KO — no promotion needed.
        return { promote: false, benchIndex: null, guidance: null };
      }
      if (benchCount === 0) {
        // No bench Pokémon — game over (no Pokémon in play).
        return { promote: false, benchIndex: null, guidance: null };
      }
      // Default: first bench Pokémon (index 0) promotes.
      return {
        promote: true,
        benchIndex: 0,
        guidance: 'Promote the first benched Pokémon to Active.',
      };
    }

    // Legacy wrapper (kept for backward-compat with existing imports).
    export function promotionGuidance(defenderPlayer, benchCount) {
      const plan = planPromotion(true, benchCount);
      if (!plan.guidance) return null;
      return `${defenderPlayer === 'self' ? 'You' : 'Opponent'} must promote a benched Pokémon to Active.`;
    }
    