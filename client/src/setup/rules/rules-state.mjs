// Rules engine state — a TCG Live-style enforcement layer over the sim.
    // Tracks whose turn it is, what phase they're in, and what actions are
    // currently legal. All gating flows through canPerformAction().
    
    import {
      buildSetCardIdCandidates,
      extractTcgdexIdFromImageUrl,
      resolveTcgdexSetId,
    } from '../shared/legacy-set-ids.mjs';
    
    export const RULES_STORAGE_KEY = 'ptcg-sim.rules-enforced.v1';
    
    export const rulesState = {
      enabled: true,           // master switch (Settings toggle) — default on; loadRulesEnabled() may override from storage
      turnPlayer: 'self',      // whose turn: 'self' | 'opp'
      turnNumber: 0,
      phase: 'setup',          // setup | draw | main | attack | ended
      // Stadium currently on the field (both players share it): { user, card } | null
      stadium: null,
      mulligansResolved: false, // guard: mulligan execution runs at most once per game
      attackExecuting: false, // true while an attack's damage/effects are resolving (Nitro recycle)
      // per-player per-turn facts
      flags: {
        self: { energyAttached: false, attackerAttacked: false, evolved: {}, supporterPlayed: false, lastSupporterName: '', abilitiesUsed: {} },
        opp: { energyAttached: false, attackerAttacked: false, evolved: {}, supporterPlayed: false, lastSupporterName: '', abilitiesUsed: {} },
      },
    };
    
    // ── card data enrichment: type chart data from TCGdex card details ──
    // Weakness/resistance: TCGdex exposes { type, value } on card details.
    const cardDataCache = new Map();
    
    // ── name → id resolution for zone cards (built without a TCGdex id) ──
    // Zone `Card` objects carry only name/type/user/image. We resolve a TCGdex
    // id by name so the detail fetch below can enrich attacks/weakness/etc.
    export function normalizeCardName(name) {
      return String(name || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    // Pure, testable picker: choose the best TCGdex id for a card name. No network.
    //
    // IMPORTANT: a huge number of Pokémon cards reprint the exact same name
    // across many different sets/eras (e.g. "Piloswine" appears, unchanged,
    // in Neo Genesis, Skyridge, EX Team Rocket Returns, Legends Awakened,
    // Phantasmal Flames, and half a dozen others). Every one of those is an
    // "exact normalized-name match" and would previously score identically
    // (100), so the tie was broken purely by whatever arbitrary order the
    // TCGdex `/cards?name=` search happened to return — i.e. effectively
    // random with respect to which physical printing is actually in play.
    // That let a modern non-EX reprint resolve to a decades-old EX-series
    // printing with completely different attacks (see incident notes).
    //
    // `number` is the printed collector number from the decklist (e.g.
    // "32"), which is cheap to carry through from import and — unlike the
    // set code — needs no legacy/short-code mapping table: it's compared
    // directly against TCGdex's own `localId` for each candidate. When it
    // is available and matches exactly one candidate, that candidate wins
    // regardless of result order.
    export function resolveCardId(summaries, name, type = '', number = null, setCode = null) {
      if (!Array.isArray(summaries) || summaries.length === 0) return null;
      const target = normalizeCardName(name);
      if (!target) return null;
      const t = String(type || '').toLowerCase();
      const wantsPokemon = t.includes('pok');
      const wantsTrainer = t.includes('trainer');
      // Normalize away leading zeros / stray whitespace so "032" == "32".
      const wantNumber = number != null ? String(number).trim().replace(/^0+(?=\d)/, '') : null;
      const wantSetId = resolveTcgdexSetId(setCode);
    
      const scored = summaries
        .filter((s) => s && s.id)
        .map((s) => {
          const sn = normalizeCardName(s.name);
          let score = 0;
          if (sn === target) score += 100;
          else if (sn.includes(target) || target.includes(sn)) score += 20;
          if (wantsPokemon && s.category === 'pokemon') score += 10;
          if (wantsTrainer && s.category === 'trainer') score += 10;
          if (wantsPokemon && s.category === 'trainer') score -= 50;
          if (wantsTrainer && s.category === 'pokemon') score -= 50;
          // Printed set code → TCGdex set-id prefix. Collector numbers repeat
          // across sets (PFL #24 vs Skyridge #24), so set+number together are
          // required for a decisive match on modern decks.
          if (score >= 100 && wantSetId && String(s.id).startsWith(`${wantSetId}-`)) {
            score += 10000;
          }
          // The collector number breaks ties *between otherwise acceptable
          // candidates in the same set* — it never promotes one that would have
          // been rejected on its own. Gating on `score >= 100` (exact name, no
          // category conflict) stops a coincidental number match on "Piloswine ex"
          // (partial name, 20) or on a same-named Trainer (50) from beating
          // the real exact-name Pokémon.
          if (score >= 100 && wantNumber != null && s.localId != null) {
            const sNumber = String(s.localId).trim().replace(/^0+(?=\d)/, '');
            if (sNumber === wantNumber) score += 1000; // decisive disambiguator
          }
          return { s, score };
        });
      if (scored.length === 0) return null;
      scored.sort((a, b) => b.score - a.score);
      // Only exact normalized-name matches (score >= 100) may resolve an id —
      // partial matches risk resolving to the wrong card (e.g. "Pikachu EX").
      if (scored[0].score < 100) return null;
      return scored[0].s.id;
    }
    
    // Network: fetch TCGdex summary objects for a name (with EX/GX variant forms).
    async function fetchSummariesByName(name) {
      const queries = [name];
      if (/-EX$/i.test(name)) queries.push(name.replace(/-EX$/i, ' EX'));
      else if (/ EX$/i.test(name)) queries.push(name.replace(/ EX$/i, '-EX'));
      if (/-GX$/i.test(name)) queries.push(name.replace(/-GX$/i, ' GX'));
      else if (/ GX$/i.test(name)) queries.push(name.replace(/ GX$/i, '-GX'));
      const seen = new Set();
      const out = [];
      for (const q of queries) {
        try {
          const url = `https://api.tcgdex.net/v2/en/cards?name=${encodeURIComponent(q)}`;
          const res = await fetch(url);
          if (!res.ok) continue;
          const arr = await res.json();
          if (Array.isArray(arr)) {
            for (const s of arr) {
              if (s && s.id && !seen.has(s.id)) {
                seen.add(s.id);
                out.push(s);
              }
            }
          }
        } catch {
          /* ignore a failed variant query; others may still resolve */
        }
      }
      return out;
    }
    
    // Pure mapper: TCGdex v2 card detail → rules-engine ability shape.
    // v2 exposes abilities[] ({ type, name, effect }); legacy detail.ability is kept for compat.
    export function tcgAbilityFromDetail(detail) {
      if (detail?.ability?.text || detail?.ability?.name) return detail.ability;
      // Multiple Ability entries are rare; first match wins (TCGdex order is stable).
      const entry = (detail?.abilities || []).find(
        (a) => String(a?.type || '').toLowerCase() === 'ability'
      );
      if (!entry) return null;
      return { name: entry.name || '', text: entry.effect || entry.text || '' };
    }

    // Network: fetch (and memoize) one raw TCGdex card detail by id. Shared by
    // the legacy-id validation below and the enrichment fetch, so validating a
    // candidate id doesn't cost a second round trip. `null` = fetch failed or
    // the id doesn't exist; failures are not memoized so a later call retries.
    const cardDetailCache = new Map();
    async function fetchCardDetail(id) {
      if (cardDetailCache.has(id)) return cardDetailCache.get(id);
      try {
        const res = await fetch(`https://api.tcgdex.net/v2/en/cards/${id}`);
        if (!res.ok) return null;
        const detail = await res.json();
        if (!detail) return null;
        cardDetailCache.set(id, detail);
        return detail;
      } catch {
        return null;
      }
    }

    // Deterministic id resolution for the legacy sets we have a code→set-id
    // table for: "TRR 32" is unambiguously ex7-32, no name search and no
    // tiebreaking required. The table was hand-built for limitlesstcg's URL
    // scheme and has never been verified card-by-card against TCGdex, so the
    // id it produces is only a *candidate* — the fetched card's name has to
    // match the board card's before we trust it. Returns the id, or null to
    // tell the caller to fall back to the by-name search.
    async function resolveSetCardId(card) {
      for (const candidate of buildSetCardIdCandidates(card.set, card.number)) {
        const detail = await fetchCardDetail(candidate);
        if (!detail) continue;
        if (normalizeCardName(detail.name) !== normalizeCardName(card.name)) continue;
        return candidate;
      }
      return null;
    }

    
    export async function ensureCardData(card) {
      if (!card) return card;
      // NOTE: enrichment below sets `card.weakness` (singular) — matching on
      // it here, not the never-set `weaknesses`, so an already-enriched card
      // is actually recognized and doesn't re-run resolution/fetch on every call.
      if (card.hp && card.weakness !== undefined) return card; // enriched
      if (!card.id && card.image?.src) {
        const fromUrl = extractTcgdexIdFromImageUrl(card.image.src);
        if (fromUrl) card.id = fromUrl;
      }
      if (!card.id && card.name) {
        // Zone cards arrive without an id. Prefer the deterministic
        // (set code, collector number) → id mapping; only guess by name if
        // that isn't available or doesn't check out.
        try {
          const setId = await resolveSetCardId(card);
          if (setId != null) card.id = setId;
        } catch {
          /* fall through to the by-name search */
        }
      }
      if (!card.id && card.name) {
        try {
          const summaries = await fetchSummariesByName(card.name);
          const id = resolveCardId(
            summaries,
            card.name,
            card.type,
            card.number,
            card.set
          );
          if (id != null) card.id = id;
        } catch {
          /* fall through: card.id stays unset and we return unenriched */
        }
      }
      if (!card?.id) return card;
      if (cardDataCache.has(card.id)) {
        // Same fill-only merge as the fresh-fetch path: the card's own values
        // (e.g. local `stage: 'Stage 1'`) must not be clobbered by TCGdex's
        // formatting (e.g. `stage: 'Stage1'`) on a cache hit.
        for (const [k, v] of Object.entries(cardDataCache.get(card.id))) {
          if (card[k] == null || card[k] === '') card[k] = v;
        }
        return card;
      }
      try {
        const detail = await fetchCardDetail(card.id);
        if (!detail) throw new Error(`no detail for ${card.id}`);
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
            // TCGdex's attack objects carry the effect text under `effect`,
            // not `text` (see https://tcgdex.dev/reference/card — Pokémon
            // Card > attacks[].effect). `a.text` doesn't exist on the raw
            // API response, so keeping it only as a fallback (in case a
            // future API revision renames the field back) — without it,
            // every attack-text parser in damage-parser.mjs (discard cost,
            // discard-to-scale, once-per-turn, heal, switch, bench damage,
            // etc.) silently no-ops because atk.text is always ''.
            text: a.effect || a.text || '',
          })),
          stage: detail.stage || null,
          evolvesFrom: detail.evolvesFrom || null,
          ability: tcgAbilityFromDetail(detail),
          subtypes: detail.subtypes || [],
          rarity: detail.rarity || card.rarity || '',
          effect: detail.effect || null,
          text: detail.text || null,
        };
        cardDataCache.set(card.id, data);
        // Fill in only fields the card doesn't already carry — a card's own
        // values (e.g. local `stage`/`evolvesFrom`) are the source of truth and
        // must not be clobbered by TCGdex's formatting.
        for (const [k, v] of Object.entries(data)) {
          if (card[k] == null || card[k] === '') card[k] = v;
        }
      } catch {
        // Do NOT cache an empty object on failure — leave it out so a later
        // call can retry the fetch (avoids permanently poisoned cache entries).
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
      rulesState.flags[player] = { energyAttached: false, attackerAttacked: false, evolved: {}, supporterPlayed: false, lastSupporterName: '', abilitiesUsed: {}, stadiumUsed: false, drewThisTurn: false };
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
    export function markSupporterPlayed(player, cardName = '') {
      if (rulesState.flags[player]) {
        rulesState.flags[player].supporterPlayed = true;
        if (cardName) rulesState.flags[player].lastSupporterName = cardName;
      }
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
    
    // Gate for MANUAL (button/keybind/drag) deck & hand<->deck actions.
    // Parsed card-effect flows (setup draws, Iono, stadium effects, etc.) call
    // the shared action functions directly and never pass through here.
    // Returns { allowed } or { allowed: false, reason }.
    export function manualDeckActionAllowed(action) {
      if (!rulesState.enabled) return { allowed: true };
      switch (action) {
        case 'viewDeck':
          return canPerformAction({ user: null, action: 'viewDeck' });
        case 'draw':
          return { allowed: false, reason: 'Drawing is locked — only card effects may draw for you.' };
        case 'shuffleDeck':
          return { allowed: false, reason: 'The deck is locked — only card effects may shuffle it.' };
        case 'moveToDeck':
          return { allowed: false, reason: 'The deck is locked — only card effects may place cards into it.' };
        case 'switchWithDeck':
          return { allowed: false, reason: 'The deck is locked — only card effects may swap cards with it.' };
        case 'discardAndDraw':
          return { allowed: false, reason: 'The deck is locked — discarding to draw is only via card effects.' };
        case 'shuffleAndDraw':
          return { allowed: false, reason: 'The deck is locked — shuffling your hand in is only via card effects.' };
        case 'shuffleBottomAndDraw':
          return { allowed: false, reason: 'The deck is locked — shuffling your hand in is only via card effects.' };
        default:
          return { allowed: true };
      }
    }
    
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
    