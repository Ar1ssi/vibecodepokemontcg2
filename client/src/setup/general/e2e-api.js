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
