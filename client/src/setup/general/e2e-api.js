import { socket, systemState } from '../../state.js';
import { readyUp } from '../../actions/general/ready.js';
import { loadDeckData } from '../deck-constructor/import.js';
import { getZone } from '../zones/get-zone.js';
import { rulesState } from '../rules/rules-state.mjs';
import { e2eFixtureDeck, isE2eMode } from './e2e-mode.mjs';

function zoneSnapshot(user, zoneId) {
  const zone = getZone(user, zoneId);
  const cards = zone?.array || [];
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
}
