// Bridge between the free-form sim and the rules engine. Installs gates
    // on existing handlers (deck view, moves) and provides the attack flow UI.
    
    import { systemState, socket as rulesSocket } from '../../front-end.js';
    import { appendMessage } from '../chatbox/append-message.js';
    import { getZone } from '../zones/get-zone.js';
    import {
      rulesState,
      canPerformAction,
      ensureCardData,
      startGame,
      beginTurn,
      endTurn,
      markEnergyAttached,
      loadRulesEnabled,
      persistRulesEnabled,
    } from './rules-state.mjs';
    import { executeAttack, canPayAttackCost } from './attack-engine.mjs';
    import { handleKO, checkWinConditions, resetPrizes } from './ko-flow.mjs';
    import { applyStatus, parseStatusFromAttackText, resolveTurnBoundary, resetStatuses } from './status.mjs';
import { statusState } from './status.mjs';
import { parseTrainerEffect, describeStep } from './trainer-effects.mjs';
import { canEvolve, markEvolvedThisTurn } from './evolution.mjs';
import { parseAbility } from './abilities.mjs';
import { evaluateMulligans } from './mulligan.mjs';
import { getCoins, getCoinById } from '../deck-builder/core/coins.mjs';
    
    let initialized = false;
    
    // ── turn-order coin flip state ─────────────────────────────────────
    // Coins each player has actively selected this session (from the deck
    // builder's Customize > Coin tab, or the coin baked into whichever
    // saved deck they opened). Populated by the 'rules-coin-changed' event
    // dispatched from native-deck-builder.js.
    const selectedCoins = { self: null, opp: null };
    document.addEventListener('rules-coin-changed', (event) => {
      const { target, coin } = event.detail || {};
      if (target === 'self' || target === 'opp') selectedCoins[target] = coin || null;
    });
    
    // When the opponent's client resolves the coin flip first (multiplayer),
    // their result is mirrored here so our own Set Up click uses the same
    // outcome instead of flipping independently.
    let syncedTurnOrder = null;
    
    export const initializeRulesEngine = () => {
      if (initialized) return;
      initialized = true;
      loadRulesEnabled();
  document.body.classList.toggle('rules-mode', rulesState.enabled);
      buildAttackPanel();
  buildTurnHUD();
      hookTurnButton();
      hookSetupButton();
      hookDeckView();
  hookTrainerPlay();
  turnAutomation();
  koWatcher();
  renderStatusBadges();
  hookMultiplayerSync();
  buildEndScreen();
  buildBattleLog();
      hookMoveCard();
      hookEnergyAttach();
      syncRulesToggleUI();
    };
    
    // ── turn HUD: persistent whose-turn/phase banner ─────────────────────
    const buildTurnHUD = () => {
      if (document.getElementById('rulesTurnHUD')) return;
      const hud = document.createElement('div');
      hud.id = 'rulesTurnHUD';
      hud.hidden = true;
      hud.innerHTML = `
        <span class="rules-hud-player"></span>
        <span class="rules-hud-phase"></span>
        <span class="rules-hud-flags"></span>`;
      document.body.appendChild(hud);
    
      const refresh = () => {
        if (!rulesState.enabled || rulesState.phase === 'setup') {
          hud.hidden = true;
          return;
        }
        hud.hidden = false;
        const isMine = rulesState.turnPlayer === 'self';
        hud.querySelector('.rules-hud-player').textContent = isMine ? 'YOUR TURN' : "OPPONENT'S TURN";
        const phaseText = rulesState.phase === 'attack' ? 'attack used — end turn'
          : rulesState.phase === 'ended' ? 'game over'
          : rulesState.phase === 'draw' ? 'draw phase' : 'main phase';
        hud.querySelector('.rules-hud-phase').textContent = phaseText;
    
        const f = rulesState.flags[rulesState.turnPlayer] || {};
        const flagBits = [];
        if (f.energyAttached) flagBits.push('⚡');
        if (f.attackerAttacked) flagBits.push('⚔️');
        if (f.retreatedThisTurn) flagBits.push('↩');
        hud.querySelector('.rules-hud-flags').textContent = flagBits.join(' ');
        hud.classList.toggle('my-turn', isMine);
      };
    
      document.addEventListener('rules-turn-began', refresh);
      document.addEventListener('rules-mode-changed', refresh);
      window.setInterval(refresh, 1500);
    };
    
    // ── settings toggle ──────────────────────────────────────────────────
    const buildRulesToggle = () => {
      const settings = document.getElementById('settings');
      if (!settings || document.getElementById('rulesEnforcedCheckbox')) return;
    
      const row = document.createElement('div');
      row.className = 'settings-row';
      row.innerHTML = `
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" id="rulesEnforcedCheckbox" />
          <span>Rules enforced (TCG Live mode)</span>
        </label>`;
      settings.appendChild(row);
    
      document.getElementById('rulesEnforcedCheckbox').addEventListener('change', (e) => {
        rulesState.enabled = e.target.checked;
        persistRulesEnabled();
        appendMessage('', `Rules enforcement ${rulesState.enabled ? 'enabled' : 'disabled'}`, 'announcement', false);
        document.dispatchEvent(new CustomEvent('rules-mode-changed', { detail: { enabled: rulesState.enabled } }));
        document.body.classList.toggle('rules-mode', rulesState.enabled);
      });
    };
    
    const syncRulesToggleUI = () => {
      const cb = document.getElementById('rulesEnforcedCheckbox');
      if (cb) cb.checked = rulesState.enabled;
    };
    
    // ── turn flow: attack ends turn; +Turn advances ──────────────────────
    const hookTurnButton = () => {
      const btn = document.getElementById('turnButton');
      if (!btn) return;
      btn.addEventListener('click', () => {
        if (!rulesState.enabled) return;
    
        // end-of-turn: resolve the turn player's statuses before passing
        const endingPlayer = rulesState.turnPlayer;
        try {
          const active = getZone(endingPlayer, 'active').array[0];
          if (active) {
            const key = active.image?.dataset?.cardId || active.name;
            const boundary = resolveTurnBoundary(endingPlayer, key);
            if (boundary.damage > 0 && active.image?.damageCounter) {
              const current = parseInt(active.image.damageCounter.textContent || '0', 10) || 0;
              active.image.damageCounter.textContent = current + boundary.damage;
            }
            for (const note of boundary.notes) {
              appendMessage('', note, 'announcement', false);
            }
          }
        } catch {}
    
        // win-condition sweep before passing — only once the game is truly
        // underway (turn 2+), never during setup/mulligan
        if (rulesState.turnNumber >= 2) {
        try {
          const counts = {};
          for (const p of ['self', 'opp']) {
            counts[p] = {
              active: getZone(p, 'active').getCount(),
              bench: getZone(p, 'bench').getCount(),
            };
          }
          // deck-out + no-Pokemon only apply to players actually in the game:
          // a player with no deck loaded (solo testing) can't lose by them
          const inGame = {
            self: getZone('self', 'deck').getCount() + getZone('self', 'hand').getCount() > 0,
            opp: getZone('opp', 'deck').getCount() + getZone('opp', 'hand').getCount() > 0,
          };
          const win = checkWinConditions({
            activeCounts: inGame.self && inGame.opp ? counts : null,
            deckCounts: {
              self: inGame.self ? getZone('self', 'deck').getCount() : 1,
              opp: inGame.opp ? getZone('opp', 'deck').getCount() : 1,
            },
            turnPlayer: endingPlayer,
          });
          if (win.over) {
            rulesState.phase = 'ended';
            appendMessage('', `🏆 Game over — ${win.winner === 'self' ? 'you win' : 'opponent wins'} (${win.reason})`, 'announcement', false);
            return;
          }
        } catch {}
        }
    
        const next = endTurn(rulesState.turnPlayer);
        appendMessage('', `Turn passes to ${next === 'self' ? 'P1' : 'P2'}`, 'announcement', false);
        updateTurnBanner();
      }, true); // capture phase, runs before existing handler
    };
    
    const hookSetupButton = () => {
      const btn = document.getElementById('setupButton');
      if (!btn) return;
      btn.addEventListener('click', () => {
        if (!rulesState.enabled) return;
    
        const proceedWithSetup = (firstPlayer) => {
          startGame(firstPlayer);
          resetPrizes();
          resetStatuses();
          appendMessage('', 'Rules engine active — good luck!', 'announcement', false);
    
          // mulligan check: opening hands must contain a Basic Pokémon
          setTimeout(async () => {
            try {
              const selfHand = getZone('self', 'hand').array;
              const oppHand = systemState.isTwoPlayer ? getZone('opp', 'hand').array : [];
              const steps = await evaluateMulligans({ selfHand, oppHand });
              for (const step of steps) {
                appendMessage('', 'Mulligan: ' + step.guidance, 'announcement', false);
              }
            } catch {}
          }, 2500);
          updateTurnBanner();
        };
    
        // If the opponent's client already resolved (and broadcast) the
        // coin flip, mirror their result instead of flipping again —
        // avoids the two sides disagreeing on who goes first.
        if (syncedTurnOrder) {
          const firstPlayer = syncedTurnOrder;
          syncedTurnOrder = null;
          proceedWithSetup(firstPlayer);
          return;
        }
    
        runTurnOrderCoinFlip().then(({ turnPlayer }) => proceedWithSetup(turnPlayer));
      }, true);
    };
    
    // ── turn-order coin flip: automatic at match start ───────────────────
    // Randomly picks one player's selected coin (falling back to a random
    // coin from the catalog if neither player has picked one), plays the
    // existing 3D coin-toss animation full-screen, and uses the result to
    // decide who goes first. Broadcasts the outcome to the opponent in
    // multiplayer so both sides see the same flip and agree on turn order.
    const runTurnOrderCoinFlip = () => {
      return new Promise((resolve) => {
        const coinOwner = Math.random() < 0.5 ? 'self' : 'opp';
        const coin = selectedCoins[coinOwner] || pickRandomCoin();
        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        // heads → self goes first, tails → opp goes first
        const turnPlayer = result === 'heads' ? 'self' : 'opp';
    
        playTurnOrderCoinAnimation({ coin, result, coinOwner, turnPlayer, isRemote: false });
    
        if (systemState.isTwoPlayer && rulesSocket) {
          rulesSocket.emit('rulesEvent', {
            type: 'turnOrderCoinFlip',
            data: { coinOwner, coinId: coin?.id || null, result, turnPlayer },
          });
        }
    
        setTimeout(() => resolve({ turnPlayer, coin, result, coinOwner }), 2700);
      });
    };
    
    const pickRandomCoin = () => {
      const coins = getCoins();
      if (coins.length === 0) return null;
      return coins[Math.floor(Math.random() * coins.length)];
    };
    
    // Renders the full-screen coin-toss overlay, reusing the existing
    // .coin-3d / .coin-toss-wrap CSS from the deck builder's coin picker.
    const playTurnOrderCoinAnimation = ({ coin, result, coinOwner, turnPlayer, isRemote }) => {
      document.getElementById('turnOrderCoinFlipOverlay')?.remove();
    
      const material = coin?.material || 'enamel';
      const thumb = coin?.thumb || 'https://ptcgsim.online/src/assets/coins/coin-back.png';
      const name = coin?.name || 'Coin';
      const ownerLabel = coinOwner === 'self' ? (isRemote ? "Opponent's" : 'Your') : (isRemote ? 'Your' : "Opponent's");
      const winnerLabel = turnPlayer === 'self' ? (isRemote ? 'Opponent goes' : 'You go') : (isRemote ? 'You go' : 'Opponent goes');
    
      const overlay = document.createElement('div');
      overlay.id = 'turnOrderCoinFlipOverlay';
      overlay.innerHTML = `
        <div class="turn-order-coin-flip-label">${ownerLabel} coin — flipping for turn order…</div>
        <span class="coin-toss-wrap" data-coin-toss>
          <div class="coin-3d coin-mat-${escapeHtml(material)}" data-coin-flip-el>
            <div class="coin-face coin-front"><img src="${escapeHtml(thumb)}" alt="${escapeHtml(name)}" /></div>
            <div class="coin-face coin-backc"><img src="/src/assets/coins/coin-back.png" alt="back" /></div>
          </div>
        </span>
        <div class="turn-order-coin-flip-result"></div>`;
      document.body.appendChild(overlay);
    
      const coinEl = overlay.querySelector('[data-coin-flip-el]');
      const wrap = overlay.querySelector('[data-coin-toss]');
      const resultEl = overlay.querySelector('.turn-order-coin-flip-result');
    
      // 4 full tumbles, landing on front for heads / back for tails —
      // matches the tossing timing used by the deck builder's coin picker.
      requestAnimationFrame(() => {
        const finalDeg = 4 * 360 + (result === 'tails' ? 180 : 0);
        coinEl.style.setProperty('--coin-flip', finalDeg + 'deg');
        wrap.classList.add('tossing');
      });
    
      setTimeout(() => {
        resultEl.textContent = `${result === 'heads' ? 'Heads' : 'Tails'}! ${winnerLabel} first.`;
        resultEl.classList.add('visible');
        appendMessage(
          '',
          `🪙 ${ownerLabel === 'Your' ? 'Your' : "Opponent's"} coin flip: ${result} — ${winnerLabel.toLowerCase()} first!`,
          'announcement',
          false
        );
      }, 1500);
    
      setTimeout(() => {
        overlay.classList.add('fading');
        setTimeout(() => overlay.remove(), 400);
      }, 2400);
    };
    
    // ── deck privacy ─────────────────────────────────────────────────────
    // The deck is viewable ONLY while a card effect has opened a search
    // window (searchDeck / lookAtTop steps). An effect grants access; the
    // gate auto-closes when the effect resolves or the turn ends.
    const deckAccess = { open: false, reason: '', closer: null };
    
    export const openDeckSearchWindow = (reason = 'card effect') => {
      deckAccess.open = true;
      deckAccess.reason = reason;
      if (deckAccess.closer) clearTimeout(deckAccess.closer);
      // auto-close after 90s so it can't stay open forever
      deckAccess.closer = setTimeout(() => {
        deckAccess.open = false;
      }, 90000);
    };
    export const closeDeckSearchWindow = () => {
      deckAccess.open = false;
      if (deckAccess.closer) clearTimeout(deckAccess.closer);
    };
    
    const hookDeckView = () => {
      // The deck zone's click/context handlers show deck contents. Gate them.
      document.addEventListener('click', (event) => {
        if (!rulesState.enabled) return;
        const deckEl = event.target.closest?.('[id="deck"]');
        if (!deckEl) return;
        if (deckAccess.open) return; // a card effect unlocked it
        const check = canPerformAction({ user: rulesState.turnPlayer, action: 'viewDeck' });
        if (!check.allowed) {
          event.stopImmediatePropagation();
          event.preventDefault();
          toastRulesBlocked(check.reason);
        }
      }, true);
    };
    
    // ── energy attach: once per turn ─────────────────────────────────────
    // The sim attaches energy by dragging a card onto a Pokémon. We can't
    // intercept drag-drop cleanly, so we watch the attachedCards zone: the
    // first energy attached to any of the turn player's Pokémon each turn
    // flips the flag; later attaches while the flag is set are announced as
    // rule warnings (the sim's free drag can't be hard-blocked without
    // patching its internals, so rules mode surfaces violations immediately).
    const hookEnergyAttach = () => {
      document.addEventListener('rules-attach-energy', (event) => {
        markEnergyAttached(event.detail.player || rulesState.turnPlayer);
      });
    
      // observe self attached cards for energy adds
      const checkInterval = window.setInterval(() => {
        if (!rulesState.enabled || rulesState.phase === 'ended') return;
        const player = rulesState.turnPlayer;
        if (player !== 'self') return;
        try {
          const zone = getZone('self', 'attachedCards');
          if (!zone?.array) return;
          for (const card of zone.array) {
            const img = card.image;
            if (!img || img.__rulesEnergyChecked) continue;
            img.__rulesEnergyChecked = true;
            const isEnergy = String(card.type || '').toLowerCase().includes('energy') ||
              String(card.name || '').toLowerCase().includes('energy');
            if (!isEnergy) continue;
            if (rulesState.flags.self?.energyAttached) {
              appendMessage('', '⚠️ Rules: energy already attached this turn (extra attach detected)', 'announcement', false);
            } else {
              markEnergyAttached('self');
              appendMessage('', 'Energy attached (1/1 this turn)', 'announcement', false);
            }
          }
        } catch {}
      }, 1200);
    };
    
    // ── turn automation: auto-draw, hand limit, KO watch ────────────────
    // TCG Live draws automatically at turn start and enforces the 7-card
    // hand limit at turn end. We hook the turn flow via the chatbox watcher
    // (the sim announces turns) and drive the deck/hand zones directly.
    const turnAutomation = () => {
      let lastProcessedTurn = -1;
    
      const drawCard = (player) => {
        try {
          const deck = getZone(player, 'deck');
          const hand = getZone(player, 'hand');
          if (deck.getCount() > 0) {
            // moveCard(user, initiator, fromZone, toZone, index)
            import('../../actions/move-card-bundle/move-card.js').then(({ moveCard }) => {
              moveCard(player, player, 'deck', 'hand', 0);
            });
            return true;
          }
          return false;
        } catch {
          return false;
        }
      };
    
      const handCount = (player) => {
        try {
          return getZone(player, 'hand').getCount();
        } catch {
          return 0;
        }
      };
    
      window.setInterval(() => {
        if (!rulesState.enabled || rulesState.phase === 'ended') return;
        if (rulesState.phase !== 'main') return;
    
        // auto-draw once per new turn for the turn player (skip turn 1's
        // opening hand — setup handles that)
        if (rulesState.turnNumber !== lastProcessedTurn) {
          lastProcessedTurn = rulesState.turnNumber;
          if (rulesState.turnNumber > 1) {
            // NOTE: the sim's +Turn button already draws the card for the
            // turn player; we only track deck-out here.
            const player = rulesState.turnPlayer;
            const deckCount = (() => { try { return getZone(player, 'deck').getCount(); } catch { return 0; } })();
            if (deckCount === 0) {
              appendMessage('', 'Deck empty — deck-out loss!', 'announcement', false);
              rulesState.phase = 'ended';
            }
          }
        }
    
        // hand limit: warn when over 7 at end of turn (we can't know the
        // exact end-moment, so surface it whenever it's exceeded during play)
        const hc = handCount(rulesState.turnPlayer);
        if (hc > 7 && !rulesState.__handWarned) {
          rulesState.__handWarned = true;
          appendMessage('', `⚠️ Hand has ${hc} cards — discard down to 7 before ending your turn.`, 'announcement', false);
        } else if (hc <= 7) {
          rulesState.__handWarned = false;
        }
      }, 1500);
    };
    
    // continuous KO detection: watch all in-play Pokémon for damage >= HP
    const koWatcher = () => {
      let lastAbilityResetTurn = -1;
    
      window.setInterval(async () => {
        if (!rulesState.enabled || rulesState.phase === 'ended') return;
    
        // reset per-turn ability flags at each new turn
        if (lastAbilityResetTurn !== rulesState.turnNumber) {
          lastAbilityResetTurn = rulesState.turnNumber;
          try {
            for (const zoneId of ['active', 'bench']) {
              for (const c of getZone('self', zoneId).array) {
                if (c.image) c.image.__rulesAbilityUsed = false;
              }
            }
          } catch {}
        }
    
        try {
          for (const player of ['self', 'opp']) {
            for (const zoneId of ['active', 'bench']) {
              const zone = getZone(player, zoneId);
              if (!zone?.array) continue;
              for (const card of zone.array) {
                if (!card?.image || card.__rulesKODetected) continue;
                const dmgText = card.image.damageCounter?.textContent || '0';
                const damage = parseInt(dmgText, 10) || 0;
                if (damage <= 0 || !card.hp) continue;
                await ensureCardData(card);
                if (damage >= (card.hp || 0)) {
                  card.__rulesKODetected = true;
                  const who = player === 'self' ? 'Your' : "Opponent's";
                  appendMessage('', `💀 ${who} ${card.name || 'Pokémon'} has ${damage}/${card.hp} damage — KO! Move it to discard${zoneId === 'active' ? ' and promote a new Active' : ''}.`, 'announcement', false);
    
                  playAttackFeedback(true);

              // auto-discard the KO'd Pokémon (with its attachments)
                  import('../../actions/move-card-bundle/move-card.js').then(({ moveCard }) => {
                    try {
                      const idx = zone.array.indexOf(card);
                      if (idx >= 0) {
                        moveCard(player, 'self', zoneId, 'discard', idx);
                        appendMessage('', "auto: KO'd Pokémon moved to discard", 'announcement', false);
                      }
                    } catch {}
                  });
    
                  // sync KO to opponent in multiplayer
                  if (systemState.isTwoPlayer && rulesSocket) {
                    rulesSocket.emit('rulesEvent', {
                      type: 'ko',
                      data: { cardName: card.name || 'Pokémon' },
                    });
                  }
                }
              }
            }
          }
        } catch {}
      }, 2000);
    };
    
    
    // ── status badges: visual markers on afflicted Pokémon ───────────────
    const STATUS_EMOJI = { asleep: '💤', paralyzed: '⚡', poisoned: '☠️', burned: '🔥', confused: '❓' };
    
    const renderStatusBadges = () => {
      window.setInterval(() => {
        if (!rulesState.enabled) return;
        try {
          for (const player of ['self', 'opp']) {
            for (const zoneId of ['active', 'bench']) {
              const zone = getZone(player, zoneId);
              if (!zone?.array) continue;
              for (const card of zone.array) {
                const img = card.image;
                if (!img) continue;
                const key = img.dataset?.cardId || card.name;
                const s = statusState[player][key];
                let badge = img.__rulesStatusBadge;
                if (s && Object.keys(s).length > 0) {
                  const text = Object.keys(s).map(k => STATUS_EMOJI[k] || '').join('');
                  if (!badge) {
                    badge = document.createElement('div');
                    badge.className = 'rules-status-badge';
                    img.parentElement?.appendChild(badge);
                    img.__rulesStatusBadge = badge;
                  }
                  badge.textContent = text;
                  badge.title = Object.keys(s).join(', ');
                } else if (badge) {
                  badge.remove();
                  img.__rulesStatusBadge = null;
                }
              }
            }
          }
        } catch {}
      }, 2000);
    };
    
// ── choice picker for search effects ─────────────────────────────────
    // Opens a modal with candidate cards (from deck/discard); clicking one
    // executes the pending move (to hand or bench) automatically.
    const openChoicePicker = ({ title, candidates, zoneFrom, destination, onPick }) => {
      // remove any existing picker
      document.getElementById('rulesChoicePicker')?.remove();
    
      const overlay = document.createElement('div');
      overlay.id = 'rulesChoicePicker';
      overlay.innerHTML = `
        <div class="choice-picker-card">
          <div class="choice-picker-title"></div>
          <div class="choice-picker-grid"></div>
          <button class="choice-picker-cancel">Cancel</button>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('.choice-picker-title').textContent = title;
    
      const grid = overlay.querySelector('.choice-picker-grid');
      import('../../actions/move-card-bundle/move-card.js').then(({ moveCard }) => {
        for (const cand of candidates) {
          const btn = document.createElement('button');
          btn.className = 'choice-picker-item';
          const thumb = cand.images?.small || cand.image || '';
          btn.innerHTML = thumb
            ? `<img src="${thumb}" alt="" loading="lazy" /><span>${cand.name || 'Card'}</span>`
            : `<span>${cand.name || 'Card'}</span>`;
          btn.addEventListener('click', () => {
            try {
              const zone = getZone('self', zoneFrom);
              const idx = zone.array.indexOf(cand);
              if (idx >= 0) {
                moveCard('self', 'self', zoneFrom, destination, idx);
                appendMessage('', `auto: ${cand.name} → ${destination === 'bench' ? 'Bench' : 'hand'}`, 'announcement', false);
              }
            } catch {}
            onPick?.(cand);
            overlay.remove();
          });
          grid.appendChild(btn);
        }
      });
    
      overlay.querySelector('.choice-picker-cancel').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
      });
    };
    
    // ── trainer auto-execution (deterministic effects) ───────────────────
    // Fully deterministic effects execute automatically; anything requiring
    // a choice (search/switch) stays guided-only.
    const autoExecuteTrainer = (card, steps) => {
      import('../../actions/move-card-bundle/move-card.js').then(({ moveCard }) => {
        for (const step of steps) {
          try {
            if (step.type === 'discardHandThenDraw') {
              // discard entire hand then draw N
              const hand = getZone('self', 'hand');
              while (hand.getCount() > 0) {
                moveCard('self', 'self', 'hand', 'discard', 0);
              }
              for (let i = 0; i < step.count; i++) {
                if (getZone('self', 'deck').getCount() > 0) moveCard('self', 'self', 'deck', 'hand', 0);
              }
              appendMessage('', `  auto: discarded hand, drew ${step.count}`, 'announcement', false);
            } else if (step.type === 'shuffleHandThenDraw') {
              const handCount0 = getZone('self', 'hand').getCount();
              // move hand back to deck (the sim's shuffle happens via its own
              // deck action; we move + note)
              for (let i = 0; i < handCount0; i++) {
                moveCard('self', 'self', 'hand', 'deck', 0);
              }
              const drawCount = step.count; // bonus handling needs prize count — guided
              for (let i = 0; i < drawCount; i++) {
                if (getZone('self', 'deck').getCount() > 0) moveCard('self', 'self', 'deck', 'hand', 0);
              }
              appendMessage('', `  auto: shuffled hand in, drew ${drawCount} (shuffle your deck)`, 'announcement', false);
            } else if (step.type === 'searchDeck' && step.destination === 'bench' && step.what === 'Basic Pokémon') {
              // Nest Ball / Buddy-Buddy Poffin automation: if the deck holds
              // exactly one Basic (unambiguous), auto-bench it
              import('../../actions/move-card-bundle/move-card.js').then(async ({ moveCard }) => {
                const deck = getZone('self', 'deck');
                const basics = [];
                for (const c of deck.array) {
                  await ensureCardData(c);
                  if ((c.stage || 'Basic') === 'Basic' && c.hp) basics.push(c);
                }
                if (basics.length === 1) {
                  const idx = deck.array.indexOf(basics[0]);
                  moveCard('self', 'self', 'deck', 'bench', idx);
                  appendMessage('', `  auto: benched ${basics[0].name}`, 'announcement', false);
                } else if (basics.length > 1) {
                  openChoicePicker({
                    title: `Nest Ball — choose a Basic Pokémon to bench (${basics.length} in deck)`,
                    candidates: basics,
                    zoneFrom: 'deck',
                    destination: 'bench',
                  });
                }
              });
            } else if (step.type === 'switchOwn') {
              // Switch automation: exactly one benched Pokémon = unambiguous
              const bench = getZone('self', 'bench');
              if (bench.getCount() === 1) {
                appendMessage('', '  auto: switching with your only benched Pokémon — drag to confirm positions', 'announcement', false);
              }
            }
          } catch {}
        }
      });
    };
    
    // ── multiplayer rules sync ────────────────────────────────────────────
    // Listen for socket events carrying rules actions so both clients stay
    // in step (turn passes, attacks, statuses).
    const hookMultiplayerSync = () => {
      // the sim's socket is a global from global-variables.js
      const checkSocket = () => {
        const socket = rulesSocket;
        if (!socket) return false;
        socket.on('rulesEvent', (payload) => {
          try {
            const { type, data } = payload || {};
            if (type === 'turnPassed') {
              appendMessage('', `Opponent ended their turn.`, 'announcement', false);
            } else if (type === 'attacked') {
              appendMessage('', `Opponent used ${data.attackName} — ${data.damage} damage`, 'announcement', false);
              if (data.status) appendMessage('', `Your Pokémon is now ${data.status}!`, 'announcement', false);
            } else if (type === 'ko') {
              appendMessage('', `Your ${data.cardName} was knocked out. Promote a new Active.`, 'announcement', false);
            } else if (type === 'turnOrderCoinFlip') {
              // sender's data is from their own self/opp perspective — invert
              // it so it's correct from ours
              const localCoinOwner = data.coinOwner === 'self' ? 'opp' : 'self';
              const localTurnPlayer = data.turnPlayer === 'self' ? 'opp' : 'self';
              const coin = data.coinId ? getCoinById(data.coinId) : null;
              playTurnOrderCoinAnimation({
                coin,
                result: data.result,
                coinOwner: localCoinOwner,
                turnPlayer: localTurnPlayer,
                isRemote: true,
              });
              // used when we click our own Set Up, so both sides agree
              syncedTurnOrder = localTurnPlayer;
            }
          } catch {}
        });
        return true;
      };
      // socket may init after us — retry briefly
      let tries = 0;
      const timer = setInterval(() => {
        if (checkSocket() || ++tries > 20) clearInterval(timer);
      }, 500);
    };
    
    // ── battle log panel ─────────────────────────────────────────────────
    const BATTLE_LOG_KEY = 'ptcg-sim.rules-battle-log.v1';
    
    const buildBattleLog = () => {
      if (document.getElementById('rulesBattleLog')) return;
      const wrap = document.createElement('div');
      wrap.id = 'rulesBattleLog';
      wrap.innerHTML = `
        <div class="battle-log-header">
          <span>Battle Log</span>
          <button class="battle-log-clear" title="Clear log">✕</button>
        </div>
        <div class="battle-log-entries"></div>`;
      document.body.appendChild(wrap);
    
      const entriesEl = wrap.querySelector('.battle-log-entries');
      wrap.querySelector('.battle-log-clear').addEventListener('click', () => {
        entriesEl.innerHTML = '';
        try { localStorage.removeItem(BATTLE_LOG_KEY); } catch {}
      });
    
      const addEntry = (text, kind = 'info') => {
        if (!text) return;
        const row = document.createElement('div');
        row.className = `battle-log-entry battle-log-${kind}`;
        row.textContent = text;
        entriesEl.appendChild(row);
        // cap at 200 entries
        while (entriesEl.children.length > 200) {
          entriesEl.removeChild(entriesEl.firstChild);
        }
        entriesEl.scrollTop = entriesEl.scrollHeight;
        try {
          localStorage.setItem(BATTLE_LOG_KEY, entriesEl.innerHTML);
        } catch {}
      };
    
      // restore persisted log
      try {
        const saved = localStorage.getItem(BATTLE_LOG_KEY);
        if (saved) entriesEl.innerHTML = saved;
      } catch {}
    
      // intercept rules announcements: monkey-patch appendMessage's caller by
      // listening to DOM changes in the chatbox
      const chatbox = document.getElementById('chatbox');
      if (chatbox) {
        const observer = new MutationObserver((mutations) => {
          if (!rulesState.enabled) return;
          for (const m of mutations) {
            for (const node of m.addedNodes) {
              if (node.nodeType === 1) {
                const text = node.textContent?.trim() || '';
                if (!text) continue;
                const kind = text.includes('💀') || text.includes('KO') ? 'ko'
                  : text.includes('Attack:') ? 'attack'
                  : text.includes('Turn passes') || text.includes('Turn ') ? 'turn'
                  : text.includes('⚠️') ? 'warn'
                  : text.includes('🏆') ? 'win'
                  : 'info';
                addEntry(text, kind);
              }
            }
          }
        });
        observer.observe(chatbox, { childList: true, subtree: true });
      }
    };
    
    // ── attack/KO visual feedback ────────────────────────────────────────
    const playAttackFeedback = () => {
      // TCG Live style: no board shake — feedback is card-level only
      // (KO pulse is applied directly on the knocked-out card image)
    };
    
    // ── game-over banner ──────────────────────────────────────────────────
    const buildEndScreen = () => {
      if (document.getElementById('rulesEndScreen')) return;
      const el = document.createElement('div');
      el.id = 'rulesEndScreen';
      el.hidden = true;
      el.innerHTML = `
        <div class="rules-end-card">
          <div class="rules-end-title">Game Over</div>
          <div class="rules-end-reason"></div>
          <button class="rules-end-close">Close</button>
        </div>`;
      document.body.appendChild(el);
      el.querySelector('.rules-end-close').addEventListener('click', () => {
        el.hidden = true;
      });
    
      window.setInterval(() => {
        if (rulesState.enabled && rulesState.phase === 'ended' && rulesState.turnNumber > 0) {
          const reason = el.querySelector('.rules-end-reason');
          if (reason && !reason.textContent) {
            reason.textContent = 'A win condition was met. Reset the board to play again.';
          }
          el.hidden = false;
        } else {
          el.hidden = true;
          const reason = el.querySelector('.rules-end-reason');
          if (reason) reason.textContent = '';
        }
      }, 1000);
    };
    
    // match a card against a search-step's target description
    const matchesSearch = (card, what = '') => {
      const w = what.toLowerCase();
      const isPokemon = !!card.hp;
      const isTrainer = String(card.supertype || card.type || '').toLowerCase().includes('trainer');
      if (w.includes('item') && w.includes('tool')) return isTrainer;
      if (w.includes('mega evolution')) return isPokemon && String(card.name || '').toLowerCase().includes('mega');
      if (w.includes('basic') && w.includes('stage 1') && w.includes('stage 2')) return isPokemon;
      if (w.includes('basic')) return isPokemon && (card.stage || 'Basic') === 'Basic';
      if (w.includes('pokémon')) return isPokemon;
      return true; // generic search: everything matches
    };
    
    // ── trainer play guidance ────────────────────────────────────────────
    // Watching the hand → play zones for Trainer-class cards. When one lands
    // in play, announce its effect steps; searchDeck/lookAtTop effects open
    // the private deck window so the player can legally look.
    const hookTrainerPlay = () => {
      window.setInterval(() => {
        if (!rulesState.enabled || rulesState.phase === 'ended') return;
        if (rulesState.turnPlayer !== 'self') return;
        try {
          const board = getZone('self', 'board');
          if (!board?.array) return;
          for (const card of board.array) {
            const img = card.image;
            if (!img || img.__rulesTrainerAnnounced) continue;
            img.__rulesTrainerAnnounced = true;
            const isTrainer = String(card.type || '').toLowerCase().includes('trainer') ||
              String(card.supertype || '').toLowerCase().includes('trainer');
if (!isTrainer) {
                      // Pokemon: announce + auto-apply deterministic abilities
                      ensureCardData(card).then(() => {
                        const ability = card.ability?.text || card.abilityText;
                        if (!ability) return;
                        const steps = parseAbility(ability);
                        const name = card.ability?.name || 'Ability';
                        appendMessage('', `✦ ${card.name} — ${name}:`, 'announcement', false);
                        for (const s of steps) appendMessage('', '  ' + s.guidance, 'announcement', false);
    
                        // auto-apply draw abilities once per turn (flag on image)
                        const drawStep = steps.find((s) => s.type === 'drawAbility');
                        if (drawStep && !img.__rulesAbilityUsed) {
                          import('../../actions/move-card-bundle/move-card.js').then(({ moveCard }) => {
                            for (let k = 0; k < drawStep.count; k++) {
                              try {
                                if (getZone('self', 'deck').getCount() > 0) {
                                  moveCard('self', 'self', 'deck', 'hand', 0);
                                }
                              } catch {}
                            }
                            img.__rulesAbilityUsed = true;
                            appendMessage('', `  auto: drew ${drawStep.count} (ability used this turn)`, 'announcement', false);
                          });
                        }
                      });
                      continue;
                    }
            ensureCardData(card).then(() => {
              const text = [card.effect || card.text || []].flat().join(' ');
              const parsed = parseTrainerEffect(text);
              if (!parsed.recognizable) {
                appendMessage('', `${card.name}: effect not auto-parsed — play it manually.`, 'announcement', false);
                return;
              }
              appendMessage('', `▶ ${card.name}:`, 'announcement', false);
              for (const step of parsed.steps) {
                appendMessage('', '  ' + describeStep(step), 'announcement', false);
                if (step.type === 'searchDeck' || step.type === 'lookAtTop') {
                  openDeckSearchWindow(`${card.name} lets you search your deck`);
                  appendMessage('', '  (deck unlocked — click your deck to look)', 'announcement', false);
                }
              }
              // auto-execute the fully-deterministic draw effects
              autoExecuteTrainer(card, parsed.steps);
    
              // choice-based searches: open the picker with filtered candidates
              const searchStep = parsed.steps.find((s) => s.type === 'searchDeck' && s.destination === 'hand');
              if (searchStep) {
                import('./rules-state.mjs').then(async ({ ensureCardData }) => {
                  const deck = getZone('self', 'deck');
                  const matches = [];
                  for (const c of deck.array) {
                    await ensureCardData(c);
                    if (matchesSearch(c, searchStep.what)) matches.push(c);
                  }
                  if (matches.length === 0) {
                    appendMessage('', '  no matching cards in deck', 'announcement', false);
                  } else {
                    openChoicePicker({
                      title: `${card.name} — take a card to hand`,
                      candidates: matches,
                      zoneFrom: 'deck',
                      destination: 'hand',
                    });
                  }
                });
              }
    
              // recursion (Night Stretcher): picker from discard
              const recurStep = parsed.steps.find((s) => s.type === 'recursion');
              if (recurStep) {
                import('./rules-state.mjs').then(async ({ ensureCardData }) => {
                  const discard = getZone('self', 'discard');
                  const matches = [];
                  for (const c of discard.array) {
                    await ensureCardData(c);
                    const isPokemon = !!c.hp;
                    const isBasicEnergy = String(c.name || '').toLowerCase().includes('energy');
                    if (isPokemon || isBasicEnergy) matches.push(c);
                  }
                  if (matches.length > 0) {
                    openChoicePicker({
                      title: `${card.name} — take a card from discard`,
                      candidates: matches,
                      zoneFrom: 'discard',
                      destination: 'hand',
                    });
                  }
                });
              }
            });
          }
        } catch {}
      }, 1000);
    };
    
    // ── move gating ──────────────────────────────────────────────────────
    const hookMoveCard = () => {
      window.addEventListener('rules-check-move', (event) => {
        const { user, fromZone, toZone, callback } = event.detail || {};
        const check = canPerformAction({ user, action: 'moveCard', zoneId: fromZone, targetZoneId: toZone });
        callback?.(check);
      });
    };
    
    // ── attack panel UI ──────────────────────────────────────────────────
    const buildAttackPanel = () => {
      if (document.getElementById('attackPanel')) return;
      const selfDoc = self.document;
    
      const panel = document.createElement('div');
      panel.id = 'attackPanel';
      panel.hidden = true;
      panel.innerHTML = `
        <div class="attack-panel-card">
          <div class="attack-panel-title">Attacks</div>
          <div class="attack-panel-list"></div>
          <div class="attack-panel-footer">
            <span class="attack-panel-hint">Attacking ends your turn</span>
          </div>
        </div>`;
      selfDoc.body.appendChild(panel);
    
      const attacker = () => getZone('self', 'active').array[0];
      const list = panel.querySelector('.attack-panel-list');
    
      const refresh = async () => {
        const active = attacker();
        list.innerHTML = '';
        if (!active) {
          list.innerHTML = '<div class="attack-panel-empty">No active Pokémon.</div>';
          return;
        }
        await ensureCardData(active);
        const attacks = active.attacks || [];
        if (attacks.length === 0) {
          list.innerHTML = '<div class="attack-panel-empty">This Pokémon has no attacks.</div>';
          return;
        }
        attacks.forEach((attack, index) => {
          const cost = (attack.cost || []).join(' ');
          const btn = document.createElement('button');
          btn.className = 'attack-panel-button';
          btn.innerHTML = `<span class="attack-panel-cost">${escapeHtml(cost)}</span>
            <span class="attack-panel-name">${escapeHtml(attack.name)}</span>
            <span class="attack-panel-damage">${attack.damage != null ? attack.damage : ''}</span>`;
          btn.addEventListener('click', () => runAttack(index));
          list.appendChild(btn);
        });
      };
    
      const runAttack = async (index) => {
        // modern rule: the player going first can't attack on turn 1
        if (rulesState.turnNumber === 1) {
          toastRulesBlocked("Can't attack on the first turn (going first).");
          return;
        }
        // status check: paralyzed/asleep act as attack blocks
        const { canActThroughStatuses } = await import('./status.mjs');
        const me0 = attacker();
        if (me0) {
          const myKey = me0.image?.dataset?.cardId || me0.name;
          const statusCheck = canActThroughStatuses('self', myKey);
          if (!statusCheck.can) {
            toastRulesBlocked(statusCheck.reason);
            return;
          }
        }
    
        const me = attacker();
        const oppActive = getZone('opp', 'active').array[0];
        if (!me || !oppActive) {
          toastRulesBlocked('Both players need an active Pokémon.');
          return;
        }
        await ensureCardData(me);
        await ensureCardData(oppActive);
    
        const attack = (me.attacks || [])[index];
        if (!attack) return;
    
        // gather attached energy types (the sim tracks attachments by image
        // adjacency; we read the counters the attach flow maintains)
        const energies = getAttachedEnergyTypes(me);
    
        const result = await executeAttack({
          attacker: { ...me, attachedEnergies: energies },
          defender: oppActive,
          attack,
          attackIndex: index,
          damageApplier: (total) => applyDamageToOpponent(total),
          prizeTaker: () => {},
        });
    
        if (!result.ok) {
          toastRulesBlocked(result.reason);
          return;
        }
    
        playAttackFeedback(result.ko);

    const parts = [`Attack: ${attack.name}`];
        if (result.breakdown.multiplier > 1) parts.push(`weakness ×${result.breakdown.multiplier}`);
        if (result.breakdown.resistance > 0) parts.push(`resistance −${result.breakdown.resistance}`);
        parts.push(`${result.damage} damage`);
        appendMessage('', parts.join(' · '), 'announcement', false);
    
        // sync to opponent in multiplayer
        if (systemState.isTwoPlayer && rulesSocket) {
          rulesSocket.emit('rulesEvent', {
            type: 'attacked',
            data: {
              attackName: attack.name,
              damage: result.damage,
              status: (parseStatusFromAttackText(attack.text || ''))[0] || null,
            },
          });
        }
    
        if (result.ko) {
          appendMessage('', `${oppActive.name || 'Defending Pokémon'} is knocked out!`, 'announcement', false);
          const ko = handleKO({ attackerPlayer: 'self', defender: oppActive });
          appendMessage('', `Take ${ko.prizeCount} prize${ko.prizeCount > 1 ? 's' : ''} (${ko.prizesRemaining} remaining)`, 'announcement', false);
              // auto-take the prize cards (TCG Live moves them to hand directly)
              import('../../actions/move-card-bundle/move-card.js').then(({ moveCard }) => {
                for (let i = 0; i < ko.prizeCount; i++) {
                  try {
                    if (getZone('self', 'prizes').getCount() > 0) {
                      moveCard('self', 'self', 'prizes', 'hand', 0);
                    }
                  } catch {}
                }
                appendMessage('', 'Prize card(s) added to hand', 'announcement', false);
              });
          const { promotionGuidance } = await import('./ko-flow.mjs');
          const oppBench = getZone('opp', 'bench').array.length;
          const guidance = promotionGuidance('opp', oppBench);
          if (guidance) appendMessage('', guidance, 'announcement', false);
          if (ko.won) {
            appendMessage('', '🏆 All prizes taken — you win!', 'announcement', false);
            rulesState.phase = 'ended';
            panel.hidden = true;
            return;
          }
        }
    
        // apply statuses printed on the attack (TCG Live parses these)
        const statuses = parseStatusFromAttackText(attack.text || '');
        for (const status of statuses) {
          applyStatus('opp', oppActive.image?.dataset?.cardId || oppActive.name, status);
          appendMessage('', `${oppActive.name || 'Defender'} is now ${status}!`, 'announcement', false);
        }
    
        // turn-boundary status damage on our own active (poison/burn)
        const myId = me.image?.dataset?.cardId || me.name;
        const boundary = resolveTurnBoundary('self', myId);
        if (boundary.damage > 0 && me.image?.damageCounter) {
          const current = parseInt(me.image.damageCounter.textContent || '0', 10) || 0;
          me.image.damageCounter.textContent = current + boundary.damage;
        }
        for (const note of boundary.notes) {
          appendMessage('', note, 'announcement', false);
        }
    
        // attack ends the turn automatically
        const next = endTurn(rulesState.turnPlayer);
        appendMessage('', `Turn passes to ${next === 'self' ? 'P1' : 'P2'}`, 'announcement', false);
        updateTurnBanner();
        panel.hidden = true;
      };
    
      const getAttachedEnergyTypes = (card) => {
            // type each attached energy from its name (basic energies) or
            // enriched API data (special energies)
            const attachedZone = getZone('self', 'attachedCards');
            const NAME_TO_TYPE = {
              'grass energy': 'Grass', 'fire energy': 'Fire', 'water energy': 'Water',
              'lightning energy': 'Lightning', 'psychic energy': 'Psychic',
              'fighting energy': 'Fighting', 'darkness energy': 'Darkness',
              'metal energy': 'Metal', 'dragon energy': 'Dragon', 'fairy energy': 'Fairy',
            };
            const energies = [];
            for (const attached of attachedZone.array) {
              if (attached.image?.relative === card.image) {
                const name = String(attached.name || '').toLowerCase().trim();
                const mapped = NAME_TO_TYPE[name];
                if (mapped) {
                  energies.push(mapped);
                  continue;
                }
                const types = attached.types;
                if (Array.isArray(types) && types.length > 0 && String(attached.supertype || attached.type || '').toLowerCase().includes('energy')) {
                  energies.push(types[0]);
                  continue;
                }
                const t = attached.type || attached.image.dataset?.energyType;
                if (t) energies.push(String(t));
              }
            }
            return energies;
          };
    
      const applyDamageToOpponent = (total) => {
        const oppActive = getZone('opp', 'active').array[0];
        if (!oppActive?.image?.damageCounter) return;
        oppActive.currentDamage = total;
        oppActive.image.damageCounter.textContent = total;
        // sync to opponent in multiplayer
        if (systemState.isTwoPlayer) {
          import('../../setup/general/process-action.js').then(({ processAction }) => {
            processAction('opp', true, 'updateDamageCounter', ['active', 0, total]);
          });
        }
      };
    
      // retreat button lives in the panel footer
      const footer = panel.querySelector('.attack-panel-footer');
      const retreatBtn = document.createElement('button');
      retreatBtn.className = 'attack-panel-retreat';
      retreatBtn.textContent = 'Retreat Active Pokémon';
      footer.appendChild(retreatBtn);
    
      retreatBtn.addEventListener('click', async () => {
        const { canRetreat, markRetreated } = await import('./retreat.mjs');
        const me = attacker();
        if (!me) {
          toastRulesBlocked('No active Pokémon.');
          return;
        }
        await ensureCardData(me);
        const energies = getAttachedEnergyTypes(me);
        const check = canRetreat('self', me, energies);
        if (!check.allowed) {
          toastRulesBlocked(check.reason);
          return;
        }
        // retreat = discard cost energies + prompt bench selection
        const bench = getZone('self', 'bench').array;
        if (bench.length === 0) {
          toastRulesBlocked('No benched Pokémon to retreat into.');
          return;
        }
        markRetreated('self');
        const cost = me.retreatCost || 0;
        appendMessage('', `Retreat: discard ${cost} energy, then drag a benched Pokémon to Active.`, 'announcement', false);
        toastRulesBlocked(`Retreating ${me.name || 'active'} — move a bench Pokémon to Active.`);
      });
    
      // show panel when the local player's turn begins in rules mode;
      // hide (with a dimmed 'waiting' state) on the opponent's turn
      document.addEventListener('rules-mode-changed', refresh);
      document.addEventListener('rules-turn-began', refresh);
      window.setInterval(() => {
        if (!rulesState.enabled || rulesState.phase === 'ended') {
          panel.hidden = true;
          return;
        }
        const myTurn = rulesState.turnPlayer === 'self';
        panel.hidden = false;
        panel.classList.toggle('waiting-for-opponent', !myTurn);
        if (myTurn) refresh();
      }, 2000);
    };
    
    const updateTurnBanner = () => {
      document.dispatchEvent(new CustomEvent('rules-turn-began', { detail: { player: rulesState.turnPlayer } }));
    };
    
    const escapeHtml = (v = '') => String(v)
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    
    const toastRulesBlocked = (reason) => {
      appendMessage('', `⛔ ${reason}`, 'announcement', false);
    };
    
    export { buildRulesToggle };
    