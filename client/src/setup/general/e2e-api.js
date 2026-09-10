import { socket, systemState } from '../../state.js';
import { readyUp } from '../../actions/general/ready.js';
import { loadDeckData } from '../deck-constructor/import.js';
import { getZone } from '../zones/get-zone.js';
import {
  getAuthoritativeZoneArray,
  getAuthoritativeStadiumArray,
  hasAuthoritativeView,
} from '../netcode/apply-view.js';
import { rulesState } from '/shared/engine/rules/rules-state.mjs';
import { hashBoardSnapshot } from '/shared/engine/zones/zone-hash.mjs';
import { getCardDamage, getCardSpecialCondition } from '/shared/engine/zones/card-state.mjs';
import { resolveAttachedEnergyType } from '/shared/engine/rules/energy-effects.mjs';
import { isBoardPokemon } from '/shared/engine/zones/active-pokemon.mjs';
import { isEnergy } from '/shared/engine/cards.mjs';
import { enumerateOptions } from './e2e-options.mjs';
import { e2eFixtureDeck, isE2eMode } from './e2e-mode.mjs';

// Same zone set the server hashes in shared/engine/state.mjs hashState() minus
// stadium (neutral zone, not per-player) — design 002 slice 3.5 replay harness.
const HASHED_PLAYER_ZONES = [
  'deck',
  'hand',
  'prizes',
  'active',
  'bench',
  'discard',
  'lostZone',
  'board',
];

// Zones whose card data both clients can see in full (view.mjs sanitizeCards them for
// owner and opponent alike). deck/hand/prizes are owner-secret — redacted to counts or
// {instanceId} stubs for the other side (O4-A / I5) — so their contents can never hash
// equal across two clients and must stay out of any cross-client comparison.
const PUBLIC_PLAYER_ZONES = ['active', 'bench', 'discard', 'lostZone', 'board'];
// hand/prizes stay comparable by length (the stubs are 1:1 with the real cards); deck is
// not — it arrives as { count } rather than an array, so it has no length to compare.
const SECRET_PLAYER_ZONES = ['hand', 'prizes'];

// Design 002 I24: legacy getZone's zoneArrays are never populated under
// server-authoritative rendering (I15) — once the renderer has applied at
// least one view, that view (cached in apply-view.js) is the real live
// source; before that (legacy/1P mode, or before the first view arrives),
// legacy getZone is still correct and is kept as the fallback.
function liveZoneArray(user, zoneId) {
  if (hasAuthoritativeView()) {
    const side = user === 'self' ? 'you' : 'them';
    return zoneId === 'stadium'
      ? getAuthoritativeStadiumArray()
      : getAuthoritativeZoneArray(side, zoneId);
  }
  return getZone(user, zoneId)?.array || [];
}

function zoneSnapshot(user, zoneId) {
  const cards = liveZoneArray(user, zoneId);
  return {
    count: cards.length,
    names: cards.map((card) => card.name || ''),
  };
}

// Design 004 slice 1: plain-JSON read model for the playtest bot. No DOM nodes, no live
// card references — every field is a primitive or a plain object so `observe()` can cross
// the Playwright page boundary as JSON. Card stats (hp/attacks/types) only exist once
// cardStats enrichment has landed (see card-stats.js); before that they read as null/[].
function serializePokemonCard(card, attachedCards = []) {
  if (!card) return null;
  return {
    name: card.name || '',
    hp: card.hp ?? null,
    damage: getCardDamage(card),
    stage: card.stage || null,
    types: Array.isArray(card.types) ? [...card.types] : [],
    specialCondition: getCardSpecialCondition(card),
    // Tools attach the same way Energy does; resolveAttachedEnergyType would
    // report them as 'Colorless', so filter to real Energy first.
    attachedEnergy: attachedCards
      .filter(isEnergy)
      .map((energy) => resolveAttachedEnergyType(energy)),
    attacks: Array.isArray(card.attacks)
      ? card.attacks.map((attack, index) => ({
          index,
          name: attack?.name || '',
          cost: Array.isArray(attack?.cost) ? [...attack.cost] : [],
          damage: attack?.damage ?? '',
        }))
      : [],
  };
}

function serializeHandCard(card, index) {
  return {
    index,
    name: card?.name || '',
    supertype: card?.supertype || '',
    type: card?.type || '',
  };
}

// Top-level Pokémon in a play zone. Both render paths keep attachments in the
// same flat zone array as their host — the authoritative view links them by
// `attachedTo` (apply-view.js placeCardInZone), the legacy path by
// `image.relative` (isBoardPokemon) — so an unfiltered array would report
// attached Energy as benched Pokémon.
function boardPokemon(user, zoneId) {
  const cards = liveZoneArray(user, zoneId);
  return hasAuthoritativeView()
    ? cards.filter((card) => card.attachedTo == null)
    : cards.filter(isBoardPokemon);
}

// The cards attached to one in-play Pokémon, from whichever link the active
// render path uses (see boardPokemon).
function attachedCardsFor(user, zoneId, card) {
  if (!card) return [];
  const cards = liveZoneArray(user, zoneId);
  if (hasAuthoritativeView()) {
    const instanceId = card.instanceId;
    return instanceId == null
      ? []
      : cards.filter((other) => other.attachedTo === instanceId);
  }
  return cards.filter((other) => other.image && other.image.relative === card.image);
}

function serializePlayerObservation(user) {
  const bench = boardPokemon(user, 'bench').map((card) =>
    serializePokemonCard(card, attachedCardsFor(user, 'bench', card))
  );
  const active = boardPokemon(user, 'active')[0] || null;
  return {
    hand: liveZoneArray(user, 'hand').map((card, index) => serializeHandCard(card, index)),
    active: serializePokemonCard(active, attachedCardsFor(user, 'active', active)),
    bench,
    prizeCount: liveZoneArray(user, 'prizes').length,
    deckCount: liveZoneArray(user, 'deck').length,
    discardCount: liveZoneArray(user, 'discard').length,
  };
}

export function installE2eApi() {
  if (typeof window === 'undefined' || !isE2eMode()) return;
  window.__ptcg = {
    ready: true,
    systemState,
    rulesState,
    // Design 002 slice 3.5: {action, parameters, hash} per self-initiated action, hash
    // taken immediately after the action applies locally. Feeds the replay-fixture
    // recorder so the offline harness can assert hashState agreement at every step,
    // not just at the end of the recorded trace.
    stepLog: [],
    // Design 002/003 slice 3.12 flip-gate harness: count of 'cmdRejected' events this
    // client has received, and the most recent 'rules-game-ended' detail (server's
    // authoritative gameEnded under the flag; local evaluateWinCondition off the flag).
    cmdRejectedCount: 0,
    lastCmdRejected: null,
    cmdLog: [],
    cmdRejections: [],
    gameEndedInfo: null,
    // Design 004 slice 1: plain-JSON read model the playtest bot decides moves from.
    observe() {
      return {
        turnPlayer: rulesState.turnPlayer,
        turnNumber: rulesState.turnNumber,
        phase: rulesState.phase,
        fromServer: hasAuthoritativeView(),
        self: serializePlayerObservation('self'),
        opp: serializePlayerObservation('opp'),
        stadium: liveZoneArray('self', 'stadium')[0]?.name || null,
        pickerOpen: !!document.querySelector('.card-picker-overlay'),
      };
    },
    // Design 004 slice 2: every action this client may legally take right now,
    // as tagged options (see e2e-options.mjs). Async — evolution legality is.
    // Returns [] when it isn't this client's move.
    async options(user = 'self') {
      const active = boardPokemon(user, 'active')[0] || null;
      return enumerateOptions({
        user,
        hand: liveZoneArray(user, 'hand'),
        active,
        bench: boardPokemon(user, 'bench'),
        activeZoneCards: liveZoneArray(user, 'active'),
        attachedCardsOf: (card) =>
          attachedCardsFor(user, card === active ? 'active' : 'bench', card),
      });
    },
    // Design 004 slice 3: drives a single option (as returned by options()) through the
    // real client action path — never throws, always resolves to { ok, error }. Every
    // branch below reuses the exact call the live UI makes for that move (see design 004
    // § slice 3): playBasic/attach/evolve/playTrainer all go through moveCardBundle with
    // action 'move' — despite the name, every UI call site (drag.js, click-events.js,
    // trainer-execution.js) passes the literal string 'move' regardless of whether the
    // move is a plain play, an attach, or an evolution; move-card.js itself classifies
    // attach vs. evolve from whether `targetIndex` resolves to an existing card in the
    // destination zone, not from the action string. Playing a Trainer is hand → 'board'
    // (move-card.js redirects Stadiums to 'stadium' and dispatches Supporter/Item effects
    // itself once the card lands there — see rules-bridge.js's 'board' zone watcher).
    async act(option) {
      try {
        const kind = option?.kind;
        if (kind === 'playBasic') {
          const { moveCardBundle } = await import(
            '../../actions/move-card-bundle/move-card-bundle.js'
          );
          const ok = await moveCardBundle(
            'self', 'self', 'hand', option.targetZone, option.handIndex, false, 'move', true
          );
          return { ok: ok !== false };
        }
        if (kind === 'attach' || kind === 'evolve') {
          const { moveCardBundle } = await import(
            '../../actions/move-card-bundle/move-card-bundle.js'
          );
          const ok = await moveCardBundle(
            'self', 'self', 'hand', option.targetZone, option.handIndex,
            option.targetIndex, 'move', true
          );
          return { ok: ok !== false };
        }
        if (kind === 'playTrainer') {
          const { moveCardBundle } = await import(
            '../../actions/move-card-bundle/move-card-bundle.js'
          );
          const ok = await moveCardBundle(
            'self', 'self', 'hand', 'board', option.handIndex, false, 'move', true
          );
          return { ok: ok !== false };
        }
        if (kind === 'ability') {
          const { useAbility } = await import('../../actions/counters/use-ability.js');
          const ok = await useAbility('self', 'self', option.zone, option.index, true);
          return { ok: ok !== false };
        }
        if (kind === 'attack') {
          const { attack: attackAction } = await import(
            '../../actions/chat-buttons/chat-buttons.js'
          );
          const ok = await attackAction('self', true, option.attackIndex);
          return { ok: ok !== false };
        }
        if (kind === 'retreat') {
          const benchCard = boardPokemon('self', 'bench')[option.benchIndex] || null;
          const { retreat: retreatAction } = await import(
            '../../actions/chat-buttons/chat-buttons.js'
          );
          const ok = await retreatAction('self', true, benchCard?.image || null);
          return { ok: ok !== false };
        }
        if (kind === 'pass') {
          const { pass: passAction } = await import(
            '../../actions/chat-buttons/chat-buttons.js'
          );
          const ok = await passAction('self', true);
          return { ok: ok !== false };
        }
        return { ok: false, error: `unknown option kind: ${kind}` };
      } catch (err) {
        return { ok: false, error: String(err?.message || err) };
      }
    },
    turnState() {
      return {
        turnPlayer: rulesState.turnPlayer,
        turnNumber: rulesState.turnNumber,
        phase: rulesState.phase,
        // False until the first server view lands: until then turnPlayer is still the
        // local coin flip's guess, not the server's answer, and acting on it earns an
        // "It's not your turn." rejection.
        fromServer: hasAuthoritativeView(),
      };
    },
    async attack(attackIndex = 0) {
      const { attack: attackAction } = await import(
        '../../actions/chat-buttons/chat-buttons.js'
      );
      return attackAction('self', true, attackIndex);
    },
    // Pulls the authoritative view on demand. Views are otherwise only pushed in response
    // to a command, so before either player has acted the client has no server-derived
    // state at all — including whose turn it is (I27).
    async requestView() {
      const { emitRequestView } = await import('../netcode/cmd-emitter.js');
      return emitRequestView({ socket, roomId: systemState.roomId });
    },
    async passTurn() {
      const { pass: passAction } = await import(
        '../../actions/chat-buttons/chat-buttons.js'
      );
      return passAction('self', true);
    },
    joinRoom(roomId, username) {
      const nameInput = document.getElementById('nameInput');
      const roomInput = document.getElementById('roomIdInput');
      if (nameInput) nameInput.value = username;
      if (roomInput) roomInput.value = roomId;
      document.getElementById('joinRoomButton')?.click();
    },
    loadFixtureDeck(prefix = 'E2E') {
      loadDeckData('self', e2eFixtureDeck(prefix), true);
    },
    readyUp() {
      return readyUp('self');
    },
    async playFromHand(index = 0, dest = 'active') {
      const { moveCardBundle } = await import(
        '../../actions/move-card-bundle/move-card-bundle.js'
      );
      return moveCardBundle(
        'self',
        'self',
        'hand',
        dest,
        index,
        false,
        'move',
        true
      );
    },
    nudgeCoinSetup() {
      if (!systemState.opponentSocketId && socket?.id) {
        socket.emit('rulesEvent', {
          type: 'peerSocketId',
          data: { socketId: socket.id },
        });
      }
      document.dispatchEvent(new CustomEvent('both-players-ready'));
      return {
        opponentSocketId: systemState.opponentSocketId || null,
        overlay: !!document.getElementById('rulesCoinCallOverlay'),
      };
    },
    callCoin(face = 'heads') {
      const btn = document.querySelector(
        `#rulesCoinCallOverlay button[data-coin-call="${face}"]`
      );
      if (btn) btn.click();
      return !!btn;
    },
    zone(user, zoneId) {
      return zoneSnapshot(user, zoneId);
    },
    // Design 002 slice 3.5: same hashBoardSnapshot the server uses in hashState(), fed
    // this client's own live zone arrays, so a recorded trace can assert the replayed
    // GameRoom agrees with what this client actually held at each step. Must include the
    // 'stadium' key with the exact same shape hashState() builds
    // ({ ...player.zones, stadium: state.stadium ? [state.stadium] : [] }) — omitting it
    // (or naming it differently) makes the two hashes incomparable strings even when the
    // card data is identical, since hashBoardSnapshot joins over sorted zone keys.
    boardHash(user) {
      const zones = { stadium: liveZoneArray(user, 'stadium') };
      for (const zoneId of HASHED_PLAYER_ZONES) {
        zones[zoneId] = liveZoneArray(user, zoneId);
      }
      return hashBoardSnapshot(zones);
    },
    // Design 002 slice 3.12 flip gate: the cross-client invariant. Both clients must
    // agree on every publicly-visible zone — one side's 'self' must equal the other
    // side's 'opp'. Owner-secret zones are excluded (see PUBLIC_PLAYER_ZONES) and
    // checked by count instead, via secretZoneCounts below.
    publicBoardHash(user) {
      const zones = { stadium: liveZoneArray(user, 'stadium') };
      for (const zoneId of PUBLIC_PLAYER_ZONES) {
        zones[zoneId] = liveZoneArray(user, zoneId);
      }
      return hashBoardSnapshot(zones);
    },
    secretZoneCounts(user) {
      const counts = {};
      for (const zoneId of SECRET_PLAYER_ZONES) {
        counts[zoneId] = liveZoneArray(user, zoneId).length;
      }
      return counts;
    },
    publicZones(user) {
      const out = {};
      for (const zoneId of [...PUBLIC_PLAYER_ZONES, 'stadium']) {
        out[zoneId] = liveZoneArray(user, zoneId).map((card) => ({
          name: card.name || '',
          damage: card.damage || 0,
          hp: card.hp ?? null,
        }));
      }
      return out;
    },
    // Raw self-initiated action log ({action, parameters} pairs), same shape
    // translateActionToCmd expects — design 002 slice 3.5 recorder reads this directly.
    selfActionLog() {
      return systemState.selfActionData.map((a) => ({
        action: a.action,
        parameters: a.parameters,
      }));
    },
    lastRulesEvent: null,
    noteRulesEvent(type, data) {
      this.lastRulesEvent = { type, ...(data || {}) };
    },
    counters() {
      return {
        self: systemState.selfCounter,
        opp: systemState.oppCounter,
        twoPlayer: systemState.isTwoPlayer,
        turnPlayer: rulesState.turnPlayer,
      };
    },
  };

  document.addEventListener('action-processed', (evt) => {
    const { action, user } = evt.detail || {};
    if (user !== 'self') return;
    const last = systemState.selfActionData[systemState.selfActionData.length - 1];
    if (!last || last.action !== action) return;
    window.__ptcg.stepLog.push({
      action: last.action,
      parameters: last.parameters,
      hash: window.__ptcg.boardHash('self'),
    });
  });

  document.addEventListener('rules-game-ended', (evt) => {
    window.__ptcg.gameEndedInfo = evt.detail || {};
  });

  // Every 'cmd' this client emits, keyed by clientSeq, so a rejection can name the
  // command that caused it — the flip-gate harness has no other way to see the wire.
  const sentCommands = new Map();
  if (socket && typeof socket.emit === 'function') {
    const rawEmit = socket.emit.bind(socket);
    socket.emit = (event, ...args) => {
      if (event === 'cmd' && args[0]?.clientSeq != null) {
        const { clientSeq, type, payload } = args[0];
        sentCommands.set(clientSeq, { clientSeq, type, payload });
        window.__ptcg.cmdLog.push({ clientSeq, type, payload });
      }
      return rawEmit(event, ...args);
    };
  }

  socket?.on('cmdRejected', (data) => {
    window.__ptcg.cmdRejectedCount += 1;
    const sent = sentCommands.get(data?.clientSeq) || null;
    const entry = { ...(data || {}), command: sent };
    window.__ptcg.lastCmdRejected = entry;
    window.__ptcg.cmdRejections.push(entry);
  });
}
