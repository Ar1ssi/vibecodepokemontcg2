// Bridge between the free-form sim and the server-authoritative rules engine: the turn HUD,
    // card glows, the Pass button hook, and the opening ceremony (turn-order coin, first/second
    // choice, Starting Active prompts). The server runs every rule; this file only presents them.

    import { systemState, socket as rulesSocket } from '../../initialization/global-variables/global-variables.js';
    import { appendMessage } from '../chatbox/append-message.js';
    import { processAction } from '../general/process-action.js';
    import { getZone } from '../zones/get-zone.js';
    import { openCardPicker, closeCardPicker, isCardPickerOpen } from '../image-logic/card-picker.js';
    import {
      rulesState,
      canPerformAction,
      ensureCardData,
      startGame,
      beginTurn,
      endTurn,
      abilityUsed,
      loadRulesEnabled,
      persistRulesEnabled,
      getStadium,
      markMulligansResolved,
      resetRulesSessionState,
      canUsePlayedToBenchTrigger,
    } from '/shared/engine/rules/rules-state.mjs';
    import { resetPrizes } from '/shared/engine/rules/ko-flow.mjs';
    import { resetStatuses } from '/shared/engine/rules/status.mjs';
    import { getDealOrderStarter, resetDealOrder } from '../netcode/deal-order.js';
    import { soloCommandSeat } from '../netcode/solo-seat.mjs';
    import { multiplayerLocksRulesEnabled, e2eDelayMs, isE2eMode } from '../general/e2e-mode.mjs';
    import { stadiumExtraAttacksFromZone } from '/shared/engine/rules/stadium-effects.mjs';
    import { describeEnergyEffect } from '/shared/engine/rules/energy-effects.mjs';
    import { parseSpecialEnergyEffects, describeSpecialEnergyEffects } from '/shared/engine/rules/special-energy-parse.mjs';
    import {
      getTurnOrderFlip,
      getTurnOrderResult,
      resetTurnOrderCall,
    } from '../netcode/turn-order-call.js';
    import {
      getSelectedCoin,
      initMatCoins,
      pickDefaultCoin,
      setSelectedCoin,
      withCatalogCoin,
    } from './mat-coin.js';
    import { playCoinFlipCeremony } from './coin-flip-ceremony.js';
    import { coinCeremonyTimeline } from '../netcode/mat-fx/coin-pose.mjs';
    import { holdFxQueueUntil, whenFxQueueIdle } from '../netcode/advisory-animations.js';
    import { afterOpeningDeal } from '../netcode/mat-fx/deck-box-gate.mjs';
    import { enrichWithinBound } from './bounded-enrichment.mjs';
    import { playFxSound, playUiCue } from '../netcode/mat-fx/fx-audio.js';
    import {
      hasAuthoritativeView,
      getAuthoritativeZoneArray,
      getAuthoritativeStadiumArray,
      getAuthoritativeCostDiscounts,
    } from '../netcode/apply-view.js';
    import { isBasicPokemon, isEnergy, isTrainer } from '/shared/engine/cards.mjs';
    import { attachedEnergiesFor, stadiumCardFor, abilityUsedFor } from './attack-preview-sources.mjs';
    import { liveActiveCard, liveCardFor, glowNodeFor } from './live-card-sources.mjs';
    import { isPlayedToBenchTriggerCard, isEvolvePlayedTriggerCard } from './action-affordances.mjs';
    import { computeCardGlows } from './card-glow-model.mjs';
    import { glowColorFor } from './card-glow-colors.mjs';
    import { spectatorSeatName } from '../spectator/spectator-session.js';

    
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
    
    // True while the heads/tails call picker is open.
    let coinCallPending = false;
    // True once both players have readied up and prizes are on the mat —
    // gates the opening so a server turn-order message that lands before
    // the deal cannot start the game early.
    let openingSetupReadyForCoinFlip = false;
    // Bumped on reset/restart so stale coin-flip / mulligan callbacks cannot
    // re-enter beginSetupWithTurnOrder after the session was cleared.
    let rulesSessionGeneration = 0;
    // Design 013: the opening sequence has run this session. Replaces the old
    // "phase is still 'setup'" double-start guard, which cannot be trusted under
    // server authority — the authoritative post-deal view moves rulesState.phase
    // to 'main' (apply-view.js reconcileTurnState) before the client's own
    // opening ceremony has had a chance to run.
    let openingStarted = false;
    // The server's opening coin (designs 013, 072): whether its ceremony has
    // been shown and has finished, when it ends, the winner's first/second
    // result and the starter it names. The game starts only when the ceremony,
    // the result and the local deal ('both-players-ready') are all in.
    let serverTurnOrderStarter = null;
    let serverTurnOrderShown = false;
    let serverTurnOrderAnimationDone = false;
    // Settles once the opening coin has left the screen (null before the flip is shown).
    let serverCoinCeremonyEnded = null;
    let serverTurnOrderResult = null;
    let serverTurnOrderAnnounced = false;
    // True while this seat's "Do you want to go first?" prompt is open.
    let turnOrderChoicePending = false;
    let startingActiveSelectionPending = false;
    let startingActiveFinished = false;
    let startingActiveFirstPlayer = null;
    // True from the moment promptStartingActiveSelection starts until it has
    // either mounted its picker or bailed. The prompt awaits hand enrichment,
    // and those awaits re-enter the watcher events; openCardPicker closes any
    // prior picker so this cannot stack modals, but without the guard a racing
    // re-entry churns pickers (mount, teardown, remount) and duplicates the
    // prompt announcement.
    let startingActivePromptInFlight = false;
    // Bounds the watcher's re-arms, so a pick that keeps failing to move the
    // card announces instead of popping a modal back open forever.
    let startingActivePromptRetries = 0;

    const STARTING_ACTIVE_MAX_PROMPT_RETRIES = 3;
    const OPENING_HAND_TIMEOUT_MS = 20000;
    // The beat between the turn-order coin leaving the screen and the opening deal.
    const OPENING_DEAL_GAP_MS = 300;
    // The coin's own renderer loads before its clock starts, so the ceremony can outlast its
    // timeline; past this much extra the opening stops waiting for it.
    const COIN_CEREMONY_BACKSTOP_MS = 8000;
    const TURN_ORDER_CHOICE_OVERLAY_ID = 'rulesTurnOrderChoiceOverlay';

    // Events that can bring the opening hand onto the board.
    const OPENING_VIEW_EVENTS = [
      'rules-card-moved',
      'action-processed',
      'rules-turn-view-applied',
      'card-moved',
    ];

    // Resolves true once `user` holds cards, false if they never arrive in time.
    // The opening deal is asynchronous — under server authority the server deals
    // only after its own coin call resolves, then broadcasts a view — so the
    // Starting Active prompt has to wait on the hand itself rather than on a
    // fixed sleep.
    const waitForOpeningHand = (user, session, timeoutMs = OPENING_HAND_TIMEOUT_MS) =>
      new Promise((resolve) => {
        if (session !== rulesSessionGeneration) {
          resolve(false);
          return;
        }
        if (liveZoneArray(user, 'hand').length > 0) {
          resolve(true);
          return;
        }
        const finish = (ok) => {
          clearTimeout(timer);
          OPENING_VIEW_EVENTS.forEach((evt) => document.removeEventListener(evt, onEvent));
          resolve(ok);
        };
        const onEvent = () => {
          if (session !== rulesSessionGeneration) finish(false);
          else if (liveZoneArray(user, 'hand').length > 0) finish(true);
        };
        const timer = setTimeout(() => finish(false), timeoutMs);
        OPENING_VIEW_EVENTS.forEach((evt) => document.addEventListener(evt, onEvent));
      });

    const hookStartingActiveWatcher = () => {
      const check = () => {
        if (startingActiveFinished) return;
        if (!openingStarted && !startingActiveSelectionPending) return;
        if (checkBothActivesSetAndBegin(startingActiveFirstPlayer, rulesSessionGeneration)) return;
        if (!startingActiveSelectionPending) return;
        if (
          startingActivePromptInFlight ||
          startingActivePromptRetries >= STARTING_ACTIVE_MAX_PROMPT_RETRIES ||
          isCardPickerOpen() ||
          liveZoneArray('self', 'active').length > 0 ||
          liveZoneArray('self', 'hand').length === 0
        ) {
          return;
        }
        // A hand that lands after the one-shot prompt already gave up would
        // otherwise strand the game in setup, where every action is denied.
        startingActivePromptRetries += 1;
        void promptStartingActiveSelection(startingActiveFirstPlayer, rulesSessionGeneration);
      };
      OPENING_VIEW_EVENTS.forEach((evt) => {
        document.addEventListener(evt, check);
      });
    };

    // Solo debug shortcut: `?norules` (alias `?debug`) in the URL forces rules
    // enforcement OFF for this page load so a lone tester can move any card
    // anywhere on localhost without ticking Settings each time. Ephemeral —
    // it does NOT persist to localStorage, and it never overrides a
    // multiplayer game (which always locks rules on).
    const applyDebugRulesOverride = () => {
      try {
        if (typeof location === 'undefined') return;
        const params = new URLSearchParams(location.search);
        if (!params.has('norules') && !params.has('debug')) return;
        if (multiplayerLocksRulesEnabled(systemState.isTwoPlayer)) return;
        rulesState.enabled = false;
        appendMessage('', 'Debug mode: rules enforcement disabled (?norules).', 'announcement', false);
      } catch (error) {
        console.warn('rules-bridge: reading the ?norules debug override failed', error);
      }
    };

    export const initializeRulesEngine = () => {
      if (initialized) return;
      initialized = true;
      loadRulesEnabled();
      applyDebugRulesOverride();
      document.body.classList.toggle('rules-mode', rulesState.enabled);
      initMatCoins();
      buildTurnHUD();
      hookTurnButton();
      hookSetupButton();
      hookDeckView();
      hookActionAffordances();
      hookMultiplayerSync();
      hookMoveCard();
      hookSpecialEnergyAnnounce();
      syncRulesToggleUI();
      hookStartingActiveWatcher();
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
    
      // startGame leaves phase 'draw' on turn 0 while the Starting Actives are still being
      // chosen: that is still setup, so no "draw phase" banner over the placement.
      const placingStartingActives = () =>
        rulesState.phase === 'draw' && !(rulesState.turnNumber > 0) && !rulesState.startingActiveDone;

      const refresh = () => {
        if (!rulesState.enabled || rulesState.phase === 'setup' || placingStartingActives()) {
          hud.hidden = true;
          return;
        }
        hud.hidden = false;
        const isMine = rulesState.turnPlayer === 'self';
        const watched = spectatorSeatName(rulesState.turnPlayer);
        hud.querySelector('.rules-hud-player').textContent = watched
          ? `${watched.toUpperCase()}'S TURN`
          : isMine ? 'YOUR TURN' : "OPPONENT'S TURN";
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
      document.addEventListener('rules-turn-view-applied', refresh);
      document.addEventListener('rules-mode-changed', refresh);
      document.addEventListener('rules-session-reset', refresh);
      document.addEventListener('rules-energy-attached', refresh);
      document.addEventListener('rules-card-moved', refresh);
      document.addEventListener('rules-damage-changed', refresh);
      document.addEventListener('rules-status-changed', refresh);
      document.addEventListener('action-processed', refresh);
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
        if (multiplayerLocksRulesEnabled(systemState.isTwoPlayer) && !e.target.checked) {
          // Multiplayer games always run with rules enforced: snap the
          // checkbox back instead of letting it be unticked. The e2e bridge
          // is exempt (multiplayerLocksRulesEnabled) — bot-vs-bot debug
          // testing needs to break rules mid-game on purpose.
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
    // solo "off" preference can't carry into a shared game. The e2e bridge is
    // exempt — always called with isTwoPlayer already true, so exemption
    // reduces to isE2eMode() itself (multiplayerLocksRulesEnabled(true)).
    export const forceRulesEnabledForMultiplayer = () => {
      if (!multiplayerLocksRulesEnabled(true) || rulesState.enabled) {
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

    // ── turn flow: the Pass button ───────────────────────────────────────
    // In rules mode this capture hook owns the click: stopping it here keeps the bubble handler
    // (pass() in chat-buttons) from sending a second pass command. The server runs the turn
    // change, the Pokémon Checkup and the next draw, and answers with a view. A click this seat
    // cannot pass for is left alone, so pass() tells the player why instead of nothing happening.
    const hookTurnButton = () => {
      const handlePassClick = (event) => {
        if (!rulesState.enabled) return;
        const endingPlayer = rulesState.turnPlayer;
        // A solo room's one player passes for whichever seat is on turn (design 074 D7).
        const passesForSeat = systemState.isTwoPlayer && (endingPlayer === 'self' || systemState.solo);
        if (!passesForSeat) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const next = endTurn(endingPlayer);
        appendMessage('', `Turn passes to ${next === 'self' ? 'P1' : 'P2'}`, 'announcement', false);
        updateTurnBanner();
        processAction(endingPlayer, true, 'pass', [{}]);
      };
      ['passButton', 'p2PassButton'].forEach((id) => {
        const btn = document.getElementById(id);
        if (!btn || btn.dataset.rulesPassHooked) return;
        btn.dataset.rulesPassHooked = '1';
        btn.addEventListener('click', handlePassClick, true);
      });
    };

    const hookSetupButton = () => {
      // The coin flip used to fire the instant a Set Up button was
      // clicked. Set Up is now a "ready check" (see ready.js) — the
      // actual game/hand setup only happens once BOTH players have
      // pressed their button, at which point ready.js dispatches
      // 'both-players-ready' on document. Listen for that instead of the
      // raw click so the coin flip happens after setup is complete.
      document.addEventListener('both-players-ready', () => {
        openingSetupReadyForCoinFlip = true;
        handleSetupClick();
      });
      // Design 013: raised by turn-order-call.js from the server's messages. The server calls the
      // coin the moment both players are ready; design 073's deck box deal plays first, so these run
      // in arrival order once it ends (at once when no deal plays).
      document.addEventListener('rules-turn-order-call', (event) => {
        afterOpeningDeal(() => handleServerTurnOrderCall(event.detail));
      });
      document.addEventListener('rules-turn-order-flip', (event) => {
        afterOpeningDeal(() => {
          if (!isServerOwnedTurnOrder()) return;
          showServerCoinFlip(event.detail);
        });
      });
      document.addEventListener('rules-turn-order-result', (event) => {
        afterOpeningDeal(() => {
          if (!isServerOwnedTurnOrder()) return;
          applyServerTurnOrderResult(event.detail);
        });
      });
      document.addEventListener('deal-order-received', () => {
        if (!isServerOwnedTurnOrder() || !rulesState.enabled) return;
        maybeBeginServerTurnOrder();
      });
      document.addEventListener('rules-turn-order-choice-rejected', (event) => {
        if (!isServerOwnedTurnOrder() || !rulesState.enabled) return;
        closeTurnOrderChoicePicker();
        appendMessage(
          '',
          `First/second choice not accepted (${event.detail?.reason || 'unknown'}) — waiting for the server.`,
          'announcement',
          false
        );
      });
      document.addEventListener('rules-turn-order-call-rejected', (event) => {
        if (!isServerOwnedTurnOrder() || !rulesState.enabled) return;
        // The server refused our call (stale id, not our turn to call, malformed
        // face). Say so instead of leaving a dead picker behind.
        coinCallPending = false;
        document.getElementById('rulesCoinCallOverlay')?.remove();
        appendMessage(
          '',
          `Coin call not accepted (${event.detail?.reason || 'unknown'}) — waiting for the server's flip.`,
          'announcement',
          false
        );
      });
      hookResetButtons();
    };
    
    // Non-rules Reset handlers don't touch rulesState, so without this the
    // phase would stay 'draw' and a later Set Up would skip the coin flip.
    const resetRulesSession = () => {
      rulesSessionGeneration += 1;
      resetRulesSessionState();
      resetDealOrder();
      resetTurnOrderCall();
      openingStarted = false;
      serverTurnOrderStarter = null;
      serverTurnOrderShown = false;
      serverTurnOrderAnimationDone = false;
      serverCoinCeremonyEnded = null;
      serverTurnOrderResult = null;
      serverTurnOrderAnnounced = false;
      closeTurnOrderChoicePicker();
      resetPrizes();
      resetStatuses();
      coinCallPending = false;
      openingSetupReadyForCoinFlip = false;
      startingActiveSelectionPending = false;
      startingActiveFinished = false;
      startingActiveFirstPlayer = null;
      startingActivePromptInFlight = false;
      startingActivePromptRetries = 0;
      closeCardPicker(null, true);
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
      // Leaving or joining a room ends the previous game. Unlike the Reset
      // buttons this is not gated on rulesState.enabled: a stale phase or a
      // stale openingSetupReadyForCoinFlip carried into the next room shows
      // the old turn HUD and lets the next peerSocketId/turnOrderCoinFlip
      // auto-start a game nobody set up.
      document.addEventListener('room-changed', resetRulesSession);
    };
    
    const liveZoneArray = (user, zoneId) => {
      if (hasAuthoritativeView()) {
        const side = user === 'self' ? 'you' : 'them';
        return zoneId === 'stadium'
          ? getAuthoritativeStadiumArray()
          : getAuthoritativeZoneArray(side, zoneId);
      }
      return getZone(user, zoneId)?.array || [];
    };

    const getBasicPokemonFromHand = async (user) => {
      const hand = liveZoneArray(user, 'hand');
      const basics = [];
      await enrichWithinBound(hand, ensureCardData);
      for (const card of hand) {
        if (!isTrainer(card) && !isEnergy(card) && (isBasicPokemon(card) || (card.stage || 'Basic') === 'Basic')) {
          basics.push(card);
        }
      }
      return basics.length > 0 ? basics : hand;
    };

    const checkBothActivesSetAndBegin = (firstPlayer, session) => {
      if (session !== rulesSessionGeneration) return false;
      if (startingActiveFinished) return true;

      const selfActive = liveZoneArray('self', 'active');
      const oppActive = liveZoneArray('opp', 'active');
      if (selfActive.length === 0 || oppActive.length === 0) {
        return false;
      }

      startingActiveFinished = true;
      startingActiveSelectionPending = false;
      closeCardPicker(null, true);

      appendMessage('', 'Both players have set their Active Pokémon!', 'announcement', false);

      const starter = firstPlayer || startingActiveFirstPlayer || rulesState.turnPlayer || 'self';
      beginTurn(starter === 'opp' ? 'opp' : 'self');
      updateTurnBanner();
      return true;
    };

    const promptStartingActiveSelection = async (firstPlayer, session) => {
      if (session !== rulesSessionGeneration) return;
      if (startingActiveFinished || startingActivePromptInFlight) return;

      startingActiveFirstPlayer = firstPlayer;
      startingActiveSelectionPending = true;
      startingActivePromptInFlight = true;

      try {
        if (checkBothActivesSetAndBegin(firstPlayer, session)) return;

        // Gate on the hand, not on a sleep. If the picker opens while the hand
        // is still empty it has no candidates, and with nothing else able to
        // re-open it the game stays in setup forever — where canPerformAction
        // and validateLegality deny every action silently.
        if (!(await waitForOpeningHand('self', session))) {
          if (session === rulesSessionGeneration) {
            appendMessage(
              '',
              'Still waiting on your opening hand — the Starting Active picker opens as soon as it arrives.',
              'announcement',
              false
            );
          }
          return;
        }
        if (session !== rulesSessionGeneration || startingActiveFinished) return;

        // The hand is in state before its deal has played: the picker opens once
        // the coin ceremony and the opening draw are off the screen, not over them.
        await whenFxQueueIdle();
        if (session !== rulesSessionGeneration || startingActiveFinished) return;

        const promptPlayerActive = async (user, title) => {
          if (session !== rulesSessionGeneration) return;
          if (liveZoneArray(user, 'active').length > 0) {
            checkBothActivesSetAndBegin(firstPlayer, session);
            return;
          }

          const candidates = await getBasicPokemonFromHand(user);
          if (session !== rulesSessionGeneration || startingActiveFinished) return;
          if (!candidates || candidates.length === 0) {
            // Left pending on purpose: the watcher re-arms this prompt once the
            // hand is usable again. Announcing and returning is all the old
            // code did, and it was the dead end.
            return;
          }
          if (liveZoneArray(user, 'active').length > 0) {
            checkBothActivesSetAndBegin(firstPlayer, session);
            return;
          }

          appendMessage(
            '',
            'Prompt: Both players, choose a Basic Pokémon from your hand for your Active Spot before starting turn 1.',
            'announcement',
            false
          );

          openCardPicker({
            title,
            candidates,
            mode: 'single',
            zoneFrom: 'hand',
            destination: 'active',
            user,
            onPick: async (card) => {
              if (session !== rulesSessionGeneration) return;
              appendMessage(
                '',
                `${user === 'self' ? 'You' : 'Opponent'} chose ${card?.name || 'a Pokémon'} as Active Pokémon.`,
                'announcement',
                false
              );

              if (systemState.isTwoPlayer && rulesSocket) {
                rulesSocket.emit('rulesEvent', {
                  type: 'startingActiveChosen',
                  data: { player: user, cardName: card?.name },
                });
              }

              if (checkBothActivesSetAndBegin(firstPlayer, session)) {
                return;
              }

              // One player sets both Actives locally, and in a solo room (design 074 D7).
              const choosesBoth = systemState.solo;
              if (choosesBoth && liveZoneArray('opp', 'active').length === 0) {
                setTimeout(() => {
                  promptPlayerActive('opp', "Choose Opponent's Starting Active Pokémon");
                }, 100);
              }
            },
          });
        };

        if (liveZoneArray('self', 'active').length === 0) {
          await promptPlayerActive('self', 'Choose your Starting Active Pokémon');
        } else if (systemState.solo && liveZoneArray('opp', 'active').length === 0) {
          await promptPlayerActive('opp', "Choose Opponent's Starting Active Pokémon");
        }
      } finally {
        startingActivePromptInFlight = false;
      }
    };

    // Starts the opening once the server's turn order is known: once per game, then the
    // Starting Active prompts. The server's 'setup' command already shuffled, dealt 7+6,
    // adjudicated mulligans and awarded bonus draws before it broadcast the post-setup view, so
    // this client deals nothing; the prompt waits on the hand itself (waitForOpeningHand).
    const beginSetupWithTurnOrder = (firstPlayer) => {
      // A second call (the ceremony and the deal both completing, a duplicate event) would re-run
      // startGame() and reset drewThisTurn. This used to test rulesState.phase, which the
      // authoritative view rewrites to 'main' before this ever runs (design 013).
      if (openingStarted) return;
      openingStarted = true;
      playFxSound({ effect: 'setup-begin' });
      const session = rulesSessionGeneration;
      startGame(firstPlayer);
      resetPrizes();
      resetStatuses();
      markMulligansResolved();
      appendMessage('', 'Rules engine active — good luck!', 'announcement', false);
      void promptStartingActiveSelection(firstPlayer, session);
    };

    // ── design 013: server-owned turn-order coin call ────────────────────
    // True when the server, not this client, decides turn order.
    // A solo room keeps a deal per seat (design 074 D7); this client reads the near seat's.
    const nearDealSeat = () => soloCommandSeat({ ...systemState, user: 'self' }) ?? null;

    const isServerOwnedTurnOrder = () =>
      Boolean(systemState.isTwoPlayer && systemState.serverAuthoritative);

    // The opening sequence needs things that arrive independently: the server's
    // coin (shown as the ceremony), the winner's first/second answer (the
    // result), and the local deal, which finishes when ready.js raises
    // 'both-players-ready'. Whichever lands last starts the game.
    const maybeBeginServerTurnOrder = () => {
      if (!serverTurnOrderAnimationDone) return false;
      if (!serverTurnOrderResult) return false;
      announceServerTurnOrderResult();
      if (!serverTurnOrderStarter) return false;
      if (!openingSetupReadyForCoinFlip) return false;
      // The deal follows the result: starting before its view lands would let
      // that view reset the phase the opening has just set (dealOrder is sent
      // after the view, so its arrival means the deal is in).
      if (!getDealOrderStarter(nearDealSeat())) return false;
      const starter = serverTurnOrderStarter;
      serverTurnOrderStarter = null;
      beginSetupWithTurnOrder(starter);
      return true;
    };

    const sideName = (side) => (side === 'self' ? 'You' : 'Your opponent');

    // TCG Live's battle-log lines (blog_loc_going_first/_second) and its
    // setup_pl_turn / setup_op_turn prompt, once the coin has left the screen.
    const announceServerTurnOrderResult = () => {
      if (serverTurnOrderAnnounced || !serverTurnOrderResult) return;
      serverTurnOrderAnnounced = true;
      const { winner, goFirst, starter, choiceAuto } = serverTurnOrderResult;
      appendMessage(
        '',
        choiceAuto
          ? `No choice came in time — ${winner === 'self' ? 'you go' : 'your opponent goes'} first.`
          : `${sideName(winner)} decided to go ${goFirst ? 'first' : 'second'}.`,
        'announcement',
        false
      );
      appendMessage(
        '',
        starter === 'self' ? 'You will go first.' : 'Your opponent will go first.',
        'announcement',
        false
      );
    };

    // Answers "Do you want to go first?" for this seat. Only the winner's copy of
    // the flip carries a choiceId; the server rejects anyone else.
    // A solo room (design 074 D7) answers for the winner's seat (choiceSeat).
    const sendTurnOrderChoice = ({ roomId, choiceId, goFirst, choiceSeat }) => {
      rulesSocket?.emit('turnOrderChoice', {
        roomId: roomId || systemState.roomId,
        choiceId,
        goFirst,
        ...(choiceSeat ? { seat: choiceSeat } : {}),
      });
    };

    const turnOrderChoiceOf = (flip) => ({
      roomId: flip.roomId,
      choiceId: flip.choiceId,
      choiceSeat: flip.choiceSeat,
    });

    const closeTurnOrderChoicePicker = () => {
      turnOrderChoicePending = false;
      document.getElementById(TURN_ORDER_CHOICE_OVERLAY_ID)?.remove();
    };

    // Runs once the coin has landed and faded: name the winner, then either ask
    // this seat to choose or tell it the opponent is choosing (TCG Live's
    // pl_calling_turn / op_calling_turn).
    const afterServerCoinLands = (flip) => {
      appendMessage('', `${sideName(flip.winner)} won the coin toss.`, 'announcement', false);
      if (serverTurnOrderResult) return; // already chosen (auto, or answered early)
      // A solo player answers for whichever seat won (flip.choiceSeat).
      if (flip.winner !== 'self' && !flip.choiceSeat) {
        appendMessage(
          '',
          'Your opponent won the coin flip and is deciding who goes first.',
          'announcement',
          false
        );
        return;
      }
      if (!flip.choiceId || turnOrderChoicePending) return;
      turnOrderChoicePending = true;
      openTurnOrderChoicePicker({
        onChoose: (goFirst) => {
          turnOrderChoicePending = false;
          sendTurnOrderChoice({ ...turnOrderChoiceOf(flip), goFirst });
        },
      });
    };

    // Shows the server's coin. Deliberately NOT gated on rulesState.phase: the
    // authoritative view may already have moved it on by now.
    const showServerCoinFlip = (flip) => {
      if (!flip) return false;
      if (!rulesState.enabled) {
        // Free play shows no ceremony and has nobody to click the prompt; the
        // deal waits on this answer, so give it at once.
        if (flip.choiceId) {
          sendTurnOrderChoice({ ...turnOrderChoiceOf(flip), goFirst: true });
        }
        return false;
      }
      if (serverTurnOrderShown) return false; // one ceremony per game
      serverTurnOrderShown = true;

      coinCallPending = false;
      document.getElementById('rulesCoinCallOverlay')?.remove();

      // The Playwright harness has nobody to click either; it answers as the
      // winner always did before the choice existed.
      if (isE2eMode() && flip.choiceId) {
        sendTurnOrderChoice({ ...turnOrderChoiceOf(flip), goFirst: true });
      }

      const { caller, call, result, winner, coinId, auto } = flip;
      // The server echoes the caller's chosen coin so both clients render the
      // same art; fall back to this client's local selection, then a stable
      // default (never a random coin, so repeated flips keep the same face).
      const fallbackCoin = getSelectedCoin(caller) || pickDefaultCoin();
      appendMessage(
        '',
        auto
          ? `No call came in time — the coin was called ${call} automatically.`
          : `${sideName(caller)} chose ${call} for the opening coin flip.`,
        'announcement',
        false
      );
      const ceremony = withCatalogCoin(coinId, (named) =>
        playCoinFlipCeremony({
          coin: named || fallbackCoin,
          result,
          ownerLabel: caller === 'self' ? 'Your' : "Opponent's",
          label: auto
            ? `${call === 'heads' ? 'Heads' : 'Tails'} was called for you. Flipping the coin…`
            : `${sideName(caller)} chose ${call}. Flipping the coin…`,
          outcomeLabel: winner === 'self' ? 'You won the coin flip!' : 'Your opponent won the coin flip.',
        })
      );

      // The prompt and the deal follow the coin off the screen: the ceremony's own end, not its
      // timeline, which starts before the coin's renderer has loaded. The harness keeps the timeline.
      const ceremonyMs = e2eDelayMs(coinCeremonyTimeline(1).totalMs);
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      serverCoinCeremonyEnded = isE2eMode()
        ? delay(ceremonyMs)
        : Promise.race([Promise.resolve(ceremony).catch(() => {}), delay(ceremonyMs + COIN_CEREMONY_BACKSTOP_MS)]);
      const session = rulesSessionGeneration;
      serverCoinCeremonyEnded.then(() => {
        if (session !== rulesSessionGeneration) return;
        serverTurnOrderAnimationDone = true;
        afterServerCoinLands(flip);
        maybeBeginServerTurnOrder();
      });
      return true;
    };

    // The winner has chosen (or the server chose for them) and the deal follows
    // right behind this message.
    const applyServerTurnOrderResult = (result) => {
      if (!result) return false;
      if (!rulesState.enabled) return false;
      if (serverTurnOrderResult) return false; // one result per game
      // A seat that missed the flip (rules switched on late) still sees the coin.
      if (!serverTurnOrderShown) showServerCoinFlip({ ...result, choiceId: null });
      serverTurnOrderResult = result;
      serverTurnOrderStarter = result.starter;
      closeTurnOrderChoicePicker();
      // The opening hands fly in once the coin has faded out, not underneath it.
      const gapMs = e2eDelayMs(OPENING_DEAL_GAP_MS);
      holdFxQueueUntil(
        (serverCoinCeremonyEnded || Promise.resolve()).then(() => new Promise((resolve) => setTimeout(resolve, gapMs)))
      );
      maybeBeginServerTurnOrder();
      return true;
    };

    // The server nominated a caller. Only the nominated seat gets a callId.
    const handleServerTurnOrderCall = (detail) => {
      if (!isServerOwnedTurnOrder()) return;
      // `seat`: a solo room's caller seat (design 074 D7), echoed in the call.
      const { callId, waiting, roomId, seat } = detail || {};
      const seatField = seat ? { seat } : {};
      const targetRoomId = roomId || systemState.roomId;

      if (waiting || !callId) {
        if (rulesState.enabled) {
          appendMessage(
            '',
            'Your opponent is calling the starting coin flip…',
            'announcement',
            false
          );
        }
        return;
      }

      // Two cases with nobody to click the picker: free play (rules mode off has
      // no coin ceremony) and the Playwright harness. The deal still waits on this
      // answer, so answer at once rather than stalling both seats until the
      // server's timeout fires. The face is immaterial — the server flips either
      // way, and neither mode shows the call or the flip.
      if (!rulesState.enabled || isE2eMode()) {
        rulesSocket?.emit('turnOrderCall', {
          roomId: targetRoomId,
          callId,
          call: 'heads',
          coinId: getSelectedCoin('self')?.id || null,
          ...seatField,
        });
        return;
      }

      if (coinCallPending) return;
      coinCallPending = true;
      openCoinCallPicker({
        subtitle: 'Call the starting coin flip. Choose heads or tails.',
        onCall: (call) => {
          coinCallPending = false;
          rulesSocket?.emit('turnOrderCall', {
            roomId: targetRoomId,
            callId,
            call,
            // The caller's chosen coin, echoed by the server so both screens
            // show the same art during the ceremony (display only; the flip
            // result still comes from the server's seeded rng).
            coinId: getSelectedCoin('self')?.id || null,
            ...seatField,
          });
        },
      });
    };

    // Fires once both players have pressed Set Up and their prize cards are on the mat (the
    // 'both-players-ready' event dispatched by ready.js). The coin call belongs to the server
    // (design 013): it opens the picker (or waits on the caller) and broadcasts the one flip, so
    // this client never picks a caller and never flips. Checked before anything that reads
    // rulesState.phase, which the authoritative view has already moved off 'setup'.
    const handleSetupClick = () => {
      if (!rulesState.enabled) return;
      if (!openingSetupReadyForCoinFlip) return;
      if (!isServerOwnedTurnOrder()) return;
      if (maybeBeginServerTurnOrder()) return;
      if (!applyServerTurnOrderResult(getTurnOrderResult())) {
        showServerCoinFlip(getTurnOrderFlip());
      }
    };

    // Two-button opening prompt (call the coin, go first or second). Mirrors the
    // #rulesChoicePicker overlay styling; a click outside picks nothing.
    const openTurnOrderPrompt = ({ id, title, subtitle, options, onPick }) => {
      document.getElementById(id)?.remove();
      const overlay = document.createElement('div');
      overlay.id = id;
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:2400;display:flex;align-items:center;justify-content:center;background:rgba(8,10,14,.72);';
      const box = document.createElement('div');
      box.style.cssText =
        'background:#1b1f27;border:1px solid #3a4150;border-radius:12px;padding:24px 28px;text-align:center;color:#e8ecf4;min-width:280px;';
      const heading = document.createElement('div');
      heading.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:6px;';
      heading.textContent = title;
      const text = document.createElement('div');
      text.style.cssText = 'font-size:13px;color:#9aa3b2;margin-bottom:16px;';
      text.textContent = subtitle;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:12px;justify-content:center;';
      for (const option of options) {
        const button = document.createElement('button');
        button.type = 'button';
        button.style.cssText =
          'flex:1;padding:10px 18px;border-radius:8px;border:1px solid #4a5568;background:#2a3040;color:#e8ecf4;font-size:14px;font-weight:600;cursor:pointer;';
        button.textContent = option.label;
        // Test and bot hook: #rulesCoinCallOverlay button[data-coin-call="heads"].
        Object.assign(button.dataset, option.data);
        button.addEventListener('click', () => {
          playUiCue('choose-first-second');
          overlay.remove();
          onPick(option.value);
        });
        row.appendChild(button);
      }
      box.append(heading, text, row);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    };

    // "Call the coin": the caller picks heads or tails before the turn-order
    // flip; the coin's winner then chooses first or second (design 072).
    const openCoinCallPicker = ({
      onCall,
      subtitle = 'Pick a face \u2014 if the coin lands on it, you go first.',
    }) => {
      openTurnOrderPrompt({
        id: 'rulesCoinCallOverlay',
        title: '\u{1FA99} Call the coin',
        subtitle,
        options: [
          { label: 'Heads', value: 'heads', data: { coinCall: 'heads' } },
          { label: 'Tails', value: 'tails', data: { coinCall: 'tails' } },
        ],
        onPick: onCall,
      });
    };

    // TCG Live's pl_calling_turn: the toss winner answers Yes (go first) or No.
    const openTurnOrderChoicePicker = ({ onChoose }) => {
      openTurnOrderPrompt({
        id: TURN_ORDER_CHOICE_OVERLAY_ID,
        title: 'You won the coin flip!',
        subtitle: 'Do you want to go first?',
        options: [
          { label: 'Yes', value: true, data: { turnOrderChoice: 'first' } },
          { label: 'No', value: false, data: { turnOrderChoice: 'second' } },
        ],
        onPick: onChoose,
      });
    };

    // ── deck privacy ─────────────────────────────────────────────────────
    const hookDeckView = () => {
      // The deck cover (click to open) and the deck zone's own click/context
      // handlers both show deck contents. Gate both — the cover is the real
      // entry point (opens the face-up card list). A deck is never open to a
      // click: card effects search it through the server's own pickers.
      document.addEventListener('click', (event) => {
        if (!rulesState.enabled) return;
        // composedPath: a board-mirror card's click arrives retargeted to its shadow host (design 074 D4).
        const origin = event.composedPath?.()[0] ?? event.target;
        const target = origin.closest?.('[id="deck"], [id="deckCover"]');
        if (!target) return;
        const owner = target.id === 'deckCover' ? (target.user || 'self') : rulesState.turnPlayer;
        const check = canPerformAction({ user: owner, action: 'viewDeck' });
        if (!check.allowed) {
          event.stopImmediatePropagation();
          event.preventDefault();
          toastRulesBlocked(check.reason);
        }
      }, true);
    };

    // ── special Energy attach: announce what it does ────────────────────
    // The server runs the on-attach triggers itself (reduce/attach.mjs); this only names the
    // effect in the chat when a special Energy is attached.
    const hookSpecialEnergyAnnounce = () => {
      document.addEventListener('rules-energy-attached', async (event) => {
        if (!rulesState.enabled) return;
        const { energy, pokemon } = event.detail || {};
        if (!energy || !pokemon) return;
        try {
          await ensureCardData(energy);
          await ensureCardData(pokemon);
          if (!parseSpecialEnergyEffects(energy)) return;
          const desc = describeSpecialEnergyEffects(energy) || describeEnergyEffect(energy);
          appendMessage('', `⚡ ${desc}`, 'announcement', false);
        } catch (error) {
          console.warn('rules-bridge: announcing a special Energy attach failed', error);
        }
      });
    };

    // ── action affordances: turn-aware sidebox buttons + board ability glow ──
    // Highlight-parity plan gaps B1/B3/C3. Each sidebox is scored for the same
    // user its click handlers act as (see sidebox/p1|p2/chat-buttons.js), so
    // a highlight always describes what the button would actually do. The
    // pure payability scan lives in action-affordances.mjs.
    const hookActionAffordances = () => {
      const sideboxes = [
        {
          attackButton: document.getElementById('attackButton'),
          user: () => (systemState.isTwoPlayer ? systemState.initiator : 'self'),
        },
        {
          attackButton: document.getElementById('p2AttackButton'),
          user: () => (systemState.isTwoPlayer ? systemState.initiator : 'opp'),
        },
      ];
      const GLOW_CLASSES = ['has-glow', 'has-usable-ability'];
      const glowNodes = new Set();
      let generation = 0;

      const clearGlow = () => {
        for (const node of glowNodes) {
          node.classList?.remove(...GLOW_CLASSES);
          node.style?.removeProperty('--glow-rgb');
        }
        glowNodes.clear();
      };

      // The in-play Stadium is the parent-owned `#stadium` element (D93), not the
      // card node `getZone` returns, so its glow targets that element directly.
      const stadiumNode = () => document.getElementById('stadium');

      // Glows are collected per refresh and reconciled against the painted set,
      // so a node that stays lit is never touched: clearing up front and
      // re-adding after the async scan blinked every glow (and restarted its
      // animation) on each event of the startup / rejoin burst.
      const collectGlow = (next, card, { node: override = null, color, ability = false } = {}) => {
        const node = override || glowNodeFor(card);
        if (!node?.classList) return;
        const { rgb } = color || glowColorFor(card);
        const prev = next.get(node);
        next.set(node, { rgb: rgb.join(','), ability: ability || !!prev?.ability });
      };

      const applyGlows = (next) => {
        for (const node of glowNodes) {
          if (next.has(node)) continue;
          node.classList?.remove(...GLOW_CLASSES);
          node.style?.removeProperty('--glow-rgb');
          glowNodes.delete(node);
        }
        for (const [node, { rgb, ability }] of next) {
          node.classList.add('has-glow');
          node.classList.toggle('has-usable-ability', ability);
          if (node.style?.getPropertyValue('--glow-rgb') !== rgb) node.style?.setProperty('--glow-rgb', rgb);
          glowNodes.add(node);
        }
      };

      const isAbilitySpent = (user, card) =>
        isPlayedToBenchTriggerCard(card)
          ? !canUsePlayedToBenchTrigger(user, card)
          : isEvolvePlayedTriggerCard(card)
            ? abilityUsedFor(card, abilityUsed(user, card), rulesState.flags?.[user]?.abilitiesUsed) ||
              card?.enteredPlayTurn !== rulesState.turnNumber
            : abilityUsedFor(card, abilityUsed(user, card), rulesState.flags?.[user]?.abilitiesUsed);

      const refresh = async () => {
        const gen = ++generation;
        if (!rulesState.enabled || rulesState.phase === 'setup' || rulesState.phase === 'ended') {
          clearGlow();
          for (const box of sideboxes) {
            box.attackButton?.classList.remove('attacks-available', 'turn-disabled');
          }
          return;
        }
        // C4: only the LOCAL player's hand may be scanned or glowed. `isTurn` is
        // about whose turn it is (solo flips to 'opp'), not who is looking.
        const localUser = systemState.isTwoPlayer ? systemState.initiator : 'self';
        const scored = [];
        for (const box of sideboxes) {
          const user = box.user();
          const isTurn = rulesState.turnPlayer === user;
          let glows = null;
          let activeCard = null;
          let stadiumCard = null;
          if (isTurn) {
            try {
              // Design 023 slice 5: every zone read goes through `liveZoneArray`,
              // which serves the server's applied view under authoritative
              // rendering and legacy getZone otherwise, so the legality gates and
              // the painted nodes describe the same cards.
              const activeZoneCards = liveZoneArray(user, 'active');
              activeCard = liveActiveCard(activeZoneCards);
              stadiumCard = stadiumCardFor(getStadium(), getAuthoritativeStadiumArray());
              const handCards = user === localUser ? liveZoneArray(user, 'hand') : [];
              // Registry-backed so `attachedCards`/`abilityUsed` are present on
              // each card under authoritative rendering (no-op in legacy mode).
              const benchCards = liveZoneArray(user, 'bench').map((card) => liveCardFor(card));
              const other = user === 'self' ? 'opp' : 'self';
              const prizes = liveZoneArray(user, 'prizes');
              const discard = liveZoneArray(user, 'discard');
              const lostZone = liveZoneArray(user, 'lostZone');
              // The server redacts deck contents to a count, its owner included
              // (view.mjs), so the client's own 60 (recorded when the deck was
              // built) stands in for the hidden remainder — without it a Rare
              // Candy line could not be traced and would under-glow.
              const liveDeck = liveZoneArray(user, 'deck');
              const deckList = liveDeck.length
                ? [...liveDeck, ...discard, ...lostZone, ...prizes, ...handCards]
                : [...(systemState.ownDeckCards || []), ...discard, ...lostZone, ...prizes, ...handCards];
              glows = await computeCardGlows({
                user,
                handCards,
                activeCard,
                attachedEnergyCards: attachedEnergiesFor(activeCard, activeZoneCards),
                benchCards,
                activeZoneCards,
                stadiumCard,
                // Stadium-granted / inherited attacks count toward "can this
                // Active attack" — without them the button dims a legal attack.
                extraAttacks: stadiumExtraAttacksFromZone(stadiumCard, {
                  zoneCards: activeZoneCards,
                  card: activeCard,
                  isActive: true,
                }),
                // The server prices board-conditional cost discounts (Kartana, Zapdos ex); its view
                // carries them for your own Pokémon.
                costDiscounts: user === 'self' ? getAuthoritativeCostDiscounts(activeCard?.instanceId) : null,
                isAbilityUsed: (card) => isAbilitySpent(user, card),
                ensureCardData,
                prizeCounts: {
                  self: prizes.length,
                  opponent: liveZoneArray(other, 'prizes').length,
                },
                stadiumName: stadiumCard?.name || null,
                deckList,
              });
            } catch {
              /* engine not ready — leave this side dim rather than lie */
            }
          }
          scored.push({ box, isTurn, glows, activeCard, stadiumCard });
          if (gen !== generation) return; // a newer refresh took over mid-await
        }
        const next = new Map();
        for (const { box, isTurn, glows, activeCard, stadiumCard } of scored) {
          box.attackButton?.classList.toggle('attacks-available', !!glows?.activeCanAttack);
          box.attackButton?.classList.toggle('turn-disabled', !isTurn);
          if (!glows) continue;
          for (const [card, color] of glows.handPlayable) collectGlow(next, card, { color });
          for (const { card } of glows.abilityCards) collectGlow(next, card, { ability: true });
          if (glows.activeCanAttack) collectGlow(next, activeCard, { color: glows.activeColor });
          if (glows.stadiumUsable) {
            collectGlow(next, stadiumCard, { node: stadiumNode(), color: glows.stadiumColor });
          }
        }
        applyGlows(next);
      };

      [
        'rules-turn-began',
        'rules-turn-view-applied',
        'rules-mode-changed',
        'rules-session-reset',
        'rules-energy-attached',
        'rules-card-moved',
        'rules-damage-changed',
        'rules-status-changed',
        'action-processed',
        // hydrate-holo.js: a card gained/lost its .mat-holo wrapper, so the glow
        // node glowNodeFor resolves has moved.
        'holo-wrapper-changed',
      ].forEach((name) => document.addEventListener(name, () => refresh()));
      refresh();
    };

    // ── multiplayer rules sync ────────────────────────────────────────────
    // The server relays 'rulesEvent' between the seats. The rules themselves travel as commands and
    // views; this carries only presentation: the opponent's chosen coin and their Starting Active.
    const hookMultiplayerSync = () => {
      // the sim's socket is a global from global-variables.js
      const checkSocket = () => {
        const socket = rulesSocket;
        if (!socket) return false;
        socket.on('rulesEvent', (payload) => {
          try {
            const { type, data } = payload || {};
            window.__ptcg?.noteRulesEvent?.(type, data);
            if (type === 'coinChosen') {
              // Opponent chose/changed their coin — show it on our mat
              setSelectedCoin('opp', data?.coin || null);
            } else if (type === 'startingActiveChosen') {
              appendMessage('', 'Opponent chose their Starting Active Pokémon.', 'announcement', false);
              checkBothActivesSetAndBegin(startingActiveFirstPlayer, rulesSessionGeneration);
            }
          } catch (_err) {
            // ignore malformed socket payload
          }
        });
        return true;
      };
      if (checkSocket()) return;
      // socket may init after us — retry briefly
      let tries = 0;
      const timer = setInterval(() => {
        if (checkSocket() || ++tries > 20) clearInterval(timer);
      }, 500);
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

    const toastRulesBlocked = (reason) => {
      appendMessage('', `⛔ ${reason}`, 'announcement', false);
    };
    
    export { buildRulesToggle };
