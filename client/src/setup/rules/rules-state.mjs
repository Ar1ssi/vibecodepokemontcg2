// Rules engine state — a TCG Live-style enforcement layer over the sim.
    // Tracks whose turn it is, what phase they're in, and what actions are
    // currently legal. All gating flows through canPerformAction().
    
    export const RULES_STORAGE_KEY = 'ptcg-sim.rules-enforced.v1';
    
    export const rulesState = {
      enabled: false,          // master switch (Settings toggle)
      turnPlayer: 'self',      // whose turn: 'self' | 'opp'
      turnNumber: 0,
      phase: 'setup',          // setup | draw | main | attack | ended
      // per-player per-turn facts
      flags: {
        self: { energyAttached: false, attackerAttacked: false, evolved: {} },
        opp: { energyAttached: false, attackerAttacked: false, evolved: {} },
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
      rulesState.flags[player] = { energyAttached: false, attackerAttacked: false, evolved: {} };
    }
    
    export function markEnergyAttached(player) {
      if (rulesState.flags[player]) rulesState.flags[player].energyAttached = true;
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
        rulesState.enabled = localStorage.getItem(RULES_STORAGE_KEY) === '1';
      } catch {}
      return rulesState.enabled;
    }
    