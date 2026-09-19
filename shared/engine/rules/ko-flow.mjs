// KO & prize flow: knockouts award prize cards, track the prize count,
    // and detect win conditions (all prizes taken / no Pokémon left / deck-out).
    
    import { rulesState } from './rules-state.mjs';
    import {
      isExCard,
      isGxCard,
      isMegaCard,
      prizesForKO,
    } from './card-classify.mjs';

    // Card classification now lives in one place (rulebook 30c Phase 0).
    // Re-exported here so existing ko-flow.mjs importers keep working.
    export { isExCard, isGxCard, isMegaCard, prizesForKO };

    // prize state per player (prizes they have TAKEN, 0..6)
    export const prizeState = {
      self: { taken: 0 },
      opp: { taken: 0 },
    };
    
    export function resetPrizes() {
      prizeState.self.taken = 0;
      prizeState.opp.taken = 0;
    }
    
    // KO outcome for a card, per official rules: a Knockout always awards
    // prize cards, counted by prizesForKO (ex/GX/... = 2, VMAX/TAG TEAM/V-UNION
    // = 3). There is no match-loss-on-KO rule; a GX Knockout is worth 2 prizes.
    // Returns { type: 'prizes', count: number }.
    export function koOutcome(card = {}) {
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
    // A zone's card array can drift empty while its cards are still rendered
    // (seen after a reset + re-setup in 2P). Losing the game on a stale array
    // is far worse than missing a real no-Pokémon loss for one check, so a zone
    // counts as occupied if either the array or the rendered board says so.
    export function occupiedZoneCount({ arrayCount, renderedCount }) {
      return Math.max(Number(arrayCount) || 0, Number(renderedCount) || 0);
    }

    export function checkWinConditions({ activeCounts, deckCounts, turnPlayer }) {
      // deck-out: the player who must draw but can't loses
      if (deckCounts && deckCounts[turnPlayer] === 0) {
        return { over: true, winner: turnPlayer === 'self' ? 'opp' : 'self', reason: 'deck-out' };
      }
      // no Pokémon in play (active + bench empty) = loss for that player.
      // If BOTH players are simultaneously emptied, neither wins outright:
      // report the draw so the caller can start a sudden-death tiebreaker.
      if (activeCounts) {
        const emptyPlayers = ['self', 'opp'].filter(
          (p) => (activeCounts[p]?.active || 0) + (activeCounts[p]?.bench || 0) === 0
        );
        if (emptyPlayers.length === 2) {
          return { over: true, simultaneous: ['self', 'opp'], reason: 'no Pokémon in play' };
        }
        if (emptyPlayers.length === 1) {
          const p = emptyPlayers[0];
          return { over: true, winner: p === 'self' ? 'opp' : 'self', reason: 'no Pokémon in play' };
        }
      }
      return { over: false };
    }
    
    // Called when the attack engine reports a KO. Handles prize award + any
    // win check. Returns an announcement payload for the UI.
    export function handleKO({ attackerPlayer, defender, defenderBoard, prizeCountOverride }) {
      // A Knockout always awards prizes (GX included: 2). The attacker only
      // wins when the award reaches all 6; simultaneous board-empties are
      // detected separately by checkWinConditions.
      const prizeCount = prizeCountOverride ?? prizesForKO(defender);
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
    
