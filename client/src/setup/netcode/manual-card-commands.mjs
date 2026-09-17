/**
 * @file Design 012: plans the manual board tools (damage counters, Special Conditions,
 * rotation, card type, ability marker) for a server-drawn card.
 *
 * The legacy keybinds and context-menu buttons address a card by its legacy zone index and
 * edit its DOM overlays in place; neither exists for a server-drawn card. This module turns
 * the same inputs into legacy action names with an `{ instanceId, ... }` object parameter,
 * which `dual-run-bridge.js` translates into server commands. It never touches the DOM, so it
 * runs under `node --test`; `manual-card-dispatch.js` feeds it the selected card's
 * authoritative view data and emits the result.
 */

import { listConditions } from '../../../../shared/engine/rules/special-conditions.mjs';

// Legacy's `y` cycle (keybinds.js: P → B → Pa → C → A → P), in server condition names.
export const CONDITION_CYCLE = ['Poisoned', 'Burned', 'Paralyzed', 'Confused', 'Asleep'];

const IN_PLAY = ['active', 'bench'];
const ROTATABLE = ['stadium', 'active', 'bench'];
const TYPE_KEYS = { e: 'Energy', t: 'Trainer', p: 'Pokémon' };

const command = (action, param) => ({ action, params: [param] });

function readDigit(key, code) {
  if (typeof key === 'string' && /^[0-9]$/.test(key)) return Number(key);
  const match = typeof code === 'string' ? /^Digit([0-9])$/.exec(code) : null;
  return match ? Number(match[1]) : null;
}

function readLetter(key, code) {
  if (typeof key === 'string' && key.length === 1) return key.toLowerCase();
  const match = typeof code === 'string' ? /^Key([A-Z])$/.exec(code) : null;
  return match ? match[1].toLowerCase() : null;
}

const currentDamage = (card) =>
  typeof card.damage === 'number' && card.damage > 0 ? card.damage : 0;

function planDamage(card, digit, subtract) {
  const instanceId = card.instanceId;
  const damage = currentDamage(card);
  if (digit === 0) {
    return damage > 0 ? [command('updateDamageCounter', { instanceId, amount: 0 })] : null;
  }
  const step = digit * 10;
  if (damage === 0) {
    return subtract ? null : [command('addDamageCounter', { instanceId, amount: step })];
  }
  const amount = Math.max(0, subtract ? damage - step : damage + step);
  return [command('updateDamageCounter', { instanceId, amount })];
}

/**
 * The next condition in legacy's single-condition cycle. A card that already carries
 * several (the server stacks Poison and Burn with a rotation condition) cycles on from the
 * last one in Checkup order, and the cycle replaces them all — the `y` key sets one condition.
 */
function planConditionCycle(card, clear) {
  const instanceId = card.instanceId;
  const held = listConditions(card);
  if (clear) {
    return held.length > 0 ? [command('removeSpecialCondition', { instanceId })] : null;
  }
  if (held.length === 0) {
    return [command('addSpecialCondition', { instanceId, condition: CONDITION_CYCLE[0] })];
  }
  const last = held[held.length - 1];
  const next = CONDITION_CYCLE[(CONDITION_CYCLE.indexOf(last) + 1) % CONDITION_CYCLE.length];
  return [
    command('removeSpecialCondition', { instanceId }),
    command('addSpecialCondition', { instanceId, condition: next }),
  ];
}

function planRotation(card, single) {
  const rotation = Number(card.rotation) || 0;
  const next = single ? (rotation === 90 ? 0 : 90) : (rotation + 90) % 360;
  return [command('rotateCard', { instanceId: card.instanceId, rotation: next })];
}

/**
 * Legacy `changeType` also moves the card onto the board, where the new type is what the
 * table treats it as. The server refuses moves of another player's card, so an opponent's
 * card only changes type.
 */
function planChangeType(card, type, { zoneId, isOwnCard }) {
  const instanceId = card.instanceId;
  const commands = [command('changeType', { instanceId, type })];
  if (isOwnCard && zoneId !== 'board' && zoneId !== 'stadium') {
    commands.push({ action: 'moveCardToBoard', params: [{ instanceId, from: zoneId }] });
  }
  return commands;
}

/**
 * @param {object} input
 * @param {string} input.key `KeyboardEvent.key`
 * @param {string} [input.code] `KeyboardEvent.code`
 * @param {boolean} [input.alt]
 * @param {string} input.zoneId zone the selected card is drawn in
 * @param {boolean} [input.isOwnCard]
 * @param {object} input.card the card's authoritative view data (`instanceId`, `damage`, ...)
 * @returns {{ action: string, params: object[] }[] | null} commands in send order, or null
 *   when the key is not a manual board tool for this card (the caller's own handling runs)
 */
export function planCardKeyCommands({ key, code, alt = false, zoneId, isOwnCard = false, card }) {
  if (!card || !Number.isInteger(card.instanceId)) return null;

  const digit = readDigit(key, code);
  if (digit != null) {
    return IN_PLAY.includes(zoneId) ? planDamage(card, digit, alt) : null;
  }

  const letter = readLetter(key, code);
  if (letter === 'y' && zoneId === 'active') return planConditionCycle(card, alt);
  if (letter === 'r' && !alt && ROTATABLE.includes(zoneId)) return planRotation(card, false);
  if (letter === 'r' && alt && IN_PLAY.includes(zoneId)) return planRotation(card, true);
  if (alt && TYPE_KEYS[letter]) {
    return planChangeType(card, TYPE_KEYS[letter], { zoneId, isOwnCard });
  }
  if (letter === 'w' && card.abilityUsed === true && [...IN_PLAY, 'stadium', 'discard'].includes(zoneId)) {
    return [command('removeAbilityCounter', { instanceId: card.instanceId })];
  }
  return null;
}

const MENU_TYPES = {
  changeToEnergyButton: 'Energy',
  changeToToolButton: 'Trainer',
  changeToPokémonButton: 'Pokémon',
};

/**
 * Context-menu equivalents of the keys above. The legacy buttons create an empty counter or
 * a Poison marker for the player to edit; a server card has no editable overlay, so the
 * buttons place the smallest real value instead.
 *
 * @param {object} input
 * @param {string} input.buttonId id of the clicked context-menu button
 * @param {string} input.zoneId
 * @param {boolean} [input.isOwnCard]
 * @param {object} input.card authoritative view data
 * @returns {{ action: string, params: object[] }[] | null}
 */
export function planMenuCommands({ buttonId, zoneId, isOwnCard = false, card }) {
  if (!card || !Number.isInteger(card.instanceId)) return null;
  const instanceId = card.instanceId;

  if (buttonId === 'damageCounterButton') {
    return [command('addDamageCounter', { instanceId, amount: 10 })];
  }
  if (buttonId === 'specialConditionButton') {
    return listConditions(card).length > 0
      ? null
      : [command('addSpecialCondition', { instanceId, condition: CONDITION_CYCLE[0] })];
  }
  if (buttonId === 'abilityCounterButton') {
    return card.abilityUsed === true ? [command('removeAbilityCounter', { instanceId })] : null;
  }
  if (MENU_TYPES[buttonId]) {
    return planChangeType(card, MENU_TYPES[buttonId], { zoneId, isOwnCard });
  }
  return null;
}
