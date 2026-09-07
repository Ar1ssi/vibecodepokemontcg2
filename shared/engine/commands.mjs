/**
 * @file Command vocabulary, payload schemas, and validation for server-authoritative netcode.
 * Pure and DOM-free (Invariants 6 & 8).
 * Uses named fields only - no legacy positional arrays.
 */

import { PLAYER_ZONES } from './state.mjs';

export const VALID_ZONES = [...PLAYER_ZONES, 'stadium'];

export const SPECIAL_CONDITIONS = [
  'Asleep',
  'Burned',
  'Confused',
  'Paralyzed',
  'Poisoned',
];

/**
 * Command schema definitions.
 * Each command type defines required and optional fields along with validator functions.
 */
export const COMMAND_SCHEMAS = {
  moveCard: {
    type: 'moveCard',
    validate(payload) {
      if (!payload || typeof payload !== 'object') {
        return { valid: false, reason: 'Payload must be an object' };
      }
      if (typeof payload.instanceId !== 'number' || !Number.isInteger(payload.instanceId)) {
        return { valid: false, reason: 'instanceId must be an integer' };
      }
      if (typeof payload.from !== 'string' || !VALID_ZONES.includes(payload.from)) {
        return { valid: false, reason: `from must be a valid zone (${VALID_ZONES.join(', ')})` };
      }
      if (typeof payload.to !== 'string' || !VALID_ZONES.includes(payload.to)) {
        return { valid: false, reason: `to must be a valid zone (${VALID_ZONES.join(', ')})` };
      }
      if (payload.targetIndex != null && (!Number.isInteger(payload.targetIndex) || payload.targetIndex < 0)) {
        return { valid: false, reason: 'targetIndex must be a non-negative integer when provided' };
      }
      return { valid: true };
    },
  },

  draw: {
    type: 'draw',
    validate(payload = {}) {
      if (payload && typeof payload !== 'object') {
        return { valid: false, reason: 'Payload must be an object' };
      }
      if (payload.count != null && (!Number.isInteger(payload.count) || payload.count <= 0)) {
        return { valid: false, reason: 'count must be a positive integer' };
      }
      return { valid: true };
    },
  },

  attachCard: {
    type: 'attachCard',
    validate(payload) {
      if (!payload || typeof payload !== 'object') {
        return { valid: false, reason: 'Payload must be an object' };
      }
      if (typeof payload.instanceId !== 'number' || !Number.isInteger(payload.instanceId)) {
        return { valid: false, reason: 'instanceId must be an integer' };
      }
      if (typeof payload.targetInstanceId !== 'number' || !Number.isInteger(payload.targetInstanceId)) {
        return { valid: false, reason: 'targetInstanceId must be an integer' };
      }
      if (payload.instanceId === payload.targetInstanceId) {
        return { valid: false, reason: 'Cannot attach card to itself' };
      }
      return { valid: true };
    },
  },

  addDamageCounter: {
    type: 'addDamageCounter',
    validate(payload) {
      if (!payload || typeof payload !== 'object') {
        return { valid: false, reason: 'Payload must be an object' };
      }
      if (typeof payload.instanceId !== 'number' || !Number.isInteger(payload.instanceId)) {
        return { valid: false, reason: 'instanceId must be an integer' };
      }
      if (payload.amount != null && (typeof payload.amount !== 'number' || payload.amount <= 0)) {
        return { valid: false, reason: 'amount must be a positive number' };
      }
      return { valid: true };
    },
  },

  updateDamageCounter: {
    type: 'updateDamageCounter',
    validate(payload) {
      if (!payload || typeof payload !== 'object') {
        return { valid: false, reason: 'Payload must be an object' };
      }
      if (typeof payload.instanceId !== 'number' || !Number.isInteger(payload.instanceId)) {
        return { valid: false, reason: 'instanceId must be an integer' };
      }
      if (typeof payload.amount !== 'number' || payload.amount < 0) {
        return { valid: false, reason: 'amount must be a non-negative number' };
      }
      return { valid: true };
    },
  },

  removeDamageCounter: {
    type: 'removeDamageCounter',
    validate(payload) {
      if (!payload || typeof payload !== 'object') {
        return { valid: false, reason: 'Payload must be an object' };
      }
      if (typeof payload.instanceId !== 'number' || !Number.isInteger(payload.instanceId)) {
        return { valid: false, reason: 'instanceId must be an integer' };
      }
      if (payload.amount != null && (typeof payload.amount !== 'number' || payload.amount <= 0)) {
        return { valid: false, reason: 'amount must be a positive number' };
      }
      return { valid: true };
    },
  },

  addSpecialCondition: {
    type: 'addSpecialCondition',
    validate(payload) {
      if (!payload || typeof payload !== 'object') {
        return { valid: false, reason: 'Payload must be an object' };
      }
      if (typeof payload.instanceId !== 'number' || !Number.isInteger(payload.instanceId)) {
        return { valid: false, reason: 'instanceId must be an integer' };
      }
      if (typeof payload.condition !== 'string' || !SPECIAL_CONDITIONS.includes(payload.condition)) {
        return { valid: false, reason: `condition must be one of: ${SPECIAL_CONDITIONS.join(', ')}` };
      }
      return { valid: true };
    },
  },

  updateSpecialCondition: {
    type: 'updateSpecialCondition',
    validate(payload) {
      if (!payload || typeof payload !== 'object') {
        return { valid: false, reason: 'Payload must be an object' };
      }
      if (typeof payload.instanceId !== 'number' || !Number.isInteger(payload.instanceId)) {
        return { valid: false, reason: 'instanceId must be an integer' };
      }
      if (payload.condition !== null && (typeof payload.condition !== 'string' || !SPECIAL_CONDITIONS.includes(payload.condition))) {
        return { valid: false, reason: `condition must be null or one of: ${SPECIAL_CONDITIONS.join(', ')}` };
      }
      return { valid: true };
    },
  },

  removeSpecialCondition: {
    type: 'removeSpecialCondition',
    validate(payload) {
      if (!payload || typeof payload !== 'object') {
        return { valid: false, reason: 'Payload must be an object' };
      }
      if (typeof payload.instanceId !== 'number' || !Number.isInteger(payload.instanceId)) {
        return { valid: false, reason: 'instanceId must be an integer' };
      }
      return { valid: true };
    },
  },

  removeAbilityCounter: {
    type: 'removeAbilityCounter',
    validate(payload) {
      if (!payload || typeof payload !== 'object') {
        return { valid: false, reason: 'Payload must be an object' };
      }
      if (typeof payload.instanceId !== 'number' || !Number.isInteger(payload.instanceId)) {
        return { valid: false, reason: 'instanceId must be an integer' };
      }
      return { valid: true };
    },
  },

  changeType: {
    type: 'changeType',
    validate(payload) {
      if (!payload || typeof payload !== 'object') {
        return { valid: false, reason: 'Payload must be an object' };
      }
      if (typeof payload.instanceId !== 'number' || !Number.isInteger(payload.instanceId)) {
        return { valid: false, reason: 'instanceId must be an integer' };
      }
      if (typeof payload.type !== 'string' || !payload.type.trim()) {
        return { valid: false, reason: 'type must be a non-empty string' };
      }
      return { valid: true };
    },
  },

  rotateCard: {
    type: 'rotateCard',
    validate(payload) {
      if (!payload || typeof payload !== 'object') {
        return { valid: false, reason: 'Payload must be an object' };
      }
      if (typeof payload.instanceId !== 'number' || !Number.isInteger(payload.instanceId)) {
        return { valid: false, reason: 'instanceId must be an integer' };
      }
      if (payload.rotation == null) {
        return { valid: false, reason: 'rotation must be provided' };
      }
      return { valid: true };
    },
  },
};

/**
 * Validates the shape and envelope of a command.
 * Step 1 of applyCommand pipeline.
 *
 * @param {object} command
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateCommandShape(command) {
  if (!command || typeof command !== 'object') {
    return { valid: false, reason: 'Command must be an object' };
  }

  if (typeof command.type !== 'string' || !command.type) {
    return { valid: false, reason: 'Command missing valid type' };
  }

  const schema = COMMAND_SCHEMAS[command.type];
  if (!schema) {
    return { valid: false, reason: `Unknown command type: ${command.type}` };
  }

  const payload = command.payload ?? {};
  return schema.validate(payload);
}

/**
 * Disposition of all 59 legacy dispatch entries from accept-action.js.
 * Placed comprehensively in Slice 3.
 */
export const DISPOSITION_TABLE = {
  // --- Server commands: gameplay (30 actions) ---
  moveCardBundle: { disposition: 'server_command', commandType: 'moveCard', slice: 3, notes: 'Direct moveCard between zones' },
  draw: { disposition: 'server_command', commandType: 'draw', slice: 3, notes: 'Draw cards from deck' },
  moveToDeckTop: { disposition: 'server_command', commandType: 'moveCard', slice: 3, notes: 'moveCard with to: deck, targetIndex: 0' },
  attack: { disposition: 'server_command', commandType: 'attack', slice: 5, notes: 'Attack declaration and resolution' },
  pass: { disposition: 'server_command', commandType: 'pass', slice: 5, notes: 'Pass / end turn' },
  retreat: { disposition: 'server_command', commandType: 'retreat', slice: 5, notes: 'Retreat active Pokemon' },
  takeTurn: { disposition: 'server_command', commandType: 'takeTurn', slice: 5, notes: 'Turn start progression' },
  useAbility: { disposition: 'server_command', commandType: 'useAbility', slice: 6, notes: 'Resumable ability executor' },
  'stadium-effect': { disposition: 'server_command', commandType: 'stadium-effect', slice: 6, notes: 'Resumable stadium executor' },
  VSTARGXFunction: { disposition: 'server_command', commandType: 'useVStarGX', slice: 6, notes: 'Once-per-game mechanic' },
  takePrizes: { disposition: 'server_command', commandType: 'takePrizes', slice: 5, notes: 'Prizes to hand' },
  takePrizesByIndex: { disposition: 'server_command', commandType: 'takePrizesByIndex', slice: 5, notes: 'Selected prizes to hand' },
  shufflePrizesToDeckBottom: { disposition: 'server_command', commandType: 'shufflePrizesToDeckBottom', slice: 5, notes: 'Prize shuffle' },
  shuffleZone: { disposition: 'server_command', commandType: 'shuffleZone', slice: 5, notes: 'Fisher-Yates server shuffle' },
  shuffleIntoDeck: { disposition: 'server_command', commandType: 'shuffleIntoDeck', slice: 5, notes: 'Card to deck and shuffle' },
  switchWithDeckTop: { disposition: 'server_command', commandType: 'switchWithDeckTop', slice: 5, notes: 'Swap with deck top' },
  shuffleAll: { disposition: 'server_command', commandType: 'shuffleAll', slice: 5, notes: 'Board/hand shuffle' },
  shuffleBottom: { disposition: 'server_command', commandType: 'shuffleBottom', slice: 5, notes: 'Deck bottom shuffle' },
  discardAll: { disposition: 'server_command', commandType: 'discardAll', slice: 5, notes: 'Mass discard zone' },
  lostZoneAll: { disposition: 'server_command', commandType: 'lostZoneAll', slice: 5, notes: 'Mass lost zone' },
  handAll: { disposition: 'server_command', commandType: 'handAll', slice: 5, notes: 'Mass return to hand' },
  leaveAll: { disposition: 'server_command', commandType: 'leaveAll', slice: 5, notes: 'Mass leave board' },
  discardAndDraw: { disposition: 'server_command', commandType: 'discardAndDraw', slice: 5, notes: 'Discard and draw N cards' },
  shuffleAndDraw: { disposition: 'server_command', commandType: 'shuffleAndDraw', slice: 5, notes: 'Shuffle hand and draw N cards' },
  shuffleBottomAndDraw: { disposition: 'server_command', commandType: 'shuffleBottomAndDraw', slice: 5, notes: 'Put on bottom and draw N cards' },
  discardBoard: { disposition: 'server_command', commandType: 'discardBoard', slice: 5, notes: 'Discard active/bench' },
  handBoard: { disposition: 'server_command', commandType: 'handBoard', slice: 5, notes: 'Return active/bench to hand' },
  shuffleBoard: { disposition: 'server_command', commandType: 'shuffleBoard', slice: 5, notes: 'Shuffle active/bench into deck' },
  lostZoneBoard: { disposition: 'server_command', commandType: 'lostZoneBoard', slice: 5, notes: 'Lost zone active/bench' },
  playRandomCardFaceDown: { disposition: 'server_command', commandType: 'playRandomCardFaceDown', slice: 5, notes: 'Random card played face-down' },

  // --- Server commands: manual override (9 actions) ---
  addDamageCounter: { disposition: 'manual_override', commandType: 'addDamageCounter', slice: 3, notes: 'Manual counter override' },
  updateDamageCounter: { disposition: 'manual_override', commandType: 'updateDamageCounter', slice: 3, notes: 'Manual counter override' },
  removeDamageCounter: { disposition: 'manual_override', commandType: 'removeDamageCounter', slice: 3, notes: 'Manual counter override' },
  addSpecialCondition: { disposition: 'manual_override', commandType: 'addSpecialCondition', slice: 3, notes: 'Manual condition override' },
  updateSpecialCondition: { disposition: 'manual_override', commandType: 'updateSpecialCondition', slice: 3, notes: 'Manual condition override' },
  removeSpecialCondition: { disposition: 'manual_override', commandType: 'removeSpecialCondition', slice: 3, notes: 'Manual condition override' },
  removeAbilityCounter: { disposition: 'manual_override', commandType: 'removeAbilityCounter', slice: 3, notes: 'Manual ability marker clear' },
  changeType: { disposition: 'manual_override', commandType: 'changeType', slice: 3, notes: 'Manual card type override' },
  rotateCard: { disposition: 'manual_override', commandType: 'rotateCard', slice: 3, notes: 'Manual card orientation override' },

  // --- Server lifecycle (6 actions) ---
  setup: { disposition: 'server_lifecycle', slice: 5, notes: 'Server executes full initial setup sequence' },
  setupPrizes: { disposition: 'server_lifecycle', slice: 5, notes: 'Server deals 6 prize cards' },
  drawOpeningHand: { disposition: 'server_lifecycle', slice: 5, notes: 'Server deals 7 cards to hand' },
  readyUp: { disposition: 'server_lifecycle', slice: 5, notes: 'Client emits readyUp handshake' },
  reset: { disposition: 'server_lifecycle', slice: 5, notes: 'Server resets game state' },
  restartGame: { disposition: 'server_lifecycle', slice: 5, notes: 'Server restarts game' },

  // --- Replaced by protocol (2 actions) ---
  exchangeData: { disposition: 'replaced_by_protocol', slice: 3, notes: 'Decks register server-side on joinGame' },
  loadDeckData: { disposition: 'replaced_by_protocol', slice: 3, notes: 'Decks register server-side on joinGame' },

  // --- Replaced by view redaction (7 actions) ---
  viewDeck: { disposition: 'replaced_by_redaction', slice: 3, notes: 'Deck contents hidden; provided via PendingChoice only when search is legal' },
  revealCards: { disposition: 'replaced_by_redaction', slice: 3, notes: 'Server-owned card.revealed flag in view' },
  hideCards: { disposition: 'replaced_by_redaction', slice: 3, notes: 'Server-owned card.revealed flag in view' },
  revealShortcut: { disposition: 'replaced_by_redaction', slice: 3, notes: 'Server-owned card.revealed flag in view' },
  hideShortcut: { disposition: 'replaced_by_redaction', slice: 3, notes: 'Server-owned card.revealed flag in view' },
  lookShortcut: { disposition: 'replaced_by_redaction', slice: 3, notes: 'Server-owned card.revealed flag in view' },
  stopLookingShortcut: { disposition: 'replaced_by_redaction', slice: 3, notes: 'Server-owned card.revealed flag in view' },

  // --- Announcement only (2 actions) ---
  lookAtCards: { disposition: 'announcement_only', slice: 3, notes: 'Advisory chat event, no state mutation' },
  stopLookingAtCards: { disposition: 'announcement_only', slice: 3, notes: 'Advisory chat event, no state mutation' },

  // --- Client-local, never sent (2 actions) ---
  changeCardBack: { disposition: 'client_local', slice: 3, notes: 'Local UI cosmetic preference only' },
  changePlaymat: { disposition: 'client_local', slice: 3, notes: 'Local UI cosmetic preference only' },

  // --- Undo (1 action) ---
  undo: {
    disposition: 'undo',
    slice: 3,
    notes: 'Server authority enables undo by rewinding commandLog minus tail against seed; deferred out of critical path',
  },
};
