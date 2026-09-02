// Rules engine state — a TCG Live-style enforcement layer over the sim.
    // Tracks whose turn it is, what phase they're in, and what actions are
    // currently legal. All gating flows through canPerformAction().
    
    export const RULES_STORAGE_KEY = 'ptcg-sim.rules-enforced.v1';
    
    export const rulesState = {
      enabled: true,           // master switch (Settings toggle) — default on; loadRulesEnabled() may override from storage
      turnPlayer: 'self',      // whose turn: 'self' | 'opp'
      turnNumber: 0,
      phase: 'setup',          // setup | draw | main | attack | ended
      // Stadium currently on the field (both players share it): { user, card } | null
      stadium: null,
      mulligansResolved: false, // guard: mulligan execution runs at most once per game
      // per-player per-turn facts
      flags: {
        self: { energyAttached: false, attackerAttacked: false, evolved: {}, supporterPlayed: false, abilitiesUsed: {} },
        opp: { energyAttached: false, attackerAttacked: false, evolved: {}, supporterPlayed: false, abilitiesUsed: {} },
      },
    };
    
    // ── card data enrichment: type chart data from TCGdex card details ──
    // Weakness/resistance: TCGdex exposes { type, value } on card details.
    const cardDataCache = new Map();
    
    export async function ensureCardData(card) {
      if (!card?.id) return card;
      if (card.hp && card.weaknesses !== undefined) return card; // enriched
      if (cardDataCache.has(card.id)) {
        Object.assign(card, cardDataCache.get(card.id));
        return card;
      }
      try {
        const res = await fetch(`https://api.tcgdex.net/v2/en/cards/${card.id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const detail = await res.json();
        const data = {
          hp: detail.hp ? Number(detail.hp) : null,
          types: detail.types || [],
          weakness: parseTypeValue(detail.weaknesses?.[0]),
          resistance: parseTypeValue(detail.resistances?.[0]),
          retreatCost: detail.retreat ? detail.retreat.length : 0,
          attacks: (detail.attacks || []).map((a) => ({
            name: a.name,
            cost: a.cost || [],
            damage: parseDamage(a.damage),
            text: a.text || '',
          })),
          stage: detail.stage || null,
          evolvesFrom: detail.evolvesFrom || null,
          ability: detail.ability || null,
          subtypes: detail.subtypes || [],
          rarity: detail.rarity || card.rarity || '',
          effect: detail.effect || null,
          text: detail.text || null,
        };
        cardDataCache.set(card.id, data);
        Object.assign(card, data);
      } catch {
        cardDataCache.set(card.id, {});
      }
      return card;
    }
    
    const parseTypeValue = (wr) => {
      if (!wr) return null;
      return { type: wr.type, value: Number(String(wr.value).replace(/[^0-9-]/g, '')) || 0 };
    };
    
    const parseDamage = (dmg) => {
      if (dmg == null) return null;
      const n = Number(String(dmg).replace(/[^0-9]/g, ''));
      return Number.isFinite(n) ? n : null;
    };
    
    // ── turn/phase management ────────────────────────────────────────────
    // firstPlayer: who goes first ('self' | 'opp'). Defaults to 'self' so
    // existing callers/tests that invoke startGame() with no args keep
    // their prior behavior; rules-bridge passes the coin-flip winner.
    export function startGame(firstPlayer = 'self') {
      rulesState.turnNumber = 0;
      rulesState.turnPlayer = firstPlayer === 'opp' ? 'opp' : 'self';
      rulesState.phase = 'draw';
      rulesState.stadium = null; // new game: nothing on the stadium field
      rulesState.mulligansResolved = false;
      resetTurnFlags('self');
      resetTurnFlags('opp');
    }
    
    export function beginTurn(player) {
      rulesState.turnPlayer = player;
      rulesState.turnNumber += 1;
      rulesState.phase = 'main';
      resetTurnFlags(player);
    }
    
    export function endTurn(player) {
      const next = player === 'self' ? 'opp' : 'self';
      rulesState.turnPlayer = next;
      rulesState.turnNumber += 1;
      rulesState.phase = 'main';
      resetTurnFlags(next);
      return next;
    }
    
    function resetTurnFlags(player) {
      rulesState.flags[player] = { energyAttached: false, attackerAttacked: false, evolved: {}, supporterPlayed: false, abilitiesUsed: {}, stadiumUsed: false, drewThisTurn: false };
    }

    // Mark that the start-of-turn draw already happened for this player this
    // turn, so a duplicate rules-turn-began dispatch (two live hook sites, or a
    // re-render) cannot double-draw.
    export function markTurnDrawn(player) {
      if (rulesState.flags[player]) rulesState.flags[player].drewThisTurn = true;
    }

    // Mulligan execution gate: ensures the auto-reshuffle/redraw + bonus draw
    // runs at most once per game. Set true after the mulligan block executes.
    export function markMulligansResolved() {
      rulesState.mulligansResolved = true;
    }
    
    export function markEnergyAttached(player) {
      if (rulesState.flags[player]) rulesState.flags[player].energyAttached = true;
    }
    export function markSupporterPlayed(player) {
      if (rulesState.flags[player]) rulesState.flags[player].supporterPlayed = true;
    }
    
    // ── start-of-turn draw (taxonomy B: "Draw 1 at start of turn") ──────
    // Pure, DOM-free gate: should the turn-start player auto-draw exactly one
    // card? True only when rules are enabled, the draw hasn't happened yet this
    // turn, and there is at least one card left in the deck. The UI layer
    // (rules-bridge.js) calls the real draw() when this returns true.
    export function shouldAutoDrawAtTurnStart({ enabled = true, drewThisTurn = false, deckCount = 0 } = {}) {
      return Boolean(enabled) && !drewThisTurn && Number(deckCount) > 0;
    }

    // ── one Supporter per turn (taxonomy A2) ──────────────────────────
    // Pure, DOM-free gate: playing a Supporter is limited to one per turn.
    // Items are unlimited; Stadiums, Tools, and Special Supporters bypass
    // the limit entirely (Special Supporters may be played as many times as
    // their text allows).
    // cardType: supertype string ('Supporter', 'Item', 'Special Supporter', ...)
    // subtypes: optional TCGdex subtypes array as fallback discriminator.
    export function supporterPlayGate({ cardType, subtypes = [], supporterPlayed = false }) {
      const t = String(cardType || '').toLowerCase();
      const subs = (subtypes || []).map((s) => String(s).toLowerCase());
      const isSupporter =
        (t.includes('supporter') && !t.includes('special')) ||
        (subs.includes('supporter') && !subs.includes('special supporter'));
      if (!isSupporter) return { allowed: true };
      if (supporterPlayed) {
        return { allowed: false, reason: 'You already played a Supporter this turn (one per turn).' };
      }
      return { allowed: true };
    }
    // ── Stadium on the field (taxonomy E) ──────────────────────────
    // Both players share a single Stadium; playing a new one discards the
    // old one (the DOM/UI side already does that in update-stadium-card.js —
    // this is the *state* record so gates/effects can query it).
    // Pure, DOM-free. markStadiumPlayed stores { user, card } and returns
    // the previously-on-field object (or null) so the caller can announce
    // the replacement. Call it BEFORE updateStadiumCard discards the old card.
    export function markStadiumPlayed(user, card) {
      const previous = rulesState.stadium;
      rulesState.stadium = { user, card };
      return previous;
    }

    export function getStadium() {
      return rulesState.stadium;
    }

    // ── per-ability used-tracking (taxonomy C) ────────────────────
    // Pure, DOM-free replacement for the old img.__rulesAbilityUsed flag.
    // Abilities that may only be used once per turn record themselves here;
    // resetTurnFlags() clears the whole map each turn (startGame/beginTurn/
    // endTurn all call it), so no separate DOM-flag reset is required.
    // Keyed by a stable card identity so the same card on bench vs active, or
    // across client mirrors, maps to one slot.
    export function abilityKey(card) {
      if (!card) return 'unknown';
      if (card.id != null && card.id !== '') return `id:${card.id}`;
      const setNumber = card.number ?? card.set?.number ?? '';
      return `name:${card.name ?? 'unknown'}#${setNumber}`;
    }
    export function markAbilityUsed(player, card) {
      const f = rulesState.flags[player];
      if (f) f.abilitiesUsed[abilityKey(card)] = true;
    }
    export function abilityUsed(player, card) {
      return !!rulesState.flags[player]?.abilitiesUsed?.[abilityKey(card)];
    }

    // ── per-stadium used-tracking (taxonomy E, once-per-turn) ─────────
    // A stadium's once-per-turn effect can only be used once per turn by
    // each player. Reset in resetTurnFlags (startGame/beginTurn/endTurn).
    export function markStadiumUsed(player) {
      const f = rulesState.flags[player];
      if (f) f.stadiumUsed = true;
    }
    export function stadiumUsed(player) {
      return !!rulesState.flags[player]?.stadiumUsed;
    }

    export function markAttacked(player) {
      if (rulesState.flags[player]) rulesState.flags[player].attackerAttacked = true;
      rulesState.phase = 'attack'; // attacking ends the turn (auto)
    }
    export function markEvolved(player, cardName) {
      const f = rulesState.flags[player];
      if (f) f.evolved[cardName] = true;
    }
    export function markPrizeTaken(player) {
      // prize-taking after a KO doesn't change phase; just tracked
    }
    
    // ── action gating ────────────────────────────────────────────────────
    // Every free-form sim action flows through here when rules are enabled.
    export function canPerformAction({ user, action, zoneId, targetZoneId, initiator }) {
      if (!rulesState.enabled) return { allowed: true };
    
      const S = rulesState;
      const isYourTurn = user === S.turnPlayer;
    
      // during setup nobody acts except via the setup flow
      if (S.phase === 'setup') {
        return { allowed: false, reason: 'Set up the game first (Set Up button).' };
      }
      if (S.phase === 'ended') {
        return { allowed: false, reason: 'Game is over.' };
      }
    
      // spectating opponent's board: viewing is fine, moving is not
      const actingOnOwnBoard = user === initiator;
    
      switch (action) {
        case 'viewDeck':
          if (!isYourTurn && actingOnOwnBoard) {
            return { allowed: false, reason: "You can't look at your deck unless a card effect lets you." };
          }
          return { allowed: false, reason: "Deck is private — only card effects may search it." };
    
        case 'moveCard': {
          if (!isYourTurn) {
            return { allowed: false, reason: "It's not your turn." };
          }
          if (S.phase === 'attack') {
            return { allowed: false, reason: 'You already attacked — end your turn.' };
          }
          // energy attach: once per turn
          if (targetZoneId === 'active' || targetZoneId === 'bench') {
            // more specific checks happen at attach time via canAttachEnergy
          }
          return { allowed: true };
        }
    
        case 'attachEnergy':
          if (!isYourTurn) return { allowed: false, reason: "It's not your turn." };
          if (S.flags[user]?.energyAttached) {
            return { allowed: false, reason: 'Energy already attached this turn.' };
          }
          return { allowed: true };
    
        case 'playSupporter':
          if (!isYourTurn) return { allowed: false, reason: "It's not your turn." };
          if (S.flags[user]?.supporterPlayed) {
            return { allowed: false, reason: 'You already played a Supporter this turn (one per turn).' };
          }
          return { allowed: true };
    
        case 'evolve':
          if (!isYourTurn) return { allowed: false, reason: "It's not your turn." };
          if (S.turnNumber <= 1) {
            return { allowed: false, reason: "Can't evolve on the first turn." };
          }
          return { allowed: true };
    
        case 'attack':
          if (!isYourTurn) return { allowed: false, reason: "It's not your turn." };
          if (S.turnNumber === 1) {
            return { allowed: false, reason: "The player going first can't attack on turn 1." };
          }
          if (S.flags[user]?.attackerAttacked) {
            return { allowed: false, reason: 'Already attacked this turn.' };
          }
          return { allowed: true };
    
        case 'retreat':
          if (!isYourTurn) return { allowed: false, reason: "It's not your turn." };
          if (S.flags[user]?.attackerAttacked) {
            return { allowed: false, reason: "Can't retreat after attacking." };
          }
          return { allowed: true };
    
        default:
          return { allowed: true };
      }
    }
    
    function flow() { return false; }
    
    export function isRulesEnabled() {
      return rulesState.enabled;
    }
    
    // persistence for the toggle
    export function persistRulesEnabled() {
      try {
        localStorage.setItem(RULES_STORAGE_KEY, rulesState.enabled ? '1' : '0');
      } catch {}
    }
    export function loadRulesEnabled() {
      try {
        const stored = localStorage.getItem(RULES_STORAGE_KEY);
        // Rules mode is ON by default; only an explicitly stored '0' keeps it off.
        rulesState.enabled = stored === null ? true : stored === '1';
      } catch {}
      return rulesState.enabled;
    }
    