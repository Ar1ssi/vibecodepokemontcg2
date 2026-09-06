// Bridge between the free-form sim and the rules engine. Installs gates
    // on existing handlers (deck view, moves) and provides the attack flow UI.
    
    import { systemState, socket as rulesSocket } from '../../initialization/global-variables/global-variables.js';
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
      markAbilityUsed,
      abilityUsed,
      loadRulesEnabled,
      persistRulesEnabled,
      getStadium,
      shouldAutoDrawAtTurnStart,
      markTurnDrawn,
      markMulligansResolved,
      markAttacked,
      resetRulesSessionState,
    } from './rules-state.mjs';
    import { executeAttack, canPayAttackCost } from './attack-engine.mjs';
    import { handleKO, checkWinConditions, resetPrizes, prizeState } from './ko-flow.mjs';
    import { applyStatus, parseStatusFromAttackText, resolveTurnBoundary, resetStatuses, clearStatuses } from './status.mjs';
import { statusState } from './status.mjs';
import { initTrainerExecution, runTrainerSteps } from './trainer-execution.js';
import { parseTrainerEffect, describeStep } from './trainer-effects.mjs';
import { canEvolve, markEvolvedThisTurn } from './evolution.mjs';
import { parseAbility } from './abilities.mjs';
import { shuffleZone } from '../../actions/zones/shuffle-zone.js';
import { parseEndOfTurnEffect, parseWhenPlayedEffect, parseOpponentDiscard, isHandProtected, parseCheckupEffect, parseSetupFaceDown, parseOnOpponentEvolve, parseAttackInheritance, blocksItemPlay, combinedHandProtected } from './ability-executors.mjs';
import { isStadiumHandProtect, effectiveHp, parseStadiumCostModifier, getStadiumCheckupPoisonBonus, stadiumBlocksToolEffects } from './stadium-effects.mjs';
import { classifyEnergyEffect, describeEnergyEffect, applyEnergyEffect, resolveAttachedEnergyType, energyMatchesSearchWhat } from './energy-effects.mjs';
import { isPokemonCard, matchesSearch, filterSearchMatches, energySearchWhat } from './search-match.mjs';
import { maybeAnnounceSearchReveal, announceDiscardPick } from './search-reveal.mjs';
import {
  describeTypedSpecialEnergy,
  getTelepathicOnAttachSearch,
  matchesBasicPokemonType,
  parseTypedSpecialEnergy,
  pokemonMatchesEnergyType,
} from './special-energy-effects.mjs';
import { classifyAbility, describeAbilityFamily } from './ability-effects.mjs';
import {
  planAbilitySteps,
  actionableAbilityPlan,
  markAbilityUseAfterSearchStep,
} from './ability-step-plan.mjs';
import { decideTurnOrder, resolveTurnOrderCaller } from './rules-turnorder.mjs';
import { listUsableActions } from './attack-window.mjs';
import { attack, healAbility, switchAbility, attachAbility, energyRedirectAbility, statusAbility, moveDamageAbility, lookAtTopAbility, recursionAbility, evolveAbility } from '../../actions/chat-buttons/chat-buttons.js';
import { hideCard } from '../../actions/general/reveal-and-hide.js';
import { addDamageCounter, updateDamageCounter } from '../../actions/counters/damage-counter.js';
import { evaluateMulligans, bonusDrawsOwed } from './mulligan.mjs';
import { draw } from '../../actions/zones/deck-actions.js';
import { shuffleAndDraw } from '../../actions/zones/hand-actions.js';
import { getCoinById } from '../deck-builder/core/coins.mjs';
import {
  flipMatCoin,
  getSelectedCoin,
  initMatCoins,
  pickRandomCoin,
  setSelectedCoin,
} from './mat-coin.js';
    
    let initialized = false;

    document.addEventListener('rules-coin-changed', (event) => {
      const { target, coin } = event.detail || {};
      if (target !== 'self' && target !== 'opp') return;
      // Online 2P: tell the opponent which coin we chose so their mat
      // shows ours (rulesEvent is relayed by the server generically).
      if (target === 'self' && systemState.isTwoPlayer && rulesSocket) {
        rulesSocket.emit('rulesEvent', { type: 'coinChosen', data: { coin } });
      }
    });
    
    // When the opponent's client resolves the coin flip first (multiplayer),
    // their result is mirrored here so our own Set Up click uses the same
    // outcome instead of flipping independently.
    let syncedTurnOrder = null;
    // True while a coin flip animation is in flight, so a second Set Up
    // click (on a different button) can't start a second flip/game start.
    let coinFlipPending = false;
    // Set when a turn was auto-ended by an attack, so the next +Turn click
    // is swallowed instead of double-advancing the turn.
    let turnEndedByAttack = false;
    // Set when the authoritative remote turnOrderCoinFlip event arrives so
    // a stale local flip (still in flight) does NOT double-start the game.
    let flipSuperseded = false;
    // "Call the coin": the caller's heads/tails pick, remembered when it
    // arrives via the opponent's turnOrderCoinCall event (they clicked
    // Set Up first), so a late click on our side mirrors their call.
    let coinCallChoice = null;
    // Who the caller is from our perspective ('self' unless the opponent
    // clicked Set Up first and broadcast their call).
    let coinCallCaller = 'self';
    // True while the heads/tails call picker is open.
    let coinCallPending = false;
    // Bumped on reset/restart so stale coin-flip / mulligan callbacks cannot
    // re-enter beginSetupWithTurnOrder after the session was cleared.
    let rulesSessionGeneration = 0;
    
    export const initializeRulesEngine = () => {
      if (initialized) return;
      initialized = true;
      loadRulesEnabled();
  document.body.classList.toggle('rules-mode', rulesState.enabled);
      initMatCoins();
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
      hookMoveCard();
      hookEnergyAttach();
      syncRulesToggleUI();
      buildAttackWindow();
      hookTurnStartDraw();
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
      document.addEventListener('rules-session-reset', refresh);
      window.setInterval(refresh, 1500);
    };

    // ── attack window: list attacks + abilities, let the player choose ──
    const buildAttackWindow = () => {
      if (document.getElementById('rulesAttackWindow')) return;
      const win = document.createElement('div');
      win.id = 'rulesAttackWindow';
      win.hidden = true;
      win.innerHTML = `<h4 class="rules-aw-title">⚔️ Attack Window</h4><div class="rules-aw-body"></div>`;
      document.body.appendChild(win);

      const energySymbols = {
        Colorless: '⚪', Fire: '🔥', Water: '💧', Grass: '🌿',
        Lightning: '⚡', Psychic: '🔮', Fighting: '🥊', Metal: '⚙️',
        Dark: '🌑', Dragon: '🐉',
      };
      const costStr = (arr) => (arr || []).map(s => energySymbols[s] || s).join('');

      const refresh = async () => {
        if (
          !rulesState.enabled ||
          rulesState.phase === 'setup' ||
          rulesState.turnPlayer !== 'self' ||
          rulesState.phase === 'ended'
        ) {
          win.hidden = true;
          return;
        }
        win.hidden = false;
        const body = win.querySelector('.rules-aw-body');
        const active = getZone('self', 'active').array[0];
        if (!active) { body.innerHTML = '<em>No active Pokémon.</em>'; return; }

        try { await ensureCardData(active); } catch { /* card data may not be ready yet */ }

        // Gather energy types (same logic as chat-buttons.attack())
        const attachedEnergies = getZone('self', 'active').array.filter(
          (c) => c.type === 'Energy' && c.image?.relative === active.image
        );
        const energyTypes = [];
        for (const e of attachedEnergies) {
          try { await ensureCardData(e); } catch { /* skip */ }
          const family = classifyEnergyEffect(e);
          energyTypes.push({ type: resolveAttachedEnergyType(e), family });
        }

        const stadiumCard = getStadium()?.card;
        const stadiumCostModifier = stadiumCard ? parseStadiumCostModifier(stadiumCard) : 0;
        const abilityUsedFlag = abilityUsed('self', active);
        let priorAttacks = [];
        if (parseAttackInheritance(active)) {
          appendMessage(
            '',
            `🧬 ${active.name}: can use attacks from previous Evolutions (see card text).`,
            'announcement',
            false
          );
          if (active.evolvesFrom) {
            priorAttacks = [];
          }
        }

        const { attacks: atkList, abilities: abList } = listUsableActions(active, {
          energyTypes,
          stadiumCostModifier,
          abilityUsed: abilityUsedFlag,
          rulesEnabled: true,
          priorAttacks,
        });

        let html = '';

        // ── Attacks ──
        if (atkList.length) {
          html += '<div class="rules-aw-section">Attacks</div>';
          for (const a of atkList) {
            const badge = a.usable
              ? '<span class="rules-aw-badge rules-aw-usable">✓</span>'
              : `<span class="rules-aw-badge rules-aw-unusable">✗</span>`;
            const dmg = a.damage != null ? `<span class="rules-aw-dmg">${a.damage} dmg</span>` : '';
            html += `<div class="rules-aw-row ${a.usable ? 'rules-aw-clickable' : ''}" data-attack-idx="${a.index}">`+
              `<span class="rules-aw-name">${a.name}</span>`+
              `<span class="rules-aw-cost">${costStr(a.effectiveCost)}</span>`+
              dmg + badge +
              (a.reason ? `<span class="rules-aw-reason">${a.reason}</span>` : '')+
              `</div>`;
          }
        } else {
          // Self-diagnosing hint: surface why no attacks resolved so a data-plumbing
          // issue (e.g. zone card never got a TCGdex id) is visible to the player.
          if (typeof console !== 'undefined') {
            console.warn('[rules] attack window: no attacks resolved', {
              name: active.name,
              hasId: !!active.id,
              attacks: Array.isArray(active.attacks) ? active.attacks.length : typeof active.attacks,
            });
          }
          const notLoaded = Array.isArray(active.attacks) ? '' : ' · data not loaded (check network / TCGdex)';
          html += '<div class="rules-aw-section">No attacks defined.' +
            ` <span class="rules-aw-reason">id=${active.id || '—'}${notLoaded}</span></div>`;
        }

        // ── Abilities ──
        if (abList.length) {
          html += '<div class="rules-aw-section">Abilities</div>';
          const family = classifyAbility(active);
          for (const ab of abList) {
            const badge = ab.usable
              ? '<span class="rules-aw-badge rules-aw-usable">✓</span>'
              : '<span class="rules-aw-badge rules-aw-unusable">✗</span>';
            html += `<div class="rules-aw-row ${ab.usable ? 'rules-aw-clickable' : ''}" data-ability="${family}">`+
              `<span class="rules-aw-name">${ab.name}</span>`+
              badge +
              (ab.reason ? `<span class="rules-aw-reason">${ab.reason}</span>` : '')+
              `</div>`;
          }
        }

        body.innerHTML = html;

        // Wire clicks
        body.querySelectorAll('[data-attack-idx]').forEach((row) => {
          if (!row.classList.contains('rules-aw-clickable')) return;
          row.addEventListener('click', () => {
            const idx = parseInt(row.dataset.attackIdx, 10);
            attack('self', true, idx);
          });
        });
        body.querySelectorAll('[data-ability]').forEach((row) => {
          if (!row.classList.contains('rules-aw-clickable')) return;
          row.addEventListener('click', () => {
            runAbilitySteps('self', active);
          });
        });
      };

      document.addEventListener('rules-turn-began', refresh);
      document.addEventListener('rules-mode-changed', refresh);
      document.addEventListener('rules-session-reset', refresh);
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
        if (systemState.isTwoPlayer && !e.target.checked) {
          // Multiplayer games always run with rules enforced: snap the
          // checkbox back instead of letting it be unticked.
          e.target.checked = true;
          appendMessage('', 'Rules enforcement is always on in multiplayer.', 'announcement', false);
          return;
        }
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
    
    // Multiplayer games always run with rules enforced. Called when
    // systemState.isTwoPlayer becomes true (joinGame / spectatorJoin) so a
    // solo "off" preference can't carry into a shared game.
    export const forceRulesEnabledForMultiplayer = () => {
      if (rulesState.enabled) {
        syncRulesToggleUI();
        return;
      }
      rulesState.enabled = true;
      persistRulesEnabled();
      appendMessage('', 'Rules enforcement is always on in multiplayer.', 'announcement', false);
      document.dispatchEvent(new CustomEvent('rules-mode-changed', { detail: { enabled: true } }));
      document.body.classList.toggle('rules-mode', true);
      syncRulesToggleUI();
    };
    
    // ── turn flow: attack ends turn; +Turn advances ──────────────────────
    const hookTurnButton = () => {
      const btn = document.getElementById('passButton');
      if (!btn) return;
      btn.addEventListener('click', async (event) => {
        if (!rulesState.enabled) return;
        // Suppress pass() and legacy takeTurn before any await — otherwise
        // the bubble handler runs while this async listener is suspended and
        // the turn advances twice (double start-of-turn draw for the opponent).
        event.preventDefault();
        event.stopImmediatePropagation();
        if (turnEndedByAttack) {
          turnEndedByAttack = false;
          return; // turn already ended by an attack
        }
    
        // Pokémon Checkup passive abilities (Froslass pattern) before status boundary
        if (rulesState.enabled) {
          for (const player of ['self', 'opp']) {
            for (const zoneId of ['active', 'bench']) {
              for (const source of getZone(player, zoneId).array) {
                if (source.type !== 'Pokémon') continue;
                const checkup = parseCheckupEffect(source);
                if (!checkup?.count) continue;
                appendMessage(
                  '',
                  `🩺 ${checkup.source}: Pokémon Checkup — ${checkup.count} damage counter${checkup.count !== 1 ? 's' : ''}.`,
                  'announcement',
                  false
                );
                for (const targetPlayer of ['self', 'opp']) {
                  for (const targetZone of ['active', 'bench']) {
                    const tZone = getZone(targetPlayer, targetZone);
                    for (let tIdx = 0; tIdx < tZone.array.length; tIdx++) {
                      const target = tZone.array[tIdx];
                      if (target.type !== 'Pokémon') continue;
                      if (
                        checkup.exceptName &&
                        String(target.name || '').toLowerCase().includes(checkup.exceptName)
                      ) {
                        continue;
                      }
                      if (
                        checkup.targetHasAbility &&
                        !(target.ability?.text || target.abilityText)
                      ) {
                        continue;
                      }
                      const existing = parseInt(
                        target.image?.damageCounter?.textContent || '0',
                        10
                      ) || 0;
                      if (target.image?.damageCounter) {
                        target.image.damageCounter.textContent = existing + checkup.count;
                      } else {
                        addDamageCounter(targetPlayer, targetZone, tIdx, checkup.count);
                      }
                    }
                  }
                }
              }
            }
          }
        }

        // end-of-turn: resolve the turn player's statuses before passing
        const endingPlayer = rulesState.turnPlayer;
        try {
          const active = getZone(endingPlayer, 'active').array[0];
          if (active) {
            const key = active.image?.dataset?.cardId || active.name;
            const boundary = resolveTurnBoundary(endingPlayer, key, Math.random, {
              checkupPoisonBonus: getStadiumCheckupPoisonBonus(active, endingPlayer),
            });
            if (boundary.damage > 0 && active.image?.damageCounter) {
              const current = parseInt(active.image.damageCounter.textContent || '0', 10) || 0;
              active.image.damageCounter.textContent = current + boundary.damage;
            }
            for (const note of boundary.notes) {
              appendMessage('', note, 'announcement', false);
            }
          }
        } catch {}
    
        // end-of-turn ability effects (ability family: end-of-turn):
        // resolve for the ending player's Active + bench, once per turn
        if (rulesState.enabled) {
          for (const zoneId of ['active', 'bench']) {
            for (const card of getZone(endingPlayer, zoneId).array) {
              if (abilityUsed(endingPlayer, card)) continue;
              try {
                await ensureCardData(card);
              } catch {}
              const effect = parseEndOfTurnEffect(card);
              if (!effect) continue;
              markAbilityUsed(endingPlayer, card);
              if (effect.kind === 'draw') {
                import('../../actions/move-card-bundle/move-card-bundle.js').then(({ moveCardBundle }) => {
                  for (let k = 0; k < effect.n; k++) {
                    if (getZone(endingPlayer, 'deck').getCount() > 0) {
                      moveCardBundle(endingPlayer, endingPlayer, 'deck', 'hand', 0, false, 'move');
                    }
                  }
                });
                appendMessage(
                  '',
                  `⏰ End of turn: ${card.name || 'your Pokémon'} draws ${effect.n} card(s).`,
                  'announcement',
                  false
                );
              } else if (effect.kind === 'search') {
                appendMessage(
                  '',
                  `⏰ End of turn: ${card.name || 'your Pokémon'} searches for a card (see Search ability).`,
                  'announcement',
                  false
                );
              }
            }
          }
        }
    
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
    
        // This is the only path that actually ends the turn (the three
        // early-return paths above all bail before reaching it). The rules
        // capture handler is registered before the board bubble handler
        // (initializeSidebox() runs before initializeTable()), so suppressing
        // the event here stops the legacy takeTurn(...) bubble handler from
        // also firing — otherwise it would start the initiator's own turn and
        // "interrupt" the opponent right after we passed the turn. Deliberate,
        // rules-mode-only exception to the "capture hooks don't suppress"
        // invariant (which protects the Set Up / Reset hooks).
        const next = endTurn(rulesState.turnPlayer);
        appendMessage('', `Turn passes to ${next === 'self' ? 'P1' : 'P2'}`, 'announcement', false);
        updateTurnBanner();
      }, true); // capture phase, runs before existing handler
    };
    
    const hookSetupButton = () => {
      // The coin flip used to fire the instant a Set Up button was
      // clicked. Set Up is now a "ready check" (see ready.js) — the
      // actual game/hand setup only happens once BOTH players have
      // pressed their button, at which point ready.js dispatches
      // 'both-players-ready' on document. Listen for that instead of the
      // raw click so the coin flip happens after setup is complete.
      document.addEventListener('both-players-ready', handleSetupClick);
      hookResetButtons();
    };
    
    // Non-rules Reset handlers don't touch rulesState, so without this the
    // phase would stay 'draw' and a later Set Up would skip the coin flip.
    const resetRulesSession = () => {
      rulesSessionGeneration += 1;
      resetRulesSessionState();
      resetPrizes();
      resetStatuses();
      syncedTurnOrder = null;
      turnEndedByAttack = false;
      flipSuperseded = false;
      coinCallChoice = null;
      coinCallCaller = 'self';
      coinCallPending = false;
      coinFlipPending = false;
      closeDeckSearchWindow();
      document.getElementById('rulesCoinCallOverlay')?.remove();
      document.getElementById('rulesChoicePicker')?.remove();
      const hud = document.getElementById('rulesTurnHUD');
      if (hud) hud.hidden = true;
      document.dispatchEvent(new CustomEvent('rules-session-reset'));
    };

    const hookResetButtons = () => {
      ['resetButton', 'p2ResetButton', 'resetBothButton', 'restartButton'].forEach((id) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener('click', () => {
          if (!rulesState.enabled) return;
          resetRulesSession();
        }, true);
      });
      document.addEventListener('game-restarted', () => {
        if (!rulesState.enabled) return;
        resetRulesSession();
      });
    };
    
    // Shared setup sequence once turn order is decided — used both by the
    // local Set Up click and by the mirror side's auto-start (so the mirror
    // no longer needs a second Set Up click).
    const beginSetupWithTurnOrder = (firstPlayer) => {
      // Guard: if the game has already started (phase left 'setup'), a second
      // invocation (double Set Up click, duplicate turnOrderCoinFlip event,
      // or local flip + mirror both landing) would re-run startGame() and
      // reset drewThisTurn, causing a double auto-draw on turn 1.
      if (rulesState.phase !== 'setup') return;
      const session = rulesSessionGeneration;
      startGame(firstPlayer);
          // startGame() only resets to turnNumber 0 / phase 'draw' — it never
          // advances into the first player's actual turn 1. beginTurn() is
          // what increments turnNumber and flips phase to 'main'; without
          // calling it here, the first player's opening turn silently runs
          // at turnNumber 0, which shifts the "turn 1" attack restriction
          // onto the second player's first turn instead.
          beginTurn(firstPlayer === 'opp' ? 'opp' : 'self');
          resetPrizes();
          resetStatuses();
          appendMessage('', 'Rules engine active — good luck!', 'announcement', false);
    
          // mulligan check: opening hands must contain a Basic Pokémon
          setTimeout(async () => {
            try {
              if (session !== rulesSessionGeneration) return;
              if (rulesState.mulligansResolved) return;

              const selfHand = getZone('self', 'hand').array;
              const oppHand = getZone('opp', 'hand').array;
              const steps = await evaluateMulligans({ selfHand, oppHand });

              // No mulligans needed
              if (steps.length === 1 && steps[0].mulligan === false) {
                markMulligansResolved();
                return;
              }

              for (const step of steps) {
                if (step.mulligan) {
                  appendMessage('', 'Mulligan: ' + step.guidance, 'announcement', false);
                }
              }

              markMulligansResolved();

              const selfMulliganned = steps.some(s => s.player === 'self' && s.mulligan);
              const oppMulliganned = steps.some(s => s.player === 'opp' && s.mulligan);

              // Execute self mulligan
              if (selfMulliganned) {
                appendMessage('', 'Shuffling hand into deck and drawing 7…', 'announcement', false);
                shuffleAndDraw('self', 'self', 7, null, true);
              }

              // In 1P, also execute opponent mulligan locally
              if (!systemState.isTwoPlayer && oppMulliganned) {
                appendMessage('', 'Opponent shuffles hand into deck and draws 7…', 'announcement', false);
                shuffleAndDraw('opp', 'opp', 7, null, true);
              }
              // In 2P, the opponent's client handles their own mulligan independently.

              // Bonus draws (1 per mulligan)
              if (selfMulliganned) {
                // Opponent draws 1 bonus card
                if (systemState.isTwoPlayer && rulesSocket) {
                  rulesSocket.emit('rulesEvent', { type: 'mulliganBonus' });
                } else {
                  appendMessage('', 'Opponent draws a bonus card.', 'announcement', false);
                  draw('opp', 'opp', 1, true);
                }
              }

              if (oppMulliganned && !systemState.isTwoPlayer) {
                // 1P: self draws bonus (opponent mulliganned)
                appendMessage('', 'You draw a bonus card (opponent mulliganed).', 'announcement', false);
                draw('self', 'self', 1, true);
              }
              // 2P: bonus arrives via the opponent's mulliganBonus event (hookMultiplayerSync)
            } catch (e) {
              console.error('Mulligan execution error:', e);
            }
          }, 2500);
          updateTurnBanner();
    };
    
    // Fires once both players have pressed Set Up and their opening hands/
    // prizes have been dealt (see the 'both-players-ready' event dispatched
    // by ready.js). Decides turn order via a coin flip and kicks off the
    // actual game/turn state.
    const handleSetupClick = () => {
      if (!rulesState.enabled) return;
      if (systemState.isReplay) return;
      if (coinFlipPending) return; // a flip already in flight will start the game
      if (rulesState.phase !== 'setup') return; // already started (e.g. auto-start)
      if (coinCallPending) return; // the heads/tails call picker is already open
    
      // If the opponent's client already resolved (and broadcast) the coin
      // flip, mirror their result instead of flipping again — avoids the
      // two sides disagreeing on who goes first.
      if (syncedTurnOrder) {
        const firstPlayer = syncedTurnOrder;
        syncedTurnOrder = null;
        beginSetupWithTurnOrder(firstPlayer);
        return;
      }
    
      const beginFlip = (call, caller = 'self') => {
        const session = rulesSessionGeneration;
        coinFlipPending = true;
        runTurnOrderCoinFlip({ call, caller })
          .then(({ turnPlayer }) => {
            if (flipSuperseded) return; // authoritative remote flip took over
            if (session !== rulesSessionGeneration) return;
            beginSetupWithTurnOrder(turnPlayer);
          })
          .finally(() => {
            coinFlipPending = false;
          });
      };
    
      // Opponent called the coin first (they clicked Set Up before us) —
      // do NOT flip our own coin: the caller's flip is the single
      // authoritative one and arrives via the turnOrderCoinFlip event,
      // whose handler mirrors it and auto-starts the game on our side.
      // (Flipping locally here was the desync bug: each side rolled its
      // own random result and both saw themselves as the coin owner.)
      if (coinCallChoice) {
        coinCallChoice = null;
        appendMessage('', "Waiting for opponent's coin flip…", 'announcement', false);
        return;
      }

      // Multiplayer: one randomly designated caller picks heads/tails; the
      // other waits for the broadcast flip. Both clients derive the same
      // caller from the pair of socket ids + session so only one side opens
      // the picker.
      if (systemState.isTwoPlayer && rulesSocket) {
        if (!systemState.opponentSocketId) {
          rulesSocket.emit('rulesEvent', {
            type: 'peerSocketId',
            data: { socketId: rulesSocket.id },
          });
          return;
        }
        const designatedCaller = resolveTurnOrderCaller({
          roomId: systemState.roomId,
          socketId: rulesSocket.id,
          opponentSocketId: systemState.opponentSocketId,
          sessionKey: String(rulesSessionGeneration),
          isMultiplayer: true,
        });
        if (designatedCaller === null) return;
        if (designatedCaller !== 'self') {
          appendMessage('', 'Waiting for opponent to call the coin…', 'announcement', false);
          return;
        }
      }
    
      // "Call the coin": this player (the caller) picks heads or tails;
      // the flip then decides turn order from that call.
      coinCallPending = true;
      openCoinCallPicker({
        onCall: (call) => {
          coinCallPending = false;
          if (systemState.isTwoPlayer && rulesSocket) {
            rulesSocket.emit('rulesEvent', {
              type: 'turnOrderCoinCall',
              data: { caller: 'self', call },
            });
          }
          beginFlip(call);
        },
      });
    };
    
    // ── turn-order coin flip: automatic at match start ───────────────────
    // Randomly picks one player's selected coin (falling back to a random
    // coin from the catalog if neither player has picked one), plays the
    // existing 3D coin-toss animation full-screen, and uses the result to
    // decide who goes first. Broadcasts the outcome to the opponent in
    // multiplayer so both sides see the same flip and agree on turn order.
    const runTurnOrderCoinFlip = ({ call, caller = 'self' } = {}) => {
      return new Promise((resolve) => {
        const coinOwner = Math.random() < 0.5 ? 'self' : 'opp';
        const coin = getSelectedCoin(coinOwner) || pickRandomCoin();
        // "Call the coin": the caller (the player who clicked Set Up) picked
        // a face via the call picker. Fall back to random if none supplied.
        const chosenCall = call || (Math.random() < 0.5 ? 'heads' : 'tails');
        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        // Caller goes first iff the coin lands on the face they called.
        const turnPlayer = decideTurnOrder({ caller, call: chosenCall, result });
    
        playTurnOrderCoinAnimation({ coin, result, coinOwner, turnPlayer, isRemote: false });
    
        if (systemState.isTwoPlayer && rulesSocket) {
          rulesSocket.emit('rulesEvent', {
            type: 'turnOrderCoinFlip',
            data: { coinOwner, coinId: coin?.id || null, caller, call: chosenCall, result, turnPlayer },
          });
        }
    
        setTimeout(() => resolve({ turnPlayer, coin, result, coinOwner, caller, call: chosenCall }), 2700);
      });
    };
    
    // 2-button "call the coin" picker: the caller picks heads or tails
    // before the turn-order flip. Caller goes first if the coin lands on
    // the face they called. Mirrors the #rulesChoicePicker overlay styling.
    const openCoinCallPicker = ({ onCall }) => {
      document.getElementById('rulesCoinCallOverlay')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'rulesCoinCallOverlay';
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:2400;display:flex;align-items:center;justify-content:center;background:rgba(8,10,14,.72);';
      const box = document.createElement('div');
      box.style.cssText =
        'background:#1b1f27;border:1px solid #3a4150;border-radius:12px;padding:24px 28px;text-align:center;color:#e8ecf4;min-width:280px;';
      box.innerHTML = `
        <div style="font-size:16px;font-weight:600;margin-bottom:6px;">\u{1FA99} Call the coin</div>
        <div style="font-size:13px;color:#9aa3b2;margin-bottom:16px;">Pick a face \u2014 if the coin lands on it, you go first.</div>
        <div style="display:flex;gap:12px;justify-content:center;">
          <button type="button" data-coin-call="heads" style="flex:1;padding:10px 18px;border-radius:8px;border:1px solid #4a5568;background:#2a3040;color:#e8ecf4;font-size:14px;font-weight:600;cursor:pointer;">Heads</button>
          <button type="button" data-coin-call="tails" style="flex:1;padding:10px 18px;border-radius:8px;border:1px solid #4a5568;background:#2a3040;color:#e8ecf4;font-size:14px;font-weight:600;cursor:pointer;">Tails</button>
        </div>`;
      overlay.appendChild(box);
      box.querySelectorAll('button[data-coin-call]').forEach((btn) => {
        btn.addEventListener('click', () => {
          overlay.remove();
          onCall(btn.dataset.coinCall);
        });
      });
      overlay.addEventListener('click', (e) => {
        if (e.target !== overlay) return; // click outside does not pick a face
      });
      document.body.appendChild(overlay);
    };
    
    // Flip the chosen coin on the battle mat (beside Active), not full-screen.
    const playTurnOrderCoinAnimation = ({ coin, result, coinOwner, turnPlayer, isRemote }) => {
      const ownerLabel = coinOwner === 'self' ? 'Your' : "Opponent's";
      const winnerLabel = turnPlayer === 'self' ? 'You go' : 'Opponent goes';

      flipMatCoin({ target: coinOwner, result, coin });

      setTimeout(() => {
        if (!isRemote) {
          appendMessage(
            '',
            `🪙 ${ownerLabel} coin flip: ${result} — ${winnerLabel.toLowerCase()} first!`,
            'announcement',
            false
          );
        }
      }, 1500);
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
      // The deck cover (click to open) and the deck zone's own click/context
      // handlers both show deck contents. Gate both — the cover is the real
      // entry point (opens the face-up card list), so without gating it too
      // a player could always peek their deck regardless of the rule below.
      document.addEventListener('click', (event) => {
        if (!rulesState.enabled) return;
        const target = event.target.closest?.('[id="deck"], [id="deckCover"]');
        if (!target) return;
        if (deckAccess.open) return; // a card effect unlocked it
        const owner = target.id === 'deckCover' ? (target.user || 'self') : rulesState.turnPlayer;
        const check = canPerformAction({ user: owner, action: 'viewDeck' });
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
              const energyCard = { name: card.name, type: card.type, subtypes: card.subtypes, effect: card.effect, text: card.text };
              const applied = applyEnergyEffect(energyCard);
              if (applied.message) {
                appendMessage('', applied.message.replace(/^⚡ /, ''), 'announcement', false);
              } else {
                const family = classifyEnergyEffect(energyCard);
                if (family && family !== 'basic' && family !== 'unknown') {
                  appendMessage('', describeEnergyEffect(energyCard), 'announcement', false);
                }
              }
            }
          }
        } catch {}
      }, 1200);

      document.addEventListener('rules-energy-attached', async (event) => {
        if (!rulesState.enabled) return;
        const { user, energy, pokemon, fromZone } = event.detail || {};
        if (!energy || !pokemon) return;
        try {
          await ensureCardData(energy);
          await ensureCardData(pokemon);
          const def = parseTypedSpecialEnergy(energy);
          if (!def) return;

          const desc = describeTypedSpecialEnergy(energy) || describeEnergyEffect(energy);
          appendMessage('', `⚡ ${desc}`, 'announcement', false);

          if (
            def.recoverStatusOnAttach &&
            pokemonMatchesEnergyType(pokemon, def.requiredPokemonType)
          ) {
            const key = pokemon.image?.dataset?.cardId || pokemon.name;
            clearStatuses(user, key);
            appendMessage(
              '',
              `  💧 ${pokemon.name}: recovered from all Special Conditions.`,
              'announcement',
              false,
            );
          }

          const search = getTelepathicOnAttachSearch(energy);
          if (
            fromZone === 'hand' &&
            search &&
            pokemonMatchesEnergyType(pokemon, def.requiredPokemonType)
          ) {
            openDeckSearchWindow(`${energy.name} — search your deck`);
            const deck = getZone(user, 'deck');
            const matches = [];
            for (const c of deck.array) {
              await ensureCardData(c);
              if (matchesBasicPokemonType(c, def.requiredPokemonType)) {
                matches.push(c);
              }
            }
            const pool = matches.length > 0 ? matches : deck.array;
            if (pool.length === 0) {
              appendMessage('', '  no cards left in deck', 'announcement', false);
              return;
            }
            openChoicePicker({
              title: `${energy.name} — choose up to ${search.count} Basic ${def.requiredPokemonType} Pokémon for your Bench`,
              candidates: pool,
              zoneFrom: 'deck',
              destination: 'bench',
              multiSelect: true,
              requiredCount: Math.min(search.count, pool.length),
              onConfirm: (selected) => {
                import('../../actions/move-card-bundle/move-card-bundle.js').then(({ moveCardBundle }) => {
                  for (const s of selected) {
                    const idx = getZone(user, 'deck').array.indexOf(s);
                    if (idx >= 0) {
                      moveCardBundle(user, user, 'deck', 'bench', idx, false, 'move');
                    }
                  }
                  appendMessage(
                    '',
                    `  ${selected.map((s) => s.name).join(', ')} → Bench`,
                    'announcement',
                    false,
                  );
                  shuffleZone(user, user, 'deck');
                });
              },
              onCancel: () => {
                appendMessage('', '  search canceled — shuffle your deck', 'announcement', false);
                shuffleZone(user, user, 'deck');
              },
            });
          }
        } catch {
          /* card data may not be ready */
        }
      });
    };
    
    // ── turn automation: auto-draw, KO watch ────────────────────────────
    // TCG Live draws automatically at turn start. We hook the turn flow via
    // the chatbox watcher (the sim announces turns) and drive the
    // deck/hand zones directly.
    const turnAutomation = () => {
      let lastProcessedTurn = -1;
    
      const drawCard = (player) => {
        try {
          const deck = getZone(player, 'deck');
          const hand = getZone(player, 'hand');
          if (deck.getCount() > 0) {
            // moveCardBundle(user, initiator, fromZone, toZone, index, targetIndex, action)
            import('../../actions/move-card-bundle/move-card-bundle.js').then(({ moveCardBundle }) => {
              moveCardBundle(player, player, 'deck', 'hand', 0, false, 'move');
            });
            return true;
          }
          return false;
        } catch {
          return false;
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
      }, 1500);
    };
    
    // continuous KO detection: watch all in-play Pokémon for damage >= HP
    const koWatcher = () => {
      // per-turn ability flags now live in rulesState.flags[player].abilitiesUsed
      // and are cleared by resetTurnFlags() each turn — no DOM-flag reset here.
      window.setInterval(async () => {
        if (!rulesState.enabled || rulesState.phase === 'ended') return;
    
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
                const effHp = effectiveHp(card.hp, player);
                if (effHp > 0 && damage >= effHp) {
                  card.__rulesKODetected = true;
                  const who = player === 'self' ? 'Your' : "Opponent's";
                  appendMessage('', `💀 ${who} ${card.name || 'Pokémon'} has ${damage}/${effHp} damage — KO! Move it to discard${zoneId === 'active' ? ' and promote a new Active' : ''}.`, 'announcement', false);
    
                  playAttackFeedback(true);
    
                  // Auto-discard the KO'd Pokémon — but ONLY on the side that
                  // actually owns this zone. This loop runs on BOTH clients,
                  // watching BOTH 'self' and 'opp' (their mirrored view of
                  // the other player's board), purely for local detection —
                  // it isn't authoritative for a zone it doesn't own.
                  // Calling the raw moveCard() primitive here for 'opp' too
                  // (as this used to) mutated each client's local copy of
                  // the other player's zone WITHOUT ever broadcasting the
                  // change — the two clients' boards, discard piles, and
                  // battle logs would silently drift apart over the game.
                  // Only the owning client (player === 'self' from its own
                  // perspective) performs the move, and it does so through
                  // moveCardBundle — the same synced wrapper used by manual
                  // drag/discard — so the peer receives and replays the
                  // identical action instead of guessing at it locally.
                  if (player === 'self') {
                    import('../../actions/move-card-bundle/move-card-bundle.js').then(({ moveCardBundle }) => {
                      try {
                        const idx = zone.array.indexOf(card);
                        if (idx >= 0) {
                          moveCardBundle('self', 'self', zoneId, 'discard', idx, false, 'move');
                          appendMessage('', "auto: KO'd Pokémon moved to discard", 'announcement', false);
                        }
                      } catch {}
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
    const openChoicePicker = ({ title, candidates, zoneFrom, destination, user = 'self', pickOnly = false, multiSelect = false, requiredCount = 1, minCount, maxCount, upTo = false, onPick, onConfirm, onCancel }) => {
      // remove any existing picker
      document.getElementById('rulesChoicePicker')?.remove();

      const maxSel = maxCount ?? requiredCount;
      const minSel = minCount ?? (upTo ? 0 : requiredCount);
      const cappedMax = Math.min(maxSel, candidates.length);
      
      if (multiSelect && !upTo && minSel > candidates.length) {
        appendMessage('', `  not enough cards to select ${requiredCount} — play it manually`, 'announcement', false);
        return;
      }
    
      const overlay = document.createElement('div');
      overlay.id = 'rulesChoicePicker';
      overlay.innerHTML = `
        <div class="choice-picker-card">
          <div class="choice-picker-title"></div>
          <div class="choice-picker-grid"></div>
          ${multiSelect ? '<button class="choice-picker-confirm" disabled>Confirm</button>' : ''}
          <button class="choice-picker-cancel">Cancel</button>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('.choice-picker-title').textContent = title;
    
      const selected = new Set();
      const grid = overlay.querySelector('.choice-picker-grid');
      const confirmBtn = overlay.querySelector('.choice-picker-confirm');
      if (confirmBtn && upTo && minSel === 0) {
        confirmBtn.disabled = false;
      }
      import('../../actions/move-card-bundle/move-card-bundle.js').then(({ moveCardBundle }) => {
        for (const cand of candidates) {
          const btn = document.createElement('button');
          btn.className = 'choice-picker-item';
          // zone cards carry a DOM <img> in `image`, not a URL string
          const thumb = cand.images?.small || (typeof cand.image === 'string' ? cand.image : cand.image?.src) || '';
          btn.innerHTML = thumb
            ? `<img src="${thumb}" alt="" loading="lazy" /><span>${cand.name || 'Card'}</span>`
            : `<span>${cand.name || 'Card'}</span>`;
          btn.addEventListener('click', () => {
            if (multiSelect) {
              // toggle selection; the cards only move when Confirm is clicked
              if (selected.has(cand)) {
                selected.delete(cand);
                btn.classList.remove('selected');
              } else if (selected.size < cappedMax) {
                selected.add(cand);
                btn.classList.add('selected');
              }
              if (confirmBtn) {
                confirmBtn.disabled = selected.size < minSel || selected.size > cappedMax;
              }
              return;
            }
            try {
              if (!pickOnly && zoneFrom && destination) {
                const z = getZone(user, zoneFrom);
                const idx = z.array.indexOf(cand);
                if (idx >= 0) {
                  moveCardBundle(user, user, zoneFrom, destination, idx, false, 'move');
                  appendMessage('', `auto: ${cand.name} → ${destination === 'bench' ? 'Bench' : destination}`, 'announcement', false);
                }
              }
            } catch {}
            onPick?.(cand);
            overlay.remove();
          });
          grid.appendChild(btn);
        }
      });
      
      if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
          onConfirm?.(Array.from(selected));
          overlay.remove();
        });
      }
      overlay.querySelector('.choice-picker-cancel').addEventListener('click', () => {
        onCancel?.();
        overlay.remove();
      });
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          onCancel?.();
          overlay.remove();
        }
      });
    };
    
    // ── heal a specific card (shared by the direct heal + the heal picker) ─
    // Finds the card's zone/index, removes up to `amount` damage counters,
    // optionally cures its Special Condition, and announces the result.
    const applyHealToCard = (cand, amount, cure) => {
      import('../../actions/counters/damage-counter.js').then(({ updateDamageCounter, removeDamageCounter }) => {
        let zoneId = null, idx = -1;
        for (const z of ['active', 'bench']) {
          const zone = getZone('self', z);
          const i = zone.array.indexOf(cand);
          if (i >= 0) { zoneId = z; idx = i; break; }
        }
        const current = parseInt(cand.image?.damageCounter?.textContent || '0', 10) || 0;
        if (!zoneId || current === 0) {
          appendMessage('', `  ${cand.name} has no damage to heal`, 'announcement', false);
          return;
        }
        const healed = Math.min(amount, current);
        if (current - amount <= 0) removeDamageCounter('self', zoneId, idx);
        else updateDamageCounter('self', zoneId, idx, current - amount);
        if (cure) {
          const key = cand.image?.dataset?.cardId || cand.name;
          clearStatuses('self', key);
        }
        appendMessage('', `  healed ${healed} damage counter${healed === 1 ? '' : 's'}${cure ? ' + cured Special Condition' : ''} from ${cand.name}`, 'announcement', false);
      });
    };

    // ── guided heal picker: choose which of your Pokémon to heal ──────────
    const openHealPicker = ({ title, candidates, amount, cure }) => {
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
      for (const cand of candidates) {
        const btn = document.createElement('button');
        btn.className = 'choice-picker-item';
        const thumb = cand.images?.small || (typeof cand.image === 'string' ? cand.image : cand.image?.src) || '';
        btn.innerHTML = thumb
          ? `<img src="${thumb}" alt="" loading="lazy" /><span>${cand.name || 'Card'}</span>`
          : `<span>${cand.name || 'Card'}</span>`;
        btn.addEventListener('click', () => {
          applyHealToCard(cand, amount, cure);
          overlay.remove();
        });
        grid.appendChild(btn);
      }
      overlay.querySelector('.choice-picker-cancel').addEventListener('click', () => {
        appendMessage('', '  heal canceled', 'announcement', false);
        overlay.remove();
      });
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
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
              // the attacking client already advanced its own rulesState;
              // mirror the advance here. The turnPlayer guard prevents a
              // double-advance if the event arrives more than once.
              if (rulesState.enabled && rulesState.turnPlayer === 'opp') {
                const next = endTurn('opp');
                appendMessage('', `Turn passes to ${next === 'self' ? 'you' : 'opponent'}`, 'announcement', false);
                updateTurnBanner();
              }
            } else if (type === 'attacked') {
              appendMessage('', `Opponent used ${data.attackName} — ${data.damage} damage`, 'announcement', false);
              if (data.status) appendMessage('', `Your Pokémon is now ${data.status}!`, 'announcement', false);
            } else if (type === 'turnOrderCoinFlip') {
              // sender's data is from their own self/opp perspective — invert
              // caller + coinOwner so it's correct from ours, then recompute
              // turn order deterministically from the caller's call + result.
              const localCoinOwner = data.coinOwner === 'self' ? 'opp' : 'self';
              const localCaller = data.caller === 'self' ? 'opp' : 'self';
              const localTurnPlayer = decideTurnOrder({
                caller: localCaller,
                call: data.call,
                result: data.result,
              });
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

              // Auto-start: the caller already resolved and broadcast the
              // flip — if we're still in setup, the authoritative result
              // ALWAYS wins (even over a stale local flip in flight, which
              // flipSuperseded cancels). startGame flips phase to 'draw',
              // which guards against a double-start via our own Set Up
              // click or a duplicate event.
              if (rulesState.enabled && rulesState.phase === 'setup') {
                flipSuperseded = true;
                syncedTurnOrder = null;
                beginSetupWithTurnOrder(localTurnPlayer);
              }
            } else if (type === 'turnOrderCoinCall') {
              // Opponent clicked Set Up first and broadcast their heads/tails
              // call — remember it so a late Set Up click on our side mirrors
              // their call instead of picking its own.
              coinCallChoice =
                data.call === 'heads' || data.call === 'tails' ? data.call : null;
              // sender's 'self' means THEY are the caller → 'opp' from ours
              coinCallCaller = data.caller === 'self' ? 'opp' : 'self';
              // If our call picker happens to be open (both clicked at once),
              // close it — the caller's call is authoritative.
              if (coinCallPending) {
                coinCallPending = false;
                document.getElementById('rulesCoinCallOverlay')?.remove();
              }
            } else if (type === 'peerSocketId') {
              const peerId = data?.socketId;
              if (peerId && peerId !== rulesSocket?.id) {
                const alreadyKnown = systemState.opponentSocketId === peerId;
                systemState.opponentSocketId = peerId;
                if (
                  !alreadyKnown &&
                  rulesState.enabled &&
                  rulesState.phase === 'setup' &&
                  !coinFlipPending &&
                  !coinCallPending &&
                  !syncedTurnOrder
                ) {
                  handleSetupClick();
                }
                if (!alreadyKnown) {
                  rulesSocket.emit('rulesEvent', {
                    type: 'peerSocketId',
                    data: { socketId: rulesSocket.id },
                  });
                }
              }
            } else if (type === 'coinChosen') {
              // Opponent chose/changed their coin — show it on our mat
              setSelectedCoin('opp', data?.coin || null);
            } else if (type === 'mulliganBonus') {
              // Opponent mulliganed — we draw 1 bonus card for ourselves
              if (rulesState.enabled) {
                draw('self', 'self', 1, true);
                appendMessage('', 'Bonus draw: you drew 1 card (opponent mulliganed).', 'announcement', false);
              }
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
    
    // Is this a Pokémon card? Prefer locally-known type/supertype over async hp.
    // Search matching lives in search-match.mjs (matchesSearch).

    const executeAbilityDraw = async (user, step) => {
      const { moveCardBundle } = await import('../../actions/move-card-bundle/move-card-bundle.js');
      let drew = 0;
      if (step.until) {
        const target = Number(step.count);
        while (Number.isFinite(target) && getZone(user, 'hand').getCount() < target && getZone(user, 'deck').getCount() > 0) {
          moveCardBundle(user, user, 'deck', 'hand', 0, false, 'move');
          drew++;
        }
        appendMessage('', `  auto: drew ${drew} card${drew === 1 ? '' : 's'} until you had ${target} in hand`, 'announcement', false);
      } else if (step.eachPlayer) {
        for (const who of ['self', 'opp']) {
          for (let i = 0; i < step.count; i++) {
            if (getZone(who, 'deck').getCount() > 0) {
              moveCardBundle(who, who, 'deck', 'hand', 0, false, 'move');
              drew++;
            }
          }
        }
        appendMessage('', `  auto: each player drew ${step.count} card${step.count === 1 ? '' : 's'}`, 'announcement', false);
      } else {
        for (let i = 0; i < step.count; i++) {
          if (getZone(user, 'deck').getCount() > 0) {
            moveCardBundle(user, user, 'deck', 'hand', 0, false, 'move');
            drew++;
          }
        }
        appendMessage('', `  auto: drew ${drew} card${drew === 1 ? '' : 's'}`, 'announcement', false);
      }
      return drew > 0 || step.eachPlayer;
    };

    const awaitChoicePicker = (opts) =>
      new Promise((resolve) => {
        openChoicePicker({
          ...opts,
          onPick: (cand) => {
            opts.onPick?.(cand);
            resolve({ ok: true, picks: [cand] });
          },
          onConfirm: (selected) => {
            opts.onConfirm?.(selected);
            resolve({ ok: true, picks: selected });
          },
          onCancel: () => {
            opts.onCancel?.();
            resolve({ ok: false, picks: [] });
          },
        });
      });

    const runAbilitySearchPicker = async (user, card, step) => {
      openDeckSearchWindow(`${card.name} ability — search your deck`);
      appendMessage('', `  ${card.name} — opening card select…`, 'announcement', false);
      const deck = getZone(user, 'deck');
      const pool = filterSearchMatches(deck.array, step.what, {
        onNoMatches: (what) =>
          appendMessage('', `  no cards in deck match "${what}"`, 'announcement', false),
      });
      if (pool.length === 0) {
        appendMessage('', '  no cards left in deck', 'announcement', false);
        return false;
      }
      const dest = step.destination === 'Bench' ? 'bench' : 'hand';
      const toBench = dest === 'bench';
      const shuffleAfter = () => shuffleZone(user, user, 'deck');
      const count = step.count || 1;
      const upTo = step.upTo === true;
      const abilityText = card.ability?.text ?? card.abilityText ?? card.text ?? '';
      const revealPicked = (picked) =>
        maybeAnnounceSearchReveal(user, card.name, picked, appendMessage, {
          step,
          sourceText: abilityText,
        });

      if (count > 1 || upTo) {
        const result = await awaitChoicePicker({
          title: upTo
            ? `${card.name} — choose up to ${count} cards to ${toBench ? 'Bench' : 'your hand'}`
            : `${card.name} — choose ${count} cards to ${toBench ? 'Bench' : 'your hand'}`,
          candidates: pool,
          zoneFrom: 'deck',
          destination: dest,
          multiSelect: true,
          requiredCount: Math.min(count, pool.length),
          minCount: upTo ? 0 : count,
          maxCount: count,
          upTo,
          onConfirm: (selected) => {
            revealPicked(selected);
            import('../../actions/move-card-bundle/move-card-bundle.js').then(({ moveCardBundle }) => {
              for (const s of selected) {
                const idx = getZone(user, 'deck').array.indexOf(s);
                if (idx >= 0) moveCardBundle(user, user, 'deck', dest, idx, false, 'move');
              }
              appendMessage('', `  ${selected.map((s) => s.name).join(', ')} → ${toBench ? 'Bench' : 'hand'}`, 'announcement', false);
              shuffleAfter();
            });
          },
          onCancel: () => {
            appendMessage('', '  search canceled — ability not used (you may decline).', 'announcement', false);
          },
        });
        return result.ok;
      }

      const result = await awaitChoicePicker({
        title: `${card.name} — ${toBench ? 'put a card on Bench' : 'take a card to hand'}`,
        candidates: pool,
        zoneFrom: 'deck',
        destination: dest,
        onPick: (picked) => {
          revealPicked(picked);
          shuffleAfter();
        },
        onCancel: () => {
          appendMessage('', '  search canceled — ability not used (you may decline).', 'announcement', false);
        },
      });
      return result.ok;
    };

    const runWhenPlayedStep = async (user, card, steps, stepIndex) => {
      const img = card.image;
      if (img?.__rulesWhenPlayedFired) return false;
      img.__rulesWhenPlayedFired = true;

      const effect = parseWhenPlayedEffect(card);
      let ran = false;
      if (effect?.kind === 'draw') {
        await executeAbilityDraw(user, { count: effect.n, until: false, eachPlayer: false });
        ran = true;
      } else if (effect?.kind === 'damage') {
        const oppActive = getZone('opp', 'active').array[0];
        const existing = parseInt(oppActive?.image?.damageCounter?.textContent || '0', 10) || 0;
        if (oppActive?.image) {
          if (existing) {
            const { updateDamageCounter } = await import('../../actions/counters/damage-counter.js');
            updateDamageCounter('opp', 'active', 0, existing + effect.n);
          } else {
            const { addDamageCounter } = await import('../../actions/counters/damage-counter.js');
            addDamageCounter('opp', 'active', 0, effect.n);
          }
        }
        appendMessage('', `  auto: when played — placed ${effect.n} damage counter(s) on opponent's Active`, 'announcement', false);
        ran = true;
      }

      const searchStep = steps.slice(stepIndex + 1).find((s) => s.type === 'searchAbility');
      if (searchStep || effect?.kind === 'search') {
        const step = searchStep || { what: 'a card', count: effect?.n || 1, destination: 'hand' };
        await runAbilitySearchPicker(user, card, step);
        ran = true;
      }
      return ran;
    };

    const ABILITY_EXECUTOR_FNS = {
      heal: healAbility,
      switch: switchAbility,
      attach: attachAbility,
      'energy-redirect': energyRedirectAbility,
    };

    const autoExecuteAbilitySteps = (user, card, steps) => {
      const plan = planAbilitySteps(steps, { mode: 'auto' });
      for (const item of plan) {
        try {
          if (item.action === 'draw' && !abilityUsed(user, card)) {
            executeAbilityDraw(user, item.step).then((ran) => {
              if (ran) {
                markAbilityUsed(user, card);
                appendMessage('', '  auto: ability used this turn (draw)', 'announcement', false);
              }
            });
          } else if (item.action === 'when-played') {
            runWhenPlayedStep(user, card, steps, item.stepIndex);
          } else if (item.action === 'announce' && item.step.type === 'opponentDraw') {
            appendMessage(
              '',
              `  ${item.step.guidance} (announce-only — opponent must consent to draw)`,
              'announcement',
              false
            );
          }
        } catch {}
      }
    };

    export async function runAbilitySteps(user, card) {
      if (rulesState.enabled && rulesState.turnPlayer !== user) {
        appendMessage(user, `⛔ It's not your turn.`, 'announcement', false);
        return;
      }
      if (rulesState.enabled && abilityUsed(user, card)) {
        appendMessage(user, `⛔ ${card.name}'s ability was already used this turn.`, 'announcement', false);
        return;
      }

      await ensureCardData(card);
      const abilityText = card.ability?.text || card.abilityText || '';
      const steps = parseAbility(abilityText);
      const plan = planAbilitySteps(steps, { mode: 'interactive' });
      const actionable = actionableAbilityPlan(plan, { mode: 'interactive' });
      if (actionable.length === 0) {
        appendMessage(user, `⛔ No actionable steps for ${card.name}'s ability.`, 'announcement', false);
        return;
      }

      const name = card.ability?.name || 'Ability';
      appendMessage('', `✦ ${card.name} — ${name}:`, 'announcement', false);

      let executed = false;
      const orchestrated = { orchestrated: true };

      for (const item of plan) {
        if (item.action === 'skip') continue;

        if (item.action === 'draw') {
          await executeAbilityDraw(user, item.step);
          executed = true;
        } else if (item.action === 'search') {
          const completed = await runAbilitySearchPicker(user, card, item.step);
          if (markAbilityUseAfterSearchStep(completed)) {
            executed = true;
          }
        } else if (item.action === 'when-played') {
          if (await runWhenPlayedStep(user, card, steps, item.stepIndex)) executed = true;
        } else if (item.action === 'executor' && item.executor) {
          const fn = ABILITY_EXECUTOR_FNS[item.executor];
          if (fn) {
            await fn(user, true, card, orchestrated);
            executed = true;
          }
        } else if (item.action === 'discard-cost') {
          const hand = getZone(user, 'hand');
          const whatFilter = energySearchWhat({
            basic: item.step.basic,
            energyType: item.step.energyType,
          });
          const candidates = hand.array.filter((c) => matchesSearch(c, whatFilter));
          if (!candidates.length) {
            appendMessage('', '  no matching Energy in hand to pay the cost', 'announcement', false);
          } else {
            const result = await awaitChoicePicker({
              title: `${card.name} — discard ${item.step.count} Energy (cost)`,
              candidates,
              zoneFrom: 'hand',
              destination: 'discard',
              multiSelect: item.step.count > 1,
              requiredCount: Math.min(item.step.count, candidates.length),
              onConfirm: (selected) => {
                import('../../actions/move-card-bundle/move-card-bundle.js').then(({ moveCardBundle }) => {
                  for (const s of selected) {
                    const idx = getZone(user, 'hand').array.indexOf(s);
                    if (idx >= 0) moveCardBundle(user, user, 'hand', 'discard', idx, false, 'move');
                  }
                });
              },
            });
            if (result.ok) executed = true;
          }
        } else if (item.action === 'recursion-discard') {
          const discard = getZone(user, 'discard');
          const what = item.step.what || 'card';
          const searchWhat = what === 'card' ? 'a card' : what === 'Pokémon' ? 'a Pokémon' : what;
          const matches = [];
          for (const c of discard.array) {
            await ensureCardData(c);
            if (matchesSearch(c, searchWhat)) matches.push(c);
          }
          if (matches.length === 0 && discard.array.length > 0) {
            appendMessage('', `  no cards in discard match "${searchWhat}"`, 'announcement', false);
          }
          if (matches.length > 0) {
            const upTo = item.step.upTo || 1;
            if (upTo > 1) {
              const result = await awaitChoicePicker({
                title: `${card.name} — choose up to ${upTo} cards from discard`,
                candidates: matches,
                zoneFrom: 'discard',
                destination: 'hand',
                multiSelect: true,
                requiredCount: Math.min(upTo, matches.length),
                onConfirm: (selected) => {
                  announceDiscardPick(user, card.name, selected, appendMessage);
                  import('../../actions/move-card-bundle/move-card-bundle.js').then(({ moveCardBundle }) => {
                    for (const s of selected) {
                      const idx = getZone(user, 'discard').array.indexOf(s);
                      if (idx >= 0) moveCardBundle(user, user, 'discard', 'hand', idx, false, 'move');
                    }
                  });
                },
              });
              if (result.ok) executed = true;
            } else {
              const result = await awaitChoicePicker({
                title: `${card.name} — take a card from discard`,
                candidates: matches,
                zoneFrom: 'discard',
                destination: 'hand',
                onPick: (picked) => {
                  announceDiscardPick(user, card.name, picked, appendMessage);
                },
              });
              if (result.ok) executed = true;
            }
          }
        } else if (item.action === 'look-at-top') {
          openDeckSearchWindow(`${card.name} — look at the top of your deck`);
          appendMessage('', `  ${item.step.guidance}`, 'announcement', false);
          executed = true;
        } else if (item.action === 'opponent-draw') {
          appendMessage('', `  ${item.step.guidance} (opponent must consent)`, 'announcement', false);
        } else if (item.action === 'announce') {
          appendMessage('', `  ${item.step.guidance}`, 'announcement', false);
        }
      }

      if (executed && rulesState.enabled) {
        markAbilityUsed(user, card);
      }
    }
    

    initTrainerExecution({
      getZone,
      appendMessage,
      openChoicePicker,
      openHealPicker,
      applyHealToCard,
      openDeckSearchWindow,
      shuffleZone,
      matchesSearch,
      isPokemonCard,
      prizeState,
    });
    
    // ── trainer play guidance ────────────────────────────────────────────
    // Watching the hand → play zones for Trainer-class cards. When one lands
    // in play, announce its effect steps; searchDeck/lookAtTop effects open
    // the private deck window so the player can legally look.
    //
    // Primary trigger: the 'rules-card-on-board' event, dispatched by
    // move-card.js the instant a card lands on 'board' — this is what makes
    // the picker open immediately instead of on the next poll tick. The
    // window.setInterval below stays only as a slow backstop (in case some
    // future code path pushes into the board zone array without going
    // through moveCard) and no longer determines how fast the popup opens.
    const processBoardCard = (card) => {
      try {
            const img = card.image;
            if (!img || img.__rulesTrainerAnnounced) return;
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
                        // family-level guidance (announce-only; skip draw — handled below, and unknown)
                        if (classifyAbility(card) !== 'draw' && classifyAbility(card) !== 'unknown') {
                          appendMessage('', describeAbilityFamily(card), 'announcement', false);
                        }
    
                        // compound ability orchestration (auto: draw + when-played chains)
                        autoExecuteAbilitySteps('self', card, steps);

                        if (parseSetupFaceDown(card) && !img.__rulesSetupFaceDown) {
                          img.__rulesSetupFaceDown = true;
                          hideCard('self', card);
                          appendMessage(
                            '',
                            `🎭 ${card.name}: placed face-down (setup ability).`,
                            'announcement',
                            false
                          );
                        }

                        // opponent-disrupt: "Discard N cards from your opponent's
                        // hand" — one-shot (per-card DOM flag), blocked when any
                        // opponent Pokémon protects its hand (isHandProtected).
                        const oppDiscardN = parseOpponentDiscard(card);
                        if (oppDiscardN > 0 && !img.__rulesOppDiscardFired) {
                          img.__rulesOppDiscardFired = true;
                          const oppPokemons = [
                            ...getZone('opp', 'active').array,
                            ...getZone('opp', 'bench').array,
                          ];
                          const blockTools = stadiumBlocksToolEffects();
                          const protector = oppPokemons.find((c) => {
                            if (!c.image) return false;
                            const zoneId = getZone('opp', 'active').array.includes(c) ? 'active' : 'bench';
                            return combinedHandProtected(c, getZone('opp', zoneId).array, { blockTools });
                          });
                          // Stadium hand protection: a Stadium owned by the
                          // discarding target can shield their hand as well
                          // (e.g. "Cards in your hand can't be discarded").
                          const stadium = getStadium();
                          const stadiumProtect = stadium && stadium.user === 'opp' && isStadiumHandProtect(stadium.card);
                          if (protector || stadiumProtect) {
                            const by = protector ? protector.name : (stadium.card.name || 'Stadium');
                            appendMessage('', `  \u{1f6e1}\ufe0f ${by} protects the hand — discard blocked.`, 'announcement', false);
                          } else {
                            const handCards = getZone('opp', 'hand').array;
                            if (handCards.length === 0) {
                              appendMessage('', `  opponent's hand is empty — nothing to discard.`, 'announcement', false);
                            } else if (handCards.length < oppDiscardN) {
                              appendMessage('', `  only ${handCards.length} card(s) in hand — discard manually.`, 'announcement', false);
                            } else {
                              appendMessage('', `  \u{1f0b4} Discard ${oppDiscardN} card(s) from the opponent's hand:`, 'announcement', false);
                              openChoicePicker({
                                title: `Discard ${oppDiscardN} from opponent's hand`,
                                candidates: handCards,
                                zoneFrom: 'hand',
                                destination: 'discard',
                                multiSelect: true,
                                requiredCount: oppDiscardN,
                                onConfirm: (picks) => {
                                  import('../../actions/move-card-bundle/move-card-bundle.js').then(({ moveCardBundle }) => {
                                    const zone = getZone('opp', 'hand');
                                    for (const pick of picks) {
                                      const idx = zone.array.indexOf(pick);
                                      if (idx >= 0) {
                                        try { moveCardBundle('opp', 'opp', 'hand', 'discard', idx, false, 'move'); } catch {}
                                      }
                                    }
                                    appendMessage('', `  auto: opponent discarded ${picks.length} card(s).`, 'announcement', false);
                                  });
                                },
                                onCancel: () => appendMessage('', '  cancelled — discard manually.', 'announcement', false),
                              });
                            }
                          }
                        }
                      });
                      return;
                    }
            ensureCardData(card).then(() => {
              const text = [card.effect || card.text || []].flat().join(' ');
              const parsed = parseTrainerEffect(text);
              if (!parsed.recognizable) {
                appendMessage('', `${card.name}: effect not auto-parsed — play it manually. (parser got: "${text.slice(0, 60)}")`, 'announcement', false);
                return;
              }
              appendMessage('', `▶ ${card.name}:`, 'announcement', false);
              for (const step of parsed.steps) {
                appendMessage('', '  ' + describeStep(step), 'announcement', false);
              }
              runTrainerSteps(card, parsed.steps);
            });
      } catch {}
    };

    const hookTrainerPlay = () => {
      // Instant path: react the same tick a card lands on 'board'.
      document.addEventListener('rules-card-on-board', (event) => {
        if (!rulesState.enabled || rulesState.phase === 'ended') return;
        if (rulesState.turnPlayer !== 'self') return;
        const { user, card } = event.detail || {};
        if (user !== 'self' || !card) return;
        processBoardCard(card);
      });

      document.addEventListener('rules-pokemon-in-play', (event) => {
        if (!rulesState.enabled || rulesState.phase === 'ended') return;
        const { user, card, zoneId, fromZone } = event.detail || {};
        if (!card?.image || card.image.__rulesPokemonInPlay) return;
        card.image.__rulesPokemonInPlay = true;
        ensureCardData(card).then(() => {
          if (parseSetupFaceDown(card) && !card.image.__rulesSetupFaceDown) {
            card.image.__rulesSetupFaceDown = true;
            hideCard(user, card);
            appendMessage(
              '',
              `🎭 ${card.name}: placed face-down (setup ability).`,
              'announcement',
              false
            );
          }
          if (fromZone === 'bench' && zoneId === 'active') {
            const steps = parseAbility(card.ability?.text || card.abilityText || '');
            const promo = steps.find((s) => s.type === 'onPromotionAbility');
            if (promo) {
              appendMessage(
                '',
                `⬆️ ${card.name}: ${promo.guidance}`,
                'announcement',
                false
              );
            }
          }
        });
      });

      document.addEventListener('rules-opponent-evolved', (event) => {
        if (!rulesState.enabled || rulesState.phase === 'ended') return;
        const { user: evolvingPlayer, evolvedCard, zoneId } = event.detail || {};
        const reactivePlayer = evolvingPlayer === 'self' ? 'opp' : 'self';
        const sources = [
          ...getZone(reactivePlayer, 'active').array,
          ...getZone(reactivePlayer, 'bench').array,
        ].filter((c) => c.type === 'Pokémon');
        for (const source of sources) {
          ensureCardData(source).then(() => {
            const trigger = parseOnOpponentEvolve(source);
            if (!trigger?.count) return;
            const tZone = getZone(evolvingPlayer, zoneId);
            const tIdx = tZone.array.findIndex((c) => c.image === evolvedCard.image);
            if (tIdx < 0) return;
            const existing =
              parseInt(
                evolvedCard.image?.damageCounter?.textContent || '0',
                10
              ) || 0;
            if (evolvedCard.image?.damageCounter) {
              evolvedCard.image.damageCounter.textContent = existing + trigger.count;
            } else {
              addDamageCounter(evolvingPlayer, zoneId, tIdx, trigger.count);
            }
            appendMessage(
              '',
              `⚡ ${source.name}: ${trigger.count} damage counter(s) on evolved ${evolvedCard.name}!`,
              'announcement',
              false
            );
          });
        }
      });

      // Backstop: catches anything that (for whatever reason) didn't fire
      // the event above — same logic, just on a slow poll so it's never
      // the thing the player is waiting on.
      window.setInterval(() => {
        if (!rulesState.enabled || rulesState.phase === 'ended') return;
        if (rulesState.turnPlayer !== 'self') return;
        try {
          const board = getZone('self', 'board');
          if (!board?.array) return;
          for (const card of board.array) processBoardCard(card);
        } catch {}
      }, 2000);
    };
    
    // ── move gating ──────────────────────────────────────────────────────
    const hookMoveCard = () => {
      window.addEventListener('rules-check-move', (event) => {
        const { user, fromZone, toZone, callback } = event.detail || {};
        const check = canPerformAction({ user, action: 'moveCard', zoneId: fromZone, targetZoneId: toZone });
        callback?.(check);
      });
    };
    
    
    const updateTurnBanner = () => {
      document.dispatchEvent(new CustomEvent('rules-turn-began', { detail: { player: rulesState.turnPlayer } }));
    };

    // ── start-of-turn draw (taxonomy B) ──────────────────────────────
    // Every live turn transition dispatches `rules-turn-began` (solo attack/
    // pass via chat-buttons.js, the +Turn button via hookTurnButton, and the
    // multiplayer mirror via hookMultiplayerSync). A single listener here
    // covers all three: it auto-draws one card for the incoming turn player,
    // once per turn (guarded by `drewThisTurn`), and announces deck-out when
    // the deck is empty.
    const hookTurnStartDraw = () => {
      if (document.getElementById('rulesTurnStartDrawHooked')) return;
      const marker = document.createElement('span');
      marker.id = 'rulesTurnStartDrawHooked';
      document.body.appendChild(marker);

      document.addEventListener('rules-turn-began', (event) => {
        const player = event?.detail?.player || rulesState.turnPlayer;
        if (!rulesState.enabled) return;
        let deckCount = 0;
        try {
          deckCount = getZone(player, 'deck').getCount();
        } catch {
          return;
        }
        if (shouldAutoDrawAtTurnStart({
          enabled: rulesState.enabled,
          drewThisTurn: rulesState.flags[player]?.drewThisTurn,
          deckCount,
          turnNumber: rulesState.turnNumber,
        })) {
          markTurnDrawn(player);
          draw(player, player, 1, true);
          appendMessage('', `${player === 'self' ? 'P1' : 'P2'} draws a card (start of turn).`, 'announcement', false);
        } else if (Number(deckCount) <= 0) {
          appendMessage('', `${player === 'self' ? 'P1' : 'P2'}'s deck is empty — cannot draw.`, 'announcement', false);
        }
      });
    };
    
    const escapeHtml = (v = '') => String(v)
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    
    const toastRulesBlocked = (reason) => {
      appendMessage('', `⛔ ${reason}`, 'announcement', false);
    };
    
    export { buildRulesToggle };
    